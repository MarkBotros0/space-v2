import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import {
  OWN_PROFILE_FIELDS,
  updateOwnProfileInputSchema,
  type MyProfile,
  type OwnProfileField,
  type UpdateOwnProfileInput,
} from "@space/shared";

import { useLogout } from "../../src/hooks/use-session";
import { useMyAttendance, useMyProfile, useUpdateStudentProfile } from "../../src/hooks/use-self-service";
import { apiErrorMessage } from "../../src/lib/api-error";
import { initialsOf } from "../../src/lib/initials";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, ErrorState, Input, LoadingState, Screen, Text } from "../../src/ui";

const EDGES = ["top", "left", "right"] as const;

const FIELD_LABELS: Record<OwnProfileField, string> = {
  name: "Name",
  university: "University",
  year: "Year",
  phone: "Phone",
  dateOfBirth: "Date of birth (YYYY-MM-DD)",
  spiritualBackground: "Spiritual background",
  gifts: "Gifts",
};
const MULTILINE: ReadonlySet<OwnProfileField> = new Set(["spiritualBackground", "gifts"]);

type FormValues = Record<OwnProfileField, string>;

function toFormValues(p: MyProfile): FormValues {
  return {
    name: p.name,
    university: p.university ?? "",
    year: p.year ?? "",
    phone: p.phone ?? "",
    dateOfBirth: p.dateOfBirth ?? "",
    spiritualBackground: p.spiritualBackground ?? "",
    gifts: p.gifts ?? "",
  };
}

function isOwnProfileField(key: string): key is OwnProfileField {
  return OWN_PROFILE_FIELDS.some((field) => field === key);
}

function IdentityCard({ name, email, badge }: { name: string; email: string; badge: string }) {
  const theme = useTheme();
  return (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: theme.radii.full,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.neutral[100],
        }}
      >
        {/* Avatar images are deferred with uploads (CLAUDE.md); v2 has no avatar read path. */}
        <Text variant="heading">{initialsOf(name, email.charAt(0).toUpperCase() || "?")}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="heading">{name}</Text>
        <Text variant="caption" color={theme.colors.neutral[600]}>
          {email}
        </Text>
        <Text variant="label">{badge}</Text>
      </View>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flex: 1, alignItems: "center" }}>
      <Text variant="title">{value}</Text>
      <Text variant="caption">{label}</Text>
    </Card>
  );
}

function ProfileForm({ profile }: { profile: MyProfile }) {
  const theme = useTheme();
  const update = useUpdateStudentProfile();
  const [values, setValues] = useState<FormValues>(() => toFormValues(profile));
  const [errors, setErrors] = useState<Partial<Record<OwnProfileField, string>>>({});
  const [message, setMessage] = useState<string | null>(null);

  const save = () => {
    setMessage(null);
    const body: UpdateOwnProfileInput = { ...values, name: values.name.trim() };
    // The SAME schema the server runs — v1's client and server copies had
    // drifted (spec 06 R21); here they cannot.
    const parsed = updateOwnProfileInputSchema.safeParse(body);
    if (!parsed.success) {
      const next: Partial<Record<OwnProfileField, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && isOwnProfileField(key) && next[key] === undefined) {
          next[key] = issue.message;
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    update.mutate(body, {
      onSuccess: () => setMessage("Profile saved."),
      onError: (err) => setMessage(apiErrorMessage(err, "Couldn't save your profile.")),
    });
  };

  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">Your details</Text>
      {OWN_PROFILE_FIELDS.map((field) => (
        <Input
          key={field}
          label={FIELD_LABELS[field]}
          value={values[field]}
          onChangeText={(text) => setValues((v) => ({ ...v, [field]: text }))}
          error={errors[field]}
          multiline={MULTILINE.has(field)}
          autoCapitalize={field === "dateOfBirth" ? "none" : field === "name" ? "words" : "sentences"}
          keyboardType={field === "phone" ? "phone-pad" : "default"}
        />
      ))}
      {message ? (
        <Text variant="label" accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}
      <Button title="Save profile" onPress={save} loading={update.isPending} />
    </Card>
  );
}

/** v1 /student/profile — name and the six own columns editable (Decision 1). */
function StudentProfile() {
  const theme = useTheme();
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const profile = useMyProfile(true);
  const attendance = useMyAttendance(activeSeasonId);

  if (profile.isPending) {
    return (
      <Screen edges={EDGES}>
        <LoadingState />
      </Screen>
    );
  }
  if (profile.isError) {
    return (
      <Screen edges={EDGES}>
        <ErrorState message="Couldn't load your profile." onRetry={() => void profile.refetch()} />
      </Screen>
    );
  }

  const p = profile.data;
  const budget = attendance.data?.budget ?? null;

  return (
    <Screen
      edges={EDGES}
      scroll
      onRefresh={() => {
        void profile.refetch();
        if (activeSeasonId !== null) void attendance.refetch();
      }}
      refreshing={profile.isRefetching}
    >
      <IdentityCard name={p.name} email={p.email} badge="Student" />
      {budget !== null ? (
        <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          {/* v1's label (student/profile/page.tsx:88-91, spec 09 R68/R87; v1 parity 2026-10-09). */}
          <Stat label="Attendance" value={`${budget.remainingPct}%`} />
          <Stat label="Streak" value={String(attendance.data?.streak ?? 0)} />
        </View>
      ) : null}
      {/* Name is edited on this form, as v1 (Decision 1; v1 parity 2026-10-09) — no "Open settings" card. */}
      <ProfileForm profile={p} />
    </Screen>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="caption" color={theme.colors.neutral[600]}>
        {label}
      </Text>
      <Text variant="body">{value ?? "—"}</Text>
    </View>
  );
}

/** v1 /alumni/profile — read-only (app/alumni/profile/page.tsx:31-46). */
function AlumniProfile() {
  const theme = useTheme();
  const profile = useMyProfile(true);

  if (profile.isPending) {
    return (
      <Screen edges={EDGES}>
        <LoadingState />
      </Screen>
    );
  }
  if (profile.isError) {
    return (
      <Screen edges={EDGES}>
        <ErrorState message="Couldn't load your profile." onRetry={() => void profile.refetch()} />
      </Screen>
    );
  }

  const p = profile.data;
  return (
    <Screen edges={EDGES} scroll onRefresh={() => void profile.refetch()} refreshing={profile.isRefetching}>
      <Text variant="title">Profile</Text>
      <Text variant="label" color={theme.colors.neutral[600]}>
        Your alumni record
      </Text>
      <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.md }}>
        <Field label="Name" value={p.name} />
        <Field label="Email" value={p.email} />
        <Field label="Status" value={p.graduationYear !== null ? `Alumnus · Class of ${p.graduationYear}` : null} />
        <Field label="University" value={p.university} />
      </Card>
      <Text variant="caption" color={theme.colors.neutral[600]} style={{ marginTop: theme.spacing.md }}>
        To update your details, please contact the JPC team.
      </Text>
    </Screen>
  );
}

/**
 * Every non-student role (Decision 2). MENTOR has Profile as a TAB but no More
 * tab; this card (spec 18 R11 — v1's /mentor/profile never existed) sits
 * beside the header avatar menu, which is v1's route to Settings and Sign out
 * for every role (R9/R10). Reads only the session store: no student endpoint
 * is called.
 */
function AccountProfile() {
  const theme = useTheme();
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const logout = useLogout();

  return (
    <Screen edges={EDGES} scroll>
      <Text variant="title">Profile</Text>
      {user ? <IdentityCard name={user.name} email={user.email} badge={user.role} /> : null}
      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
        <Button title="Settings" onPress={() => router.push("/settings")} />
        <Button title="Sign out" variant="secondary" onPress={() => void logout()} />
      </View>
    </Screen>
  );
}

export default function ProfileScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const graduationYear = useSessionStore((s) => s.scopes?.graduationYear ?? null);
  // Three components, not one with branches: each calls different hooks, and
  // a role change remounts cleanly instead of reordering hooks.
  if (role === "STUDENT") return graduationYear !== null ? <AlumniProfile /> : <StudentProfile />;
  return <AccountProfile />;
}
