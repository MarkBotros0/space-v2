import { useQuery } from "@tanstack/react-query";
import { getYoutubeMeta } from "react-native-youtube-iframe";

import { queryKeys } from "../lib/query-keys";

/**
 * YouTube's title for a video (its oEmbed), so a video part's title can default
 * to it. Not our API: a failure only means the author types the title.
 */
export function useYoutubeTitle(videoId: string | null): string | null {
  const meta = useQuery({
    queryKey: queryKeys.youtube.meta(videoId ?? ""),
    queryFn: async () => (await getYoutubeMeta(videoId ?? "")).title,
    enabled: videoId !== null,
    staleTime: Infinity,
    retry: false,
  });
  return meta.data ?? null;
}
