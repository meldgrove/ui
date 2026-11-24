/// <reference types="node" />
/**
 * Test helpers for an app's update routes, in Node: a status as the updater
 * reports it, and a fake updater API on a free local port.
 *
 *   const updater = await startFakeUpdater({ token: "s3cret" });
 *   process.env.UPDATER_URL = updater.url;
 *   updater.respond((call) => ({ status: 202, body: updaterStatus({ installing: … }) }));
 *   …
 *   await updater.close();
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { UpdaterStatus } from "./types.ts";

/** A status as the Meldgrove Updater reports it: 0.2.0 runs, 0.2.1 is available. */
export function updaterStatus(overrides: Partial<UpdaterStatus> = {}): UpdaterStatus {
  return {
    updater: "0.2.4",
    mode: "host",
    channel: "stable",
    channelLocked: null,
    installed: "0.2.0",
    available: {
      version: "0.2.1",
      preview: false,
      publishedAt: "2026-11-17T10:00:00.000Z",
      url: "https://github.com/meldgrove/example/releases/tag/v0.2.1",
      notes: ["Show who changed a page last"],
      changes: 1,
      installsAt: "2026-11-20T02:00:00.000Z",
      failed: null,
    },
    attention: null,
    installing: null,
    last: null,
    checking: false,
    checkedAt: "2026-11-19T08:00:00.000Z",
    error: null,
    automatic: true,
    cooldown: "3d",
    window: null,
    timezone: "UTC",
    apiToken: true,
    ...overrides,
  };
}

export type FakeUpdaterReply = { status?: number; body?: unknown; delayMs?: number };
export type FakeUpdaterCall = {
  method: string;
  path: string;
  body: unknown;
  /** The Authorization header, if any. */
  authorization: string | null;
};

export type FakeUpdater = {
  /** e.g. `http://127.0.0.1:41234`. */
  url: string;
  /** Every request, in order (also the ones refused for a missing token). */
  calls: FakeUpdaterCall[];
  /** Sets the reply of each later request (default: 200 with `updaterStatus()`). */
  respond(handler: (call: FakeUpdaterCall) => FakeUpdaterReply): void;
  close(): Promise<void>;
};

/**
 * An updater API on a free local port. With `token`, it answers 401 to
 * every request without `Authorization: Bearer <token>`, as the updater
 * does with API_TOKEN set.
 */
export async function startFakeUpdater(options: { token?: string } = {}): Promise<FakeUpdater> {
  const calls: FakeUpdaterCall[] = [];
  let respond: (call: FakeUpdaterCall) => FakeUpdaterReply = () => ({ body: updaterStatus() });
  const server: Server = createServer(async (request, response) => {
    let text = "";
    for await (const chunk of request) text += chunk;
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    const call: FakeUpdaterCall = {
      method: request.method ?? "",
      path: request.url ?? "",
      body,
      authorization: request.headers.authorization ?? null,
    };
    calls.push(call);
    const reply =
      options.token && call.authorization !== `Bearer ${options.token}` && call.path !== "/healthz"
        ? { status: 401, body: { error: "This request needs the updater's API token." } }
        : respond(call);
    if (reply.delayMs) await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
    if (response.destroyed) return;
    response.writeHead(reply.status ?? 200, { "content-type": "application/json" });
    response.end(reply.body === undefined ? "" : JSON.stringify(reply.body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    respond(handler) {
      respond = handler;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
