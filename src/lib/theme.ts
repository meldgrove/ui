"use client";

import { useSyncExternalStore } from "react";

/**
 * The theme a page shows: "dark" while <html> has the class `dark` (the class
 * every Meldgrove app's theme switch sets), else "light". Follows changes.
 */
export function useDocumentTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, snapshot, () => "light");
}

function snapshot(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
