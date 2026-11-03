export const SWEEP_PASSWORD = "sweep-password-123";

const DAY = 24 * 60 * 60 * 1000;

/** `days` from now at `hour`:00 UTC — the seed is relative to whenever it runs. */
export const fromToday = (days: number, hour = 18) => {
  const d = new Date(Date.now() + days * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};
