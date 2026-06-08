import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, ActivityIndicator, TextInput, Switch, Dimensions
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import MapView, { Marker } from 'react-native-maps'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '../../lib/supabase'

const { width } = Dimensions.get('window')

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
  const [species, setSpecies] = useState(null)
  const [validator, setValidator] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [activePhoto, setActivePhoto] = useState(0)

  const [description, setDescription] = useState('')
  const [suggestedSpecies, setSuggestedSpecies] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  useEffect(() => { fetchObservation() }, [id])

  async function fetchObservation() {
    setLoading(true)

    const { data: obs, error: obsError } = await supabase
      .from('observations_with_coords')
      .select('*')
      .eq('id', id)
      .single()

    const { data: photosData } = await supabase
      .from('photos')
      .select('*')
      .eq('observation_id', id)
      .order('order_index')

    if (obs?.species_id) {
      const { data: speciesData } = await supabase
        .from('species')
        .select('*')
        .eq('id', obs.species_id)
        .single()
      setSpecies(speciesData)
    }

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

    if (error) Alert.alert('Erro', error.message)
    else { setEditing(false); fetchObservation(); Alert.alert('Sucesso', 'Observação atualizada!') }
    setSaving(false)
  }

  async function handleDelete() {
    Alert.alert('Apagar observação', 'Tens a certeza? Esta ação não pode ser revertida.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar', style: 'destructive', onPress: async () => {
          for (const photo of photos) {
            await supabase.storage.from('fotosEspecie').remove([photo.storage_path])
          }
          await supabase.from('photos').delete().eq('observation_id', id)
          const { error } = await supabase.from('observations').delete().eq('id', id)
          if (error) Alert.alert('Erro', error.message)
          else router.back()
        }
      }
    ])
  }

  async function addPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') return
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 })
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
        for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i)
        const byteArray = new Uint8Array(byteNumbers)
        const { error: uploadError } = await supabase.storage.from('fotosEspecie').upload(path, byteArray, { contentType: `image/${ext}`, upsert: true })
        if (uploadError) throw uploadError
        const { data: { publicUrl } } = supabase.storage.from('fotosEspecie').getPublicUrl(path)
        await supabase.from('photos').insert({ observation_id: id, storage_path: path, url: publicUrl, is_primary: photos.length === 0, order_index: photos.length })
        fetchObservation()
      } catch (e) { Alert.alert('Erro', e.message) }
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

  const status = STATUS_CONFIG[observation.status] || STATUS_CONFIG.PENDING
  const canEdit = observation.status === 'PENDING' || observation.status === 'REJECTED'
  const primaryPhoto = photos.find(p => p.is_primary) || photos[0]
  const speciesName = species?.scientific_name || observation.suggested_species || 'A confirmar...'

  // Parse location from WKB — use lat/lng if available from view
  const hasLocation = observation.latitude != null && observation.longitude != null

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Foto principal grande */}
        <View style={styles.heroContainer}>
          {photos[activePhoto] ? (
            <Image source={{ uri: photos[activePhoto].url }} style={styles.heroImage} />
          ) : (
            <View style={styles.heroPlaceholder}>
              <Ionicons name="image-outline" size={60} color="#ccc" />
            </View>
          )}

          {/* Header overlay */}
          <View style={[styles.headerOverlay, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            {canEdit && !editing && (
              <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
                <Ionicons name="create-outline" size={22} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {/* Badge status */}
          <View style={[styles.heroBadge, { backgroundColor: status.bg }]}>
            <Ionicons name={status.icon} size={12} color={status.color} />
            <Text style={[styles.heroBadgeText, { color: status.color }]}>{status.label}</Text>
          </View>

          {/* Thumbnails */}
          {photos.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbsRow} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
              {photos.map((p, i) => (
                <TouchableOpacity key={p.id} onPress={() => setActivePhoto(i)}>
                  <Image source={{ uri: p.url }} style={[styles.thumb, activePhoto === i && styles.thumbActive]} />
                </TouchableOpacity>
              ))}
              {canEdit && editing && (
                <TouchableOpacity style={styles.addThumb} onPress={addPhoto}>
                  <Ionicons name="add" size={20} color="#999" />
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>

        {/* Nome + info */}
        <View style={styles.infoSection}>
          <Text style={styles.speciesName}>{speciesName}</Text>
          {species?.common_name_pt && <Text style={styles.commonName}>{species.common_name_pt}</Text>}
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={13} color="#888" />
            <Text style={styles.metaText}>
              {new Date(observation.observed_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })}
            </Text>
          </View>
        </View>

        {/* Descrição */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Descrição</Text>
          {editing ? (
            <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} multiline placeholderTextColor="#999" />
          ) : (
            <Text style={styles.sectionValue}>{observation.description}</Text>
          )}
        </View>

        {/* Espécie sugerida — só se não tiver espécie confirmada */}
        {!species && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Espécie sugerida</Text>
            {editing ? (
              <TextInput style={styles.input} value={suggestedSpecies} onChangeText={setSuggestedSpecies} placeholder="Nome da espécie..." placeholderTextColor="#999" />
            ) : (
              <Text style={styles.sectionValue}>{observation.suggested_species || <Text style={styles.noValue}>Não indicada</Text>}</Text>
            )}
          </View>
        )}

        {/* Classificação taxonómica */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Classificação Taxonómica</Text>
          {species ? (
            <View style={styles.taxGrid}>
              {[
                ['Filo', species.phylum],
                ['Div.', species.phylum],
                ['Classe', species.class],
                ['Ordem', species.order],
                ['Família', species.family],
                ['Género', species.genus],
              ].map(([label, value]) => value ? (
                <View key={label} style={styles.taxItem}>
                  <Text style={styles.taxLabel}>{label}</Text>
                  <Text style={styles.taxValue}>{value}</Text>
                </View>
              ) : null)}
              {species.scientific_name && (
                <View style={[styles.taxItem, { width: '100%' }]}>
                  <Text style={styles.taxLabel}>Nome científico</Text>
                  <Text style={[styles.taxValue, { fontStyle: 'italic' }]}>{species.scientific_name}</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.taxPending}>
              <Ionicons name="time-outline" size={24} color="#ccc" />
              <Text style={styles.taxPendingText}>Aguarda validação por um técnico</Text>
            </View>
          )}
        </View>

        {/* Localização */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Localização</Text>
          {hasLocation ? (
            <>
              <MapView
                style={styles.miniMap}
                initialRegion={{
                  latitude: observation.latitude,
                  longitude: observation.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
              >
                <Marker coordinate={{ latitude: observation.latitude, longitude: observation.longitude }} pinColor="#1a3c2e" />
              </MapView>
              <Text style={styles.coordsText}>
                {observation.latitude.toFixed(4)}° N, {Math.abs(observation.longitude).toFixed(4)}° W
              </Text>
            </>
          ) : (
            <Text style={styles.noValue}>Localização não disponível</Text>
          )}
        </View>

        {/* Observação pública */}
        <View style={[styles.section, styles.switchRow]}>
          <View>
            <Text style={styles.sectionLabel}>Observação pública</Text>
            <Text style={styles.sectionValueSmall}>Visível após validação</Text>
          </View>
          <Switch
            value={isPublic}
            onValueChange={async (val) => {
              setIsPublic(val)
              if (!editing) {
                await supabase.from('observations').update({ is_public: val }).eq('id', id)
              }
            }}
            trackColor={{ false: '#ddd', true: '#1a3c2e' }}
            thumbColor="#fff"
          />
        </View>

        {/* Validado por */}
        {observation.status === 'VALIDATED' && (
          <View style={styles.validatedBy}>
            <View style={styles.validatedAvatar}>
              <Ionicons name="person" size={14} color="#fff" />
            </View>
            <Text style={styles.validatedText}>
              Validado por um técnico · {new Date(observation.updated_at).toLocaleDateString('pt-PT')}
            </Text>
          </View>
        )}

        {/* Botões */}
        {canEdit && (
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
    </View>
  )
}

const styles = StyleSheet.create({
  heroContainer: { width, height: 280, backgroundColor: '#f0f0f0', position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0' },
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  editBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  heroBadge: { position: 'absolute', bottom: 50, left: 16, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  heroBadgeText: { fontSize: 12, fontWeight: '600' },
  thumbsRow: { position: 'absolute', bottom: 8, left: 0, right: 0 },
  thumb: { width: 44, height: 44, borderRadius: 6, borderWidth: 2, borderColor: 'transparent' },
  thumbActive: { borderColor: '#fff' },
  addThumb: { width: 44, height: 44, borderRadius: 6, borderWidth: 2, borderColor: '#fff', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  infoSection: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  speciesName: { fontSize: 22, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 4 },
  commonName: { fontSize: 15, color: '#666', marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 13, color: '#888' },
  section: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  sectionLabel: { fontSize: 12, color: '#888', marginBottom: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionValue: { fontSize: 15, color: '#333', lineHeight: 22 },
  sectionValueSmall: { fontSize: 12, color: '#999', marginTop: 2 },
  noValue: { color: '#bbb', fontStyle: 'italic', fontSize: 14 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 14, color: '#333' },
  textArea: { height: 100, textAlignVertical: 'top' },
  taxGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  taxItem: { width: '45%', backgroundColor: '#f9f9f9', borderRadius: 8, padding: 10 },
  taxLabel: { fontSize: 10, color: '#aaa', fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  taxValue: { fontSize: 13, color: '#333', fontWeight: '500' },
  taxPending: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  taxPendingText: { fontSize: 13, color: '#bbb' },
  miniMap: { height: 140, borderRadius: 10, marginBottom: 8 },
  coordsText: { fontSize: 12, color: '#888' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  validatedBy: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  validatedAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1a3c2e', justifyContent: 'center', alignItems: 'center' },
  validatedText: { fontSize: 13, color: '#555' },
  actions: { padding: 16, gap: 10 },
  saveBtn: { backgroundColor: '#1a3c2e', borderRadius: 10, padding: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  cancelBtn: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, alignItems: 'center' },
  cancelBtnText: { color: '#555', fontSize: 15 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#dc2626', borderRadius: 10, padding: 14 },
  deleteBtnText: { color: '#dc2626', fontWeight: '600', fontSize: 15 },
})