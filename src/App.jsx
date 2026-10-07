import React from 'react';
import { Outlet } from 'react-router-dom';

/**
 * This is the root component.
 * It only renders an <Outlet>, which will be filled by either
 * AuthLayout (for /login) or MainLayout (for /dashboard).
 */
export default function App() {
  return (
    <Outlet />
  );
}