/**
 * docs/database/erd.md is generated from schema.prisma (scripts/erd.ts). This
 * fails while it is stale: run `pnpm --filter @space/backend db:erd`.
 */
import { readFileSync } from "node:fs";

import { ERD_PATH, SCHEMA_PATH } from "../../scripts/erd";
import { renderErd } from "../../scripts/erd/render";

describe("docs/database/erd.md", () => {
  it("matches schema.prisma", () => {
    expect(readFileSync(ERD_PATH, "utf8")).toBe(renderErd(readFileSync(SCHEMA_PATH, "utf8")));
  });

  it("refuses a model that has no domain", () => {
    expect(() => renderErd("model Stray {\n  id Int @id\n}\n")).toThrow(/no domain for \[Stray\]/);
  });

  it("draws a unique FK as one-to-one and a nullable FK as optional", () => {
    const erd = renderErd(readFileSync(SCHEMA_PATH, "utf8"));
    expect(erd).toContain('Announcement ||--o| AnnouncementPoll : "announcement"');
    expect(erd).toContain('User |o--o{ AnnouncementPoll : "closedBy"');
    expect(erd).toContain('AnnouncementPollOption ||--o{ AnnouncementPollVote : "option"');
  });
});
