import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import EmojiPicker from 'emoji-picker-react';

function Chat() {
  const { room } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [roomCreatorId, setRoomCreatorId] = useState('');
  const messagesEndRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const username = localStorage.getItem('username');
  const userId = localStorage.getItem('userId');
  const socket = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    socket.current = io('https://chat-application-backend-e7w8.onrender.com', {
      auth: { token: localStorage.getItem('token') }
    });

    const fetchMessages = async () => {
      try {
        const res = await axios.get(`https://chat-application-backend-e7w8.onrender.com/api/messages/${room}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setMessages(res.data);
      } catch (err) {
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
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
      } catch (err) {
        alert(err.response?.data?.error || 'Failed to delete room');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-white to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-lg sm:max-w-xl lg:max-w-2xl transform transition-all slide-in">
        <div className="flex justify-between items-center mb-6">
        <button
          onClick={() => navigate('/')}
          className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-all duration-300"
        >
          Back to Home
        </button>
          <h2 className="text-3xl font-extrabold text-gray-800">Room: {room}</h2>
          
        </div>
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
        <form onSubmit={sendMessage} className="flex space-x-2 relative mt-4">
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
          </div>
          {showEmojiPicker && (
            <div
              ref={emojiPickerRef}
              className="absolute bottom-16 right-0 z-10 transform transition-all duration-300 fade-in"
            >
              <EmojiPicker onEmojiClick={onEmojiClick} />
            </div>
          )}
          <button
            type="submit"
            className="bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-all duration-300 pulse"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

export default Chat;