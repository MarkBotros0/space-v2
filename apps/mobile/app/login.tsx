import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
import { useSchemaErrors } from "../src/lib/form-errors";
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

  const [values, setValues] = useState<LoginRequest>({ email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  // After a failed Sign in, each edit re-checks the form, so a fixed field's
  // error clears as you type (what react-hook-form's reValidateMode did).
  const [triedSubmit, setTriedSubmit] = useState(false);
  const { errors, validate } = useSchemaErrors(loginRequestSchema);
  const setField = (key: keyof LoginRequest) => (text: string) => {
    const next = { ...values, [key]: text };
    setValues(next);
    if (triedSubmit) validate(next);
  };

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

  async function onSubmit() {
    setTriedSubmit(true);
    if (!validate(values)) return;
    setError(null);
    setNeedsInvite(false);
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      // Spec 04 R56: a check-in link that needed a login lands back on itself.
      // returnHrefFor admits only that one typed shape (Decision 7).
      router.replace(returnHrefFor(returnTo) ?? "/dashboard");
    } catch (err) {
      setError(authErrorMessage(err, "Invalid email or password."));
    } finally {
      setSubmitting(false);
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
        <AuthField label="Email" error={errors.email}>
          <Input
            size="lg"
            accessibilityLabel="Email"
            testID="login-email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            value={values.email}
            onChangeText={setField("email")}
          />
        </AuthField>
        <AuthField label="Password" error={errors.password}>
          <PasswordInput
            size="lg"
            accessibilityLabel="Password"
            testID="login-password"
            autoComplete="current-password"
            value={values.password}
            onChangeText={setField("password")}
          />
        </AuthField>
        {/* Owner 2026-11-07: Forgot password sits under its field. */}
        <View className="-mt-2">
          <AuthLink align="end" label="Forgot password?" onPress={() => router.push("/forgot-password")} />
        </View>
        {/* The fields stay mounted with their values, so a wrong
            password needs no extra tap to get back to a fillable form. */}
        {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
        {needsInvite ? (
          <View className="gap-1">
            <AuthNotice tone="info">{INVITE_FIRST_MESSAGE}</AuthNotice>
            <AuthLink tone="accent" label="Enter your invite code" onPress={() => router.push("/accept-invite")} />
          </View>
        ) : null}
        <Button size="md" className="w-full" disabled={submitting} onPress={() => void onSubmit()}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
        <AuthDivider />
        {/* Owner 2026-11-09: Google signs in an existing account; it never creates one. */}
        <Button
          variant="secondary"
          size="md"
          className="w-full"
          accessibilityLabel="Continue with Google"
          disabled={googleBusy || submitting}
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
