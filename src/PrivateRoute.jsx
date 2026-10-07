import React from 'react';
import { Navigate } from 'react-router-dom';
import authService from './services/authService';
import { useTranslation } from 'react-i18next'; // Import

export default function PrivateRoute({ children, roles = [] }) {
  const { t } = useTranslation(); // Get hook

  try {
    const user = authService.getUserFromToken();

    if (!user) {
      console.warn("PrivateRoute: No user found, redirecting to login.");
      return <Navigate to="/login" />;
    }

    const userRoles = user.roles?.length
      ? user.roles
      : user.role
      ? [user.role]
      : [];

    const hasAccess =
      roles.length === 0 ||
      roles.some(r => userRoles.includes(r));

    if (!hasAccess) {
      console.warn("PrivateRoute: Access denied for roles", userRoles);
      return (
        <div className="p-4 text-red-600 dark:text-red-400 font-semibold text-center">
          {t('privateRoute.denied')}
        </div>
      );
    }

    return children;
  } catch (err) {
    console.error("PrivateRoute crashed:", err);
    authService.logout();
    return <Navigate to="/login" />;
  }
}