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
  const [callStatus, setCallStatus] = useState(''); // Tracks call state: 'calling', 'rejected', etc.
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
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

    socket.current.on('callRequest', () => {
      console.log('Received call request');
      setCallStatus('incoming');
      // Show accept/reject prompt
      if (window.confirm('Incoming video call. Accept?')) {
        socket.current.emit('callAccepted', { room });
        startReceiverStream();
      } else {
        socket.current.emit('callRejected', { room });
      }
    });

    socket.current.on('callAccepted', () => {
      console.log('Call accepted by receiver');
      setCallStatus('accepted');
      startCallerPeer();
    });

    socket.current.on('callRejected', () => {
      console.log('Call rejected by receiver');
      setCallStatus('rejected');
      alert('Call was rejected by the other user');
      endCall();
    });

    socket.current.on('callUser', ({ signal }) => {
      console.log('Received callUser signal:', signal);
      const peer = new Peer({
        initiator: false,
        stream: localStreamRef.current,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            // Add TURN server if available
          ],
        },
      });

      peer.on('signal', (data) => {
        console.log('Emitting answerCall signal:', data);
        socket.current.emit('answerCall', { signal: data, room });
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

      peer.signal(signal);
      peerRef.current = peer;
      setCallStarted(true);
    });

    socket.current.on('callAnswered', ({ signal }) => {
      console.log('Received callAnswered signal:', signal);
      peerRef.current.signal(signal);
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

  const startReceiverStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      console.log('Receiver stream acquired:', stream);
      localStreamRef.current = stream;
      localVideoRef.current.srcObject = stream;
      setIsMicOn(true);
      setIsCamOn(true);
      setCallStarted(true);
    } catch (error) {
      console.error('Receiver media access error:', error);
      alert('Please allow camera and microphone access to join the call');
      socket.current.emit('callRejected', { room });
    }
  };

  const startCallerPeer = () => {
    const peer = new Peer({
      initiator: true,
      stream: localStreamRef.current,
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
    setCallStarted(true);
  };

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      console.log('Caller stream acquired:', stream);
      localStreamRef.current = stream;
      localVideoRef.current.srcObject = stream;
      setIsMicOn(true);
      setIsCamOn(true);
      setCallStatus('calling');
      socket.current.emit('callRequest', { room });
    } catch (error) {
      console.error('Caller media access error:', error);
      alert('Please allow camera and microphone access to start the call');
    }
  };

  const endCall = () => {
    peerRef.current?.destroy();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localVideoRef.current.srcObject = null;
    remoteVideoRef.current.srcObject = null;
    peerRef.current = null;
    localStreamRef.current = null;
    setCallStarted(false);
    setCallStatus('');
    setIsMicOn(true);
    setIsCamOn(true);
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
      }
    }
  };

  const toggleCam = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCamOn(videoTrack.enabled);
      }
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
              {callStarted && (
                <div className="absolute bottom-2 left-2 flex space-x-2">
                  <button
                    onClick={toggleMic}
                    className={`p-2 rounded-full ${
                      isMicOn ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
                    } text-white transition-all duration-300`}
                    title={isMicOn ? 'Turn off microphone' : 'Turn on microphone'}
                  >
                    {isMicOn ? '🎤' : '🔇'}
                  </button>
                  <button
                    onClick={toggleCam}
                    className={`p-2 rounded-full ${
                      isCamOn ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
                    } text-white transition-all duration-300`}
                    title={isCamOn ? 'Turn off camera' : 'Turn on camera'}
                  >
                    {isCamOn ? '📹' : '📷'}
                  </button>
                </div>
              )}
            </div>
            <video ref={remoteVideoRef} autoPlay className="w-full rounded-lg border border-gray-300" />
            {!callStarted && callStatus !== 'calling' && callStatus !== 'incoming' && (
              <button
                onClick={startCall}
                className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 transition-all duration-300"
              >
                Start Video Call
              </button>
            )}
            {callStatus === 'calling' && (
              <div className="text-center text-gray-600">Calling...</div>
            )}
            {callStatus === 'incoming' && (
              <div className="text-center text-gray-600">Incoming Call...</div>
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
      </div>
    </div>
  );
}

export default Chat;