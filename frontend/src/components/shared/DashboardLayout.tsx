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
    if (!isAuthenticated || !user) {
      router.push('/login')
      return
    }
    if (requiredRoles && user) {
      const role = user.role
      if (!requiredRoles.includes(role)) {
        // Redirect to the correct dashboard — not login
        const role = user.role
        if (['admin','super_admin'].includes(role)) router.push('/dashboard/admin')
        else if (['ai_intern','it_support_technician','junior_operations'].includes(role)) router.push('/dashboard/agent')
        else router.push('/dashboard/employee')
      }
    }
  }, [isAuthenticated, user])

  if (!isAuthenticated || !user) return null

  return (
    <div className="flex h-screen bg-gray-950">
      <Sidebar />
      <div className="flex-1 flex flex-col ml-64 min-w-0">
        <Header title={title} subtitle={subtitle} />
        <main className="flex-1 overflow-y-auto pt-16 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
