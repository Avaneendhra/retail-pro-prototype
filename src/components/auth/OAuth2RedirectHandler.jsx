// src/components/auth/OAuth2RedirectHandler.jsx
import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import authService from '../../services/authService';

export default function OAuth2RedirectHandler() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    const refreshToken = searchParams.get('refreshToken');

    if (token && refreshToken) {
      console.log("OAuth2 Success: Saving tokens...");
      // We need to export saveTokens from authService
      authService.saveTokens({ accessToken: token, refreshToken: refreshToken });
      
      // Redirect to the dashboard after successful login
      navigate('/dashboard');
    } else {
      console.error("OAuth2 Error: No tokens found in URL.");
      // Redirect to login page with an error
      navigate('/login?error=oauth_failed');
    }
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <p className="text-xl">Processing your login...</p>
    </div>
  );
}