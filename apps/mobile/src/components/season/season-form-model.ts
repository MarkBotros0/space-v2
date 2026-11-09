import { isValid, parse } from "date-fns";
import type { SeasonStatus } from "@space/shared";

import type { SeasonIdentityInput } from "../../hooks/use-season-writes";

export interface SeasonFormValues {
  code: string;
  program: string;
  /** The program someone must have finished to join; "" for none. */
  requiredProgram: string;
  /** Everyone who passes becomes an alumnus when the season ends. */
  graduatesOnPass: boolean;
  /** Everyone may take part as a student, alumni too; it runs alone. */
  isCommunityWide: boolean;
  year: string;
  description: string;
  /** Calendar days "YYYY-MM-DD" (spec 02 D12: stored as UTC midnight). */
  startDay: string;
  endDay: string;
  status: SeasonStatus;
  budget: string;
  weight: string;
}

export const NEW_SEASON_VALUES: SeasonFormValues = {
  code: "",
  program: "",
  requiredProgram: "",
  graduatesOnPass: false,
  isCommunityWide: false,
  year: String(new Date().getFullYear()),
  description: "",
  startDay: "",
  endDay: "",
  status: "DRAFT",
  budget: "180",
  weight: "90",
};

export const STATUS_LABELS: Record<SeasonStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

/**
 * The statuses the form may offer for a season now at `current`. Starting and
 * ending a season are their own flows, so Draft never leads to Active here and
 * Active never to Completed, and nothing returns to Draft. A finished season can
 * be archived and restored.
 */
export function allowedSeasonStatuses(current: SeasonStatus): SeasonStatus[] {
  switch (current) {
    case "DRAFT":
      return ["DRAFT"];
    case "ACTIVE":
      return ["ACTIVE"];
    case "COMPLETED":
      return ["COMPLETED", "ARCHIVED"];
    case "ARCHIVED":
      return ["ARCHIVED", "COMPLETED"];
  }
}

export const NO_REQUIRED = "__none__";

/**
 * The programs a season can require: every distinct program on the seasons the
 * super already reads, except the season's own, plus the one already set (so it
 * stays visible even when no listed season carries it). Alphabetical.
 */
export function requiredProgramChoices(seasons: { program: string }[], ownProgram: string, current: string): string[] {
  const own = ownProgram.trim();
  const set = new Set(seasons.map((s) => s.program.trim()).filter((p) => p !== ""));
  if (current !== "") set.add(current);
  set.delete(own);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export const dayToDate = (day: string): Date | null => {
  const d = parse(day, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : null;
};

export function toBody(
  v: SeasonFormValues,
  canSetRequired: boolean,
  canSetGraduating: boolean,
  canSetCommunity: boolean,
): SeasonIdentityInput {
  return {
    code: v.code,
    program: v.program,
    year: Number(v.year),
    description: v.description.trim() === "" ? null : v.description,
    // Settled before the season starts: left out once it has, so the server has nothing to refuse.
    ...(canSetRequired
      ? { requiredProgram: v.requiredProgram === "" || v.isCommunityWide ? null : v.requiredProgram }
      : {}),
    ...(canSetGraduating ? { graduatesOnPass: v.graduatesOnPass } : {}),
    ...(canSetCommunity ? { isCommunityWide: v.isCommunityWide } : {}),
    startDate: `${v.startDay}T00:00:00.000Z`,
    endDate: `${v.endDay}T00:00:00.000Z`,
    status: v.status,
    absenceBudgetMinutes: Number(v.budget),
    absenceWeightMinutes: Number(v.weight),
  };
}
