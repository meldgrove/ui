/**
 * The eye button of SecretInput for pages without React (the Django apps):
 * a custom element around a password field, without React or a shadow root,
 * so the field stays a plain input of the form.
 *
 *   <script type="module" src="…/meldgrove-secret-input.js"></script>
 *   <meldgrove-secret-input locale="en">
 *     <input type="password" name="token" id="id_token">
 *   </meldgrove-secret-input>
 *
 * The value is hidden at first; the button after the field shows or hides it.
 * Colors come from the tokens (tokens.css). `locale`: `en` (default) or `de`.
 */

const texts = {
  en: { show: "Show", hide: "Hide" },
  de: { show: "Anzeigen", hide: "Verbergen" },
} as const;

// lucide icons "eye" and "eye-off" (ISC license, lucide.dev), as in the React component.
const icons = {
  eye: [
    "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
    "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  ],
  eyeOff: [
    "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",
    "M14.084 14.158a3 3 0 0 1-4.242-4.242",
    "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",
    "m2 2 20 20",
  ],
};

const css = `
meldgrove-secret-input { display: block; position: relative; }
meldgrove-secret-input > input[type] { width: 100%; box-sizing: border-box; padding-inline-end: 2.5rem; }
meldgrove-secret-input > button[data-reveal] {
  position: absolute; inset-block: 0; inset-inline-end: 0.375rem; margin-block: auto;
  display: inline-flex; align-items: center; justify-content: center;
  width: 1.75rem; height: 1.75rem; padding: 0; border: 0;
  border-radius: calc(var(--radius, 0.625rem) - 4px);
  background: transparent; color: var(--muted-foreground, currentColor); cursor: pointer;
}
meldgrove-secret-input > button[data-reveal]:hover { background: var(--accent, transparent); color: var(--accent-foreground, currentColor); }
meldgrove-secret-input > button[data-reveal]:focus-visible { outline: 2px solid var(--ring, currentColor); outline-offset: 1px; }
meldgrove-secret-input > button[data-reveal]:disabled { opacity: 0.5; cursor: not-allowed; }
meldgrove-secret-input > button[data-reveal] svg { width: 1rem; height: 1rem; pointer-events: none; }
`;

let adopted = false;

/** A constructed sheet, not a <style>: pages with style-src 'self' allow it. */
function adoptStyles() {
  if (adopted) return;
  adopted = true;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

function icon(paths: readonly string[]): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [name, value] of Object.entries({
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  }))
    svg.setAttribute(name, value);
  for (const d of paths) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

let count = 0;

export class MeldgroveSecretInput extends HTMLElement {
  #button: HTMLButtonElement | null = null;

  connectedCallback() {
    if (this.#button?.isConnected) return;
    const input = this.querySelector("input");
    if (!input) return;
    adoptStyles();
    if (!input.id) input.id = `meldgrove-secret-${++count}`;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.reveal = "";
    button.disabled = input.disabled;
    button.setAttribute("aria-controls", input.id);
    button.addEventListener("click", () => {
      input.type = input.type === "password" ? "text" : "password";
      this.#render(input, button);
    });
    input.after(button);
    this.#button = button;
    this.#render(input, button);
  }

  #render(input: HTMLInputElement, button: HTMLButtonElement) {
    const shown = input.type !== "password";
    const t = texts[this.getAttribute("locale") === "de" ? "de" : "en"];
    const label = shown ? t.hide : t.show;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.replaceChildren(icon(shown ? icons.eyeOff : icons.eye));
  }
}

if (!customElements.get("meldgrove-secret-input")) {
  customElements.define("meldgrove-secret-input", MeldgroveSecretInput);
}
