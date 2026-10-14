/**
 * v1 app/checkin/[token]/page.tsx result block: a 64px status circle, h1 and
 * message, centred. Also used inside the session screen's check-in modal.
 */
import { CheckCircle, Clock, QrCode, XCircle, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";

import { cn } from "../../design/lib/cn";
import { iconWithClassName } from "../../design/lib/icon";
import { Text } from "../../design/ui";
import { checkInCopy, type CheckInOutcome } from "../../lib/check-in-result";

iconWithClassName(CheckCircle, Clock, QrCode, XCircle);

type Tone = "success" | "error" | "neutral";

const CIRCLE: Record<Tone, string> = {
  success: "bg-success-100 dark:bg-success-900",
  error: "bg-error-100 dark:bg-error-900",
  neutral: "bg-brand-teal-100 dark:bg-brand-teal-950",
};
const ICON: Record<Tone, string> = {
  success: "text-success-700 dark:text-success-200",
  error: "text-error-700 dark:text-error-200",
  neutral: "text-brand-teal-700 dark:text-brand-teal-300",
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
      <Text accessibilityRole="header" className="text-center text-2xl font-semibold text-foreground">
        {title}
      </Text>
      {message ? <Text className="text-center text-muted-foreground">{message}</Text> : null}
    </View>
  );
}

export function CheckInResult({ outcome }: { outcome: CheckInOutcome }) {
  const copy = checkInCopy(outcome);
  if (outcome.kind === "checked_in") {
    return <CheckInMessage icon={CheckCircle} tone="success" title={copy.title} message={copy.message} />;
  }
  const icon = outcome.code === "already_checked_in" ? Clock : XCircle;
  return <CheckInMessage icon={icon} tone="error" title={copy.title} message={copy.message} />;
}

export { QrCode as CheckInIcon };
