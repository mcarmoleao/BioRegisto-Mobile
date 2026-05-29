import { useEffect, useState } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { supabase } from '../lib/supabase'

export default function RootLayout() {
  const [session, setSession] = useState(undefined)
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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