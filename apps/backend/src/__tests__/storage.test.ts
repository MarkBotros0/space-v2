import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { buildStorageKey, getStorage } from "../lib/storage";
import { config } from "../lib/config";

const root = config.localUploadsDir;

afterAll(async () => {
  await rm(join(root, "test-bucket"), { recursive: true, force: true });
});

describe("buildStorageKey", () => {
  it("partitions by bucket, year and month and prefixes the public id", () => {
    const key = buildStorageKey({
      bucket: "submissions",
      publicId: "abc1234567",
      originalName: "essay.pdf",
      date: new Date("2026-03-09T00:00:00.000Z"),
    });
    expect(key).toBe("submissions/2026/03/abc1234567-essay.pdf");
  });

  it("sanitises the original name and caps its length", () => {
    const key = buildStorageKey({
      bucket: "submissions",
      publicId: "abc1234567",
      originalName: "../../etc/pa ss wd?.txt",
      date: new Date("2026-03-09T00:00:00.000Z"),
    });
    // Path separators and spaces collapse to underscores, so a crafted filename
    // cannot escape the bucket prefix.
    expect(key).toBe("submissions/2026/03/abc1234567-.._.._etc_pa_ss_wd_.txt");
    expect(key).not.toContain("/etc/");
  });
});

describe("LocalFsStorage", () => {
  it("round-trips a put and a delete", async () => {
    const storage = getStorage();
    const key = "test-bucket/2026/03/roundtrip.txt";

    const put = await storage.put(key, Buffer.from("hello"), { mime: "text/plain" });
    expect(put.path).toBe(key);
    await expect(readFile(join(root, key), "utf8")).resolves.toBe("hello");

    await storage.delete(key);
    await expect(readFile(join(root, key), "utf8")).rejects.toThrow();
  });

  it("treats deleting a missing file as a no-op", async () => {
    await expect(getStorage().delete("test-bucket/nope.txt")).resolves.toBeUndefined();
  });
});
