/**
 * The id a write hook was given, refused while it is still null (refactor FE-018). A screen holds
 * its write hooks before its record has loaded; a write fired then used to go to `/seasons/0/...`.
 */
export function loadedId(id: number | null): number {
  if (id === null) throw new Error("This record hasn't loaded yet.");
  return id;
}
