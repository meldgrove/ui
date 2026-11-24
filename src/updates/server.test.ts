// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createUpdatesHandler, type UpdatesAction, type UpdatesHandlerOptions } from "./server.ts";
import { startFakeUpdater, updaterStatus, type FakeUpdater } from "./testing.ts";
import type { UpdatesResponse } from "./types.ts";

type Ask =
  | { call: "status" | "check" }
  | { call: "install"; version: string }
  | { call: "channel"; channel: "stable" | "preview" };

/** One route through the handler, as status code and JSON body. */
async function askUpdater(options: UpdatesHandlerOptions, ask: Ask) {
  const body =
    "version" in ask ? { version: ask.version } : "channel" in ask ? { channel: ask.channel } : null;
  const request = body
    ? new Request("http://app.test/", { method: "POST", body: JSON.stringify(body) })
    : undefined;
  const response = await createUpdatesHandler(options).respond(ask.call, request);
  return { status: response.status, body: (await response.json()) as UpdatesResponse };
}

/** What a route answers to a JSON body. */
async function answerTo(action: UpdatesAction, body: string | null) {
  const request = body === null ? undefined : new Request("http://app.test/", { method: "POST", body });
  const response = await createUpdatesHandler(options).respond(action, request);
  return { status: response.status, body: (await response.json()) as unknown };
}

let updater: FakeUpdater;
let options: UpdatesHandlerOptions;
const timeout = AbortSignal.timeout.bind(AbortSignal);

/** The timeouts each call asked for; they run a hundred times faster here. */
function fastTimeouts() {
  return vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => timeout(ms / 100));
}

beforeAll(async () => {
  updater = await startFakeUpdater();
});
afterAll(() => updater.close());

beforeEach(() => {
  options = { url: `${updater.url}/`, appVersion: "0.2.0" };
  updater.calls.length = 0;
  updater.respond(() => ({ body: updaterStatus() }));
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("askUpdater", () => {
  it("passes the status on with the app's version", async () => {
    expect(await askUpdater(options, { call: "status" })).toEqual({
      status: 200,
      body: { app: { version: "0.2.0" }, reachable: true, updater: updaterStatus(), error: null },
    });
    expect(updater.calls).toEqual([{ method: "GET", path: "/v1/status", body: null, authorization: null }]);
  });

  it("sends installs and channels, and answers 202 when an installation started", async () => {
    const installing = updaterStatus({
      installing: {
        version: "0.2.1",
        startedAt: "2026-11-19T09:00:00.000Z",
        manual: true,
        stage: "requested",
      },
    });
    updater.respond(() => ({ status: 202, body: installing }));
    expect(await askUpdater(options, { call: "install", version: "0.2.1" })).toMatchObject({
      status: 202,
      body: { reachable: true, updater: installing, error: null },
    });
    updater.respond(() => ({ body: updaterStatus({ channel: "preview" }) }));
    expect((await askUpdater(options, { call: "channel", channel: "preview" })).body.updater?.channel).toBe(
      "preview",
    );
    await askUpdater(options, { call: "check" });
    expect(updater.calls.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      { method: "POST", path: "/v1/install", body: { version: "0.2.1" } },
      { method: "POST", path: "/v1/channel", body: { channel: "preview" } },
      { method: "POST", path: "/v1/check", body: null },
    ]);
  });

  it("answers a refusal with 409, the updater's message and the latest status", async () => {
    updater.respond((call) =>
      call.path === "/v1/install"
        ? { status: 409, body: { error: "0.2.1 is being installed." } }
        : { body: updaterStatus() },
    );
    expect(await askUpdater(options, { call: "install", version: "0.2.1" })).toEqual({
      status: 409,
      body: {
        app: { version: "0.2.0" },
        reachable: true,
        updater: updaterStatus(),
        error: "0.2.1 is being installed.",
      },
    });
    expect(updater.calls.map((call) => call.path)).toEqual(["/v1/install", "/v1/status"]);

    updater.respond(() => ({ status: 400, body: "not json" }));
    expect(await askUpdater(options, { call: "channel", channel: "stable" })).toMatchObject({
      status: 409,
      body: { reachable: true, updater: null, error: "The update service refused (HTTP 400)." },
    });
  });

  it("passes an error of the updater (5xx) through with the latest status, never as a refusal", async () => {
    updater.respond((call) =>
      call.path === "/v1/install"
        ? { status: 503, body: { error: "The updater is busy. Try again in a minute." } }
        : { body: updaterStatus() },
    );
    expect(await askUpdater(options, { call: "install", version: "0.2.1" })).toEqual({
      status: 503,
      body: {
        app: { version: "0.2.0" },
        reachable: true,
        updater: updaterStatus(),
        error: "The updater is busy. Try again in a minute.",
      },
    });
  });

  it("keeps a 202 whose body cannot be read, with the latest status", async () => {
    updater.respond((call) =>
      call.path === "/v1/install" ? { status: 202, body: "accepted" } : { body: updaterStatus() },
    );
    expect(await askUpdater(options, { call: "install", version: "0.2.1" })).toEqual({
      status: 202,
      body: { app: { version: "0.2.0" }, reachable: true, updater: updaterStatus(), error: null },
    });
  });

  it("keeps the status code when the answer's body breaks off", async () => {
    const broken = (status: number) => async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("connection reset"));
          },
        }),
        { status },
      );
    const ask = (status: number) =>
      askUpdater({ ...options, fetch: broken(status) }, { call: "install", version: "0.2.1" });
    expect(await ask(202)).toMatchObject({ status: 202, body: { reachable: true, error: null } });
    expect(await ask(503)).toMatchObject({
      status: 503,
      body: { error: "The update service refused (HTTP 503)." },
    });
    expect((await ask(401)).body.error).toMatch(/needs a token/);
  });

  it("refuses an answer that is not a status", async () => {
    updater.respond(() => ({ body: { mode: "everything" } }));
    expect(await askUpdater(options, { call: "status" })).toMatchObject({
      status: 409,
      body: { reachable: true, updater: null, error: expect.stringMatching(/does not understand/) },
    });
    updater.respond(() => ({ body: updaterStatus({ apiToken: "yes" as unknown as boolean }) }));
    expect((await askUpdater(options, { call: "status" })).status).toBe(409);
  });

  it("reports an updater that does not answer as not reachable", async () => {
    expect(await askUpdater({ ...options, url: "http://127.0.0.1:9" }, { call: "check" })).toEqual({
      status: 200,
      body: {
        app: { version: "0.2.0" },
        reachable: false,
        updater: null,
        error: "The update service is not reachable.",
      },
    });
  });

  it("calls nothing when UPDATER_URL is empty", async () => {
    for (const url of ["", "  ", null, undefined]) {
      expect(await askUpdater({ url, appVersion: undefined }, { call: "status" })).toEqual({
        status: 200,
        body: { app: { version: null }, reachable: false, updater: null, error: null },
      });
    }
    expect(updater.calls).toEqual([]);
  });

  it("gives up after each call's timeout", async () => {
    const timeouts = fastTimeouts();
    updater.respond((call) => (call.path === "/v1/status" ? { delayMs: 300, body: updaterStatus() } : {}));
    expect(await askUpdater(options, { call: "status" })).toEqual({
      status: 200,
      body: {
        app: { version: "0.2.0" },
        reachable: false,
        updater: null,
        error: "The update service did not answer within 3 seconds.",
      },
    });

    // A change that took too long may have happened: the latest status tells.
    updater.respond((call) => (call.path === "/v1/status" ? { body: updaterStatus() } : { delayMs: 500 }));
    expect(await askUpdater(options, { call: "install", version: "0.2.1" })).toMatchObject({
      status: 200,
      body: {
        reachable: true,
        updater: updaterStatus(),
        error: "The update service did not answer within 10 seconds.",
      },
    });
    await askUpdater(options, { call: "check" });
    await askUpdater(options, { call: "channel", channel: "preview" });
    expect(timeouts.mock.calls.map(([ms]) => ms)).toEqual([
      3_000, 10_000, 3_000, 35_000, 3_000, 35_000, 3_000,
    ]);
  });
});

describe("the token", () => {
  let guarded: FakeUpdater;
  beforeAll(async () => {
    guarded = await startFakeUpdater({ token: "updater-token-0123456789" });
  });
  afterAll(() => guarded.close());
  beforeEach(() => {
    guarded.calls.length = 0;
  });

  it("is sent as a bearer token with every call", async () => {
    const answer = await askUpdater(
      { url: guarded.url, token: "updater-token-0123456789", appVersion: "0.2.0" },
      { call: "install", version: "0.2.1" },
    );
    expect(answer.status).toBe(200);
    await askUpdater(
      { url: guarded.url, token: " updater-token-0123456789\n", appVersion: "0.2.0" },
      { call: "status" },
    );
    expect(guarded.calls.map((call) => call.authorization)).toEqual([
      "Bearer updater-token-0123456789",
      "Bearer updater-token-0123456789",
    ]);
  });

  it("is named when the updater refuses the app's token", async () => {
    expect(
      await askUpdater(
        { url: guarded.url, token: "another-token-0123456789", appVersion: "0.2.0" },
        { call: "status" },
      ),
    ).toEqual({
      status: 409,
      body: {
        app: { version: "0.2.0" },
        reachable: true,
        updater: null,
        error:
          "The update service refused the app's token. Set the same UPDATER_TOKEN for the app and the updater.",
      },
    });
  });

  it("is what the fake updater reports as apiToken by default", async () => {
    const open = await startFakeUpdater();
    try {
      expect(
        (await askUpdater({ url: open.url, appVersion: null }, { call: "status" })).body.updater?.apiToken,
      ).toBe(false);
      const guardedStatus = await askUpdater(
        { url: guarded.url, token: "updater-token-0123456789", appVersion: null },
        { call: "status" },
      );
      expect(guardedStatus.body.updater?.apiToken).toBe(true);
    } finally {
      await open.close();
    }
  });

  it("is asked for when the app has none and the updater needs one", async () => {
    for (const token of [undefined, null, ""]) {
      const answer = await askUpdater({ url: guarded.url, token, appVersion: "0.2.0" }, { call: "check" });
      expect(answer.body.error).toBe(
        "The update service needs a token. Set UPDATER_TOKEN for the app and the updater.",
      );
    }
    expect(guarded.calls.every((call) => call.authorization === null)).toBe(true);
  });
});

describe("the route bodies", () => {
  it("takes only versions and channels the contract allows", async () => {
    updater.respond(() => ({ body: updaterStatus() }));
    for (const version of ["0.2.1", "10.0.0-preview.12", "sha256:0123456789ab"]) {
      expect((await answerTo("install", JSON.stringify({ version }))).status).toBe(200);
      expect(updater.calls.at(-1)?.body).toEqual({ version });
    }
    for (const body of [
      null,
      "{}",
      '{"version":"latest"}',
      '{"version":"0.2"}',
      '{"version":"0.2.1\\n"}',
      '{"version":1}',
    ]) {
      expect(await answerTo("install", body)).toEqual({
        status: 400,
        body: { error: 'Send {"version": "X.Y.Z"} with a version the updater offers.' },
      });
    }
    expect((await answerTo("channel", '{"channel":"preview"}')).status).toBe(200);
    for (const body of [null, '{"channel":"beta"}', '{"channel":["stable"]}']) {
      expect((await answerTo("channel", body)).status).toBe(400);
    }
    expect((await answerTo("check", '{"anything":true}')).status).toBe(200);
    expect(updater.calls.map((call) => call.path)).toEqual([
      "/v1/install",
      "/v1/install",
      "/v1/install",
      "/v1/channel",
      "/v1/check",
    ]);
  });

  it("refuses a body it cannot read with 400", async () => {
    const used = new Request("http://app.test/", { method: "POST", body: '{"version":"0.2.1"}' });
    await used.text();
    const response = await createUpdatesHandler(options).respond("install", used);
    expect(response.status).toBe(400);
    expect(updater.calls).toEqual([]);
  });
});

describe("createUpdatesHandler", () => {
  const post = (body: string) =>
    new Request("http://app.test/api/admin/updates/install", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

  it("answers each route with JSON that no cache keeps", async () => {
    const updates = createUpdatesHandler(() => options);
    const response = await updates.respond("status");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await response.json()).toEqual({
      app: { version: "0.2.0" },
      reachable: true,
      updater: updaterStatus(),
      error: null,
    });

    updater.respond(() => ({ status: 202, body: updaterStatus() }));
    const { respond } = updates; // works without `this`
    expect((await respond("install", post('{"version":"0.2.1"}'))).status).toBe(202);
    expect(updater.calls.at(-1)).toMatchObject({
      method: "POST",
      path: "/v1/install",
      body: { version: "0.2.1" },
    });
  });

  it("refuses a wrong body with 400 and calls nothing", async () => {
    const updates = createUpdatesHandler(options);
    for (const body of ["", "not json", '{"version":"latest"}']) {
      const response = await updates.respond("install", post(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'Send {"version": "X.Y.Z"} with a version the updater offers.',
      });
    }
    expect((await updates.respond("install")).status).toBe(400);
    expect((await updates.respond("channel", post('{"channel":"beta"}'))).status).toBe(400);
    expect(updater.calls).toEqual([]);
  });

  it("reads the options on every request", async () => {
    let url = "";
    const updates = createUpdatesHandler(() => ({ url, appVersion: null }));
    expect(await (await updates.respond("status")).json()).toMatchObject({ reachable: false });
    url = updater.url;
    expect(await (await updates.respond("status")).json()).toMatchObject({ reachable: true });
  });
});

/** Answers captured from Updater 0.2 (against GHCR and GitHub). */
const FIXTURES = new URL("../test/fixtures/updater-0.2/", import.meta.url);
const samples = readdirSync(FIXTURES)
  .filter((name) => name.endsWith(".json"))
  .map((name) => ({ name, body: JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8")) as unknown }));

describe("the real answers of Updater 0.2", () => {
  it("has samples", () => {
    expect(samples.length).toBeGreaterThanOrEqual(7);
  });

  it.each(samples)("passes $name on with every field", async ({ name, body }) => {
    const install = name.startsWith("install-");
    updater.respond(() => ({ status: install ? 202 : 200, body }));
    const answer = await askUpdater(
      { url: updater.url, appVersion: "0.1.1" },
      install ? { call: "install", version: "0.1.3" } : { call: "status" },
    );
    expect(answer).toEqual({
      status: install ? 202 : 200,
      body: { app: { version: "0.1.1" }, reachable: true, updater: body, error: null },
    });
  });

  it("keeps fields a newer updater adds", async () => {
    updater.respond(() => ({ body: { ...updaterStatus(), backups: { last: "x" } } }));
    expect((await askUpdater(options, { call: "status" })).body.updater).toHaveProperty("backups");
  });
});
