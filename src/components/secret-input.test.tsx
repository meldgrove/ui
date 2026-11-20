import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UIProvider } from "../lib/i18n.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog.tsx";
import { SecretInput } from "./secret-input.tsx";
import { initialSecret, SecretField } from "./secret-field.tsx";

describe("SecretInput", () => {
  it("hides the value until the eye button shows it", async () => {
    const user = userEvent.setup();
    render(
      <>
        <label htmlFor="key">API key</label>
        <SecretInput id="key" defaultValue="sk-123" />
      </>,
    );
    const input = screen.getByLabelText("API key");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveValue("sk-123");

    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide" })).toHaveAttribute("aria-controls", "key");

    await user.click(screen.getByRole("button", { name: "Hide" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("copies a hidden value without showing it", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<SecretInput aria-label="Token" value="tok-456" readOnly copyable />);

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("tok-456");
    expect(screen.getByLabelText("Token")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("leaves a hidden read-only secret out of the tab order, so a dialog does not select it", async () => {
    const user = userEvent.setup();
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Copy your token now</DialogTitle>
          <DialogDescription>Shown once.</DialogDescription>
          <SecretInput aria-label="Token" value="tok-456" readOnly copyable />
        </DialogContent>
      </Dialog>,
    );
    const input = screen.getByLabelText("Token");
    expect(input).toHaveAttribute("tabindex", "-1");
    expect(input).not.toHaveFocus();
    expect(screen.getByRole("button", { name: "Show" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(input).not.toHaveAttribute("tabindex");
  });

  it("copies what an uncontrolled field holds", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<SecretInput aria-label="Key" defaultValue="key-789" copyable />);

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("key-789");
  });

  it("speaks German below a German UIProvider", () => {
    render(
      <UIProvider locale="de">
        <SecretInput aria-label="Passwort" />
      </UIProvider>,
    );
    expect(screen.getByRole("button", { name: "Anzeigen" })).toBeInTheDocument();
  });
});

describe("SecretField", () => {
  it("hides a new value and offers the eye button", async () => {
    const user = userEvent.setup();
    function Form() {
      const [value, setValue] = useState(initialSecret(false));
      return <SecretField id="token" label="Bot token" stored={false} value={value} onChange={setValue} />;
    }
    render(<Form />);
    const input = screen.getByLabelText("Bot token");
    await user.type(input, "xoxb-1");
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("xoxb-1");
  });
});
