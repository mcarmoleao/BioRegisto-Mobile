import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#1a3c2e',
      tabBarInactiveTintColor: '#999',
    }}>
      <Tabs.Screen name="feed" options={{ title: 'Feed', tabBarIcon: ({ color }) => <Ionicons name="leaf-outline" size={24} color={color} /> }} />
      <Tabs.Screen name="map" options={{ title: 'Mapa', tabBarIcon: ({ color }) => <Ionicons name="map-outline" size={24} color={color} /> }} />
      <Tabs.Screen name="add" options={{ title: 'Add', tabBarIcon: ({ color }) => <Ionicons name="camera-outline" size={24} color={color} /> }} />
      <Tabs.Screen name="history" options={{ title: 'Histórico', tabBarIcon: ({ color }) => <Ionicons name="time-outline" size={24} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil', tabBarIcon: ({ color }) => <Ionicons name="person-outline" size={24} color={color} /> }} />
    </Tabs>
  )
}