import { useSyncExternalStore, type ComponentProps } from "react";
import type { FrameLink } from "../../src/components/app-frame.tsx";

/** The demo's pages live in the hash (#/requests/REQ-142), so it works as one file and in a frame. */
function readPath(): string {
  const path = window.location.hash.replace(/^#/, "");
  return path.startsWith("/") ? path : "/";
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, readPath);
}

export function navigate(to: string) {
  window.location.hash = to;
  window.scrollTo(0, 0);
}

/**
 * What an app passes to the frame as its link: here a hash link; in a real
 * app TanStack Router's or Next.js's Link behind a three-line adapter.
 */
export function Link({ to, onClick, ...props }: Omit<ComponentProps<"a">, "href"> & { to: string }) {
  return (
    <a
      href={`#${to}`}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) window.scrollTo(0, 0);
      }}
      {...props}
    />
  );
}

/** The frame's link for the hash router: what a real app writes for its router in three lines. */
export const HashLink: FrameLink = ({ href, onClick, ...props }) => (
  <a
    href={`#${href}`}
    onClick={(event) => {
      onClick?.(event);
      if (!event.defaultPrevented) window.scrollTo(0, 0);
    }}
    {...props}
  />
);

/** The rule every app uses today: "/" only on itself, sections also on their sub-pages. */
export function isActive(pathname: string, to: string): boolean {
  return to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
}
