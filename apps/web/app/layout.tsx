import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { APPEARANCE_BOOTSTRAP_SCRIPT } from '@/app/_theme/model'
import { AppearanceProvider } from '@/app/_theme/provider'
import { LiquidGlassBackdrop } from '@/app/_theme/liquid-backdrop'
import './globals.css'

const inter = Inter({ subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
  title: {
    template: '%s | Mony',
    default: 'Mony — Gestão Financeira Inteligente',
  },
  description:
    'Dashboard financeiro inteligente com Open Finance, budgets, metas, relatórios avançados e visual Apple Liquid Glass.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className={`${inter.className} min-h-screen antialiased`}>
        <a href="#main-content" className="skip-link">
          Pular para o conteúdo principal
        </a>
        <AppearanceProvider>
          <LiquidGlassBackdrop />
          <div className="relative z-10 min-h-screen flex flex-col">
            {children}
          </div>
        </AppearanceProvider>
      </body>
    </html>
  )
}
