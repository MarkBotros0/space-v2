import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { passwordSchema } from "@space/shared";

import { AuthCard, AuthField, AuthLink, AuthNotice } from "../src/design/layout/auth-card";
import { Button, Input, PasswordInput } from "../src/design/ui";
import { useAcceptInvite } from "../src/hooks/use-accept-invite";

/**
 * The route v1 never built (spec 11 D1 — every invite it ever sent landed on
 * a 404). Anonymous: it lives OUTSIDE (app), beside login, and posts the
 * code + chosen password to the anonymous accept endpoint. The code arrives
 * by email and is typed/pasted here — never carried in a URL (D10, R24).
 * With no v1 page to match, it uses v1's signed-out frame and the same parts
 * as /reset-password, so it follows the theme like the other signed-out pages.
 */
export default function AcceptInviteScreen() {
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
      <AuthCard title="Your account is ready" description="Sign in with your email and the password you just chose.">
        <Button size="lg" className="w-full" onPress={() => router.replace("/login")}>
          Go to sign in
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Activate your account" description="Enter the invite code from your email and choose a password.">
      <View className="flex-col gap-4">
        {failure ? <AuthNotice tone="error">{failure}</AuthNotice> : null}
        <AuthField label="Invite code">
          <Input
            size="lg"
            accessibilityLabel="Invite code"
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </AuthField>
        <AuthField label="Choose a password" error={passwordError ?? undefined}>
          <PasswordInput size="lg" accessibilityLabel="Choose a password" value={password} onChangeText={setPassword} />
        </AuthField>
        <AuthField label="Confirm password" error={confirmError ?? undefined}>
          <PasswordInput size="lg" accessibilityLabel="Confirm password" value={confirm} onChangeText={setConfirm} />
        </AuthField>
        <Button
          size="lg"
          className="w-full"
          onPress={submit}
          disabled={acceptInvite.isPending || !code.trim() || !password || !confirm}
        >
          Activate account
        </Button>
        <AuthLink label="Back to sign in" onPress={() => router.replace("/login")} />
      </View>
    </AuthCard>
  );
}
