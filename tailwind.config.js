import plugin from 'tailwindcss/plugin';

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './src/**/*.{html,tsx}',
    ],
    theme: {
        extend: {
            boxShadow: {
                "inner-lg": "inset 0 0 6px 0 rgba(0, 0, 0, 0.15)",
                "no-offset": "0 0 6px 0 --tw-shadow-color",
            },
            textShadow: {
                sm: '0 1px 2px var(--tw-shadow-color)',
                DEFAULT: '0 2px 4px var(--tw-shadow-color)',
                lg: '0 8px 16px var(--tw-shadow-color)',
            },
        },
    },
    plugins: [
        plugin(function ({ matchUtilities, theme }) {
            matchUtilities(
                { 'text-shadow': (value) => ({ textShadow: value }) },
                { values: theme('textShadow') });
        }),
    ],
}

