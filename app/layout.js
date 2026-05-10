import './globals.css'
import ImpersonationBanner from '@/components/ImpersonationBanner';

export const metadata = {
  title: {
    default: 'GPDash — Practice Dashboard',
    // Per-page metadata.title = 'Foo' becomes 'Foo · GPDash' in the
    // browser tab. Pages without a title fall back to default above.
    template: '%s · GPDash',
  },
  description: 'GP practice dashboard — huddle capacity, buddy cover & team management',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {/* ImpersonationBanner is a server component that returns null
            unless a valid gpdash_imp cookie is present. Sticky-positioned
            at the top of every page so it can't be hidden by other content. */}
        <ImpersonationBanner />
        {children}
      </body>
    </html>
  )
}
