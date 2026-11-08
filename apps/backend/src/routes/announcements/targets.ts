import type { Request, Response } from "express";

import { apiOk } from "../../lib/api-response";
import { announcementRecipients } from "../../lib/announcement-notifications";
import { postTargetsFor } from "../../lib/permissions";
import { requireUser } from "../../middleware/require-auth";

/** Where the caller may post, each with how many people it would reach (the author excluded). */
export async function listTargets(req: Request, res: Response) {
  const user = requireUser(req);
  const targets = await postTargetsFor(user);
  const [communityReach, seasons] = await Promise.all([
    targets.community
      ? announcementRecipients({ audience: "COMMUNITY" }, user.userId).then((r) => r.length)
      : Promise.resolve(0),
    Promise.all(
      targets.seasons.map(async (s) => ({
        ...s,
        reach: (await announcementRecipients({ audience: "SEASON", seasonId: s.id }, user.userId)).length,
      })),
    ),
  ]);
  return apiOk(res, { community: targets.community, communityReach, seasons });
}
