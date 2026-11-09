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
import { useGoogleLogin, useLogin } from "../src/hooks/use-session";
import { apiErrorCode } from "../src/lib/api-error";
import { authErrorMessage } from "../src/lib/auth-error";
import { reportError } from "../src/lib/sentry";
import { GoogleSignInUnavailableError, isGoogleSignInConfigured } from "../src/lib/google-sign-in";
import { returnHrefFor } from "../src/lib/return-to";

/** v1 app/login/page.tsx + login-form.tsx. */
export default function LoginScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const login = useLogin();
  const googleLogin = useGoogleLogin();
  const [googleBusy, setGoogleBusy] = useState(false);
  // Google found no account for that address: point to the invite code
  // instead of an error (owner, 2026-11-09; never "you aren't invited").
  const [needsInvite, setNeedsInvite] = useState(false);

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
  useEffect(() => {
    if (needsInvite) AccessibilityInfo.announceForAccessibility(INVITE_FIRST_MESSAGE);
  }, [needsInvite]);

  async function onSubmit(values: LoginRequest) {
    setError(null);
    setNeedsInvite(false);
    try {
      await login(values.email, values.password);
      // Spec 04 R56: a check-in link that needed a login lands back on itself.
      // returnHrefFor admits only that one typed shape (Decision 7).
      router.replace(returnHrefFor(returnTo) ?? "/dashboard");
    } catch (err) {
      setError(authErrorMessage(err, "Invalid email or password."));
    }
  }

  async function onGoogle() {
    if (!isGoogleSignInConfigured()) {
      Alert.alert("Coming soon", "Signing in with Google isn't switched on yet. Use your email for now.");
      return;
    }
    setError(null);
    setNeedsInvite(false);
    setGoogleBusy(true);
    try {
      if (await googleLogin()) router.replace(returnHrefFor(returnTo) ?? "/dashboard");
    } catch (err) {
      if (apiErrorCode(err) === "no_account") setNeedsInvite(true);
      else setError(googleErrorMessage(err));
    } finally {
      setGoogleBusy(false);
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
        {needsInvite ? (
          <View className="gap-1">
            <AuthNotice tone="info">{INVITE_FIRST_MESSAGE}</AuthNotice>
            <AuthLink tone="accent" label="Enter your invite code" onPress={() => router.push("/accept-invite")} />
          </View>
        ) : null}
        <Button
          size="md"
          className="w-full"
          disabled={formState.isSubmitting}
          onPress={() => void handleSubmit(onSubmit)()}
        >
          {formState.isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
        <AuthDivider />
        {/* Owner 2026-11-09: Google signs in an existing account; it never creates one. */}
        <Button
          variant="secondary"
          size="md"
          className="w-full"
          accessibilityLabel="Continue with Google"
          disabled={googleBusy || formState.isSubmitting}
          onPress={() => void onGoogle()}
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

const INVITE_FIRST_MESSAGE = "To sign in with Google, first set up your account with the invite code from your email.";

/** A failed Google sign-in in words: the server's own refusal, else what went wrong where. */
function googleErrorMessage(err: unknown): string {
  if (err instanceof GoogleSignInUnavailableError) return err.message;
  if (apiErrorCode(err) === "not_found") {
    return "Signing in with Google isn't switched on yet. Use your email for now.";
  }
  if (err instanceof Error && !("isAxiosError" in err)) {
    reportError(err);
    return "Google sign-in didn't work. Try again, or sign in with your email.";
  }
  return authErrorMessage(err, "Google couldn't confirm this sign-in. Try again.");
}
