/**
 * v1 app/<role>/loading.tsx and error.tsx. The skeleton is the same for every
 * role; the error differs in one phrase: students are told to contact their
 * leader, staff an admin (v1 app/leader/error.tsx, B3-1).
 */
import { AlertTriangle } from "lucide-react-native";
import { View } from "react-native";

import { useRole } from "../../store/session";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Skeleton, SkeletonCard } from "../ui/skeleton";
import { Text } from "../ui/text";

export function RouteSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading" className="flex-col gap-3">
      <Skeleton height={128} radius={16} />
      <View className="flex-row gap-3">
        <Skeleton height={96} radius={16} className="flex-1" />
        <Skeleton height={96} radius={16} className="flex-1" />
        <Skeleton height={96} radius={16} className="flex-1" />
      </View>
      <SkeletonCard />
      <SkeletonCard />
    </View>
  );
}

export function RouteError({ onRetry }: { onRetry: () => void }) {
  const role = useRole();
  const contact = role === null || role === "STUDENT" ? "your leader" : "an admin";
  return (
    <EmptyState
      icon={AlertTriangle}
      tone="bad"
      title="Something went wrong"
      description={`We couldn't load this page. Please try again — if it keeps happening, let ${contact} know.`}
      action={{ label: "Try again", onPress: onRetry }}
    />
  );
}

/**
 * A card or section whose own query failed: the red line and an outline
 * "Try again" (v1's inline error). `className` is appended to the wrapper.
 */
export function InlineError({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <View className={className ? `flex-col items-start gap-2 ${className}` : "flex-col items-start gap-2"}>
      <Text variant="subhead" className="text-bad">
        {message}
      </Text>
      <Button variant="secondary" size="sm" onPress={onRetry}>
        Try again
      </Button>
    </View>
  );
}
