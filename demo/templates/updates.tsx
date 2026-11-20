import { useMemo, type ReactNode } from "react";
import { UpdatesController } from "../../src/updates/controller.ts";
import { toastNotice } from "../../src/updates/notice.ts";
import { UpdatesContextProvider } from "../../src/updates/react.tsx";
import { installStorage } from "../../src/updates/state.ts";
import type { UpdatesTransport } from "../../src/updates/transport.ts";
import type { UpdaterStatus, UpdatesResponse } from "../../src/updates/types.ts";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-20T10:00:00Z");

const base: UpdaterStatus = {
  updater: "0.2.0",
  mode: "host",
  channel: "stable",
  channelLocked: null,
  installed: "0.4.2",
  available: null,
  attention: null,
  installing: null,
  last: null,
  checking: false,
  checkedAt: new Date(NOW - 5 * 60_000).toISOString(),
  error: null,
  automatic: true,
  cooldown: "3d",
  window: "02:00-05:00",
  timezone: "Europe/Berlin",
};

function responses(repo: string): Record<string, UpdatesResponse> {
  return {
    current: { app: { version: "0.4.2" }, reachable: true, updater: base, error: null },
    available: {
      app: { version: "0.4.2" },
      reachable: true,
      updater: {
        ...base,
        available: {
          version: "0.5.0",
          preview: false,
          publishedAt: new Date(NOW - 2 * DAY).toISOString(),
          url: `${repo}/releases/tag/v0.5.0`,
          notes: [
            "Search from every page with Ctrl K or ⌘K",
            "Faster lists",
            "Fix the sign-in loop behind a proxy",
          ],
          changes: 9,
          installsAt: new Date(NOW + DAY).toISOString(),
          failed: null,
        },
      },
      error: null,
    },
    installing: {
      app: { version: "0.4.2" },
      reachable: true,
      updater: {
        ...base,
        installing: {
          version: "0.5.0",
          startedAt: new Date(NOW).toISOString(),
          manual: true,
          stage: "pulling",
        },
      },
      error: null,
    },
  };
}

/** The real update button, fed by a stand-in for the app's update routes. */
export function DemoUpdates(props: { state: string; appName: string; repo: string; children: ReactNode }) {
  const { state, appName, repo } = props;
  const controller = useMemo(() => {
    const answers = responses(repo);
    const transport: UpdatesTransport = {
      async request({ action }) {
        if (action === "install") return { status: 202, data: answers.installing! };
        return { status: 200, data: answers[state] ?? answers.current! };
      },
    };
    const instance = new UpdatesController({
      transport,
      appName,
      project: "demo",
      locale: "en",
      storage: installStorage(`templates.${appName}.${state}`),
      notify: toastNotice,
      reload: () => undefined,
    });
    instance.start();
    return instance;
  }, [state, appName, repo]);
  return (
    <UpdatesContextProvider
      controller={controller}
      guideUrl={`${repo}/blob/main/docs/deployment.md#automatic-updates`}
    >
      {props.children}
    </UpdatesContextProvider>
  );
}
