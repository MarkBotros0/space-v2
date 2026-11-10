import { Button } from "./button";

/** What an infinite query hands the button: its `useInfiniteQuery` result fits as is. */
interface PagedQuery {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
}

/**
 * The next page of a list, shown only while there is one, disabled while it
 * loads. The label is the screen's own ("Load more", "Show more", "More
 * comments"); `loadingLabel` replaces it while fetching, else it stays.
 */
export function LoadMoreButton({
  query,
  label = "Load more",
  loadingLabel,
  size,
  className,
}: {
  query: PagedQuery;
  label?: string;
  loadingLabel?: string;
  size?: "md" | "sm";
  className?: string;
}) {
  if (!query.hasNextPage) return null;
  return (
    <Button
      variant="secondary"
      size={size}
      className={className}
      disabled={query.isFetchingNextPage}
      onPress={() => void query.fetchNextPage()}
    >
      {query.isFetchingNextPage && loadingLabel !== undefined ? loadingLabel : label}
    </Button>
  );
}
