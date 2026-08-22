import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { AccessibilityInfo, View } from "react-native";
import { loginRequestSchema, type LoginRequest } from "@space/shared";

import { useLogin } from "../src/hooks/use-session";
import { useTheme } from "../src/theme";
import { Button, FormField, Screen, Text } from "../src/ui";

export default function LoginScreen() {
  const router = useRouter();
  const login = useLogin();
  const theme = useTheme();

  // `useLogin` already does login -> /me -> setSession (Task 6); this screen
  // just drives the form and reacts to success/failure. It does not persist
  // tokens itself — that happens inside `login()` in `lib/api-client.ts`.
  const [error, setError] = useState<string | null>(null);

  const { control, handleSubmit, formState } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: "", password: "" },
  });

  // Mirrors `ErrorState`'s accessibility treatment (see states.tsx):
  // `accessibilityRole="alert"` and `accessibilityLiveRegion="assertive"`
  // help on Android and cost nothing on iOS, but iOS only reliably announces
  // through an imperative `announceForAccessibility` call, so fire one
  // whenever a failed attempt produces a new error message.
  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  async function onSubmit(values: LoginRequest) {
    setError(null);
    try {
      await login(values.email, values.password);
      router.replace("/dashboard");
    } catch {
      setError("Incorrect email or password.");
    }
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: theme.spacing.md }}>
        <Text variant="heading" style={{ marginBottom: theme.spacing.sm }}>
          JPC Space
        </Text>

        {error ? (
          // Inline, above the form — a wrong password is a field-level
          // problem, not a reason to take over the whole screen. The fields
          // below stay mounted with their values intact (RHF's
          // `shouldUnregister: false`), so there's no extra tap to get back
          // to a fillable form.
          <Text
            variant="body"
            color={theme.colors.error[600]}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
          >
            {error}
          </Text>
        ) : null}

        <FormField
          control={control}
          name="email"
          label="Email"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <FormField control={control} name="password" label="Password" secureTextEntry />

        <Button
          title="Sign in"
          onPress={handleSubmit(onSubmit)}
          loading={formState.isSubmitting}
        />
      </View>
    </Screen>
  );
}
