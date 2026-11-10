import express from "express";
import request from "supertest";

import { config } from "../lib/config";
import * as scheduler from "../lib/scheduler";
import { clearHandlersForTests, maybeRunScheduler, registerHandler, runDueWork } from "../lib/scheduler";
import { claimLease, releaseLease } from "../lib/scheduler/lease";
import { resetTickForTests, schedulerTick } from "../lib/scheduler/middleware";

jest.mock("../lib/scheduler/lease");
jest.mock("../lib/sentry", () => ({ reportError: jest.fn() }));
jest.mock("@vercel/functions", () => ({ waitUntil: jest.fn() }));

const mockClaimLease = jest.mocked(claimLease);
const mockReleaseLease = jest.mocked(releaseLease);
const mutableConfig = config as { schedulerTick: boolean };

beforeEach(() => {
  clearHandlersForTests();
  resetTickForTests();
  jest.clearAllMocks();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("scheduler runner", () => {
  it("runs every handler and reports a failing one without stopping the others", async () => {
    registerHandler({
      name: "a",
      run: async () => {
        throw new Error("boom");
      },
    });
    registerHandler({ name: "b", run: async () => 2 });
    await expect(runDueWork(new Date("2026-11-12T07:00:00Z"))).resolves.toEqual({ a: "failed", b: 2 });
  });

  it("does nothing and says busy when the lease is held", async () => {
    mockClaimLease.mockResolvedValue(false);
    const run = jest.fn().mockResolvedValue(1);
    registerHandler({ name: "a", run });
    await expect(maybeRunScheduler()).resolves.toBe("busy");
    expect(run).not.toHaveBeenCalled();
    expect(mockReleaseLease).not.toHaveBeenCalled();
  });

  it("releases the lease even when a handler throws", async () => {
    mockClaimLease.mockResolvedValue(true);
    registerHandler({
      name: "a",
      run: async () => {
        throw new Error("boom");
      },
    });
    await expect(maybeRunScheduler()).resolves.toBe("ran");
    expect(mockReleaseLease).toHaveBeenCalledTimes(1);
  });
});

describe("scheduler tick", () => {
  const app = () => {
    const a = express();
    a.use(schedulerTick());
    a.get("/x", (_req, res) => {
      res.status(200).json({ ok: true });
    });
    return a;
  };

  afterEach(() => {
    mutableConfig.schedulerTick = false;
  });

  it("never delays the response and throttles per instance", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "setTimeout"] });
    jest.setSystemTime(new Date("2026-11-12T07:00:00Z"));
    mutableConfig.schedulerTick = true;
    const spy = jest.spyOn(scheduler, "maybeRunScheduler").mockReturnValue(new Promise(() => {}));
    const server = app();

    await request(server).get("/x").expect(200);
    jest.advanceTimersByTime(1_000);
    await request(server).get("/x").expect(200);
    expect(spy).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(61_000);
    await request(server).get("/x").expect(200);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("does nothing when SCHEDULER_TICK is off", async () => {
    mutableConfig.schedulerTick = false;
    const spy = jest.spyOn(scheduler, "maybeRunScheduler").mockReturnValue(new Promise(() => {}));
    await request(app()).get("/x").expect(200);
    expect(spy).not.toHaveBeenCalled();
  });
});
