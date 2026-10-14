/**
 * Saved original password hashes for the reference users. A user already in
 * the backup keeps their first-saved hash (a later read would return the test
 * hash); users new since the last run are added, so a changed users.json
 * cannot leave anyone's original unsaved.
 */
export function mergeBackup(saved, fetched) {
  const known = new Set(saved.map((r) => r.email));
  return [...saved, ...fetched.filter((r) => !known.has(r.email))];
}
