import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UIProvider, type Locale } from "../lib/i18n.tsx";
import { visibleCrumbs, type Crumb } from "../frame/crumbs.tsx";
import { shortcutClashes } from "../frame/keyboard.ts";
import { activeHref } from "../frame/nav.ts";
import { AppFrame, type AppFrameProps, type FrameLink, type NavGroup } from "./app-frame.tsx";
import { KeyboardShortcutsCard } from "./settings-cards.tsx";

const Link: FrameLink = ({ href, ...props }) => <a href={href} {...props} />;

const nav: NavGroup[] = [
  {
    items: [
      { label: "Overview", href: "/", shortcut: "o" },
      { label: "Requests", href: "/requests", shortcut: "r", badge: 12 },
      { label: "My requests", href: "/mine", shortcut: "m" },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Admin", href: "/admin" },
      { label: "Forms", href: "/admin/forms" },
    ],
  },
];

function renderFrame(props: Partial<AppFrameProps> = {}, locale: Locale = "en") {
  const navigate = vi.fn();
  const onSignOut = vi.fn();
  const onThemeChange = vi.fn();
  render(
    <UIProvider locale={locale}>
      <AppFrame
        app={{ name: "Helpdesk", icon: <svg />, description: "Green Valley" }}
        nav={nav}
        pathname="/"
        link={Link}
        navigate={navigate}
        user={{ name: "Jane Doe", email: "jane@example.org", detail: "Admin" }}
        theme="system"
        onThemeChange={onThemeChange}
        settingsHref="/settings"
        onSignOut={onSignOut}
        {...props}
      >
        {props.children ?? <input aria-label="Title" />}
      </AppFrame>
    </UIProvider>,
  );
  return { navigate, onSignOut, onThemeChange };
}

const overview = () => screen.queryByRole("dialog", { name: "Keyboard shortcuts" });

beforeEach(() => {
  localStorage.clear();
  // The sidebar keeps its state in a cookie; every test starts open.
  document.cookie = "sidebar_state=; max-age=0; path=/";
});
afterEach(() => vi.restoreAllMocks());

describe("activeHref", () => {
  const items = nav.flatMap((group) => group.items);
  it('marks "/" only on itself and sections also on their sub-pages', () => {
    expect(activeHref("/", items)).toBe("/");
    expect(activeHref("/requests/REQ-1/history", items)).toBe("/requests");
    expect(activeHref("/requests-old", items)).toBeUndefined();
  });
  it("prefers the longest match", () => {
    expect(activeHref("/admin/forms/1", items)).toBe("/admin/forms");
    expect(activeHref("/admin/teams", items)).toBe("/admin");
  });
  it("counts the item's extra paths, with their sub-pages", () => {
    const timeline = [
      { label: "Timeline", href: "/", match: ["/e"] },
      { label: "Stats", href: "/stats" },
    ];
    expect(activeHref("/e/LB-12/history", timeline)).toBe("/");
    expect(activeHref("/stats", timeline)).toBe("/stats");
    expect(activeHref("/elsewhere", timeline)).toBeUndefined();
  });
  it("keeps exact items to themselves", () => {
    expect(activeHref("/admin/x", [{ label: "Admin", href: "/admin", exact: true }])).toBeUndefined();
  });
});

describe("visibleCrumbs", () => {
  const crumbs: Crumb[] = [{ label: "A", href: "/a" }, { label: "B", href: "/b" }, { label: "C" }];
  it("shows up to three steps as they are", () => {
    expect(visibleCrumbs(crumbs)).toEqual(crumbs);
  });
  it("keeps the first step and the last two of deeper paths", () => {
    const deep = [{ label: "Root", href: "/" }, ...crumbs];
    expect(visibleCrumbs(deep)).toEqual([deep[0], "more", deep[2], deep[3]]);
  });
});

describe("shortcutClashes", () => {
  it("finds letters that open more than one page, in any case", () => {
    const clashes = shortcutClashes([
      { label: "Teams", shortcut: "t" },
      { label: "Tags", shortcut: "T" },
      { label: "Timeline" },
    ]);
    expect([...clashes]).toEqual([["t", ["Teams", "Tags"]]]);
  });
});

describe("AppFrame", () => {
  it("shows the navigation as text, with the current page marked", () => {
    renderFrame({ pathname: "/requests/REQ-1" });
    const main = screen.getByRole("navigation", { name: "Main" });
    expect(within(main).getByRole("link", { name: "Requests" })).toHaveAttribute("aria-current", "page");
    expect(within(main).getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    expect(within(main).getByText("12")).toBeInTheDocument();
    expect(main.querySelector("svg")).toBeNull();
  });

  it("shows at most three breadcrumbs, the current page as text", () => {
    renderFrame({
      breadcrumbs: [
        { label: "Admin", href: "/admin" },
        { label: "Forms", href: "/admin/forms" },
        { label: "IT request", href: "/admin/forms/it" },
        { label: "History" },
      ],
    });
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumbs" });
    expect(within(crumbs).getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
    expect(within(crumbs).queryByRole("link", { name: "Forms" })).toBeNull();
    expect(within(crumbs).getByRole("link", { name: "IT request" })).toBeInTheDocument();
    expect(within(crumbs).getByText("History")).toHaveAttribute("aria-current", "page");
  });

  it("opens a page with G then its letter", async () => {
    const user = userEvent.setup();
    const { navigate } = renderFrame();
    await user.keyboard("g");
    expect(screen.getByRole("status")).toHaveTextContent("Go to");
    await user.keyboard("r");
    expect(navigate).toHaveBeenCalledWith("/requests");
    await user.keyboard("gx");
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("ignores letters typed in a field", async () => {
    const user = userEvent.setup();
    const { navigate } = renderFrame();
    await user.click(screen.getByRole("textbox", { name: "Title" }));
    await user.keyboard("gr/");
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the overview with Ctrl+/, not with ? alone", async () => {
    const user = userEvent.setup();
    renderFrame();
    await user.keyboard("?");
    expect(overview()).toBeNull();
    await user.keyboard("{Control>}/{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(dialog).getByText("My requests")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings");
  });

  it("turns single-letter shortcuts off, but keeps Ctrl+/ and Ctrl+K", async () => {
    const user = userEvent.setup();
    const { navigate } = renderFrame({ shortcuts: false });
    await user.keyboard("gr/");
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.keyboard("{Control>}/{/Control}");
    expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toHaveTextContent(
      "Shortcuts with single letters are off.",
    );
    await user.keyboard("{Escape}{Control>}k{/Control}");
    expect(await screen.findByRole("dialog", { name: "Search Helpdesk…" })).toBeInTheDocument();
  });

  it("follows the person's choice from the settings card", async () => {
    const user = userEvent.setup();
    const { navigate } = renderFrame({ children: <KeyboardShortcutsCard /> });
    await user.click(screen.getByRole("switch"));
    await user.keyboard("gr");
    expect(navigate).not.toHaveBeenCalled();
    expect(localStorage.getItem("meldgrove.shortcuts")).toBe("off");
  });

  it("searches the pages and the app's records", async () => {
    const user = userEvent.setup();
    const find = vi.fn(async (query: string) => [
      { href: "/requests/REQ-142", title: `Laptop (${query})`, reference: "REQ-142", kind: "Request" },
    ]);
    const { navigate } = renderFrame({ search: { find, allResultsHref: (q) => `/requests?q=${q}` } });
    await user.keyboard("/");
    const dialog = await screen.findByRole("dialog", { name: "Search Helpdesk…" });
    await user.keyboard("req");
    expect(within(dialog).getByRole("option", { name: /My requests/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole("option", { name: /Overview/ })).toBeNull();
    await user.click(await within(dialog).findByRole("option", { name: /Laptop \(req\)/ }));
    expect(find).toHaveBeenCalledWith("req", expect.any(AbortSignal));
    expect(navigate).toHaveBeenCalledWith("/requests/REQ-142");
  });

  it("warns about letters that open more than one page", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderFrame({
      nav: [
        {
          items: [
            { label: "Teams", href: "/teams", shortcut: "t" },
            { label: "Tags", href: "/tags", shortcut: "t" },
          ],
        },
      ],
    });
    expect(error).toHaveBeenCalledWith(expect.stringContaining('"G then T" is set for Teams, Tags'));
  });

  it("offers the shortcuts and sign-out in the user menu", async () => {
    const user = userEvent.setup();
    const { onSignOut } = renderFrame();
    await user.click(screen.getByRole("button", { name: /^Jane Doe/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Keyboard shortcuts/ }));
    expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(overview()).toBeNull());
    await user.click(screen.getByRole("button", { name: /^Jane Doe/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalled();
  });

  it("follows a changed href with G, not the first one", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const frame = (href: string) => (
      <AppFrame
        app={{ name: "Handbook", icon: <svg /> }}
        nav={[{ items: [{ label: "Space", href, shortcut: "s" }] }]}
        pathname="/"
        link={Link}
        navigate={navigate}
        user={{ name: "Jane Doe" }}
        theme="system"
        onThemeChange={() => undefined}
        onSignOut={() => undefined}
      >
        <p>Page</p>
      </AppFrame>
    );
    const { rerender } = render(frame("/s/old"));
    rerender(frame("/s/new"));
    await user.keyboard("gs");
    expect(navigate).toHaveBeenCalledWith("/s/new");
  });

  it("tells items apart whose label and href only together look alike", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const frame = (label: string, href: string) => (
      <AppFrame
        app={{ name: "Handbook", icon: <svg /> }}
        nav={[{ items: [{ label, href, shortcut: "s" }] }]}
        pathname="/"
        link={Link}
        navigate={navigate}
        user={{ name: "Jane Doe" }}
        theme="system"
        onThemeChange={() => undefined}
        onSignOut={() => undefined}
      >
        <p>Page</p>
      </AppFrame>
    );
    const { rerender } = render(frame("Space", "/docs:/archive"));
    rerender(frame("Space:/docs", "/archive"));
    await user.keyboard("gs");
    expect(navigate).toHaveBeenCalledWith("/archive");
  });

  it("never shows an answer to a search that was replaced", async () => {
    const user = userEvent.setup();
    const answers: ((results: { href: string; title: string }[]) => void)[] = [];
    // A find that ignores the signal and answers only when the test says so.
    const find = vi.fn(
      () => new Promise<{ href: string; title: string }[]>((resolve) => answers.push(resolve)),
    );
    renderFrame({ search: { find } });
    await user.keyboard("{Control>}k{/Control}");
    // "la", then "lap", then "la" again: the first answer to "la" is outdated by then.
    await user.keyboard("la");
    await waitFor(() => expect(find).toHaveBeenCalledTimes(1));
    await user.keyboard("p");
    await waitFor(() => expect(find).toHaveBeenCalledTimes(2));
    await user.keyboard("{Backspace}");
    await waitFor(() => expect(find).toHaveBeenCalledTimes(3));
    answers[0]!([{ href: "/old", title: "Outdated answer" }]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("option", { name: /Outdated answer/ })).toBeNull();
    answers[2]!([{ href: "/new", title: "Current answer" }]);
    expect(await screen.findByRole("option", { name: /Current answer/ })).toBeInTheDocument();
  });

  it("leaves Ctrl+B to an editor that handles it", async () => {
    const user = userEvent.setup();
    renderFrame({
      children: (
        <div
          contentEditable
          suppressContentEditableWarning
          aria-label="Editor"
          role="textbox"
          onKeyDown={(event) => {
            if (event.ctrlKey && event.key === "b") event.preventDefault();
          }}
        >
          Text
        </div>
      ),
    });
    const sidebar = () => document.querySelector("[data-slot=sidebar]");
    await user.click(screen.getByRole("textbox", { name: "Editor" }));
    await user.keyboard("{Control>}b{/Control}");
    expect(sidebar()).toHaveAttribute("data-state", "expanded");
    await user.click(screen.getByRole("button", { name: "Show or hide the sidebar" }));
    expect(sidebar()).toHaveAttribute("data-state", "collapsed");
  });

  it("keeps a hidden sidebar out of the tab order", async () => {
    const user = userEvent.setup();
    renderFrame();
    const main = () => screen.getByRole("navigation", { name: "Main" }).closest("[inert]");
    expect(main()).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show or hide the sidebar" }));
    expect(main()).not.toBeNull();
  });

  it("gives focus back after the search and the shortcuts close", async () => {
    const user = userEvent.setup();
    renderFrame();
    const searchButton = screen.getByRole("button", { name: /Search/ });
    await user.click(searchButton);
    await screen.findByRole("dialog", { name: "Search Helpdesk…" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(searchButton).toHaveFocus());

    const field = screen.getByRole("textbox", { name: "Title" });
    await user.click(field);
    await user.keyboard("{Control>}/{/Control}");
    await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(field).toHaveFocus());

    // Nothing had focus: the page gets it.
    field.blur();
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog", { name: "Search Helpdesk…" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
  });

  it("names the account button by what it shows", () => {
    renderFrame();
    // Visible text is the accessible name (WCAG 2.5.3); the initials are decoration.
    expect(screen.getByRole("button", { name: /^Jane Doe\s*jane@example\.org$/ })).toBeInTheDocument();
  });

  it("marks only the last breadcrumb as the current page", () => {
    renderFrame({ breadcrumbs: [{ label: "Administration" }, { label: "Status" }] });
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumbs" });
    expect(within(crumbs).getByText("Administration")).not.toHaveAttribute("aria-current");
    expect(within(crumbs).getByText("Status")).toHaveAttribute("aria-current", "page");
  });

  it("tells pages with the same label apart in the search", async () => {
    const user = userEvent.setup();
    renderFrame({
      nav: [
        { label: "Find", items: [{ label: "People", href: "/people" }] },
        { label: "Administration", items: [{ label: "People", href: "/admin/people" }] },
      ],
    });
    await user.keyboard("{Control>}k{/Control}");
    await user.keyboard("peo");
    const dialog = await screen.findByRole("dialog", { name: "Search Helpdesk…" });
    expect(within(dialog).getByRole("option", { name: /People\s*Find/ })).toBeInTheDocument();
    expect(within(dialog).getByRole("option", { name: /People\s*Administration/ })).toBeInTheDocument();
  });

  it("speaks German in its dialogs too", async () => {
    const user = userEvent.setup();
    renderFrame({}, "de");
    await user.keyboard("{Control>}/{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Tastenkürzel" });
    expect(within(dialog).getByRole("button", { name: "Schließen" })).toBeInTheDocument();
  });

  it("speaks German", () => {
    renderFrame({}, "de");
    expect(screen.getByText("Zum Inhalt springen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Suchen/ })).toHaveTextContent("Strg K");
  });
});
