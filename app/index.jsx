import { Redirect } from "expo-router";
import { useAuth } from "../lib/auth"; 

export default function Index() {
  const { session, loading } = useAuth();

  if (loading) return null; // ou um spinner

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }
  return <Redirect href="/(tabs)/feed" />;
}