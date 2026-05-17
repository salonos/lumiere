import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        plum: {
          50: "#FBEDF2",
          100: "#F3D5E0",
          200: "#E8AFC6",
          500: "#A52668",
          700: "#6B1342",
          800: "#4A0E2F",
          900: "#2D0A1F",
        },
        pink: {
          50: "#FDF5F7",
          100: "#FAE9ED",
        },
        champagne: {
          50: "#F9F4E9",
          100: "#F0E5D0",
          300: "#DCC6A0",
          500: "#C7AB7A",
          700: "#A38B5C",
        },
        ink: {
          100: "#E5DDE0",
          300: "#A8989E",
          500: "#6B5560",
          700: "#3D2A33",
          900: "#1A0F14",
        },
        cream: "#FBF8F6",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
