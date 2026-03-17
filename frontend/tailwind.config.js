/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      typography: {
        sm: {
          css: {
            fontSize: '14px',
            lineHeight: '1.6',
            p: { marginTop: '0.5em', marginBottom: '0.5em' },
            'ul, ol': { marginTop: '0.3em', marginBottom: '0.3em' },
            li: { marginTop: '0.15em', marginBottom: '0.15em' },
            h1: { fontSize: '1.1em', marginTop: '0.8em', marginBottom: '0.3em' },
            h2: { fontSize: '1.05em', marginTop: '0.6em', marginBottom: '0.3em' },
            h3: { fontSize: '1em', marginTop: '0.5em', marginBottom: '0.2em' },
            strong: { fontWeight: '600' },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
