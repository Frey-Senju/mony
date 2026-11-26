'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/stores/auth/useAuth'
import { MonyLogo } from '@/components/brand/MonyLogo'

export default function Home() {
  const router = useRouter()
  const { isAuthenticated, loading } = useAuth()

  useEffect(() => {
    if (!loading) {
      router.replace(isAuthenticated ? '/dashboard' : '/auth/login')
    }
  }, [isAuthenticated, loading, router])

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="glass-panel px-10 py-8 flex flex-col items-center gap-4 text-center">
        <MonyLogo size="lg" showWordmark />
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Carregando seu espaço financeiro...
        </p>
        <div className="w-36 h-1 rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
          <div className="h-full w-1/2 rounded-full bg-blue-600 animate-pulse" />
        </div>
      </div>
    </main>
  )
}
