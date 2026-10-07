const defaultTheme = require('tailwindcss/defaultTheme');

module.exports = {
  darkMode: 'class', // <-- ADD THIS LINE
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // NEW: Add fonts from your prompt
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'sans-serif'],
      },
      // Animation for background (if needed)
      keyframes: {
        'gradient-xy': {
          '0%, 100%': { 'background-position': '0% 50%' },
          '50%': { 'background-position': '100% 50%' },
        },
      },
      animation: {
        'gradient-xy': 'gradient-xy 15s ease infinite',
      },
    },
  },
  // --- ADDED ASPECT RATIO PLUGIN ---
  plugins: [
    require('@tailwindcss/aspect-ratio'),
  ],
};