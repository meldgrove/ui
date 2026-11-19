import { afterEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeTransport, ok, release, response, status } from "../test/updates.ts";
import { UIProvider, type Locale } from "../lib/i18n.tsx";
import { TooltipProvider } from "../components/tooltip.tsx";
import { UpdatesController, type Notice } from "./controller.ts";
import { UpdatesContextProvider } from "./react.tsx";
import { installStorage } from "./state.ts";
import { UpdateButton } from "./update-button.tsx";
import { UpdatesSettingsCard } from "./updates-settings.tsx";

const controllers: UpdatesController[] = [];

function renderWith(
  transport: ReturnType<typeof fakeTransport>,
  locale: Locale = "en",
  children = <UpdateButton />,
) {
  sessionStorage.clear();
  const notices: Notice[] = [];
  const controller = new UpdatesController({
    transport,
    appName: "Meldgrove Example",
    project: "example",
    locale,
    storage: installStorage("test.button"),
    notify: (notice) => notices.push(notice),
    reload: () => undefined,
  });
  controllers.push(controller);
  controller.start();
  render(
    <UIProvider locale={locale}>
      <UpdatesContextProvider controller={controller} guideUrl="https://example.org/guide">
        <TooltipProvider>{children}</TooltipProvider>
      </UpdatesContextProvider>
    </UIProvider>,
  );
  return { controller, notices };
}

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
});

describe("UpdateButton", () => {
  it("offers an available update with its notes and installs it after confirmation", async () => {
    const user = userEvent.setup();
    const current = response(status({ available: release("0.2.1") }));
    const transport = fakeTransport({ status: () => ok(current), install: () => ok(current, 202) });
    renderWith(transport);
    const button = await screen.findByRole("button", { name: "Update available · 0.2.1" });
    expect(button).toHaveAttribute("data-update-state", "available");
    await user.click(button);
    expect(await screen.findByText("Faster search")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Release notes/ })).toHaveAttribute(
      "href",
      "https://github.com/meldgrove/example/releases/tag/v0.2.1",
    );
    expect(screen.getByText("Installed: 0.2.0 · Stable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Install now" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Install 0.2.1 now?");
    expect(dialog).toHaveTextContent("Meldgrove Example restarts and is unavailable for a moment.");
    await user.click(screen.getByRole("button", { name: "Install" }));
    await waitFor(() => expect(transport.count("install")).toBe(1));
    expect(transport.requests.at(-1)).toMatchObject({ action: "install", body: { version: "0.2.1" } });
    expect(await screen.findByText("Installing 0.2.1…")).toBeInTheDocument();
  });

  it("asks before a release with upgrade steps and names the release notes", async () => {
    const user = userEvent.setup();
    const transport = fakeTransport({ status: () => ok(response(status({ attention: release("0.3.0") }))) });
    renderWith(transport);
    await user.click(await screen.findByRole("button", { name: "0.3.0 needs upgrade steps" }));
    await user.click(await screen.findByRole("button", { name: "Install anyway…" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Install 0.3.0 without its upgrade steps?",
    );
  });

  it("shows a failure with its message and Try again", async () => {
    const user = userEvent.setup();
    const transport = fakeTransport({
      status: () =>
        ok(
          response(
            status({
              available: release("0.2.1", { failed: "web did not become healthy" }),
              last: {
                version: "0.2.1",
                result: "rolled-back",
                message: "web did not become healthy",
                finishedAt: "2026-11-19T09:00:00Z",
              },
            }),
          ),
        ),
    });
    renderWith(transport);
    await user.click(await screen.findByRole("button", { name: "Update to 0.2.1 failed" }));
    expect(await screen.findByText("web did not become healthy")).toBeInTheDocument();
    expect(screen.getByText("0.2.0 is still running.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("says when nothing can install from here (mode off)", async () => {
    const user = userEvent.setup();
    const transport = fakeTransport({
      status: () => ok(response(status({ mode: "off", automatic: false, available: release("0.2.1") }))),
    });
    renderWith(transport);
    await user.click(await screen.findByRole("button", { name: "Update available · 0.2.1" }));
    expect(await screen.findByRole("link", { name: "deployment guide" })).toHaveAttribute(
      "href",
      "https://example.org/guide",
    );
    expect(screen.queryByRole("button", { name: "Install now" })).not.toBeInTheDocument();
  });

  it("checks on click when up to date", async () => {
    const user = userEvent.setup();
    const transport = fakeTransport({
      status: () => ok(response(status())),
      check: () => ok(response(status())),
    });
    const { notices } = renderWith(transport);
    await user.click(await screen.findByRole("button", { name: "Up to date · 0.2.0" }));
    await waitFor(() => expect(notices).toEqual([{ kind: "success", title: "Up to date · 0.2.0" }]));
  });

  it("names a preview's changes, not its release notes, and says links open a new tab", async () => {
    const user = userEvent.setup();
    const preview = release("0.2.1-preview.3", { preview: true });
    const transport = fakeTransport({
      status: () => ok(response(status({ channel: "preview", available: preview }))),
    });
    renderWith(transport);
    await user.click(await screen.findByRole("button", { name: "Update available · 0.2.1-preview.3" }));
    expect(await screen.findByRole("link", { name: "Changes (opens in a new tab)" })).toBeInTheDocument();
  });

  it("keeps the reason of an unmarked failure in the offer after a reload", async () => {
    const user = userEvent.setup();
    const transport = fakeTransport({
      status: () =>
        ok(
          response(
            status({
              available: release("0.2.1"),
              last: {
                version: "0.2.1",
                result: "failed",
                message: "The deploy link answered 502.",
                finishedAt: "2026-11-19T09:00:00Z",
              },
            }),
          ),
        ),
    });
    renderWith(transport);
    await user.click(await screen.findByRole("button", { name: "Update available · 0.2.1" }));
    expect(await screen.findByText("0.2.1 failed: The deploy link answered 502.")).toBeInTheDocument();
  });

  it("speaks German", async () => {
    const user = userEvent.setup();
    const transport = fakeTransport({ status: () => ok(response(status({ available: release("0.2.1") }))) });
    renderWith(transport, "de");
    await user.click(await screen.findByRole("button", { name: "Update verfügbar · 0.2.1" }));
    expect(await screen.findByRole("button", { name: "Jetzt installieren" })).toBeInTheDocument();
    expect(screen.getByText("Installiert: 0.2.0 · Stabil")).toBeInTheDocument();
  });
});

describe("UpdatesSettingsCard", () => {
  it("shows the version, the channel and when updates install, and saves a channel", async () => {
    const user = userEvent.setup();
    const transport = fakeTransport({
      status: () => ok(response(status({ window: "02:00-05:00" }))),
      channel: () => ok(response(status({ channel: "preview" }))),
    });
    renderWith(transport, "en", <UpdatesSettingsCard />);
    expect(
      await screen.findByText(
        "On: releases install automatically after 3 days, between 02:00 and 05:00 (UTC).",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("New versions of Meldgrove Example and how they install.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Preview" }));
    await user.click(screen.getByRole("button", { name: "Save channel" }));
    await waitFor(() => expect(transport.count("channel")).toBe(1));
    expect(await screen.findByText("Preview", { selector: "dd" })).toBeInTheDocument();
  });

  it("disables the channel while the platform locks it, and says why", async () => {
    const transport = fakeTransport({
      status: () => ok(response(status({ mode: "platform", channelLocked: "The image tag `0.2` decides." }))),
    });
    renderWith(transport, "en", <UpdatesSettingsCard />);
    expect(await screen.findByText("The image tag `0.2` decides.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Preview" })).toBeDisabled();
    expect(screen.getByText("The platform installs them (deploy link).")).toBeInTheDocument();
  });

  it("explains an unreachable update service once, with the guide", async () => {
    const transport = fakeTransport({ status: () => ok(response(null)) });
    renderWith(transport, "en", <UpdatesSettingsCard />);
    expect(await screen.findAllByText("The update service is not reachable.")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "deployment guide" })).toHaveAttribute(
      "href",
      "https://example.org/guide",
    );
    expect(screen.queryByRole("radio", { checked: true })).not.toBeInTheDocument();
  });

  it("shows the last check and the updater, and checks on request", async () => {
    const user = userEvent.setup();
    const transport = fakeTransport({
      status: () => ok(response(status())),
      check: () => ok(response(status())),
    });
    renderWith(transport, "en", <UpdatesSettingsCard />);
    expect(await screen.findByText("· Updater 0.2.0")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Updates" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check now" }));
    await waitFor(() => expect(transport.count("check")).toBe(1));
  });

  it("asks to sign in again when the routes refuse before any status", async () => {
    const transport = fakeTransport({ status: () => ok({ error: "Not found." }, 404) });
    renderWith(transport, "en", <UpdatesSettingsCard />);
    expect(await screen.findByText("Sign in again as an admin to manage updates.")).toBeInTheDocument();
  });
});
