import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, TextInput, Switch, Dimensions
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import MapView, { Marker } from 'react-native-maps'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '../../lib/supabase'
import CustomAlert from '../_components/CustomAlert'

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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [activePhoto, setActivePhoto] = useState(0)
  const [comments, setComments] = useState([])
  const [likes, setLikes] = useState([])
  const [audit, setAudit] = useState(null)

  const [description, setDescription] = useState('')
  const [suggestedSpecies, setSuggestedSpecies] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  // Novo estado para o texto do comentário que está a ser escrito
  const [newCommentText, setNewCommentText] = useState('')

  // Estado para controlar as configurações do Alerta Customizado
  const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', buttons: [] })

  useEffect(() => { 
    if (id) {
      fetchObservation() 
    }
  }, [id])

  async function fetchObservation() {
    setLoading(true)

    // Forçar id limpo caso venha como Array pelo Expo Router
    const cleanId = Array.isArray(id) ? id[0] : id

    const { data: obs } = await supabase
      .from('observations_with_coords')
      .select('*')
      .eq('id', cleanId)
      .single()

    const { data: photosData } = await supabase
      .from('photos')
      .select('*')
      .eq('observation_id', cleanId)
      .order('order_index')

    if (obs?.species_id) {
      const { data: speciesData } = await supabase
        .from('species')
        .select(`
          *,
          genus:genus_id (
            name,
            family:family_id (
              name,
              order:order_id (
                name,
                class:class_id (
                  name,
                  phylum:phylum_id (
                    name,
                    kingdom
                  )
                )
              )
            )
          )
        `)
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

    if (obs?.status === 'VALIDATED' || obs?.status === 'REJECTED') {
      const { data: auditData } = await supabase
        .from('observation_audit')
        .select('action, created_at, rejection_reason, user_id')
        .eq('observation_id', cleanId)
        .in('action', ['VALIDATED', 'REJECTED'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (auditData) {
        const { data: techProfile } = await supabase
          .from('profiles')
          .select('username, full_name')
          .eq('id', auditData.user_id)
          .single()

        setAudit({ ...auditData, technician: techProfile })
      }
    }

    const { data: commentsData } = await supabase
      .from('comments')
      .select('id, content, created_at, user:user_id (username, avatar_url, full_name)')
      .eq('observation_id', cleanId)
      .order('created_at', { ascending: true })

    const { data: likesData } = await supabase
      .from('likes')
      .select('created_at, user:user_id (username, avatar_url, full_name)')
      .eq('observation_id', cleanId)
      .order('created_at', { ascending: false })

    if (commentsData) setComments(commentsData)
    if (likesData) setLikes(likesData)
    setLoading(false)
  }

  // Função para submeter um novo comentário
  async function handleSendComment() {
    if (!newCommentText.trim()) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setAlertConfig({
          visible: true,
          title: 'Aviso',
          message: 'Inicia sessão para comentar.',
          buttons: [{ text: 'OK' }]
        })
        return
      }

      const cleanId = Array.isArray(id) ? id[0] : id

      const { error } = await supabase
        .from('comments')
        .insert([
          {
            observation_id: cleanId,
            user_id: user.id,
            content: newCommentText.trim()
          }
        ])

      if (error) throw error

      setNewCommentText('')
      // Recarrega os dados para mostrar o comentário inserido instantaneamente
      fetchObservation()
    } catch (err) {
      console.error('Erro ao enviar comentário:', err)
      setAlertConfig({
        visible: true,
        title: 'Erro',
        message: 'Não foi possível enviar o comentário.',
        buttons: [{ text: 'OK' }]
      })
    }
  }

  async function pickFromGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') return
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 })
    if (!result.canceled) {
      handleUploadAndInsert(result.assets[0].uri)
    }
  }

  async function pickFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') return
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 })
    if (!result.canceled) {
      handleUploadAndInsert(result.assets[0].uri)
    }
  }

  async function handleUploadAndInsert(uri) {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const ext = uri.split('.').pop().toLowerCase().split('?')[0]
      const cleanId = Array.isArray(id) ? id[0] : id
      const path = `${user.id}/${cleanId}/${Date.now()}.${ext}`
      
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' })
      const byteCharacters = atob(base64)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i)
      const byteArray = new Uint8Array(byteNumbers)
      
      const { error: uploadError } = await supabase.storage.from('fotosEspecie').upload(path, byteArray, { contentType: `image/${ext}`, upsert: true })
      if (uploadError) throw uploadError
      
      const { data: { publicUrl } } = supabase.storage.from('fotosEspecie').getPublicUrl(path)
      
      await supabase.from('photos').insert({ 
        observation_id: cleanId, 
        storage_path: path, 
        url: publicUrl, 
        is_primary: photos.length === 0, 
        order_index: photos.length 
      })
      
      const { data: newPhotos } = await supabase.from('photos').select('*').eq('observation_id', cleanId).order('order_index')
      if (newPhotos) {
        setPhotos(newPhotos)
        setActivePhoto(newPhotos.length - 1)
      }
    } catch (e) { 
      setAlertConfig({
        visible: true,
        title: 'Erro',
        message: e.message,
        buttons: [{ text: 'OK' }]
      })
    }
    setSaving(false)
  }

  async function deletePhoto(photo, index) {
    setAlertConfig({
      visible: true,
      title: 'Eliminar foto',
      message: 'Tens a certeza que queres remover esta imagem?',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: async () => {
            setSaving(true)
            try {
              const { error: storageError } = await supabase.storage
                .from('fotosEspecie')
                .remove([photo.storage_path])

              if (storageError) console.log("Aviso Storage:", storageError.message)

              const { error: dbError } = await supabase
                .from('photos')
                .delete()
                .eq('storage_path', photo.storage_path)

              if (dbError) throw dbError

              const cleanId = Array.isArray(id) ? id[0] : id
              const { data: remainingPhotos } = await supabase
                .from('photos')
                .select('*')
                .eq('observation_id', cleanId)
                .order('order_index')
                
              let updatedPhotos = remainingPhotos || []

              if (photo.is_primary && updatedPhotos.length > 0) {
                const nextPrimaryPath = updatedPhotos[0].storage_path
                
                const { error: updateError } = await supabase
                  .from('photos')
                  .update({ is_primary: true })
                  .eq('storage_path', nextPrimaryPath)

                if (!updateError) {
                  updatedPhotos[0].is_primary = true
                }
              }

              if (activePhoto >= updatedPhotos.length) {
                setActivePhoto(Math.max(0, updatedPhotos.length - 1))
              } else if (activePhoto === index) {
                setActivePhoto(0)
              }
              
              setPhotos(updatedPhotos)
              
              setAlertConfig({
                visible: true,
                title: 'Sucesso',
                message: 'Foto removida com sucesso.',
                buttons: [{ text: 'OK' }]
              })
            } catch (e) {
              setAlertConfig({
                visible: true,
                title: 'Erro ao eliminar',
                message: e.message,
                buttons: [{ text: 'OK' }]
              })
            }
            setSaving(false)
          }
        }
      ]
    })
  }

  async function handleSave() {
    if (!description.trim()) {
      setAlertConfig({
        visible: true,
        title: 'Erro',
        message: 'A descrição é obrigatória.',
        buttons: [{ text: 'OK' }]
      })
      return
    }
    if (photos.length === 0) {
      setAlertConfig({
        visible: true,
        title: 'Erro',
        message: 'Precisas de incluir pelo menos 1 fotografia para validação.',
        buttons: [{ text: 'OK' }]
      })
      return
    }

    setSaving(true)
    const nextStatus = observation.status === 'REJECTED' ? 'PENDING' : observation.status
    const cleanId = Array.isArray(id) ? id[0] : id

    const { error } = await supabase
      .from('observations')
      .update({
        description: description.trim(),
        suggested_species: suggestedSpecies.trim() || null,
        is_public: isPublic,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cleanId)

    if (error) {
      setAlertConfig({
        visible: true,
        title: 'Erro',
        message: error.message,
        buttons: [{ text: 'OK' }]
      })
    } else { 
      setEditing(false)
      fetchObservation() 
      setAlertConfig({
        visible: true,
        title: 'Sucesso',
        message: observation.status === 'REJECTED' 
          ? 'Observação re-enviada para avaliação com sucesso!' 
          : 'Observação atualizada!',
        buttons: [{ text: 'Excelente' }]
      })
    }
    setSaving(false)
  }

  async function handleDelete() {
    setAlertConfig({
      visible: true,
      title: 'Eliminar observação',
      message: 'Tens a certeza? Esta ação vai eliminar permanentemente a observação e todo o seu histórico.',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Apagar', 
          style: 'destructive', 
          onPress: async () => {
            setSaving(true)
            try {
              const cleanId = Array.isArray(id) ? id[0] : id

              await supabase
                .from('observation_audit')
                .delete()
                .eq('observation_id', cleanId)

              for (const photo of photos) {
                await supabase.storage.from('fotosEspecie').remove([photo.storage_path])
              }
              await supabase.from('photos').delete().eq('observation_id', cleanId)

              await supabase.from('likes').delete().eq('observation_id', cleanId)
              await supabase.from('comments').delete().eq('observation_id', cleanId)

              const { error } = await supabase
                .from('observations')
                .delete()
                .eq('id', cleanId)

              if (error) throw error

              setAlertConfig({
                visible: true,
                title: 'Sucesso',
                message: 'Observação eliminada com sucesso.',
                buttons: [{ text: 'OK', onPress: () => router.back() }]
              })
            } catch (error) {
              setAlertConfig({
                visible: true,
                title: 'Erro ao eliminar',
                message: error.message,
                buttons: [{ text: 'OK' }]
              })
            }
            setSaving(false)
          }
        }
      ]
    })
  }

  if (loading) return <ActivityIndicator size="large" color="#1a3c2e" style={{ flex: 1 }} />
  if (!observation) return <ActivityIndicator size="large" color="#1a3c2e" style={{ flex: 1 }} />

  const status = STATUS_CONFIG[observation.status] || STATUS_CONFIG.PENDING
  const canEdit = observation.status === 'PENDING' || observation.status === 'REJECTED'
  const speciesName = species?.scientific_name || observation.suggested_species || 'A confirmar...'
  const hasLocation = observation.latitude != null && observation.longitude != null

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Foto principal grande */}
        <View style={styles.heroContainer}>
          {photos[activePhoto] ? (
            <View style={{ width: '100%', height: '100%' }}>
              <Image source={{ uri: photos[activePhoto].url }} style={styles.heroImage} />
              {editing && (
                <TouchableOpacity 
                  style={styles.deletePhotoOverlay} 
                  onPress={() => deletePhoto(photos[activePhoto], activePhoto)}
                >
                  <Ionicons name="trash-outline" size={20} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Remover foto</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.heroPlaceholder}>
              <Ionicons name="image-outline" size={60} color="#ccc" />
              {editing && <Text style={{ color: '#999', marginTop: 8 }}>Adiciona fotos abaixo</Text>}
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
          {!editing && (
            <View style={[styles.heroBadge, { backgroundColor: status.bg }]}>
              <Ionicons name={status.icon} size={12} color={status.color} />
              <Text style={[styles.heroBadgeText, { color: status.color }]}>{status.label}</Text>
            </View>
          )}
        </View>

        {/* Linha de Miniaturas e Botões */}
        <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
            {photos.map((p, i) => (
              <TouchableOpacity key={p.id} onPress={() => setActivePhoto(i)} style={{ position: 'relative' }}>
                <Image source={{ uri: p.url }} style={[styles.thumb, activePhoto === i && styles.thumbActive]} />
                {i === 0 && (
                  <View style={styles.miniPrimaryBadge}><Text style={{ color: '#fff', fontSize: 7 }}>★</Text></View>
                )}
              </TouchableOpacity>
            ))}
            
            {editing && photos.length < 5 && (
              <TouchableOpacity style={styles.addThumb} onPress={pickFromGallery}>
                <Ionicons name="add" size={20} color="#999" />
              </TouchableOpacity>
            )}
          </ScrollView>

          {editing && (
            <View style={styles.photoActionRow}>
              <TouchableOpacity style={styles.miniPhotoBtn} onPress={pickFromCamera}>
                <Ionicons name="camera-outline" size={16} color="#fff" />
                <Text style={styles.miniPhotoBtnText}>Câmara</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.miniPhotoBtn, styles.miniPhotoBtnOutline]} onPress={pickFromGallery}>
                <Ionicons name="images-outline" size={16} color="#1a3c2e" />
                <Text style={[styles.miniPhotoBtnText, { color: '#1a3c2e' }]}>Galeria</Text>
              </TouchableOpacity>
            </View>
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

        {/* Avaliação do Técnico */}
        {(observation.status === 'VALIDATED' || observation.status === 'REJECTED') && audit && (
          <View style={[styles.section, { backgroundColor: observation.status === 'VALIDATED' ? '#f4f9f4' : '#fff5f5' }]}>
            <Text style={styles.sectionLabel}>Avaliação Técnico ({status.label})</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <View style={[styles.validatedAvatar, { backgroundColor: status.color }]}>
                <Ionicons name="person" size={14} color="#fff" />
              </View>
              <View>
                <Text style={styles.validatedText}>
                  {observation.status === 'VALIDATED' ? 'Validada' : 'Rejeitada'} por: <Text style={{ fontWeight: 'bold' }}>{audit.technician?.full_name || audit.technician?.username || 'Técnico'}</Text>
                </Text>
                <Text style={styles.validatedDate}>Em {new Date(audit.created_at).toLocaleDateString('pt-PT')}</Text>
              </View>
            </View>
            {observation.status === 'REJECTED' && audit.rejection_reason && (
              <View style={styles.rejectionBox}>
                <Ionicons name="information-circle-outline" size={16} color="#dc2626" />
                <Text style={styles.rejectionText}><Text style={{ fontWeight: '700' }}>Motivo: </Text>{audit.rejection_reason}</Text>
              </View>
            )}
          </View>
        )}

        {/* Descrição */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Descrição</Text>
          {editing ? (
            <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} multiline placeholderTextColor="#999" />
          ) : (
            <Text style={styles.sectionValue}>{observation.description}</Text>
          )}
        </View>

        {/* Espécie sugerida */}
        {(!species || editing) && (
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
        {!editing && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Classificação Taxonómica</Text>
            {species ? (
              <View style={styles.taxGrid}>
                {[
                  ['Filo', species.genus?.family?.order?.class?.phylum?.name],
                  ['Classe', species.genus?.family?.order?.class?.name],
                  ['Ordem', species.genus?.family?.order?.name],
                  ['Família', species.genus?.family?.name],
                  ['Género', species.genus?.name],
                ].filter(([_, val]) => val).map(([label, value]) => (
                  <View key={label} style={styles.taxItem}>
                    <Text style={styles.taxLabel}>{label}</Text>
                    <Text style={styles.taxValue}>{value}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.taxPending}>
                <Ionicons name="time-outline" size={24} color="#ccc" />
                <Text style={styles.taxPendingText}>Aguarda validação por um técnico</Text>
              </View>
            )}
          </View>
        )}

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

        {/* Likes */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Gostos ({likes.length})</Text>
          {likes.length === 0 ? (
            <Text style={styles.noValue}>Ainda sem likes</Text>
          ) : (
            <View style={styles.likesRow}>
              {likes.map((like, index) => (
                <View key={like.user?.id || index} style={styles.likeAvatar}>
                  {like.user?.avatar_url ? (
                  <Image source={{ uri: like.user.avatar_url }} style={styles.likeAvatarImage} />
                  ) : (
                    <Text style={styles.likeInitialText}>
                      {like.user?.username?.charAt(0).toUpperCase() || 'U'}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ====== NOVA SECÇÃO DE COMENTÁRIOS ADICIONADA ====== */}
        {!editing && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Comentários ({comments.length})</Text>
            
            {/* Lista dos Comentários existentes */}
            {comments.length === 0 ? (
              <Text style={[styles.noValue, { marginBottom: 10 }]}>Nenhum comentário ainda. Sê o primeiro!</Text>
            ) : (
              comments.map((item) => (
                <View key={item.id} style={styles.commentRow}>
                  <View style={styles.commentAvatar}>
                    {item.user?.avatar_url ? (
                      <Image source={{ uri: item.user.avatar_url }} style={{ width: '100%', height: '100%', borderRadius: 14 }} />
                    ) : (
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                        {item.user?.username?.charAt(0).toUpperCase() || 'U'}
                      </Text>
                    )}
                  </View>
                  <View style={styles.commentBubble}>
                    <Text style={styles.commentUser}>@{item.user?.username || 'utilizador'}</Text>
                    <Text style={styles.commentText}>{item.content}</Text>
                  </View>
                </View>
              ))
            )}

            {/* Input de escrita para Novo Comentário */}
            <View style={styles.commentInputBox}>
              <TextInput
                style={styles.commentInput}
                placeholder="Escreve um comentário..."
                placeholderTextColor="#aaa"
                value={newCommentText}
                onChangeText={setNewCommentText}
              />
              <TouchableOpacity onPress={handleSendComment} style={styles.commentSendBtn}>
                <Ionicons name="send" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Botões de Ação */}
        {canEdit && (
          <View style={styles.actions}>
            {editing ? (
              <>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>
                    {observation.status === 'REJECTED' ? 'Submeter para Nova Avaliação' : 'Guardar alterações'}
                  </Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setEditing(false); fetchObservation() }} disabled={saving}>
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

      {/* Alerta Customizado Centralizado para todo o ecrã */}
      <CustomAlert 
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  heroContainer: { width, height: 280, backgroundColor: '#f0f0f0', position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f0f0' },
  headerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8, zIndex: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  editBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  heroBadge: { position: 'absolute', bottom: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  heroBadgeText: { fontSize: 12, fontWeight: '600' },
  thumb: { width: 50, height: 50, borderRadius: 6, borderWidth: 2, borderColor: '#eee' },
  thumbActive: { borderColor: '#1a3c2e' },
  miniPrimaryBadge: { position: 'absolute', bottom: 2, left: 2, backgroundColor: '#1a3c2e', width: 12, height: 12, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  deletePhotoOverlay: { position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(220,38,38,0.85)', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addThumb: { width: 50, height: 50, borderRadius: 6, borderWidth: 2, borderColor: '#ccc', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: '#fafafa' },
  photoActionRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 10 },
  miniPhotoBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a3c2e', borderRadius: 6, padding: 8, gap: 6 },
  miniPhotoBtnOutline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#1a3c2e' },
  miniPhotoBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  rejectionBox: { flexDirection: 'row', gap: 8, backgroundColor: '#fee2e2', padding: 12, borderRadius: 8, alignItems: 'flex-start', marginTop: 8 },
  rejectionText: { flex: 1, fontSize: 14, color: '#dc2626', lineHeight: 20 },
  infoSection: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  speciesName: { fontSize: 22, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 4 },
  commonName: { fontSize: 15, color: '#666', marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 13, color: '#888' },
  section: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  sectionLabel: { fontSize: 12, color: '#888', marginBottom: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionValue: { fontSize: 15, color: '#333', lineHeight: 22 },
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
  likesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  likeAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1a3c2e', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  likeAvatarImage: { width: '100%', height: '100%' },
  likeInitialText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  validatedBy: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  validatedAvatar: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  validatedText: { fontSize: 13, color: '#555' },
  validatedDate: { fontSize: 11, color: '#aaa', marginTop: 2 },
  actions: { padding: 16, gap: 10 },
  saveBtn: { backgroundColor: '#1a3c2e', borderRadius: 10, padding: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  cancelBtn: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, alignItems: 'center' },
  cancelBtnText: { color: '#555', fontSize: 15 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#dc2626', borderRadius: 10, padding: 14 },
  deleteBtnText: { color: '#dc2626', fontWeight: '600', fontSize: 15 },

  // Estilos dedicados da nova secção de comentários
  commentRow: { flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'flex-start' },
  commentAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1a3c2e', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  commentBubble: { flex: 1, backgroundColor: '#f4f6f4', padding: 10, borderRadius: 12 },
  commentUser: { fontSize: 12, fontWeight: 'bold', color: '#1a3c2e', marginBottom: 2 },
  commentText: { fontSize: 13, color: '#333', lineHeight: 18 },
  commentInputBox: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 13, color: '#333', backgroundColor: '#fff' },
  commentSendBtn: { backgroundColor: '#1a3c2e', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' }
})