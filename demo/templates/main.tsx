import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { createRoot } from "react-dom/client";
import "./templates.css";
import { AppFrame, type NavGroup, type SearchResult } from "../../src/components/app-frame.tsx";
import { Button } from "../../src/components/button.tsx";
import { SignInPage } from "../../src/components/sign-in-page.tsx";
import { Toaster } from "../../src/components/sonner.tsx";
import { TooltipProvider } from "../../src/components/tooltip.tsx";
import { UIProvider } from "../../src/lib/i18n.tsx";
import { cn } from "../../src/lib/utils.ts";
import { UpdateButton } from "../../src/updates/update-button.tsx";
import { APPS, OVERVIEW, type DemoApp } from "./apps.ts";
import { resolve } from "./pages.tsx";
import { Panel, PhoneStage } from "./panel.tsx";
import { HashLink, navigate, usePath } from "./router.tsx";
import { setVariants, useVariants, type Variants } from "./state.ts";
import { DemoUpdates } from "./updates.tsx";

// The frame's own texts in German with ?locale=de (the fake content stays English).
const locale = new URLSearchParams(window.location.search).get("locale") === "de" ? "de" : "en";

/** The app's navigation as the frame takes it: text, a count, and the G key for the main pages. */
function navOf(app: DemoApp): NavGroup[] {
  return app.nav.map((group) => ({
    label: group.label,
    items: group.items.map((key) => {
      const list = key === "overview" ? undefined : app.lists[key]!;
      return {
        label: list?.label ?? OVERVIEW.label,
        href: list ? `/${key}` : "/",
        badge: list?.badge,
        shortcut: app.keys[key],
      };
    }),
  }));
}

/** The app's records for a query; a real app asks its server. */
async function findIn(app: DemoApp, query: string): Promise<SearchResult[]> {
  const term = query.toLowerCase();
  const seen = new Set<string>();
  return Object.values(app.lists).flatMap((list) =>
    list.rows
      .filter((row) => `${row.id} ${row.title}`.toLowerCase().includes(term))
      .filter((row) => !seen.has(row.id) && seen.add(row.id))
      .map((row) => ({
        href: `/${list.key}/${row.id}`,
        title: row.title,
        reference: list.showId ? row.id : undefined,
        kind: list.label,
      })),
  );
}

/** Sets the class `dark` on <html>, as every app's theme switch does. */
function useTheme(theme: Variants["theme"]) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle(
        "dark",
        theme === "dark" || (theme === "system" && media.matches),
      );
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

function Root() {
  const variants = useVariants();
  const path = usePath();
  const app = APPS[variants.app]!;
  // Open beside the app on wide screens; on narrow ones a button until asked for.
  const [panelOpen, setPanelOpen] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  const panel = <Panel variants={variants} open={panelOpen} onOpenChange={setPanelOpen} />;
  const room = cn(panelOpen && "lg:pr-[22rem]");
  useTheme(variants.theme);
  useEffect(() => {
    document.title = `${app.name} · Meldgrove templates`;
  }, [app]);

  if (variants.phone && !variants.embed) {
    return (
      <>
        <div className={room}>
          <PhoneStage variants={variants} />
        </div>
        {panel}
      </>
    );
  }

  const Icon = app.icon;
  let content;
  if (path === "/sign-in") {
    content = (
      <SignInPage
        app={{ name: app.name, icon: <Icon /> }}
        tagline={app.tagline}
        organization={app.organization}
        repositoryUrl={app.repo}
      >
        <Button className="w-full" onClick={() => navigate("/")}>
          <LogIn />
          Sign in with your organization account
        </Button>
      </SignInPage>
    );
  } else {
    const page = resolve(app, path, variants);
    content = (
      <AppFrame
        key={app.key}
        app={{ name: app.name, icon: <Icon />, description: app.organization }}
        nav={navOf(app)}
        pathname={path}
        link={HashLink}
        navigate={navigate}
        user={{ name: app.user.name, email: app.user.email, detail: app.user.role }}
        theme={variants.theme}
        onThemeChange={(theme) => setVariants({ theme })}
        settingsHref="/settings"
        onSignOut={() => navigate("/sign-in")}
        breadcrumbs={page.crumbs}
        headerEnd={variants.update === "none" ? null : <UpdateButton />}
        search={{ find: (query) => findIn(app, query) }}
        shortcuts={variants.keys}
      >
        {page.element}
      </AppFrame>
    );
  }

  return (
    <UIProvider locale={locale}>
      <TooltipProvider delayDuration={300}>
        <DemoUpdates
          key={`${app.key}-${variants.update}`}
          state={variants.update === "none" ? "current" : variants.update}
          appName={app.name}
          repo={app.repo}
        >
          <div className={variants.embed ? undefined : room}>{content}</div>
        </DemoUpdates>
        <Toaster />
        {variants.embed ? null : panel}
      </TooltipProvider>
    </UIProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
