/**
 * Port of v1 src/components/seasons/season-status-badge.tsx. Placed as a v1
 * block (a card's only child) it needs `self-start`; inside a row it does not.
 */
import type { SeasonStatus } from "@space/shared";

import { Badge } from "../ui/badge";

const VARIANT: Record<SeasonStatus, "success" | "info" | "default" | "warning"> = {
  DRAFT: "default",
  ACTIVE: "success",
  COMPLETED: "info",
  ARCHIVED: "warning",
};

const LABEL: Record<SeasonStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export function SeasonStatusBadge({
  status,
  className,
}: {
  status: SeasonStatus;
  className?: string;
}) {
  return (
    <Badge variant={VARIANT[status]} className={className}>
      {LABEL[status]}
    </Badge>
  );
}
