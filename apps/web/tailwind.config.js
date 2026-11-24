/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "rgb(var(--accent-rgb, 0 113 227) / 0.10)",
          100: "rgb(var(--accent-rgb, 0 113 227) / 0.18)",
          200: "rgb(var(--accent-rgb, 0 113 227) / 0.28)",
          300: "rgb(var(--accent-rgb, 0 113 227) / 0.45)",
          400: "rgb(var(--accent-rgb, 0 113 227) / 0.72)",
          500: "rgb(var(--accent-rgb, 0 113 227) / 0.88)",
          DEFAULT: "rgb(var(--accent-rgb, 0 113 227) / <alpha-value>)",
          600: "rgb(var(--accent-rgb, 0 113 227) / <alpha-value>)",
          700: "var(--accent-hover, #005BB5)",
          800: "var(--accent-hover, #004A94)",
          900: "var(--accent-hover, #003A75)",
        },
        surface: {
          DEFAULT: "var(--color-surface, #ffffff)",
          subtle: "var(--color-surface-subtle, #f8fafc)",
          muted: "var(--color-surface-muted, #f1f5f9)",
        },
        border: {
          DEFAULT: "var(--color-border, #e2e8f0)",
          strong: "var(--color-border-strong, #cbd5e1)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          '"SF Pro Text"',
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        input: "0 0 0 3px rgb(var(--accent-rgb, 0 113 227) / 0.18)",
      },
      borderRadius: {
        xl: "var(--radius-card, 18px)",
        "2xl": "calc(var(--radius-card, 18px) + 4px)",
      },
    },
  },
  plugins: [],
};
