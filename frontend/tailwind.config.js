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
            table: {
              width: '100%',
              marginTop: '0.75em',
              marginBottom: '0.75em',
              fontSize: '13px',
              borderCollapse: 'collapse',
            },
            'thead th': {
              padding: '6px 10px',
              fontWeight: '600',
              textAlign: 'left',
              borderBottom: '2px solid #e5e7eb',
              backgroundColor: '#f9fafb',
              fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              color: '#6b7280',
            },
            'tbody td': {
              padding: '5px 10px',
              borderBottom: '1px solid #f3f4f6',
              verticalAlign: 'top',
            },
            'tbody tr:last-child td': {
              borderBottom: 'none',
            },
            'tbody tr:hover td': {
              backgroundColor: '#f9fafb',
            },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
