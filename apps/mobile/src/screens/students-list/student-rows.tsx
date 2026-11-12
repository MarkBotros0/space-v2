import { useRouter } from "expo-router";
import { classLabel, type StudentListItem } from "@space/shared";

import { Avatar, AvatarFallback, ListRow, Text } from "../../design/ui";
import { formatDate, keepTogether } from "../../lib/format";
import { initialsOf } from "../../lib/initials";
import { joinMeta } from "../../lib/join-meta";
import { progressCaptions } from "../student-detail/progress-model";

type RowProps = {
  item: StudentListItem;
  /** The mentor's list (owner, 2026-11-07): no season or group on a row. */
  seasonless?: boolean;
};

function useOpenStudent(item: StudentListItem) {
  const router = useRouter();
  return () => router.push({ pathname: "/student/[id]", params: { id: String(item.id) } });
}

function StudentAvatar({ item }: { item: StudentListItem }) {
  // No image: avatars are uploads, and uploads are off (gap note).
  return (
    <Avatar size="sm">
      <AvatarFallback>{initialsOf(item.name, item.email[0]?.toUpperCase() ?? "?")}</AvatarFallback>
    </Avatar>
  );
}

/**
 * The season a row names (owner, 2026-11-07): the active one, else the latest
 * finished one, said as such.
 */
export function seasonLine(item: StudentListItem): string | null {
  if (item.activeSeasonTitle) return item.activeSeasonTitle;
  return item.lastSeasonTitle ? `Last season: ${item.lastSeasonTitle}` : null;
}

/**
 * A student: name over their season, group and university; the email when none of those is known.
 * Under them, for staff who may score the season, its three numbers (season passing), one caption
 * each so they wrap apart at 1.3; a leader scans a group without opening every student.
 */
export function ActiveStudentRow({ item, seasonless = false }: RowProps) {
  const open = useOpenStudent(item);
  const meta = seasonless
    ? joinMeta([item.university, item.faculty])
    : joinMeta([seasonLine(item), item.currentGroupName, item.university]);
  const captions = seasonless ? [] : progressCaptions(item.progress);
  return (
    <ListRow
      title={item.name}
      subtitle={meta || item.email}
      leading={<StudentAvatar item={item} />}
      footer={
        captions.length > 0
          ? captions.map((c) => (
              <Text key={c} variant="caption" className="mr-2 text-foreground">
                {c}
              </Text>
            ))
          : undefined
      }
      trailingLabel={captions.length > 0 ? captions.join(", ") : undefined}
      chevron
      onPress={open}
    />
  );
}

/** An alumnus: name over their class (JPCS-25) and season. No university or faculty (owner, 2026-11-10). */
export function AlumnusRow({ item, seasonless = false }: RowProps) {
  const open = useOpenStudent(item);
  const year = item.graduationYear === null ? null : classLabel(item.graduationYear);
  return (
    <ListRow
      title={item.name}
      subtitle={joinMeta([year, seasonless ? null : seasonLine(item)])}
      leading={<StudentAvatar item={item} />}
      chevron
      onPress={open}
    />
  );
}

export function DroppedStudentRow({ item }: RowProps) {
  const open = useOpenStudent(item);
  const d = item.droppedEnrollment;
  return (
    <ListRow
      title={item.name}
      subtitle={joinMeta([
        d ? `Dropped from ${d.seasonTitle}` : null,
        d?.droppedAt ? keepTogether(formatDate(d.droppedAt)) : null,
        d?.dropReason,
      ])}
      leading={<StudentAvatar item={item} />}
      chevron
      onPress={open}
    />
  );
}
