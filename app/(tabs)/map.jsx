import { useState, useRef, useCallback, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Switch, TextInput } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MapView, { Marker } from 'react-native-maps'
import * as Location from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'expo-router'
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';

const FILTERS = ['Todas', 'Animais', 'Plantas', 'Fungos']
const KINGDOM_MAP = { 'Animais': 'ANIMALIA', 'Plantas': 'PLANTAE', 'Fungos': 'FUNGI' }

const STATUS_COLORS = {
  VALIDATED: '#0d723b',
  PENDING: '#fdb924',
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
  const [filteredObservations, setFilteredObservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('Todas')
  const [selected, setSelected] = useState(null)
  const [userLocation, setUserLocation] = useState(null)

  // Estados dos filtros sugeridos
  const [showAllUsers, setShowAllUsers] = useState(false) // false = As minhas, true = Gerais
  const [taxSearch, setTaxSearch] = useState('') 
  const [appliedTaxFilter, setAppliedTaxFilter] = useState('') 

  useEffect(() => {
    fetchObservations()
    getUserLocation()
  }, [activeFilter])

  useEffect(() => {
    applyLocalFilters()
  }, [observations, showAllUsers, appliedTaxFilter])

  async function getUserLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') return
    const loc = await Location.getCurrentPositionAsync({})
    setUserLocation(loc.coords)
  }

  async function fetchObservations() {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_observations', {
      p_status: null,
      p_kingdom: activeFilter !== 'Todas' ? KINGDOM_MAP[activeFilter] : null,
      p_date_from: null,
    })

    if (!error && data) {
      const validObs = data.filter(o => o.latitude != null && o.longitude != null)
      const ids = validObs.map(o => o.id)

      const { data: photosData } = await supabase
        .from('photos')
        .select('observation_id, url, is_primary')
        .in('observation_id', ids)

      const parsed = validObs.map(o => ({
        ...o,
        coords: { latitude: o.latitude, longitude: o.longitude },
        species: { scientific_name: o.scientific_name, common_name_pt: o.common_name_pt },
        user: { username: o.username, avatar_url: o.avatar_url },
        photos: (photosData || []).filter(p => p.observation_id === o.id),
      }))

      setObservations(parsed)
    }
    setLoading(false)
  }

  async function applyLocalFilters() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let result = [...observations]

    // 1. Nova Regra de Privacidade e Estados (Gerais vs As Minhas)
    if (showAllUsers) {
      result = result.filter(o => o.status === 'VALIDATED')
    } else {
      result = result.filter(o => o.user_id === user.id)
    }

    // 2. Filtro da Árvore Taxonómica Remediado
    if (appliedTaxFilter.trim()) {
      const searchTxt = appliedTaxFilter.toLowerCase().trim()
      result = result.filter(o => {
        const scientificName = o.scientific_name || o.suggested_species || ""
        const derivedGenus = scientificName.split(" ")[0] || ""

        return (
          scientificName.toLowerCase().includes(searchTxt) ||
          derivedGenus.toLowerCase().includes(searchTxt) ||
          o.common_name_pt?.toLowerCase().includes(searchTxt) ||
          o.filo?.toLowerCase().includes(searchTxt) ||
          o.classe?.toLowerCase().includes(searchTxt) ||
          o.ordem?.toLowerCase().includes(searchTxt) ||
          o.familia?.toLowerCase().includes(searchTxt)
        )
      })
    }

    setFilteredObservations(result)
  }

  function handleApplyTaxonomy() {
    setAppliedTaxFilter(taxSearch)
    setSelected(null)
  }

  function handleClearTaxonomy() {
    setTaxSearch('')
    setAppliedTaxFilter('')
    setSelected(null)
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
      
      {/* 1. CONTROLOS DO TOPO (Apenas Pesquisa e Reinos) */}
      <View style={[styles.topControlsContainer, { top: insets.top + 8 }]}>
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Pesquisar Espécie, Género ou Nome Comum..."
            value={taxSearch}
            onChangeText={setTaxSearch}
            placeholderTextColor="#999"
            autoCorrect={false}
          />
          {appliedTaxFilter ? (
            <TouchableOpacity style={styles.clearSearchBtn} onPress={handleClearTaxonomy}>
              <Ionicons name="close-circle" size={20} color="#888" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.searchBtn} onPress={handleApplyTaxonomy}>
            <Text style={styles.searchBtnText}>Aplicar</Text>
          </TouchableOpacity>
        </View>

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

      {/* MAPA */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={() => setSelected(null)}
      >
        {filteredObservations.map(obs => (
          <Marker
            key={obs.id}
            coordinate={obs.coords}
            onPress={() => setSelected(obs)}
            pinColor={STATUS_COLORS[obs.status] || '#888'}
          >
            <View style={[styles.pin, { backgroundColor: STATUS_COLORS[obs.status] || '#888' }]}>
              <FontAwesome6 name="feather-pointed" size={14} color="#fff" />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* 2. ELEMENTOS DO FUNDO DO MAPA (Legenda, Switch e Recentrar) */}
      
      {/* Legenda (Esquerda) */}
      {!showAllUsers && (
        <View style={styles.legend}>
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <View key={status} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendText}>{STATUS_LABELS[status]}</Text>
            </View>
          ))}
        </View>
      )}

      {/* O Switch (Direita) - Totalmente independente agora! */}
      <View style={styles.switchRow}>
        <Text style={[styles.switchLabel, !showAllUsers && styles.switchLabelActive]}>As minhas</Text>
        <Switch
          trackColor={{ false: '#767577', true: '#0d723b' }}
          thumbColor={showAllUsers ? '#fff' : '#f4f3f4'}
          ios_backgroundColor="#3e3e3e"
          onValueChange={(val) => { setShowAllUsers(val); setSelected(null); }}
          value={showAllUsers}
        />
        <Text style={[styles.switchLabel, showAllUsers && styles.switchLabelActive]}>Gerais</Text>
      </View>

      {/* Botão recentrar */}
      <TouchableOpacity style={[styles.recenterBtn, { bottom: selected ? 200 : 90 }]} onPress={centerOnUser}>
        <Ionicons name="locate" size={30} color="#0d723b" />
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
                  <Text style={styles.username}>@{selected.user?.username || 'utilizador'}</Text>
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
          <ActivityIndicator size="large" color="#0d723b" />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  topControlsContainer: { position: 'absolute', left: 16, right: 16, zIndex: 10, gap: 8 },
  filters: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 20, padding: 4, gap: 4, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, justifyContent: 'center' },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, flex: 1, alignItems: 'center' },
  filterBtnActive: { backgroundColor: '#0d723b' },
  filterText: { fontSize: 13, color: '#555' },
  filterTextActive: { color: '#fff', fontWeight: '600' },
  switchRow: { position: 'absolute', bottom: 625, right: 16, zIndex: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 0, borderRadius: 25, gap: 8, elevation: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  switchLabel: { fontSize: 12, color: '#777', fontWeight: '500' },
  switchLabelActive: { color: '#0d723b', fontWeight: '700' },
  
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, paddingLeft: 12, paddingRight: 4, paddingVertical: 3, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6 },
  searchInput: { flex: 1, fontSize: 13, color: '#333', height: 36, paddingVertical: 0 },
  clearSearchBtn: { padding: 4, marginRight: 4 },
  searchBtn: { backgroundColor: '#0d723b', borderRadius: 15, paddingHorizontal: 12, paddingVertical: 8 },
  searchBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  pin: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff', elevation: 3 },
  legend: { position: 'absolute', bottom: 600, left: 16, zIndex: 10, backgroundColor: '#fff', borderRadius: 10, padding: 10, gap: 4, elevation: 3, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 10},
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: '#555' },
  
  recenterBtn: { position: 'absolute', right: 16, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', elevation: 4 },
  card: { position: 'absolute', bottom: 80, left: 16, right: 16, zIndex: 11 },
  cardInner: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', elevation: 5 },
  cardPhoto: { width: 100, height: 110 },
  cardPhotoPlaceholder: { width: 90, height: 110, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  cardContent: { flex: 1, padding: 10 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  cardSpecies: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginLeft: 6 },
  statusText: { fontSize: 11, fontWeight: '600' },
  cardCommon: { fontSize: 12, color: '#666', marginBottom: 2 },
  cardDate: { fontSize: 11, color: '#999', marginBottom: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  avatar: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#0d723b', justifyContent: 'center', alignItems: 'center' },
  username: { fontSize: 12, color: '#555' },
  detailLink: { fontSize: 14, color: '#0d723b', fontWeight: '600' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff80', zIndex: 20 },
})