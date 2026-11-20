import { Layers, Smartphone, X } from "lucide-react";
import { Button } from "../../src/components/button.tsx";
import { CopyButton } from "../../src/components/copy-button.tsx";
import { Label } from "../../src/components/label.tsx";
import { NativeSelect, NativeSelectOption } from "../../src/components/native-select.tsx";
import { Switch } from "../../src/components/switch.tsx";
import { APPS } from "./apps.ts";
import { navigate, usePath } from "./router.tsx";
import { choiceOf, OPTIONS, queryFor, setVariants, type OptionKey, type Variants } from "./state.ts";

/** The pages worth a look; the frame's own keys and menus do the rest. */
const PAGES: { label: string; to: (variants: Variants) => string }[] = [
  { label: "Overview", to: () => "/" },
  {
    label: "Deepest page (three breadcrumbs)",
    to: (variants) => {
      const app = APPS[variants.app]!;
      const list = app.lists[app.mainAction.list]!;
      return `/${list.key}/${list.rows[0]!.id}/history`;
    },
  },
  { label: "Settings", to: () => "/settings" },
  { label: "Sign-in page", to: () => "/sign-in" },
];

const SHOWN: OptionKey[] = ["app", "dash", "update", "theme"];

/** Demo controls: which variant of each template is shown. Not part of any app. */
export function Panel(props: { variants: Variants; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { variants, open, onOpenChange: setOpen } = props;
  usePath(); // The copied link includes the page.

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-[60] rounded-full shadow-lg"
        aria-label="Show the demo controls"
      >
        <Layers />
        Variants
      </Button>
    );
  }

  return (
    <aside
      aria-label="Demo controls"
      className="bg-popover text-popover-foreground fixed inset-x-2 bottom-2 z-[60] flex max-h-[70svh] flex-col overflow-hidden rounded-xl border-2 border-dashed shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-h-[calc(100svh-2rem)] sm:w-[22rem] lg:inset-y-0 lg:right-0 lg:bottom-0 lg:max-h-none lg:rounded-none lg:border-0 lg:border-l-2 lg:shadow-none"
    >
      <div className="flex items-start gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Layers className="size-4" /> Template demo
          </p>
          <p className="text-muted-foreground text-xs">
            The frame of @meldgrove/ui with fake content. Not part of an app; the link keeps every choice.
          </p>
        </div>
        <CopyButton text={window.location.href} label="Copy link" />
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setOpen(false)}
          aria-label="Hide the demo controls"
        >
          <X />
        </Button>
      </div>
      <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold tracking-wide uppercase">Pages</p>
          <ul className="flex flex-col gap-1 text-sm">
            {PAGES.map((page) => (
              <li key={page.label}>
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => navigate(page.to(variants))}
                >
                  {page.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
        {SHOWN.map((key) => {
          const option = OPTIONS[key];
          const chosen = choiceOf(key, variants[key]);
          return (
            <div key={key} className="flex flex-col gap-1.5">
              <Label htmlFor={`variant-${key}`} className="text-xs font-semibold tracking-wide uppercase">
                {option.label}
              </Label>
              <NativeSelect
                id={`variant-${key}`}
                size="sm"
                wrapperClassName="w-full"
                value={variants[key]}
                onChange={(event) => setVariants({ [key]: event.target.value } as Partial<Variants>)}
              >
                {option.choices.map((choice) => (
                  <NativeSelectOption key={choice.value} value={choice.value}>
                    {choice.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {chosen.hint ? <p className="text-muted-foreground text-xs">{chosen.hint}</p> : null}
            </div>
          );
        })}
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <Label htmlFor="variant-phone" className="flex items-center gap-2 font-normal">
            <Smartphone className="size-4" /> Show at phone width
          </Label>
          <Switch
            id="variant-phone"
            checked={variants.phone}
            onCheckedChange={(phone) => setVariants({ phone })}
          />
        </div>
        <div className="text-muted-foreground space-y-1 text-xs">
          <p className="text-foreground font-semibold">To try</p>
          <p>G then O, R or M goes to a page (Helpdesk). Ctrl / lists every shortcut.</p>
          <p>Ctrl K or ⌘K (or “/”) opens the search on every page.</p>
          <p>Ctrl B or ⌘B, or a click on the sidebar's edge, hides the sidebar.</p>
          <p>Long names in the breadcrumbs are cut; hover shows them in full (CRM, Organizations).</p>
        </div>
      </div>
    </aside>
  );
}

/** The same page in a phone-sized frame: the app inside runs at 390 px, with the sidebar as a sheet. */
export function PhoneStage({ variants }: { variants: Variants }) {
  const path = usePath();
  const src = `${window.location.pathname}${queryFor(variants, { phone: false, embed: true })}#${path}`;
  return (
    <div className="bg-muted flex min-h-svh items-start justify-center p-4 sm:items-center">
      <iframe
        title="The app at phone width"
        src={src}
        className="bg-background h-[min(844px,calc(100svh-2rem))] w-[390px] max-w-full rounded-[2rem] border-8 border-neutral-800 shadow-2xl"
      />
    </div>
  );
}
