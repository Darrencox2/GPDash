// Self-hosted fonts (fontsource): served same-origin from /_next/static with
// immutable caching. Eliminates the last third-party origin (fonts.bunny.net)
// - no DNS/TLS round-trip to a second host, which cost 300-600ms on a cold
// mobile connection. Weights mirror exactly what the external URL loaded.
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import '@fontsource/outfit/200.css';
import '@fontsource/outfit/300.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import './globals.css'
import ImpersonationBanner from '@/components/ImpersonationBanner';
import { ConfirmHost } from '@/components/ui';
import PwaSetup from '@/components/PwaSetup';
import ErrorReporter from '@/app/_lib/ErrorReporter';

export const metadata = {
  title: {
    default: 'GPDash — Practice Dashboard',
    // Per-page metadata.title = 'Foo' becomes 'Foo · GPDash' in the
    // browser tab. Pages without a title fall back to default above.
    template: '%s · GPDash',
  },
  description: 'GP practice dashboard — huddle capacity, buddy cover & team management',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'GPDash',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0f172a',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before first paint so there's no flash of
            the wrong theme on load. Defaults to dark when nothing is saved. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('gpdash-theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){}})();`,
          }}
        />
        {/* Warm the connection to Supabase during page load. Client-side
            queries (Meetings, action register, auth refresh) otherwise pay a
            cold DNS + TLS handshake on the first call - noticeable on mobile.
            crossOrigin anonymous matches supabase-js CORS mode. */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <>
            <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
          </>
        )}
      </head>
      <body className="min-h-screen">
        {/* ImpersonationBanner is a server component that returns null
            unless a valid gpdash_imp cookie is present. Sticky-positioned
            at the top of every page so it can't be hidden by other content. */}
        <ImpersonationBanner />
        {/* Installs window-level error + unhandled-rejection reporting.
            Renders nothing; catches what React boundaries cannot see. */}
        <ErrorReporter />
        {children}
        {/* Singleton host for the awaitable confirmDialog() — replaces
            native window.confirm so confirmations match the app design. */}
        <ConfirmHost />
        <PwaSetup />
      </body>
    </html>
  )
}
