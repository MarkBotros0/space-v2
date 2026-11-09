import type { Response } from "express";

import express from "express";
import request from "supertest";

import { ApiError, toApiError } from "../lib/api-error";
import { apiError, apiNoContent, apiOk } from "../lib/api-response";
import { ForbiddenError, UnauthorizedError } from "../lib/auth/errors";
import { errorHandler } from "../middleware/error-handler";

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
  it("UnauthorizedError is the 401 the API answers", () => {
    const e = new UnauthorizedError();
    expect(e).toBeInstanceOf(ApiError);
    expect(e.name).toBe("UnauthorizedError");
    expect([e.code, e.message, e.status]).toEqual(["unauthorized", "Not authenticated.", 401]);
  });

  it("ForbiddenError is the 403 the API answers", () => {
    const e = new ForbiddenError();
    expect(e).toBeInstanceOf(ApiError);
    expect(e.name).toBe("ForbiddenError");
    expect([e.code, e.message, e.status]).toEqual(["forbidden", "You don't have access to this.", 403]);
  });
});

describe("ApiError helpers", () => {
  it("toApiError keeps a refusal's code and message, 404 for not_found and 409 otherwise", () => {
    const missing = toApiError({ code: "not_found", message: "Season not found." });
    expect([missing.code, missing.message, missing.status]).toEqual(["not_found", "Season not found.", 404]);
    expect(toApiError({ code: "season_finished", message: "x" }).status).toBe(409);
  });

  it("apiNoContent answers 204 with no body", () => {
    const res = { status: jest.fn(), end: jest.fn() };
    res.status.mockReturnValue(res);
    apiNoContent(res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalledWith();
  });
});

describe("errorHandler and a thrown ApiError", () => {
  function appThrowing(err: unknown) {
    const app = express();
    app.get("/boom", () => {
      throw err;
    });
    app.use(errorHandler);
    return app;
  }

  it("answers the envelope with the status and any extra fields", async () => {
    const res = await request(
      appThrowing(new ApiError("poll_votes_lost", "Votes would be lost.", 409, { votes: 3 })),
    ).get("/boom");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ votes: 3, error: { code: "poll_votes_lost", message: "Votes would be lost." } });
  });

  it("answers ForbiddenError exactly as before", async () => {
    const res = await request(appThrowing(new ForbiddenError())).get("/boom");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: "forbidden", message: "You don't have access to this." } });
  });
});
