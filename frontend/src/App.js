import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import Home from './components/Home';
import Chat from './components/Chat';
import './index.css';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  const token = localStorage.getItem('token');

  return (
    <Router>
      <Routes>
        <Route path="/login" element= {<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<ProtectedRoute> <Home /> </ProtectedRoute> } />
        <Route path="/chat/:room" element={<ProtectedRoute><Chat  /></ProtectedRoute>} />
      </Routes>
    </Router>
  );
}

export default App;