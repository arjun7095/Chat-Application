import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem('token'); // Or use a context/auth state

  return isAuthenticated ? children : <Navigate to="/login" />;
};

export default ProtectedRoute;