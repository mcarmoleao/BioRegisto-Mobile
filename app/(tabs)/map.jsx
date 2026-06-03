import { useState, useRef, useCallback, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MapView, { Marker } from 'react-native-maps'
import * as Location from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'expo-router'

const FILTERS = ['Todas', 'Animais', 'Plantas', 'Fungos']
const KINGDOM_MAP = { 'Animais': 'ANIMALIA', 'Plantas': 'PLANTAE', 'Fungos': 'FUNGI' }

const STATUS_COLORS = {
  VALIDATED: '#1a3c2e',
  PENDING: '#b45309',
  REJECTED: '#dc2626',
}

const STATUS_LABELS = {
  VALIDATED: 'Validada',
  PENDING: 'Pendente',
  REJECTED: 'Rejeitada',
}

export default function Map() {
  const insets = useSafeAreaInsets()
  const mapRef = useRef(null)
  const router = useRouter()
  const [observations, setObservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('Todas')
  const [selected, setSelected] = useState(null)
  const [userLocation, setUserLocation] = useState(null)

  useEffect(() => {
    fetchObservations()
    getUserLocation()
  }, [activeFilter])

  async function getUserLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') return
    const loc = await Location.getCurrentPositionAsync({})
    setUserLocation(loc.coords)
  }

  async function fetchObservations() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .rpc('get_observations', {
        p_status: null,
        p_kingdom: activeFilter !== 'Todas' ? KINGDOM_MAP[activeFilter] : null,
        p_date_from: null,
      })

      console.log('total obs:', data?.length)
      console.log('obs com location:', data?.filter(o => o.location)?.length)
      console.log('primeira location:', JSON.stringify(data?.[0]?.location))
      console.log('error:', JSON.stringify(error))

    if (!error && data) {
      console.log('primeiro registo:', JSON.stringify(data?.[0]))
      const myObs = data.filter(o => o.user_id === user.id && o.latitude != null && o.longitude != null)
  
      const parsed = myObs.map(o => ({
        ...o,
        coords: { latitude: o.latitude, longitude: o.longitude },
        species: { scientific_name: o.scientific_name, common_name_pt: o.common_name_pt, kingdom: o.kingdom },
        user: { username: o.username, avatar_url: o.avatar_url },
        photos: [],
      }))

      setObservations(parsed)
    }
    setLoading(false)
  }

  function parseLocation(location) {
    try {
      if (typeof location === 'string') {
        // Formato WKB hex — converter via query no supabase
        // Formato POINT(lon lat)
        const match = location.match(/POINT\(([^\s]+)\s+([^\)]+)\)/)
        if (match) {
          return {
            longitude: parseFloat(match[1]),
            latitude: parseFloat(match[2]),
          }
        }
      }
      if (location?.coordinates) {
        return {
          longitude: location.coordinates[0],
          latitude: location.coordinates[1],
        }
      }
    } catch (e) {}
    return null
  }

  function centerOnUser() {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 800)
    }
  }

  const initialRegion = userLocation ? {
    latitude: userLocation.latitude,
    longitude: userLocation.longitude,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  } : {
    latitude: 39.5,
    longitude: -8.0,
    latitudeDelta: 3,
    longitudeDelta: 3,
  }

  return (
    <View style={styles.container}>
      {/* Filtros por cima do mapa */}
      <View style={[styles.filtersContainer, { top: insets.top + 8 }]}>
        <View style={styles.filters}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filterBtn, activeFilter === f && styles.filterBtnActive]}
              onPress={() => { setActiveFilter(f); setSelected(null) }}
            >
              <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Mapa */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={() => setSelected(null)}
      >
        {observations.map(obs => (
          <Marker
            key={obs.id}
            coordinate={obs.coords}
            onPress={() => setSelected(obs)}
            pinColor={STATUS_COLORS[obs.status] || '#888'}
          >
            <View style={[styles.pin, { backgroundColor: STATUS_COLORS[obs.status] || '#888' }]}>
              <Ionicons name="leaf" size={14} color="#fff" />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Legenda */}
      <View style={styles.legend}>
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <View key={status} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={styles.legendText}>{STATUS_LABELS[status]}</Text>
          </View>
        ))}
      </View>

      {/* Botão recentrar */}
      <TouchableOpacity style={[styles.recenterBtn, { bottom: selected ? 200 : 90 }]} onPress={centerOnUser}>
        <Ionicons name="locate" size={30} color="#1a3c2e" />
      </TouchableOpacity>

      {/* Card de detalhe */}
      {selected && (
        <TouchableOpacity style={styles.card} activeOpacity={0.95} onPress={() => setSelected(null)}>
          <View style={styles.cardInner}>
            {selected.photos?.[0] ? (
              <Image source={{ uri: selected.photos[0].url }} style={styles.cardPhoto} />
            ) : (
              <View style={styles.cardPhotoPlaceholder}>
                <Ionicons name="leaf-outline" size={28} color="#ccc" />
              </View>
            )}
            <View style={styles.cardContent}>
              <View style={styles.cardTopRow}>
                <Text style={styles.cardSpecies} numberOfLines={1}>
                  {selected.species?.scientific_name || selected.suggested_species || 'A confirmar...'}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[selected.status] + '22' }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLORS[selected.status] }]}>
                    {STATUS_LABELS[selected.status]}
                  </Text>
                </View>
              </View>
              {selected.species?.common_name_pt && (
                <Text style={styles.cardCommon}>{selected.species.common_name_pt}</Text>
              )}
              <Text style={styles.cardDate}>
                {new Date(selected.observed_at).toLocaleDateString('pt-PT')}
              </Text>
              <View style={styles.cardFooter}>
                <View style={styles.userRow}>
                  <View style={styles.avatar}>
                    <Ionicons name="person" size={12} color="#fff" />
                  </View>
                  <Text style={styles.username}>@{selected.user?.username}</Text>
                </View>
                <TouchableOpacity onPress={() => router.push(`/observation/${selected.id}`)}>
                  <Text style={styles.detailLink}>Ver detalhes →</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      )}

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#1a3c2e" />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  filtersContainer: { position: 'absolute', left: 0, right: 0, zIndex: 10, alignItems: 'center' },
  filters: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 20, padding: 4, gap: 4, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  filterBtnActive: { backgroundColor: '#1a3c2e' },
  filterText: { fontSize: 13, color: '#555' },
  filterTextActive: { color: '#fff', fontWeight: '600' },
  pin: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff', elevation: 3 },
  legend: { position: 'absolute', bottom: 90, left: 16, backgroundColor: '#fff', borderRadius: 10, padding: 14, gap: 4, elevation: 3 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 10},
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 14, color: '#555' },
  recenterBtn: { position: 'absolute', right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', elevation: 4 },
  card: { position: 'absolute', bottom: 80, left: 16, right: 16 },
  cardInner: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', elevation: 5 },
  cardPhoto: { width: 90, height: 90 },
  cardPhotoPlaceholder: { width: 90, height: 90, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  cardContent: { flex: 1, padding: 10 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  cardSpecies: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginLeft: 6 },
  statusText: { fontSize: 11, fontWeight: '600' },
  cardCommon: { fontSize: 12, color: '#666', marginBottom: 2 },
  cardDate: { fontSize: 11, color: '#999', marginBottom: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  avatar: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#1a3c2e', justifyContent: 'center', alignItems: 'center' },
  username: { fontSize: 12, color: '#555' },
  detailLink: { fontSize: 12, color: '#1a3c2e', fontWeight: '600' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff80' },
})