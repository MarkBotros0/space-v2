import { View } from "react-native";
import type { SessionDetail } from "@space/shared";

import { VideoQuestionsEditor, VideoQuizResultsTable } from "../video-quiz/video-questions-editor";
import { InlineError } from "../../design/layout/route-states";
import { Badge, Card as CardV1, CardContent, CardHeader, CardTitle, DataTable, Text as TextV1 } from "../../design/ui";
import { useVideoQuizResults } from "../../hooks/use-video-quiz";
import { useIsAdminOfSeason, useSessionStore } from "../../store/session";

/**
 * The session's interactive video (Plan 14), staff side — students get the player in StudentSessionBody. A season
 * admin / SUPER gets the question editor (which reads the answer key); a LEADER
 * gets the results table only. Nothing renders for a session with no video — v1
 * lets an admin author a full quiz no student can ever reach (R17).
 */
export function VideoSection({ detail }: { detail: SessionDetail }) {
  const user = useSessionStore((s) => s.user);
  // Mirrors canManageSessionVideo exactly: SUPER, or an ADMIN of this season.
  // NOT `canMarkAttendance` — that flag admits a group LEADER, who may not
  // author questions. The server enforces the gate regardless; this only decides
  // whether the editor (and its answer-key read) is ever mounted.
  const canAuthorVideo = useIsAdminOfSeason(detail.seasonId);
  // Results: authors, plus a LEADER (the server narrows a leader to their groups).
  const canSeeResults = canAuthorVideo || user?.role === "LEADER";

  if (detail.youtubeUrl === null) return null;

  if (canAuthorVideo) return <VideoQuestionsEditor owner={{ kind: "session", sessionId: detail.id }} />;
  if (canSeeResults) {
    return (
      <View>
        <VideoQuizResultsTable sessionId={detail.id} />
      </View>
    );
  }
  return null;
}

/** V2-ONLY (spec 13 D10): how the leader's students did on the session's video quiz. */
export function LeaderVideoResults({ sessionId }: { sessionId: number }) {
  const results = useVideoQuizResults(sessionId, true);
  // A video with no questions has nothing to report.
  if (results.data?.questionCount === 0) return null;
  return (
    <CardV1>
      <CardHeader>
        <CardTitle className="text-base">Video quiz results</CardTitle>
      </CardHeader>
      <CardContent>
        {results.isPending ? (
          <TextV1 className="text-sm text-muted-foreground">Loading…</TextV1>
        ) : results.isError ? (
          <InlineError message="Couldn't load the results." onRetry={() => void results.refetch()} />
        ) : results.data.rows.length === 0 ? (
          <TextV1 className="text-sm italic text-muted-foreground">No students to show yet.</TextV1>
        ) : (
          <DataTable
            rows={results.data.rows}
            rowKey={(r) => r.studentUserId}
            columns={[
              {
                key: "name",
                header: "Student",
                cell: (r) => r.studentName ?? `Student ${r.studentUserId}`,
              },
              {
                key: "answered",
                header: "Answered",
                cell: (r) => `${r.answeredCount}/${r.questionCount} answered`,
              },
              {
                key: "points",
                header: "Points",
                cell: (r) => `${r.earnedPoints}/${r.totalPoints} pts`,
              },
              {
                key: "done",
                header: "",
                cell: (r) =>
                  r.completedAt ? <Badge variant="success">Done</Badge> : <Badge variant="outline">In progress</Badge>,
              },
            ]}
          />
        )}
      </CardContent>
    </CardV1>
  );
}
