"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { translate, type Catalog, type Locale, type Messages, type Translate } from "./i18n-core.ts";

export * from "./i18n-core.ts";

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
