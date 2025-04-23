import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('http://localhost:5000/api/register', { username, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('username', res.data.username);
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to register');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-white to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md transform transition-all slide-in">
        <h2 className="text-3xl font-extrabold text-center text-gray-800 mb-6">Register</h2>
        {error && <p className="text-red-500 text-center mb-4">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
          />
          <button
            type="submit"
            className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 pulse"
          >
            Register
          </button>
        </form>
        <p className="text-center mt-4">
          Already have an account? <Link to="/login" className="text-blue-600 hover:underline">Login</Link>
        </p>
      </div>
    </div>
  );
}

export default Register;