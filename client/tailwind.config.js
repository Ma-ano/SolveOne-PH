/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./src/**/*.{js,jsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        canvas: "#F7F4EC",
        surface: "#FFFEFA",
        pine: "#18392B",
        leaf: "#2F7D5B",
        mint: "#DDEDE3",
        mango: "#F4B64A",
        coral: "#D96C4F",
        ink: "#17211C",
        muted: "#607067",
        line: "#D8DED9",
      },
      maxWidth: {
        "screen-xl": "1180px",
      },
    },
  },
  plugins: [],
};
