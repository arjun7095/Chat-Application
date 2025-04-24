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
  const [callStatus, setCallStatus] = useState('');
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [peers, setPeers] = useState([]); // Track peers and their streams
  const [ongoingCall, setOngoingCall] = useState(false); // Track if a call is ongoing
  const username = localStorage.getItem('username');
  const userId = localStorage.getItem('userId');

  const socket = useRef(null);
  const messagesEndRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerRefs = useRef({}); // Store peer instances by userId

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

    socket.current.emit('joinRoom', { roomName: room, userId });

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

    socket.current.on('callRequest', ({ from }) => {
      console.log('Received call request from:', from);
      setCallStatus('incoming');
      if (window.confirm(`Incoming video call from ${from}. Accept?`)) {
        socket.current.emit('callAccepted', { room, to: from });
        startStream();
      } else {
        socket.current.emit('callRejected', { room, to: from });
      }
    });

    socket.current.on('callAccepted', ({ from }) => {
      console.log('Call accepted by:', from);
      setCallStatus('accepted');
      createPeer(from, true);
    });

    socket.current.on('callRejected', ({ from }) => {
      console.log('Call rejected by:', from);
      alert(`Call was rejected by ${from}`);
      if (!peers.some((peer) => peer.connected)) {
        endCall();
      }
    });

    socket.current.on('callUser', ({ signal, from }) => {
      console.log('Received callUser signal from:', from);
      createPeer(from, false, signal);
    });

    socket.current.on('callAnswered', ({ signal, from }) => {
      console.log('Received callAnswered signal from:', from);
      if (peerRefs.current[from]) {
        peerRefs.current[from].signal(signal);
      }
    });

    socket.current.on('iceCandidate', ({ candidate, from }) => {
      console.log('Received ICE candidate from:', from);
      if (peerRefs.current[from]) {
        peerRefs.current[from].addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
          console.error('Error adding ICE candidate:', err);
        });
      }
    });

    socket.current.on('ongoingCall', () => {
      console.log('Received ongoingCall notification');
      setOngoingCall(true);
    });

    socket.current.on('userLeft', ({ userId: leftUserId }) => {
      console.log('User left:', leftUserId);
      if (peerRefs.current[leftUserId]) {
        peerRefs.current[leftUserId].destroy();
        delete peerRefs.current[leftUserId];
        setPeers((prev) => prev.filter((peer) => peer.userId !== leftUserId));
      }
      if (!peers.some((peer) => peer.connected)) {
        setCallStarted(false);
        setCallStatus('');
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
          params: { userId }
        });
      } catch (err) {
        alert(err.response?.data?.error || 'Failed to delete room');
      }
    }
  };

  const startStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      console.log('Stream acquired:', stream);
      localStreamRef.current = stream;
      localVideoRef.current.srcObject = stream;
      setIsMicOn(true);
      setIsCamOn(true);
      setCallStarted(true);
      setOngoingCall(true);
      // Update existing peers with the new stream
      Object.values(peerRefs.current).forEach((peer) => {
        peer.addStream(stream);
      });
    } catch (error) {
      console.error('Media access error:', error);
      alert('Please allow camera and microphone access to join the call');
      socket.current.emit('callRejected', { room, to: Object.keys(peerRefs.current) });
    }
  };

  const createPeer = (toUserId, initiator, signal = null) => {
    if (peerRefs.current[toUserId]) {
      peerRefs.current[toUserId].destroy();
      delete peerRefs.current[toUserId];
    }

    const peer = new Peer({
      initiator,
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
        console.log('Emitting ICE candidate to:', toUserId);
        socket.current.emit('iceCandidate', { candidate: data.candidate, room, to: toUserId });
      } else {
        console.log('Emitting callUser signal to:', toUserId);
        socket.current.emit('callUser', { signal: data, room, to: toUserId });
      }
    });

    peer.on('stream', (stream) => {
      console.log('Received stream from:', toUserId);
      setPeers((prev) => {
        const existing = prev.find((p) => p.userId === toUserId);
        if (existing) {
          return prev.map((p) => (p.userId === toUserId ? { ...p, stream, connected: true } : p));
        }
        return [...prev, { userId: toUserId, stream, connected: true }];
      });
    });

    peer.on('connect', () => {
      console.log('Peer connection established with:', toUserId);
      setPeers((prev) => prev.map((p) => (p.userId === toUserId ? { ...p, connected: true } : p)));
    });

    peer.on('error', (err) => {
      console.error('Peer error with:', toUserId, err);
    });

    peer.on('close', () => {
      console.log('Peer connection closed with:', toUserId);
      delete peerRefs.current[toUserId];
      setPeers((prev) => prev.filter((p) => p.userId !== toUserId));
      if (!peers.some((p) => p.connected)) {
        setCallStarted(false);
        setCallStatus('');
        setOngoingCall(false);
      }
    });

    if (signal) {
      peer.signal(signal);
    }

    peerRefs.current[toUserId] = peer;
  };

  const startCall = async () => {
    try {
      await startStream();
      setCallStatus('calling');
      socket.current.emit('callRequest', { room, from: userId });
    } catch (error) {
      console.error('Start call error:', error);
      alert('Failed to start call');
    }
  };

  const joinCall = async () => {
    try {
      await startStream();
      socket.current.emit('joinCall', { room, userId });
    } catch (error) {
      console.error('Join call error:', error);
      alert('Failed to join call');
    }
  };

  const endCall = () => {
    Object.values(peerRefs.current).forEach((peer) => peer.destroy());
    peerRefs.current = {};
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localVideoRef.current.srcObject = null;
    setPeers([]);
    localStreamRef.current = null;
    setCallStarted(false);
    setCallStatus('');
    setOngoingCall(false);
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
            <div className="grid grid-cols-2 gap-2">
              {peers.map((peer) => (
                <div key={peer.userId} className="relative">
                  <video
                    autoPlay
                    ref={(video) => {
                      if (video && peer.stream) video.srcObject = peer.stream;
                    }}
                    className="w-full rounded-lg border border-gray-300"
                  />
                  <span className="absolute bottom-2 left-2 text-white bg-black bg-opacity-50 px-2 py-1 rounded">
                    {peer.userId}
                  </span>
                </div>
              ))}
            </div>
            {!callStarted && callStatus !== 'calling' && callStatus !== 'incoming' && !ongoingCall && (
              <button
                onClick={startCall}
                className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 transition-all duration-300"
              >
                Start Video Call
              </button>
            )}
            {!callStarted && ongoingCall && (
              <button
                onClick={joinCall}
                className="bg-yellow-600 text-white p-2 rounded-lg hover:bg-yellow-700 transition-all duration-300"
              >
                Join Call
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