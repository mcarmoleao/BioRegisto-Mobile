import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, FlatList } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'

const FILTERS = ['Todas', 'Animais', 'Plantas', 'Fungos']
const KINGDOM_MAP = { 'Animais': 'ANIMALIA', 'Plantas': 'PLANTAE', 'Fungos': 'FUNGI' }

export default function UserProfile() {
  const { username } = useLocalSearchParams()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [profile, setProfile] = useState(null)
  const [observations, setObservations] = useState([])
  const [stats, setStats] = useState({ total: 0, species: 0 })
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('Todas')

  useEffect(() => { fetchProfile() }, [username])
  useEffect(() => { if (profile) fetchObservations() }, [profile, activeFilter])

  async function fetchProfile() {
    const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .single()
  
    if (data) {
        setProfile(data)
    } else {
        setLoading(false) 
    }
  }

  async function fetchObservations() {
    let query = supabase
      .from('observations')
      .select(`
        id, observed_at, suggested_species, status,
        species:species_id (scientific_name, common_name_pt, kingdom),
        photos (url, is_primary)
      `)
      .eq('user_id', profile.id)
      .eq('status', 'VALIDATED')
      .eq('is_public', true)
      .order('observed_at', { ascending: false })

    if (activeFilter !== 'Todas') {
      query = query.eq('species.kingdom', KINGDOM_MAP[activeFilter])
    }

    const { data } = await query

    if (data) {
      setObservations(data)

      // Contar espécies únicas
      const uniqueSpecies = new Set(
        data.filter(o => o.species?.scientific_name).map(o => o.species.scientific_name)
      )
      setStats({ total: data.length, species: uniqueSpecies.size })
    }
    setLoading(false)
  }

  if (!profile && loading) return <ActivityIndicator size="large" color="#1a3c2e" style={{ flex: 1 }} />

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Header verde */}
        <View style={styles.headerBg} />

        {/* Back btn */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        {/* Avatar */}
        <View style={styles.avatarContainer}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarText}>
                {profile?.full_name?.charAt(0)?.toUpperCase() || profile?.username?.charAt(0)?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.infoSection}>
          <Text style={styles.fullName}>{profile?.full_name || profile?.username}</Text>
          <Text style={styles.usernameLocation}>
            @{profile?.username}{profile?.location ? ` · ${profile.location}` : ''}
          </Text>
          {profile?.bio && <Text style={styles.bio}>{profile.bio}</Text>}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{stats.total}</Text>
            <Text style={styles.statLabel}>Observações</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{stats.species}</Text>
            <Text style={styles.statLabel}>Espécies</Text>
          </View>
        </View>

        {/* Filtros */}
        <View style={styles.filtersContainer}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filterBtn, activeFilter === f && styles.filterBtnActive]}
              onPress={() => setActiveFilter(f)}
            >
              <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Atividade recente */}
        <View style={styles.activitySection}>
          <View style={styles.activityHeader}>
            <Text style={styles.activityTitle}>Atividade recente</Text>
            <Text style={styles.activityCount}>{observations.length} observações</Text>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#0d723b" style={{ marginTop: 40 }} />
          ) : observations.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="leaf-outline" size={48} color="#ddd" />
              <Text style={styles.emptyText}>Sem observações</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {observations.map(obs => {
                const photo = obs.photos?.find(p => p.is_primary) || obs.photos?.[0]
                return (
                  <TouchableOpacity
                    key={obs.id}
                    style={styles.gridItem}
                    onPress={() => router.push(`/observation/${obs.id}`)}
                    activeOpacity={0.85}
                  >
                    {photo ? (
                      <Image source={{ uri: photo.url }} style={styles.gridImage} />
                    ) : (
                      <View style={styles.gridPlaceholder}>
                        <Ionicons name="leaf-outline" size={28} color="#ccc" />
                      </View>
                    )}
                    <View style={styles.gridBadge}>
                      <Ionicons name="checkmark-circle" size={14} color="#fff" />
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerBg: { height: 100, backgroundColor: '#0d723b' },
  backBtn: { position: 'absolute', left: 16, top: 8, zIndex: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  avatarContainer: { marginTop: -40, marginLeft: 16, marginBottom: 12 },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: '#fff' },
  avatarFallback: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#0d723b', borderWidth: 3, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 32, color: '#fff', fontWeight: 'bold' },
  infoSection: { paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  fullName: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 4 },
  usernameLocation: { fontSize: 13, color: '#888', marginBottom: 8 },
  bio: { fontSize: 14, color: '#555', lineHeight: 20 },
  statsRow: { flexDirection: 'row', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  statBox: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: '#eee' },
  statNumber: { fontSize: 22, fontWeight: 'bold', color: '#1a1a1a' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 2 },
  filtersContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' },
  filterBtnActive: { backgroundColor: '#0d723b', borderColor: '#0d723b' },
  filterText: { fontSize: 13, color: '#555' },
  filterTextActive: { color: '#fff', fontWeight: '600' },
  activitySection: { padding: 16 },
  activityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  activityTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  activityCount: { fontSize: 12, color: '#888' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  gridItem: { width: '32%', aspectRatio: 1, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  gridImage: { width: '100%', height: '100%' },
  gridPlaceholder: { width: '100%', height: '100%', backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  gridBadge: { position: 'absolute', bottom: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: '#0d723b', justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', marginTop: 40, gap: 12 },
  emptyText: { color: '#999', fontSize: 15 },
})