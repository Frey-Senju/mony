import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { APPEARANCE_BOOTSTRAP_SCRIPT } from '@/app/_theme/model'
import { AppearanceProvider } from '@/app/_theme/provider'
import { LiquidGlassBackdrop } from '@/app/_theme/liquid-backdrop'
import { ToastProvider } from '@/components/ui/ToastProvider'
import './globals.css'

const inter = Inter({ subsets: ['latin'], display: 'swap' })

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0071E3' },
    { media: '(prefers-color-scheme: dark)', color: '#050914' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: {
    template: '%s | Mony',
    default: 'Mony — Gestão Financeira Inteligente',
  },
  description:
    'Dashboard financeiro inteligente com Mony IA, leitura de faturas e recibos por câmera, projeção de parcelas, contas recorrentes, budgets e visual Apple Liquid Glass.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Mony',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
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
          <ToastProvider>
            <LiquidGlassBackdrop />
            <div className="relative z-10 min-h-screen flex flex-col">
              {children}
            </div>
          </ToastProvider>
        </AppearanceProvider>
      </body>
    </html>
  )
}
