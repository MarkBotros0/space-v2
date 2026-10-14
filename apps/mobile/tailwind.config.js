/** @type {import('tailwindcss').Config} */
// Tailwind 4 (v1) accepts any integer opacity modifier (bg-primary/92);
// Tailwind 3 only generates steps of 5 unless the scale lists them.
const opacity = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [String(i), String(i / 100)]));

module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      opacity,
      colors: {
        primary: "rgb(var(--primary) / <alpha-value>)",
        sidebar: "rgb(var(--sidebar) / <alpha-value>)",
        background: "rgb(var(--background) / <alpha-value>)",
        "brand-teal-500": "#7DCED1",
      },
      borderRadius: { "2xl": "18px" },
    },
  },
};
