/**
 * The reports domain: `scope` turns a request into the permitted season set,
 * `summary` builds the charts, `rows` the paged cohort and the shared at-risk
 * order. Import from this index.
 */
export { resolveReportScope } from "./scope";
export { buildEngagementSummary, type EngagementSummaryOptions, type EngagementSummaryResult } from "./summary";
export {
  byScoreThenId,
  listEngagementRows,
  type EngagementListOptions,
  type EngagementListResult,
  type ScoreOrderKey,
  type ScoredReportRow,
} from "./rows";
