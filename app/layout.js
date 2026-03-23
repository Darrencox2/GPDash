import './globals.css'

export const metadata = {
  title: 'Buddy System - Winscombe & Banwell Family Practice',
  description: 'Clinical cover allocation & huddle dashboard',
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
