/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{html,tsx}',
  ],
  theme: {
    extend: {
        "boxShadow": {
            "inner-lg": "inset 0 0 6px 0 rgba(0, 0, 0, 0.15)",
            "no-offset": "0 0 6px 0 --tw-shadow-color",
        }
    },
  },
  plugins: [],
}

