import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get role and redirect to correct home
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const homeMap: Record<string, string> = {
    staff:       '/staff/home',
    coordinator: '/coordinator/home',
    driver:      '/driver/home',
  }

  redirect(homeMap[profile?.role || 'staff'])
}
