import './globals.css'

export const metadata = {
  title: 'Buddy System - Winscombe & Banwell Family Practice',
  description: 'Clinical cover allocation tool',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 min-h-screen">{children}</body>
    </html>
  )
}
