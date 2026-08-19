import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

/**
 * This layout wraps all protected pages *after* login.
 * It includes the main Navbar and the centered, padded content area.
 */
export default function MainLayout() {
  return (
    // UPDATED: Now theme-aware
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
      <Navbar />
      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* All protected child routes will render here */}
        <Outlet />
      </main>
    </div>
  );
}