/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'rgb(var(--background) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-highlight': 'rgb(var(--surface-highlight) / <alpha-value>)',
        primary: 'rgb(var(--primary) / <alpha-value>)',
        'primary-foreground': 'rgb(var(--primary-foreground) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        accent: {
          blue: 'rgb(var(--accent-blue) / <alpha-value>)',
          green: 'rgb(var(--accent-green) / <alpha-value>)',
          lime: 'rgb(var(--accent-lime) / <alpha-value>)',
          emerald: 'rgb(var(--accent-emerald) / <alpha-value>)',
          yellow: 'rgb(var(--accent-yellow) / <alpha-value>)',
          amber: 'rgb(var(--accent-amber) / <alpha-value>)',
          orange: 'rgb(var(--accent-orange) / <alpha-value>)',
          red: 'rgb(var(--accent-red) / <alpha-value>)',
          purple: 'rgb(var(--accent-purple) / <alpha-value>)',
          slate: 'rgb(var(--accent-slate) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
