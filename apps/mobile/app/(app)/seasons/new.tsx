import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { NEW_SEASON_VALUES, SeasonForm } from "../../../src/components/season/SeasonForm";
import { PageTitle } from "../../../src/design/layout/page-title";
import { ShellFrame } from "../../../src/design/layout/shell-frame";
import { Card, CardContent, EmptyState } from "../../../src/design/ui";
import { useCreateSeason } from "../../../src/hooks/use-season-writes";
import { apiErrorMessage } from "../../../src/lib/api-error";
import { useSessionStore } from "../../../src/store/session";

/** v1 /super/seasons/new (B5-2): SUPER only, like POST /seasons. */
export default function NewSeasonScreen() {
  const router = useRouter();
  const isSuper = useSessionStore((s) => s.user?.role === "SUPER");
  const create = useCreateSeason();
  const [message, setMessage] = useState<string | null>(null);

  if (!isSuper) {
    return (
      <ShellFrame>
        <EmptyState title="Not available" description="Only a super admin can create a season." />
      </ShellFrame>
    );
  }

  return (
    <ShellFrame>
      <View className="flex-col gap-4">
        <PageTitle title="New season" subtitle="Set up a new program season." />
        <Card>
          <CardContent className="pt-6">
            <SeasonForm
              mode="create"
              initial={NEW_SEASON_VALUES}
              submitting={create.isPending}
              message={message}
              onCancel={() => router.back()}
              onSubmit={(body) => {
                setMessage(null);
                create.mutate(body, {
                  onSuccess: (ref) =>
                    router.replace({ pathname: "/seasons/[code]", params: { code: ref.code } }),
                  onError: (err) => setMessage(apiErrorMessage(err, "Couldn't create the season.")),
                });
              }}
            />
          </CardContent>
        </Card>
      </View>
    </ShellFrame>
  );
}
