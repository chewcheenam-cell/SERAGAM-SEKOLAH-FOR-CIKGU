import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        batikara: {
          navy: "#123866",
          blue: "#1d6fd6",
          sky: "#eaf4ff",
          ink: "#172033",
          line: "#d7e2f0"
        }
      },
      boxShadow: {
        panel: "0 8px 28px rgba(18, 56, 102, 0.08)"
      }
    },
  },
  plugins: [],
};

export default config;
