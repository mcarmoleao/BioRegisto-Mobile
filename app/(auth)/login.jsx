import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, Image, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setLoading(true)
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      Alert.alert('Erro', 'Email ou password incorretos.')
      setLoading(false)
      return
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('id', authData.user.id)
      .single()
    if (!profile?.is_active) {
      await supabase.auth.signOut()
      Alert.alert('Conta desativada', 'A sua conta foi desativada. Contacte o administrador.')
      setLoading(false)
      return
    }
    setLoading(false)
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="o.teu@email.pt"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholderTextColor="#999"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholderTextColor="#999"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'A entrar...' : 'Entrar'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/(auth)/register')} style={styles.linkContainer}>
            <Text style={styles.linkText}>Não tens conta? </Text>
            <Text style={styles.link}>Regista-te</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 40 },
  logoContainer: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 180, height: 100 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#0d723b', marginBottom: 6 },
  subtitle: { fontSize: 15, color: '#888', marginBottom: 32 },
  form: { gap: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 15, color: '#333', backgroundColor: '#fafafa' },
  button: { backgroundColor: '#0d723b', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  linkText: { fontSize: 14, color: '#777' },
  link: { fontSize: 14, color: '#0d723b', fontWeight: '600' },
})