import { useEffect, useState } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { supabase } from '../lib/supabase'

export default function RootLayout() {
  const [session, setSession] = useState(undefined)
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        // Verificar se a conta está ativa
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_active')
          .eq('id', session.user.id)
          .single()

        if (!profile?.is_active) {
          await supabase.auth.signOut()
          setSession(null)
          return
        }
      }
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_active')
          .eq('id', session.user.id)
          .single()

        if (!profile?.is_active) {
          await supabase.auth.signOut()
          setSession(null)
          return
        }
      }
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return
    const inAuthGroup = segments[0] === '(auth)'
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)/feed')
    }
  }, [session, segments])

  if (session === undefined) return null

  return <Stack screenOptions={{ headerShown: false }} />
}