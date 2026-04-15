import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mony - Financial Dashboard',
  description: 'Smart financial management with Porquim.ia & Pierre Finance features',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
