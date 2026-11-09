/**
 * Characterization test for the refactor (docs/refactor-plan.md, Wave 0).
 *
 * Pins every route the app registers — method, full path and registration
 * order — so a refactor that drops, renames, re-mounts or reorders a route
 * fails here. Order matters: Express matches the first registered route, so
 * `/:id/foo` must stay ahead of `/:id`.
 *
 * A deliberate route change updates the snapshot in the same commit
 * (`pnpm --filter @space/backend test:unit -- -u route-inventory`).
 */
import type { Express } from "express";

type Layer = {
  route?: { path: string; methods: Record<string, boolean> };
  handle: unknown;
  __mountPath?: string;
};
type RouterLike = { stack: Layer[] };

const MOUNT_PATH = "__mountPath";

function patchRouterUse(): void {
  const routerPath = require.resolve("router", { paths: [require.resolve("express")] });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Router = require(routerPath) as { prototype: Record<string, unknown> };
  const originalUse = Router.prototype.use as (this: RouterLike, ...args: unknown[]) => unknown;
  Router.prototype.use = function patchedUse(this: RouterLike, ...args: unknown[]) {
    const before = this.stack.length;
    const result = originalUse.apply(this, args);
    const first = args[0];
    const path = typeof first === "string" ? first : "/";
    for (const layer of this.stack.slice(before)) layer[MOUNT_PATH] = path;
    return result;
  };
}

function isRouter(handle: unknown): handle is RouterLike {
  return typeof handle === "function" && Array.isArray((handle as Partial<RouterLike>).stack);
}

function join(prefix: string, path: string): string {
  const joined = `${prefix}/${path}`.replace(/\/+/g, "/");
  return joined.length > 1 ? joined.replace(/\/$/, "") : joined;
}

function listRoutes(router: RouterLike, prefix = ""): string[] {
  const out: string[] = [];
  for (const layer of router.stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods)
        .filter((m) => layer.route!.methods[m])
        .map((m) => m.toUpperCase())
        .sort();
      out.push(`${methods.join(",")} ${join(prefix, layer.route.path)}`);
    } else if (isRouter(layer.handle)) {
      out.push(...listRoutes(layer.handle, join(prefix, layer[MOUNT_PATH] ?? "/")));
    }
  }
  return out;
}

describe("route inventory", () => {
  it("registers exactly these routes, in this order", () => {
    let app: Express | undefined;
    jest.isolateModules(() => {
      patchRouterUse();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createApp } = require("../app") as typeof import("../app");
      app = createApp();
    });
    const routes = listRoutes((app as unknown as { router: RouterLike }).router);

    expect(routes.length).toBeGreaterThan(100);
    expect(routes).toMatchSnapshot();
  });
});
