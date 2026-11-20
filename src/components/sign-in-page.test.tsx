import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignInPage } from "./sign-in-page.tsx";

describe("SignInPage", () => {
  it("says what the app is for on narrow screens too", () => {
    render(
      <SignInPage
        app={{ name: "Helpdesk", icon: <svg /> }}
        tagline="Send requests and follow them up."
        repositoryUrl="https://github.com/meldgrove/helpdesk"
      >
        <button type="button">Sign in</button>
      </SignInPage>,
    );
    // Once on the left side (wide screens), once above the sign-in (narrow screens).
    const taglines = screen.getAllByText("Send requests and follow them up.");
    expect(taglines).toHaveLength(2);
    expect(taglines.some((element) => element.closest(".lg\\:hidden"))).toBe(true);
  });
});
