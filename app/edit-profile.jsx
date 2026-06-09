import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, Alert, TextInput
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '../lib/supabase'

export default function EditProfile() {
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Campos editáveis
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [location, setLocation] = useState('')
  const [avatarUri, setAvatarUri] = useState(null) // nova foto local
  const [avatarUrl, setAvatarUrl] = useState(null) // url atual

  // Confirmação
  const [showConfirm, setShowConfirm] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmLoading, setConfirmLoading] = useState(false)

  useEffect(() => { fetchProfile() }, [])

  async function fetchProfile() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) {
      setProfile(data)
      setFullName(data.full_name || '')
      setUsername(data.username || '')
      setBio(data.bio || '')
      setLocation(data.location || '')
      setAvatarUrl(data.avatar_url || null)
    }
    setLoading(false)
  }

  async function pickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Precisamos de acesso à galeria.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri)
    }
  }

  async function pickAvatarFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') return
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri)
    }
  }

  function handleAvatarPress() {
    Alert.alert('Alterar foto', 'Escolhe uma opção', [
      { text: 'Câmara', onPress: pickAvatarFromCamera },
      { text: 'Galeria', onPress: pickAvatar },
      { text: 'Cancelar', style: 'cancel' },
    ])
  }

  async function uploadAvatar(uri) {
    const { data: { user } } = await supabase.auth.getUser()
    const ext = uri.split('.').pop().toLowerCase().split('?')[0]
    const path = `${user.id}/avatar.${ext}`

    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' })
    const byteCharacters = atob(base64)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, byteArray, { contentType: `image/${ext}`, upsert: true })

    if (error) throw error

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    return publicUrl
  }

  async function handleSave() {
    if (!username.trim()) {
      Alert.alert('Erro', 'O username é obrigatório.')
      return
    }
    setShowConfirm(true)
  }

  async function handleConfirm() {
    if (!password.trim()) {
      Alert.alert('Erro', 'Introduz a tua password para confirmar.')
      return
    }

    setConfirmLoading(true)
    try {
      // Verificar password
      const { data: { user } } = await supabase.auth.getUser()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password,
      })

      if (authError) {
        Alert.alert('Erro', 'Password incorreta.')
        setConfirmLoading(false)
        return
      }

      // Verificar se username já existe (se mudou)
      if (username !== profile.username) {
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username.trim())
          .single()

        if (existing) {
          Alert.alert('Erro', 'Este username já está a ser usado.')
          setConfirmLoading(false)
          return
        }
      }

      // Upload avatar se mudou
      let newAvatarUrl = avatarUrl
      if (avatarUri) {
        newAvatarUrl = await uploadAvatar(avatarUri)
      }

      // Atualizar perfil
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim() || null,
          username: username.trim(),
          bio: bio.trim() || null,
          location: location.trim() || null,
          avatar_url: newAvatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (updateError) throw updateError

      Alert.alert('Sucesso', 'Perfil atualizado!', [
        { text: 'OK', onPress: () => router.back() }
      ])
    } catch (e) {
      Alert.alert('Erro', e.message)
    }
    setConfirmLoading(false)
    setShowConfirm(false)
    setPassword('')
  }

  if (loading) return <ActivityIndicator size="large" color="#1a3c2e" style={{ flex: 1 }} />

  const displayAvatar = avatarUri || avatarUrl

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView
        style={[styles.container, { paddingTop: insets.top }]}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#1a3c2e" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Editar perfil</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handleAvatarPress} style={styles.avatarWrapper}>
            {displayAvatar ? (
              <Image source={{ uri: displayAvatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarText}>
                  {fullName?.charAt(0)?.toUpperCase() || username?.charAt(0)?.toUpperCase() || '?'}
                </Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Toca para alterar a foto</Text>
        </View>

        {/* Campos */}
        <View style={styles.section}>
          <Text style={styles.label}>Nome completo</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="O teu nome"
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Username</Text>
          <View style={styles.inputWithPrefix}>
            <Text style={styles.prefix}>@</Text>
            <TextInput
              style={styles.inputPrefix}
              value={username}
              onChangeText={setUsername}
              placeholder="username"
              placeholderTextColor="#999"
              autoCapitalize="none"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Bio <Text style={styles.optional}>(opcional)</Text></Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={bio}
            onChangeText={setBio}
            placeholder="Fala um pouco sobre ti..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Localização <Text style={styles.optional}>(opcional)</Text></Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="ex: Porto, Portugal"
            placeholderTextColor="#999"
          />
        </View>

        {/* Guardar */}
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtnText}>Guardar alterações</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal de confirmação com password */}
      {showConfirm && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Confirmar alterações</Text>
            <Text style={styles.modalSubtitle}>Introduz a tua password para guardar as alterações.</Text>
            <TextInput
              style={styles.modalInput}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#999"
              secureTextEntry
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setShowConfirm(false); setPassword('') }}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleConfirm}
                disabled={confirmLoading}
              >
                {confirmLoading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalConfirmText}>Confirmar</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#eee' },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  avatarSection: { alignItems: 'center', paddingVertical: 24 },
  avatarWrapper: { position: 'relative' },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#e8f5e9' },
  avatarFallback: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#1a3c2e', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#e8f5e9' },
  avatarText: { fontSize: 40, color: '#fff', fontWeight: 'bold' },
  avatarEditBadge: { position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: '#1a3c2e', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  avatarHint: { fontSize: 12, color: '#888', marginTop: 8 },
  section: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8 },
  optional: { fontWeight: '400', color: '#aaa' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 15, color: '#333' },
  inputWithPrefix: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, overflow: 'hidden' },
  prefix: { paddingHorizontal: 12, fontSize: 15, color: '#888', backgroundColor: '#f5f5f5', paddingVertical: 12 },
  inputPrefix: { flex: 1, padding: 12, fontSize: 15, color: '#333' },
  textArea: { height: 80, textAlignVertical: 'top' },
  saveBtn: { margin: 16, backgroundColor: '#1a3c2e', borderRadius: 10, padding: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  modal: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 },
  modalSubtitle: { fontSize: 14, color: '#666', marginBottom: 16, lineHeight: 20 },
  modalInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 15, color: '#333', marginBottom: 16 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, alignItems: 'center' },
  modalCancelText: { color: '#555', fontSize: 15 },
  modalConfirmBtn: { flex: 1, backgroundColor: '#1a3c2e', borderRadius: 8, padding: 12, alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontSize: 15, fontWeight: '600' },
})