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

import { format, isValid, parse } from "date-fns";

import { Fieldset } from "../../src/design/forms/fieldset";
import { Eyebrow, PageTitle } from "../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../src/design/layout/route-states";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import { shadowStyle } from "../../src/design/lib/shadow";
import { StatCard } from "../../src/design/students/stat-card";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button as ButtonV1,
  Card,
  CardContent,
  DatePicker,
  FormField,
  Input as InputV1,
  Text as TextV1,
  Textarea,
  toast,
} from "../../src/design/ui";
import { useMyEngagement } from "../../src/hooks/use-engagement";
import { useLogout } from "../../src/hooks/use-session";
import {
  useMyAttendance,
  useMyProfile,
  useUpdateStudentProfile,
} from "../../src/hooks/use-self-service";
import { apiErrorMessage } from "../../src/lib/api-error";
import { initialsOf } from "../../src/lib/initials";
import { useSessionStore } from "../../src/store/session";

type FormValues = Record<OwnProfileField, string>;

function toFormValues(p: MyProfile): FormValues {
  return {
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

/** "2001-04-05" ↔ a local-midnight Date: no zone shift either way. */
function dobToDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = parse(value, "yyyy-MM-dd", new Date());
  return isValid(date) ? date : null;
}

/** v1 student-form.tsx in its isSelf mode — the six own columns (Decision 1). */
function ProfileForm({ profile }: { profile: MyProfile }) {
  const router = useRouter();
  const update = useUpdateStudentProfile();
  const [values, setValues] = useState<FormValues>(() => toFormValues(profile));
  const [errors, setErrors] = useState<Partial<Record<OwnProfileField, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const set = (field: OwnProfileField) => (text: string) =>
    setValues((v) => ({ ...v, [field]: text }));

  const save = () => {
    setSubmitError(null);
    const body: UpdateOwnProfileInput = values;
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
      onSuccess: () => toast.success("Profile saved."),
      onError: (err) => setSubmitError(apiErrorMessage(err, "Couldn't save your profile.")),
    });
  };

  return (
    <View className="flex-col gap-6">
      <Fieldset legend="Personal">
        <FormField label="Date of birth" error={errors.dateOfBirth}>
          <DatePicker
            accessibilityLabel="Date of birth"
            value={dobToDate(values.dateOfBirth)}
            onChange={(d) => set("dateOfBirth")(format(d, "yyyy-MM-dd"))}
          />
        </FormField>
      </Fieldset>
      <Fieldset legend="Contact">
        <FormField label="Phone" error={errors.phone}>
          <InputV1
            accessibilityLabel="Phone"
            keyboardType="phone-pad"
            value={values.phone}
            onChangeText={set("phone")}
          />
        </FormField>
      </Fieldset>
      <Fieldset legend="Academic">
        <FormField label="University" error={errors.university}>
          <InputV1
            accessibilityLabel="University"
            value={values.university}
            onChangeText={set("university")}
          />
        </FormField>
        <FormField label="Year / faculty" error={errors.year}>
          <InputV1
            accessibilityLabel="Year / faculty"
            placeholder="e.g. 3rd · Engineering"
            value={values.year}
            onChangeText={set("year")}
          />
        </FormField>
      </Fieldset>
      <Fieldset legend="Spiritual background">
        <FormField label="Notes" error={errors.spiritualBackground}>
          <Textarea
            accessibilityLabel="Notes"
            numberOfLines={3}
            placeholder="Church affiliation, baptism status, faith journey…"
            value={values.spiritualBackground}
            onChangeText={set("spiritualBackground")}
          />
        </FormField>
      </Fieldset>
      <Fieldset legend="Community">
        <FormField label="Gifts / interests" error={errors.gifts}>
          <Textarea
            accessibilityLabel="Gifts / interests"
            numberOfLines={2}
            placeholder="e.g. worship, hospitality, mentoring younger students"
            value={values.gifts}
            onChangeText={set("gifts")}
          />
        </FormField>
      </Fieldset>
      {submitError ? (
        <TextV1
          accessibilityLiveRegion="polite"
          className="rounded-md bg-error-50 px-3 py-2 text-sm text-error-800 dark:bg-error-950 dark:text-error-200"
        >
          {submitError}
        </TextV1>
      ) : null}
      <View className="flex-col-reverse gap-2">
        <ButtonV1 variant="outline" onPress={() => router.back()}>
          Cancel
        </ButtonV1>
        <ButtonV1 disabled={update.isPending} onPress={save}>
          {update.isPending ? "Saving…" : "Save changes"}
        </ButtonV1>
      </View>
    </View>
  );
}

/** v1 /student/profile — the six own columns editable, nothing else (Decision 1). */
function StudentProfile() {
  const router = useRouter();
  const userId = useSessionStore((s) => s.user?.id ?? null);
  const activeSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  const profile = useMyProfile(true);
  const attendance = useMyAttendance(activeSeasonId);
  const engagement = useMyEngagement(userId, activeSeasonId !== null);

  if (profile.isPending || profile.isError) {
    return (
      <ShellFrame>
        {profile.isPending ? (
          <RouteSkeleton />
        ) : (
          <RouteError onRetry={() => void profile.refetch()} />
        )}
      </ShellFrame>
    );
  }

  const p = profile.data;
  const budget = attendance.data?.budget ?? null;
  const streak = attendance.data?.streak ?? null;
  const eng = engagement.data;

  return (
    <ShellFrame
      onRefresh={() => {
        void profile.refetch();
        if (activeSeasonId !== null) {
          void attendance.refetch();
          void engagement.refetch();
        }
      }}
      refreshing={profile.isRefetching}
    >
      <View className="flex-col gap-3">
        <View className="rounded-2xl border border-border bg-card p-5" style={shadowStyle("soft")}>
          <View className="flex-row items-center gap-4">
            {/* Initials only: v2 has no avatar read path and uploads are off (gap note). */}
            <Avatar size="xl" className="shrink-0">
              <AvatarFallback>
                {initialsOf(p.name, p.email.charAt(0).toUpperCase() || "?")}
              </AvatarFallback>
            </Avatar>
            <View className="min-w-0 flex-1">
              <TextV1
                numberOfLines={1}
                className="text-xl font-black text-brand-navy-900 dark:text-foreground"
              >
                {p.name}
              </TextV1>
              <TextV1 numberOfLines={1} className="text-xs text-muted-foreground">
                {p.email}
              </TextV1>
              <View className="mt-2 flex-row flex-wrap gap-1.5">
                <Badge variant="teal">Student</Badge>
              </View>
            </View>
          </View>
        </View>
        {activeSeasonId !== null ? (
          <View className="flex-row gap-3">
            {/* v1 labelled this "Attendance" (spec 09 R68); it is the budget LEFT (spec 19 D14). */}
            <StatCard
              label="Absence budget left"
              value={budget ? `${budget.remainingPct}%` : "—"}
            />
            <StatCard
              label="Assignments"
              value={eng ? `${eng.submissionsCompleted}/${eng.submissionsExpected}` : "—"}
            />
            <StatCard
              label="Streak"
              value={streak === null ? "—" : String(streak)}
              icon={streak !== null && streak > 0 ? "flame" : undefined}
            />
          </View>
        ) : null}
        <View className="rounded-2xl border border-border bg-card p-4" style={shadowStyle("soft")}>
          <Eyebrow className="mb-4">Your details</Eyebrow>
          <ProfileForm profile={p} />
        </View>
        {/* Decision 1: name and email are not edited here (PATCH /me owns User.name). */}
        <View
          className="flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4"
          style={shadowStyle("soft")}
        >
          <TextV1 className="text-sm text-muted-foreground">
            Change your name in Settings. To change your email, contact the JPC team.
          </TextV1>
          <ButtonV1 variant="outline" size="sm" onPress={() => router.push("/settings")}>
            Open settings
          </ButtonV1>
        </View>
      </View>
    </ShellFrame>
  );
}

function Field({ label, value, badge }: { label: string; value: string | null; badge?: boolean }) {
  return (
    <View>
      <TextV1 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </TextV1>
      {value ? (
        badge ? (
          <Badge variant="success" className="mt-1 self-start">
            {value}
          </Badge>
        ) : (
          <TextV1 className="mt-1 text-sm text-foreground">{value}</TextV1>
        )
      ) : (
        <TextV1 className="mt-1 text-sm italic text-muted-foreground">—</TextV1>
      )}
    </View>
  );
}

/** v1 /alumni/profile — read-only (app/alumni/profile/page.tsx:31-46). */
function AlumniProfile() {
  const profile = useMyProfile(true);

  if (profile.isPending || profile.isError) {
    return (
      <ShellFrame>
        {profile.isPending ? (
          <RouteSkeleton />
        ) : (
          <RouteError onRetry={() => void profile.refetch()} />
        )}
      </ShellFrame>
    );
  }

  const p = profile.data;
  return (
    <ShellFrame onRefresh={() => void profile.refetch()} refreshing={profile.isRefetching}>
      <View className="flex-col gap-3">
        <PageTitle title="Profile" subtitle="Your alumni record" />
        <Card>
          <CardContent className="flex-col gap-3 pt-6">
            <Field label="Name" value={p.name} />
            <Field label="Email" value={p.email} />
            <Field
              label="Status"
              value={p.graduationYear !== null ? `Alumnus · Class of ${p.graduationYear}` : null}
              badge
            />
            <Field label="University" value={p.university} />
          </CardContent>
        </Card>
        <TextV1 className="text-xs text-muted-foreground">
          To update your details, please contact the JPC team.
        </TextV1>
      </View>
    </ShellFrame>
  );
}

/**
 * Every non-student role (Decision 2). MENTOR has Profile as a TAB but no More
 * tab, so this card is their only route to Settings and to signing out on a
 * phone (spec 18 R9, R11 — v1's /mentor/profile never existed). Reads only the
 * session store: no student endpoint is called. Drawn like the student's
 * identity card so it reads as the same screen.
 */
function AccountProfile() {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const logout = useLogout();

  return (
    <ShellFrame>
      <View className="flex-col gap-3">
        <PageTitle title="Profile" />
        {user ? (
          <View
            className="rounded-2xl border border-border bg-card p-5"
            style={shadowStyle("soft")}
          >
            <View className="flex-row items-center gap-4">
              <Avatar size="xl" className="shrink-0">
                <AvatarFallback>
                  {initialsOf(user.name, user.email.charAt(0).toUpperCase() || "?")}
                </AvatarFallback>
              </Avatar>
              <View className="min-w-0 flex-1">
                <TextV1
                  numberOfLines={1}
                  className="text-xl font-black text-brand-navy-900 dark:text-foreground"
                >
                  {user.name}
                </TextV1>
                <TextV1 numberOfLines={1} className="text-xs text-muted-foreground">
                  {user.email}
                </TextV1>
                <View className="mt-2 flex-row flex-wrap gap-1.5">
                  <Badge variant="teal">{user.role}</Badge>
                </View>
              </View>
            </View>
          </View>
        ) : null}
        <View className="flex-col gap-2">
          <ButtonV1 onPress={() => router.push("/settings")}>Settings</ButtonV1>
          <ButtonV1 variant="outline" onPress={() => void logout()}>
            Sign out
          </ButtonV1>
        </View>
      </View>
    </ShellFrame>
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
