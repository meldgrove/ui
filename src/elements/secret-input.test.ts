import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "./secret-input.ts";

function page(html: string) {
  document.body.innerHTML = html;
}

describe("<meldgrove-secret-input>", () => {
  it("hides the field until the eye button shows it, and keeps it in the form", async () => {
    const user = userEvent.setup();
    page(`<form><label for="id_token">Token</label>
      <meldgrove-secret-input><input type="password" name="token" id="id_token" value="s3cret"></meldgrove-secret-input>
    </form>`);
    const input = screen.getByLabelText("Token");
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(input).toHaveAttribute("type", "text");
    const button = screen.getByRole("button", { name: "Hide" });
    expect(button).toHaveAttribute("aria-controls", "id_token");
    expect(button).toHaveAttribute("type", "button");

    await user.click(button);
    expect(input).toHaveAttribute("type", "password");
    expect(new FormData(document.querySelector("form")!).get("token")).toBe("s3cret");
  });

  it("hides a field that the markup left visible, and speaks German", () => {
    page(
      `<meldgrove-secret-input locale="de"><input type="text" aria-label="Schlüssel"></meldgrove-secret-input>`,
    );
    const input = screen.getByLabelText("Schlüssel");
    expect(input).toHaveAttribute("type", "password");
    expect(input.id).not.toBe("");
    expect(screen.getByRole("button", { name: "Anzeigen" })).toHaveAttribute("aria-controls", input.id);
  });

  it("adds one button only when the element moves", () => {
    page(
      `<div id="a"><meldgrove-secret-input><input type="password" aria-label="Key"></meldgrove-secret-input></div><div id="b"></div>`,
    );
    const element = document.querySelector("meldgrove-secret-input")!;
    document.getElementById("b")!.append(element);
    expect(element.querySelectorAll("button")).toHaveLength(1);
  });
});
