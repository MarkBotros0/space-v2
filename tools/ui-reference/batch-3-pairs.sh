#!/usr/bin/env bash
# Builds the batch-3 comparison page from v1 shots and v2 captures (real data: devbox only).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
v1=~/projects/JPC/.v1-reference/shots
v2=~/projects/JPC/.v2-captures/batch-3
args=()
pair() { # label role v1file v2name
  for t in light dark; do
    local shots; shots=$(ls "$v2/$2/$t/$4"-*.png 2>/dev/null | sort -V | paste -sd, -)
    if [ -n "$shots" ] && [ -f "$v1/$2/$t/$3" ]; then args+=(--pair "$1 ($t)" "$v1/$2/$t/$3" "$shots"); fi
  done
  return 0
}
pair "Dashboard" leader leader__dashboard.png dashboard
pair "Groups" leader leader__groups.png groups
pair "Calendar" leader leader__calendar.png calendar
pair "Submissions" leader leader__submissions.png submissions
pair "Submission" leader leader__submissions__publicId.png submission
pair "Submission (reviewed)" leader leader__submissions__FwsYZexPgf.png submission-reviewed
pair "Quizzes" leader leader__quizzes.png quizzes
pair "Quiz grading" leader leader__sessions__id__quiz__id.png quiz-grade
pair "Session detail" leader leader__sessions__id.png session
pair "Attendance" leader leader__sessions__id__attendance.png attendance
pair "Student" leader leader__students__id.png student
pair "More" leader leader__more.png more
pair "Settings" leader leader__settings.png settings
pair "Notifications" leader leader__notifications.png notifications
node "$here/compare.mjs" --out "$v2/compare-batch-3.html" "${args[@]}"
echo "$v2/compare-batch-3.html"
