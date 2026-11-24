import type { Metadata } from 'next'
import { DashboardShell } from '@/components/dashboard/DashboardNav'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Seu painel financeiro personalizado',
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <DashboardShell>{children}</DashboardShell>
}
