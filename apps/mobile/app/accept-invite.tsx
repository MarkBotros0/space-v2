import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { passwordSchema } from "@space/shared";

import { useAcceptInvite } from "../src/hooks/use-accept-invite";
import { useTheme } from "../src/theme";
import { Button, Input, Screen, Text } from "../src/ui";

/**
 * The route v1 never built (spec 11 D1 — every invite it ever sent landed on
 * a 404). Anonymous: it lives OUTSIDE (app), beside login, and posts the
 * code + chosen password to the anonymous accept endpoint. The code arrives
 * by email and is typed/pasted here — never carried in a URL (D10, R24).
 */
export default function AcceptInviteScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const acceptInvite = useAcceptInvite();

  const submit = () => {
    setFailure(null);
    setPasswordError(null);
    setConfirmError(null);
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setPasswordError(parsed.error.issues[0]?.message ?? "Invalid password.");
      return;
    }
    if (password !== confirm) {
      setConfirmError("Passwords don't match.");
      return;
    }
    acceptInvite.mutate(
      { token: code.trim(), password },
      {
        onSuccess: () => setDone(true),
        // One message for every failure — the API deliberately tells us no
        // more (invalid_invite covers unknown/used/expired/ineligible alike).
        onError: () => setFailure("That invite is invalid or has expired. Ask for a new one."),
      },
    );
  };

  if (done) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: "center", gap: theme.spacing.md }}>
          <Text variant="heading">Your account is ready</Text>
          <Text variant="body">Sign in with your email and the password you just chose.</Text>
          <Button title="Go to sign in" onPress={() => router.replace("/login")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={{ flex: 1, justifyContent: "center", gap: theme.spacing.md }}>
        <Text variant="heading">Activate your account</Text>
        <Text variant="body" color={theme.colors.neutral[600]}>
          Enter the invite code from your email and choose a password.
        </Text>
        {failure ? (
          <Text
            variant="body"
            color={theme.colors.error[600]}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            {failure}
          </Text>
        ) : null}
        <Input
          label="Invite code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Input
          label="Choose a password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          error={passwordError ?? undefined}
        />
        <Input
          label="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          error={confirmError ?? undefined}
        />
        <Button
          title="Activate account"
          onPress={submit}
          loading={acceptInvite.isPending}
          disabled={!code.trim() || !password || !confirm}
        />
        <Button title="Back to sign in" variant="ghost" onPress={() => router.replace("/login")} />
      </View>
    </Screen>
  );
}
