import { test } from "node:test";
import assert from "node:assert/strict";
import { toPattern, isCrawlable, slugFor } from "../lib/route-pattern.mjs";

const base = "http://localhost:3100";

test("numeric segments become [id]", () => {
  assert.equal(toPattern("/admin/groups/42"), "/admin/groups/[id]");
  assert.equal(toPattern("/leader/sessions/7/attendance"), "/leader/sessions/[id]/attendance");
});

test("10-char public ids with a digit become [publicId]", () => {
  assert.equal(toPattern("/student/submissions/aB3dE6gH9k"), "/student/submissions/[publicId]");
});

test("a segment after seasons/season becomes [code]", () => {
  assert.equal(toPattern("/admin/seasons/spring-2026"), "/admin/seasons/[code]");
  assert.equal(toPattern("/admin/seasons/spring-2026/roster"), "/admin/seasons/[code]/roster");
});

test("static segments are kept", () => {
  assert.equal(toPattern("/student/calendar"), "/student/calendar");
  assert.equal(toPattern("/"), "/");
});

test("query strings and trailing slashes are dropped", () => {
  assert.equal(toPattern("/admin/groups/"), "/admin/groups");
});

test("only same-origin page links are crawlable", () => {
  assert.equal(isCrawlable("/student/calendar", base), true);
  assert.equal(isCrawlable("https://example.com/x", base), false);
  assert.equal(isCrawlable("/api/exports/roster.xlsx", base), false);
  assert.equal(isCrawlable("/api/auth/signout", base), false);
  assert.equal(isCrawlable("/logout", base), false);
  assert.equal(isCrawlable("mailto:a@b.c", base), false);
  assert.equal(isCrawlable("#section", base), false);
  assert.equal(isCrawlable("/uploads/x.pdf", base), false);
});

test("slugs are filesystem-safe and unique per pattern", () => {
  assert.equal(slugFor("/admin/seasons/[code]/roster"), "admin__seasons__code__roster");
  assert.equal(slugFor("/"), "root");
});
