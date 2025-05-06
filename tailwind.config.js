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
      animation: {
        ripple: 'ripple 1.5s infinite ease-in-out',
      },
      keyframes: {
        ripple: {
          '0%': { transform: 'scale(0.8)', opacity: 1 },
          '100%': { transform: 'scale(1.4)', opacity: 0 },
        },
      },
    },
  },
  plugins: [],
};