import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import ThemeProvider from '@/components/shared/ThemeProvider'

export const metadata: Metadata = {
  title: 'TicketIQ Enterprise',
  description: 'AI-Powered Enterprise Support Platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'var(--bg-card)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-md)',
                borderRadius: 'var(--radius)',
                fontSize: '13.5px',
                fontFamily: 'var(--font-sans)',
              },
              duration: 4000,
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  )
}
