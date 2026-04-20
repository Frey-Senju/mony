import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard | Mony',
  description: 'Seu painel financeiro personalizado',
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
