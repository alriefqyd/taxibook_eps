import { useRouter } from 'next/navigation'
import { navStart } from '@/components/NavigationLoader'

export function useNavRouter() {
  const router = useRouter()
  return {
    push:     (href: string, options?: Parameters<typeof router.push>[1])    => { navStart(); router.push(href, options) },
    replace:  (href: string, options?: Parameters<typeof router.replace>[1]) => { navStart(); router.replace(href, options) },
    back:     ()           => { navStart(); router.back() },
    forward:  ()           => router.forward(),
    refresh:  ()           => router.refresh(),
    prefetch: router.prefetch.bind(router),
  }
}
