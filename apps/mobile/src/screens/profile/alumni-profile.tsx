import { View } from "react-native";

import { PageTitle } from "../../design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { ShellFrame } from "../../design/layout/shell-frame";
import { Badge, Card, CardContent, Text as TextV1 } from "../../design/ui";
import { useMyProfile } from "../../hooks/use-self-service";

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
export function AlumniProfile() {
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
