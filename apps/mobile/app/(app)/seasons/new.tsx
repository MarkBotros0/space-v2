import { useState } from "react";
import { useRouter } from "expo-router";

import { NEW_SEASON_VALUES, SeasonForm } from "../../../src/components/season/SeasonForm";
import { Screen } from "../../../src/design/layout/screen";
import { EmptyState } from "../../../src/design/ui";
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
      <Screen title="New season">
        <EmptyState title="Not available" description="Only a super admin can create a season." />
      </Screen>
    );
  }

  return (
    <SeasonForm
      mode="create"
      title="New season"
      subtitle="It starts as a draft: nobody sees it until you start it."
      initial={NEW_SEASON_VALUES}
      submitting={create.isPending}
      message={message}
      onSubmit={(body) => {
        setMessage(null);
        create.mutate(body, {
          onSuccess: (ref) =>
            router.replace({ pathname: "/seasons/[code]", params: { code: ref.code } }),
          onError: (err) => setMessage(apiErrorMessage(err, "Couldn't create the season.")),
        });
      }}
    />
  );
}
