import { Text, View } from "react-native";

import { useSessionStore } from "../src/store/session";

export default function HomeScreen() {
  const user = useSessionStore((s) => s.user);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
      <Text style={{ fontSize: 20, fontWeight: "600" }}>Signed in</Text>
      <Text>{user ? `${user.name} — ${user.role}` : "No session"}</Text>
    </View>
  );
}
