/**
 * Home's session card, the same for every role (owner, 2026-11-09): the eyebrow
 * says when ("Next session · in 5 days", "Happening now"), the title opens the
 * session, one line says the day, time, length and place, and buttons show only
 * for what can be done right now.
 *
 * Emphasis is earned: the card is the brand hero only while the session runs or
 * while it carries an action (check in, mark attendance, join the stream). The
 * rest of the week it is a plain card, so it never outweighs the season ring.
 */
import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import type { DashboardSession } from "@space/shared";

import { dayCue } from "../../lib/calendar-grid";
import { formatMinutes, formatWallTime, formatWeekdayDay, unbreakable } from "../../lib/format";
import { HeroCard } from "../ui/hero-card";

const NEXT_SESSION = "Next session";

function sessionEyebrow(session: DashboardSession, todayKey: string): string {
  if (session.isInProgress) return "Happening now";
  const cue = dayCue(session.dayKey, todayKey);
  return cue ? `${NEXT_SESSION} · ${cue}` : NEXT_SESSION;
}

/** Each unit is one unbreakable run, so the line breaks between them, never inside one. */
function sessionMeta(session: DashboardSession, note?: string): string {
  const parts = [
    formatWeekdayDay(session.dayKey),
    formatWallTime(session.time),
    formatMinutes(session.durationMinutes),
  ].map(unbreakable);
  if (session.location) parts.push(session.location);
  if (note) parts.push(note);
  return parts.join(" · ");
}

export function SessionHomeCard({
  session,
  todayKey,
  note,
  action,
}: {
  session: DashboardSession | null;
  /** The day the cue counts from ("in 5 days", "Today"). */
  todayKey: string;
  /** Appended to the meta line, e.g. a leader's "2 present · 7 not checked in". */
  note?: string;
  /**
   * What can be done now. Pass it only when there is something; its presence
   * makes the card the brand hero, so `onBrand` is the variant its buttons take.
   */
  action?: (onBrand: boolean) => ReactNode;
}) {
  const router = useRouter();
  if (session === null) return <HeroCard eyebrow={NEXT_SESSION} title="No upcoming sessions." />;

  const onBrand = session.isInProgress || action !== undefined;
  return (
    <HeroCard
      tone={onBrand ? "brand" : "surface"}
      eyebrow={sessionEyebrow(session, todayKey)}
      title={session.title}
      meta={sessionMeta(session, note)}
      onTitlePress={() =>
        router.push({ pathname: "/session/[id]", params: { id: String(session.id) } })
      }
      action={action?.(onBrand)}
    />
  );
}
