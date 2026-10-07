import React from 'react';
import { Outlet } from 'react-router-dom';

/**
 * This layout wraps all public auth pages (Login, Signup).
 * It's a simple wrapper to allow these pages to control the full screen.
 */
export default function AuthLayout() {
  return (
    // UPDATED: Added theme-aware background
    <div className="min-h-screen bg-white dark:bg-gray-900 transition-colors duration-200">
      {/* Auth pages (Login, Signup) will render here */}
      <Outlet />
    </div>
  );
}