/**
 * v1 app/student/loading.tsx and app/student/error.tsx — the same two states
 * for every student route.
 */
import { AlertTriangle } from "lucide-react-native";
import { View } from "react-native";

import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Skeleton, SkeletonCard } from "../ui/skeleton";

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
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Something went wrong"
      description="We couldn't load this page. Please try again — if it keeps happening, let your leader know."
      action={<Button onPress={onRetry}>Try again</Button>}
    />
  );
}
