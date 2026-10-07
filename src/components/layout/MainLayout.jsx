import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import authService from '../../services/authService';

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const user = authService.getUserFromToken();

  return (
    <div className="app-shell">
      {user && (
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      )}
      
      <main className="main-content">
        {/* Mobile Header (Hamburger Menu) */}
        {user && (
          <div className="md:hidden flex items-center justify-between mb-4 bg-[var(--surface)] p-3 rounded-xl border border-[var(--border)] shadow-sm">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <span className="font-bold text-[var(--text-primary)]">Smart Retail</span>
            </div>
            <button 
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg bg-[var(--bg)] text-[var(--text-secondary)] border border-[var(--border)]"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        )}
        
        {/* Content Outlet */}
        <div className="animate-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}