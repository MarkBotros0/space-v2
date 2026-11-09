import type { ReactNode } from "react";
import { View } from "react-native";
import type {
  AttendanceStatus,
  EnrollmentStatus,
  QuizAttemptStatus,
  SeasonStatus,
  SubmissionStatus,
  UserStatus,
} from "@space/shared";

import { dueChip, StatusChip, statusChip } from "../../design/ui/status-chip";
import { Text } from "../../design/ui/text";
import { CatalogueSection } from "./section";

const SEASON: SeasonStatus[] = ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"];
const ENROLLMENT: EnrollmentStatus[] = ["ACTIVE", "COMPLETED", "WITHDRAWN"];
const ATTENDANCE: AttendanceStatus[] = ["PRESENT", "LATE", "ABSENT"];
const SUBMISSION: SubmissionStatus[] = ["DRAFT", "SUBMITTED", "REVIEWED", "RETURNED"];
const QUIZ_ATTEMPT: QuizAttemptStatus[] = ["IN_PROGRESS", "SUBMITTED", "GRADED"];
const USER: UserStatus[] = ["active", "invited", "pending", "inactive"];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text variant="caption" className="text-muted-foreground">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}

const TODAY = "2026-11-04";
const DUE: { isOverdue: boolean; dueOrgDay: string | null }[] = [
  { isOverdue: true, dueOrgDay: "2026-11-03" },
  { isOverdue: false, dueOrgDay: "2026-11-04" },
  { isOverdue: false, dueOrgDay: "2026-11-05" },
  { isOverdue: false, dueOrgDay: "2026-11-06" },
  { isOverdue: false, dueOrgDay: "2026-11-09" },
  { isOverdue: false, dueOrgDay: "2026-11-12" },
  { isOverdue: false, dueOrgDay: null },
];

export function ChipsSection() {
  return (
    <CatalogueSection id="chips" title="Status chips">
      <Row label="Season">
        {SEASON.map((v) => (
          <StatusChip key={v} {...statusChip("season", v)} />
        ))}
      </Row>
      <Row label="Enrollment">
        {ENROLLMENT.map((v) => (
          <StatusChip key={v} {...statusChip("enrollment", v)} />
        ))}
      </Row>
      <Row label="Attendance">
        {ATTENDANCE.map((v) => (
          <StatusChip key={v} {...statusChip("attendance", v)} />
        ))}
      </Row>
      <Row label="Submission">
        {SUBMISSION.map((v) => (
          <StatusChip key={v} {...statusChip("submission", v)} />
        ))}
      </Row>
      <Row label="Quiz attempt">
        {QUIZ_ATTEMPT.map((v) => (
          <StatusChip key={v} {...statusChip("quizAttempt", v)} />
        ))}
      </Row>
      <Row label="User">
        {USER.map((v) => (
          <StatusChip key={v} {...statusChip("user", v)} />
        ))}
      </Row>
      <Row label="Due (dueChip)">
        {DUE.map((d) => (
          <StatusChip key={`${d.dueOrgDay}-${d.isOverdue}`} {...dueChip({ ...d, todayOrgDay: TODAY })} />
        ))}
      </Row>
    </CatalogueSection>
  );
}
