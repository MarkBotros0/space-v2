/**
 * The finished and live season sets, defined once in packages/shared, plus the
 * Prisma filters built from them. Import these rather than spelling the
 * statuses inline: "finished" is COMPLETED or ARCHIVED everywhere.
 */
import { FINISHED_SEASON_STATUSES, LIVE_SEASON_STATUSES } from "../../../../../packages/shared/src/index";

export {
  FINISHED_SEASON_STATUSES,
  LIVE_SEASON_STATUSES,
  isSeasonFinished,
  isSeasonLive,
} from "../../../../../packages/shared/src/index";

/** `status` filter for a finished season (COMPLETED or ARCHIVED). */
export const finishedSeasonStatus = { in: [...FINISHED_SEASON_STATUSES] };

/** `status` filter for a live season (DRAFT or ACTIVE). */
export const liveSeasonStatus = { in: [...LIVE_SEASON_STATUSES] };
