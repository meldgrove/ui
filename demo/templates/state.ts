import { useSyncExternalStore } from "react";

/**
 * What the demo can switch. The frame is fixed (Simon's choice of
 * 20.11.2026); the dashboards are proposals, not in the package yet. The
 * query keeps the choice, the hash keeps the page: ?app=crm#/contacts
 */
export const OPTIONS = {
  app: {
    label: "App",
    choices: [
      { value: "helpdesk", label: "Helpdesk", hint: "Small app: two lists and an admin area." },
      { value: "crm", label: "CRM", hint: "Large app: many sections in groups." },
      { value: "logbook", label: "Logbook", hint: "Deepest navigation: entry, then its history." },
    ],
  },
  dash: {
    label: "Dashboard (not in the package yet)",
    choices: [
      { value: "overview", label: "D1 · Overview", hint: "Numbers first, then a chart and recent items." },
      {
        value: "work",
        label: "D2 · My work first",
        hint: "What waits for this person on top, numbers below.",
      },
      {
        value: "activity",
        label: "D3 · Activity",
        hint: "Recent changes as a feed, quick actions at the side.",
      },
    ],
  },
  update: {
    label: "Update icon (admins)",
    choices: [
      { value: "available", label: "Update available", hint: "" },
      { value: "current", label: "Up to date", hint: "" },
      { value: "none", label: "Not an admin", hint: "Everyone else sees no icon." },
    ],
  },
  theme: {
    label: "Appearance",
    choices: [
      { value: "system", label: "Device setting", hint: "" },
      { value: "light", label: "Light", hint: "" },
      { value: "dark", label: "Dark", hint: "" },
    ],
  },
} as const;

export type OptionKey = keyof typeof OPTIONS;
export type Choice<K extends OptionKey> = (typeof OPTIONS)[K]["choices"][number]["value"];
export type Variants = { [K in OptionKey]: Choice<K> } & { phone: boolean; embed: boolean; keys: boolean };

const DEFAULTS: Variants = {
  app: "helpdesk",
  dash: "overview",
  update: "available",
  theme: "system",
  phone: false,
  embed: false,
  keys: true,
};

const EVENT = "demo:variants";

function read(): string {
  return window.location.search;
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("popstate", onChange);
  };
}

let cache: { search: string; variants: Variants } | null = null;

function parse(search: string): Variants {
  if (cache?.search === search) return cache.variants;
  const params = new URLSearchParams(search);
  const variants = { ...DEFAULTS };
  for (const key of Object.keys(OPTIONS) as OptionKey[]) {
    const value = params.get(key);
    if (value && OPTIONS[key].choices.some((choice) => choice.value === value)) {
      (variants as Record<string, unknown>)[key] = value;
    }
  }
  variants.phone = params.get("phone") === "1";
  variants.embed = params.get("embed") === "1";
  // Single-letter shortcuts, a setting of the person (Settings page).
  variants.keys = params.get("keys") !== "0";
  cache = { search, variants };
  return variants;
}

export function useVariants(): Variants {
  return parse(useSyncExternalStore(subscribe, read));
}

/** The query for a set of variants, without the defaults. */
export function queryFor(variants: Variants, extra: Partial<Variants> = {}): string {
  const next = { ...variants, ...extra };
  const params = new URLSearchParams();
  for (const key of Object.keys(OPTIONS) as OptionKey[]) {
    if (next[key] !== DEFAULTS[key]) params.set(key, next[key]);
  }
  if (next.phone) params.set("phone", "1");
  if (next.embed) params.set("embed", "1");
  if (!next.keys) params.set("keys", "0");
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function setVariants(change: Partial<Variants>) {
  const next = queryFor(parse(read()), change);
  window.history.replaceState(null, "", `${window.location.pathname}${next}${window.location.hash}`);
  window.dispatchEvent(new Event(EVENT));
}

export function choiceOf<K extends OptionKey>(key: K, value: string) {
  return OPTIONS[key].choices.find((choice) => choice.value === value)!;
}
