/**
 * v1 app/checkin/[token]/page.tsx result block: a 64px status circle, title and
 * message, centred, in the status tones. Refusals and the link's confirm step
 * use it; a successful check-in is `CheckInSuccess`.
 */
import { CheckCircle, Clock, QrCode, XCircle, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";

import { cn } from "../../design/lib/cn";
import { iconWithClassName } from "../../design/lib/icon";
import { Text } from "../../design/ui";
import { checkInCopy, type CheckInOutcome } from "../../lib/check-in-result";

iconWithClassName(CheckCircle, Clock, QrCode, XCircle);

type Tone = "success" | "error" | "neutral";

// Status tones (ok / bad / info), the same pairs StatusChip uses.
const CIRCLE: Record<Tone, string> = {
  success: "bg-ok-soft",
  error: "bg-bad-soft",
  neutral: "bg-info-soft",
};
const ICON: Record<Tone, string> = {
  success: "text-ok",
  error: "text-bad",
  neutral: "text-info",
};

/** v1's `span.inline-flex size-16 … rounded-full` + 32px icon. */
export function StatusCircle({ icon: Icon, tone }: { icon: LucideIcon; tone: Tone }) {
  return (
    <View className={cn("size-16 items-center justify-center rounded-full", CIRCLE[tone])}>
      <Icon size={32} className={ICON[tone]} />
    </View>
  );
}

/** Icon circle + h1 + muted message, v1's centred stack (`gap-4`). */
export function CheckInMessage({
  icon,
  tone,
  title,
  message,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  message?: string | null;
}) {
  return (
    <View accessibilityLiveRegion="polite" className="items-center gap-4">
      <StatusCircle icon={icon} tone={tone} />
      <Text variant="title" accessibilityRole="header" className="text-center">
        {title}
      </Text>
      {message ? (
        <Text variant="body" className="text-center text-muted-foreground">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

export function CheckInResult({ outcome }: { outcome: CheckInOutcome }) {
  const copy = checkInCopy(outcome);
  if (outcome.kind === "checked_in") {
    return (
      <CheckInMessage icon={CheckCircle} tone="success" title={copy.title} message={copy.message} />
    );
  }
  const icon = outcome.code === "already_checked_in" ? Clock : XCircle;
  return <CheckInMessage icon={icon} tone="error" title={copy.title} message={copy.message} />;
}

export { QrCode as CheckInIcon };
