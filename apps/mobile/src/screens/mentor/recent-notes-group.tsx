import { useRouter } from "expo-router";
import type { AuthoredNote } from "@space/shared";

import { GroupedList, ListRow, StatusChip } from "../../design/ui";
import { formatDate } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";
import { useSessionStore } from "../../store/session";

/**
 * The newest notes a mentor may read, newest first; a flagged one wears a Follow-up chip.
 * The author is named only when it is someone else: your own name on every row is noise.
 */
export function RecentNotesGroup({ notes }: { notes: AuthoredNote[] }) {
  const router = useRouter();
  const myId = useSessionStore((s) => s.user?.id ?? null);
  return (
    <GroupedList header="Recent notes">
      {notes.length === 0 ? (
        <ListRow title="No notes yet" />
      ) : (
        notes.map((n) => (
          <ListRow
            key={n.id}
            title={n.student.name}
            titleLines={2}
            subtitle={joinMeta([formatDate(n.createdAt), n.authorId === myId ? null : n.authorName, n.body])}
            trailing={n.followUpFlagged ? <StatusChip tone="warn" label="Follow-up" /> : undefined}
            onPress={() => router.push({ pathname: "/student/[id]", params: { id: String(n.student.id) } })}
          />
        ))
      )}
      <ListRow title="All notes" chevron onPress={() => router.push("/notes")} />
    </GroupedList>
  );
}
