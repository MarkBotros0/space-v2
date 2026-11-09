# Dead-code audit: space-v2-refactor (HEAD 4ab858a3)

Read-only. The analysis scripts are in this scratchpad: `deadcode.js` (import graph built with the TS compiler API, run once each for backend, mobile and shared and then merged; re-exports through barrels are credited to the original declaration), `localuse.js` (AST count of references inside the declaring file, comments excluded), `fullydead.js`, and `routes.js` (backend routes compared with mobile `/api/v1` call sites). Raw output files: `deadcode.json`, `classified.json`, `unused.txt`, `testonly.txt`, `routes-out.txt`, `tsc-*.txt`.

Each candidate was also grepped for string-based use across `apps/`, `packages/`, `tools/`, `apps/mobile/.maestro`, `jest.mock` paths, package.json scripts and vercel.json. Every row below is wave 1.

## Headline numbers
| Measure | Count |
|---|---|
| Source files analysed (not generated) | 1312 |
| Exports never imported **and** never referenced inside their own file (fully dead) | 119 (16 values, 103 types, most of the types are shared `z.infer` aliases) |
| Exports referenced only in their own file (the `export` keyword can go) | 156 values, 183 types |
| Exports imported only by tests, with no production use | 18 |
| Files whose every export is dead | 5 |
| `tsc --noUnusedLocals --noUnusedParameters` errors | backend 0, mobile 0, shared 0 (all three exit 0) |
| Commented-out code blocks | 0 (every heuristic grep hit was an explanatory comment) |
| Backend routes | 179. Routes with no mobile caller: 13 after excluding false positives. Mobile calls with no backend route: 0 |

## 1. Dead files and symbols (production code)
| ID | Confidence | Evidence | Proposed action |
|---|---|---|---|
| DC-001 | confirmed | `apps/mobile/src/components/season/GraduatingField.tsx`: nothing imports it. The name appears only in its own file; there are no hits in catalogue, maestro or tools | Delete the file |
| DC-002 | confirmed | `apps/mobile/src/design/forms/fieldset.tsx` (`Fieldset`): nothing imports it. `assignment-form.tsx` defines its own private `Fieldset` | Delete the file |
| DC-003 | confirmed | `apps/mobile/src/design/seasons/season-status-badge.tsx` (`SeasonStatusBadge`): nothing imports it. Only `docs/.../02-seasons.md` mentions it | Delete the file |
| DC-004 | confirmed | `apps/mobile/src/design/ui/file-upload.tsx` (`FileUpload`): reached only through `export *` in `design/ui/index.ts`; no file uses the symbol | Delete the file and its line in `design/ui/index.ts` |
| DC-005 | confirmed | `apps/mobile/src/design/ui/separator.tsx` (`Separator`): same situation as DC-004 | Delete the file and its barrel line |
| DC-006 | confirmed | `design/ui/card.tsx`: `CardDescription`, `CardFooter` are not referenced anywhere outside the export list | Remove both |
| DC-007 | confirmed | `design/ui/modal.tsx`: `ModalTrigger`, `ModalClose` are unused; the remaining references are in the header comment | Remove both and fix the comment |
| DC-008 | confirmed | `design/ui/avatar.tsx`: `AvatarGroup` is unused (the only other reference is a comment) | Remove |
| DC-009 | confirmed | `design/ui/button.tsx`: `BUTTON_ICON_SIZE` is exported and never read, not even inside the file | Remove |
| DC-010 | confirmed | `design/forms/form-parts.tsx`: `FormActions` is unused. `FormErrorBox` and `ToggleButtons` from the same file are used | Remove `FormActions` |
| DC-011 | confirmed | `lib/day-groups.ts`: `groupSessionsByDay` is unused (`groupCalendarByDay` replaced it) | Remove |
| DC-012 | confirmed | `apps/backend/src/lib/permissions/announcement.ts:7` `canReadAnnouncement`: re-exported from `permissions/index.ts` and never called. Reads go through `announcementVisibilityFilter` | Remove the function and the re-export (also check the spec text) |
| DC-013 | confirmed | `apps/backend/src/routes/imports.ts:58` `IMPORT_FILE_UPLOAD_SUPPORTED = false`: exported at line 312 and never imported. Its comment says "the client is TOLD there is no picker", but no response returns it | needs owner: either remove it, or actually send it in the template response |
| DC-014 | confirmed | `routes/imports.ts:312` also exports `commitLimiter`, `previewLimiter`, which no file imports (they are used locally) | Drop them from the export list |
| DC-015 | confirmed | `packages/shared/src/note.ts:203` `seasonEngagementResponseSchema`: unused. Its endpoint `GET /seasons/:id/engagement` has no client caller either (DC-061) | Remove it along with DC-061, or keep both |
| DC-016 | likely | 103 type aliases are exported and never referenced anywhere, almost all `export type X = z.infer<typeof xSchema>` in `packages/shared` (list in the appendix). CLAUDE.md says domain contracts are Zod, so the schemas stay and only these aliases are dead | Delete the unused aliases, or keep them as a public contract surface (owner's choice). Low risk |
| DC-017 | likely | 156 value exports and 183 type exports are referenced only inside their own file (the full list is in `unused.txt`, where the `local=` count is greater than 0). Examples: `email-templates.ts` `renderShell`/`paragraph`/`buttonHtml`, `SEASON_START_LOCK_KEY`, `isEditableStatus`, `dueAtFor`, and many shared `*Schema` objects used only to build another schema | Remove the `export` keyword (no behaviour change). Low priority |

## 2. Used only by tests (no production caller)
| ID | Confidence | Evidence | Proposed action |
|---|---|---|---|
| DC-020 | confirmed | `apps/backend/src/lib/rbac.ts:54` `isAdminOfAnySeason`: used only by `rbac.test.ts` | Delete it and its test |
| DC-021 | likely | `apps/backend/src/lib/permissions/note.ts:87` `canViewNote`: used only by an integration test (`student-notes-privacy`). The routes use another gate | needs owner: delete it, or make the routes use it. Confirm which gate the note routes rely on |
| DC-022 | likely | `apps/backend/src/lib/roles/student-seats.ts:68` `checkStudentSeat`: used only by the `season-enrollments` integration test. CLAUDE.md lists it as a refusal helper, but no production path calls it | needs owner: find out whether a seat-write path should call it. This could be a missing guard, not dead code |
| DC-023 | likely | `apps/backend/src/lib/sentry.ts:40` `sentryEnabled` and `apps/mobile/src/lib/sentry.ts:26` `sentryEnabled`: used only by the sentry tests | Keep as a test seam, or inline it |
| DC-024 | confirmed | `packages/shared/src/notification.ts:135` `NOTIFICATION_PREFERENCE_KEYS`: tests only | Delete, or move it into a test helper |
| DC-025 | confirmed | `apps/mobile/src/lib/format.ts`: `formatDueDate`, `splitWallTime`, `formatShortDate` are used only by `format.test.ts` | Delete the functions and their tests |
| DC-026 | confirmed | `apps/mobile/src/lib/staff-today.ts`: `liveSessions`, `nextSession`, `hasNothingToDo` are used only by `staff-today.test.ts`. `unmarkedSessions` and `NeedsAction` are live | Delete those three and their tests |
| DC-027 | confirmed | `apps/mobile/src/screens/work/work-model.ts:182` `workSections`: `work-model.test.ts` only | Delete it and its tests (check `/work` uses a different builder) |
| DC-028 | confirmed | `apps/mobile/src/lib/assignment-labels.ts:41` `trackerStatusLabel`: test only | Delete |
| DC-029 | confirmed | `apps/mobile/src/hooks/use-engagement.ts:59` `useMyEngagement`: `my-engagement.test.tsx` only | Delete the hook and its test |
| DC-030 | confirmed | `apps/mobile/src/design/ui/attendance-pill.tsx` `AttendancePill`: `design-display.test.tsx` only. It is also missing from the design catalogue | Delete the component, its barrel line and the test |
| DC-031 | keep | `__resetRefreshState`, `__handleResponseError`, `setReducedMotionForTests`, plus about 90 constants and helpers exported for tests that are also used in production (`testonly.txt`) | Keep (intentional test seams) |
| DC-032 | keep | `apps/backend/scripts/community-preflight*.ts`, `convert-stored-roles.ts`: imported only by tests, but they are package.json script entries | Keep |

## 3. package.json dependencies
| ID | Confidence | Evidence | Proposed action |
|---|---|---|---|
| DC-040 | likely | mobile `expo-linear-gradient`: no import anywhere in `app/`, `src/` or config, and it is not an app.json plugin. Its last users were the legacy stat-card from ui-plan-02, which has been removed. It is a native module | Remove in a build that ships a new binary anyway (needs a new EAS build; it cannot ship over the air) |
| DC-041 | keep | mobile `@expo/dom-webview` | Keep: tooling/peer. Commit c8561741 shows it is an SDK-managed optional peer of `expo` |
| DC-042 | keep | mobile `expo-linking`, `react-native-screens`, `react-native-worklets` | Keep: tooling/peer of expo-router and reanimated |
| DC-043 | keep | mobile `react-test-renderer` | Keep: peer of @testing-library/react-native |
| DC-044 | keep | mobile `@babel/core`, `babel-preset-expo`, `jest-expo`, `@react-native/jest-preset`, `tailwindcss`, `nativewind`, `@types/*`, `eslint`, `typescript` | Keep: tooling/peer |
| DC-045 | keep | backend `@prisma/client` | Keep: the generated client imports `@prisma/client/runtime/*` (82 imports) |
| DC-046 | likely | backend `pg` and `@types/pg`: never imported directly. `@prisma/adapter-pg` declares both as its own dependencies | needs owner: redundant but harmless; dropping them only loosens the version pin. Keep unless you want a smaller manifest |
| DC-047 | keep | backend `ts-node-dev` (dev script), `ts-node` (scripts), `@types/*`, `eslint`, `typescript`; shared `jest`, `@types/jest`, `eslint`, `typescript`; root `prettier`, `turbo`, `typescript` | Keep: tooling |

## 4. Environment variables
| ID | Confidence | Evidence | Proposed action |
|---|---|---|---|
| DC-050 | confirmed | `turbo.json` build `env` lists `AUTH_URL`. Nothing in the backend reads it: it is a v1/NextAuth variable that appears only in `.env.example` and `tools/ui-reference/setup-v1.sh` (for v1) | Remove it from `turbo.json` and from `apps/backend/.env.example` |
| DC-051 | confirmed (not dead, a gap) | `turbo.json` build `env` is missing about 20 keys that `config.ts` does read: `ENABLE_UPLOADS`, `INVITE_TOKEN_TTL_HOURS`, `READ_ONLY`, `IMPORT_*`, `RATE_LIMIT_STORE`, `ENABLE_PUSH`, `EXPO_ACCESS_TOKEN`, `CRON_SECRET`, `SENTRY_*`, `GOOGLE_CLIENT_IDS`, `DEV_USER_SWITCHER`, `APP_STORE_URL`, `PLAY_STORE_URL`, `VERCEL_GIT_COMMIT_SHA`. The comment says the build reads none of them, so the risk is low | needs owner: sync the list, or replace it with a comment |
| DC-052 | confirmed (all live) | All 34 keys in `apps/backend/src/lib/config.ts` reach a consumer outside tests (counts checked per `config.<key>`). `prisma.config.ts` reads `DATABASE_URL` directly, which is its documented exception | none |
| DC-053 | confirmed (all live) | Mobile `app-config.ts`: `EXPO_PUBLIC_SWEEP_BUILD`, `_SENTRY_DSN`, `_SENTRY_ENVIRONMENT`, `_GOOGLE_WEB_CLIENT_ID` and `_GOOGLE_IOS_CLIENT_ID` are all consumed. The only real read outside `app-config.ts` is `EXPO_PUBLIC_API_BASE_URL` in `src/lib/api-client.ts:21` (other hits are comments). `app.config.js` reads `SENTRY_ORG/PROJECT/AUTH_TOKEN` at build time (tooling) | Optional: move the `API_BASE_URL` read into `app-config.ts` (consistency, not dead code) |

## 5. Flags and switches that always have one value
| ID | Confidence | Evidence | Proposed action |
|---|---|---|---|
| DC-055 | confirmed | `IMPORT_FILE_UPLOAD_SUPPORTED` is a hard-coded `false` constant (see DC-013) | Same as DC-013 |
| DC-056 | likely | `STORAGE_DRIVER=s3` selects `S3Storage` (`lib/storage/s3.ts`), whose every method throws "not implemented". It is unreachable in practice | needs owner: keep as the CMS driver slot (CLAUDE.md plans a third driver), or remove `s3` from the enum until it is real |
| DC-057 | needs owner | `READ_ONLY` was the cutover freeze (Plan 18). The owner has ruled there is no live cut-over ("it's a test db"). The middleware `middleware/read-only.ts`, the config key, the openapi text and the README row are all for a switch that will never be flipped | Decide: remove the freeze machinery, or keep it as a maintenance mode |
| DC-058 | needs owner | `ENABLE_UPLOADS` defaults to false, Vercel sets it false, and the mobile app never calls the upload route (DC-066). The upload path is dormant until the CMS arrives | Keep (documented); just note it |
| DC-059 | confirmed | `DELETE /api/v1/notes/:id` always answers 501 `delete_unavailable` | Keep (deliberate, documented). It is not dead logic, only a stub |

## 6. Commented-out code
None found. The heuristic greps (lines that look like `// const|import|return|await|fn();|<Jsx`, and `{/* <Jsx`) matched only prose comments.

## 7. Backend routes with no mobile caller (the owner decides; these are not necessarily dead)
Static match of 179 routes against 183 mobile `/api/v1` literals. False positives (dynamic suffix templates) were removed by grepping each one.
| ID | Route | Note |
|---|---|---|
| DC-060 | `POST /api/v1/auth/logout-all` | CLAUDE.md says there is no "Sign out everywhere". Strong removal candidate, together with the unused shared `LogoutAllResponse` and `logoutAllResponseSchema` |
| DC-061 | `GET /api/v1/seasons/:id/engagement` | Its schema is unused too (DC-015) |
| DC-062 | `POST /api/v1/me/password` | CLAUDE.md says there is no password form. Strong candidate, together with `ChangePasswordBody`/`ChangePasswordResponse` |
| DC-063 | `PATCH /api/v1/notes/:id`, `DELETE /api/v1/notes/:id` (the 501 stub) | The app has no note editing |
| DC-064 | `GET /api/v1/sessions` (list) | The app uses range and other endpoints |
| DC-065 | `POST /api/v1/students/:id/enrollments` | The app enrols through `POST /seasons/:id/enrollments` |
| DC-066 | `POST` and `DELETE /api/v1/submissions/:publicId/files`, `GET /api/v1/submissions/:publicId/files/:fileId` | Uploads are disabled. The GET is the v2-only safe file stream |
| keep | `GET /health`, `GET /api/docs.json`, `GET /api/v1/internal/follow-ups/remind` | Called by ops, Swagger and the Vercel cron (`vercel.json`) |

There are no mobile calls to routes that don't exist.

## 8. Unreachable branches and tsc
- `tsc --noEmit --noUnusedLocals --noUnusedParameters` exits 0 with 0 errors in `apps/backend`, `apps/mobile` and `packages/shared`. ESLint already enforces this, so nothing more to report here.
- Unreachable in practice: the `S3Storage` branch in `lib/storage/index.ts:43` (DC-056), the `readOnlyGuard` refusal path (DC-057), and `apps/backend/scripts/smoke.sh`, which only a 2026-08 plan doc mentions (likely stale; needs owner).

## Not dead (checked)
- `apps/mobile/app/(app)/(tabs)/coursework.tsx` and `app/(app)/settings/notifications.tsx` have no imports, but they are routes reached by href (`navigation.ts`/`nav-routes.ts`, and `(app)/_layout.tsx` plus maestro s19/s28/s40).
- `__mocks__/style-mock.js` (jest moduleNameMapper), `__mocks__/react-native-youtube-iframe.tsx` (jest automock), `jest.resolver.js`, both `apps/mobile/scripts/*.mjs` (package.json scripts) and `scripts/copy-swagger-assets.js` (build) are all in use.

## Appendix: wholly unused type exports (DC-016)
- `packages/shared/src/auth.ts`: GoogleSignInRequest, RefreshRequest, AuthUser, MeResponse
- `packages/shared/src/enums.ts`: AssignmentType, AnnouncementAudience
- `packages/shared/src/assignment.ts`: AssignmentListItem, MySubmissionSummary, CreateAssignmentRequest, CreateAssignmentBody, UpdateAssignmentRequest, UpdateAssignmentBody, AssignmentDeletedResponse
- `packages/shared/src/season-lifecycle.ts`: EndSeasonResponse
- `packages/shared/src/season.ts`: SeasonDetailGroup, SeasonAdminPatchBody, DuplicateSeasonBody, SeasonRefResponse
- `packages/shared/src/season-admins.ts`: SeasonAdminListResponse, AddSeasonAdminBody, StaffCandidatesResponse
- `packages/shared/src/standing.ts`: AddSeasonEnrollmentsResponse
- `packages/shared/src/group.ts`: GroupWriteRequest, GroupUpdateRequest, GroupAssignmentsResult
- `packages/shared/src/session.ts`: CheckInRequest, CreateSessionBody, UpdateSessionBody, DeleteSessionBody, SessionSeriesItem, SessionRange
- `packages/shared/src/attendance.ts`: SaveAttendanceRequest, SaveAttendanceResponse, AttendanceBudget
- `packages/shared/src/submission.ts`: UpdateSubmissionRequest, ReviewSubmissionRequest, SubmissionFileSummary, SubmissionQueueCounts, SubmissionQueueQuery, EnsureSubmissionResponse, SaveSubmissionResponse, ReviewSubmissionResponse
- `packages/shared/src/quiz/read.ts`: StudentQuizListPage
- `packages/shared/src/quiz/grading.ts`: QuizGradeRow, QuizGradingAnswer
- `packages/shared/src/quiz/writes.ts`: CreateQuizBody, UpdateQuizBody, QuizQuestionBody, ReorderQuestionsBody, PublishQuizBody, SaveQuizAnswersBody, SaveQuizGradesBody, GradeEssayAnswersBody, ReopenAttemptBody, QuizListQuery, QuizAttemptsQuery
- `packages/shared/src/api-error.ts`: ApiErrorBody
- `packages/shared/src/student/writes.ts`: CreateEnrollmentBody, UpdateEnrollmentBody, RestoreEnrollmentBody
- `packages/shared/src/student/lifecycle.ts`: GraduateStudentBody
- `packages/shared/src/student/profile.ts`: OwnProfileField
- `packages/shared/src/user.ts`: UserAdminSeason, UserWriteRole, ChangePasswordBody, ChangePasswordResponse, LogoutAllResponse, PendingInvitesResponse, DevSwitchRequest
- `packages/shared/src/note.ts`: CreateNoteBody, UpdateNoteBody, StudentEngagement
- `packages/shared/src/follow-up.ts`: FollowUpList
- `packages/shared/src/notification.ts`: NotificationListQuery, MarkReadRequest, DeviceRegistration, DeviceUnregistration
- `packages/shared/src/video-quiz.ts`: SubmitVideoAnswerRequest, SubmitVideoAnswerResponse, VideoProgressRequest, VideoQuizResultRow, UpdateVideoQuestionResponse, DeleteVideoQuestionResponse
- `packages/shared/src/forum.ts`: ForumOwnResponse, SubmitForumResponseRequest, AddForumCommentRequest, ForumFeedQuery, ForumCommentsQuery, ForumCommentsPage
- `packages/shared/src/event.ts`: EventListQuery
- `packages/shared/src/reports.ts`: ReportScopeQuery, EngagementStudentPage
- `packages/shared/src/dashboard.ts`: SeasonProgress, DashboardSeason, StaffCohortSummary, QuizRollup, StudentAssignmentSummary, ActivityItem, MentorDashboard, Dashboard
- `packages/shared/src/import.ts`: PastedSheetInput
- `apps/backend/scripts/create-super-admin/create.ts`: SuperAdminInput
- `apps/mobile/src/design/theme/use-theme-colors.ts`: SemanticColor
