/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Landing SENTINEL
        accent: { DEFAULT: '#16C7B7', hover: '#1FD9C8' },
        bg: { DEFAULT: '#0B1220', 2: '#101A2E', 3: '#16233C' },
        text: {
          DEFAULT: '#F1F5F9',
          muted: 'rgba(241, 245, 249, 0.55)',
        },
        surface: '#101A2E',
        neutral: {
          DEFAULT: 'rgba(241, 245, 249, 0.55)',
          10: 'rgba(241, 245, 249, 0.10)',
          15: 'rgba(241, 245, 249, 0.15)',
          50: 'rgba(241, 245, 249, 0.50)',
          60: 'rgba(241, 245, 249, 0.55)',
          70: 'rgba(241, 245, 249, 0.70)',
        },
        border: {
          DEFAULT: 'rgba(241, 245, 249, 0.08)',
          mid: 'rgba(241, 245, 249, 0.14)',
          acc: 'rgba(22, 199, 183, 0.35)',
        },
        danger: '#F87171',
        critical: '#FF2E54',
        high: '#FF8800',
        medium: '#FFC107',
        low: '#00B0FF',

        // Dashboard
        brand: {
          black: '#070709',
          dark: '#0B0E14',
          surface: '#11151E',
          border: '#1A2130',
          neon: '#00FF66',
          green: '#00E676',
          critical: '#FF2E54',
          high: '#FF8800',
          medium: '#FFC107',
          low: '#00B0FF',
          purple: '#A855F7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'neon-glow': '0 0 20px rgba(0, 255, 102, 0.3)',
        'neon-glow-strong': '0 0 35px rgba(0, 255, 102, 0.5)',
        'critical-glow': '0 0 15px rgba(255, 46, 84, 0.3)',
        'purple-glow': '0 0 20px rgba(168, 85, 247, 0.3)',
      },
    },
  },
  plugins: [],
};