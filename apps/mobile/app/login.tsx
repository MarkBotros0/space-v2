import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { login } from "../src/lib/api-client";

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      // login() already stores the token pair. The session store write moves
      // to useLogin in Task 6, which follows up with /me to get the scopes
      // (seasonAdminIds, groupLeaderIds, graduationYear) this response
      // doesn't carry.
      await login(email, password);
      router.replace("/home");
    } catch {
      setError("Incorrect email or password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 28, fontWeight: "600", marginBottom: 12 }}>JPC Space</Text>

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }}
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }}
      />

      {error ? <Text style={{ color: "#b00020" }}>{error}</Text> : null}

      <Pressable
        onPress={onSubmit}
        disabled={busy}
        style={{ backgroundColor: "#1f2937", borderRadius: 8, padding: 14, alignItems: "center" }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>Sign in</Text>
      </Pressable>
    </View>
  );
}
