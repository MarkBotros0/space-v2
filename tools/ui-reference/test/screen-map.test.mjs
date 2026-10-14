import { test } from "node:test";
import assert from "node:assert/strict";
import { v2RouteFor } from "../screen-map.mjs";

const v2 = [
  "(app)/calendar", "(app)/dashboard", "(app)/groups", "(app)/group/[id]/index", "(app)/season",
  "(app)/seasons/[code]/index", "(app)/seasons/[code]/roster/index", "(app)/students/index",
  "(app)/submission/[publicId]", "login", "forgot-password",
];

test("strips the role prefix and matches a flat route", () => {
  assert.equal(v2RouteFor("/student/calendar", v2), "(app)/calendar");
});

test("maps a plural list + id detail onto v2's singular detail route", () => {
  assert.equal(v2RouteFor("/admin/groups/[id]", v2), "(app)/group/[id]/index");
});

test("matches directory routes through their index", () => {
  assert.equal(v2RouteFor("/admin/seasons/[code]/roster", v2), "(app)/seasons/[code]/roster/index");
  assert.equal(v2RouteFor("/mentor/students", v2), "(app)/students/index");
});

test("v1's singular season/[code] maps onto v2's seasons/[code]", () => {
  assert.equal(v2RouteFor("/admin/season/[code]", v2), "(app)/seasons/[code]/index");
  assert.equal(v2RouteFor("/admin/season/[code]/roster", v2), "(app)/seasons/[code]/roster/index");
  assert.equal(v2RouteFor("/student/season", v2), "(app)/season");
});

test("role home maps to dashboard", () => {
  assert.equal(v2RouteFor("/student", v2), "(app)/dashboard");
  assert.equal(v2RouteFor("/", v2), "(app)/dashboard");
});

test("public pages match without the (app) group", () => {
  assert.equal(v2RouteFor("/login", v2), "login");
});

test("returns null when nothing matches", () => {
  assert.equal(v2RouteFor("/super/audit-log", v2), null);
});
