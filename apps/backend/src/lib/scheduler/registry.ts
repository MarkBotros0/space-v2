/** One kind of due work. `run` returns how many items it sent. */
export type ScheduledHandler = { name: string; run: (now: Date) => Promise<number> };

const handlers: ScheduledHandler[] = [];

export function registerHandler(h: ScheduledHandler): void {
  handlers.push(h);
}

export function getHandlers(): readonly ScheduledHandler[] {
  return handlers;
}

/** Empties the registry so a unit test starts clean. */
export function clearHandlersForTests(): void {
  handlers.length = 0;
}
