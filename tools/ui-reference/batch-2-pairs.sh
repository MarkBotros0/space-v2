#!/usr/bin/env bash
# Builds the batch-2 comparison page from v1 shots and v2 captures (real data: devbox only).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
v1=~/projects/JPC/.v1-reference/shots
v2=~/projects/JPC/.v2-captures/batch-2
args=()
pair() { # label role v1file v2name
  for t in light dark; do
    local shots; shots=$(ls "$v2/$2/$t/$4"-*.png 2>/dev/null | sort -V | paste -sd, -)
    if [ -n "$shots" ] && [ -f "$v1/$2/$t/$3" ]; then args+=(--pair "$1 ($t)" "$v1/$2/$t/$3" "$shots"); fi
  done
  return 0
}
pair "Login" public login.png login
pair "Forgot password" public forgot-password.png forgot-password
pair "Reset password" public reset-password.png reset-password
pair "Check-in link (invalid)" student checkin__not-a-real-token.png checkin-invalid
pair "Dashboard" student student__dashboard.png dashboard
pair "Season" student student__season.png season
pair "Calendar" student student__calendar.png calendar
pair "Calendar (month)" student student__calendar__month.png calendar-month
pair "Assignments" student student__assignments.png assignments
pair "Assignment detail" student student__assignments__id.png assignment-detail
pair "Quizzes" student student__quizzes.png quizzes
pair "Quiz" student student__quizzes__id.png quiz-detail
pair "History" student student__history.png history
pair "Attendance" student student__attendance.png attendance
pair "Profile" student student__profile.png profile
pair "Settings" student student__settings.png settings
pair "More" student student__more.png more
pair "Notifications" student student__notifications.png notifications
pair "Session detail" student student__sessions__id.png session-detail
node "$here/compare.mjs" --out "$v2/compare-batch-2.html" "${args[@]}"
echo "$v2/compare-batch-2.html"
