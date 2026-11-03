import type { Response } from "express";

import { apiError, apiOk } from "../lib/api-response";
import { ForbiddenError, UnauthorizedError } from "../lib/auth/errors";

function fakeRes() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

describe("apiOk / apiError", () => {
  it("wraps success in { data } and defaults to 200", () => {
    const res = fakeRes();
    apiOk(res as unknown as Response, { a: 1 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ data: { a: 1 } });
  });

  it("honours an explicit success status", () => {
    const res = fakeRes();
    apiOk(res as unknown as Response, null, 201);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("wraps failure in { error: { code, message } }", () => {
    const res = fakeRes();
    apiError(res as unknown as Response, "bad_request", "Nope", 400);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { code: "bad_request", message: "Nope" } });
  });
});

describe("auth errors", () => {
  it("UnauthorizedError has sensible defaults", () => {
    const e = new UnauthorizedError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("UnauthorizedError");
    expect(e.message).toBe("Not authenticated");
    expect(e.code).toBe("UNAUTHORIZED");
  });

  it("ForbiddenError has sensible defaults", () => {
    const e = new ForbiddenError();
    expect(e.name).toBe("ForbiddenError");
    expect(e.message).toBe("Forbidden");
    expect(e.code).toBe("FORBIDDEN");
  });

  it("both accept a custom message, code and cause", () => {
    const cause = new Error("root");
    const u = new UnauthorizedError("Expired", "TOKEN_EXPIRED", { cause });
    const f = new ForbiddenError("Staff only", "STAFF_ONLY", { cause });
    expect([u.message, u.code, u.cause]).toEqual(["Expired", "TOKEN_EXPIRED", cause]);
    expect([f.message, f.code, f.cause]).toEqual(["Staff only", "STAFF_ONLY", cause]);
  });
});
