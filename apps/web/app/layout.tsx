import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ConflictWatch',
  description: 'Real-time global conflict intelligence',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0a0f1a] text-gray-200 min-h-screen">
        {children}
      </body>
    </html>
  )
}
