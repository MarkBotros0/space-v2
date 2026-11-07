import { useRouter } from "expo-router";
import type { ActivityItem } from "@space/shared";

import { GroupedList, ListRow } from "../../design/ui";
import { formatTimeAgo } from "../../lib/format";

function activityParts(i: ActivityItem): { name: string; rest: string } {
  if (i.kind === "attendance") {
    return {
      name: i.studentName,
      rest: ` was ${(i.attendanceStatus ?? "marked").toLowerCase()} at ${i.subjectTitle}`,
    };
  }
  if (i.kind === "submitted") return { name: i.studentName, rest: ` submitted ${i.subjectTitle}` };
  return { name: i.studentName, rest: ` received feedback on ${i.subjectTitle}` };
}

export function RecentActivityGroup({ items }: { items: ActivityItem[] }) {
  const router = useRouter();
  const open = (i: ActivityItem) => {
    // D18 / R55: v2 has no role prefix to forbid these links.
    if (i.submissionPublicId !== null) {
      router.push({ pathname: "/submission/[publicId]", params: { publicId: i.submissionPublicId } });
    } else {
      router.push({ pathname: "/student/[id]", params: { id: String(i.studentUserId) } });
    }
  };
  return (
    <GroupedList header="Recent activity">
      {items.length === 0 ? (
        <ListRow title="No recent activity." />
      ) : (
        items.map((i) => {
          const { name, rest } = activityParts(i);
          return (
            <ListRow
              key={i.key}
              title={name}
              titleLines={2}
              subtitle={`${rest.trim()} · ${formatTimeAgo(i.at)}`}
              onPress={() => open(i)}
            />
          );
        })
      )}
    </GroupedList>
  );
}
