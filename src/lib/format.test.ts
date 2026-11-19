import { describe, expect, it } from "vitest";
import { formatDateTime, formatRelative } from "./format.ts";

const at = Date.UTC(2026, 10, 19, 13, 5);

describe("formatDateTime", () => {
  it("writes the date in the locale and time zone", () => {
    expect(formatDateTime(at, "de-DE", "Europe/Berlin")).toBe("19.11.2026, 14:05");
    expect(formatDateTime(at, "en-GB", "UTC")).toBe("19 Nov 2026, 13:05");
  });

  it("falls back to the browser's time zone for an unknown one", () => {
    expect(formatDateTime(at, "en-GB", "Nowhere/Nothing")).toBe(formatDateTime(at, "en-GB"));
  });
});

describe("formatRelative", () => {
  it("writes the time in the language it is given", () => {
    expect(formatRelative(at - 2 * 3_600_000, "en", at)).toBe("2 hours ago");
    expect(formatRelative(at - 2 * 3_600_000, "de", at)).toBe("vor 2 Stunden");
  });
});
