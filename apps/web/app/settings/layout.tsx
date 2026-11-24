import type { Metadata } from 'next'
import { DashboardNav } from '@/components/dashboard/DashboardNav'

export const metadata: Metadata = {
  title: 'Configurações',
  description: 'Conexões Open Finance e personalização Apple Liquid Glass do Mony',
}

export default function SettingsLayout({
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
