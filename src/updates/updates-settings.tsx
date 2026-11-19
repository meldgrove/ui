"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "../components/alert.tsx";
import { Badge } from "../components/badge.tsx";
import { Button } from "../components/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/card.tsx";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "../components/field.tsx";
import { RadioGroup, RadioGroupItem } from "../components/radio-group.tsx";
import { Spinner } from "../components/spinner.tsx";
import { LoadingState } from "../components/states.tsx";
import { errorMessage, type Translate } from "../lib/i18n.tsx";
import type { messages } from "./messages.ts";
import { useUpdatesController, useUpdatesSnapshot } from "./react.tsx";
import { cooldownParts, windowParts } from "./state.ts";
import type { UpdateChannel, UpdaterStatus } from "./types.ts";

type T = Translate<(typeof messages)["en"]>;

function cooldownText(t: T, cooldown: string | null) {
  const parts = cooldownParts(cooldown);
  return parts ? t(parts.unit, { count: parts.count }) : null;
}

/** When updates install by themselves on this server. */
export function automaticText(t: T, status: UpdaterStatus): string {
  if (status.mode === "off" || !status.automatic) return t("autoOff");
  if (status.mode === "platform") return t("autoPlatform");
  const window = windowParts(status.window);
  const range = window ? { ...window, timezone: status.timezone } : null;
  const cooldown = status.channel === "stable" ? cooldownText(t, status.cooldown) : null;
  if (cooldown) {
    return range ? t("autoReleasesWindow", { cooldown, ...range }) : t("autoReleases", { cooldown });
  }
  return range ? t("autoNextCheckWindow", range) : t("autoNextCheck");
}

/**
 * The "Updates" settings: the installed version, the update channel and when
 * updates install automatically. Content only; `UpdatesSettingsCard` puts it
 * in a card. Needs `UpdatesProvider` above it.
 */
export function UpdatesSettings() {
  const controller = useUpdatesController();
  const snapshot = useUpdatesSnapshot();
  const t = controller.t;
  const id = useId();
  const [choice, setChoice] = useState<UpdateChannel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { response, status } = snapshot;
  const current = status?.channel ?? "stable";
  const selected = choice ?? current;
  const locked = status?.channelLocked ?? null;
  const disabled = !status || locked !== null || snapshot.savingChannel;
  const cooldown = cooldownText(t, status?.cooldown ?? null);

  if (!response) return <LoadingState />;

  const submit = async () => {
    if (!choice || choice === current) return;
    setError(null);
    try {
      // Saved only when the update service answered with the chosen channel; else keep the choice.
      const saved = await controller.setChannel(choice);
      const latest = controller.getSnapshot().response;
      if (!latest?.reachable || !latest.updater) return setError(latest?.error ?? t("unreachable"));
      if (!saved) return setError(t("channelNotSaved"));
      setChoice(null);
      toast.success(t("channelSaved"));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const option = (value: UpdateChannel, label: string, description: string) => (
    <Field orientation="horizontal" className="items-start" data-disabled={disabled || undefined}>
      <RadioGroupItem value={value} id={`${id}-${value}`} className="mt-0.5" />
      <FieldContent>
        <FieldLabel htmlFor={`${id}-${value}`}>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
    </Field>
  );

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted-foreground">{t("installedVersion")}</dt>
        <dd className="flex flex-wrap items-center gap-2 font-medium">
          {response.app.version ?? t("development")}
          {status?.available ? (
            <Badge variant="secondary">
              {t("available")} · {status.available.version}
            </Badge>
          ) : status?.attention ? (
            <Badge variant="outline">{t("attention", { version: status.attention.version })}</Badge>
          ) : null}
        </dd>
        {status ? (
          <>
            <dt className="text-muted-foreground">{t("channel")}</dt>
            <dd className="font-medium">{t(status.channel)}</dd>
            <dt className="text-muted-foreground">{t("automatic")}</dt>
            <dd>{automaticText(t, status)}</dd>
          </>
        ) : null}
      </dl>

      {!response.reachable || !status ? (
        <Alert>
          <AlertDescription>
            <p>{t("sectionUnreachable")}</p>
            {response.error ? <p className="text-muted-foreground break-words">{response.error}</p> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <FieldSet disabled={disabled}>
        <FieldLegend variant="label">{t("channel")}</FieldLegend>
        <RadioGroup
          value={selected}
          disabled={disabled}
          onValueChange={(value) => {
            setError(null);
            setChoice(value as UpdateChannel);
          }}
        >
          {option(
            "stable",
            `${t("stable")} (${t("recommended")})`,
            cooldown ? t("stableText", { cooldown }) : t("stableTextNoCooldown"),
          )}
          {option("preview", t("preview"), t("previewText"))}
        </RadioGroup>
        {locked ? <FieldDescription className="text-foreground">{locked}</FieldDescription> : null}
        <FieldDescription>{t("switchBack")}</FieldDescription>
      </FieldSet>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {error ? (
          <span role="alert" className="text-destructive mr-auto text-sm break-words">
            {error}
          </span>
        ) : null}
        <Button
          type="button"
          disabled={disabled || choice === null || choice === current}
          onClick={() => void submit()}
        >
          {snapshot.savingChannel ? <Spinner /> : null}
          {t("saveChannel")}
        </Button>
      </div>
    </div>
  );
}

/** `UpdatesSettings` in a card with the title "Updates". */
export function UpdatesSettingsCard({ className }: { className?: string }) {
  const controller = useUpdatesController();
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{controller.t("updates")}</CardTitle>
        <CardDescription>{controller.t("sectionText", { app: controller.appName })}</CardDescription>
      </CardHeader>
      <CardContent>
        <UpdatesSettings />
      </CardContent>
    </Card>
  );
}
