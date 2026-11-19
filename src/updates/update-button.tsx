"use client";

import { useState, type ReactNode } from "react";
import { Download, ExternalLink, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/alert-dialog.tsx";
import { Badge } from "../components/badge.tsx";
import { Button } from "../components/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../components/popover.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/tooltip.tsx";
import { formatDateTime, formatRelative } from "../lib/format.ts";
import { common, translate } from "../lib/i18n.tsx";
import { cn } from "../lib/utils.ts";
import { runningVersion, type UpdatesController, type UpdatesSnapshot } from "./controller.ts";
import { useGuideUrl, useUpdatesController, useUpdatesSnapshot } from "./react.tsx";
import { canInstall, failureOf, noteSummary, replacedFailure, type ButtonState } from "./state.ts";
import type { Update } from "./types.ts";

type Props = { controller: UpdatesController; snapshot: UpdatesSnapshot };

function StateIcon({ state }: { state: ButtonState }) {
  switch (state) {
    case "checking":
      return <RefreshCw className="motion-safe:animate-spin" />;
    case "installing":
      return <LoaderCircle className="motion-safe:animate-spin" />;
    case "available":
    case "attention":
      return (
        <>
          <Download />
          <span
            aria-hidden
            className={cn(
              "ring-background absolute top-1 right-1 size-2 rounded-full ring-2",
              state === "available" ? "bg-primary" : "bg-warning",
            )}
          />
        </>
      );
    case "failed":
      return <TriangleAlert className="text-destructive" />;
    case "unreachable":
      return <RefreshCw className="text-muted-foreground opacity-60" />;
    default:
      return <RefreshCw className="text-muted-foreground" />;
  }
}

/** The release notes of a release, or the changes (compare view) of a preview. */
function ReleaseNotesLink({ controller, update }: { controller: UpdatesController; update: Update }) {
  if (!update.url) return null;
  return (
    <a
      href={update.url}
      target="_blank"
      rel="noreferrer"
      className="text-primary inline-flex w-fit items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
    >
      {controller.t(update.preview ? "changes" : "releaseNotes")}
      <ExternalLink className="size-3.5" aria-hidden />{" "}
      <span className="sr-only">{controller.t("opensInNewTab")}</span>
    </a>
  );
}

const STAGES = new Set(["pulling", "starting", "rolling-back", "deploying"]);

/** In mode off, in place of the install buttons: nothing can install from here. */
function OffNote({ controller }: { controller: UpdatesController }) {
  const guideUrl = useGuideUrl();
  const [before, after] = controller.t("offText").split("{guide}");
  return (
    <p className="text-muted-foreground text-sm">
      {before}
      {guideUrl ? (
        <a
          href={guideUrl}
          target="_blank"
          rel="noreferrer"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          {controller.t("deploymentGuide")}
        </a>
      ) : (
        controller.t("deploymentGuide")
      )}
      {after}
    </p>
  );
}

/** In place of "Install anyway…" where the platform's image tag decides: change the tag there. */
function LockedNote({ controller, version }: { controller: UpdatesController; version: string }) {
  return (
    <p className="text-muted-foreground text-sm">
      {controller.t("attentionLocked", { app: controller.appName, version })}
    </p>
  );
}

/** Version, age, preview badge and the change titles of an update. */
function UpdateSummary({ controller, snapshot, update }: Props & { update: Update }) {
  const { notes, more } = noteSummary(update);
  return (
    <>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        <span className="font-medium">{update.version}</span>
        {update.publishedAt ? (
          <span
            className="text-muted-foreground"
            title={formatDateTime(update.publishedAt, controller.dateLocale, controller.timeZone)}
          >
            · {formatRelative(update.publishedAt, controller.locale, snapshot.now)}
          </span>
        ) : null}
        {update.preview ? <Badge variant="secondary">{controller.t("preview")}</Badge> : null}
      </p>
      {notes.length > 0 ? (
        <ul className="grid list-disc gap-1 pl-4 text-sm">
          {notes.map((note, index) => (
            <li key={index} className="break-words">
              {note}
            </li>
          ))}
          {more > 0 ? (
            <li className="text-muted-foreground list-none">
              {controller.t("moreChanges", { n: more, count: more })}
            </li>
          ) : null}
        </ul>
      ) : null}
    </>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <h2 className="text-sm font-semibold break-words">{children}</h2>;
}

/** In a newer offer: the failure it took the place of. */
function ReplacedFailure({ controller, snapshot }: Props) {
  const failure = replacedFailure(snapshot.response, snapshot.recent);
  if (!failure) return null;
  return (
    <p className="text-destructive text-sm break-words">
      {failure.message
        ? controller.t("failedLine", { version: failure.version, message: failure.message })
        : controller.t("failed", { version: failure.version })}
    </p>
  );
}

type PanelProps = Props & { onInstall: (update: Update, anyway: boolean) => void };

/** The popover's content for the button's state, with the footer every state shares. */
function UpdatePanel(props: PanelProps) {
  const { controller, snapshot } = props;
  const t = controller.t;
  const { shown: state, status } = snapshot;
  const running = runningVersion(snapshot.response);
  const failure = failureOf(snapshot.response, snapshot.recent);
  const update = status?.available ?? status?.attention;
  // Mode off: the popover shows the update, but nothing can install from here.
  const installable = status?.mode !== "off";
  let body: ReactNode = null;

  // Only a followed installation shows without a status (the app restarts).
  if (state === "installing") {
    const version = snapshot.pending?.version ?? status?.installing?.version ?? "";
    const stage = status?.installing?.version === version ? status.installing.stage : null;
    body = (
      <>
        <Title>{t("installing", { version })}</Title>
        {snapshot.restarting ? (
          <p className="text-sm">{t("restarting")}</p>
        ) : stage && STAGES.has(stage) ? (
          <p className="text-sm">
            {t(`stage_${stage as "pulling"}`, { version: status?.installed ?? running ?? "" })}
          </p>
        ) : null}
        {snapshot.waiting ? (
          <p className="text-muted-foreground text-sm">{t("restarts", { app: controller.appName })}</p>
        ) : null}
        {snapshot.slow ? (
          <>
            <p role="alert" className="text-destructive text-sm break-words">
              {t("slow", { project: controller.project })}
            </p>
            <Button size="sm" variant="outline" className="w-full" onClick={controller.stopWaiting}>
              {t("stopWaiting")}
            </Button>
          </>
        ) : null}
      </>
    );
  } else if (!status) {
    // Every other state has a status (hasPanel).
  } else if (state === "failed" && failure) {
    const offer = failure.offer;
    body = (
      <>
        <Title>{t("failed", { version: failure.version })}</Title>
        {failure.message ? <p className="text-destructive text-sm break-words">{failure.message}</p> : null}
        {running ? (
          <p className="text-muted-foreground text-sm">{t("stillRunning", { version: running })}</p>
        ) : null}
        {!installable ? (
          <OffNote controller={controller} />
        ) : offer && canInstall(status, offer) ? (
          <Button
            size="sm"
            className="w-full"
            onClick={() => props.onInstall(offer, offer === status.attention)}
          >
            {t("tryAgain")}
          </Button>
        ) : offer ? (
          <LockedNote controller={controller} version={offer.version} />
        ) : null}
      </>
    );
  } else if (state === "available" && status.available) {
    const available = status.available;
    const installsAt = available.installsAt;
    body = (
      <>
        <Title>{t("available")}</Title>
        <UpdateSummary controller={controller} snapshot={snapshot} update={available} />
        <ReplacedFailure controller={controller} snapshot={snapshot} />
        <ReleaseNotesLink controller={controller} update={available} />
        {!installable ? (
          <OffNote controller={controller} />
        ) : (
          <>
            {installsAt ? (
              <p className="text-muted-foreground text-sm">
                {new Date(installsAt).getTime() > snapshot.now
                  ? t("installsOn", {
                      date: formatDateTime(installsAt, controller.dateLocale, controller.timeZone),
                    })
                  : t("installsNextCheck")}
              </p>
            ) : null}
            <Button size="sm" className="w-full" onClick={() => props.onInstall(available, false)}>
              {t("installNow")}
            </Button>
          </>
        )}
      </>
    );
  } else if (state === "attention" && status.attention) {
    const attention = status.attention;
    body = (
      <>
        <Title>{t("attention", { version: attention.version })}</Title>
        <p className="text-sm">{t("attentionText")}</p>
        <ReplacedFailure controller={controller} snapshot={snapshot} />
        <ReleaseNotesLink controller={controller} update={attention} />
        {!installable ? (
          <OffNote controller={controller} />
        ) : canInstall(status, attention) ? (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => props.onInstall(attention, true)}
          >
            {t("installAnyway")}
          </Button>
        ) : (
          <LockedNote controller={controller} version={attention.version} />
        )}
      </>
    );
  } else if (update) {
    body = <UpdateSummary controller={controller} snapshot={snapshot} update={update} />;
  }

  if (!status) return <div className="grid gap-3">{body}</div>;
  return (
    <div className="grid gap-3">
      {body}
      <div className={cn("text-muted-foreground grid gap-1 text-xs", body ? "border-t pt-3" : null)}>
        <p>{t("installedFooter", { version: running ?? t("development"), channel: t(status.channel) })}</p>
        <p className="flex flex-wrap items-center gap-x-2">
          <span aria-live="polite">
            {snapshot.checking
              ? t("checking")
              : status.checkedAt
                ? t("checked", {
                    time: formatRelative(status.checkedAt, controller.locale, snapshot.now),
                  })
                : t("notChecked")}
          </span>
          {state !== "installing" && !snapshot.checking ? (
            <Button
              variant="link"
              size="xs"
              className="h-auto p-0 text-xs"
              onClick={() => void controller.check()}
            >
              {t("checkNow")}
            </Button>
          ) : null}
        </p>
        {status.error ? (
          <p className="text-destructive break-words">{t("checkFailed", { error: status.error })}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Asks before an installation; for a release with upgrade steps, names its release notes. */
function ConfirmInstall(props: {
  controller: UpdatesController;
  target: { update: Update; anyway: boolean } | null;
  onCancel: () => void;
  onConfirm: (update: Update) => void;
}) {
  const { controller, target } = props;
  const t = controller.t;
  const c = translate(common, controller.locale);
  return (
    <AlertDialog open={target !== null} onOpenChange={(open) => (open ? undefined : props.onCancel())}>
      <AlertDialogContent>
        {target ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {target.anyway
                  ? t("confirmAnywayTitle", { version: target.update.version })
                  : t("confirmTitle", { version: target.update.version })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {target.anyway ? `${t("confirmAnywayText", { app: controller.appName })} ` : null}
                {t("confirmText", { app: controller.appName })}
              </AlertDialogDescription>
              {target.anyway ? <ReleaseNotesLink controller={controller} update={target.update} /> : null}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{c("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                variant={target.anyway ? "destructive" : "default"}
                onClick={() => props.onConfirm(target.update)}
              >
                {t("install")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The update button for the app's top bar (render it for admins only): shows
 * whether an update is available, checks on click, installs on request,
 * follows the installation through the restart and reloads the page when the
 * new version answers. Needs `UpdatesProvider` above it.
 */
export function UpdateButton({ className }: { className?: string }) {
  const controller = useUpdatesController();
  const snapshot = useUpdatesSnapshot();
  const [confirm, setConfirm] = useState<{ update: Update; anyway: boolean } | null>(null);
  const t = controller.t;
  const { state, status } = snapshot;
  const running = runningVersion(snapshot.response);
  const failure = failureOf(snapshot.response, snapshot.recent);
  const label: Record<ButtonState, string> = {
    loading: t("checkForUpdates"),
    // The route's reason when it has one (the app answers, the update service does not).
    unreachable: snapshot.response?.error ?? t("unreachable"),
    installing: snapshot.restarting
      ? t("restarting")
      : t("installing", { version: snapshot.pending?.version ?? status?.installing?.version ?? "" }),
    checking: t("checking"),
    off: t("off"),
    failed: t("failed", { version: failure?.version ?? "" }),
    available: `${t("available")} · ${status?.available?.version ?? ""}`,
    attention: t("attention", { version: status?.attention?.version ?? "" }),
    current: running ? t("upToDateVersion", { version: running }) : t("upToDate"),
  };

  return (
    <TooltipProvider>
      <Popover open={snapshot.open} onOpenChange={controller.setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn("relative rounded-full", className)}
                aria-label={label[state]}
                data-update-state={state}
              >
                <StateIcon state={state} />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{label[state]}</TooltipContent>
        </Tooltip>
        <PopoverContent align="end" className="w-[min(20rem,calc(100vw-1.5rem))]">
          {snapshot.panel ? (
            <UpdatePanel
              controller={controller}
              snapshot={snapshot}
              onInstall={(update, anyway) => {
                controller.setOpen(false);
                setConfirm({ update, anyway });
              }}
            />
          ) : null}
        </PopoverContent>
      </Popover>
      <ConfirmInstall
        controller={controller}
        target={confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={(update) => {
          setConfirm(null);
          void controller.install(update);
        }}
      />
    </TooltipProvider>
  );
}
