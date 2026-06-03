import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, ActivityIndicator, TextInput, Switch
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { decode } from 'base64-arraybuffer'
import { supabase } from '../../lib/supabase'

const STATUS_CONFIG = {
  VALIDATED: { label: 'Validada', color: '#1a3c2e', bg: '#e8f5e9', icon: 'checkmark-circle' },
  PENDING: { label: 'Pendente', color: '#b45309', bg: '#fef3c7', icon: 'time' },
  REJECTED: { label: 'Rejeitada', color: '#dc2626', bg: '#fee2e2', icon: 'close-circle' },
}

export default function ObservationDetail() {
  const { id } = useLocalSearchParams()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [observation, setObservation] = useState(null)
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)

  // Campos editáveis
  const [description, setDescription] = useState('')
  const [suggestedSpecies, setSuggestedSpecies] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  useEffect(() => { fetchObservation() }, [id])

  async function fetchObservation() {
    setLoading(true)

    const { data: obs, error } = await supabase
      .from('observations')
      .select('*')
      .eq('id', id)
      .single()

    const { data: photosData } = await supabase
      .from('photos')
      .select('*')
      .eq('observation_id', id)
      .order('order_index')

    if (obs) {
      setObservation(obs)
      setDescription(obs.description || '')
      setSuggestedSpecies(obs.suggested_species || '')
      setIsPublic(obs.is_public ?? true)
    }
    if (photosData) setPhotos(photosData)
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase
      .from('observations')
      .update({
        description: description.trim(),
        suggested_species: suggestedSpecies.trim() || null,
        is_public: isPublic,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      Alert.alert('Erro', error.message)
    } else {
      setEditing(false)
      fetchObservation()
      Alert.alert('Sucesso', 'Observação atualizada!')
    }
    setSaving(false)
  }

  async function handleTogglePublic(nextValue) {
    if (canEditFields && editing) {
      setIsPublic(nextValue)
      return
    }

    const previousValue = isPublic
    setIsPublic(nextValue)
    setSaving(true)
    const { error } = await supabase
      .from('observations')
      .update({
        is_public: nextValue,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      setIsPublic(previousValue)
      Alert.alert('Erro', error.message)
    } else {
      setObservation(prev => prev ? { ...prev, is_public: nextValue } : prev)
    }
    setSaving(false)
  }

  async function handleDelete() {
    Alert.alert(
      'Apagar observação',
      'Tens a certeza? Esta ação não pode ser revertida.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar', style: 'destructive', onPress: async () => {
            // Apagar fotos do storage
            for (const photo of photos) {
              await supabase.storage.from('fotosEspecie').remove([photo.storage_path])
            }
            // Apagar registos de fotos
            await supabase.from('photos').delete().eq('observation_id', id)
            // Apagar observação
            const { error } = await supabase.from('observations').delete().eq('id', id)
            if (error) {
              Alert.alert('Erro', error.message)
            } else {
              router.back()
            }
          }
        }
      ]
    )
  }

  async function addPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') return

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    })

    if (!result.canceled) {
      setSaving(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const uri = result.assets[0].uri
        const ext = uri.split('.').pop().toLowerCase().split('?')[0]
        const path = `${user.id}/${id}/${Date.now()}.${ext}`

        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' })
        const byteCharacters = atob(base64)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)

        const { error: uploadError } = await supabase.storage
          .from('fotosEspecie')
          .upload(path, byteArray, { contentType: `image/${ext}`, upsert: true })

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage.from('fotosEspecie').getPublicUrl(path)

        await supabase.from('photos').insert({
          observation_id: id,
          storage_path: path,
          url: publicUrl,
          is_primary: photos.length === 0,
          order_index: photos.length,
        })

        fetchObservation()
      } catch (e) {
        Alert.alert('Erro', e.message)
      }
      setSaving(false)
    }
  }

  async function deletePhoto(photo) {
    Alert.alert('Apagar foto', 'Tens a certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar', style: 'destructive', onPress: async () => {
          await supabase.storage.from('fotosEspecie').remove([photo.storage_path])
          await supabase.from('photos').delete().eq('id', photo.id)
          fetchObservation()
        }
      }
    ])
  }

  if (loading) return <ActivityIndicator size="large" color="#1a3c2e" style={{ flex: 1 }} />
  if (!observation) return <ActivityIndicator size="large" color="#1a3c2e" style={{ flex: 1 }} />

  const status = STATUS_CONFIG[observation?.status] || STATUS_CONFIG.PENDING
  const canEditFields = observation?.status === 'PENDING' || observation?.status === 'REJECTED'
  const canTogglePublic = !!observation

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={{ paddingBottom: 40 }}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1a3c2e" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalhe observação</Text>
        {canEditFields && !editing && (
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Ionicons name="create-outline" size={24} color="#1a3c2e" />
          </TouchableOpacity>
        )}
        {!canEditFields && <View style={{ width: 24 }} />}
      </View>

      {/* Fotos */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosRow} contentContainerStyle={{ padding: 16, gap: 10 }}>
        {photos.map((photo, i) => (
          <View key={photo.id} style={styles.photoThumb}>
            <Image source={{ uri: photo.url }} style={styles.photoImage} />
            {photo.is_primary && (
              <View style={styles.primaryBadge}>
                <Text style={styles.primaryBadgeText}>Principal</Text>
              </View>
            )}
            {canEditFields && editing && (
              <TouchableOpacity style={styles.deletePhotoBtn} onPress={() => deletePhoto(photo)}>
                <Ionicons name="close-circle" size={22} color="#dc2626" />
              </TouchableOpacity>
            )}
          </View>
        ))}
        {canEditFields && editing && (
          <TouchableOpacity style={styles.addPhotoBtn} onPress={addPhoto}>
            <Ionicons name="add" size={28} color="#999" />
          </TouchableOpacity>
        )}
        {photos.length === 0 && !editing && (
          <View style={styles.noPhoto}>
            <Ionicons name="image-outline" size={40} color="#ccc" />
            <Text style={styles.noPhotoText}>Sem fotos</Text>
          </View>
        )}
      </ScrollView>

      {/* Status badge */}
      <View style={styles.statusRow}>
        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          <Ionicons name={status.icon} size={14} color={status.color} />
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
        <Text style={styles.dateText}>
          {new Date(observation.observed_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>

      {/* Espécie sugerida */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Espécie sugerida</Text>
        {editing ? (
          <TextInput
            style={styles.input}
            value={suggestedSpecies}
            onChangeText={setSuggestedSpecies}
            placeholder="Nome da espécie..."
            placeholderTextColor="#999"
          />
        ) : (
          <Text style={styles.sectionValue}>
            {observation.suggested_species || <Text style={styles.noValue}>Não indicada</Text>}
          </Text>
        )}
      </View>

      {/* Descrição */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Descrição</Text>
        {editing ? (
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            placeholderTextColor="#999"
          />
        ) : (
          <Text style={styles.sectionValue}>{observation.description}</Text>
        )}
      </View>

      {/* Localização */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Localização</Text>
        <Text style={styles.sectionValue}>
          {observation.latitude && observation.longitude
            ? `${observation.latitude?.toFixed(5)}, ${observation.longitude?.toFixed(5)}`
            : 'Não disponível'}
        </Text>
      </View>

      {/* Observação pública */}
      <View style={[styles.section, styles.switchRow]}>
        <Text style={styles.sectionLabel}>Observação pública</Text>
        <Switch
          value={isPublic}
          onValueChange={canTogglePublic ? handleTogglePublic : undefined}
          disabled={!canTogglePublic || saving}
          trackColor={{ false: '#ddd', true: '#1a3c2e' }}
          thumbColor="#fff"
        />
      </View>

      {/* Botões de ação */}
      {canEditFields && (
        <View style={styles.actions}>
          {editing ? (
            <>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Guardar alterações</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setEditing(false); fetchObservation() }}>
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={18} color="#dc2626" />
              <Text style={styles.deleteBtnText}>Apagar observação</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  photosRow: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  photoThumb: { width: 120, height: 120, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  photoImage: { width: 120, height: 120 },
  primaryBadge: { position: 'absolute', bottom: 6, left: 6, backgroundColor: '#1a3c2e', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  primaryBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  deletePhotoBtn: { position: 'absolute', top: 4, right: 4, backgroundColor: '#fff', borderRadius: 11 },
  addPhotoBtn: { width: 120, height: 120, borderRadius: 10, borderWidth: 2, borderColor: '#ddd', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  noPhoto: { width: 120, height: 120, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 10 },
  noPhotoText: { fontSize: 12, color: '#ccc', marginTop: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 13, fontWeight: '600' },
  dateText: { fontSize: 12, color: '#888' },
  section: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  sectionLabel: { fontSize: 12, color: '#888', marginBottom: 6, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionValue: { fontSize: 15, color: '#333', lineHeight: 22 },
  noValue: { color: '#bbb', fontStyle: 'italic' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 14, color: '#333' },
  textArea: { height: 100, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { padding: 16, gap: 10 },
  saveBtn: { backgroundColor: '#1a3c2e', borderRadius: 10, padding: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  cancelBtn: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, alignItems: 'center' },
  cancelBtnText: { color: '#555', fontSize: 15 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#dc2626', borderRadius: 10, padding: 14 },
  deleteBtnText: { color: '#dc2626', fontWeight: '600', fontSize: 15 },
})