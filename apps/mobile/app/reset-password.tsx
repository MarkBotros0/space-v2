import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { extractResetToken, passwordSchema } from "@space/shared";

import { AuthCard, AuthField, AuthLink, AuthNotice } from "../src/design/layout/auth-card";
import { Button, Input, PasswordInput } from "../src/design/ui";
import { useResetPassword } from "../src/hooks/use-password-reset";
import { apiErrorMessage } from "../src/lib/api-error";

/**
 * v1's /reset-password, anonymous, outside (app). The code arrives three
 * ways: the email's spacev2:// deep link (route param), pasted from the
 * email, or as a pasted v1 web link (same token format — Plan 10 Decision
 * 10). A deep-linked token is copied into state and immediately removed from
 * the route params, and nothing here ever puts it back into a URL — v1
 * re-emitted it into a second history entry on every error (R80).
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const consumedParam = useRef(false);

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const resetPassword = useResetPassword();

  useEffect(() => {
    if (consumedParam.current) return;
    if (typeof params.token === "string" && params.token !== "") {
      consumedParam.current = true;
      setCode(extractResetToken(params.token));
      router.setParams({ token: undefined });
    }
  }, [params.token, router]);

  const submit = () => {
    setCodeError(null);
    setPasswordError(null);
    setConfirmError(null);
    setFailure(null);
    const token = extractResetToken(code);
    if (token.length < 16) {
      setCodeError("Paste the code from your email.");
      return;
    }
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setPasswordError(parsed.error.issues[0]?.message ?? "Invalid password.");
      return;
    }
    if (password !== confirm) {
      setConfirmError("Passwords don't match.");
      return;
    }
    resetPassword.mutate(
      { token, password },
      {
        onSuccess: () => setDone(true),
        // The API has one refusal for every bad code; show its words.
        onError: (err) =>
          setFailure(apiErrorMessage(err, "Couldn't reset your password. Check your connection and try again.")),
      },
    );
  };

  if (done) {
    return (
      <AuthCard
        title="Password updated"
        description="Sign in with your new password. Every other device signed in to this account has been signed out."
      >
        <Button size="lg" className="w-full" onPress={() => router.replace("/login")}>
          Go to sign in
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset password" description="Choose a new password — at least 8 characters.">
      <View className="flex-col gap-4">
        {failure ? (
          <>
            <AuthNotice tone="error">{failure}</AuthNotice>
            <AuthLink label="Request a new code" onPress={() => router.replace("/forgot-password")} />
          </>
        ) : null}
        <AuthField label="Reset code" error={codeError ?? undefined}>
          <Input
            size="lg"
            accessibilityLabel="Reset code"
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </AuthField>
        <AuthField label="New password" error={passwordError ?? undefined}>
          <PasswordInput size="lg" accessibilityLabel="New password" value={password} onChangeText={setPassword} />
        </AuthField>
        <AuthField label="Confirm password" error={confirmError ?? undefined}>
          <PasswordInput size="lg" accessibilityLabel="Confirm password" value={confirm} onChangeText={setConfirm} />
        </AuthField>
        <Button
          size="lg"
          className="w-full"
          onPress={submit}
          disabled={resetPassword.isPending || !code.trim() || !password || !confirm}
        >
          Set new password
        </Button>
        <AuthLink label="Back to sign in" onPress={() => router.replace("/login")} />
      </View>
    </AuthCard>
  );
}
