'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAuthStore } from '@/stores/authStore'

interface Props {
  children: React.ReactNode
  title: string
  subtitle?: string
  requiredRoles?: string[]
}

export default function DashboardLayout({ children, title, subtitle, requiredRoles }: Props) {
  const router = useRouter()
  const { isAuthenticated, user } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated || !user) { router.push('/login'); return }
    if (requiredRoles && user) {
      const role = user.role
      if (!requiredRoles.includes(role)) {
        if (['admin','super_admin'].includes(role)) router.push('/dashboard/admin')
        else if (['ai_intern','it_support_technician','junior_operations'].includes(role)) router.push('/dashboard/agent')
        else router.push('/dashboard/employee')
      }
    }
  }, [isAuthenticated, user])

  if (!isAuthenticated || !user) return null

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar />
      <div style={{ flex: 1, marginLeft: 'var(--sidebar-w)', display: 'flex', flexDirection: 'column' }}>
        <Header title={title} subtitle={subtitle} />
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px', paddingTop: 'calc(var(--header-h) + 24px)' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
