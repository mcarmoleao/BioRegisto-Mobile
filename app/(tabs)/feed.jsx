console.log('feed.jsx loaded')
import { useEffect, useState } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { StatusBar } from 'expo-status-bar'

const FILTERS = ['Todos', 'Animais', 'Plantas', 'Fungos']
const KINGDOM_MAP = { 'Animais': 'animalia', 'Plantas': 'plantae', 'Fungos': 'fungi' }

export default function Feed() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [observations, setObservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('Todos')

  useEffect(() => {
    console.log('useEffect triggered, activeFilter:', activeFilter)
    fetchObservations()
  }, [activeFilter])  

  async function fetchObservations() {
    console.log('fetchObservations called')
    setLoading(true)
    let query = supabase
      .from('observations')
      .select(`
        id, description, observed_at, suggested_species,
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
    console.log('data:', JSON.stringify(data))
    console.log('error:', JSON.stringify(error))
    if (!error) setObservations(data)
    setLoading(false)
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

    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.9}>
        <View style={styles.imagePlaceholder}>
          <Ionicons name={primaryPhoto ? 'image-outline' : 'leaf-outline'} size={48} color="#ccc" />
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
            <Ionicons name="ellipsis-vertical" size={20} color="#999" />
          </View>
          <View style={styles.cardMeta}>
            <Ionicons name="location-outline" size={14} color="#666" />
            <Text style={styles.metaText}>Localização</Text>
            <Ionicons name="time-outline" size={14} color="#666" style={{ marginLeft: 12 }} />
            <Text style={styles.metaText}>{timeAgo(item.observed_at)}</Text>
          </View>
          <View style={styles.cardFooter}>
            <View style={styles.userRow}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={14} color="#fff" />
              </View>
              <Text style={styles.username}>@{item.user?.username || 'utilizador'}</Text>
            </View>
            <View style={styles.stats}>
              <Ionicons name="heart-outline" size={16} color="#666" />
              <Text style={styles.statText}>{item.likes?.length || 0}</Text>
              <Ionicons name="chatbubble-outline" size={16} color="#666" style={{ marginLeft: 10 }} />
              <Text style={styles.statText}>{item.comments?.length || 0}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BioRegisto</Text>
        <Ionicons name="options-outline" size={24} color="#1a3c2e" />
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
      <TouchableOpacity style={styles.logoutBtn} onPress={async () => { await supabase.auth.signOut(); router.replace('/(auth)/login') }}>
        <Text style={{ color: '#fff', fontSize: 12 }}>Logout</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.fab} onPress={() => router.push('/(tabs)/add')}>
        <Ionicons name="camera" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#1a3c2e' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginVertical: 10, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#eee' },
  searchInput: { flex: 1, fontSize: 14, color: '#333' },
  filters: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 10 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' },
  filterBtnActive: { backgroundColor: '#1a3c2e', borderColor: '#1a3c2e' },
  filterText: { fontSize: 13, color: '#555' },
  filterTextActive: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 12, marginHorizontal: 16, marginBottom: 16, overflow: 'hidden', elevation: 2 },
  imagePlaceholder: { height: 200, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
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
  stats: { flexDirection: 'row', alignItems: 'center' },
  statText: { fontSize: 13, color: '#666', marginLeft: 4 },
  empty: { textAlign: 'center', marginTop: 60, color: '#999', fontSize: 15 },
  fab: { position: 'absolute', bottom: 80, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#1a3c2e', justifyContent: 'center', alignItems: 'center', elevation: 5 },
  logoutBtn: { position: 'absolute', top: 50, right: 16, backgroundColor: 'red', padding: 8, borderRadius: 8 },
})