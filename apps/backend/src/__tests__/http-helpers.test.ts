import type { Response } from "express";
import { z } from "zod";

import { notFound } from "../lib/http/not-found";
import { idParam } from "../lib/http/params";
import { parseOr400 } from "../lib/http/validate";
import { pageOf } from "../lib/pagination";

function fakeRes() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

describe("idParam", () => {
  it("returns a positive integer and sends nothing", () => {
    const res = fakeRes();
    expect(idParam(res as unknown as Response, "12", "season")).toBe(12);
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "0", "-3", "1.5", "abc", ["1"]])("answers 400 for %p", (raw) => {
    const res = fakeRes();
    expect(idParam(res as unknown as Response, raw as string | undefined, "season")).toBeNull();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { code: "bad_request", message: "Invalid season id." } });
  });
});

describe("notFound", () => {
  it("answers 404 with the noun", () => {
    const res = fakeRes();
    notFound(res as unknown as Response, "Season");
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: { code: "not_found", message: "Season not found." } });
  });
});

describe("parseOr400", () => {
  const schema = z.object({ n: z.coerce.number().int(), flag: z.boolean().default(false) });

  it("returns the parsed output, defaults applied", () => {
    const res = fakeRes();
    expect(parseOr400(schema, { n: "4" }, res as unknown as Response, "Invalid body.")).toEqual({ n: 4, flag: false });
    expect(res.status).not.toHaveBeenCalled();
  });

  it("answers 400 with the caller's message", () => {
    const res = fakeRes();
    expect(parseOr400(schema, { n: "x" }, res as unknown as Response, "Invalid result body.")).toBeNull();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { code: "bad_request", message: "Invalid result body." } });
  });
});

describe("pageOf", () => {
  const rows = [{ id: 9 }, { id: 8 }, { id: 7 }];

  it("drops the extra row and points at the last one kept", () => {
    expect(pageOf(rows, 2, (r) => r.id)).toEqual({ page: [{ id: 9 }, { id: 8 }], nextCursor: 8 });
  });

  it("has no next page when nothing was over-fetched", () => {
    expect(pageOf(rows, 3, (r) => r.id)).toEqual({ page: rows, nextCursor: null });
    expect(pageOf([], 3, (r: { id: number }) => r.id)).toEqual({ page: [], nextCursor: null });
  });
});
