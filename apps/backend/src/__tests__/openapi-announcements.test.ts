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

  it("documents the poll routes and shapes", () => {
    expect(doc.paths[`${BASE}/{id}/poll/vote`]?.put).toBeDefined();
    expect(doc.paths[`${BASE}/{id}/poll/close`]?.post).toBeDefined();
    expect(doc.paths[`${BASE}/{id}/poll/reopen`]?.post).toBeDefined();
    expect(doc.paths[`${BASE}/{id}/poll/voters`]?.get).toBeDefined();
    const detail = doc.components.schemas.AnnouncementDetail as { properties: Record<string, unknown> };
    expect(JSON.stringify(detail.properties.poll)).toContain("#/components/schemas/AnnouncementPoll");
    expect(doc.components.schemas.AnnouncementPoll).toBeDefined();
    const patch = JSON.stringify(doc.paths[`${BASE}/{id}`]?.patch);
    expect(patch).toContain("poll_votes_lost");
    expect(JSON.stringify(doc.components.schemas.UpdateAnnouncementRequest)).toContain("confirmVoteLoss");
    expect(JSON.stringify(doc.components.schemas.AnnouncementListItem)).toContain("hasPoll");
  });

  it("resolves every $ref under the announcement paths", () => {
    const announcementSchemas = Object.entries(doc.components.schemas).filter(([k]) => /Announcement/.test(k));
    const refs = collectRefs([announcementPaths, announcementSchemas]);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      const m = /^#\/components\/(schemas|responses)\/(.+)$/.exec(ref);
      expect(m).not.toBeNull();
      const group = doc.components[m![1] as "schemas" | "responses"];
      expect(group[m![2]!]).toBeDefined();
    }
  });
});
