import type { Router } from "express";
import { createRouters } from "../app.js";
import { createTestDb } from "./create-test-db.js";
import { createFakeQueue } from "./fake-queue.js";

interface RouteLayer {
  route?: { path: string; stack: { method?: string; handle: unknown }[] };
}

export interface MountedRoute {
  /** `METHOD /path`, with Express params (`/api/example/:id`). */
  key: string;
  /** The route's first handler: where its access rule must be. */
  firstHandler: unknown;
}

/** Every route `createApp()` mounts, read from the routers themselves. */
export async function mountedRoutes(): Promise<MountedRoute[]> {
  const routers = createRouters(await createTestDb(), createFakeQueue());
  return Object.entries(routers).flatMap(([mount, router]) => routesOf(mount, router));
}

function routesOf(mount: string, router: Router): MountedRoute[] {
  return (router.stack as RouteLayer[]).flatMap(({ route }) => {
    if (!route) return [];
    const method = route.stack.find((s) => s.method)?.method?.toUpperCase() ?? "?";
    const path = `${mount}${route.path === "/" ? "" : route.path}`;
    return [{ key: `${method} ${path}`, firstHandler: route.stack[0]?.handle }];
  });
}
