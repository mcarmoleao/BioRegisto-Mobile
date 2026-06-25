import { useState } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, 
  ScrollView, ActivityIndicator, Image, Switch, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import MapView, { Marker } from "react-native-maps"; 
import { supabase } from "../../lib/supabase";
import * as FileSystem from 'expo-file-system/legacy'
import CustomAlert from '../_components/CustomAlert'

export default function Add() {
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState([]);
  const [description, setDescription] = useState("");
  const [suggestedSpecies, setSuggestedSpecies] = useState("");
  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  
  // Estado para controlar o Alerta Customizado
  const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', buttons: [] });

  // Estados para o Mapa Manual
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [mapRegion, setMapRegion] = useState({
    latitude: 39.5000, // Centro de Portugal por defeito
    longitude: -8.0000,
    latitudeDelta: 4.0,
    longitudeDelta: 4.0,
  });
  const [selectedCoords, setSelectedCoords] = useState(null);

  async function pickFromGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      setAlertConfig({
        visible: true,
        title: "Permissão necessária",
        message: "Precisamos de acesso à galeria para escolheres fotos."
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setPhotos((prev) => [...prev, ...result.assets].slice(0, 5));
    }
  }

  async function pickFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      setAlertConfig({
        visible: true,
        title: "Permissão necessária",
        message: "Precisamos de acesso à câmara para tirares fotos."
      });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      setPhotos((prev) => [...prev, ...result.assets].slice(0, 5));
    }
  }

  // Menu de escolha de método de localização
  function handleLocationPress() {
    setAlertConfig({
      visible: true,
      title: "Definir Localização",
      message: "Como quer indicar o local da observação?",
      buttons: [
        { text: "Usar GPS", onPress: () => getLocationGPS() },
        { text: "Selecionar no Mapa", onPress: () => openManualMap() }
      ]
    });
  }

  // Método 1: GPS Automático
  async function getLocationGPS() {
    setLoadingLocation(true);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setAlertConfig({
        visible: true,
        title: "Permissão necessária",
        message: "Precisamos de acesso à localização para obter as coordenadas."
      });
      setLoadingLocation(false);
      return;
    }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      updateLocationState(loc.coords.latitude, loc.coords.longitude);
    } catch (e) {
      setAlertConfig({
        visible: true,
        title: "Erro",
        message: "Não foi possível obter a localização atual por GPS."
      });
    }
    setLoadingLocation(false);
  }

  async function openManualMap() {
    let lat = 39.5000;
    let lng = -8.0000;
    let delta = 4.0;

    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === "granted") {
      try {
        const lastLoc = await Location.getLastKnownPositionAsync();
        if (lastLoc) {
          lat = lastLoc.coords.latitude;
          lng = lastLoc.coords.longitude;
          delta = 0.05;
        }
      } catch (e) {}
    }

    if (location) {
      lat = location.latitude;
      lng = location.longitude;
      delta = 0.01;
    }

    setMapRegion({
      latitude: lat,
      longitude: lng,
      latitudeDelta: delta,
      longitudeDelta: delta,
    });
    setSelectedCoords(location ? { latitude: location.latitude, longitude: location.longitude } : { latitude: lat, longitude: lng });
    setMapModalVisible(true);
  }

  async function updateLocationState(latitude, longitude) {
    setLocation({ latitude, longitude });
    setLocationName("A carregar nome da rua/zona...");
    
    try {
      const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (geocode.length > 0) {
        const g = geocode[0];
        const name = [g.street, g.city, g.country].filter(Boolean).join(", ");
        setLocationName(name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
      } else {
        setLocationName(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
      }
    } catch (e) {
      setLocationName(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
    }
  }

  function confirmManualLocation() {
    if (selectedCoords) {
      updateLocationState(selectedCoords.latitude, selectedCoords.longitude);
    }
    setMapModalVisible(false);
  }

  function removePhoto(index) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadPhoto(uri, observationId, index) {
    const { data: { user } } = await supabase.auth.getUser();
    const ext = uri.split(".").pop().toLowerCase().split("?")[0];
    const path = `${user.id}/${observationId}/${index}.${ext}`;

    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);

    const { error } = await supabase.storage
      .from("fotosEspecie")
      .upload(path, byteArray, { contentType: `image/${ext}`, upsert: true });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage.from("fotosEspecie").getPublicUrl(path);
    return { path, publicUrl };
  }

  async function handleSubmit() {
    // 1. Validação Obrigatória: Fotografias
    if (photos.length === 0) {
      setAlertConfig({
        visible: true,
        title: "Erro de validação",
        message: "Precisas de adicionar pelo menos 1 fotografia para a observação."
      });
      return;
    }

    // 2. Validação Obrigatória: Localização
    if (!location) {
      setAlertConfig({
        visible: true,
        title: "Erro de validação",
        message: 'A localização é obrigatória. Clica em "Definir localização".'
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: obs, error: obsError } = await supabase
        .from("observations")
        .insert({
          user_id: user.id,
          description: description.trim() || null, // Se estiver vazia, guarda NULL na BD
          suggested_species: suggestedSpecies.trim() || null,
          location: `POINT(${location.longitude} ${location.latitude})`,
          observed_at: new Date().toISOString(),
          is_public: isPublic,
          status: "PENDING",
        })
        .select()
        .single();

      if (obsError) throw obsError;

      if (photos.length > 0) {
        for (let i = 0; i < photos.length; i++) {
          const { path, publicUrl } = await uploadPhoto(photos[i].uri, obs.id, i);
          await supabase.from("photos").insert({
            observation_id: obs.id,
            storage_path: path,
            url: publicUrl,
            is_primary: i === 0,
            order_index: i,
          });
        }
      }

      setAlertConfig({
        visible: true,
        title: "Sucesso!",
        message: "Observação submetida para avaliação.",
        buttons: [{ text: "OK", onPress: () => resetForm() }]
      });
    } catch (error) {
      setAlertConfig({
        visible: true,
        title: "Erro ao submeter",
        message: error.message
      });
    }
    setLoading(false);
  }

  function resetForm() {
    setPhotos([]);
    setDescription("");
    setSuggestedSpecies("");
    setLocation(null);
    setLocationName("");
    setIsPublic(true);
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView style={[styles.container, { paddingTop: insets.top }]} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Nova observação</Text>
        </View>

        {/* Fotos */}
        <View style={styles.section}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosRow}>
            {photos.map((photo, index) => (
              <View key={index} style={styles.photoThumb}>
                <Image source={{ uri: photo.uri }} style={styles.photoImage} />
                {index === 0 && (
                  <View style={styles.primaryBadge}><Text style={styles.primaryBadgeText}>Principal</Text></View>
                )}
                <TouchableOpacity style={styles.removePhoto} onPress={() => removePhoto(index)}>
                  <Ionicons name="close-circle" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            {photos.length < 5 && (
              <TouchableOpacity style={styles.addPhotoBtn} onPress={pickFromGallery}>
                <Ionicons name="add" size={28} color="#999" />
              </TouchableOpacity>
            )}
          </ScrollView>

          <View style={styles.photoButtons}>
            <TouchableOpacity style={styles.photoBtn} onPress={pickFromCamera}>
              <Ionicons name="camera-outline" size={20} color="#fff" />
              <Text style={styles.photoBtnText}>Câmara</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.photoBtn, styles.photoBtnOutline]} onPress={pickFromGallery}>
              <Ionicons name="images-outline" size={20} color="#0d723b" />
              <Text style={[styles.photoBtnText, { color: "#0d723b" }]}>Galeria</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Espécie sugerida */}
        <View style={styles.section}>
          <Text style={styles.label}>Espécie sugerida <Text style={styles.optional}>(opcional)</Text></Text>
          <TextInput style={styles.input} placeholder="Procurar ou escrever nome..." value={suggestedSpecies} onChangeText={setSuggestedSpecies} placeholderTextColor="#999" />
        </View>

        {/* Descrição */}
        <View style={styles.section}>
          <Text style={styles.label}>Descrição <Text style={styles.optional}>(opcional)</Text></Text>
          <TextInput style={[styles.input, styles.textArea]} placeholder="Descreve o que observaste (opcional)..." value={description} onChangeText={setDescription} multiline numberOfLines={4} placeholderTextColor="#999" />
        </View>

        {/* Localização Dinâmica */}
        <View style={styles.section}>
          <Text style={styles.label}>Localização</Text>
          <TouchableOpacity style={styles.locationBtn} onPress={handleLocationPress} disabled={loadingLocation}>
            {loadingLocation ? (
              <ActivityIndicator size="small" color="#0d723b" />
            ) : (
              <>
                <Ionicons name="location-outline" size={20} color="#0d723b" />
                <Text style={styles.locationBtnText} numberOfLines={1}>
                  {location ? locationName || `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : "Definir localização da observação"}
                </Text>
                <Ionicons name="chevron-down-outline" size={16} color="#999" />
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Data */}
        <View style={styles.section}>
          <Text style={styles.label}>Data e hora da observação</Text>
          <View style={styles.dateBox}>
            <Ionicons name="calendar-outline" size={18} color="#666" />
            <Text style={styles.dateText}>{new Date().toLocaleString("pt-PT")}</Text>
          </View>
        </View>

        {/* Submeter */}
        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submeter observação →</Text>}
        </TouchableOpacity>

        {/* MODAL DO MAPA MANUAL */}
        <Modal visible={mapModalVisible} animationType="slide" transparent={false}>
          <View style={styles.modalContainer}>
            <View style={[styles.modalHeader, { paddingTop: insets.top + 10 }]}>
              <Text style={styles.modalTitle}>Arrasta o marcador para o local correto</Text>
            </View>
            
            <MapView 
              style={styles.map} 
              initialRegion={mapRegion}
              onPress={(e) => setSelectedCoords(e.nativeEvent.coordinate)}
            >
              {selectedCoords && (
                <Marker 
                  draggable
                  coordinate={selectedCoords} 
                  onDragEnd={(e) => setSelectedCoords(e.nativeEvent.coordinate)}
                  pinColor="#0d723b"
                />
              )}
            </MapView>

            <View style={[styles.modalFooter, { paddingBottom: insets.bottom + 10 }]}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setMapModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={confirmManualLocation}>
                <Text style={styles.modalConfirmText}>Confirmar Local</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Injeção do Alerta Premium */}
      <CustomAlert 
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#eee"},
  headerTitle: { fontSize: 20, fontWeight: "bold", color: "#0d723b" },
  section: {paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f0f0f0"},
  label: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 },
  optional: { fontWeight: "400", color: "#999" },
  input: {borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 12, fontSize: 14, color: "#333"},
  textArea: { height: 100, textAlignVertical: "top" },
  photosRow: { flexDirection: "row", marginBottom: 12 },
  photoThumb: {width: 80, height: 80, borderRadius: 8, marginRight: 8, position: "relative"},
  photoImage: { width: 80, height: 80, borderRadius: 8 },
  primaryBadge: {position: "absolute", bottom: 4, left: 4, backgroundColor: "#0d723b", paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4},
  primaryBadgeText: { color: "#fff", fontSize: 9, fontWeight: "600" },
  removePhoto: { position: "absolute", top: -6, right: -6 },
  addPhotoBtn: {width: 80, height: 80, borderRadius: 8, borderWidth: 2, borderColor: "#ddd", borderStyle: "dashed", justifyContent: "center", alignItems: "center"},
  photoButtons: { flexDirection: "row", gap: 10 },
  photoBtn: {flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#0d723b", borderRadius: 8, padding: 12, gap: 6},
  photoBtnOutline: {backgroundColor: "#fff", borderWidth: 1, borderColor: "#0d723b"},
  photoBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  locationBtn: {flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 12, gap: 8},
  locationBtnText: { flex: 1, fontSize: 14, color: "#333" },
  dateBox: {flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 12, gap: 8},
  dateText: { fontSize: 14, color: "#333" },
  submitBtn: {margin: 16, backgroundColor: "#0d723b", borderRadius: 10, padding: 16, alignItems: "center"},
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  modalContainer: { flex: 1, backgroundColor: "#fff" },
  modalHeader: { padding: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eee", alignItems: "center" },
  modalTitle: { fontSize: 15, fontWeight: "600", color: "#333" },
  map: { flex: 1 },
  modalFooter: { flexDirection: "row", gap: 12, padding: 16, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#eee" },
  modalCancelBtn: { flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: "#ddd", alignItems: "center" },
  modalCancelText: { color: "#666", fontWeight: "600" },
  modalConfirmBtn: { flex: 2, padding: 14, borderRadius: 8, backgroundColor: "#0d723b", alignItems: "center" },
  modalConfirmText: { color: "#fff", fontWeight: "600" }
});