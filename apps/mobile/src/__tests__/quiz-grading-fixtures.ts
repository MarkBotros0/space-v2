/** The exit-log fields of an attempt that was not ended by anything. */
export const NOT_ENDED = { endReason: null, endedByName: null, deadlineAt: null, events: [] };
export const waitingRow = (studentUserId: number, studentName: string, startedAt: string | null) => ({
  studentUserId,
  studentName,
  startedAt,
  endReason: null,
  endedByName: null,
  deadlineAt: null,
});
