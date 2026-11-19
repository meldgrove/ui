import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeTransport, ok, release, response, status } from "../test/updates.ts";
import {
  INSTALL_INTERVAL_MS,
  NORMAL_INTERVAL_MS,
  RELOAD_DELAY_MS,
  UpdatesController,
  type Notice,
} from "./controller.ts";
import { installStorage, PAGE_GRACE_MS, RECONCILE_MS, SLOW_AFTER_MS, startAttempt } from "./state.ts";
import { SignedOutError } from "./transport.ts";

const T0 = Date.parse("2026-11-19T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const storage = installStorage("test.updates");

function setup(transport: ReturnType<typeof fakeTransport>) {
  const notices: Notice[] = [];
  const reload = vi.fn();
  const controller = new UpdatesController({
    transport,
    appName: "Meldgrove Example",
    project: "example",
    storage,
    notify: (notice) => notices.push(notice),
    reload,
  });
  return { controller, notices, reload };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("UpdatesController", () => {
  it("asks for the status on start and every 5 minutes, never checking by itself", async () => {
    const transport = fakeTransport({ status: () => ok(response(status({ available: release("0.2.1") }))) });
    const { controller } = setup(transport);
    expect(controller.getSnapshot().state).toBe("loading");
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getSnapshot().state).toBe("available");
    expect(transport.count("status")).toBe(1);
    await vi.advanceTimersByTimeAsync(NORMAL_INTERVAL_MS);
    expect(transport.count("status")).toBe(2);
    expect(transport.count("check")).toBe(0);
    controller.dispose();
  });

  it("asks again on focus only when the status is a minute old", async () => {
    const transport = fakeTransport({ status: () => ok(response(status())) });
    const { controller } = setup(transport);
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.count("status")).toBe(1);
    await vi.advanceTimersByTimeAsync(61_000);
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.count("status")).toBe(2);
    controller.dispose();
  });

  it("keeps the button when the first status fails: no update service, and a click checks", async () => {
    const transport = fakeTransport({
      status: () => ok({ error: "Bad gateway" }, 502),
      check: () => ok(response(null), 200),
    });
    const { controller, notices } = setup(transport);
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getSnapshot()).toMatchObject({ state: "unreachable", panel: false });
    controller.setOpen(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.count("check")).toBe(1);
    expect(notices.at(-1)).toEqual({ kind: "error", title: "The update service is not reachable." });
    controller.dispose();
  });

  it("says what a check found: up to date, the check's error, or an offer in the popover", async () => {
    const transport = fakeTransport({ status: () => ok(response(status())) });
    const { controller, notices } = setup(transport);
    controller.start();
    await vi.advanceTimersByTimeAsync(0);

    transport.on("check", () => ok(response(status())));
    await controller.check();
    expect(notices.at(-1)).toEqual({ kind: "success", title: "Up to date · 0.2.0" });

    transport.on("check", () => ok(response(status({ error: "registry: 503" }))));
    await controller.check();
    expect(notices.at(-1)).toEqual({ kind: "error", title: "Last check failed: registry: 503" });

    transport.on("check", () => ok(response(status({ available: release("0.2.1") }))));
    await controller.check();
    expect(controller.getSnapshot()).toMatchObject({ state: "available", open: true });

    transport.on("check", () => ok({ ...response(status()), error: "A check runs." }, 409));
    await controller.check();
    expect(notices.at(-1)).toEqual({ kind: "error", title: "A check runs." });
    controller.dispose();
  });

  it("follows an accepted installation through the restart and reloads when it is done", async () => {
    let current = response(status({ available: release("0.2.1") }));
    const transport = fakeTransport({
      status: () => ok(current),
      install: () => {
        current = response(
          status({ installing: { version: "0.2.1", startedAt: iso(T0), manual: true, stage: "pulling" } }),
        );
        return ok(current, 202);
      },
    });
    const { controller, notices, reload } = setup(transport);
    controller.start();
    await vi.advanceTimersByTimeAsync(0);

    await controller.install(release("0.2.1"));
    expect(controller.getSnapshot()).toMatchObject({ state: "installing", open: true, waiting: true });
    expect(controller.getSnapshot().pending).toMatchObject({ version: "0.2.1", confirmed: true });
    expect(storage.loadPending()).toMatchObject({ version: "0.2.1" });

    // The app restarts: polls fail every 2 s.
    transport.on("status", () => {
      throw new TypeError("Failed to fetch");
    });
    await vi.advanceTimersByTimeAsync(INSTALL_INTERVAL_MS);
    expect(controller.getSnapshot()).toMatchObject({ restarting: true });

    // Back with the new version; the updater still installs (it may roll back): keep waiting.
    current = response(
      status({
        installed: "0.2.1",
        installing: { version: "0.2.1", startedAt: iso(T0), manual: true, stage: "starting" },
      }),
      "0.2.1",
    );
    transport.on("status", () => ok(current));
    await vi.advanceTimersByTimeAsync(INSTALL_INTERVAL_MS);
    expect(controller.getSnapshot()).toMatchObject({ state: "installing", restarting: false });
    expect(reload).not.toHaveBeenCalled();

    current = response(
      status({
        installed: "0.2.1",
        last: { version: "0.2.1", result: "installed", message: null, finishedAt: iso(T0 + 30_000) },
      }),
      "0.2.1",
    );
    await vi.advanceTimersByTimeAsync(INSTALL_INTERVAL_MS);
    expect(notices.at(-1)).toEqual({ kind: "success", title: "Updated to 0.2.1" });
    expect(storage.loadPending()).toBeNull();
    await vi.advanceTimersByTimeAsync(RELOAD_DELAY_MS);
    expect(reload).toHaveBeenCalledTimes(1);
    // Done once: later polls do not toast or reload again.
    await vi.advanceTimersByTimeAsync(NORMAL_INTERVAL_MS);
    expect(notices.filter((notice) => notice.title === "Updated to 0.2.1")).toHaveLength(1);
    controller.dispose();
  });

  it("shows a failed installation with its message and opens the popover", async () => {
    let current = response(status({ available: release("0.2.1") }));
    const transport = fakeTransport({ status: () => ok(current), install: () => ok(current, 202) });
    const { controller } = setup(transport);
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    await controller.install(release("0.2.1"));
    controller.setOpen(false);
    current = response(
      status({
        available: release("0.2.1", { failed: "unhealthy" }),
        last: {
          version: "0.2.1",
          result: "rolled-back",
          message: "web did not become healthy",
          finishedAt: iso(T0 + 20_000),
        },
      }),
    );
    await vi.advanceTimersByTimeAsync(INSTALL_INTERVAL_MS);
    expect(controller.getSnapshot()).toMatchObject({ state: "failed", open: true, pending: null });
    expect(controller.getSnapshot().recent).toMatchObject({ message: "web did not become healthy" });
    controller.dispose();
  });

  it("forgets a refused installation and shows why", async () => {
    const current = response(status({ available: release("0.2.1") }));
    const transport = fakeTransport({
      status: () => ok(current),
      install: () => ok({ ...current, error: "0.2.1 is not offered; check again." }, 409),
    });
    const { controller, notices } = setup(transport);
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    await controller.install(release("0.2.1"));
    expect(controller.getSnapshot().pending).toBeNull();
    expect(notices.at(-1)).toEqual({ kind: "error", title: "0.2.1 is not offered; check again." });
    controller.dispose();
  });

  it("ends an unclear attempt at its deadline: did not start when a later status answered without it", async () => {
    const current = response(status({ available: release("0.2.1") }));
    const transport = fakeTransport({
      status: () => ok(current),
      install: () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const { controller, notices } = setup(transport);
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    await controller.install(release("0.2.1"));
    expect(controller.getSnapshot().pending).toMatchObject({ confirmed: false, reason: "Failed to fetch" });
    await vi.advanceTimersByTimeAsync(RECONCILE_MS);
    expect(controller.getSnapshot().pending).toBeNull();
    expect(notices.at(-1)).toEqual({
      kind: "error",
      title: "The installation did not start",
      description: "Failed to fetch",
    });
    controller.dispose();
  });

  it("ends an unclear attempt at its deadline on its own timer, also while every poll hangs", async () => {
    const transport = fakeTransport({
      status: () => ok(response(status({ available: release("0.2.1") }))),
      install: () => ok({ error: "Bad gateway" }, 502),
    });
    const { controller, notices } = setup(transport);
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    await controller.install(release("0.2.1"));
    transport.on(
      "status",
      (request) =>
        new Promise((_, reject) =>
          request.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    );
    await vi.advanceTimersByTimeAsync(RECONCILE_MS);
    expect(controller.getSnapshot().pending).toBeNull();
    expect(notices.at(-1)).toMatchObject({ title: "The installation could not be confirmed" });
    controller.dispose();
  });

  it("gives a page restored after the deadline 10 s to ask before it ends the attempt", async () => {
    storage.savePending({
      ...startAttempt("0.2.1", undefined, T0 - 5 * 60_000),
      answeredAt: T0 - 5 * 60_000 + 1_000,
    });
    const transport = fakeTransport({
      status: () =>
        ok(
          response(
            status({
              installing: { version: "0.2.1", startedAt: iso(T0 - 290_000), manual: true, stage: "starting" },
            }),
          ),
        ),
    });
    const { controller } = setup(transport);
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    // The status reports it: confirmed, no deadline any more.
    expect(controller.getSnapshot().pending).toMatchObject({ confirmed: true });
    await vi.advanceTimersByTimeAsync(PAGE_GRACE_MS);
    expect(controller.getSnapshot().pending).not.toBeNull();
    controller.dispose();
  });

  it("stops every automatic request at 401, 403 or a sign-in page, and keeps the attempt", async () => {
    let current = response(status({ available: release("0.2.1") }));
    const transport = fakeTransport({
      status: () => ok(current),
      install: () => ok(current, 202),
    });
    const { controller } = setup(transport);
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    await controller.install(release("0.2.1"));
    transport.on("status", () => {
      throw new SignedOutError();
    });
    await vi.advanceTimersByTimeAsync(INSTALL_INTERVAL_MS);
    const polls = transport.count("status");
    expect(controller.getSnapshot()).toMatchObject({ stopped: true, waiting: false });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    window.dispatchEvent(new Event("focus"));
    expect(transport.count("status")).toBe(polls);
    expect(storage.loadPending()).toMatchObject({ version: "0.2.1" });

    // 401 on a page that follows nothing stops it as well.
    sessionStorage.clear();
    current = response(status());
    const other = fakeTransport({ status: () => ok({ error: "Sign in" }, 401) });
    const second = setup(other).controller;
    second.start();
    await vi.advanceTimersByTimeAsync(NORMAL_INTERVAL_MS * 2);
    expect(other.count("status")).toBe(1);
    controller.dispose();
    second.dispose();
  });

  it("reads a followed installation only on start, so a server render matches hydration", async () => {
    storage.savePending({ ...startAttempt("0.2.1", undefined, T0 - 1_000), confirmed: true });
    const transport = fakeTransport({ status: () => ok(response(status())) });
    const { controller } = setup(transport);
    expect(controller.getSnapshot().pending).toBeNull();
    expect(controller.getServerSnapshot().pending).toBeNull();
    controller.start();
    expect(controller.getSnapshot().pending).toMatchObject({ version: "0.2.1" });
    expect(controller.getServerSnapshot().pending).toBeNull();
    controller.dispose();
  });

  it("takes the 404 that non-admins get as the end of the session, and says so once", async () => {
    const onSignedOut = vi.fn();
    const transport = fakeTransport({ status: () => ok({ error: "Not found." }, 404) });
    const controller = new UpdatesController({
      transport,
      appName: "Meldgrove Example",
      project: "example",
      storage,
      onSignedOut,
    });
    controller.start();
    await vi.advanceTimersByTimeAsync(NORMAL_INTERVAL_MS * 2);
    expect(controller.getSnapshot().stopped).toBe(true);
    expect(transport.count("status")).toBe(1);
    expect(onSignedOut).toHaveBeenCalledTimes(1);
    expect(onSignedOut).toHaveBeenCalledWith("forbidden");
    controller.dispose();
  });

  it("tells an ended session (401) from a lost admin role", async () => {
    const onSignedOut = vi.fn();
    const transport = fakeTransport({ status: () => ok({ error: "Sign in." }, 401) });
    const controller = new UpdatesController({
      transport,
      appName: "Meldgrove Example",
      project: "example",
      storage,
      onSignedOut,
    });
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onSignedOut).toHaveBeenCalledWith("signed-out");
    controller.dispose();
  });

  it("drops a status request in flight when an installation starts, and polls at once after", async () => {
    let current = response(status({ available: release("0.2.1") }));
    const transport = fakeTransport({ status: () => ok(current), install: () => ok(current, 202) });
    const { controller } = setup(transport);
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    // The next status request hangs.
    transport.on(
      "status",
      (request) =>
        new Promise((_, reject) =>
          request.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    );
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(61_000);
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    const before = transport.count("status");
    current = response(
      status({
        installing: { version: "0.2.1", startedAt: iso(T0 + 61_000), manual: true, stage: "pulling" },
      }),
    );
    transport.on("status", () => ok(current));
    await controller.install(release("0.2.1"));
    await vi.advanceTimersByTimeAsync(INSTALL_INTERVAL_MS);
    expect(transport.count("status")).toBe(before + 1);
    expect(controller.getSnapshot().pending).toMatchObject({ confirmed: true });
    controller.dispose();
  });

  it("formats dates the way the apps' people read them", () => {
    const transport = fakeTransport();
    const english = setup(transport).controller;
    expect(english.dateLocale).toBe("en-GB");
    english.setLocale("de");
    expect(english.dateLocale).toBe("de-DE");
  });

  it("takes a date format and time zone that change while the page is open", () => {
    const { controller } = setup(fakeTransport());
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.configure({ dateLocale: "de-DE", timeZone: "Europe/Berlin" });
    expect(controller.dateLocale).toBe("de-DE");
    expect(controller.timeZone).toBe("Europe/Berlin");
    expect(listener).toHaveBeenCalledTimes(1);
    controller.configure({ dateLocale: null, timeZone: null });
    expect(controller.dateLocale).toBe("en-GB");
    expect(controller.timeZone).toBeUndefined();
  });

  it("turns slow after 15 minutes and stops waiting for that installation by its identity", async () => {
    const running = { version: "0.2.1", startedAt: iso(T0), manual: false, stage: "pulling" as const };
    const transport = fakeTransport({ status: () => ok(response(status({ installing: running }))) });
    const { controller } = setup(transport);
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    // An automatic installation is adopted.
    expect(controller.getSnapshot().pending).toMatchObject({ version: "0.2.1", confirmed: true });
    await vi.advanceTimersByTimeAsync(SLOW_AFTER_MS + 1_000);
    expect(controller.getSnapshot().slow).toBe(true);
    controller.stopWaiting();
    expect(controller.getSnapshot().pending).toBeNull();
    await vi.advanceTimersByTimeAsync(NORMAL_INTERVAL_MS);
    // Still reported, but not adopted again.
    expect(controller.getSnapshot().pending).toBeNull();
    controller.dispose();
  });

  it("saves a channel only when the update service answers with it", async () => {
    const transport = fakeTransport({
      status: () => ok(response(status())),
      channel: () => ok(response(status({ channel: "preview" }))),
    });
    const { controller } = setup(transport);
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    await expect(controller.setChannel("preview")).resolves.toBe(true);
    expect(transport.requests.at(-1)).toMatchObject({ action: "channel", body: { channel: "preview" } });
    transport.on("channel", () => ok(response(status({ channel: "stable" }))));
    await expect(controller.setChannel("preview")).resolves.toBe(false);
    transport.on("channel", () => ok({ ...response(status()), error: "Locked by the platform." }, 409));
    await expect(controller.setChannel("preview")).rejects.toThrow("Locked by the platform.");
    controller.dispose();
  });

  it("does not reload after it was disposed", async () => {
    let current = response(status({ available: release("0.2.1") }));
    const transport = fakeTransport({ status: () => ok(current), install: () => ok(current, 202) });
    const { controller, reload } = setup(transport);
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    await controller.install(release("0.2.1"));
    current = response(status({ installed: "0.2.1" }), "0.2.1");
    await vi.advanceTimersByTimeAsync(INSTALL_INTERVAL_MS);
    controller.dispose();
    await vi.advanceTimersByTimeAsync(RELOAD_DELAY_MS * 2);
    expect(reload).not.toHaveBeenCalled();
  });
});
