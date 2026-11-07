import { isAlumnus, isStudyingAlumnus } from "@space/shared";
import { Redirect, Stack, useSegments } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenErrorBoundary } from "../../src/design/layout/error-boundary";
import { TabBarPresenceContext } from "../../src/design/layout/shell-context";
import { isBlockedForAlumni } from "../../src/lib/alumni-guard";
import { PUSHED_NAV_ROUTE_NAMES } from "../../src/lib/route-names";
import { TABS_ROUTE, singularTabsRouter } from "../../src/lib/tabs-stack-router";
import { useSessionStore } from "../../src/store/session";

/** A detail screen that throws while rendering shows a retry, not a crashed app. */
export const ErrorBoundary = ScreenErrorBoundary;

/**
 * A cold deep link to a detail screen (`/student/12`, a notification tap)
 * still gets the tabs underneath it, so Back lands on a tab rather than
 * leaving the app. The tab it lands on is Home, the tabs' own anchor.
 */
export const unstable_settings = { anchor: "(tabs)" };

/**
 * Detail routes: reachable by navigation, never tabs. They are not in any
 * nav's hrefs, so the tabs' ALL_ROUTE_NAMES cannot know about them; they sit
 * in this directory, outside `(tabs)/`, and push onto this stack above the
 * tabs. Every route file under (app)/ outside `(tabs)/` is listed here or in
 * PUSHED_NAV_ROUTE_NAMES (the nav destinations that are a tab for no role,
 * derived from packages/shared — never listed here);
 * app-layout-routes.test.tsx reads the filesystem and fails if one is missing.
 * Plans add a detail route by appending to this list — nothing else.
 */
export const DETAIL_ROUTE_NAMES: readonly string[] = [
  "assignment/[id]/index",
  "assignment/[id]/edit",
  "assignment/new",
  // No role has it in its nav since Work took it (2026-11-07), but Season, the staff
  // panel and notifications still open it.
  "assignments",
  "group/[id]/index",
  "submission/[publicId]",
  "session/[id]/attendance",
  "session/[id]/index",
  "seasons/[code]/index",
  "past-season/[seasonId]/index",
  "past-season/[seasonId]/assignments",
  "past-season/[seasonId]/quizzes",
  "past-season/[seasonId]/attendance",
  "seasons/[code]/edit",
  "seasons/[code]/end",
  "seasons/[code]/start",
  "seasons/[code]/results",
  "seasons/new",
  "seasons/[code]/roster/index",
  "seasons/[code]/roster/import",
  "seasons/[code]/people",
  "group/new",
  "group/[id]/edit",
  "session/new",
  "session/[id]/edit",
  "quiz/[id]/index",
  "quiz/[id]/grade",
  "quiz/new",
  "quiz/[id]/edit",
  "student/[id]/index",
  "student/[id]/edit",
  "students/new",
  "users/new",
  "users/import",
  "design-catalogue",
  "user/[id]",
  "event/[id]",
  "attention/sessions",
  "attention/at-risk",
  // Opened from the gear on Notifications (owner, 2026-11-07), not from a nav list.
  "settings/notifications",
  // Opened from Profile's Edit (owner, 2026-11-07).
  "edit-profile",
];

/**
 * Detail screens slide in from the right and swipe back from anywhere on the
 * screen. No navigator header: the screen's frame (`Screen`) owns the top
 * inset, the offline strip and the title (rulings R9, R14).
 */
export const DETAIL_SCREEN_OPTIONS = {
  animation: "slide_from_right",
  gestureEnabled: true,
  fullScreenGestureEnabled: true,
  headerShown: false,
} as const;

const TABS_SCREEN_OPTIONS = { headerShown: false } as const;

/**
 * `(app)/_layout.tsx` — the signed-in area: a `Stack` with the tabs
 * (`(tabs)/_layout.tsx`, the `Tabs` navigator and the pill) at the bottom
 * and every detail route pushed above them, so Back returns to the screen a
 * detail was opened from. Groups add no URL segment: `/settings` and
 * `/student/12` are the same URLs they were when everything was one `Tabs`.
 *
 * The anonymous redirect and the alumni guard live here, above both
 * navigators, so they cover detail routes as well as tabs.
 */
export default function AppLayout() {
  const status = useSessionStore((s) => s.status);
  const alumnusNotStudying = useSessionStore((s) => {
    if (s.user == null) return false;
    const audience = {
      role: s.user.role,
      graduationYear: s.scopes?.graduationYear ?? null,
      activeSeasonId: s.scopes?.activeSeasonId ?? null,
    };
    return isAlumnus(audience) && !isStudyingAlumnus(audience);
  });
  const segments = useSegments();

  // The boot gate (Task 6, app/_layout.tsx) has already resolved "idle" and
  // "restoring" by the time this mounts — the only unauthenticated status
  // this can see is "anonymous".
  if (status === "anonymous") return <Redirect href="/login" />;

  // v1 role-layout.tsx: an alumnus is kept out of the active-student area and sent
  // to the read-only portal (here: Home). Reaching a student-only destination by
  // deep link or stale navigation state lands here (REG-81). A tab's segments
  // carry the "(tabs)" group; isBlockedForAlumni skips groups. An alumnus studying
  // in a community-wide season is in that area, like any student.
  if (alumnusNotStudying && isBlockedForAlumni(segments)) return <Redirect href="/dashboard" />;

  // The tabs are one navigator (singularTabsRouter): a push to a tab route
  // from a detail (a link to a list, Home's bell and user menu) returns to
  // the one Tabs at the bottom, popping the details above it.
  // The scrim sits beside the Stack so tabs and detail screens both get it.
  // Detail screens have no pill, so their content only clears the bottom
  // inset; the tabs layout says otherwise for its own screens (ruling R15).
  return (
    <>
      <SystemBarScrim />
      <TabBarPresenceContext.Provider value={false}>
        <Stack UNSTABLE_router={singularTabsRouter}>
          <Stack.Screen name={TABS_ROUTE} options={TABS_SCREEN_OPTIONS} />
          {DETAIL_ROUTE_NAMES.map((name) => (
            <Stack.Screen key={name} name={name} options={DETAIL_SCREEN_OPTIONS} />
          ))}
          {/* Settings, Notifications, Events, …: opened from More (MENTOR: Profile),
              so they push like a detail and Back returns there (ruling R19). */}
          {PUSHED_NAV_ROUTE_NAMES.map((name) => (
            <Stack.Screen key={name} name={name} options={DETAIL_SCREEN_OPTIONS} />
          ))}
        </Stack>
      </TabBarPresenceContext.Provider>
    </>
  );
}

/**
 * Edge-to-edge Android draws the translucent system bar over the page, so
 * page text showed through behind it (3-button nav, seen in the leader sweep).
 * A solid strip the height of the bottom inset, in the page background,
 * under the floating tab bar (whose bottom is that same inset) on a tab, and
 * under the last content of a detail screen.
 */
function SystemBarScrim() {
  const { bottom } = useSafeAreaInsets();
  if (bottom <= 0) return null;
  return (
    <View
      pointerEvents="none"
      testID="system-bar-scrim"
      className="bg-background"
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: bottom, zIndex: 5 }}
    />
  );
}
