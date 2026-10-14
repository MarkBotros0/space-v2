/**
 * Neon endpoint ids look like `ep-name-123456`; the pooled hostname inserts
 * `-pooler` after the id. Comparing endpoint ids (not raw hosts) catches the
 * pooled and direct forms of the same production endpoint.
 */
function endpointId(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (!host) return null;
  return host.split(".")[0].replace(/-pooler$/, "");
}

export function assertBranchNotProduction(branchUrl, prodUrl) {
  const branch = endpointId(branchUrl);
  if (!branch) throw new Error("The branch URL is empty or not a valid postgres URL.");
  const prod = endpointId(prodUrl);
  if (!prod) throw new Error("Could not read production's DATABASE_URL to compare against.");
  if (branch === prod) {
    throw new Error("The branch URL points at the production endpoint. Refusing to start.");
  }
}
