import { openApiDocument } from "../docs/openapi";

const doc = openApiDocument as unknown as {
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, unknown>; responses: Record<string, unknown> };
};

const BASE = "/api/v1/announcements";
const announcementPaths = Object.entries(doc.paths).filter(([p]) => p.startsWith(BASE));

function collectRefs(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => collectRefs(n, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref" && typeof v === "string") out.push(v);
      else collectRefs(v, out);
    }
  }
  return out;
}

describe("OpenAPI: announcements", () => {
  it("documents every route", () => {
    expect(Object.keys(doc.paths[`${BASE}/{id}`] ?? {}).sort()).toEqual(["delete", "get", "patch"]);
    expect(Object.keys(doc.paths[BASE] ?? {}).sort()).toEqual(["get", "post"]);
    expect(doc.paths[`${BASE}/unread`]?.get).toBeDefined();
    expect(doc.paths[`${BASE}/targets`]?.get).toBeDefined();
    expect(doc.paths[`${BASE}/{id}/read`]?.post).toBeDefined();
  });

  it("resolves every $ref under the announcement paths", () => {
    const refs = collectRefs(announcementPaths);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      const m = /^#\/components\/(schemas|responses)\/(.+)$/.exec(ref);
      expect(m).not.toBeNull();
      const group = doc.components[m![1] as "schemas" | "responses"];
      expect(group[m![2]!]).toBeDefined();
    }
  });
});
