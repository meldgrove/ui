"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";

/**
 * The package's texts in English and German. Apps pass their locale once
 * with `<UIProvider locale="de">`; without it, components speak English.
 *
 * Catalogs work like the apps' own: `{ members: "{count} members",
 * members_one: "1 member" }`, where `<key>_one` wins when `count` is 1.
 */
export type Locale = "en" | "de";
export const LOCALES: readonly Locale[] = ["en", "de"];

export type Catalog = Record<string, string>;
export type Messages<T extends Catalog> = { en: T; de: { [K in keyof T]: string } };
export type Params = Record<string, string | number>;
export type Translate<T extends Catalog> = (key: keyof T & string, params?: Params) => string;

export function defineMessages<T extends Catalog>(messages: Messages<T>): Messages<T> {
  return messages;
}

export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

export function translate<T extends Catalog>(messages: Messages<T>, locale: Locale): Translate<T> {
  const catalog = messages[locale] as Catalog;
  const english = messages.en as Catalog;
  return (key, params) => {
    const one = params !== undefined && Number(params.count) === 1 ? `${key}_one` : null;
    const template =
      (one ? (catalog[one] ?? english[one]) : undefined) ?? catalog[key] ?? english[key] ?? key;
    return interpolate(template, params);
  };
}

const LocaleContext = createContext<Locale>("en");

/** Sets the language of every component of the package below it. */
export function UIProvider(props: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={props.locale}>{props.children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** The translate function for a catalog in the current locale. */
export function useT<T extends Catalog>(messages: Messages<T>): Translate<T> {
  const locale = useLocale();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(translate(messages, locale), [messages, locale]);
}

/** Words the package's components share. */
export const common = defineMessages({
  en: {
    cancel: "Cancel",
    confirm: "Confirm",
    back: "Back",
    next: "Next",
    loading: "Loading…",
    retry: "Retry",
    copy: "Copy",
    copied: "Copied",
    error: "Something went wrong",
    page: "Page {page} of {pages}",
    total: "{count} entries",
    total_one: "1 entry",
  },
  de: {
    cancel: "Abbrechen",
    confirm: "Bestätigen",
    back: "Zurück",
    next: "Weiter",
    loading: "Wird geladen…",
    retry: "Erneut versuchen",
    copy: "Kopieren",
    copied: "Kopiert",
    error: "Etwas ist schiefgelaufen",
    page: "Seite {page} von {pages}",
    total: "{count} Einträge",
    total_one: "1 Eintrag",
  },
});

/** The message of an error of any kind. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}
