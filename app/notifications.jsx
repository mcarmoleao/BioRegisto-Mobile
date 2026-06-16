import { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { supabase } from '../lib/supabase'

const TYPE_CONFIG = {
  VALIDATED: { icon: 'checkmark-circle', color: '#1a3c2e', bg: '#e8f5e9' },
  REJECTED: { icon: 'close-circle', color: '#dc2626', bg: '#fee2e2' },
  LIKE: { icon: 'heart', color: '#e11d48', bg: '#fff1f2' },
  COMMENT: { icon: 'chatbubble', color: '#2563eb', bg: '#eff6ff' },
}

export default function Notifications() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchNotifications() }, [])

  async function fetchNotifications() {
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select(`
        *,
        actor:actor_id (username, avatar_url)
      `)
      .order('created_at', { ascending: false })

    if (data) setNotifications(data)
    setLoading(false)
  }

  async function markAllRead() {
    await supabase.from('notifications').update({ is_read: true }).eq('is_read', false)
    fetchNotifications()
  }

  async function handlePress(item) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', item.id)
    if (item.observation_id) router.push(`/observation/${item.observation_id}`)
    fetchNotifications()
  }

  function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 60000)
    if (diff < 60) return `${diff}min atrás`
    if (diff < 1440) return `${Math.floor(diff / 60)}h atrás`
    return `${Math.floor(diff / 1440)}d atrás`
  }

  function getIcon(item) {
    const config = TYPE_CONFIG[item.type] || { icon: 'notifications', color: '#888', bg: '#f5f5f5' }

    // Para likes e comentários, mostra avatar do actor
    if ((item.type === 'LIKE' || item.type === 'COMMENT') && item.actor) {
      return (
        <View style={styles.avatarContainer}>
          {item.actor.avatar_url ? (
            <Image source={{ uri: item.actor.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: config.color }]}>
              <Text style={styles.avatarText}>
                {item.actor.username?.charAt(0)?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <View style={[styles.typeBadge, { backgroundColor: config.color }]}>
            <Ionicons name={config.icon} size={10} color="#fff" />
          </View>
        </View>
      )
    }

    // Para validadas e rejeitadas, mostra ícone
    return (
      <View style={[styles.iconContainer, { backgroundColor: config.bg }]}>
        <Ionicons name={config.icon} size={24} color={config.color} />
      </View>
    )
  }

  function getMessage(item) {
    if (item.type === 'REJECTED') {
      return (
        <View>
          <Text style={[styles.message, !item.is_read && styles.messageUnread]}>
            {item.message}
          </Text>
          <Text style={styles.tapHint}>Toca para ver os detalhes →</Text>
        </View>
      )
    }
    return (
      <Text style={[styles.message, !item.is_read && styles.messageUnread]}>
        {item.message}
      </Text>
    )
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  function renderItem({ item }) {
    return (
      <TouchableOpacity
        style={[styles.item, !item.is_read && styles.itemUnread]}
        activeOpacity={0.7}
        onPress={() => handlePress(item)}
      >
        {getIcon(item)}
        <View style={styles.itemContent}>
          {getMessage(item)}
          <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
        </View>
        {!item.is_read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1a3c2e" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notificações</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={styles.markAllRead}>Marcar todas lidas</Text>
          </TouchableOpacity>
        )}
        {unreadCount === 0 && <View style={{ width: 80 }} />}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#1a3c2e" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={48} color="#ddd" />
              <Text style={styles.emptyText}>Sem notificações</Text>
            </View>
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#1a3c2e' },
  markAllRead: { fontSize: 12, color: '#1a3c2e', fontWeight: '600' },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', gap: 12 },
  itemUnread: { backgroundColor: '#f8fffe' },
  iconContainer: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  avatarContainer: { position: 'relative', width: 48, height: 48 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  typeBadge: { position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  itemContent: { flex: 1 },
  message: { fontSize: 14, color: '#555', lineHeight: 20 },
  messageUnread: { color: '#1a1a1a', fontWeight: '600' },
  tapHint: { fontSize: 12, color: '#dc2626', marginTop: 2 },
  time: { fontSize: 12, color: '#999', marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1a3c2e' },
  empty: { alignItems: 'center', marginTop: 80, gap: 12 },
  emptyText: { color: '#999', fontSize: 15 },
})