import { Avatar, AvatarFallback } from "../../design/ui";
import { initialsOf } from "../../lib/initials";

export const NOTICE = {
  error: "rounded-control bg-bad-soft px-3 py-2 text-sm text-bad",
  success: "rounded-control bg-ok-soft px-3 py-2 text-sm text-ok",
};

/** v1 forum-view.tsx PersonAvatar: initials only (no avatar URL in the contract). */
export function PersonAvatar({ name }: { name: string }) {
  return (
    <Avatar className="size-9">
      <AvatarFallback>{initialsOf(name, "?")}</AvatarFallback>
    </Avatar>
  );
}
