import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { FakeBroadcastChannel } from "./updates.ts";

// jsdom lacks these browser APIs that Radix components use.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => undefined;
// The sidebar asks whether the screen is narrow; jsdom has no media queries.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }) as MediaQueryList;
// jsdom has no BroadcastChannel; Node's would reach the pages of other test files.
globalThis.BroadcastChannel = FakeBroadcastChannel as unknown as typeof BroadcastChannel;

afterEach(() => {
  cleanup();
  FakeBroadcastChannel.open.clear();
});
