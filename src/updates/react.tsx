"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useLocale, type Locale } from "../lib/i18n.tsx";
import { UpdatesController, type Notice, type SignedOutReason, type UpdatesSnapshot } from "./controller.ts";
import { toastNotice } from "./notice.ts";
import { installStorage, type InstallStorage } from "./state.ts";
import { fetchTransport, type UpdatesTransport } from "./transport.ts";
import type { UpdatesResponse } from "./types.ts";

type UpdatesContextValue = { controller: UpdatesController; guideUrl: string | null };

const UpdatesContext = createContext<UpdatesContextValue | null>(null);

/**
 * Read once when the provider mounts: `project`, `url`, `transport`,
 * `storageKey`, `storage`, `initialResponse`. The others follow changes. In Next.js, functions (`transport`, `notify`, `onSignedOut`) need
 * the provider in a client component of the app.
 */
export type UpdatesProviderProps = {
  /** The app's name in texts, e.g. "Meldgrove Handbook". */
  appName: string;
  /** The Compose project of a server installation (the updater's systemd unit), e.g. "handbook". */
  project: string;
  /** The status route, e.g. "/api/admin/updates"; or pass `transport`. */
  url?: string;
  /** How to reach the routes when `fetch` with the page's session is not enough. */
  transport?: UpdatesTransport;
  /** Section "Automatic updates" of the app's deployment guide. */
  guideUrl?: string;
  /** Default: the locale of `UIProvider`. */
  locale?: Locale;
  /** Locale of full dates, e.g. "de-DE" for 19.11.2026; default "en-GB" for English, "de-DE" for German. Relative times follow `locale`. */
  dateLocale?: string;
  /** IANA time zone of dates, e.g. "Europe/Berlin"; default: the browser's. */
  timeZone?: string;
  /** sessionStorage prefix; default `meldgrove.updates.<project>`. */
  storageKey?: string;
  /** Where a tab keeps its followed installation, in place of `storageKey`. */
  storage?: InstallStorage;
  /** A status the server already has, shown before the browser's first request. */
  initialResponse?: UpdatesResponse;
  /** Default: a toast (mount `Toaster` from `@meldgrove/ui/sonner`). */
  notify?: (notice: Notice) => void;
  /** Called once when the routes stop answering: "signed-out" (401, sign-in page) or "forbidden" (403, 404). */
  onSignedOut?: (reason: SignedOutReason) => void;
  children: ReactNode;
};

/**
 * The update status of the page, shared by the update button and the
 * "Updates" settings. Render it for app admins only: everyone else gets 404
 * from the routes.
 */
export function UpdatesProvider(props: UpdatesProviderProps) {
  const contextLocale = useLocale();
  const locale = props.locale ?? contextLocale;
  const [controller] = useState(() => {
    const transport = props.transport ?? (props.url ? fetchTransport({ url: props.url }) : null);
    if (!transport) throw new Error("UpdatesProvider needs `url` or `transport`.");
    return new UpdatesController({
      transport,
      appName: props.appName,
      project: props.project,
      locale,
      dateLocale: props.dateLocale,
      timeZone: props.timeZone,
      storage: props.storage ?? (props.storageKey ? installStorage(props.storageKey) : undefined),
      initialResponse: props.initialResponse,
      notify: props.notify ?? toastNotice,
      onSignedOut: props.onSignedOut,
    });
  });
  useEffect(() => {
    controller.start();
    return () => controller.dispose();
  }, [controller]);
  useEffect(() => controller.setLocale(locale), [controller, locale]);
  useEffect(() => {
    controller.configure({
      appName: props.appName,
      notify: props.notify ?? toastNotice,
      onSignedOut: props.onSignedOut ?? null,
      dateLocale: props.dateLocale ?? null,
      timeZone: props.timeZone ?? null,
    });
  }, [controller, props.appName, props.notify, props.onSignedOut, props.dateLocale, props.timeZone]);
  return (
    <UpdatesContextProvider controller={controller} guideUrl={props.guideUrl ?? null}>
      {props.children}
    </UpdatesContextProvider>
  );
}

/** Provides a controller that something else created and starts (the standalone elements, tests). */
export function UpdatesContextProvider(props: {
  controller: UpdatesController;
  guideUrl: string | null;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ controller: props.controller, guideUrl: props.guideUrl }),
    [props.controller, props.guideUrl],
  );
  return <UpdatesContext.Provider value={value}>{props.children}</UpdatesContext.Provider>;
}

function useUpdatesContext(): UpdatesContextValue {
  const value = useContext(UpdatesContext);
  if (!value) throw new Error("Render the update button and settings inside UpdatesProvider.");
  return value;
}

export function useUpdatesController(): UpdatesController {
  return useUpdatesContext().controller;
}

export function useGuideUrl(): string | null {
  return useUpdatesContext().guideUrl;
}

/** The current snapshot of the page's update status; re-renders when it changes. */
export function useUpdatesSnapshot(): UpdatesSnapshot {
  const controller = useUpdatesController();
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
}
