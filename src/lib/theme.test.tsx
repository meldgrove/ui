import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useThemePreference } from "./theme.ts";

function Probe() {
  const [theme, setTheme] = useThemePreference();
  return (
    <>
      <output>{theme}</output>
      <button onClick={() => setTheme("dark")}>dark</button>
      <button onClick={() => setTheme("system")}>system</button>
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("useThemePreference", () => {
  it("follows the device until a person chooses, then keeps the choice in the browser", () => {
    render(<Probe />);
    expect(screen.getByRole("status")).toHaveTextContent("system");
    expect(document.documentElement).not.toHaveClass("dark");

    act(() => screen.getByRole("button", { name: "dark" }).click());
    expect(screen.getByRole("status")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("meldgrove.theme")).toBe("dark");

    act(() => screen.getByRole("button", { name: "system" }).click());
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem("meldgrove.theme")).toBeNull();
  });

  it("starts with a saved choice", () => {
    localStorage.setItem("meldgrove.theme", "dark");
    render(<Probe />);
    expect(screen.getByRole("status")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveClass("dark");
  });
});
