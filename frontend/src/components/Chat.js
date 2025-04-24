import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import EmojiPicker from 'emoji-picker-react';
import Peer from 'simple-peer';

function Chat() {
  const { room } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [roomCreatorId, setRoomCreatorId] = useState('');
  const [callStarted, setCallStarted] = useState(false);
  const [incomingCall, setIncomingCall] = useState(false);
  const [callerSignal, setCallerSignal] = useState(null);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const username = localStorage.getItem('username');
  const userId = localStorage.getItem('userId');

  const socket = useRef(null);
  const messagesEndRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    socket.current = io('https://chat-application-backend-e7w8.onrender.com', {
      auth: { token: localStorage.getItem('token') },
    });

    socket.current.on('connect', () => {
      console.log('Connected to Socket.IO server');
    });

    socket.current.on('connect_error', (err) => {
      console.error('Socket.IO connection error:', err);
    });

    const fetchMessages = async () => {
      try {
        const res = await axios.get(`https://chat-application-backend-e7w8.onrender.com/api/messages/${room}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        setMessages(res.data);
      } catch (err) {
        console.error('Failed to fetch messages:', err);
        navigate('/home');
      }
    };
    fetchMessages();

    socket.current.emit('joinRoom', { roomName: room });

    socket.current.on('message', (newMessage) => {
      setMessages((prev) => [...prev, newMessage]);
    });

    socket.current.on('roomInfo', ({ creatorId }) => {
      setRoomCreatorId(creatorId);
    });

    socket.current.on('roomDeleted', ({ message }) => {
      alert(message);
      navigate('/home');
    });

    socket.current.on('error', ({ message }) => {
      alert(message);
      navigate('/home');
    });

    socket.current.on('callUser', ({ signal }) => {
      console.log('Received callUser signal:', signal);
      setIncomingCall(true);
      setCallerSignal(signal);
    });

    socket.current.on('callAnswered', ({ signal }) => {
      console.log('Received callAnswered signal:', signal);
      peerRef.current.signal(signal);
      setCallStarted(true);
    });

    socket.current.on('callDeclined', () => {
      console.log('Call declined by receiver');
      alert('Call was declined by the receiver');
      endCall();
    });

    socket.current.on('iceCandidate', ({ candidate }) => {
      console.log('Received ICE candidate:', candidate);
      if (peerRef.current) {
        peerRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
          console.error('Error adding ICE candidate:', err);
        });
      }
    });

    return () => {
      socket.current.disconnect();
    };
  }, [room, navigate]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sendMessage = (e) => {
    e.preventDefault();
    if (message.trim()) {
      socket.current.emit('sendMessage', { room, message });
      setMessage('');
      setShowEmojiPicker(false);
    }
  };

  const onEmojiClick = (emojiObject) => {
    setMessage((prev) => prev + emojiObject.emoji);
  };

  const toggleEmojiPicker = () => {
    setShowEmojiPicker((prev) => !prev);
  };

  const deleteRoom = async () => {
    if (window.confirm(`Are you sure you want to delete the room "${room}"?`)) {
      try {
        await axios.delete(`https://chat-application-backend-e7w8.onrender.com/api/rooms/${room}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
      } catch (err) {
        alert(err.response?.data?.error || 'Failed to delete room');
      }
    }
  };

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      console.log('Local stream acquired:', stream);
      localStreamRef.current = stream;
      localVideoRef.current.srcObject = stream;

      const peer = new Peer({
        initiator: true,
        stream,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            // Add TURN server if available
          ],
        },
      });

      peer.on('signal', (data) => {
        if (data.candidate) {
          console.log('Emitting ICE candidate:', data.candidate);
          socket.current.emit('iceCandidate', { candidate: data.candidate, room });
        } else {
          console.log('Emitting callUser signal:', data);
          socket.current.emit('callUser', { signal: data, room });
        }
      });

      peer.on('stream', (stream) => {
        console.log('Received remote stream:', stream);
        remoteVideoRef.current.srcObject = stream;
      });

      peer.on('connect', () => {
        console.log('Peer connection established (caller)');
      });

      peer.on('error', (err) => {
        console.error('Peer error (caller):', err);
      });

      peerRef.current = peer;
    } catch (error) {
      console.error('Media access error:', error);
      alert('Please allow camera and microphone access to start the call');
    }
  };

  const acceptCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      console.log('Local stream acquired (receiver):', stream);
      localStreamRef.current = stream;
      localVideoRef.current.srcObject = stream;

      const peer = new Peer({
        initiator: false,
        stream,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            // Add TURN server if available
          ],
        },
      });

      peer.on('signal', (data) => {
        if (data.candidate) {
          console.log('Emitting ICE candidate:', data.candidate);
          socket.current.emit('iceCandidate', { candidate: data.candidate, room });
        } else {
          console.log('Emitting answerCall signal:', data);
          socket.current.emit('answerCall', { signal: data, room });
        }
      });

      peer.on('stream', (stream) => {
        console.log('Received remote stream:', stream);
        remoteVideoRef.current.srcObject = stream;
      });

      peer.on('connect', () => {
        console.log('Peer connection established (callee)');
      });

      peer.on('error', (err) => {
        console.error('Peer error (callee):', err);
      });

      peer.signal(callerSignal);
      peerRef.current = peer;
      setCallStarted(true);
      setIncomingCall(false);
    } catch (error) {
      console.error('Media access error:', error);
      alert('Please allow camera and microphone access to accept the call');
    }
  };

  const declineCall = () => {
    socket.current.emit('callDeclined', { room });
    setIncomingCall(false);
    setCallerSignal(null);
  };

  const endCall = () => {
    peerRef.current?.destroy();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localVideoRef.current.srcObject = null;
    remoteVideoRef.current.srcObject = null;
    peerRef.current = null;
    localStreamRef.current = null;
    setCallStarted(false);
    setIncomingCall(false);
    setCallerSignal(null);
    setIsVideoOn(true);
    setIsAudioOn(true);
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOn(videoTrack.enabled);
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioOn(audioTrack.enabled);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-white to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-4xl transform transition-all slide-in">
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => navigate('/')}
            className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-all duration-300"
          >
            Back to Home
          </button>
          <h2 className="text-2xl font-extrabold text-gray-800">Room: {room}</h2>
          {userId === roomCreatorId && (
            <button
              onClick={deleteRoom}
              className="bg-red-600 text-white p-2 rounded-lg hover:bg-red-700 transition-all duration-300"
            >
              Delete Room
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chat Section */}
          <div className="h-96 overflow-y-auto border border-gray-200 rounded-lg p-4 bg-gray-50 chat-scroll">
            {messages.map((msg, index) => (
              <div
                key={msg._id || index}
                className={`mb-4 p-3 rounded-lg fade-in ${
                  msg.username === 'System'
                    ? 'bg-gray-100 text-gray-600 italic text-center'
                    : msg.username === username
                    ? 'bg-blue-100 ml-auto max-w-[80%]'
                    : 'bg-gray-200 mr-auto max-w-[80%]'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold text-gray-800">
                    {msg.username !== 'System' ? `${msg.username}: ` : ''}
                  </span>
                  <span className="text-gray-400 text-xs">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="mt-1">{msg.message}</p>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Video Section */}
          <div className="flex flex-col space-y-4">
            <div className="relative">
              <video ref={localVideoRef} autoPlay muted className="w-full rounded-lg border border-gray-300" />
              <div className="absolute bottom-2 right-2 flex space-x-2">
                <button
                  onClick={toggleVideo}
                  className={`p-2 rounded-full ${
                    isVideoOn ? 'bg-gray-800 text-white' : 'bg-red-600 text-white'
                  } hover:opacity-80 transition-all duration-300`}
                  title={isVideoOn ? 'Turn off video' : 'Turn on video'}
                >
                  {isVideoOn ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13 7l-8 8m0-8l8 8m6-7l-4.553 2.276A1 1 0 0021 8.618v6.764a1 1 0 01-1.447.894L15 14"
                      />
                    </svg>
                  )}
                </button>
                <button
                  onClick={toggleAudio}
                  className={`p-2 rounded-full ${
                    isAudioOn ? 'bg-gray-800 text-white' : 'bg-red-600 text-white'
                  } hover:opacity-80 transition-all duration-300`}
                  title={isAudioOn ? 'Turn off microphone' : 'Turn on microphone'}
                >
                  {isAudioOn ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                      />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-8-8l8-8m-8 8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <video ref={remoteVideoRef} autoPlay className="w-full rounded-lg border border-gray-300" />
            {!callStarted && !incomingCall && (
              <button
                onClick={startCall}
                className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 transition-all duration-300"
              >
                Start Video Call
              </button>
            )}
            {callStarted && (
              <button
                onClick={endCall}
                className="bg-red-600 text-white p-2 rounded-lg hover:bg-red-700 transition-all duration-300"
              >
                End Call
              </button>
            )}
          </div>
        </div>

        {/* Message Input */}
        <form onSubmit={sendMessage} className="flex space-x-2 relative mt-6">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Type a message... 😊"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full p-3 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
            />
            <button
              type="button"
              onClick={toggleEmojiPicker}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-2xl hover:text-blue-500 transition-colors duration-200"
            >
              😊
            </button>
            {showEmojiPicker && (
              <div
                ref={emojiPickerRef}
                className="absolute bottom-16 right-0 z-10 transform transition-all duration-300 fade-in"
              >
                <EmojiPicker onEmojiClick={onEmojiClick} />
              </div>
            )}
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-all duration-300"
          >
            Send
          </button>
        </form>

        {/* Incoming Call Modal */}
        {incomingCall && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl">
              <h3 className="text-xl font-bold mb-4">Incoming Call</h3>
              <p className="mb-4">You have an incoming video call. Would you like to accept?</p>
              <div className="flex space-x-4">
                <button
                  onClick={acceptCall}
                  className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 transition-all duration-300"
                >
                  Accept
                </button>
                <button
                  onClick={declineCall}
                  className="bg-red-600 text-white p-2 rounded-lg hover:bg-red-700 transition-all duration-300"
                >
                  Decline
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Chat;