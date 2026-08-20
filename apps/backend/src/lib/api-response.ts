import type { Response } from "express";

export function apiOk<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ data });
}

export function apiError(res: Response, code: string, message: string, status: number): Response {
  return res.status(status).json({ error: { code, message } });
}
