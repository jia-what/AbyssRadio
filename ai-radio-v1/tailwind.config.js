/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Satoshi', 'sans-serif'],
        serif: ['Georgia', 'Times New Roman', 'serif'],
      },
      colors: {
        radio: {
          black: '#000000',
          'black-soft': '#050508',
          'black-mid': '#0a0a1a',
          blue: '#3b82f6',
          'blue-light': '#60a5fa',
        },
      },
      animation: {
        'spin-slow': 'spin 8s linear infinite',
        'pulse-soft': 'pulse-soft 6s ease-in-out infinite',
        'fade-up': 'fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) backwards',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '0.1' },
          '50%': { opacity: '0.25' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
    },
  },
  plugins: [],
}
