import { describe, expect, it } from "vitest";
import type { Update, UpdatesResponse, UpdaterStatus } from "./types.ts";
import {
  PAGE_GRACE_MS,
  RECONCILE_MS,
  SLOW_AFTER_MS,
  STATUS_TIMEOUT_MS,
  answerInstall,
  buttonState,
  canInstall,
  cooldownParts,
  failureOf,
  followStatus,
  hasPanel,
  ignoreInstall,
  installOutcome,
  noteOutage,
  noteSummary,
  panelState,
  reconcileDeadline,
  replacedFailure,
  staleVersion,
  startAttempt,
  statusTimeout,
  unconfirmedEnd,
  windowParts,
  type PendingInstall,
} from "./state.ts";

const release = (version: string, extra: Partial<Update> = {}): Update => ({
  version,
  preview: false,
  publishedAt: "2026-11-18T08:00:00.000Z",
  url: null,
  notes: [],
  changes: 0,
  installsAt: null,
  failed: null,
  ...extra,
});

function status(extra: Partial<UpdaterStatus> = {}): UpdaterStatus {
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
    checkedAt: null,
    error: null,
    automatic: true,
    cooldown: "3d",
    window: null,
    timezone: "UTC",
    ...extra,
  };
}

function response(updater: UpdaterStatus | null, version: string | null = "0.2.0"): UpdatesResponse {
  return {
    app: { version },
    reachable: updater !== null,
    updater,
    error: updater ? null : "The update service is not reachable.",
  };
}

const idle = { checking: false, pending: null };

describe("buttonState", () => {
  it("derives every state of the table from a status", () => {
    expect(buttonState(undefined, idle)).toBe("loading");
    expect(buttonState(response(null), idle)).toBe("unreachable");
    expect(buttonState(response(status()), idle)).toBe("current");
    expect(buttonState(response(status({ checking: true })), idle)).toBe("checking");
    expect(buttonState(response(status()), { ...idle, checking: true })).toBe("checking");
    expect(buttonState(response(status({ available: release("0.2.1") })), idle)).toBe("available");
    expect(buttonState(response(status({ attention: release("0.3.0") })), idle)).toBe("attention");
    expect(
      buttonState(response(status({ available: release("0.2.1"), attention: release("0.3.0") })), idle),
    ).toBe("available");
    expect(
      buttonState(
        response(
          status({
            installing: {
              version: "0.2.1",
              startedAt: "2026-11-19T08:00:00Z",
              manual: false,
              stage: "pulling",
            },
          }),
        ),
        idle,
      ),
    ).toBe("installing");
    // Mode off still shows what is new; "off" only when nothing is.
    expect(buttonState(response(status({ mode: "off", available: release("0.2.1") })), idle)).toBe(
      "available",
    );
    expect(buttonState(response(status({ mode: "off", attention: release("0.3.0") })), idle)).toBe(
      "attention",
    );
    expect(buttonState(response(status({ mode: "off" })), idle)).toBe("off");
  });

  it("shows a failure only while the latest result failed and the update is marked", () => {
    const last = { version: "0.2.1", message: "unhealthy", finishedAt: "2026-11-19T08:00:00Z" };
    const failed = status({
      available: release("0.2.1", { failed: "unhealthy" }),
      last: { ...last, result: "rolled-back" },
    });
    expect(buttonState(response(failed), idle)).toBe("failed");
    expect(buttonState(response({ ...failed, last: { ...last, result: "failed" } }), idle)).toBe("failed");
    // A newer release after the failure: available again.
    expect(buttonState(response({ ...failed, available: release("0.2.2") }), idle)).toBe("available");
    // An "install anyway" of a release with upgrade steps that failed.
    expect(
      buttonState(
        response(
          status({ attention: release("0.3.0"), last: { ...last, version: "0.3.0", result: "failed" } }),
        ),
        idle,
      ),
    ).toBe("failed");
  });

  it("keeps the popover's content during a check, and opens it only with something to show", () => {
    const available = response(status({ available: release("0.2.1"), checking: true }));
    expect(buttonState(available, idle)).toBe("checking");
    expect(panelState(available, null)).toBe("available");
    expect(hasPanel("available", available)).toBe(true);
    expect(hasPanel("current", response(status()))).toBe(false);
    expect(hasPanel("off", response(status({ mode: "off" })))).toBe(false);
    expect(hasPanel("installing", undefined)).toBe(false);
  });

  it("keeps installing while this tab waits, even when the app does not answer", () => {
    const pending = startAttempt("0.2.1", response(status()), 0);
    expect(buttonState(undefined, { checking: false, pending })).toBe("installing");
    expect(buttonState(response(null), { checking: false, pending })).toBe("installing");
    // The popover shows the progress and the warning after 15 minutes without a status.
    expect(hasPanel("installing", undefined, pending)).toBe(true);
    expect(hasPanel("installing", response(null), pending)).toBe(true);
  });

  it("offers an attention release only while the channel is not locked", () => {
    const attention = release("0.3.0");
    const locked = status({ mode: "platform", attention, channelLocked: "The image tag 0.2 decides." });
    expect(buttonState(response(locked), idle)).toBe("attention");
    expect(canInstall(locked, attention)).toBe(false);
    expect(canInstall({ ...locked, channelLocked: null }, attention)).toBe(true);
    // An available update installs on the platform as well; nothing installs in mode off.
    const available = release("0.2.1");
    expect(canInstall({ ...locked, attention: null, available }, available)).toBe(true);
    expect(canInstall(status({ mode: "off", attention }), attention)).toBe(false);
  });
});

const T0 = Date.parse("2026-11-19T08:00:00.000Z");
const at = (ms: number) => new Date(T0 + ms).toISOString();
const installing = (version: string, startedAt = at(1_000)): UpdaterStatus["installing"] => ({
  version,
  startedAt,
  manual: true,
  stage: "pulling",
});
const result = (
  version: string,
  outcome: NonNullable<UpdaterStatus["last"]>["result"],
  finishedAt = at(60_000),
  message: string | null = null,
): UpdaterStatus["last"] => ({ version, result: outcome, message, finishedAt });

/** This tab's attempt at T0, accepted (202) by the updater. */
function accepted(version = "0.2.1", from = "0.2.0"): PendingInstall {
  const attempt = startAttempt(version, response(status({ available: release(version) }), from), T0);
  const answer = response(status({ available: release(version), installing: installing(version) }), from);
  return answerInstall(attempt, { kind: "accepted", response: answer }, T0 + 500).pending!;
}

describe("installOutcome", () => {
  const pending = accepted();
  const after = (extra: Partial<UpdaterStatus>, version: string | null = "0.2.0") =>
    response(status(extra), version);

  it("is done when nothing reports the installation any more and the app runs the new version", () => {
    expect(pending).toMatchObject({ confirmed: true, installStartedAt: at(1_000) });
    expect(installOutcome(pending, after({}, "0.2.1"), T0 + 30_000)).toBe("done");
    expect(installOutcome(pending, after({}), T0 + 30_000)).toBe("waiting");
  });

  it("keeps waiting while the updater installs the version, even when the app already runs it", () => {
    const running = after({ installing: { ...installing("0.2.1")!, stage: "starting" } }, "0.2.1");
    expect(installOutcome(pending, running, T0 + 30_000)).toBe("waiting");
    expect(buttonState(running, { checking: false, pending })).toBe("installing");
  });

  it("is done once the updater reports it installed, before the app answers with it", () => {
    expect(installOutcome(pending, after({ last: result("0.2.1", "installed") }), T0 + 61_000)).toBe("done");
    // Development: no version to compare.
    const development = accepted("0.2.1", "");
    expect(
      installOutcome(development, after({ last: result("0.2.1", "installed") }, null), T0 + 61_000),
    ).toBe("done");
  });

  it("waits after the platform accepted it until the app runs the version or came back", () => {
    const platform = after({ last: result("0.2.1", "accepted") });
    expect(installOutcome(pending, platform, T0 + 61_000)).toBe("waiting");
    expect(installOutcome({ ...pending, outage: true }, platform, T0 + 61_000)).toBe("waiting");
    expect(installOutcome(pending, { ...platform, app: { version: "0.2.1" } }, T0 + 61_000)).toBe("done");
    // Without a version of its own, the app tells only by answering again after an outage.
    const unversioned = { ...platform, app: { version: null } };
    expect(installOutcome(pending, unversioned, T0 + 61_000)).toBe("waiting");
    expect(installOutcome({ ...pending, outage: true }, unversioned, T0 + 61_000)).toBe("done");
    // An image without a version, named by its digest: the app's version changed.
    const digest = accepted("sha256:0123456789ab");
    const accepting = (version: string) =>
      after({ last: result("sha256:0123456789ab", "accepted") }, version);
    expect(installOutcome(digest, accepting("0.2.0"), T0 + 61_000)).toBe("waiting");
    expect(installOutcome(digest, accepting("0.2.1"), T0 + 61_000)).toBe("done");
  });

  it("fails on a fresh failed or rolled-back result, also when the update is not marked failed", () => {
    const rolledBack = result("0.2.1", "rolled-back", at(60_000), "migrate failed. 0.2.0 runs again.");
    const answer = after({ available: release("0.2.1"), last: rolledBack });
    expect(installOutcome(pending, answer, T0 + 61_000)).toBe("failed");
    expect(installOutcome(pending, after({ last: { ...rolledBack!, result: "failed" } }), T0 + 61_000)).toBe(
      "failed",
    );
    // The status alone does not show it (`available.failed` is not set) …
    expect(failureOf(answer)).toBeNull();
    expect(panelState(answer, null)).toBe("available");
    // … the button does, with the message of `last`, and offers it again while it is offered.
    expect(panelState(answer, null, rolledBack)).toBe("failed");
    expect(failureOf(answer, rolledBack)).toEqual({
      version: "0.2.1",
      message: "migrate failed. 0.2.0 runs again.",
      offer: release("0.2.1"),
    });
    expect(failureOf(after({ last: rolledBack }), rolledBack)).toMatchObject({ offer: null });
    // A later result replaces it.
    expect(failureOf(after({ last: result("0.2.2", "installed", at(90_000)) }), rolledBack)).toBeNull();
  });

  it("ignores a result that finished before the attempt started", () => {
    const stale = result("0.2.1", "rolled-back", at(-5_000), "unhealthy");
    const attempt = startAttempt("0.2.1", after({ last: stale }), T0);
    expect(installOutcome(attempt, after({ last: stale }), T0 + 2_000)).toBe("waiting");
    expect(installOutcome(attempt, after({ last: { ...stale!, result: "installed" } }), T0 + 2_000)).toBe(
      "waiting",
    );
    // Nor does it confirm the attempt.
    expect(followStatus(attempt, after({ last: stale }), T0 + 2_000)).toMatchObject({ confirmed: false });
    // A result of another version is not this installation's.
    expect(installOutcome(pending, after({ last: result("0.2.0", "rolled-back") }), T0 + 61_000)).toBe(
      "waiting",
    );
  });

  it("takes a result of the attempt's second as fresh: the updater writes whole seconds", () => {
    // A platform that accepts at once, after an unclear answer, in the second the attempt started.
    const before = response(status({ mode: "platform", available: release("0.2.1") }), null);
    const attempt = startAttempt("0.2.1", before, T0 + 700);
    const unclear = answerInstall(attempt, { kind: "unclear", error: "Bad gateway" }, T0 + 900).pending!;
    const acceptedNow = response(
      status({ mode: "platform", last: result("0.2.1", "accepted", at(0)) }),
      null,
    );
    const confirmed = followStatus(unclear, acceptedNow, T0 + 2_000)!;
    expect(confirmed.confirmed).toBe(true);
    expect(installOutcome(confirmed, acceptedNow, T0 + 2_000)).toBe("waiting");
    // Without a version of its own, the app is done once it answers again after an outage.
    const restarted = noteOutage(confirmed, "Failed to fetch");
    expect(installOutcome(restarted, acceptedNow, T0 + 6_000)).toBe("done");
    // The same for the answer to the request itself.
    const direct = answerInstall(attempt, { kind: "accepted", response: acceptedNow }, T0 + 900).pending!;
    expect(installOutcome({ ...direct, outage: true }, acceptedNow, T0 + 6_000)).toBe("done");
    // A result of the second before is not this attempt's.
    const older = response(status({ mode: "platform", last: result("0.2.1", "accepted", at(-1_000)) }), null);
    expect(followStatus(unclear, older, T0 + 2_000)).toMatchObject({ confirmed: false });
  });

  it("never takes the earlier result for a retry's own, also with skewed clocks", () => {
    const failure = result("0.2.1", "rolled-back", at(0), "unhealthy");
    const failed = response(status({ available: release("0.2.1", { failed: "unhealthy" }), last: failure }));
    // Try again in the same second.
    const retry = startAttempt("0.2.1", failed, T0 + 400);
    expect(retry.earlier).toEqual(failure);
    expect(followStatus(retry, failed, T0 + 1_000)).toMatchObject({ confirmed: false });
    expect(installOutcome({ ...retry, confirmed: true }, failed, T0 + 1_000)).toBe("waiting");
    // The browser's clock 30 s behind: the earlier failure looks newer than the retry.
    const behind = startAttempt("0.2.1", failed, T0 - 30_000);
    expect(installOutcome({ ...behind, confirmed: true }, failed, T0 - 29_000)).toBe("waiting");
    // Its own result counts from the updater's start of the installation.
    const reported = response(status({ installing: installing("0.2.1", at(2_000)) }));
    const again = response(status({ last: result("0.2.1", "rolled-back", at(40_000), "unhealthy again") }));
    expect(installOutcome(followStatus(behind, reported, T0 - 28_000)!, again, T0 + 10_000)).toBe("failed");
    // The browser's clock 90 s ahead: the updater's start decides as well.
    const ahead = followStatus(startAttempt("0.2.1", failed, T0 + 90_000), reported, T0 + 91_000)!;
    expect(ahead.installStartedAt).toBe(at(2_000));
    expect(installOutcome(ahead, again, T0 + 100_000)).toBe("failed");
  });

  it("counts an answer without update service as an outage; accepted without a version is done after it", () => {
    const platform = accepted();
    const acceptedLast = after({ mode: "platform", last: result("0.2.1", "accepted", at(3_000)) }, null);
    expect(installOutcome(platform, acceptedLast, T0 + 4_000)).toBe("waiting");
    const down = followStatus(platform, response(null, null), T0 + 6_000)!;
    expect(down).toMatchObject({ outage: true, lastError: "The update service is not reachable." });
    expect(installOutcome(down, acceptedLast, T0 + 8_000)).toBe("done");
  });

  it("turns slow after 15 minutes without a result", () => {
    const running = after({ installing: installing("0.2.1") });
    expect(installOutcome(pending, running, T0 + SLOW_AFTER_MS)).toBe("waiting");
    expect(installOutcome(pending, undefined, T0 + SLOW_AFTER_MS + 1)).toBe("slow");
  });
});

describe("staleVersion", () => {
  const installing = {
    version: "0.2.1",
    startedAt: "2026-11-19T10:00:00Z",
    manual: false,
    stage: "starting" as const,
  };

  it("names the app's version when the page was loaded from another one and nothing installs", () => {
    expect(staleVersion("0.2.0", response(status({ installed: "0.2.1" }), "0.2.1"))).toBe("0.2.1");
    // Back to the version before (a rollback after the page loaded the new one): old code too.
    expect(staleVersion("0.2.1", response(status()))).toBe("0.2.0");
  });

  it("is null for the page's own version, while an installation runs or may, and without versions", () => {
    expect(staleVersion("0.2.0", response(status()))).toBeNull();
    expect(staleVersion("0.2.0", response(status({ installing }), "0.2.1"))).toBeNull();
    // The update service restarts with the app during an installation, which may still roll back.
    expect(staleVersion("0.2.0", response(null, "0.2.1"))).toBeNull();
    expect(staleVersion(null, response(status(), "0.2.1"))).toBeNull();
    expect(staleVersion("0.2.0", response(status(), null))).toBeNull();
  });
});

describe("answerInstall", () => {
  const before = response(status({ available: release("0.2.1") }));
  const attempt = startAttempt("0.2.1", before, T0);

  it("remembers the attempt unconfirmed before the request", () => {
    expect(attempt).toMatchObject({ version: "0.2.1", from: "0.2.0", startedAt: T0, confirmed: false });
  });

  it("keeps the attempt after an unclear answer and reconciles it with the status until 60 s after its start", () => {
    const { pending, error } = answerInstall(
      attempt,
      { kind: "unclear", error: "The update service did not answer in time." },
      T0 + 10_000,
    );
    expect(error).toBeNull();
    expect(pending).toMatchObject({
      confirmed: false,
      reason: "The update service did not answer in time.",
      lastError: "The update service did not answer in time.",
    });
    // The deadline counts from the attempt's start, not from the answer.
    expect(reconcileDeadline(pending, T0)).toBe(T0 + RECONCILE_MS);
    expect(reconcileDeadline({ ...pending!, confirmed: true }, T0)).toBeNull();
    // A reachable status without it: at the deadline, it did not start, with the reason.
    const nothing = response(status({ available: release("0.2.1") }));
    const unreported = followStatus(pending, nothing, T0 + 12_000)!;
    expect(unreported).toMatchObject({ confirmed: false, unreported: true });
    expect(installOutcome(unreported, nothing, T0 + 12_000)).toBe("waiting");
    expect(unconfirmedEnd(unreported)).toEqual({
      message: "notStarted",
      detail: "The update service did not answer in time.",
    });
    // A status that reports it confirms it.
    const reported = followStatus(
      pending,
      response(status({ installing: installing("0.2.1") })),
      T0 + 12_000,
    );
    expect(reported).toMatchObject({ confirmed: true, installStartedAt: at(1_000) });
    const finished = response(status({ last: result("0.2.1", "rolled-back", at(5_000), "unhealthy") }));
    expect(followStatus(pending, finished, T0 + 12_000)).toMatchObject({ confirmed: true });
    expect(installOutcome(pending!, finished, T0 + 12_000)).toBe("failed");
  });

  it("forgets the attempt after a refusal, unless the status reports an installation", () => {
    const refused = answerInstall(
      attempt,
      { kind: "refused", error: "0.2.1 is not offered; check again.", response: response(status()) },
      T0 + 1_000,
    );
    expect(refused).toEqual({ pending: null, error: "0.2.1 is not offered; check again." });
    expect(
      answerInstall(attempt, { kind: "refused", error: "Forbidden", response: null }, T0 + 1_000),
    ).toEqual({
      pending: null,
      error: "Forbidden",
    });
    // Another administrator or an automatic installation was faster: follow that one.
    const running = response(status({ installing: installing("0.2.2", at(-2_000)) }));
    const adopted = answerInstall(
      attempt,
      { kind: "refused", error: "An installation runs.", response: running },
      T0 + 1_000,
    );
    expect(adopted.error).toBeNull();
    expect(adopted.pending).toMatchObject({
      version: "0.2.2",
      confirmed: true,
      installStartedAt: at(-2_000),
    });
    const same = response(status({ installing: installing("0.2.1") }));
    expect(
      answerInstall(attempt, { kind: "refused", error: "An installation runs.", response: same }, T0 + 1_000)
        .pending,
    ).toMatchObject({ version: "0.2.1", startedAt: T0, confirmed: true });
  });
});

describe("the reconciliation deadline", () => {
  const attempt = startAttempt("0.2.1", response(status({ available: release("0.2.1") })), T0);
  const unclear = answerInstall(attempt, { kind: "unclear", error: "Bad gateway" }, T0 + 9_000).pending!;

  it("could not confirm an attempt whose every poll failed, with the latest error", () => {
    let pending = noteOutage(unclear, "Failed to fetch");
    pending = noteOutage(pending, "Request failed (503)");
    pending = followStatus(pending, response(null), T0 + 30_000)!;
    expect(pending).toMatchObject({ confirmed: false, outage: true, unreported: false });
    expect(installOutcome(pending, undefined, T0 + RECONCILE_MS + 1)).toBe("waiting");
    expect(reconcileDeadline(pending, T0)).toBe(T0 + RECONCILE_MS);
    expect(unconfirmedEnd(pending)).toEqual({
      message: "notConfirmed",
      detail: "The update service is not reachable.",
    });
    expect(unconfirmedEnd(unclear)).toEqual({ message: "notConfirmed", detail: "Bad gateway" });
  });

  it("gives a page that starts after the deadline 10 s to ask the update service, never more", () => {
    // Loaded 5 minutes after the attempt (after a sign-in): until 10 s after the page started.
    expect(reconcileDeadline(unclear, T0 + 5 * 60_000)).toBe(T0 + 5 * 60_000 + PAGE_GRACE_MS);
    // Loaded 55 s after it: the 60 s still hold.
    expect(reconcileDeadline(unclear, T0 + 55_000)).toBe(T0 + 65_000);
    expect(reconcileDeadline(unclear, T0 + 30_000)).toBe(T0 + RECONCILE_MS);
  });

  it("bounds each status request by the time left until the deadline", () => {
    expect(statusTimeout(null, T0)).toBe(STATUS_TIMEOUT_MS);
    expect(statusTimeout(T0 + 30_000, T0)).toBe(STATUS_TIMEOUT_MS);
    expect(statusTimeout(T0 + 500, T0)).toBe(500);
    // After the deadline the attempt is gone: a normal request.
    expect(statusTimeout(T0, T0)).toBe(STATUS_TIMEOUT_MS);
  });

  it("did not start an attempt that a reachable status answered without", () => {
    const answered = followStatus(noteOutage(unclear, "Failed to fetch"), response(status()), T0 + 40_000)!;
    expect(unconfirmedEnd(answered)).toEqual({ message: "notStarted", detail: "Bad gateway" });
  });
});

describe("followStatus", () => {
  it("lets only a status requested after the install request answered say that it did not start", () => {
    const attempt = startAttempt("0.2.1", response(status({ available: release("0.2.1") })), T0);
    const nothing = response(status({ available: release("0.2.1") }));
    // Before the answer, a status cannot know of the attempt.
    expect(followStatus(attempt, nothing, T0 + 2_000)).toMatchObject({ unreported: false });
    const unclear = answerInstall(attempt, { kind: "unclear", error: "Bad gateway" }, T0 + 9_000).pending!;
    expect(unclear.answeredAt).toBe(T0 + 9_000);
    // Sent before the answer, arriving after it: still not.
    expect(followStatus(unclear, nothing, T0 + 10_000, null, T0 + 8_000)).toMatchObject({
      unreported: false,
    });
    // But it confirms the attempt when it reports it.
    const reported = response(status({ installing: installing("0.2.1") }));
    expect(followStatus(unclear, reported, T0 + 10_000, null, T0 + 8_000)).toMatchObject({ confirmed: true });
    // Sent after the answer: it did not start.
    expect(followStatus(unclear, nothing, T0 + 12_000, null, T0 + 10_000)).toMatchObject({
      unreported: true,
    });
  });

  it("adopts an installation a status reports, unless the administrator stopped waiting for it", () => {
    const running = response(status({ installing: installing("0.2.1") }));
    expect(followStatus(null, response(status()), T0)).toBeNull();
    const adopted = followStatus(null, running, T0)!;
    expect(adopted).toMatchObject({
      version: "0.2.1",
      from: "0.2.0",
      startedAt: T0,
      confirmed: true,
      installStartedAt: at(1_000),
    });
    expect(followStatus(null, running, T0 + 5_000, ignoreInstall(adopted))).toBeNull();
    // An unconfirmed attempt gives way to another running installation; a confirmed one does not.
    const attempt = startAttempt("0.2.2", running, T0);
    expect(followStatus(attempt, running, T0)).toMatchObject({ version: "0.2.1" });
    const own = { ...attempt, confirmed: true };
    expect(followStatus(own, running, T0)).toBe(own);
  });

  it("leaves an installation alone after Stop waiting by the identity stored on the attempt", () => {
    // Stopped while the app restarted: no status, only the attempt.
    const ignored = ignoreInstall(accepted());
    expect(ignored).toEqual({ version: "0.2.1", installStartedAt: at(1_000), startedAt: T0 });
    const back = response(status({ installing: installing("0.2.1", at(1_000)) }));
    expect(followStatus(null, back, T0 + 20 * 60_000, ignored)).toBeNull();
    // Another installation of the version is followed.
    const later = response(status({ installing: installing("0.2.1", at(30 * 60_000)) }));
    expect(followStatus(null, later, T0 + 31 * 60_000, ignored)).toMatchObject({ version: "0.2.1" });
    // Never reported: the version and the attempt's start identify it.
    const unseen = ignoreInstall(startAttempt("0.2.1", undefined, T0 + 500));
    const from = (version: string, startedAt: string) =>
      followStatus(null, response(status({ installing: installing(version, startedAt) })), T0, unseen);
    expect(from("0.2.1", at(0))).toBeNull();
    expect(from("0.2.1", at(-60_000))).not.toBeNull();
    expect(from("0.2.2", at(0))).not.toBeNull();
  });
});

describe("replacedFailure", () => {
  const rolledBack = result("0.2.1", "rolled-back", at(60_000), "migrate failed.");

  it("shows a newer offer in place of a failure, with the failure as a line in it", () => {
    const newer = response(status({ available: release("0.2.2"), last: rolledBack }));
    expect(failureOf(newer, rolledBack)).toBeNull();
    expect(panelState(newer, null, rolledBack)).toBe("available");
    expect(replacedFailure(newer, rolledBack)).toEqual({ version: "0.2.1", message: "migrate failed." });
    // Also when this tab did not follow it, and in an offer that needs upgrade steps.
    expect(replacedFailure(newer)).toEqual({ version: "0.2.1", message: "migrate failed." });
    const attention = response(status({ attention: release("0.3.0"), last: rolledBack }));
    expect(panelState(attention, null, rolledBack)).toBe("attention");
    expect(replacedFailure(attention, rolledBack)).toMatchObject({ version: "0.2.1" });
  });

  it("keeps the failure itself while its version is offered or nothing is", () => {
    const same = response(status({ available: release("0.2.1"), last: rolledBack }));
    expect(panelState(same, null, rolledBack)).toBe("failed");
    expect(replacedFailure(same, rolledBack)).toBeNull();
    const none = response(status({ last: rolledBack }));
    expect(failureOf(none, rolledBack)).toMatchObject({ version: "0.2.1", offer: null });
    expect(replacedFailure(none, rolledBack)).toBeNull();
    expect(replacedFailure(response(status({ available: release("0.2.2") })))).toBeNull();
  });

  it("keeps the reason of an unmarked failure of the offered version as a line in the offer", () => {
    // Updater 0.2 offers the version again without `failed` when the deploy link failed.
    const unmarked = response(status({ available: release("0.2.1"), last: rolledBack }));
    expect(panelState(unmarked, null)).toBe("available");
    expect(replacedFailure(unmarked)).toEqual({ version: "0.2.1", message: "migrate failed." });
  });
});

describe("helpers", () => {
  it("reads cooldowns", () => {
    expect(cooldownParts("3d")).toEqual({ unit: "days", count: 3 });
    expect(cooldownParts("12h")).toEqual({ unit: "hours", count: 12 });
    expect(cooldownParts("30m")).toEqual({ unit: "minutes", count: 30 });
    expect(cooldownParts("259200")).toEqual({ unit: "days", count: 3 });
    expect(cooldownParts("5400")).toEqual({ unit: "minutes", count: 90 });
    expect(cooldownParts("45")).toEqual({ unit: "seconds", count: 45 });
    expect(cooldownParts("0")).toBeNull();
    expect(cooldownParts(null)).toBeNull();
    expect(cooldownParts("soon")).toBeNull();
  });

  it("reads install windows", () => {
    expect(windowParts("02:00-05:00")).toEqual({ start: "02:00", end: "05:00" });
    expect(windowParts(null)).toBeNull();
  });

  it("lists up to 8 notes and counts the rest", () => {
    const notes = Array.from({ length: 15 }, (_, index) => `Change ${index + 1}`);
    expect(noteSummary(release("0.2.1", { notes, changes: 40 }))).toEqual({
      notes: notes.slice(0, 8),
      more: 32,
    });
    expect(noteSummary(release("0.2.1", { notes: ["One"], changes: 1 }))).toEqual({
      notes: ["One"],
      more: 0,
    });
  });
});
