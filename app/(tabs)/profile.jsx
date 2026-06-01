import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'

const ACHIEVEMENTS = [
  { id: 'first', icon: '🌿', label: 'Primeira observação', condition: (s) => s.total >= 1 },
  { id: 'five', icon: '🔬', label: '5 observações', condition: (s) => s.total >= 5 },
  { id: 'ten', icon: '🌍', label: '10 observações', condition: (s) => s.total >= 10 },
  { id: 'first_validated', icon: '✅', label: 'Primeira validada', condition: (s) => s.validated >= 1 },
  { id: 'five_validated', icon: '⭐', label: '5 validadas', condition: (s) => s.validated >= 5 },
  { id: 'explorer', icon: '🦅', label: 'Explorador', condition: (s) => s.total >= 25 },
]

export default function Profile() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [stats, setStats] = useState({ total: 0, validated: 0, pending: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchProfile() }, [])

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
      .select('status')
      .eq('user_id', user.id)

    if (profileData) setProfile(profileData)
    if (obsData) {
      setStats({
        total: obsData.length,
        validated: obsData.filter(o => o.status === 'VALIDATED').length,
        pending: obsData.filter(o => o.status === 'PENDING').length,
      })
    }
    setLoading(false)
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

  const unlockedAchievements = ACHIEVEMENTS.filter(a => a.condition(stats))
  const lockedAchievements = ACHIEVEMENTS.filter(a => !a.condition(stats))

  if (loading) return <ActivityIndicator size="large" color="#1a3c2e" style={{ flex: 1 }} />

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={{ paddingBottom: 100 }}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Perfil</Text>
        <TouchableOpacity onPress={() => Alert.alert('Em breve', 'Edição de perfil disponível em breve.')}>
          <Ionicons name="create-outline" size={24} color="#1a3c2e" />
        </TouchableOpacity>
      </View>

      {/* Avatar + Info */}
      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile?.full_name?.charAt(0)?.toUpperCase() || profile?.username?.charAt(0)?.toUpperCase() || '?'}
          </Text>
        </View>
        <Text style={styles.fullName}>{profile?.full_name || profile?.username}</Text>
        <Text style={styles.username}>@{profile?.username}</Text>
        {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
        {profile?.location ? (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={14} color="#888" />
            <Text style={styles.locationText}>{profile.location}</Text>
          </View>
        ) : null}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{stats.total}</Text>
          <Text style={styles.statLabel}>Observações</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: '#1a3c2e' }]}>{stats.validated}</Text>
          <Text style={styles.statLabel}>Validadas</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: '#b45309' }]}>{stats.pending}</Text>
          <Text style={styles.statLabel}>Pendentes</Text>
        </View>
      </View>

      {/* Conquistas */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Conquistas</Text>
          <Text style={styles.sectionSub}>{unlockedAchievements.length}/{ACHIEVEMENTS.length}</Text>
        </View>

        <View style={styles.achievementsGrid}>
          {ACHIEVEMENTS.map(a => {
            const unlocked = a.condition(stats)
            return (
              <View key={a.id} style={[styles.achievementItem, !unlocked && styles.achievementLocked]}>
                <Text style={[styles.achievementIcon, !unlocked && { opacity: 0.3 }]}>{a.icon}</Text>
                <Text style={[styles.achievementLabel, !unlocked && styles.achievementLabelLocked]} numberOfLines={2}>
                  {a.label}
                </Text>
              </View>
            )
          })}
        </View>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#dc2626" />
        <Text style={styles.logoutText}>Terminar sessão</Text>
      </TouchableOpacity>

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a3c2e' },
  profileSection: { alignItems: 'center', backgroundColor: '#fff', paddingVertical: 24, paddingHorizontal: 16, marginBottom: 8 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1a3c2e', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { fontSize: 32, color: '#fff', fontWeight: 'bold' },
  fullName: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 4 },
  username: { fontSize: 14, color: '#888', marginBottom: 8 },
  bio: { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 8, lineHeight: 20 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: 13, color: '#888' },
  statsRow: { flexDirection: 'row', backgroundColor: '#fff', marginBottom: 8, paddingVertical: 16 },
  statBox: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: '#eee' },
  statNumber: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 2 },
  section: { backgroundColor: '#fff', marginBottom: 8, padding: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  sectionSub: { fontSize: 13, color: '#888' },
  achievementsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  achievementItem: { width: '30%', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 12, padding: 12, gap: 6 },
  achievementLocked: { backgroundColor: '#f5f5f5' },
  achievementIcon: { fontSize: 28 },
  achievementLabel: { fontSize: 11, color: '#333', textAlign: 'center', fontWeight: '500' },
  achievementLabelLocked: { color: '#bbb' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, margin: 16, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#dc2626', backgroundColor: '#fff' },
  logoutText: { color: '#dc2626', fontSize: 15, fontWeight: '600' },
})