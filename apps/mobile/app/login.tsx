import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { View } from "react-native";
import { loginRequestSchema, type LoginRequest } from "@space/shared";

import { useLogin } from "../src/hooks/use-session";
import { useTheme } from "../src/theme";
import { Button, ErrorState, FormField, Screen, Text } from "../src/ui";

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

  async function onSubmit(values: LoginRequest) {
    setError(null);
    try {
      await login(values.email, values.password);
      router.replace("/dashboard");
    } catch {
      setError("Incorrect email or password.");
    }
  }

  if (error) {
    return (
      <Screen>
        <ErrorState message={error} onRetry={() => setError(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: theme.spacing.md }}>
        <Text variant="heading" style={{ marginBottom: theme.spacing.sm }}>
          JPC Space
        </Text>

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
