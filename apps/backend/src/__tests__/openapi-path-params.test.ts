import { openApiDocument } from "../docs/openapi";

const doc = openApiDocument as unknown as {
  paths: Record<string, Record<string, { parameters?: Array<{ name: string; in: string }> }>>;
};

const METHODS = ["get", "put", "post", "patch", "delete"];

/**
 * Every `in: "path"` parameter an operation declares is a `{name}` in its URL,
 * and every `{name}` in the URL is declared. A parameter list copied onto the
 * wrong path (e.g. a `partId` on /events/{id}) fails here.
 */
describe("OpenAPI path parameters", () => {
  const ops = Object.entries(doc.paths).flatMap(([path, item]) =>
    METHODS.filter((m) => item[m]).map((m) => [path, m, item[m]!] as const),
  );

  it.each(ops)("%s %s declares exactly the path's parameters", (path, _method, op) => {
    const inUrl = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const declared = (op.parameters ?? [])
      .filter((p) => p.in === "path")
      .map((p) => p.name)
      .sort();
    expect(declared).toEqual(inUrl);
  });
});
