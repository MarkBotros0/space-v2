import { useRouter } from "expo-router";
import { View } from "react-native";
import type { MeUser, MyProfile } from "@space/shared";

import { FormScreen } from "../../design/layout/form-screen";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { toast } from "../../design/ui";
import { ListSectionHeader } from "../../design/ui/grouped-list";
import { useMyProfile } from "../../hooks/use-self-service";
import { apiErrorMessage } from "../../lib/api-error";
import { useSessionStore } from "../../store/session";
import { useAcademicForm } from "./academic-form";
import { usePersonalForm } from "./personal-form";
import { useProfileKind } from "./profile-kind";

/**
 * Edit profile, opened from Profile's Edit: the personal details for every role,
 * and a student's academic record under them, with one Save that sends whichever
 * part changed. An alumnus's academic record stays read-only (v1 parity).
 */
export function EditProfile() {
  const user = useSessionStore((s) => s.user);
  const kind = useProfileKind();
  const profile = useMyProfile(kind === "student");

  if (!user) return null; // the (app) layout redirects before this renders
  if (kind === "student") {
    if (profile.isPending || profile.isError) {
      return (
        <Screen title="Edit profile">
          {profile.isPending ? <RouteSkeleton /> : <RouteError onRetry={() => void profile.refetch()} />}
        </Screen>
      );
    }
    return <StudentEditForm user={user} profile={profile.data} />;
  }
  return <PersonalEditForm user={user} />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <ListSectionHeader>{title}</ListSectionHeader>
      <View className="rounded-group bg-surface p-4">{children}</View>
    </View>
  );
}

function useFinish() {
  const router = useRouter();
  return {
    done: () => {
      toast.success("Profile saved.");
      router.back();
    },
    failed: (err: unknown) => toast.error(apiErrorMessage(err, "Couldn't save. Try again.")),
  };
}

function PersonalEditForm({ user }: { user: MeUser }) {
  const personal = usePersonalForm(user);
  const finish = useFinish();
  const save = async () => {
    const body = personal.validate();
    if (!body) return;
    try {
      await personal.commit(body);
      finish.done();
    } catch (err) {
      finish.failed(err);
    }
  };
  return (
    <FormScreen
      title="Edit profile"
      saveLabel={personal.saving ? "Saving…" : "Save changes"}
      onSave={() => void save()}
      saving={personal.saving}
      saveDisabled={!personal.dirty}
    >
      <Section title="Your details">{personal.fields}</Section>
    </FormScreen>
  );
}

function StudentEditForm({ user, profile }: { user: MeUser; profile: MyProfile }) {
  const personal = usePersonalForm(user);
  const academic = useAcademicForm(profile);
  const finish = useFinish();
  const saving = personal.saving || academic.saving;

  const save = async () => {
    // Validate both first, so every error shows at once.
    const p = personal.dirty ? personal.validate() : undefined;
    const a = academic.dirty ? academic.validate() : undefined;
    if (p === null || a === null) return;
    try {
      if (p) await personal.commit(p);
      if (a) await academic.commit(a);
      finish.done();
    } catch (err) {
      finish.failed(err);
    }
  };

  return (
    <FormScreen
      title="Edit profile"
      saveLabel={saving ? "Saving…" : "Save changes"}
      onSave={() => void save()}
      saving={saving}
      saveDisabled={!personal.dirty && !academic.dirty}
    >
      <View className="flex-col gap-6">
        <Section title="Your details">{personal.fields}</Section>
        <Section title="Academic">{academic.fields}</Section>
      </View>
    </FormScreen>
  );
}
