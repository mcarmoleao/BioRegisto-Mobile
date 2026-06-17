import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Image, Alert,
  TextInput, ActivityIndicator
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../lib/supabase'
import { StatusBar } from 'expo-status-bar'

const FILTERS = ['Todos', 'Animais', 'Plantas', 'Fungos']
const KINGDOM_MAP = { 'Animais': 'ANIMALIA', 'Plantas': 'PLANTAE', 'Fungos': 'FUNGI' }
const RECENT_VIEWS_KEY = '@BioRegisto:RecentViews'

export default function Feed() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [currentUsername, setCurrentUsername] = useState(null)
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
  
  // Histórico de observações clicadas localmente
  const [recentViews, setRecentViews] = useState([])

  // Filtros Globais (os ativos na listagem)
  const [dateFilter, setDateFilter] = useState(null)
  const [sortBy, setSortBy] = useState('all')
  const [showFilters, setShowFilters] = useState(false)

  // Estados temporários para o Modal
  const [tempDateFilter, setTempDateFilter] = useState(null)
  const [tempSortBy, setTempSortBy] = useState('all')

  // Sincroniza os valores temporários sempre que o modal abre
  useEffect(() => {
    if (showFilters) {
      setTempDateFilter(dateFilter)
      setTempSortBy(sortBy)
    }
  }, [showFilters])

  useEffect(() => {
    fetchObservations()
    fetchUnreadCount()
  }, [activeFilter])  

  useFocusEffect(
    useCallback(() => {
      fetchObservations()
      fetchUnreadCount()
      loadRecentViews() // Atualiza a lista de cliques locais ao voltar para o feed
    }, [activeFilter])
  )

  // Função para carregar os cliques guardados no AsyncStorage
  async function loadRecentViews() {
    try {
      const jsonValue = await AsyncStorage.getItem(RECENT_VIEWS_KEY)
      if (jsonValue != null) {
        setRecentViews(JSON.parse(jsonValue))
      }
    } catch (e) {
      console.error('Erro ao carregar vistos recentemente:', e)
    }
  }

  // Função chamada ao clicar num card para registar o clique com o timestamp atual
  async function handleOpenObservation(observationId) {
    try {
      const jsonValue = await AsyncStorage.getItem(RECENT_VIEWS_KEY)
      let currentViews = jsonValue ? JSON.parse(jsonValue) : []
      
      // Remove se já existia para não duplicar e insere no topo com a hora atual
      currentViews = currentViews.filter(item => item.id !== observationId)
      currentViews.unshift({ id: observationId, viewedAt: Date.now() })
      
      // Guarda apenas os últimos 50 cliques para poupar espaço
      if (currentViews.length > 50) {
        currentViews = currentViews.slice(0, 50)
      }

      await AsyncStorage.setItem(RECENT_VIEWS_KEY, JSON.stringify(currentViews))
      setRecentViews(currentViews)
    } catch (e) {
      console.error('Erro ao guardar visto recentemente:', e)
    }

    // Navega para o detalhe
    router.push(`/observation/${observationId}`)
  }

  async function fetchUnreadCount() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setUnreadCount(0)
      return
    }
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
    setUnreadCount(count || 0)
  }

  async function fetchObservations() {
    setLoading(true)
    const { data: authData } = await supabase.auth.getUser()
    setCurrentUserId(authData?.user?.id || null)

    const { data: profileData } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', authData?.user?.id)
      .single()
    setCurrentUsername(profileData?.username || null)

    const { data, error } = await supabase.rpc('get_observations', {
      p_status: 'VALIDATED',
      p_kingdom: activeFilter !== 'Todos' ? KINGDOM_MAP[activeFilter] : null,
      p_date_from: null,
    })

    if (!error && data) {
      const visible = data
      const ids = visible.map(o => o.id)

      const [likesRes, commentsRes, photosRes] = await Promise.all([
        supabase.from('likes').select('observation_id, user_id').in('observation_id', ids),
        supabase.from('comments').select('id, observation_id').in('observation_id', ids),
        supabase.from('photos').select('observation_id, url, is_primary').in('observation_id', ids),
      ])

      const adapted = visible.map(obs => ({
        ...obs,
        species: obs.scientific_name ? {
          scientific_name: obs.scientific_name,
          common_name_pt: obs.common_name_pt,
          kingdom: obs.kingdom,
        } : null,
        user: { username: obs.username, avatar_url: obs.avatar_url },
        photos: (photosRes.data || []).filter(p => p.observation_id === obs.id),
        likes: (likesRes.data || []).filter(l => l.observation_id === obs.id),
        comments: (commentsRes.data || []).filter(c => c.observation_id === obs.id),
      }))

      setObservations(adapted)
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
      const { data: { user } } = await supabase.auth.getUser()
      const { data: ownerObservation } = await supabase
        .from('observations')
        .select('user_id')
        .eq('id', observationId)
        .single()

      if (ownerObservation?.user_id && ownerObservation.user_id !== currentUserId) {
        await supabase.from('notifications').insert({
          user_id: ownerObservation.user_id,
          type: 'COMMENT',
          message: `${currentUsername || user?.email || 'Um utilizador'} comentou na tua observação`,
          observation_id: observationId,
          is_read: false,
        })
      }

      setCommentText('')
      setActiveCommentId(null)
      await fetchObservations()
      await fetchUnreadCount()
    }
    setActionLoading(false)
  }

  // --- PROCESSAMENTO DE FILTROS ---
  let finalObservations = observations.filter(obs => {
    const name = obs.species?.common_name_pt || obs.suggested_species || ''
    return name.toLowerCase().includes(search.toLowerCase())
  })

  // 1. Filtro por Período de Tempo
  if (dateFilter === 'today') {
    const hojeInicio = new Date()
    hojeInicio.setHours(0, 0, 0, 0)
    finalObservations = finalObservations.filter(
      obs => new Date(obs.observed_at) >= hojeInicio
    )
  } else if (dateFilter === 'week') {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    finalObservations = finalObservations.filter(
      obs => new Date(obs.observed_at) >= weekAgo
    )
  } else if (dateFilter === 'month') {
    const monthAgo = new Date()
    monthAgo.setMonth(monthAgo.getMonth() - 1)
    finalObservations = finalObservations.filter(
      obs => new Date(obs.observed_at) >= monthAgo
    )
  }

  // 2. Filtro de Ordenação / Estado Especial
  if (sortBy === 'recent_view') {
    const duasHorasAtras = Date.now() - 2 * 60 * 60 * 1000

    // Filtra apenas os IDs clicados nas últimas 2 horas
    const validClickedItems = recentViews.filter(item => item.viewedAt >= duasHorasAtras)
    const validClickedIds = validClickedItems.map(item => item.id)

    // Filtra a lista principal para ter apenas as observações correspondentes
    finalObservations = finalObservations.filter(obs => validClickedIds.includes(obs.id))

    // Ordena pela ordem em que foram clicadas (a mais recente primeiro)
    finalObservations.sort((a, b) => {
      const infoA = validClickedItems.find(item => item.id === a.id)
      const infoB = validClickedItems.find(item => item.id === b.id)
      return (infoB?.viewedAt || 0) - (infoA?.viewedAt || 0)
    })
  } else if (sortBy === 'popular') {
    finalObservations.sort(
      (a, b) => (b.likes?.length || 0) - (a.likes?.length || 0)
    )
  } else {
    // 'all' ou padrão: ordena por data de observação mais recente
    finalObservations.sort(
      (a, b) => new Date(b.observed_at) - new Date(a.observed_at)
    )
  }

  function handleApplyFilters() {
    setDateFilter(tempDateFilter)
    setSortBy(tempSortBy)
    setShowFilters(false)
  }

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
        <TouchableOpacity activeOpacity={0.9} onPress={() => handleOpenObservation(item.id)}>
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

        <View style={[styles.cardBody, { paddingTop: 0 }]}>
          <View style={styles.cardFooter}>
            <TouchableOpacity
              style={styles.userRow}
              onPress={() => router.push(`/user/${item.user?.username}`)}
            >
              <View style={styles.avatar}>
                {item.user?.avatar_url ? (
                  <Image source={{ uri: item.user.avatar_url }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={14} color="#fff" />
                )}
              </View>
              <Text style={styles.username}>@{item.user?.username || 'utilizador'}</Text>
            </TouchableOpacity>
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => toggleLike(item)}>
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
        <Image
          source={require('../../assets/logoFeed.png')}
          style={styles.logo}
          resizeMode="contain"
        />
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
      <View style={styles.filtersRow}>
        <View style={styles.filters}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filterBtn, activeFilter === f && styles.filterBtnActive]}
              onPress={() => setActiveFilter(f)}
            >
              <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.extraFilterBtn}
          onPress={() => setShowFilters(true)}
        >
          <Ionicons name="options-outline" size={20} color="#1a3c2e" />
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#1a3c2e" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={finalObservations}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={<Text style={styles.empty}>Nenhuma observação encontrada.</Text>}
        />
      )}
      <TouchableOpacity style={styles.cam} onPress={() => router.push('/(tabs)/add')}>
        <Ionicons name="camera" size={26} color="#fff" />
      </TouchableOpacity>

      {showFilters && (
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowFilters(false)}
        >
          <View style={styles.filterModal}>
            <Text style={styles.filterModalTitle}>Filtros adicionais</Text>
            
            <Text style={styles.filterModalSection}>Mostrar / Ordenar</Text>
            <View style={styles.filterModalRow}>
              {[
                { key: 'all', label: 'Todas' },
                { key: 'recent_view', label: 'Visto recentemente' },
                { key: 'popular', label: 'Mais populares' },
              ].map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.filterModalBtn, (tempSortBy === opt.key) && styles.filterModalBtnActive]}
                  onPress={() => setTempSortBy(opt.key)}
                >
                  <Text style={[styles.filterModalBtnText, (tempSortBy === opt.key) && styles.filterModalBtnTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterModalSection}>Período</Text>
            <View style={styles.filterModalRow}>
              {[
                { key: 'today', label: 'Hoje' },
                { key: 'week', label: 'Última semana' },
                { key: 'month', label: 'Último mês' },
                { key: null, label: 'Sempre' },
              ].map(opt => (
                <TouchableOpacity
                  key={String(opt.key)}
                  style={[styles.filterModalBtn, tempDateFilter === opt.key && styles.filterModalBtnActive]}
                  onPress={() => setTempDateFilter(opt.key)}
                >
                  <Text style={[styles.filterModalBtnText, tempDateFilter === opt.key && styles.filterModalBtnTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity 
              style={styles.filterModalApply} 
              onPress={handleApplyFilters}
            >
              <Text style={styles.filterModalApplyText}>Aplicar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff' },
  logo: { width: 180, height: 45 },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#dc2626', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginVertical: 15, borderRadius: 35, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#eee' },
  searchInput: { flex: 1, fontSize: 14, color: '#333' },
  filters: { flexDirection: 'row', paddingHorizontal: 6, gap: 6, marginBottom: 10 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' },
  filterBtnActive: { backgroundColor: '#0d723b', borderColor: '#0d723b' },
  filterText: { fontSize: 13, color: '#555' },
  filterTextActive: { color: '#fff' },
  filtersRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, marginBottom: 10 },
  extraFilterBtn: { bottom: 6, width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', zIndex: 100 },
  filterModal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  filterModalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 20 },
  filterModalSection: { fontSize: 13, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 8 },
  filterModalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  filterModalBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' },
  filterModalBtnActive: { backgroundColor: '#0d723b', borderColor: '#0d723b' },
  filterModalBtnText: { fontSize: 13, color: '#555' },
  filterModalBtnTextActive: { color: '#fff', fontWeight: '600' },
  filterModalApply: { backgroundColor: '#0d723b', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 16 },
  filterModalApplyText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 12, marginHorizontal: 16, marginBottom: 16, overflow: 'hidden', elevation: 2 },
  imagePlaceholder: { height: 200, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  cardImage: { width: '100%', height: '100%' },
  cardBadge: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d723b', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, gap: 4 },
  cardBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  cardBody: { padding: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  speciesName: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a' },
  commonName: { fontSize: 13, color: '#666', marginTop: 2 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  metaText: { fontSize: 12, color: '#666', marginLeft: 4 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#0d723b', justifyContent: 'center', alignItems: 'center' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 13 },
  username: { fontSize: 13, color: '#555' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 6, borderRadius: 18, justifyContent: 'center' },
  statText: { fontSize: 13, color: '#666', marginLeft: 4 },
  commentBox: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentInput: { flex: 1, borderWidth: 1, borderColor: '#e1e1e1', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#333' },
  sendBtn: { backgroundColor: '#0d723b', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 60, color: '#999', fontSize: 15 },
  cam: { position: 'absolute', bottom: 40, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#41a047', justifyContent: 'center', alignItems: 'center', elevation: 5 },
})