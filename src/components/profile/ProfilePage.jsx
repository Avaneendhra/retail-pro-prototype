import React from "react";
import authService from "../../services/authService";
import { useTranslation } from 'react-i18next'; // <-- NEW IMPORT

export default function ProfilePage() {
  const { t } = useTranslation(); // <-- NEW
  const user = authService.getUserFromToken();

  if (!user) {
    return (
      <div className="card max-w-md mx-auto p-6 text-center">
        {/* MODIFIED */}
        <p className="text-red-400">{t('profile.notLoggedIn')}</p>
      </div>
    );
  }

  return (
    <div className="card max-w-md mx-auto p-8">
      <h2 className="text-3xl font-bold text-white font-display mb-6 text-center">
        {/* MODIFIED */}
        {t('profile.title')}
      </h2>

      <div className="space-y-4">
        <div className="p-4 bg-gray-800/50 rounded-lg">
          {/* MODIFIED */}
          <label className="block text-sm font-medium text-gray-400">{t('profile.email')}</label>
          <p className="text-lg text-white">{user.email}</p>
        </div>
        <div className="p-4 bg-gray-800/50 rounded-lg">
          {/* MODIFIED */}
          <label className="block text-sm font-medium text-gray-400">{t('profile.role')}</label>
          <p className="text-lg text-cyan-400 font-bold">{user.role || "N/A"}</p>
        </div>
      </div>

      <p className="mt-6 text-gray-500 text-xs text-center">
        {/* MODIFIED */}
        {t('profile.tokenIssued')}: {new Date(user.iat * 1000).toLocaleString()}
        <br />
        {t('profile.tokenExpires')}: {new Date(user.exp * 1000).toLocaleString()}
      </p>
    </div>
  );
}