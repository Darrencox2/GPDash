import './globals.css'

export const metadata = {
  title: 'GPDash — Practice Dashboard',
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
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
