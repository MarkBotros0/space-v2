import { test } from "node:test";
import assert from "node:assert/strict";
import { assertBranchNotProduction } from "../lib/guard.mjs";

const prod = "postgresql://u:p@ep-prod-123.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require";
const branch = "postgresql://u:p@ep-branch-456.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require";

test("accepts a branch whose host differs from production", () => {
  assert.doesNotThrow(() => assertBranchNotProduction(branch, prod));
});

test("refuses when the branch host equals production's", () => {
  assert.throws(() => assertBranchNotProduction(prod, prod), /production/);
});

test("refuses the pooled form of the production host", () => {
  const pooled = prod.replace("ep-prod-123.", "ep-prod-123-pooler.");
  assert.throws(() => assertBranchNotProduction(pooled, prod), /production/);
});

test("refuses an empty or unparsable branch URL", () => {
  assert.throws(() => assertBranchNotProduction("", prod), /branch URL/);
  assert.throws(() => assertBranchNotProduction("not a url", prod), /branch URL/);
});

test("never puts either URL in the error message", () => {
  try {
    assertBranchNotProduction(prod, prod);
  } catch (err) {
    assert.ok(!err.message.includes("ep-prod-123"));
    assert.ok(!err.message.includes("u:p@"));
  }
});
