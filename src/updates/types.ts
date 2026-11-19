/**
 * What an app's update routes answer: the status of the Meldgrove Updater
 * (the `updater` service of the app's compose.yaml), passed on to the app's
 * admins. The contract is the updater's README
 * (https://github.com/meldgrove/updater#the-apps-update-button).
 */

export const UPDATE_CHANNELS = ["stable", "preview"] as const;
export type UpdateChannel = (typeof UPDATE_CHANNELS)[number];

/** A release (`0.2.1`), a preview (`0.2.1-preview.3`) or an image without version (`sha256:<12 hex>`). */
export const UPDATE_VERSION_PATTERN = /^(?:[0-9]+\.[0-9]+\.[0-9]+(?:-preview\.[0-9]+)?|sha256:[0-9a-f]{12})$/;

export type Update = {
  version: string;
  preview: boolean;
  publishedAt: string | null;
  /** Release notes, or the compare view of a preview. */
  url: string | null;
  /** Change titles, newest release first, at most 15. */
  notes: string[];
  /** All changes, when more than `notes`. */
  changes: number;
  /** When it installs automatically; null: not automatically. */
  installsAt: string | null;
  /** Message of an earlier failed installation of this version. */
  failed: string | null;
};

export type InstallStage = "requested" | "pulling" | "starting" | "rolling-back" | "deploying";
export type InstallResult = "installed" | "failed" | "rolled-back" | "accepted";

export type UpdaterStatus = {
  /** Version of the updater, e.g. "0.2.0". */
  updater: string;
  mode: "host" | "platform" | "off";
  channel: UpdateChannel;
  /** Why admins cannot switch the channel; null: they can. */
  channelLocked: string | null;
  /** The installed version; null: unknown. */
  installed: string | null;
  available: Update | null;
  /** A release of a newer series that needs upgrade steps (Stable only). */
  attention: Update | null;
  installing: { version: string; startedAt: string; manual: boolean; stage: InstallStage } | null;
  last: { version: string; result: InstallResult; message: string | null; finishedAt: string } | null;
  checking: boolean;
  /** The last successful check. */
  checkedAt: string | null;
  /** The last check's error. */
  error: string | null;
  /** False when the updater installs nothing (mode off). */
  automatic: boolean;
  /** How long a release must be out before it installs, e.g. "3d"; null: no wait. */
  cooldown: string | null;
  /** Automatic installs only between these times of day, e.g. "02:00-05:00". */
  window: string | null;
  timezone: string;
};

export type UpdatesResponse = {
  /** The running app; `version` is null for images built from source and in development. */
  app: { version: string | null };
  /** False: no updater answers at UPDATER_URL, or UPDATER_URL is empty. */
  reachable: boolean;
  updater: UpdaterStatus | null;
  /** Why the updater refused or could not be reached. */
  error: string | null;
};

type Check = (value: unknown) => boolean;

const isString: Check = (value) => typeof value === "string";
const isBoolean: Check = (value) => typeof value === "boolean";
const isNumber: Check = (value) => typeof value === "number" && Number.isFinite(value);
const nullable =
  (check: Check): Check =>
  (value) =>
    value === null || check(value);
const oneOf =
  (...values: string[]): Check =>
  (value) =>
    typeof value === "string" && values.includes(value);
const object =
  (shape: Record<string, Check>): Check =>
  (value) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(shape).every(([key, check]) => check((value as Record<string, unknown>)[key]));

const isUpdate = object({
  version: isString,
  preview: isBoolean,
  publishedAt: nullable(isString),
  url: nullable(isString),
  notes: (value) => Array.isArray(value) && value.every(isString),
  changes: isNumber,
  installsAt: nullable(isString),
  failed: nullable(isString),
});

const isStatus = object({
  updater: isString,
  mode: oneOf("host", "platform", "off"),
  channel: oneOf(...UPDATE_CHANNELS),
  channelLocked: nullable(isString),
  installed: nullable(isString),
  available: nullable(isUpdate),
  attention: nullable(isUpdate),
  installing: nullable(
    object({
      version: isString,
      startedAt: isString,
      manual: isBoolean,
      stage: oneOf("requested", "pulling", "starting", "rolling-back", "deploying"),
    }),
  ),
  last: nullable(
    object({
      version: isString,
      result: oneOf("installed", "failed", "rolled-back", "accepted"),
      message: nullable(isString),
      finishedAt: isString,
    }),
  ),
  checking: isBoolean,
  checkedAt: nullable(isString),
  error: nullable(isString),
  automatic: isBoolean,
  cooldown: nullable(isString),
  window: nullable(isString),
  timezone: isString,
});

const isResponse = object({
  app: object({ version: nullable(isString) }),
  reachable: isBoolean,
  updater: nullable(isStatus),
  error: nullable(isString),
});

/** The answer of an update route when it has the expected shape; null otherwise. */
export function parseUpdatesResponse(data: unknown): UpdatesResponse | null {
  return isResponse(data) ? (data as UpdatesResponse) : null;
}
