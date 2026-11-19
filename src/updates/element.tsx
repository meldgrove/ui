/**
 * The update button and the "Updates" settings as custom elements, for apps
 * without React (the Django apps). The same components as in the React apps,
 * rendered into a shadow root with the package's styles:
 *
 *   <script type="module" src="…/meldgrove-updates.js"></script>
 *   <meldgrove-update-button url="/admin/updates/" app-name="Meldgrove IAM" project="iam"
 *     guide-url="…" locale="en" csrf-token="…"></meldgrove-update-button>
 *   <meldgrove-updates-settings url="/admin/updates/" …same attributes…></meldgrove-updates-settings>
 *
 * Elements with the same `url` share one status. Optional: `date-locale`
 * (e.g. de-DE), `storage-key` (sessionStorage prefix), and `plain` on the
 * settings for no card of their own. Without `csrf-token`, the
 * token comes from the cookie `csrf-cookie` (default `csrftoken`) and is sent
 * as `csrf-header` (default `X-CSRFToken`). `theme`: `class` (default; dark
 * while <html> has the class `dark`), `system` (the device's setting),
 * `light` or `dark`.
 */
import { StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "../components/sonner.tsx";
import { TooltipProvider } from "../components/tooltip.tsx";
import { UIProvider, type Locale } from "../lib/i18n.tsx";
import { PortalContainerProvider } from "../lib/portal.tsx";
import { UpdatesController } from "./controller.ts";
import { UpdatesContextProvider } from "./react.tsx";
import { fetchTransport, readCookie } from "./transport.ts";
import { UpdateButton } from "./update-button.tsx";
import { UpdatesSettings, UpdatesSettingsCard } from "./updates-settings.tsx";
import { installStorage } from "./state.ts";
import { toastNotice } from "./notice.ts";
import styles from "./element.css?inline";

type Shared = { controller: UpdatesController; elements: Set<HTMLElement> };
const controllers = new Map<string, Shared>();

let sheet: CSSStyleSheet | null = null;

/**
 * The package's styles for the shadow roots. Custom properties that Tailwind
 * registers with @property must be registered in the document: inside a
 * shadow root, @property has no effect, and shadows, rings and transforms
 * would lose their initial values.
 */
function styleSheet(): CSSStyleSheet {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(styles);
    const properties = Array.from(sheet.cssRules)
      .filter((rule) => typeof CSSPropertyRule !== "undefined" && rule instanceof CSSPropertyRule)
      .map((rule) => rule.cssText);
    if (properties.length > 0) {
      // A constructed sheet, not a <style>: pages with style-src 'self' allow it.
      const registrations = new CSSStyleSheet();
      registrations.replaceSync(properties.join("\n"));
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, registrations];
    }
  }
  return sheet;
}

function localeOf(element: HTMLElement): Locale {
  return element.getAttribute("locale") === "de" ? "de" : "en";
}

function controllerFor(element: HTMLElement): UpdatesController {
  const url = element.getAttribute("url");
  if (!url) throw new Error(`<${element.localName}> needs the attribute url.`);
  let shared = controllers.get(url);
  if (!shared) {
    const token = element.getAttribute("csrf-token");
    const cookie = element.getAttribute("csrf-cookie") ?? "csrftoken";
    const header = element.getAttribute("csrf-header") ?? "X-CSRFToken";
    const controller = new UpdatesController({
      transport: fetchTransport({
        url,
        headers: () => {
          const value = token ?? readCookie(cookie);
          return value ? { [header]: value } : {};
        },
      }),
      appName: element.getAttribute("app-name") ?? "Meldgrove",
      project: element.getAttribute("project") ?? "app",
      locale: localeOf(element),
      dateLocale: element.getAttribute("date-locale") ?? undefined,
      storage: element.getAttribute("storage-key")
        ? installStorage(element.getAttribute("storage-key")!)
        : undefined,
      notify: toastNotice,
    });
    shared = { controller, elements: new Set() };
    controllers.set(url, shared);
  }
  shared.elements.add(element);
  if (shared.elements.size === 1) shared.controller.start();
  return shared.controller;
}

function release(element: HTMLElement) {
  for (const [url, shared] of controllers) {
    if (!shared.elements.delete(element)) continue;
    if (shared.elements.size === 0) {
      shared.controller.dispose();
      controllers.delete(url);
    }
  }
}

/** Whether the element shows dark: by its `theme` attribute (see above). */
function isDark(element: HTMLElement): boolean {
  const theme = element.getAttribute("theme") ?? "class";
  if (theme === "dark") return true;
  if (theme === "light") return false;
  if (theme === "system") return window.matchMedia("(prefers-color-scheme: dark)").matches;
  return document.documentElement.classList.contains("dark");
}

/** A shadow root with the styles, a themed wrapper, and a container for popovers and dialogs. */
abstract class MeldgroveElement extends HTMLElement {
  private root: Root | null = null;
  private wrapper: HTMLDivElement | null = null;
  private observer: MutationObserver | null = null;
  private media: MediaQueryList | null = null;

  protected abstract content(): ReactNode;

  connectedCallback() {
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [styleSheet()];
    this.wrapper = document.createElement("div");
    this.wrapper.className = "meldgrove-root";
    const portal = document.createElement("div");
    shadow.replaceChildren(this.wrapper, portal);
    const controller = controllerFor(this);
    this.applyTheme(portal);
    this.observer = new MutationObserver(() => this.applyTheme(portal));
    this.observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    this.media = window.matchMedia("(prefers-color-scheme: dark)");
    this.media.addEventListener("change", this.onMedia);
    this.root = createRoot(this.wrapper);
    this.root.render(
      <StrictMode>
        <UIProvider locale={localeOf(this)}>
          <UpdatesContextProvider controller={controller} guideUrl={this.getAttribute("guide-url")}>
            <PortalContainerProvider container={portal}>
              <TooltipProvider>{this.content()}</TooltipProvider>
            </PortalContainerProvider>
          </UpdatesContextProvider>
        </UIProvider>
      </StrictMode>,
    );
    ensureToaster(this.getAttribute("theme") ?? "class");
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    this.media?.removeEventListener("change", this.onMedia);
    const root = this.root;
    this.root = null;
    // Unmount after the current render, as React asks.
    queueMicrotask(() => root?.unmount());
    release(this);
  }

  private onMedia = () => {
    const portal = this.shadowRoot?.lastElementChild;
    if (portal instanceof HTMLElement) this.applyTheme(portal);
  };

  private applyTheme(portal: HTMLElement) {
    const dark = isDark(this);
    for (const element of [this.wrapper, portal]) {
      element?.classList.toggle("dark", dark);
      element?.classList.add("meldgrove-root");
    }
  }
}

class UpdateButtonElement extends MeldgroveElement {
  protected content() {
    return <UpdateButton />;
  }
}

/** The settings in a card of their own; with the attribute `plain`, without the card (inside the app's section). */
class UpdatesSettingsElement extends MeldgroveElement {
  protected content() {
    return this.hasAttribute("plain") ? <UpdatesSettings /> : <UpdatesSettingsCard />;
  }
}

/** One toaster per page, in a shadow root of its own at the end of <body>, in the theme of the first element. */
function ensureToaster(theme: string) {
  if (document.querySelector("meldgrove-toaster")) return;
  const host = document.createElement("meldgrove-toaster");
  host.setAttribute("theme", theme);
  const shadow = host.attachShadow({ mode: "open" });
  shadow.adoptedStyleSheets = [styleSheet()];
  const wrapper = document.createElement("div");
  wrapper.className = "meldgrove-root";
  shadow.append(wrapper);
  document.body.append(host);
  const root = createRoot(wrapper);
  const sync = () => {
    const dark = isDark(host);
    wrapper.classList.toggle("dark", dark);
    root.render(<Toaster position="bottom-right" theme={dark ? "dark" : "light"} />);
  };
  sync();
  new MutationObserver(sync).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", sync);
}

if (!customElements.get("meldgrove-update-button")) {
  customElements.define("meldgrove-update-button", UpdateButtonElement);
}
if (!customElements.get("meldgrove-updates-settings")) {
  customElements.define("meldgrove-updates-settings", UpdatesSettingsElement);
}
