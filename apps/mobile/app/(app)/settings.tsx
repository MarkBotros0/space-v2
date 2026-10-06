import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { passwordSchema } from "@space/shared";

import { useChangePassword, useLogoutAll, useUpdateProfile } from "../../src/hooks/use-me";
import { useLogout } from "../../src/hooks/use-session";
import { clearSession } from "../../src/lib/token-storage";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, Input, Screen, Text } from "../../src/ui";

/**
 * One route, all six navigation roles, ZERO role branches — spec 18 R3: v1's
 * six byte-identical pages collapse here, and the collapse is safe because
 * every write underneath is self-scoped (subject from the token, never the
 * body). The only conditional is hasPassword, which is account state, not
 * role. Do not add an org-wide control to this screen, ever — spec 18 §9's
 * last row is the whole point of the domain.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const clear = useSessionStore((s) => s.clear);

  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const logoutAll = useLogoutAll();
  const logout = useLogout();

  const [name, setName] = useState(user?.name ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [revokedMessage, setRevokedMessage] = useState<string | null>(null);

  if (!user) return null; // the (app) layout redirects before this renders

  const saveName = () => {
    setNameSaved(false);
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 120) {
      setNameError("Between 2 and 120 characters.");
      return;
    }
    setNameError(null);
    updateProfile.mutate(
      { name: trimmed },
      {
        onSuccess: () => setNameSaved(true),
        onError: () => setNameError("Couldn't save. Try again."),
      },
    );
  };

  const submitPassword = () => {
    setRevokedMessage(null);
    setPasswordError(null);
    setConfirmError(null);
    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) {
      setPasswordError(parsed.error.issues[0]?.message ?? "Invalid password.");
      return;
    }
    // The confirm/typo guard is client-side only; it never crosses the wire
    // (spec 18 §7 — the request body carries two fields).
    if (newPassword !== confirm) {
      setConfirmError("Passwords don't match.");
      return;
    }
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: (data) => {
          setCurrentPassword("");
          setNewPassword("");
          setConfirm("");
          setRevokedMessage(
            data.sessionsRevoked === 1
              ? "Signed out of 1 other device."
              : `Signed out of ${data.sessionsRevoked} other devices.`,
          );
        },
        onError: () => setPasswordError("Couldn't change the password. Check your current password."),
      },
    );
  };

  const signOutEverywhere = () => {
    logoutAll.mutate(undefined, {
      // Success or failure, this device signs out locally — same contract as
      // useLogout: never leave someone "signed in" against a dead session.
      onSettled: async () => {
        await clearSession();
        clear();
        router.replace("/login");
      },
    });
  };

  const signOut = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <View style={{ gap: theme.spacing.md }}>
        <Card>
          <Text variant="heading">Profile</Text>
          <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
            <Input label="Name" value={name} onChangeText={setName} error={nameError ?? undefined} />
            <Text variant="label" color={theme.colors.neutral[600]}>
              Sign-in email
            </Text>
            <Text variant="body">{user.email}</Text>
            <Text variant="label" color={theme.colors.neutral[600]}>
              Ask an administrator to change your email.
            </Text>
            {nameSaved ? (
              <Text variant="label" color={theme.colors.success[600]}>
                Saved.
              </Text>
            ) : null}
            <Button title="Save name" onPress={saveName} loading={updateProfile.isPending} />
          </View>
        </Card>

        {user.hasPassword ? (
          <Card>
            <Text variant="heading">Change password</Text>
            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
              <Input
                label="Current password"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
              />
              <Input
                label="New password"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                error={passwordError ?? undefined}
              />
              <Input
                label="Confirm new password"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                error={confirmError ?? undefined}
              />
              {revokedMessage ? (
                <Text variant="label" color={theme.colors.success[600]}>
                  {revokedMessage}
                </Text>
              ) : null}
              <Button
                title="Update password"
                onPress={submitPassword}
                loading={changePassword.isPending}
                disabled={!currentPassword || !newPassword || !confirm}
              />
            </View>
          </Card>
        ) : null}

        <Card>
          <Text variant="heading">Security</Text>
          <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
            <Button title="Sign out" variant="secondary" onPress={signOut} />
            <Button
              title="Sign out everywhere"
              variant="ghost"
              onPress={signOutEverywhere}
              loading={logoutAll.isPending}
            />
            <Text variant="label" color={theme.colors.neutral[600]}>
              Signs this account out on every device — use it if a phone is lost.
            </Text>
          </View>
        </Card>
      </View>
    </Screen>
  );
}
