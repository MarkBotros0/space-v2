import type { ReactNode } from "react";
import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { StudentForm } from "../../../../src/components/StudentForm";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { Screen } from "../../../../src/design/layout/screen";
import { EmptyState, PillButton, Text, toast } from "../../../../src/design/ui";
import { useSeasonByCode } from "../../../../src/hooks/use-seasons";
import { useCreateStudent } from "../../../../src/hooks/use-students";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { emptyStudentForm, toCreateStudentBody } from "../../../../src/lib/student-form";

/**
 * Invite someone new into a season (owner, 2026-11-07: a season's admins can
 * invite people who have no account yet). POST /students with this season's
 * id: the account, its profile and an ACTIVE place in the season in one
 * transaction, then the invite email. Whoever administers the season (its
 * admins, a Super) and only while it is a draft or running.
 */
export default function InviteToSeasonScreen() {
  const router = useRouter();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === "string" && raw.length > 0 ? raw : null;
  const season = useSeasonByCode(code);
  const createStudent = useCreateStudent();
  const [serverError, setServerError] = useState<string | null>(null);

  const s = season.data;
  const open = s !== undefined && (s.status === "DRAFT" || s.status === "ACTIVE");
  if (code !== null && s !== undefined && s.canAdminister && open) {
    return (
      <StudentForm
        title="Invite new"
        subtitle={`For someone who has never had an account. They join ${s.title} and get an email to set up their account.`}
        notice={
          <View className="flex-row flex-wrap items-center gap-2">
            <Text variant="subhead" className="text-muted-foreground">
              Already have an account?
            </Text>
            <PillButton
              label="Select from community"
              onPress={() => router.replace({ pathname: "/seasons/[code]/people", params: { code: s.code } })}
            />
          </View>
        }
        initial={emptyStudentForm()}
        seasonOptions={[]}
        seasonLabel=""
        showSeason={false}
        showNotes
        submitTitle="Add and send invite"
        submitting={createStudent.isPending}
        serverError={serverError}
        onSubmit={(values) => {
          setServerError(null);
          createStudent.mutate(
            { ...toCreateStudentBody(values), seasonId: s.id },
            {
              onSuccess: (created) => {
                if (created.inviteSent) {
                  toast.success(`Added to ${s.title}. Their invite is on its way.`);
                } else {
                  toast.error(
                    `Added to ${s.title}, but the invite email couldn't be sent. A super admin can send it again from Community.`,
                  );
                }
                router.replace({ pathname: "/student/[id]", params: { id: String(created.id) } });
              },
              onError: (err) => setServerError(apiErrorMessage(err, "Couldn't add them.")),
            },
          );
        }}
      />
    );
  }

  let body: ReactNode;
  if (code === null) body = <EmptyState title="Not found" description="That season link isn't valid." />;
  else if (season.isError) body = <RouteError onRetry={() => void season.refetch()} />;
  else if (season.isPending) body = <RouteSkeleton />;
  else if (!open) body = <EmptyState title="This season has finished" description="Nobody new can join it." />;
  else body = <EmptyState title="Not available" description="Only this season's admins can invite people to it." />;
  return <Screen title="Invite new">{body}</Screen>;
}
