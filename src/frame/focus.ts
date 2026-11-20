"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Focus after a dialog closes. Radix gives it back only to a DialogTrigger;
 * the search and the shortcuts open by key or from a menu, so this keeps the
 * element that had focus when they opened and returns to it, or to the page
 * (`#main`) when it is gone (a phone sheet or a menu that closed).
 */
export function useReturnFocus(open: boolean): (event: Event) => void {
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);
  return (event) => {
    event.preventDefault();
    const target = opener.current?.isConnected ? opener.current : document.getElementById("main");
    target?.focus();
  };
}
