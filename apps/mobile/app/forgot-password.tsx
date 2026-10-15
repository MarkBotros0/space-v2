import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { PASSWORD_RESET_TTL_MINUTES, forgotPasswordRequestSchema } from "@space/shared";

import { AuthCard, AuthField, AuthLink, AuthNotice } from "../src/design/layout/auth-card";
import { Button, Input } from "../src/design/ui";
import { useForgotPassword } from "../src/hooks/use-password-reset";
import { apiErrorMessage } from "../src/lib/api-error";

/**
 * v1's /forgot-password (app/forgot-password/page.tsx), anonymous, outside
 * (app). The confirmation is the same whether or not the address exists
 * (R67) — the API answers before it even looks (Plan 10 Decision 9).
 * Layout is v1's; the copy says "code" because the app takes a pasted code
 * (Plan 10), not v1's link.
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const forgot = useForgotPassword();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = () => {
    setEmailError(null);
    setFailure(null);
    const parsed = forgotPasswordRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? "Must be a valid email.");
      return;
    }
    forgot.mutate(parsed.data, {
      onSuccess: () => setSent(true),
      // Only transport trouble or the rate limiter can land here.
      onError: (err) =>
        setFailure(apiErrorMessage(err, "Couldn't send the request. Check your connection and try again.")),
    });
  };

  return (
    <AuthCard title="Forgot password" description="We'll email you a reset code.">
      {sent ? (
        <View className="mb-4">
          <AuthNotice tone="success">
            {`If an account exists for that email, we've sent a reset code. It expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.`}
          </AuthNotice>
        </View>
      ) : null}
      <View className="flex-col gap-4">
        {failure ? <AuthNotice tone="error">{failure}</AuthNotice> : null}
        <AuthField label="Email" error={emailError ?? undefined}>
          <Input
            size="lg"
            accessibilityLabel="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </AuthField>
        <Button size="lg" className="w-full" onPress={submit} disabled={forgot.isPending || !email.trim()}>
          Send reset code
        </Button>
        <AuthLink label="I have a reset code" onPress={() => router.push("/reset-password")} />
        <AuthLink label="Back to sign in" onPress={() => router.replace("/login")} />
      </View>
    </AuthCard>
  );
}
