import type { AnnouncementListItem } from "@space/shared";

import { StatusChip } from "../../design/ui";

/** Who a post is for, in words: "Everyone", or the season's title. */
export function AudienceChip({
  audience,
  seasonTitle,
}: {
  audience: AnnouncementListItem["audience"];
  seasonTitle: string | null;
}) {
  return audience === "SEASON" ? (
    <StatusChip tone="info" label={seasonTitle ?? "Season"} />
  ) : (
    <StatusChip tone="neutral" label="Everyone" />
  );
}
