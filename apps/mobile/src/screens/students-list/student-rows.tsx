import { useRouter } from "expo-router";
import type { StudentListItem } from "@space/shared";

import { Avatar, AvatarFallback, ListRow } from "../../design/ui";
import { formatDate, keepTogether } from "../../lib/format";
import { initialsOf } from "../../lib/initials";
import { joinMeta } from "../../lib/join-meta";
import { yearLabel } from "../../lib/year-label";

type RowProps = { item: StudentListItem; index?: number };

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

/** An active student: name over university, year, season and group; the email when none of those is known. */
export function ActiveStudentRow({ item, index }: RowProps) {
  const open = useOpenStudent(item);
  const meta = joinMeta([item.university, yearLabel(item.year), item.activeSeasonTitle, item.currentGroupName]);
  return (
    <ListRow
      index={index}
      title={item.name}
      subtitle={meta || item.email}
      leading={<StudentAvatar item={item} />}
      chevron
      onPress={open}
    />
  );
}

export function AlumnusRow({ item, index }: RowProps) {
  const open = useOpenStudent(item);
  const year = item.graduationYear === null ? null : `Class of ${item.graduationYear}`;
  return (
    <ListRow
      index={index}
      title={item.name}
      subtitle={joinMeta([year, item.university])}
      leading={<StudentAvatar item={item} />}
      chevron
      onPress={open}
    />
  );
}

export function DroppedStudentRow({ item, index }: RowProps) {
  const open = useOpenStudent(item);
  const d = item.droppedEnrollment;
  return (
    <ListRow
      index={index}
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
