import type { Request, Response } from "express";
import { MulterError } from "multer";

import { errorHandler } from "../middleware/error-handler";

/**
 * The handler only ever touches res.headersSent, res.status(), and
 * res.json() (see api-response.ts) — this fake covers exactly that surface.
 * req and next are unused by the branches under test but required by
 * ErrorRequestHandler's signature.
 */
function fakeRes(): Response {
  const res = {
    headersSent: false,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

const fakeReq = {} as Request;
const noopNext = jest.fn();

describe("errorHandler — MulterError mapping", () => {
  it("maps LIMIT_FILE_SIZE to file_too_large / 400", () => {
    const res = fakeRes();
    const err = new MulterError("LIMIT_FILE_SIZE");

    errorHandler(err, fakeReq, res, noopNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "file_too_large", message: "File exceeds the upload limit." },
    });
  });

  it("maps any other MulterError code to bad_request / 400", () => {
    const res = fakeRes();
    const err = new MulterError("LIMIT_UNEXPECTED_FILE");

    errorHandler(err, fakeReq, res, noopNext);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "bad_request", message: "Invalid upload." },
    });
  });
});
