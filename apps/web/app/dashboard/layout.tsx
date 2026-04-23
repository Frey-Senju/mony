import type { Metadata } from 'next'
import { DashboardNav } from '@/components/dashboard/DashboardNav'

export const metadata: Metadata = {
  title: 'Dashboard | Mony',
  description: 'Seu painel financeiro personalizado',
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <DashboardNav />
      {children}
    </>
  )
}
