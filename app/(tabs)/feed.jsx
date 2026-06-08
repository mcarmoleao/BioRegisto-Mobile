import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Image, Alert,
  TextInput, ActivityIndicator
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { StatusBar } from 'expo-status-bar'

const FILTERS = ['Todos', 'Animais', 'Plantas', 'Fungos']
const KINGDOM_MAP = { 'Animais': 'ANIMALIA', 'Plantas': 'PLANTAE', 'Fungos': 'FUNGI' }

export default function Feed() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [observations, setObservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('Todos')
  const [currentUserId, setCurrentUserId] = useState(null)
  const [activeCommentId, setActiveCommentId] = useState(null)
  const [commentText, setCommentText] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [likeLoadingIds, setLikeLoadingIds] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    fetchObservations()
    fetchUnreadCount()
  }, [activeFilter])  

  useFocusEffect(
    useCallback(() => {
      fetchObservations()
    }, [activeFilter])
  )

  async function fetchUnreadCount() {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)
    setUnreadCount(count || 0)
  }

  async function fetchObservations() {
    setLoading(true)
    const { data: authData } = await supabase.auth.getUser()
    setCurrentUserId(authData?.user?.id || null)

    let query = supabase
      .from('observations')
      .select(`
        id, description, observed_at, suggested_species, status, is_public,
        species:species_id (scientific_name, common_name_pt, kingdom),
        user:user_id (username, avatar_url),
        photos (url, is_primary),
        likes (user_id),
        comments (id)
      `)
      .eq('status', 'VALIDATED')
      .eq('is_public', true)
      .order('observed_at', { ascending: false })

    if (activeFilter !== 'Todos') {
      query = query.eq('species.kingdom', KINGDOM_MAP[activeFilter])
    }

    const { data, error } = await query
    if (!error) {
      // Safety guard to ensure feed only shows public validated observations.
      const visible = (data || []).filter(obs => obs.status === 'VALIDATED' && obs.is_public === true)
      setObservations(visible)
    }
    setLoading(false)
  }

  async function toggleLike(observation) {
    if (!currentUserId || likeLoadingIds.includes(observation.id)) return

    const alreadyLiked = observation.likes?.some(like => like.user_id === currentUserId)
    let previousLikes = observation.likes || []

    setLikeLoadingIds(prev => [...prev, observation.id])
    setObservations(prev => prev.map(obs => {
      if (obs.id !== observation.id) return obs

      const currentLikes = obs.likes || []
      previousLikes = currentLikes
      const nextLikes = alreadyLiked
        ? currentLikes.filter(like => like.user_id !== currentUserId)
        : [...currentLikes, { user_id: currentUserId }]

      return { ...obs, likes: nextLikes }
    }))

    const query = alreadyLiked
      ? supabase
        .from('likes')
        .delete()
        .eq('observation_id', observation.id)
        .eq('user_id', currentUserId)
      : supabase
        .from('likes')
        .insert({ observation_id: observation.id, user_id: currentUserId })

    const { error } = await query

    if (error) {
      // Roll back optimistic update if persistence fails.
      setObservations(prev => prev.map(obs => (
        obs.id === observation.id ? { ...obs, likes: previousLikes } : obs
      )))
      Alert.alert('Erro', 'Não foi possível atualizar o like.')
    }

    setLikeLoadingIds(prev => prev.filter(id => id !== observation.id))
  }

  async function submitComment(observationId) {
    const content = commentText.trim()
    if (!content || !currentUserId || actionLoading) return

    setActionLoading(true)
    const { error } = await supabase
      .from('comments')
      .insert({
        observation_id: observationId,
        user_id: currentUserId,
        content,
      })

    if (!error) {
      setCommentText('')
      setActiveCommentId(null)
      await fetchObservations()
    }
    setActionLoading(false)
  }

  const filtered = observations.filter(obs => {
    const name = obs.species?.common_name_pt || obs.suggested_species || ''
    return name.toLowerCase().includes(search.toLowerCase())
  })

  function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 60000)
    if (diff < 60) return `${diff}min atrás`
    if (diff < 1440) return `${Math.floor(diff / 60)}h atrás`
    return `${Math.floor(diff / 1440)}d atrás`
  }

  function renderItem({ item }) {
    const primaryPhoto = item.photos?.find(p => p.is_primary) || item.photos?.[0]
    const speciesName = item.species?.scientific_name || item.suggested_species || 'Espécie desconhecida'
    const commonName = item.species?.common_name_pt || ''
    const likedByMe = item.likes?.some(like => like.user_id === currentUserId)
    const isCommentOpen = activeCommentId === item.id

    return (
      <View style={styles.card}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => router.push(`/observation/${item.id}`)}>
          <View style={styles.imagePlaceholder}>
            {primaryPhoto?.url ? (
              <Image source={{ uri: primaryPhoto.url }} style={styles.cardImage} />
            ) : (
              <Ionicons name="leaf-outline" size={48} color="#ccc" />
            )}
          </View>
          <View style={styles.cardBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#fff" />
            <Text style={styles.cardBadgeText}>Validada</Text>
          </View>
          <View style={styles.cardBody}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.speciesName}>{speciesName}</Text>
                {commonName ? <Text style={styles.commonName}>{commonName}</Text> : null}
              </View>
            </View>
            <View style={styles.cardMeta}>
              <Ionicons name="location-outline" size={14} color="#666" />
              <Text style={styles.metaText}>Localização</Text>
              <Ionicons name="time-outline" size={14} color="#666" style={{ marginLeft: 12 }} />
              <Text style={styles.metaText}>{timeAgo(item.observed_at)}</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Footer com likes e comentários — fora do TouchableOpacity */}
        <View style={[styles.cardBody, { paddingTop: 0 }]}>
          <View style={styles.cardFooter}>
            <View style={styles.userRow}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={14} color="#fff" />
              </View>
              <Text style={styles.username}>@{item.user?.username || 'utilizador'}</Text>
            </View>
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => toggleLike(item)} disabled={likeLoadingIds.includes(item.id)}>
                <Ionicons name={likedByMe ? 'heart' : 'heart-outline'} size={16} color={likedByMe ? '#dc2626' : '#666'} />
                <Text style={styles.statText}>{item.likes?.length || 0}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => {
                  if (isCommentOpen) {
                  setActiveCommentId(null)
                  setCommentText('')
                } else {
                  setActiveCommentId(item.id)
                }
              }}
            >
              <Ionicons name="chatbubble-outline" size={16} color="#666" />
              <Text style={styles.statText}>{item.comments?.length || 0}</Text>
            </TouchableOpacity>
          </View>
        </View>
        {isCommentOpen && (
          <View style={styles.commentBox}>
            <TextInput
              style={styles.commentInput}
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Escreve um comentário..."
              placeholderTextColor="#999"
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!commentText.trim() || actionLoading) && styles.sendBtnDisabled]}
              onPress={() => submitComment(item.id)}
              disabled={!commentText.trim() || actionLoading}
            >
              <Text style={styles.sendBtnText}>Enviar</Text>
            </TouchableOpacity>
          </View>
        )}
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BioRegisto</Text>
          <TouchableOpacity onPress={() => router.push('/notifications')} style={{ position: 'relative' }}>
        <Ionicons name="notifications-outline" size={24} color="#1a3c2e" />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color="#999" style={{ marginRight: 8 }} />
        <TextInput style={styles.searchInput} placeholder="Pesquisar espécies ou local..." value={search} onChangeText={setSearch} placeholderTextColor="#999" />
      </View>
      <View style={styles.filters}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f} style={[styles.filterBtn, activeFilter === f && styles.filterBtnActive]} onPress={() => setActiveFilter(f)}>
            <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#1a3c2e" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={<Text style={styles.empty}>Nenhuma observação encontrada.</Text>}
        />
      )}
      <TouchableOpacity style={styles.cam} onPress={() => router.push('/(tabs)/add')}>
        <Ionicons name="camera" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#1a3c2e' },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#dc2626', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginVertical: 15, borderRadius: 35, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#eee' },
  searchInput: { flex: 1, fontSize: 14, color: '#333' },
  filters: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 10 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' },
  filterBtnActive: { backgroundColor: '#1a3c2e', borderColor: '#1a3c2e' },
  filterText: { fontSize: 13, color: '#555' },
  filterTextActive: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 12, marginHorizontal: 16, marginBottom: 16, overflow: 'hidden', elevation: 2 },
  imagePlaceholder: { height: 200, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  cardImage: { width: '100%', height: '100%' },
  cardBadge: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a3c2e', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, gap: 4 },
  cardBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  cardBody: { padding: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  speciesName: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a' },
  commonName: { fontSize: 13, color: '#666', marginTop: 2 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  metaText: { fontSize: 12, color: '#666', marginLeft: 4 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#1a3c2e', justifyContent: 'center', alignItems: 'center' },
  username: { fontSize: 13, color: '#555' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 6,
    borderRadius: 18,
    justifyContent: 'center',
  },
  statText: { fontSize: 13, color: '#666', marginLeft: 4 },
  commentBox: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentInput: { flex: 1, borderWidth: 1, borderColor: '#e1e1e1', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#333' },
  sendBtn: { backgroundColor: '#1a3c2e', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 60, color: '#999', fontSize: 15 },
  cam: { position: 'absolute', bottom: 40, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#1a3c2e', justifyContent: 'center', alignItems: 'center', elevation: 5 },
})