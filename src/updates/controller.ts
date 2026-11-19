import { errorMessage, translate, type Locale, type Translate } from "../lib/i18n.tsx";
import { messages } from "./messages.ts";
import {
  answerInstall,
  buttonState,
  followStatus,
  hasPanel,
  ignoreInstall,
  installOutcome,
  installStorage,
  noteOutage,
  panelState,
  reconcileDeadline,
  SLOW_AFTER_MS,
  startAttempt,
  statusTimeout,
  unconfirmedEnd,
  type ButtonState,
  type Ignored,
  type InstallAnswer,
  type InstallStorage,
  type PendingInstall,
} from "./state.ts";
import {
  SignedOutError,
  type UpdatesAction,
  type UpdatesAnswer,
  type UpdatesTransport,
} from "./transport.ts";
import {
  parseUpdatesResponse,
  type Update,
  type UpdateChannel,
  type UpdaterStatus,
  type UpdatesResponse,
} from "./types.ts";

/** Status requests: every 5 minutes, every 2 seconds while following an installation. */
export const NORMAL_INTERVAL_MS = 5 * 60_000;
export const INSTALL_INTERVAL_MS = 2_000;
/** A status older than this is asked again when the window regains focus or the network returns. */
export const STALE_MS = 60_000;
/** How long the install request may take (the app waits up to 10 s for the update service). */
export const INSTALL_TIMEOUT_MS = 15_000;
/** How long a check or a channel switch may take (the app waits up to 35 s). */
export const POST_TIMEOUT_MS = 45_000;
/** The page reloads this long after the new version answered. */
export const RELOAD_DELAY_MS = 1_500;
/** How often the snapshot's `now` moves, for relative times. */
const TICK_MS = 30_000;

type LastResult = NonNullable<UpdaterStatus["last"]>;

/** A message for the person: the app shows it as a toast. */
export type Notice = { kind: "success" | "error"; title: string; description?: string };

export type UpdatesControllerOptions = {
  transport: UpdatesTransport;
  /** The app's name in texts, e.g. "Meldgrove Handbook". */
  appName: string;
  /** The Compose project of a server installation, for `journalctl -u meldgrove-updater-<project>`. */
  project: string;
  locale?: Locale;
  /** Where a tab keeps its followed installation; default: sessionStorage under `meldgrove.updates.<project>`. */
  storage?: InstallStorage;
  /** Shows a message (toast). */
  notify?: (notice: Notice) => void;
  /** Reloads the page once the new version answers. */
  reload?: () => void;
  /** The clock (epoch ms); for tests. */
  now?: () => number;
};

/** Everything the button and the settings show, as of one moment. */
export type UpdatesSnapshot = {
  /** The latest status; undefined until the first answer. */
  response: UpdatesResponse | undefined;
  status: UpdaterStatus | null;
  /** The installation this tab follows. */
  pending: PendingInstall | null;
  /** The failed result of an installation this tab followed, shown until the next one. */
  recent: LastResult | null;
  /** A check runs (here or in the updater). */
  checking: boolean;
  state: ButtonState;
  /** What the popover shows. */
  shown: Exclude<ButtonState, "checking">;
  /** A click opens the popover (else it checks). */
  panel: boolean;
  open: boolean;
  /** The app or its update service does not answer while following an installation. */
  restarting: boolean;
  /** The followed installation takes longer than expected (Stop waiting). */
  slow: boolean;
  /** This page follows an installation and reloads when it is done. */
  waiting: boolean;
  /** 401, 403 or a sign-in page stopped every automatic status request of the page. */
  stopped: boolean;
  /** A channel switch runs. */
  savingChannel: boolean;
  /** Epoch ms of this snapshot, for times that pass without new data. */
  now: number;
};

/** An answer without status, for a page whose first status request failed (the button stays). */
function noStatus(error: string | null): UpdatesResponse {
  return { app: { version: null }, reachable: false, updater: null, error };
}

/** The version the app runs: its own, else what the updater considers installed. */
export function runningVersion(response: UpdatesResponse | undefined): string | null {
  return response?.app.version ?? response?.updater?.installed ?? null;
}

/** The message of a route's answer that is not a status: its `error`, else the status code. */
function answerError(answer: UpdatesAnswer): string {
  const parsed = parseUpdatesResponse(answer.data);
  if (parsed?.error) return parsed.error;
  const data = answer.data as { error?: unknown; message?: unknown } | null;
  if (typeof data?.error === "string") return data.error;
  if (typeof data?.error === "object" && data.error !== null) {
    const message = (data.error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  if (typeof data?.message === "string") return data.message;
  return `Request failed (${answer.status})`;
}

const isSignedOutStatus = (status: number) => status === 401 || status === 403;

/**
 * The update button's behaviour for one page, free of React: asks the app's
 * update routes for the status (on start, every 5 minutes, on focus at most
 * once a minute; every 2 seconds while following an installation), checks and
 * installs on request, follows an installation through the restart, reloads
 * the page when the new version answers, and stops every automatic request
 * once the session ended. Never checks by itself. The React components and
 * the standalone element render its snapshot.
 */
export class UpdatesController {
  readonly appName: string;
  readonly project: string;
  locale: Locale;
  t: Translate<(typeof messages)["en"]>;

  private readonly transport: UpdatesTransport;
  private readonly storage: InstallStorage;
  private readonly notifyFn: (notice: Notice) => void;
  private readonly reloadFn: () => void;
  private readonly clock: () => number;
  private readonly pageStart: number;
  private readonly listeners = new Set<() => void>();

  private response: UpdatesResponse | undefined;
  /** When the latest status request ended, and whether it failed (no status, or not reachable). */
  private lastPoll: { at: number; failed: boolean; error: string | null } | null = null;
  private pending: PendingInstall | null;
  private ignored: Ignored | null;
  private recent: LastResult | null = null;
  private checkRunning = false;
  private savingChannel = false;
  private open = false;
  private stopped = false;
  private reloading = false;
  private statusRunning = false;
  private lastStatusAt = 0;

  private started = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private slowTimer: ReturnType<typeof setTimeout> | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private snapshot: UpdatesSnapshot;

  constructor(options: UpdatesControllerOptions) {
    this.transport = options.transport;
    this.appName = options.appName;
    this.project = options.project;
    this.locale = options.locale ?? "en";
    this.t = translate(messages, this.locale);
    this.storage = options.storage ?? installStorage(`meldgrove.updates.${options.project}`);
    this.notifyFn = options.notify ?? (() => undefined);
    this.reloadFn = options.reload ?? (() => window.location.reload());
    this.clock = options.now ?? Date.now;
    this.pageStart = this.clock();
    this.pending = this.storage.loadPending();
    this.ignored = this.storage.loadIgnored();
    this.snapshot = this.compute();
  }

  // --- Subscription -------------------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): UpdatesSnapshot => this.snapshot;

  private emit() {
    this.snapshot = this.compute();
    for (const listener of this.listeners) listener();
  }

  private compute(): UpdatesSnapshot {
    const now = this.clock();
    const pending = this.pending;
    // A failed first status request keeps the button ("No update service"; a click checks).
    const response =
      this.response ?? (this.lastPoll?.failed && !this.stopped ? noStatus(this.lastPoll.error) : undefined);
    const status = response?.updater ?? null;
    const checking = this.checkRunning || Boolean(status?.checking);
    const state = buttonState(response, { checking, pending, recent: this.recent });
    const shown = panelState(response, pending, this.recent);
    const panel = hasPanel(shown, response, pending);
    if (!panel) this.open = false;
    const restarting =
      pending !== null &&
      this.lastPoll !== null &&
      this.lastPoll.at >= pending.startedAt &&
      this.lastPoll.failed;
    return {
      response,
      status,
      pending,
      recent: this.recent,
      checking,
      state,
      shown,
      panel,
      open: this.open && panel,
      restarting,
      slow: pending !== null && installOutcome(pending, undefined, now) === "slow",
      waiting: pending !== null && !this.stopped,
      stopped: this.stopped,
      savingChannel: this.savingChannel,
      now,
    };
  }

  // --- Lifecycle ----------------------------------------------------------------------------

  /** The language of the texts the controller writes (notices). */
  setLocale(locale: Locale) {
    if (locale === this.locale) return;
    this.locale = locale;
    this.t = translate(messages, locale);
    this.emit();
  }

  /** Starts asking for the status; idempotent. Arms the deadline of a restored attempt first. */
  start() {
    if (this.started) return;
    this.started = true;
    this.armTimers();
    window.addEventListener("focus", this.onFocus);
    window.addEventListener("online", this.onFocus);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.tickTimer = setInterval(() => this.emit(), TICK_MS);
    void this.fetchStatus();
  }

  /** Stops every timer and listener (also a pending reload); `start` resumes. */
  dispose() {
    this.started = false;
    window.removeEventListener("focus", this.onFocus);
    window.removeEventListener("online", this.onFocus);
    document.removeEventListener("visibilitychange", this.onVisibility);
    for (const timer of [this.pollTimer, this.deadlineTimer, this.slowTimer, this.reloadTimer]) {
      if (timer !== null) clearTimeout(timer);
    }
    if (this.tickTimer !== null) clearInterval(this.tickTimer);
    this.pollTimer = this.deadlineTimer = this.slowTimer = this.reloadTimer = this.tickTimer = null;
  }

  private onFocus = () => {
    if (this.pending || this.clock() - this.lastStatusAt < STALE_MS) return;
    void this.fetchStatus();
  };

  private onVisibility = () => {
    if (document.visibilityState === "visible") this.onFocus();
  };

  private notify(notice: Notice) {
    this.notifyFn(notice);
  }

  // --- Timers -------------------------------------------------------------------------------

  /** The next status request: every 2 s while following (also in the background), else every 5 min. */
  private schedule() {
    if (this.pollTimer !== null) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    if (!this.started || this.stopped) return;
    const following = this.pending !== null;
    this.pollTimer = setTimeout(
      () => {
        this.pollTimer = null;
        if (!following && document.visibilityState === "hidden") return this.schedule();
        void this.fetchStatus();
      },
      following ? INSTALL_INTERVAL_MS : NORMAL_INTERVAL_MS,
    );
  }

  /**
   * An unconfirmed attempt ends at its deadline on a timer of its own, whatever
   * the status requests do (failing, stalled, or paused while offline); not
   * while the page is signed out (kept for a later page load). A followed
   * installation turns slow after 15 minutes on another.
   */
  private armTimers() {
    if (this.deadlineTimer !== null) clearTimeout(this.deadlineTimer);
    if (this.slowTimer !== null) clearTimeout(this.slowTimer);
    this.deadlineTimer = this.slowTimer = null;
    const pending = this.pending;
    if (!this.started || !pending) return;
    const deadline = reconcileDeadline(pending, this.pageStart);
    if (deadline !== null && !this.stopped) {
      this.deadlineTimer = setTimeout(
        () => {
          this.deadlineTimer = null;
          const current = this.pending;
          if (!current || reconcileDeadline(current, this.pageStart) !== deadline) return;
          this.setPending(null);
          const end = unconfirmedEnd(current);
          this.notify({ kind: "error", title: this.t(end.message), description: end.detail ?? undefined });
        },
        Math.max(0, deadline - this.clock()),
      );
    }
    const slowAt = pending.startedAt + SLOW_AFTER_MS + 1;
    if (slowAt > this.clock()) {
      this.slowTimer = setTimeout(() => {
        this.slowTimer = null;
        this.emit();
      }, slowAt - this.clock());
    }
  }

  private setPending(next: PendingInstall | null) {
    const changed = next !== this.pending;
    this.pending = next;
    if (!changed) return;
    this.storage.savePending(next);
    this.armTimers();
    this.schedule();
    this.emit();
  }

  /** 401, 403 or a sign-in page: no automatic request on this page any more; a followed installation stays stored. */
  private signOut() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.pollTimer !== null) clearTimeout(this.pollTimer);
    if (this.deadlineTimer !== null) clearTimeout(this.deadlineTimer);
    this.pollTimer = this.deadlineTimer = null;
    this.emit();
  }

  // --- Requests -----------------------------------------------------------------------------

  /** Runs one request with a timeout of its own; a timeout throws an Error with the "did not answer" text. */
  private async send(action: UpdatesAction, body: unknown, timeoutMs: number): Promise<UpdatesAnswer> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      return await this.transport.request({ action, body, signal: controller.signal });
    } catch (error) {
      if (timedOut) throw new Error(this.t("noAnswer", { app: this.appName }), { cause: error });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Asks for the status; each request at most until the deadline of an unconfirmed attempt. */
  async fetchStatus(): Promise<void> {
    if (this.stopped || this.statusRunning) return;
    this.statusRunning = true;
    const sentAt = this.clock();
    const timeout = statusTimeout(reconcileDeadline(this.pending, this.pageStart), sentAt);
    try {
      const answer = await this.send("status", undefined, timeout);
      if (isSignedOutStatus(answer.status)) return this.signOut();
      const parsed = parseUpdatesResponse(answer.data);
      if (answer.status !== 200 || !parsed) throw new Error(answerError(answer));
      this.lastStatusAt = this.clock();
      this.receive(parsed, sentAt);
    } catch (error) {
      if (error instanceof SignedOutError) return this.signOut();
      this.pollFailed(errorMessage(error));
    } finally {
      this.statusRunning = false;
      if (this.pollTimer === null) this.schedule();
    }
  }

  /** A status request failed (network error, timeout, 5xx): while following, an observed outage. */
  private pollFailed(error: string) {
    const at = this.clock();
    this.lastPoll = { at, failed: true, error };
    const pending = this.pending;
    if (pending && at >= pending.startedAt) {
      const next = noteOutage(pending, error);
      if (next !== pending) return this.setPending(next);
    }
    this.emit();
  }

  /** A new status, from a status request (sent at `sentAt`) or from the answer of a POST. */
  private receive(response: UpdatesResponse, sentAt: number) {
    this.response = response;
    this.lastPoll = { at: this.clock(), failed: !response.updater, error: response.error };
    this.follow(response, sentAt);
    this.emit();
  }

  /** Confirms this tab's attempt, adopts a reported installation, and ends it once its result is known. */
  private follow(response: UpdatesResponse, sentAt: number) {
    if (this.reloading) return;
    const now = this.clock();
    const pending = this.pending;
    const followed = followStatus(pending, response, now, this.ignored, sentAt);
    if (!followed) return;
    const result = installOutcome(followed, response, now);
    if (result === "done") {
      this.reloading = true;
      this.setPending(null);
      this.notify({ kind: "success", title: this.t("updated", { version: followed.version }) });
      this.reloadTimer = setTimeout(() => this.reloadFn(), RELOAD_DELAY_MS);
    } else if (result === "failed") {
      this.recent = response.updater?.last ?? null;
      this.open = true;
      this.setPending(null);
    } else if (followed !== pending) {
      this.setPending(followed);
    }
  }

  /** A POST to `check` or `channel`: a status into the snapshot, or an Error with the route's reason. */
  private async post(action: "check" | "channel", body: unknown): Promise<UpdatesResponse> {
    const sentAt = this.clock();
    let answer: UpdatesAnswer;
    try {
      answer = await this.send(action, body, POST_TIMEOUT_MS);
    } catch (error) {
      if (error instanceof SignedOutError) this.signOut();
      throw error;
    }
    if (isSignedOutStatus(answer.status)) this.signOut();
    const parsed = parseUpdatesResponse(answer.data);
    if (answer.status >= 200 && answer.status < 300 && parsed) {
      this.receive(parsed, sentAt);
      return parsed;
    }
    // A refusal carries the latest status.
    if (answer.status === 409 && parsed) this.receive(parsed, sentAt);
    throw new Error(answerError(answer));
  }

  // --- Actions ------------------------------------------------------------------------------

  /** Opens or closes the popover; opening without anything to show checks instead. */
  setOpen = (next: boolean) => {
    const snapshot = this.snapshot;
    if (!next) {
      this.open = false;
    } else if (snapshot.panel) {
      this.open = true;
    } else {
      if (snapshot.state === "current" || snapshot.state === "off" || snapshot.state === "unreachable") {
        void this.check();
      }
      return;
    }
    this.emit();
  };

  /** Checks for new versions (only ever on request) and says what it found. */
  check = async (): Promise<void> => {
    if (this.checkRunning) return;
    this.checkRunning = true;
    this.emit();
    try {
      const result = await this.post("check", {});
      const next = panelState(result, null);
      if (next === "available" || next === "attention" || next === "failed" || next === "installing") {
        this.open = true;
      } else if (result.updater?.error) {
        this.notify({ kind: "error", title: this.t("checkFailed", { error: result.updater.error }) });
      } else if (next === "current") {
        const version = runningVersion(result);
        this.notify({
          kind: "success",
          title: version ? this.t("upToDateVersion", { version }) : this.t("upToDate"),
        });
      } else if (next === "unreachable") {
        this.notify({ kind: "error", title: result.error ?? this.t("unreachable") });
      }
    } catch (error) {
      this.notify({ kind: "error", title: errorMessage(error) });
    } finally {
      this.checkRunning = false;
      this.emit();
    }
  };

  /**
   * Installs `update` (the person confirmed it). The attempt is remembered
   * before the request, so that a restart before its answer keeps following it.
   */
  install = async (update: Update): Promise<void> => {
    this.recent = null;
    const attempt = startAttempt(update.version, this.response, this.clock());
    this.open = true;
    this.setPending(attempt);
    const sentAt = this.clock();
    const { answer, response } = await this.requestInstall(update.version);
    const current = this.pending;
    // A status may have settled it meanwhile (or another installation took its place).
    if (current?.version !== attempt.version || current.startedAt !== attempt.startedAt) {
      if (response) this.receive(response, sentAt);
      return;
    }
    const next = answerInstall(current, answer, this.clock());
    this.setPending(next.pending);
    if (next.error) this.notify({ kind: "error", title: next.error });
    if (response) this.receive(response, sentAt);
  };

  /**
   * The answer to the install request, never an exception: accepted (202, also
   * when its body cannot be read), refused (4xx; a 409 with the latest status),
   * or unclear (no update service, a network error, a timeout, an unreadable
   * answer, a sign-in page, or a 5xx): the installation may have started.
   */
  private async requestInstall(
    version: string,
  ): Promise<{ answer: InstallAnswer; response: UpdatesResponse | null }> {
    let answer: UpdatesAnswer;
    try {
      answer = await this.send("install", { version }, INSTALL_TIMEOUT_MS);
    } catch (error) {
      if (error instanceof SignedOutError) this.signOut();
      return { answer: { kind: "unclear", error: errorMessage(error) }, response: null };
    }
    const parsed = parseUpdatesResponse(answer.data);
    const response = parsed?.updater ? parsed : null;
    if (answer.status === 202) return { answer: { kind: "accepted", response }, response };
    if (answer.status >= 400 && answer.status < 500) {
      if (isSignedOutStatus(answer.status)) this.signOut();
      return { answer: { kind: "refused", error: answerError(answer), response }, response };
    }
    return {
      answer: { kind: "unclear", error: parsed?.error ?? answerError(answer) },
      response: answer.status === 200 ? parsed : null,
    };
  }

  /** Leaves the followed installation alone, by the identity stored on it, also while no status is there. */
  stopWaiting = () => {
    const pending = this.pending;
    if (pending) {
      this.ignored = ignoreInstall(pending);
      this.storage.saveIgnored(this.ignored);
    }
    this.setPending(null);
  };

  /** Switches the channel; true when the update service answered with the new channel. */
  setChannel = async (channel: UpdateChannel): Promise<boolean> => {
    this.savingChannel = true;
    this.emit();
    try {
      const result = await this.post("channel", { channel });
      return result.reachable && result.updater?.channel === channel;
    } finally {
      this.savingChannel = false;
      this.emit();
    }
  };
}
