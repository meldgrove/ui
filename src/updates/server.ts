/**
 * The app's side of the updater contract, for the app's server: the four
 * admin routes (status, `check`, `install`, `channel`) that the update button
 * calls, as one handler. It asks the Meldgrove Updater (the `updater` service
 * of the app's compose.yaml) and answers with `UpdatesResponse`.
 *
 * Only `fetch`, `Request` and `Response`: it runs in Node 22 or later, Hono
 * and Next.js route handlers alike, without React. The app checks the admin
 * session and its CSRF protection first; everyone else must get the app's
 * usual 404 (or 403) before this runs.
 *
 *   const updates = createUpdatesHandler(() => ({
 *     url: config().UPDATER_URL,
 *     token: config().UPDATER_TOKEN,
 *     appVersion: config().APP_VERSION ?? null,
 *   }));
 *   router.get("/admin/updates", (c) => { requireAdmin(c); return updates.respond("status", c.req.raw); });
 *   router.post("/admin/updates/install", (c) => { requireAdmin(c); return updates.respond("install", c.req.raw); });
 */
import type { UpdatesAction } from "./transport.ts";
import {
  UPDATE_CHANNELS,
  UPDATE_VERSION_PATTERN,
  parseUpdaterStatus,
  type UpdateChannel,
  type UpdaterStatus,
  type UpdatesResponse,
} from "./types.ts";

export type { UpdatesAction } from "./transport.ts";

/** The updater's API calls behind each action, and how long each may take. */
export const UPDATER_CALLS = {
  status: { method: "GET", path: "/v1/status", timeoutMs: 3_000 },
  check: { method: "POST", path: "/v1/check", timeoutMs: 35_000 },
  install: { method: "POST", path: "/v1/install", timeoutMs: 10_000 },
  channel: { method: "POST", path: "/v1/channel", timeoutMs: 35_000 },
} as const satisfies Record<UpdatesAction, { method: string; path: string; timeoutMs: number }>;

export type UpdaterRequest =
  | { call: "status" }
  | { call: "check" }
  | { call: "install"; version: string }
  | { call: "channel"; channel: UpdateChannel };

/**
 * What a route answers: 200 (202 when an installation started), 409 when
 * the updater refused (4xx), or the updater's own 5xx (it may have started).
 */
export type UpdatesAnswer = { status: number; body: UpdatesResponse };

/** Where problems go: a pino logger fits, and so does `console`. */
export type UpdatesLogger = {
  debug?: (details: Record<string, unknown>, message: string) => void;
  warn: (details: Record<string, unknown>, message: string) => void;
};

export type UpdatesHandlerOptions = {
  /** UPDATER_URL, e.g. `http://updater:8080`. Empty or missing: no updater (`reachable: false`, no call). */
  url: string | null | undefined;
  /** UPDATER_TOKEN: sent as `Authorization: Bearer <token>`; the updater's API_TOKEN must match. */
  token?: string | null;
  /** APP_VERSION of the running app; null for development and images built from source. */
  appVersion: string | null | undefined;
  logger?: UpdatesLogger;
  /** For tests. */
  fetch?: typeof fetch;
};

type Outcome =
  /** `status` is null only for a 202 whose body cannot be read: the updater took it all the same. */
  | { kind: "status"; accepted: boolean; status: UpdaterStatus | null }
  | { kind: "refused"; httpStatus: number; error: string }
  | { kind: "unreachable"; error: string; timedOut: boolean };

const MAX_ERROR_LENGTH = 1000;
const MAX_BODY_LENGTH = 4096;
const NO_STORE = { "cache-control": "no-store" };

async function send(options: UpdatesHandlerOptions, base: string, request: UpdaterRequest): Promise<Outcome> {
  const { method, path, timeoutMs } = UPDATER_CALLS[request.call];
  const body =
    request.call === "install"
      ? { version: request.version }
      : request.call === "channel"
        ? { channel: request.channel }
        : undefined;
  const token = options.token?.trim();
  let response: Response;
  let data: unknown;
  try {
    response = await (options.fetch ?? fetch)(`${base.replace(/\/+$/, "")}${path}`, {
      method,
      headers: {
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
  } catch (error) {
    const timedOut = (error as { name?: unknown } | null)?.name === "TimeoutError";
    options.logger?.debug?.({ call: request.call, timedOut }, "update service not reached");
    return {
      kind: "unreachable",
      timedOut,
      error: timedOut
        ? `The update service did not answer within ${timeoutMs / 1000} seconds.`
        : "The update service is not reachable.",
    };
  }
  if (!response.ok) {
    const message = (data as { error?: unknown } | null)?.error;
    options.logger?.warn({ call: request.call, status: response.status }, "update service refused");
    return {
      kind: "refused",
      httpStatus: response.status,
      error:
        response.status === 401
          ? token
            ? "The update service refused the app's token. Set the same UPDATER_TOKEN for the app and the updater."
            : "The update service needs a token. Set UPDATER_TOKEN for the app and the updater."
          : typeof message === "string" && message.trim()
            ? message.trim().slice(0, MAX_ERROR_LENGTH)
            : `The update service refused (HTTP ${response.status}).`,
    };
  }
  const status = parseUpdaterStatus(data);
  if (!status) {
    options.logger?.warn(
      { call: request.call, status: response.status },
      "update service sent an unknown answer",
    );
    if (response.status === 202) return { kind: "status", accepted: true, status: null };
    return {
      kind: "refused",
      httpStatus: 409,
      error: "The update service sent an answer this version does not understand.",
    };
  }
  return { kind: "status", accepted: response.status === 202, status };
}

/**
 * Asks the updater and answers as every update route does: a refusal is a
 * 409 with `error` and the latest status, an error of the updater keeps its
 * 5xx (with the latest status), an updater that does not answer is
 * `reachable: false` (200). After a change that took too long, the latest
 * status shows whether it happened anyway; a 202 whose body cannot be read
 * stays a 202.
 */
export async function askUpdater(
  options: UpdatesHandlerOptions,
  request: UpdaterRequest,
): Promise<UpdatesAnswer> {
  const app = { version: options.appVersion ?? null };
  const base = options.url?.trim();
  if (!base) return { status: 200, body: { app, reachable: false, updater: null, error: null } };

  const outcome = await send(options, base, request);
  if (outcome.kind === "status" && outcome.status) {
    return {
      status: outcome.accepted ? 202 : 200,
      body: { app, reachable: true, updater: outcome.status, error: null },
    };
  }
  const followUp = request.call !== "status" && (outcome.kind !== "unreachable" || outcome.timedOut);
  if (outcome.kind === "unreachable" && !followUp) {
    return { status: 200, body: { app, reachable: false, updater: null, error: outcome.error } };
  }
  const latest = followUp ? await send(options, base, { call: "status" }) : null;
  const updater = latest?.kind === "status" ? latest.status : null;
  if (outcome.kind === "status") {
    return { status: 202, body: { app, reachable: true, updater, error: null } };
  }
  if (outcome.kind === "refused") {
    const status = outcome.httpStatus >= 500 && outcome.httpStatus <= 599 ? outcome.httpStatus : 409;
    return { status, body: { app, reachable: true, updater, error: outcome.error } };
  }
  return { status: 200, body: { app, reachable: updater !== null, updater, error: outcome.error } };
}

/** The request an action asks for, from the route's JSON body; a sentence for the admin when it is wrong. */
export function updaterRequest(
  action: UpdatesAction,
  body: unknown,
): { request: UpdaterRequest } | { error: string } {
  if (action === "status" || action === "check") return { request: { call: action } };
  const value = (body as Record<string, unknown> | null)?.[action === "install" ? "version" : "channel"];
  if (action === "install") {
    return typeof value === "string" && UPDATE_VERSION_PATTERN.test(value)
      ? { request: { call: "install", version: value } }
      : { error: 'Send {"version": "X.Y.Z"} with a version the updater offers.' };
  }
  return typeof value === "string" && (UPDATE_CHANNELS as readonly string[]).includes(value)
    ? { request: { call: "channel", channel: value as UpdateChannel } }
    : { error: 'Send {"channel": "stable"} or {"channel": "preview"}.' };
}

async function readJson(request: Request | undefined): Promise<unknown> {
  if (!request?.body) return null;
  const text = await request.text();
  if (!text || text.length > MAX_BODY_LENGTH) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The four update routes as one handler. `options` is read on every request
 * (pass a function to follow the app's configuration, e.g. in tests).
 */
export function createUpdatesHandler(options: UpdatesHandlerOptions | (() => UpdatesHandlerOptions)) {
  const current = () => (typeof options === "function" ? options() : options);

  /** The answer as data, for apps that build the response themselves; 400 for a wrong body. */
  const answer = async (
    action: UpdatesAction,
    body?: unknown,
  ): Promise<UpdatesAnswer | { status: 400; body: { error: string } }> => {
    const parsed = updaterRequest(action, body);
    if ("error" in parsed) return { status: 400, body: { error: parsed.error } };
    return askUpdater(current(), parsed.request);
  };

  /**
   * The route's `Response` (never cached). `request` carries the JSON body of
   * `install` and `channel`; `status` and `check` need none.
   */
  const respond = async (action: UpdatesAction, request?: Request): Promise<Response> => {
    const body = action === "install" || action === "channel" ? await readJson(request) : null;
    const result = await answer(action, body);
    return Response.json(result.body, { status: result.status, headers: NO_STORE });
  };

  return { answer, respond };
}

export type UpdatesHandler = ReturnType<typeof createUpdatesHandler>;
