import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeBackup } from "../lib/password-backup.mjs";

test("keeps every saved original and adds users not yet saved", () => {
  const saved = [{ email: "a@x", passwordHash: "orig-a" }];
  const fetched = [
    { email: "a@x", passwordHash: "test-hash" }, // already swapped: must not replace the original
    { email: "b@x", passwordHash: "orig-b" },
  ];
  assert.deepEqual(mergeBackup(saved, fetched), [
    { email: "a@x", passwordHash: "orig-a" },
    { email: "b@x", passwordHash: "orig-b" },
  ]);
});

test("starts from nothing on the first run", () => {
  assert.deepEqual(mergeBackup([], [{ email: "a@x", passwordHash: "h" }]), [{ email: "a@x", passwordHash: "h" }]);
});
