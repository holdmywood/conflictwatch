import type { Metadata } from 'next'
import { Archivo, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import Attribution from './components/Attribution'

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-archivo',
})

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
})

export const metadata: Metadata = {
  title: 'ConflictWatch',
  description: 'Real-time global conflict intelligence',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen">
        {children}
        <Attribution />
      </body>
    </html>
  )
}
