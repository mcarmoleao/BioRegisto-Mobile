import { useEffect, useState } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { supabase } from '../lib/supabase'

export default function RootLayout() {
  const [session, setSession] = useState(undefined)
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    // 1. Obtém a sessão atual imediatamente ao arrancar
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        checkUserStatus(session.user.id, session)
      } else {
        setSession(null)
      }
    }).catch(() => setSession(null))

    // 2. Escuta alterações no estado de login/logout
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (currentSession) {
        checkUserStatus(currentSession.user.id, currentSession)
      } else {
        setSession(null)
      }
    })

    // Função auxiliar para verificar se o perfil está ativo sem bloquear a app
    async function checkUserStatus(userId, activeSession) {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('is_active')
          .eq('id', userId)
          .maybeSingle() // maybeSingle evita crashar se o perfil ainda não existir

        if (error || !profile || !profile.is_active) {
          await supabase.auth.signOut()
          setSession(null)
          return
        }
        
        setSession(activeSession)
      } catch (err) {
        // Se houver um erro de rede, deixa passar para o utilizador não ficar preso fora
        setSession(activeSession)
      }
    }

    return () => subscription.unsubscribe()
  }, [])

  // Controla os redirecionamentos automáticos de rotas baseado na sessão
  useEffect(() => {
    if (session === undefined) return

    const inAuthGroup = segments[0] === '(auth)'

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login')
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)/feed')
    }
  }, [session, segments])

  // Mantém o ecrã nativo de Splash enquanto a sessão inicial é resolvida (undefined)
  if (session === undefined) return null

  return <Stack screenOptions={{ headerShown: false }} />
}