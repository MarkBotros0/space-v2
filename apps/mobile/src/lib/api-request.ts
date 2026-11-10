import type { AxiosRequestConfig } from "axios";
import type { ZodType } from "zod";

import { apiClient } from "./api-client";

/**
 * One request, its `{ data }` envelope parsed with a shared schema, so a
 * backend drift fails here rather than in a screen. Calls `apiClient`'s own
 * method with the same arguments a hook would, so tests that stub
 * `apiClient.get` / `.post` keep working.
 */
export async function apiGet<T>(url: string, schema: ZodType<T>, config?: AxiosRequestConfig): Promise<T> {
  const res = config === undefined ? await apiClient.get(url) : await apiClient.get(url, config);
  return schema.parse(res.data.data);
}

type ApiSendMethod = "post" | "put" | "patch" | "delete";

/** A write and its parsed `{ data }`. A `delete` body goes in the request config, as axios takes it. */
export async function apiSend<T>(method: ApiSendMethod, url: string, body: unknown, schema: ZodType<T>): Promise<T> {
  const res = await send(method, url, body);
  return schema.parse(res.data.data);
}

function send(method: ApiSendMethod, url: string, body: unknown) {
  if (method === "delete") return body === undefined ? apiClient.delete(url) : apiClient.delete(url, { data: body });
  return body === undefined ? apiClient[method](url) : apiClient[method](url, body);
}
