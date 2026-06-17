import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, Image, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'

export default function Register() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister() {
    if (!username.trim()) {
      Alert.alert('Erro', 'O username é obrigatório.')
      return
    }
    setLoading(true)

    // Verificar se username já existe
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username.trim())
      .single()

    if (existing) {
      Alert.alert('Erro', 'Este username já está a ser usado.')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username.trim() } }
    })

    if (error) Alert.alert('Erro', error.message)
    else Alert.alert('Conta criada!', 'Já podes iniciar sessão.', [
      { text: 'OK', onPress: () => router.back() }
    ])
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

        <Text style={styles.title}>Criar conta</Text>
        <Text style={styles.subtitle}>Junta-te à comunidade BioRegisto</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Username</Text>
          <View style={styles.inputWithPrefix}>
            <Text style={styles.prefix}>@</Text>
            <TextInput
              style={styles.inputPrefix}
              placeholder="o_teu_username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              placeholderTextColor="#999"
            />
          </View>

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
            onPress={handleRegister}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'A criar conta...' : 'Criar conta'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={styles.linkContainer}>
            <Text style={styles.linkText}>Já tens conta? </Text>
            <Text style={styles.link}>Iniciar sessão</Text>
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
  title: { fontSize: 26, fontWeight: 'bold', color: '#0d723b', marginBottom: 4, marginTop: 30 },
  subtitle: { fontSize: 15, color: '#888', marginBottom: 10 },
  form: { gap: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 15, color: '#333', backgroundColor: '#fafafa' },
  inputWithPrefix: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 10, overflow: 'hidden', backgroundColor: '#fafafa' },
  prefix: { paddingHorizontal: 14, fontSize: 15, color: '#888', backgroundColor: '#f0f0f0', paddingVertical: 14 },
  inputPrefix: { flex: 1, padding: 14, fontSize: 15, color: '#333' },
  button: { backgroundColor: '#0d723b', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 24 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  linkText: { fontSize: 14, color: '#777' },
  link: { fontSize: 14, color: '#0d723b', fontWeight: '600' },
})