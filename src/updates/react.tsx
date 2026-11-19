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
import { UpdatesController, type Notice, type UpdatesSnapshot } from "./controller.ts";
import { toastNotice } from "./notice.ts";
import { installStorage } from "./state.ts";
import { fetchTransport, type UpdatesTransport } from "./transport.ts";

type UpdatesContextValue = { controller: UpdatesController; guideUrl: string | null };

const UpdatesContext = createContext<UpdatesContextValue | null>(null);

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
  /** sessionStorage prefix; default `meldgrove.updates.<project>`. */
  storageKey?: string;
  /** Default: a toast (mount `Toaster` from `@meldgrove/ui/sonner`). */
  notify?: (notice: Notice) => void;
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
      storage: props.storageKey ? installStorage(props.storageKey) : undefined,
      notify: (notice) => (props.notify ?? toastNotice)(notice),
    });
  });
  useEffect(() => {
    controller.start();
    return () => controller.dispose();
  }, [controller]);
  useEffect(() => controller.setLocale(locale), [controller, locale]);
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
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
