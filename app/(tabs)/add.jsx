import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import * as FileSystem from 'expo-file-system/legacy'

const KINGDOM_OPTIONS = [
  { label: "Animais", value: "ANIMALIA" },
  { label: "Plantas", value: "PLANTAE" },
  { label: "Fungos", value: "FUNGI" },
];

export default function Add() {
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState([]);
  const [description, setDescription] = useState("");
  const [suggestedSpecies, setSuggestedSpecies] = useState("");
  const [suggestedKingdom, setSuggestedKingdom] = useState("ANIMALIA");
  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);

  async function pickFromGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permissão necessária", "Precisamos de acesso à galeria.");
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
      Alert.alert("Permissão necessária", "Precisamos de acesso à câmara.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      setPhotos((prev) => [...prev, ...result.assets].slice(0, 5));
    }
  }

  async function getLocation() {
    setLoadingLocation(true);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permissão necessária",
        "Precisamos de acesso à localização.",
      );
      setLoadingLocation(false);
      return;
    }
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    setLocation(loc.coords);

    const geocode = await Location.reverseGeocodeAsync({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    });
    if (geocode.length > 0) {
      const g = geocode[0];
      setLocationName([g.city, g.region, g.country].filter(Boolean).join(", "));
    }
    setLoadingLocation(false);
  }

  function removePhoto(index) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadPhoto(uri, observationId, index) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const ext = uri.split(".").pop().toLowerCase().split("?")[0];
    const path = `${user.id}/${observationId}/${index}.${ext}`;

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    })

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

    const {
      data: { publicUrl },
    } = supabase.storage.from("fotosEspecie").getPublicUrl(path);

    return { path, publicUrl };
  }

  async function handleSubmit() {
    if (!description.trim()) {
      Alert.alert("Erro", "A descrição é obrigatória.");
      return;
    }
    if (!location) {
      Alert.alert(
        "Erro",
        'A localização é obrigatória. Clica em "Obter localização".',
      );
      return;
    }
    if (!suggestedKingdom) {
      Alert.alert("Erro", "Seleciona o grupo: Animais, Plantas ou Fungos.");
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Criar observação
      const { data: obs, error: obsError } = await supabase
        .from("observations")
        .insert({
          user_id: user.id,
          description: description.trim(),
          suggested_species: suggestedSpecies.trim() || null,
          suggested_kingdom: suggestedKingdom,
          location: `POINT(${location.longitude} ${location.latitude})`,
          observed_at: new Date().toISOString(),
          is_public: isPublic,
          status: "PENDING",
        })
        .select()
        .single();

      if (obsError) throw obsError;

      // Upload das fotos
      if (photos.length > 0) {
        for (let i = 0; i < photos.length; i++) {
          const { path, publicUrl } = await uploadPhoto(
            photos[i].uri,
            obs.id,
            i,
          );
          await supabase.from("photos").insert({
            observation_id: obs.id,
            storage_path: path,
            url: publicUrl,
            is_primary: i === 0,
            order_index: i,
          });
        }
      }

      Alert.alert(
        "Sucesso!",
        "Observação submetida. Ficará pendente até ser validada.",
        [{ text: "OK", onPress: () => resetForm() }],
      );
    } catch (error) {
      Alert.alert("Erro", error.message);
    }
    setLoading(false);
  }

  function resetForm() {
    setPhotos([]);
    setDescription("");
    setSuggestedSpecies("");
    setSuggestedKingdom("ANIMALIA");
    setLocation(null);
    setLocationName("");
    setIsPublic(true);
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Nova observação</Text>
      </View>

      {/* Fotos */}
      <View style={styles.section}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.photosRow}
        >
          {photos.map((photo, index) => (
            <View key={index} style={styles.photoThumb}>
              <Image source={{ uri: photo.uri }} style={styles.photoImage} />
              {index === 0 && (
                <View style={styles.primaryBadge}>
                  <Text style={styles.primaryBadgeText}>Principal</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.removePhoto}
                onPress={() => removePhoto(index)}
              >
                <Ionicons name="close-circle" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 5 && (
            <TouchableOpacity
              style={styles.addPhotoBtn}
              onPress={pickFromGallery}
            >
              <Ionicons name="add" size={28} color="#999" />
            </TouchableOpacity>
          )}
        </ScrollView>

        <View style={styles.photoButtons}>
          <TouchableOpacity style={styles.photoBtn} onPress={pickFromCamera}>
            <Ionicons name="camera-outline" size={20} color="#fff" />
            <Text style={styles.photoBtnText}>Câmara</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.photoBtn, styles.photoBtnOutline]}
            onPress={pickFromGallery}
          >
            <Ionicons name="images-outline" size={20} color="#1a3c2e" />
            <Text style={[styles.photoBtnText, { color: "#1a3c2e" }]}>
              Galeria
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Espécie sugerida */}
      <View style={styles.section}>
        <Text style={styles.label}>
          Espécie sugerida <Text style={styles.optional}>(opcional)</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Procurar ou escrever nome..."
          value={suggestedSpecies}
          onChangeText={setSuggestedSpecies}
          placeholderTextColor="#999"
        />
        <Text style={styles.hint}>
          <Ionicons name="information-circle-outline" size={13} color="#999" />{" "}
          Um técnico irá confirmar a classificação
        </Text>
      </View>

      {/* Grupo sugerido */}
      <View style={styles.section}>
        <Text style={styles.label}>Grupo da observação</Text>
        <View style={styles.kingdomRow}>
          {KINGDOM_OPTIONS.map((option) => {
            const selected = suggestedKingdom === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.kingdomBtn, selected && styles.kingdomBtnActive]}
                onPress={() => setSuggestedKingdom(option.value)}
              >
                <Text style={[styles.kingdomBtnText, selected && styles.kingdomBtnTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>Este valor é inicial e pode ser corrigido no backoffice.</Text>
      </View>

      {/* Descrição */}
      <View style={styles.section}>
        <Text style={styles.label}>Descrição</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Descreve o que observaste..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          placeholderTextColor="#999"
        />
      </View>

      {/* Localização */}
      <View style={styles.section}>
        <Text style={styles.label}>Localização</Text>
        <TouchableOpacity
          style={styles.locationBtn}
          onPress={getLocation}
          disabled={loadingLocation}
        >
          {loadingLocation ? (
            <ActivityIndicator size="small" color="#1a3c2e" />
          ) : (
            <>
              <Ionicons name="location-outline" size={20} color="#1a3c2e" />
              <Text style={styles.locationBtnText}>
                {location
                  ? locationName ||
                    `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
                  : "Obter localização atual"}
              </Text>
              {location && (
                <Ionicons name="pencil-outline" size={16} color="#999" />
              )}
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Data */}
      <View style={styles.section}>
        <Text style={styles.label}>Data e hora da observação</Text>
        <View style={styles.dateBox}>
          <Ionicons name="calendar-outline" size={18} color="#666" />
          <Text style={styles.dateText}>
            {new Date().toLocaleString("pt-PT")}
          </Text>
        </View>
      </View>

      {/* Observação pública */}
      <View style={[styles.section, styles.switchRow]}>
        <View>
          <Text style={styles.label}>Observação pública</Text>
          <Text style={styles.hint}>Visível após validação</Text>
        </View>
        <Switch
          value={isPublic}
          onValueChange={setIsPublic}
          trackColor={{ false: "#ddd", true: "#1a3c2e" }}
          thumbColor="#fff"
        />
      </View>

      {/* Submeter */}
      <TouchableOpacity
        style={styles.submitBtn}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitBtnText}>Submeter observação →</Text>
        )}
      </TouchableOpacity>
      <Text style={styles.submitHint}>
        A submissão fica em estado pendente até validação
      </Text>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerTitle: { fontSize: 20, fontWeight: "bold", color: "#1a3c2e" },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  label: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 },
  optional: { fontWeight: "400", color: "#999" },
  hint: { fontSize: 12, color: "#999", marginTop: 6 },
  kingdomRow: { flexDirection: "row", gap: 8 },
  kingdomBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  kingdomBtnActive: {
    backgroundColor: "#1a3c2e",
    borderColor: "#1a3c2e",
  },
  kingdomBtnText: { fontSize: 13, color: "#555", fontWeight: "600" },
  kingdomBtnTextActive: { color: "#fff" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#333",
  },
  textArea: { height: 100, textAlignVertical: "top" },
  photosRow: { flexDirection: "row", marginBottom: 12 },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 8,
    position: "relative",
  },
  photoImage: { width: 80, height: 80, borderRadius: 8 },
  primaryBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "#1a3c2e",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  primaryBadgeText: { color: "#fff", fontSize: 9, fontWeight: "600" },
  removePhoto: { position: "absolute", top: -6, right: -6 },
  addPhotoBtn: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#ddd",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
  },
  photoButtons: { flexDirection: "row", gap: 10 },
  photoBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1a3c2e",
    borderRadius: 8,
    padding: 12,
    gap: 6,
  },
  photoBtnOutline: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#1a3c2e",
  },
  photoBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  locationBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  locationBtnText: { flex: 1, fontSize: 14, color: "#333" },
  dateBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  dateText: { fontSize: 14, color: "#333" },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  submitBtn: {
    margin: 16,
    backgroundColor: "#1a3c2e",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
  },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  submitHint: {
    textAlign: "center",
    fontSize: 12,
    color: "#999",
    marginTop: -8,
  },
});
