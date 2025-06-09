/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        blue: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae1fd',
          300: '#7dcefc',
          400: '#38b7f8',
          500: '#0e9de9',
          600: '#0280c7',
          700: '#0267a1',
          800: '#065786',
          900: '#0a4970',
        },
      },
      keyframes: {
        ripple: {
          '0%': { transform: 'scale(0.8)', opacity: 1 },
          '100%': { transform: 'scale(1.4)', opacity: 0 },
        },
        pulseListen: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.08)', opacity: '0.85' },
        },
        pulseTalk: {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '25%': { transform: 'scale(1.06)', opacity: '0.85' },
          '50%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        ripple: 'ripple 1.5s infinite ease-in-out',
        pulseListen: 'pulseListen 1.2s ease-in-out infinite',
        pulseTalk: 'pulseTalk 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
