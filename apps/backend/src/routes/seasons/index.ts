import { Router } from "express";

import { requireAuth } from "../../middleware/require-auth";
import { addSeasonAdmin, listSeasonAdmins, removeSeasonAdmin } from "./admins";
import {
  createSeasonAssignment,
  createSeasonGroup,
  listSeasonAssignments,
  listSeasonGroups,
  listSeasonSessions,
} from "./children";
import {
  createSeason,
  deleteSeason,
  getSeason,
  getSeasonByCode,
  listSeasons,
  updateSeason,
} from "./crud";
import { duplicateSeason } from "./duplicate";
import { getSeasonEndCheck } from "./end";
import { getSeasonRoster, saveGroupAssignments } from "./roster";

/**
 * Seasons: the season rows themselves, duplication, the child collections
 * (groups, sessions, assignments) and the roster. This file is the route table,
 * in registration order; handlers live beside it.
 */
export const seasonsRouter = Router();

// requireAuth is attached per route (ruling X5): /api/v1/seasons is a shared
// prefix — Plans 12, 15 and 17 mount their own routers on it — so a router-level
// use(requireAuth) here would answer their requests, and every unknown path,
// with 401 instead of the not_found envelope.

seasonsRouter.get("/", requireAuth, listSeasons);
// Before every /:id/* route, or /by-code/roster would match /:id/roster with id "by-code".
seasonsRouter.get("/by-code/:code", requireAuth, getSeasonByCode);
seasonsRouter.get("/:id", requireAuth, getSeason);
seasonsRouter.post("/", requireAuth, createSeason);
seasonsRouter.patch("/:id", requireAuth, updateSeason);
seasonsRouter.delete("/:id", requireAuth, deleteSeason);
seasonsRouter.post("/:id/duplicate", requireAuth, duplicateSeason);

seasonsRouter.get("/:id/groups", requireAuth, listSeasonGroups);
seasonsRouter.post("/:id/groups", requireAuth, createSeasonGroup);
seasonsRouter.get("/:id/sessions", requireAuth, listSeasonSessions);
seasonsRouter.get("/:id/assignments", requireAuth, listSeasonAssignments);
seasonsRouter.post("/:id/assignments", requireAuth, createSeasonAssignment);

// SUPER-only: who administers the season (owner decision — v1 had no write path).
seasonsRouter.get("/:id/admins", requireAuth, listSeasonAdmins);
seasonsRouter.post("/:id/admins", requireAuth, addSeasonAdmin);
seasonsRouter.delete("/:id/admins/:userId", requireAuth, removeSeasonAdmin);

seasonsRouter.get("/:id/end-check", requireAuth, getSeasonEndCheck);
seasonsRouter.get("/:id/roster", requireAuth, getSeasonRoster);
seasonsRouter.put("/:id/group-assignments", requireAuth, saveGroupAssignments);
