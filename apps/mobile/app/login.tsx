import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { AccessibilityInfo, Alert, View } from "react-native";
import { loginRequestSchema, type LoginRequest } from "@space/shared";

import { GoogleMark } from "../src/design/brand/google-mark";
import {
  AuthCard,
  AuthDivider,
  AuthField,
  AuthLink,
  AuthNotice,
  InviteCodeCallout,
} from "../src/design/layout/auth-card";
import { Button, Input, PasswordInput, Text } from "../src/design/ui";
import { useLogin } from "../src/hooks/use-session";
import { authErrorMessage } from "../src/lib/auth-error";
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
    } catch (err) {
      setError(authErrorMessage(err, "Invalid email or password."));
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
                testID="login-email"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
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
                testID="login-password"
                autoComplete="current-password"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
              />
            </AuthField>
          )}
        />
        {/* Owner 2026-11-07: Forgot password sits under its field. */}
        <View className="-mt-2">
          <AuthLink align="end" label="Forgot password?" onPress={() => router.push("/forgot-password")} />
        </View>
        {/* The fields stay mounted with their values (RHF), so a wrong
            password needs no extra tap to get back to a fillable form. */}
        {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
        <Button
          size="lg"
          className="w-full"
          disabled={formState.isSubmitting}
          onPress={() => void handleSubmit(onSubmit)()}
        >
          {formState.isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
        <AuthDivider />
        {/* Owner 2026-11-07: Google sign-in is coming; the button is in place until it is wired. */}
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          accessibilityLabel="Continue with Google"
          onPress={() =>
            Alert.alert("Coming soon", "Signing in with Google isn't switched on yet. Use your email for now.")
          }
        >
          <GoogleMark size={18} />
          <Text className="font-semibold text-foreground">Continue with Google</Text>
        </Button>
        <View className="mt-4">
          <InviteCodeCallout onPress={() => router.push("/accept-invite")} />
        </View>
      </View>
    </AuthCard>
  );
}
