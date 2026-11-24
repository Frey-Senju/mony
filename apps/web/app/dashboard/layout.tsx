import type { Metadata } from 'next'
import { DashboardNav } from '@/components/dashboard/DashboardNav'

export const metadata: Metadata = {
  title: 'Dashboard',
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
      <main id="main-content" className="flex-1">
        {children}
      </main>
    </>
  )
}
