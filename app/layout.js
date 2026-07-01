import './globals.css'
import ImpersonationBanner from '@/components/ImpersonationBanner';
import { ConfirmHost } from '@/components/ui';
import PwaSetup from '@/components/PwaSetup';

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
        {/* Fonts: linked here (not @import in CSS) so the browser discovers
            them from the HTML immediately, in parallel with globals.css.
            The old @import created a serial chain (CSS -> discover import ->
            connect -> font CSS -> fonts) that delayed first paint. */}
        <link rel="preconnect" href="https://fonts.bunny.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.bunny.net/css?family=dm-sans:400,500,600,700|space-mono:400,700|outfit:200,300,400,500&display=swap"
        />
      </head>
      <body className="min-h-screen">
        {/* ImpersonationBanner is a server component that returns null
            unless a valid gpdash_imp cookie is present. Sticky-positioned
            at the top of every page so it can't be hidden by other content. */}
        <ImpersonationBanner />
        {children}
        {/* Singleton host for the awaitable confirmDialog() — replaces
            native window.confirm so confirmations match the app design. */}
        <ConfirmHost />
        <PwaSetup />
      </body>
    </html>
  )
}
