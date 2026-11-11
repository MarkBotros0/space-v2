const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  deleteItemAsync: jest.fn(async (k: string) => void mockStore.delete(k)),
}));

import { exitEvent } from "../screens/quiz-detail/lock/exit-model";
import { claimAttempt, ExitQueue, forgetAttempt } from "../screens/quiz-detail/lock/exit-queue";

const open = { exits: 1, ended: false, status: "IN_PROGRESS" as const };
const at = "2026-11-14T10:00:00.000Z";

beforeEach(() => mockStore.clear());

describe("quiz exit queue", () => {
  it("keeps events per attempt under a key secure-store accepts", async () => {
    await new ExitQueue(900).enqueue(exitEvent("EXIT", at, at));
    expect([...mockStore.keys()]).toEqual(["quiz-exit-queue.900"]);
    expect([...mockStore.keys()].every((k) => /^[\w.-]+$/.test(k))).toBe(true);
    expect(await new ExitQueue(901).peek()).toEqual([]);
  });

  it("enqueues in order, each id once", async () => {
    const q = new ExitQueue(900);
    const a = exitEvent("EXIT", at, at);
    const b = exitEvent("SCREENSHOT", at, null);
    await Promise.all([q.enqueue(a), q.enqueue(b), q.enqueue(a)]);
    expect(await q.peek()).toEqual([a, b]);
  });

  it("drain sends what is queued and removes only the sent ids", async () => {
    const q = new ExitQueue(900);
    const a = exitEvent("EXIT", at, at);
    const late = exitEvent("SCREENSHOT", at, null);
    await q.enqueue(a);
    const send = jest.fn(async () => {
      await q.enqueue(late); // arrives while the first batch is on the wire
      return open;
    });
    expect(await q.drain(send)).toEqual(open);
    expect(send).toHaveBeenNthCalledWith(1, [a]);
    expect(send).toHaveBeenNthCalledWith(2, [late]);
    expect(await q.peek()).toEqual([]);
    expect(await q.drain(send)).toBeNull();
  });

  it("a failed send keeps the queue", async () => {
    const q = new ExitQueue(900);
    const a = exitEvent("EXIT", at, at);
    await q.enqueue(a);
    await expect(q.drain(() => Promise.reject(new Error("offline")))).rejects.toThrow("offline");
    expect(await q.peek()).toEqual([a]);
  });

  it("sends at most 20 a batch", async () => {
    const q = new ExitQueue(900);
    for (let i = 0; i < 23; i++) await q.enqueue(exitEvent("SCREENSHOT", at, null));
    const sizes: number[] = [];
    await q.drain(async (events) => {
      sizes.push(events.length);
      return open;
    });
    expect(sizes).toEqual([20, 3]);
  });

  it("left and open markers are kept and taken", async () => {
    const q = new ExitQueue(900);
    expect(await q.takeLeft()).toBeNull();
    await q.setLeft(at);
    expect(await q.takeLeft()).toBe(at);
    expect(await q.takeLeft()).toBeNull();
    expect(await q.wasOpen()).toBe(false);
    await q.markOpen();
    expect(await q.wasOpen()).toBe(true);
  });

  it("claiming another attempt clears the one before", async () => {
    const old = new ExitQueue(900);
    await claimAttempt(900);
    await old.enqueue(exitEvent("EXIT", at, at));
    await old.markOpen();
    await claimAttempt(901);
    expect(await old.peek()).toEqual([]);
    expect(await old.wasOpen()).toBe(false);
    await forgetAttempt(901);
    expect(mockStore.size).toBe(0);
  });
});
