import { useRouter } from "expo-router";
import { useState } from "react";
import { Lock, ShieldCheck, UserRound } from "lucide-react-native";
import { View } from "react-native";
import { passwordSchema } from "@space/shared";

import { NotificationPreferences } from "../../src/components/NotificationPreferences";
import { PageHeader } from "../../src/design/layout/page-header";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import { Section } from "../../src/design/settings/section";
import { Button, FormField, Input, PasswordInput, toast } from "../../src/design/ui";
import { useChangePassword, useLogoutAll, useUpdateProfile } from "../../src/hooks/use-me";
import { useLogout } from "../../src/hooks/use-session";
import { clearSession } from "../../src/lib/token-storage";
import { useSessionStore } from "../../src/store/session";

/**
 * One route, all six navigation roles, ZERO role branches — spec 18 R3: v1's
 * six byte-identical pages collapse here, and the collapse is safe because
 * every write underneath is self-scoped (subject from the token, never the
 * body). The only conditional is hasPassword, which is account state, not
 * role. Do not add an org-wide control to this screen, ever — spec 18 §9's
 * last row is the whole point of the domain.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const clear = useSessionStore((s) => s.clear);

  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const logoutAll = useLogoutAll();
  const logout = useLogout();

  const [name, setName] = useState(user?.name ?? "");
  const [nameError, setNameError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  if (!user) return null; // the (app) layout redirects before this renders

  // v1 settings-form.tsx:148 — Save stays off until the name differs, and
  // here also until it is one the server will take (2–120 characters).
  const trimmedName = name.trim();
  const nameChanged = trimmedName !== user.name.trim();
  const nameValid = trimmedName.length >= 2 && trimmedName.length <= 120;

  const saveName = () => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 120) {
      setNameError("Between 2 and 120 characters.");
      return;
    }
    setNameError(null);
    updateProfile.mutate(
      { name: trimmed },
      {
        onSuccess: () => toast.success("Profile saved."),
        onError: () => toast.error("Couldn't save. Try again."),
      },
    );
  };

  const submitPassword = () => {
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
          const revoked =
            data.sessionsRevoked === 0
              ? ""
              : data.sessionsRevoked === 1
                ? " Signed out of 1 other device."
                : ` Signed out of ${data.sessionsRevoked} other devices.`;
          toast.success(`Password updated.${revoked}`);
        },
        onError: () => toast.error("Couldn't change the password. Check your current password."),
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
    <ShellFrame>
      <PageHeader title="Settings" description="Profile, password, and notification preferences." />
      <View className="flex-col gap-4">
        <Section icon={UserRound} title="Profile" description="Your name as it appears across JPC Space.">
          <View className="flex-col gap-4">
            <FormField label="Name" required error={nameError ?? undefined}>
              <Input accessibilityLabel="Name" value={name} onChangeText={setName} />
            </FormField>
            <FormField label="Email" description="Change via the admin console.">
              <Input accessibilityLabel="Email" value={user.email} editable={false} disabled />
            </FormField>
            <View className="flex-row justify-end">
              <Button onPress={saveName} disabled={updateProfile.isPending || !nameChanged || !nameValid}>
                {updateProfile.isPending ? "Saving…" : "Save profile"}
              </Button>
            </View>
          </View>
        </Section>

        {user.hasPassword ? (
          <Section icon={Lock} title="Change password" description="Use at least 8 characters.">
            <View className="flex-col gap-4">
              <FormField label="Current password" required>
                <PasswordInput
                  accessibilityLabel="Current password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                />
              </FormField>
              <FormField label="New password" required error={passwordError ?? undefined}>
                <PasswordInput accessibilityLabel="New password" value={newPassword} onChangeText={setNewPassword} />
              </FormField>
              <FormField label="Confirm new password" required error={confirmError ?? undefined}>
                <PasswordInput accessibilityLabel="Confirm new password" value={confirm} onChangeText={setConfirm} />
              </FormField>
              <View className="flex-row justify-end">
                <Button
                  onPress={submitPassword}
                  disabled={changePassword.isPending || !currentPassword || !newPassword || !confirm}
                >
                  {changePassword.isPending ? "Updating…" : "Update password"}
                </Button>
              </View>
            </View>
          </Section>
        ) : null}

        <NotificationPreferences />

        <Section
          icon={ShieldCheck}
          title="Security"
          description="Signs this account out on every device — use it if a phone is lost."
        >
          <View className="flex-row justify-end gap-2">
            <Button variant="outline" onPress={() => void signOut()}>
              Sign out
            </Button>
            <Button
              variant="outline"
              textClassName="text-error-700 dark:text-error-200"
              disabled={logoutAll.isPending}
              onPress={signOutEverywhere}
            >
              Sign out everywhere
            </Button>
          </View>
        </Section>
      </View>
    </ShellFrame>
  );
}
