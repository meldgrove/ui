import type { Update, UpdaterStatus, UpdatesResponse } from "./types.ts";

/**
 * The update button's logic, free of React and of the page: which state a
 * status shows, and how an installation is followed until the updater
 * reports its result (https://github.com/meldgrove/updater#the-apps-update-button).
 */

export type ButtonState =
  | "loading"
  | "unreachable"
  | "installing"
  | "checking"
  | "off"
  | "failed"
  | "available"
  | "attention"
  | "current";

/**
 * An installation this tab follows: one an administrator started here
 * (remembered before the request), or one a status reported. Kept in
 * sessionStorage across reloads.
 */
export type PendingInstall = {
  version: string;
  /** The app's version when this tab began to follow it. */
  from: string | null;
  /** Epoch milliseconds (this browser's clock): when this tab began to follow it. */
  startedAt: number;
  /** The updater accepted it (202) or a status reported it; until then the request's answer was unclear. */
  confirmed: boolean;
  /** The `last` of the newest status before it (the earlier result): never this installation's result. */
  earlier: LastResult | null;
  /** `installing.startedAt` (the updater's clock), once a status reported the installation: with the version, its identity. */
  installStartedAt: string | null;
  /** When the install request answered (epoch ms, this browser's clock); null: not yet, or the tab adopted the installation. */
  answeredAt: number | null;
  /** Why the answer to the install request was unclear. */
  reason: string | null;
  /** The latest error of the install request or of a status request since. */
  lastError: string | null;
  /** A reachable status answered after it started without reporting it (unconfirmed attempts only). */
  unreported: boolean;
  /** The app or its update service did not answer at least once since (it restarted). */
  outage: boolean;
};

type Installing = NonNullable<UpdaterStatus["installing"]>;
type LastResult = NonNullable<UpdaterStatus["last"]>;

export const SLOW_AFTER_MS = 15 * 60_000;
/** How long an unconfirmed attempt is reconciled with the status, from its start, before it is forgotten. */
export const RECONCILE_MS = 60_000;
/** A page that starts with an unconfirmed attempt asks the update service at least this long before it ends it. */
export const PAGE_GRACE_MS = 10_000;
const FAILED_RESULTS = new Set(["failed", "rolled-back"]);

/** A failure the popover shows: its version, why, and the offer to try again (null: no longer offered). */
export type Failure = { version: string; message: string | null; offer: Update | null };

function offersOf(status: UpdaterStatus): Update[] {
  return [status.available, status.attention].filter((update): update is Update => update !== null);
}

/**
 * The failure to show: that of an installation this tab followed (`recent`,
 * while it is still the updater's latest result) unless a newer version is
 * offered (see `replacedFailure`), else the latest result when it failed and
 * the update is marked failed.
 */
export function failureOf(
  response: UpdatesResponse | undefined,
  recent: LastResult | null = null,
): Failure | null {
  const status = response?.updater;
  const last = status?.last;
  if (!status || !last || !FAILED_RESULTS.has(last.result)) return null;
  if (recent && recent.version === last.version && recent.finishedAt === last.finishedAt) {
    const offers = offersOf(status);
    const offer = offers.find((update) => update.version === last.version) ?? null;
    if (!offer && offers.length > 0) return null;
    return { version: last.version, message: last.message ?? offer?.failed ?? null, offer };
  }
  if (status.available?.failed) {
    return { version: status.available.version, message: status.available.failed, offer: status.available };
  }
  if (status.attention && status.attention.version === last.version) {
    return {
      version: last.version,
      message: status.attention.failed ?? last.message,
      offer: status.attention,
    };
  }
  return null;
}

/**
 * A failed latest result that a newer offer took the place of: the popover
 * shows the offer, with the failure as a line in it ("0.2.1 failed: …").
 */
export function replacedFailure(
  response: UpdatesResponse | undefined,
  recent: LastResult | null = null,
): { version: string; message: string | null } | null {
  const status = response?.updater;
  const last = status?.last;
  if (!status || !last || !FAILED_RESULTS.has(last.result) || failureOf(response, recent)) return null;
  const offers = offersOf(status);
  if (offers.length === 0 || offers.some((update) => update.version === last.version)) return null;
  return { version: last.version, message: last.message };
}

/** What the popover shows: the button's state, but a running check does not hide the result before it. */
export function panelState(
  response: UpdatesResponse | undefined,
  pending: PendingInstall | null,
  recent: LastResult | null = null,
): Exclude<ButtonState, "checking"> {
  if (pending) return "installing";
  if (!response) return "loading";
  const status = response.updater;
  if (!response.reachable || !status) return "unreachable";
  if (status.installing) return "installing";
  if (failureOf(response, recent)) return "failed";
  if (status.available) return "available";
  if (status.attention) return "attention";
  // Mode off still shows what is new (without installing); "off" only when nothing is.
  return status.mode === "off" ? "off" : "current";
}

/** The state of the button: the first that applies. */
export function buttonState(
  response: UpdatesResponse | undefined,
  options: { checking: boolean; pending: PendingInstall | null; recent?: LastResult | null },
): ButtonState {
  const shown = panelState(response, options.pending, options.recent ?? null);
  if (shown === "loading" || shown === "unreachable" || shown === "installing") return shown;
  return options.checking || response?.updater?.checking ? "checking" : shown;
}

/**
 * Whether a click opens the popover (else it checks): there is something to
 * show. A followed installation always has one, for its progress and the
 * warning after 15 minutes, also while the app or its update service restarts.
 */
export function hasPanel(
  state: ButtonState,
  response: UpdatesResponse | undefined,
  pending: PendingInstall | null = null,
): boolean {
  if (pending) return true;
  if (!response?.updater) return false;
  return state === "available" || state === "attention" || state === "failed" || state === "installing";
}

/** Whether an Update can be installed from the popover: not in mode off, and an attention offer only while the channel is not locked. */
export function canInstall(status: UpdaterStatus, update: Update): boolean {
  if (status.mode === "off") return false;
  return update !== status.attention || status.channelLocked === null;
}

/**
 * An attempt to install `version`, remembered before the request; unconfirmed
 * until the updater accepts it. `before`: the newest status, whose `last` is
 * the earlier result.
 */
export function startAttempt(
  version: string,
  before: UpdatesResponse | undefined,
  now: number,
): PendingInstall {
  return {
    version,
    from: before?.app.version ?? null,
    startedAt: now,
    confirmed: false,
    earlier: before?.updater?.last ?? null,
    installStartedAt: null,
    answeredAt: null,
    reason: null,
    lastError: null,
    unreported: false,
    outage: false,
  };
}

/** Follows an installation that a status reports (another administrator's, an automatic one, or a retry). */
export function adoptInstall(installing: Installing, response: UpdatesResponse, now: number): PendingInstall {
  return {
    ...startAttempt(installing.version, response, now),
    confirmed: true,
    installStartedAt: installing.startedAt,
  };
}

/**
 * An installation the administrator stopped waiting for: its version and
 * `installing.startedAt` when a status reported it, else when this tab's
 * attempt started (epoch ms).
 */
export type Ignored = { version: string; installStartedAt: string | null; startedAt: number };

/** What "Stop waiting" leaves alone from then on: the identity stored on the attempt, not the latest status. */
export function ignoreInstall(pending: PendingInstall): Ignored {
  return {
    version: pending.version,
    installStartedAt: pending.installStartedAt,
    startedAt: pending.startedAt,
  };
}

/** The updater writes whole seconds: an epoch time of this browser cut to its second. */
function wholeSecond(ms: number): number {
  return Math.floor(ms / 1000) * 1000;
}

/** Whether a reported installation is the one the administrator stopped waiting for. */
export function isIgnored(installing: Installing, ignored: Ignored | null): boolean {
  if (!ignored || installing.version !== ignored.version) return false;
  if (ignored.installStartedAt !== null) return installing.startedAt === ignored.installStartedAt;
  return Date.parse(installing.startedAt) >= wholeSecond(ignored.startedAt);
}

function sameResult(a: LastResult, b: LastResult): boolean {
  return a.version === b.version && a.result === b.result && a.finishedAt === b.finishedAt;
}

/**
 * The result of the followed installation in `last` (fresh): its version, not
 * the earlier result, and finished at or after the installation started: at
 * `installing.startedAt` when a status reported it (the updater's clock),
 * else at the attempt's start cut to whole seconds.
 */
function freshLast(pending: PendingInstall, status: UpdaterStatus | null): LastResult | null {
  const last = status?.last;
  if (!last || last.version !== pending.version) return null;
  if (pending.earlier && sameResult(last, pending.earlier)) return null;
  const since =
    pending.installStartedAt !== null ? Date.parse(pending.installStartedAt) : wholeSecond(pending.startedAt);
  return Date.parse(last.finishedAt) >= since ? last : null;
}

/**
 * Takes a fresh status into the followed installation: confirms an attempt
 * the status reports (running or finished), and adopts a reported
 * installation when this tab follows none, or in place of an unconfirmed
 * attempt (another administrator or an automatic install was faster).
 * A reachable status that reports neither marks an unconfirmed attempt as
 * unreported, but only one requested after the install request answered
 * (`sentAt`, epoch ms): an earlier one cannot know of it. An answer without
 * status (`reachable: false`) is an observed outage. `ignored`: an
 * installation this tab stopped waiting for.
 */
export function followStatus(
  pending: PendingInstall | null,
  response: UpdatesResponse,
  now: number,
  ignored: Ignored | null = null,
  sentAt: number = now,
): PendingInstall | null {
  const status = response.updater;
  const installing = status?.installing ?? null;
  const adoptable = installing !== null && !isIgnored(installing, ignored);
  if (!pending) return adoptable ? adoptInstall(installing, response, now) : null;
  if (!status) return noteOutage(pending, response.error);
  if (installing && installing.version === pending.version) {
    if (pending.confirmed && pending.installStartedAt === installing.startedAt) return pending;
    return { ...pending, confirmed: true, installStartedAt: installing.startedAt };
  }
  if (pending.confirmed) return pending;
  if (adoptable) return adoptInstall(installing, response, now);
  if (freshLast(pending, status)) return { ...pending, confirmed: true };
  const afterAnswer = pending.answeredAt !== null && sentAt >= pending.answeredAt;
  return pending.unreported || !afterAnswer ? pending : { ...pending, unreported: true };
}

/**
 * A status request failed (network error, timeout, 5xx) or the update service
 * did not answer (`reachable: false`) while following: an observed outage,
 * with its error for the attempt's reconciliation.
 */
export function noteOutage(pending: PendingInstall, error: string | null): PendingInstall {
  const lastError = error ?? pending.lastError;
  return pending.outage && pending.lastError === lastError
    ? pending
    : { ...pending, outage: true, lastError };
}

/** An answer to the install request: 202; a refusal (409 or another 4xx); or unclear (200, network error, timeout, unreadable, 5xx). */
export type InstallAnswer =
  | { kind: "accepted"; response: UpdatesResponse | null }
  | { kind: "refused"; error: string; response: UpdatesResponse | null }
  | { kind: "unclear"; error: string | null };

/**
 * What an answer to the install request does with the attempt: accepted
 * confirms it (also without a readable status); a refusal forgets it (and
 * returns the error), unless its status reports a running installation, which
 * is followed instead; an unclear answer keeps it, to reconcile with the
 * status until `reconcileDeadline`.
 */
export function answerInstall(
  attempt: PendingInstall,
  answer: InstallAnswer,
  now: number,
): { pending: PendingInstall | null; error: string | null } {
  const answered = { ...attempt, answeredAt: now };
  if (answer.kind === "accepted") {
    const followed = answer.response?.updater ? followStatus(answered, answer.response, now) : answered;
    return { pending: { ...(followed ?? answered), confirmed: true }, error: null };
  }
  if (answer.kind === "unclear") {
    return {
      pending: { ...answered, reason: answer.error, lastError: answer.error ?? attempt.lastError },
      error: null,
    };
  }
  const installing = answer.response?.updater?.installing;
  if (!answer.response || !installing) return { pending: null, error: answer.error };
  return { pending: followStatus({ ...answered, confirmed: false }, answer.response, now), error: null };
}

export type InstallOutcome = "done" | "failed" | "waiting" | "slow";

/**
 * Where the followed installation stands after `response`, a status answer
 * received after it started (undefined: none, or the app did not answer).
 * The first that applies:
 * 1. `last` reports it failed or rolled back: failed.
 * 2. The updater still installs it: waiting, also when the app already runs
 *    the version (on a server it may still roll back).
 * 3. `last` reports it installed: done.
 * 4. `last` reports the platform accepted it: done once the app runs the
 *    version, or, where the app's version cannot tell (none, or a digest),
 *    once it changed or the app answered again after an outage.
 * 5. Nothing reports it any more and the app runs the version: done.
 * Otherwise it turns slow after 15 minutes. (An unconfirmed attempt ends
 * earlier, at `reconcileDeadline`, on a timer of its own.)
 */
export function installOutcome(
  pending: PendingInstall,
  response: UpdatesResponse | undefined,
  now: number,
): InstallOutcome {
  const status = response?.updater ?? null;
  if (response && status) {
    const last = freshLast(pending, status);
    const version = response.app.version;
    if (last && FAILED_RESULTS.has(last.result)) return "failed";
    if (status.installing?.version !== pending.version) {
      if (last?.result === "installed") return "done";
      if (last?.result === "accepted") {
        if (version === pending.version) return "done";
        const comparable = version !== null && !pending.version.startsWith("sha256:");
        const changed = version !== null && pending.from !== null && version !== pending.from;
        if (!comparable && (pending.outage || changed)) return "done";
      } else if (version === pending.version) return "done";
    }
  }
  return now - pending.startedAt > SLOW_AFTER_MS ? "slow" : "waiting";
}

/** How long a status request may take. */
export const STATUS_TIMEOUT_MS = 10_000;

/**
 * The timeout of a status request: never past the reconciliation deadline
 * (epoch ms) of an unconfirmed attempt; a request after it is a normal one.
 */
export function statusTimeout(deadline: number | null, now: number): number {
  const left = deadline === null ? STATUS_TIMEOUT_MS : deadline - now;
  return left > 0 ? Math.min(STATUS_TIMEOUT_MS, left) : STATUS_TIMEOUT_MS;
}

/**
 * When the wait for an unconfirmed attempt ends (epoch ms): 60 s after it
 * started, but not before 10 s after this page started (`pageStart`), so that
 * a page loaded after the deadline (after a sign-in) asks the update service
 * once first; null: confirmed, no deadline.
 */
export function reconcileDeadline(pending: PendingInstall | null, pageStart: number): number | null {
  if (!pending || pending.confirmed) return null;
  return Math.max(pending.startedAt + RECONCILE_MS, pageStart + PAGE_GRACE_MS);
}

/**
 * Why an unconfirmed attempt ended at its deadline: it did not start, with
 * the reason of the unclear answer, when a reachable status answered without
 * it; otherwise it could not be confirmed, with the latest error.
 */
export function unconfirmedEnd(pending: PendingInstall): {
  message: "notStarted" | "notConfirmed";
  detail: string | null;
} {
  return pending.unreported
    ? { message: "notStarted", detail: pending.reason ?? pending.lastError }
    : { message: "notConfirmed", detail: pending.lastError ?? pending.reason };
}

/**
 * Where a tab keeps its followed installation and the one it stopped waiting
 * for (sessionStorage, so a reload during the restart keeps following).
 * `prefix`: one per app, e.g. "meldgrove.updates.handbook".
 */
export function installStorage(prefix: string) {
  const pendingKey = `${prefix}.install`;
  const ignoredKey = `${prefix}.ignored`;
  return {
    loadPending(): PendingInstall | null {
      try {
        const value = JSON.parse(
          sessionStorage.getItem(pendingKey) ?? "null",
        ) as Partial<PendingInstall> | null;
        if (!value || typeof value.version !== "string" || typeof value.startedAt !== "number") return null;
        return { ...startAttempt(value.version, undefined, value.startedAt), ...value } as PendingInstall;
      } catch {
        return null;
      }
    },
    savePending(pending: PendingInstall | null) {
      try {
        if (pending) sessionStorage.setItem(pendingKey, JSON.stringify(pending));
        else sessionStorage.removeItem(pendingKey);
      } catch {
        // Without storage, a reload during the restart stops waiting; nothing else breaks.
      }
    },
    loadIgnored(): Ignored | null {
      try {
        const value = JSON.parse(sessionStorage.getItem(ignoredKey) ?? "null") as Partial<Ignored> | null;
        if (!value || typeof value.version !== "string" || typeof value.startedAt !== "number") return null;
        return {
          version: value.version,
          installStartedAt: value.installStartedAt ?? null,
          startedAt: value.startedAt,
        };
      } catch {
        return null;
      }
    },
    saveIgnored(ignored: Ignored | null) {
      try {
        if (ignored) sessionStorage.setItem(ignoredKey, JSON.stringify(ignored));
        else sessionStorage.removeItem(ignoredKey);
      } catch {
        // Without storage, a reload follows that installation again.
      }
    },
  };
}

export type InstallStorage = ReturnType<typeof installStorage>;

/** "3d", "12h", "30m", "45s" or seconds ("3600") as a count and unit; null for none or unknown. */
export function cooldownParts(
  cooldown: string | null,
): { unit: "days" | "hours" | "minutes" | "seconds"; count: number } | null {
  const match = cooldown?.trim().match(/^(\d+)\s*([dhms]?)$/);
  if (!match) return null;
  const count = Number(match[1]);
  if (count === 0) return null;
  if (match[2] === "d") return { unit: "days", count };
  if (match[2] === "h") return { unit: "hours", count };
  if (match[2] === "m") return { unit: "minutes", count };
  if (match[2] === "s" || count % 60 !== 0) return { unit: "seconds", count };
  if (count % 86_400 === 0) return { unit: "days", count: count / 86_400 };
  if (count % 3600 === 0) return { unit: "hours", count: count / 3600 };
  return { unit: "minutes", count: count / 60 };
}

/** "02:00-05:00" as its start and end. */
export function windowParts(window: string | null): { start: string; end: string } | null {
  const match = window?.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
  return match ? { start: match[1]!, end: match[2]! } : null;
}

/** How many notes the popover lists, and how many changes it leaves out. */
export const MAX_NOTES = 8;
export function noteSummary(update: Update): { notes: string[]; more: number } {
  const notes = update.notes.slice(0, MAX_NOTES);
  return { notes, more: Math.max(update.changes, update.notes.length) - notes.length };
}
