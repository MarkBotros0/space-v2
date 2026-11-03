/** The server's message for a failed import preview or commit, read off the error body. */
export function importErrorMessage(err: unknown): string {
  const body = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
    ?.error;
  return body?.message ?? "Something went wrong. Try again.";
}
