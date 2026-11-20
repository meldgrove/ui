"use client";

import { useId } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "./button.tsx";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card.tsx";
import { Label } from "./label.tsx";
import { RadioGroup, RadioGroupItem } from "./radio-group.tsx";
import { Switch } from "./switch.tsx";
import { defineMessages, useT } from "../lib/i18n.tsx";
import { THEME_PREFERENCES, type ThemePreference } from "../lib/theme.ts";
import { useShortcutsPreference } from "../frame/shortcuts.tsx";

const messages = defineMessages({
  en: {
    appearance: "Appearance",
    appearanceDescription: "Light, dark, or as your device is set.",
    light: "Light",
    dark: "Dark",
    system: "Device setting",
    shortcuts: "Keyboard shortcuts",
    shortcutsDescription: "Ctrl / shows every shortcut. Ctrl K and Ctrl / always work.",
    singleKeys: "Shortcuts with single letters: G then a letter, and /",
    about: "About",
    aboutText: "{app} is part of Meldgrove: open-source apps for nonprofits and small teams.",
    onGitHub: "Meldgrove on GitHub",
  },
  de: {
    appearance: "Darstellung",
    appearanceDescription: "Hell, dunkel oder wie dein Gerät eingestellt ist.",
    light: "Hell",
    dark: "Dunkel",
    system: "Wie das Gerät",
    shortcuts: "Tastenkürzel",
    shortcutsDescription: "Strg / zeigt alle Tastenkürzel. Strg K und Strg / gelten immer.",
    singleKeys: "Tastenkürzel mit einzelnen Buchstaben: G und dann ein Buchstabe, und /",
    about: "Über",
    aboutText:
      "{app} gehört zu Meldgrove: Open-Source-Apps für gemeinnützige Organisationen und kleine Teams.",
    onGitHub: "Meldgrove auf GitHub",
  },
});

/** "Appearance" for the person's settings page: the same choice as in the user menu. */
export function AppearanceCard(props: {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
}) {
  const t = useT(messages);
  const id = useId();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("appearance")}</CardTitle>
        <CardDescription>{t("appearanceDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={props.value}
          onValueChange={(value) => props.onChange(value as ThemePreference)}
          aria-label={t("appearance")}
          className="gap-3"
        >
          {THEME_PREFERENCES.map((option) => (
            <div key={option} className="flex items-center gap-2">
              <RadioGroupItem value={option} id={`${id}-${option}`} />
              <Label htmlFor={`${id}-${option}`} className="font-normal">
                {t(option)}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}

/**
 * Turns shortcuts with single letters on and off (WCAG 2.1.4). Without
 * props, the choice is kept in this browser and the frame follows it.
 */
export function KeyboardShortcutsCard(props: {
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
}) {
  const t = useT(messages);
  const id = useId();
  const [saved, setSaved] = useShortcutsPreference();
  const enabled = props.enabled ?? saved;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("shortcuts")}</CardTitle>
        <CardDescription>{t("shortcutsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <Label htmlFor={id} className="font-normal">
          {t("singleKeys")}
        </Label>
        <Switch id={id} checked={enabled} onCheckedChange={props.onEnabledChange ?? setSaved} />
      </CardContent>
    </Card>
  );
}

/** "About" for the settings page: the app is part of Meldgrove, with a link to its repository. */
export function AboutCard(props: { appName: string; repositoryUrl: string }) {
  const t = useT(messages);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("about")}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        {t("aboutText", { app: props.appName })}
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm" asChild>
          <a href={props.repositoryUrl} target="_blank" rel="noreferrer">
            {t("onGitHub")}
            <ArrowUpRight />
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
}
