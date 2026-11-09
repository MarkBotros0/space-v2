/**
 * A student's details as one grouped list, label above value, for every role's
 * view of the page. Only what is filled in is shown (owner, 2026-11-07: rows of
 * "—" made the page messy); with nothing at all it says so. The phone row calls.
 * Which fields exist depends on the payload's arm (spec 06 D3): a leader's and
 * a mentor's carry the phone but no date of birth or internal notes. No email: the
 * community doesn't contact each other by email.
 */
import { dateOnlyFromIso, type GraduatedByException } from "@space/shared";
import { type ReactNode, Fragment } from "react";
import { Linking, View } from "react-native";

import type { StudentDetail } from "../../hooks/use-students";
import { formatDayKey } from "../../lib/format";
import { ListSectionHeader } from "../ui/grouped-list";
import { PillButton } from "../ui/pill-button";
import { Text } from "../ui/text";

type Row = { label: string; value: string; trailing?: ReactNode };

function DetailRow({ label, value, trailing }: Row) {
  return (
    <View className="min-h-[56px] flex-row items-center gap-3 px-4 py-2.5">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="caption" className="text-muted-foreground">
          {label}
        </Text>
        <Text variant="body" selectable>
          {value}
        </Text>
      </View>
      {trailing}
    </View>
  );
}

function detailRows(p: StudentDetail["profile"], exception?: GraduatedByException | null, canCall = true): Row[] {
  const rows: Row[] = [];
  if ("phone" in p && p.phone) {
    const phone = p.phone;
    rows.push({
      label: "Phone",
      value: phone,
      trailing: canCall ? (
        <PillButton
          label="Call"
          accessibilityLabel={`Call ${phone}`}
          onPress={() => void Linking.openURL(`tel:${phone.replace(/\s+/g, "")}`)}
        />
      ) : undefined,
    });
  }
  if (p.university) rows.push({ label: "University", value: p.university });
  if (p.faculty) rows.push({ label: "Faculty", value: p.faculty });
  if (p.universityGraduationYear !== null)
    rows.push({ label: "Graduation year", value: String(p.universityGraduationYear) });
  if ("dateOfBirth" in p && p.dateOfBirth)
    rows.push({ label: "Date of birth", value: formatDayKey(dateOnlyFromIso(p.dateOfBirth)) });
  if (exception) {
    rows.push({
      label: "Graduated by exception",
      value: `${exception.byName ?? "A super admin"} on ${formatDayKey(dateOnlyFromIso(exception.at))}${exception.reason ? `\n${exception.reason}` : ""}`,
    });
  }
  if ("notes" in p && p.notes) rows.push({ label: "Internal notes · staff only", value: p.notes });
  return rows;
}

export function StudentDetails({
  profile,
  exception,
  canCall = true,
}: {
  profile: StudentDetail["profile"];
  /** SUPER's view only: set when they were graduated without passing a graduating season. */
  exception?: GraduatedByException | null;
  /** False on the student's own record: no button to call yourself. */
  canCall?: boolean;
}) {
  const rows = detailRows(profile, exception, canCall);
  // Owner 2026-11-07: an empty card says nothing worth its space; Edit adds them.
  if (rows.length === 0) return null;
  return (
    <View testID="student-details">
      <ListSectionHeader>Details</ListSectionHeader>
      <View className="overflow-hidden rounded-group bg-surface">
        {rows.map((row, i) => (
          <Fragment key={row.label}>
            {i > 0 ? <View className="ml-4 h-px bg-separator" /> : null}
            <DetailRow {...row} />
          </Fragment>
        ))}
      </View>
    </View>
  );
}
