import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function Home() {
  const [rooms, setRooms] = useState([]);
  const [createRoomName, setCreateRoomName] = useState('');
  const [joinRoomName, setJoinRoomName] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const username = localStorage.getItem('username');
  const userId = localStorage.getItem('userId');

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await axios.get(`https://chat-application-backend-e7w8.onrender.com/api/rooms/${userId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setRooms(res.data);
      } catch (err) {
        setError('Failed to fetch rooms');
      }
    };
    fetchRooms();
  }, []);

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    try {
      await axios.post(
        'https://chat-application-backend-e7w8.onrender.com/api/rooms',
        { name: createRoomName,userId },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      navigate(`/chat/${createRoomName}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create room');
    }
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (joinRoomName.trim()) {
      navigate(`/chat/${joinRoomName}`);
    } else {
      setError('Room name is required');
    }
  };

  const handleDeleteRoom = async (roomName) => {
    if (window.confirm(`Are you sure you want to delete the room "${roomName}"?`)) {
      try {
        const res=await axios.delete(`https://chat-application-backend-e7w8.onrender.com/api/rooms/${roomName}?userId=${userId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
          
        });
        alert(res.data.message)
        setRooms(rooms.filter((room) => room.name !== roomName));
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to delete room front');
      }
    }
  };
  

  const handleLogout = () => {
    if (window.confirm(`Are you sure you want to logout the room ?`)) {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-white to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-lg sm:max-w-xl transform transition-all slide-in">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-extrabold text-gray-800">Welcome, {username}</h2>
          <button
            onClick={handleLogout}
            className="bg-gray-600 text-white p-2 rounded-lg hover:bg-gray-700 transition-all duration-300 pulse"
          >
            Logout
          </button>
        </div>
        {error && <p className="text-red-500 text-center mb-4">{error}</p>}
        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">Create Room</h3>
            <form onSubmit={handleCreateRoom} className="flex space-x-2">
              <input
                type="text"
                placeholder="Enter room name"
                value={createRoomName}
                onChange={(e) => setCreateRoomName(e.target.value)}
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
              />
              <button
                type="submit"
                className="bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-all duration-300 pulse"
              >
                Create
              </button>
            </form>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">Join Room</h3>
            <form onSubmit={handleJoinRoom} className="flex space-x-2">
              <input
                type="text"
                placeholder="Enter room name"
                value={joinRoomName}
                onChange={(e) => setJoinRoomName(e.target.value)}
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
              />
              <button
                type="submit"
                className="bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition-all duration-300 pulse"
              >
                Join
              </button>
            </form>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">Your Rooms</h3>
            {rooms.length === 0 ? (
              <p className="text-gray-600">No rooms created yet.</p>
            ) : (
              <ul className="space-y-2">
                {rooms.map((room) => (
                  <li key={room._id} className="flex justify-between items-center p-2 bg-gray-100 rounded-lg fade-in">
                    <span
                      className="text-blue-600 hover:underline cursor-pointer"
                      onClick={() => navigate(`/chat/${room.name}`)}
                    >
                      {room.name}
                    </span>
                    <button
                      onClick={() => handleDeleteRoom(room.name)}
                      className="bg-red-600 text-white p-1 rounded hover:bg-red-700 transition-all duration-300"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;