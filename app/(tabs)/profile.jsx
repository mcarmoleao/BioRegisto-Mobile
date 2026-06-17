import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'

export default function Profile() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [observations, setObservations] = useState([])
  const [stats, setStats] = useState({ total: 0, validated: 0, pending: 0, rejected: 0, species: 0 })
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('Todas')

  const FILTERS = ['Todas', 'Animais', 'Plantas', 'Fungos']
  const KINGDOM_MAP = { 'Animais': 'ANIMALIA', 'Plantas': 'PLANTAE', 'Fungos': 'FUNGI' }

  useEffect(() => { fetchProfile() }, [])
  useEffect(() => { if (profile) fetchObservations() }, [profile, activeFilter])

  async function fetchProfile() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    const { data: obsData } = await supabase
      .from('observations')
      .select('status, species:species_id (scientific_name)')
      .eq('user_id', user.id)

    if (profileData) setProfile(profileData)
    if (obsData) {
      const uniqueSpecies = new Set(
        obsData.filter(o => o.species?.scientific_name).map(o => o.species.scientific_name)
      )
      setStats({
        total: obsData.length,
        validated: obsData.filter(o => o.status === 'VALIDATED').length,
        pending: obsData.filter(o => o.status === 'PENDING').length,
        rejected: obsData.filter(o => o.status === 'REJECTED').length,
        species: uniqueSpecies.size,
      })
    }
    setLoading(false)
  }

  async function fetchObservations() {
    const { data: { user } } = await supabase.auth.getUser()

    let query = supabase
      .from('observations')
      .select(`
        id, status, observed_at,
        species:species_id (scientific_name, kingdom),
        photos (url, is_primary)
      `)
      .eq('user_id', user.id)
      .order('observed_at', { ascending: false })

    const { data } = await query
    if (data) {
      // Aplica o filtro localmente para evitar problemas de joins complexos no Supabase
      if (activeFilter !== 'Todas') {
        const filtered = data.filter(obs => obs.species?.kingdom === KINGDOM_MAP[activeFilter])
        setObservations(filtered)
      } else {
        setObservations(data)
      }
    }
  }

  async function handleLogout() {
    Alert.alert('Terminar sessão', 'Tens a certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair', style: 'destructive', onPress: async () => {
          await supabase.auth.signOut()
          router.replace('/(auth)/login')
        }
      }
    ])
  }

  if (loading) return <ActivityIndicator size="large" color="#1a3c2e" style={{ flex: 1 }} />

  const STATUS_ICON = {
    VALIDATED: { icon: 'checkmark-circle', color: '#0d723b' },
    PENDING: { icon: 'time', color: '#fdb924' },
    REJECTED: { icon: 'close-circle', color: '#dc2626' },
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>

        {/* Header verde */}
        <View style={styles.headerBg} />

        {/* Botões no topo */}
        <View style={[styles.headerActions, { top: insets.top + 8 }]}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => router.push('/edit-profile')}
          >
            <Ionicons name="create-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

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
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: '#0d723b' }]}>{stats.validated}</Text>
            <Text style={styles.statLabel}>Validadas</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: '#fdb924' }]}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Pendentes</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: '#dc2626' }]}>{stats.rejected}</Text>
            <Text style={styles.statLabel}>Rejeitadas</Text>
          </View>
        </View>

        {/* FILTROS DE CATEGORIA (Injetados aqui!) */}
        <View style={styles.filtersContainer}>
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

        {/* Atividade recente */}
        <View style={styles.activitySection}>
          <View style={styles.activityHeader}>
            <Text style={styles.activityTitle}>As tuas observações</Text>
            <Text style={styles.activityCount}>{observations.length} observações</Text>
          </View>

          {observations.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="leaf-outline" size={48} color="#ddd" />
              <Text style={styles.emptyText}>Sem observações nesta categoria</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {observations.map(obs => {
                const photo = obs.photos?.find(p => p.is_primary) || obs.photos?.[0]
                const statusConfig = STATUS_ICON[obs.status] || STATUS_ICON.PENDING
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
                    <View style={[styles.gridBadge, { backgroundColor: statusConfig.color }]}>
                      <Ionicons name={statusConfig.icon} size={12} color="#fff" />
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
  headerBg: { height: 100, backgroundColor: '#0d723b' },
  headerActions: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', paddingHorizontal: 16, gap: 8, zIndex: 10 },
  headerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
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
  statNumber: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  statLabel: { fontSize: 10, color: '#888', marginTop: 2 },
  filtersContainer: { flexDirection: 'row', paddingHorizontal: 16, marginTop: 16, gap: 8 },
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
  gridBadge: { position: 'absolute', bottom: 4, right: 4, width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', marginTop: 40, gap: 12 },
  emptyText: { color: '#999', fontSize: 15 },
})