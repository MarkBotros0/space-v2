const theme = require("./src/design/theme/tailwind-theme.js");

// Tailwind 4 (v1) accepts any integer opacity modifier (bg-primary/92);
// Tailwind 3 only generates steps of 5 unless the scale lists them.
const opacity = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [String(i), String(i / 100)]));

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  corePlugins: { fontWeight: false },
  theme: {
    colors: theme.colors,
    borderRadius: theme.borderRadius,
    boxShadow: theme.boxShadow,
    fontFamily: theme.fontFamily,
    extend: { opacity },
  },
  plugins: [theme.fontWeightPlugin],
};
