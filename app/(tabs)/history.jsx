import { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'expo-router'

const TABS = ['Todas', 'Validadas', 'Pendentes', 'Rejeitadas']
const STATUS_MAP = { 'Validadas': 'VALIDATED', 'Pendentes': 'PENDING', 'Rejeitadas': 'REJECTED' }
const STATUS_CONFIG = {
  VALIDATED: { label: 'VALIDADA', color: '#0d723b', bg: '#e8f5e9', icon: 'checkmark-circle' },
  PENDING: { label: 'PENDENTE', color: '#fdb924', bg: '#fff9e0', icon: 'time' },
  REJECTED: { label: 'REJEITADA', color: '#c41515', bg: '#fee2e2', icon: 'close-circle' },
}

export default function History() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [observations, setObservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('Todas')
  const [total, setTotal] = useState(0)

  useEffect(() => { fetchObservations() }, [activeTab])

  async function fetchObservations() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    let query = supabase
      .from('observations')
      .select(`
        id, description, observed_at, suggested_species, status,
        species:species_id (scientific_name, common_name_pt),
        photos (url, is_primary)
      `)
      .eq('user_id', user.id)
      .order('observed_at', { ascending: false })

    if (activeTab !== 'Todas') query = query.eq('status', STATUS_MAP[activeTab])

    const { data, error } = await query
    if (!error) {
      setObservations(data)
      setTotal(data.length)
    }
    setLoading(false)
  }

  function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 60000)
    if (diff < 60) return `${diff}min atrás`
    if (diff < 1440) return `${Math.floor(diff / 60)}h atrás`
    return `${Math.floor(diff / 1440)}d atrás`
  }

  function renderItem({ item }) {
    const photo = item.photos?.find(p => p.is_primary) || item.photos?.[0]
    const speciesName = item.species?.scientific_name || item.suggested_species || 'A confirmar...'
    const commonName = item.species?.common_name_pt || (item.suggested_species ? `Sugerido: "${item.suggested_species}"` : 'Sem sugestão')
    const status = STATUS_CONFIG[item.status] || STATUS_CONFIG.PENDING

    return (
        <TouchableOpacity 
          style={styles.card} 
          activeOpacity={0.85}
          onPress={() => router.push(`/observation/${item.id}`)}
        >
        <View style={styles.photoContainer}>
          {photo ? (
            <Image source={{ uri: photo.url }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="leaf-outline" size={28} color="#ccc" />
            </View>
          )}
        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.speciesName} numberOfLines={1}>{speciesName}</Text>
              <Text style={styles.commonName} numberOfLines={1}>{commonName}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
              <Ionicons name={status.icon} size={12} color={status.color} />
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
          <Text style={styles.timeText}>{timeAgo(item.observed_at)}</Text>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>As minhas observações</Text>
      </View>

      <View style={styles.tabsContainer}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.totalText}>Total {total}</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#0d723b" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={observations}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="leaf-outline" size={48} color="#ddd" />
              <Text style={styles.emptyText}>Nenhuma observação encontrada.</Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#0d723b' },
  tabsContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', gap: 8, marginBottom: 2 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' },
  tabActive: { backgroundColor: '#0d723b', borderColor: '#0d723b' },
  tabText: { fontSize: 13, color: '#555' },
  tabTextActive: { color: '#fff', fontWeight: '600' },
  totalText: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 13, fontWeight: 'bold', color: '#605f5f' },
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, marginBottom: 10, overflow: 'hidden', elevation: 1 },
  photoContainer: { width: 90, height: 100 },
  photo: { width: 90, height: 100 },
  photoPlaceholder: { width: 90, height: 100, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  cardContent: { flex: 1, padding: 10, justifyContent: 'center' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  speciesName: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  commonName: { fontSize: 12, color: '#666', marginTop: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 20, gap: 3, marginLeft: 6 },
  statusText: { fontSize: 11, fontWeight: '600' },
  timeText: { fontSize: 11, color: '#999', marginBottom: 4 },
  rejectionText: { fontSize: 11, color: '#c41515', fontStyle: 'italic', marginTop: 2 },
  empty: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyText: { color: '#999', fontSize: 15 },
})