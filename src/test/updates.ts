import type { Update, UpdaterStatus, UpdatesResponse } from "../updates/types.ts";
import type { UpdatesAnswer, UpdatesRequest, UpdatesTransport } from "../updates/transport.ts";

export const release = (version: string, extra: Partial<Update> = {}): Update => ({
  version,
  preview: false,
  publishedAt: "2026-11-18T08:00:00.000Z",
  url: `https://github.com/meldgrove/example/releases/tag/v${version}`,
  notes: ["Faster search", "Fix the sign-in loop"],
  changes: 2,
  installsAt: null,
  failed: null,
  ...extra,
});

export function status(extra: Partial<UpdaterStatus> = {}): UpdaterStatus {
  return {
    updater: "0.2.0",
    mode: "host",
    channel: "stable",
    channelLocked: null,
    installed: "0.2.0",
    available: null,
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
    ...extra,
  };
}

export function response(updater: UpdaterStatus | null, version: string | null = "0.2.0"): UpdatesResponse {
  return {
    app: { version },
    reachable: updater !== null,
    updater,
    error: updater ? null : "The update service is not reachable.",
  };
}

type Handler = (request: UpdatesRequest) => UpdatesAnswer | Promise<UpdatesAnswer>;

/** A transport whose answers the test sets per action; records every request. */
export function fakeTransport(handlers: Partial<Record<UpdatesRequest["action"], Handler>> = {}) {
  const requests: UpdatesRequest[] = [];
  const transport: UpdatesTransport & {
    requests: UpdatesRequest[];
    on: (action: UpdatesRequest["action"], handler: Handler) => void;
    count: (action: UpdatesRequest["action"]) => number;
  } = {
    requests,
    on(action, handler) {
      handlers[action] = handler;
    },
    count(action) {
      return requests.filter((request) => request.action === action).length;
    },
    async request(request) {
      requests.push(request);
      const handler = handlers[request.action];
      if (!handler) throw new Error(`No answer for ${request.action}`);
      return handler(request);
    },
  };
  return transport;
}

export const ok = (data: unknown, status = 200): UpdatesAnswer => ({ status, data });
