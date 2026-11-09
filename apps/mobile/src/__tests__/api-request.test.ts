import { z } from "zod";

import { apiClient } from "../lib/api-client";
import { apiGet, apiSend } from "../lib/api-request";

jest.mock("../lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

const schema = z.object({ id: z.number() });
const ok = { data: { data: { id: 7 } } };

beforeEach(() => jest.clearAllMocks());

describe("apiGet", () => {
  it("parses the envelope's data", async () => {
    (apiClient.get as jest.Mock).mockResolvedValue(ok);
    await expect(apiGet("/api/v1/x", schema)).resolves.toEqual({ id: 7 });
    expect(apiClient.get).toHaveBeenCalledWith("/api/v1/x");
  });

  it("passes the config through and fails on a drifted shape", async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { data: { id: "7" } } });
    await expect(apiGet("/api/v1/x", schema, { params: { q: 1 } })).rejects.toThrow();
    expect(apiClient.get).toHaveBeenCalledWith("/api/v1/x", { params: { q: 1 } });
  });
});

describe("apiSend", () => {
  it("sends the body with the named method", async () => {
    (apiClient.patch as jest.Mock).mockResolvedValue(ok);
    await expect(apiSend("patch", "/api/v1/x", { a: 1 }, schema)).resolves.toEqual({ id: 7 });
    expect(apiClient.patch).toHaveBeenCalledWith("/api/v1/x", { a: 1 });
  });

  it("sends no body argument when there is none, and a delete body as config data", async () => {
    (apiClient.post as jest.Mock).mockResolvedValue(ok);
    (apiClient.delete as jest.Mock).mockResolvedValue(ok);
    await apiSend("post", "/api/v1/x", undefined, schema);
    expect(apiClient.post).toHaveBeenCalledWith("/api/v1/x");
    await apiSend("delete", "/api/v1/x", { reason: "r" }, schema);
    expect(apiClient.delete).toHaveBeenCalledWith("/api/v1/x", { data: { reason: "r" } });
  });
});
