// Web app manifest — served at /manifest.webmanifest by Next.
// Makes GPDash installable to the home screen on Android/desktop
// (iOS uses the apple-* metadata in app/layout.js instead).
export default function manifest() {
  return {
    name: 'GPDash — Practice Dashboard',
    short_name: 'GPDash',
    description: 'GP practice dashboard — huddle capacity, buddy cover & team management',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
