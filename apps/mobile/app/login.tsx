import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { AccessibilityInfo, View } from "react-native";
import { loginRequestSchema, type LoginRequest } from "@space/shared";

import { AuthCard, AuthField, AuthLink, AuthNotice } from "../src/design/layout/auth-card";
import { Button, Input, PasswordInput } from "../src/design/ui";
import { useLogin } from "../src/hooks/use-session";
import { returnHrefFor } from "../src/lib/return-to";

/** v1 app/login/page.tsx + login-form.tsx. */
export default function LoginScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const login = useLogin();

  // `useLogin` already does login -> /me -> setSession (Task 6); this screen
  // just drives the form and reacts to success/failure. It does not persist
  // tokens itself — that happens inside `login()` in `lib/api-client.ts`.
  const [error, setError] = useState<string | null>(null);

  const { control, handleSubmit, formState } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: "", password: "" },
  });

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
      // Spec 04 R56: a check-in link that needed a login lands back on itself.
      // returnHrefFor admits only that one typed shape (Decision 7).
      router.replace(returnHrefFor(returnTo) ?? "/dashboard");
    } catch {
      setError("Invalid email or password.");
    }
  }

  return (
    <AuthCard title="Welcome back" description="Sign in to JPC Space to continue.">
      <View className="flex-col gap-4">
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <AuthField label="Email" error={fieldState.error?.message}>
              <Input
                size="lg"
                accessibilityLabel="Email"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
              />
            </AuthField>
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <AuthField label="Password" error={fieldState.error?.message}>
              <PasswordInput
                size="lg"
                accessibilityLabel="Password"
                autoComplete="current-password"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
              />
            </AuthField>
          )}
        />
        {/* The fields stay mounted with their values (RHF), so a wrong
            password needs no extra tap to get back to a fillable form. */}
        {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
        <Button size="lg" className="w-full" disabled={formState.isSubmitting} onPress={handleSubmit(onSubmit)}>
          {formState.isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
        <AuthLink label="Forgot password?" onPress={() => router.push("/forgot-password")} />
        <AuthLink label="I have an invite code" onPress={() => router.push("/accept-invite")} />
      </View>
    </AuthCard>
  );
}
