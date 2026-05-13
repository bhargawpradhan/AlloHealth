import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        void: "#050711",
        ink: "#0a1020",
        cyanGlow: "#18d5ff",
        violetGlow: "#8f5bff",
        acid: "#9cff6a"
      },
      boxShadow: {
        neon: "0 0 40px rgba(24, 213, 255, 0.28), 0 0 90px rgba(143, 91, 255, 0.18)",
        danger: "0 0 35px rgba(255, 59, 107, 0.35)"
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        pulseGlow: "pulseGlow 2.8s ease-in-out infinite",
        shake: "shake 0.45s cubic-bezier(.36,.07,.19,.97) both"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px) rotateX(0deg)" },
          "50%": { transform: "translateY(-14px) rotateX(2deg)" }
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" }
        },
        shake: {
          "10%, 90%": { transform: "translateX(-1px)" },
          "20%, 80%": { transform: "translateX(2px)" },
          "30%, 50%, 70%": { transform: "translateX(-4px)" },
          "40%, 60%": { transform: "translateX(4px)" }
        }
      }
    }
  },
  plugins: []
};

export default config;
