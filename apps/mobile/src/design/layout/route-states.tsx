/**
 * v1 app/<role>/loading.tsx and error.tsx. The skeleton is the same for every
 * role; the error differs in one phrase: students are told to contact their
 * leader, staff an admin (v1 app/leader/error.tsx, B3-1).
 */
import { AlertTriangle } from "lucide-react-native";
import { View } from "react-native";

import { useSessionStore } from "../../store/session";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Skeleton, SkeletonCard } from "../ui/skeleton";
import { Text } from "../ui/text";

export function RouteSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading" className="flex-col gap-3">
      <Skeleton className="h-32 rounded-2xl" />
      <View className="flex-row gap-3">
        <Skeleton className="h-24 flex-1 rounded-2xl" />
        <Skeleton className="h-24 flex-1 rounded-2xl" />
        <Skeleton className="h-24 flex-1 rounded-2xl" />
      </View>
      <SkeletonCard />
      <SkeletonCard />
    </View>
  );
}

export function RouteError({ onRetry }: { onRetry: () => void }) {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const contact = role === null || role === "STUDENT" ? "your leader" : "an admin";
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Something went wrong"
      description={`We couldn't load this page. Please try again — if it keeps happening, let ${contact} know.`}
      action={<Button onPress={onRetry}>Try again</Button>}
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
      <Text className="text-sm text-error-600 dark:text-error-400">{message}</Text>
      <Button variant="outline" size="sm" onPress={onRetry}>
        Try again
      </Button>
    </View>
  );
}
