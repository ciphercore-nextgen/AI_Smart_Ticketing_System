'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'

export default function RootPage() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated || !user) {
      router.replace('/login')
      return
    }

    const role = user.role
    if (role === 'admin' || role === 'super_admin') {
      router.replace('/dashboard/admin')
    } else if (role === 'ai_intern' || role === 'it_support_technician' || role === 'junior_operations') {
      router.replace('/dashboard/agent')
    } else {
      router.replace('/dashboard/employee')
    }
  }, [isAuthenticated, user, router])

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
    </div>
  )
}
