/**
 * The staff payload's whole profile (spec 06 §4.2): university, faculty,
 * university graduation year, phone, date of birth and the internal notes. An empty
 * field reads "—" so staff can see what is missing; the internal notes carry
 * their staff-only caption because the student's own payload never has them.
 */
import { dateOnlyFromIso } from "@space/shared";
import { View } from "react-native";

import type { StudentDetail } from "../../hooks/use-students";
import { formatDayKey } from "../../lib/format";
import { GroupedList, ListRow } from "../../design/ui/grouped-list";
import { Text } from "../../design/ui/text";

export function AdminProfileSection({ profile: p }: { profile: StudentDetail["profile"] }) {
  const rows: [label: string, value: string | null][] = [
    ["University", p.university],
    ["Faculty", p.faculty],
    ["Graduation year", p.universityGraduationYear === null ? null : String(p.universityGraduationYear)],
  ];
  if ("phone" in p) rows.push(["Phone", p.phone]);
  if ("dateOfBirth" in p) {
    rows.push([
      "Date of birth",
      p.dateOfBirth ? formatDayKey(dateOnlyFromIso(p.dateOfBirth)) : null,
    ]);
  }
  if ("notes" in p) {
    rows.push(["Internal notes", p.notes]);
  }
  return (
    <View className="flex-col gap-2">
      <GroupedList>
        {rows.map(([label, value]) => (
          <ListRow key={label} title={value || "—"} titleLines={8} subtitle={label} />
        ))}
      </GroupedList>
      {/* Staff-only: the student's own payload never carries this field. */}
      {"notes" in p ? (
        <Text variant="caption" className="px-1 text-muted-foreground">
          Staff only — the student never receives this field.
        </Text>
      ) : null}
    </View>
  );
}
