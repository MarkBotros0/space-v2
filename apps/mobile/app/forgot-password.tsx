import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { PASSWORD_RESET_TTL_MINUTES, forgotPasswordRequestSchema } from "@space/shared";

import { useForgotPassword } from "../src/hooks/use-password-reset";
import { apiErrorMessage } from "../src/lib/api-error";
import { useTheme } from "../src/theme";
import { Button, Input, Screen, Text } from "../src/ui";

/**
 * v1's /forgot-password (app/forgot-password/page.tsx), anonymous, outside
 * (app). The confirmation is the same whether or not the address exists
 * (R67) — the API answers before it even looks (Plan 10 Decision 9).
 */
export default function ForgotPasswordScreen() {
  const theme = useTheme();
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
    <Screen scroll>
      <View style={{ flex: 1, justifyContent: "center", gap: theme.spacing.md }}>
        <Text variant="heading">Forgot password</Text>
        {sent ? (
          <Text variant="body">
            {`If an account exists for that email, we've sent a reset code. It expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.`}
          </Text>
        ) : (
          <>
            <Text variant="body" color={theme.colors.neutral[600]}>
              Enter your account's email and we'll send you a reset code.
            </Text>
            {failure ? (
              <Text variant="body" color={theme.colors.error[600]} accessibilityRole="alert">
                {failure}
              </Text>
            ) : null}
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              error={emailError ?? undefined}
            />
            <Button title="Send reset code" onPress={submit} loading={forgot.isPending} disabled={!email.trim()} />
          </>
        )}
        <Button title="I have a reset code" variant="secondary" onPress={() => router.push("/reset-password")} />
        <Button title="Back to sign in" variant="ghost" onPress={() => router.replace("/login")} />
      </View>
    </Screen>
  );
}
