import { useEffect, useRef, useState } from "react";

/**
 * A search box that commits `q` 300ms after typing stops, or at once on
 * `commit` (keyboard search), which cancels the pending timer so the list
 * issues one request. The timer is cleared on unmount.
 */
export function useDebouncedSearch(delayMs = 300) {
  const [search, setSearchState] = useState("");
  const [q, setQ] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const setSearch = (text: string) => {
    setSearchState(text);
    clear();
    timer.current = setTimeout(() => {
      timer.current = null;
      setQ(text.trim());
    }, delayMs);
  };
  const commit = () => {
    clear();
    setQ(search.trim());
  };
  return { search, q, setSearch, commit };
}
