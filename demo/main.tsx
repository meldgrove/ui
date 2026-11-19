import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Inbox, Plus, Search } from "lucide-react";
import "./demo.css";
import { Alert, AlertDescription, AlertTitle } from "../src/components/alert.tsx";
import { Badge } from "../src/components/badge.tsx";
import { Button } from "../src/components/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../src/components/card.tsx";
import { Checkbox } from "../src/components/checkbox.tsx";
import { ConfirmDialog } from "../src/components/confirm-dialog.tsx";
import { CopyButton } from "../src/components/copy-button.tsx";
import { Field, FieldDescription, FieldLabel } from "../src/components/field.tsx";
import { Input } from "../src/components/input.tsx";
import { Label } from "../src/components/label.tsx";
import { Pager } from "../src/components/pager.tsx";
import { RadioGroup, RadioGroupItem } from "../src/components/radio-group.tsx";
import { initialSecret, SecretField } from "../src/components/secret-field.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../src/components/select.tsx";
import { Toaster } from "../src/components/sonner.tsx";
import { EmptyState, ErrorState, LoadingState } from "../src/components/states.tsx";
import { Switch } from "../src/components/switch.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../src/components/table.tsx";
import { Textarea } from "../src/components/textarea.tsx";
import { TooltipProvider } from "../src/components/tooltip.tsx";
import { UIProvider, type Locale } from "../src/lib/i18n.tsx";
import { UpdatesController } from "../src/updates/controller.ts";
import { toastNotice } from "../src/updates/notice.ts";
import { UpdatesContextProvider } from "../src/updates/react.tsx";
import { installStorage } from "../src/updates/state.ts";
import type { UpdatesTransport } from "../src/updates/transport.ts";
import type { Update, UpdaterStatus, UpdatesResponse } from "../src/updates/types.ts";
import { UpdateButton } from "../src/updates/update-button.tsx";
import { UpdatesSettingsCard } from "../src/updates/updates-settings.tsx";

// The page's look comes from the query: ?theme=dark&locale=de&accent=green
const params = new URLSearchParams(window.location.search);
const locale: Locale = params.get("locale") === "de" ? "de" : "en";
document.documentElement.classList.toggle("dark", params.get("theme") === "dark");
document.documentElement.lang = locale;
if (params.get("accent")) document.documentElement.dataset.accent = params.get("accent")!;

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-19T10:00:00Z");

const release = (version: string, extra: Partial<Update> = {}): Update => ({
  version,
  preview: false,
  publishedAt: new Date(NOW - 2 * DAY).toISOString(),
  url: `https://github.com/meldgrove/ui/releases/tag/v${version}`,
  notes: [
    "Faster search in long lists",
    "Fix the sign-in loop behind a proxy",
    "Show attachments in the preview",
  ],
  changes: 11,
  installsAt: new Date(NOW + DAY).toISOString(),
  failed: null,
  ...extra,
});

const base: UpdaterStatus = {
  updater: "0.2.0",
  mode: "host",
  channel: "stable",
  channelLocked: null,
  installed: "0.2.0",
  available: null,
  attention: null,
  installing: null,
  last: null,
  checking: false,
  checkedAt: new Date(NOW - 5 * 60_000).toISOString(),
  error: null,
  automatic: true,
  cooldown: "3d",
  window: "02:00-05:00",
  timezone: "Europe/Berlin",
};

/** The update states the demo shows, as the app's status route would answer. */
const STATES: Record<string, UpdatesResponse> = {
  available: {
    app: { version: "0.2.0" },
    reachable: true,
    updater: { ...base, available: release("0.2.1") },
    error: null,
  },
  attention: {
    app: { version: "0.2.0" },
    reachable: true,
    updater: { ...base, attention: release("0.3.0", { installsAt: null }) },
    error: null,
  },
  failed: {
    app: { version: "0.2.0" },
    reachable: true,
    updater: {
      ...base,
      available: release("0.2.1", { failed: "web did not become healthy within 120 s" }),
      last: {
        version: "0.2.1",
        result: "rolled-back",
        message: "web did not become healthy within 120 s",
        finishedAt: new Date(NOW - 60_000).toISOString(),
      },
    },
    error: null,
  },
  installing: {
    app: { version: "0.2.0" },
    reachable: true,
    updater: {
      ...base,
      installing: {
        version: "0.2.1",
        startedAt: new Date(NOW).toISOString(),
        manual: true,
        stage: "pulling",
      },
    },
    error: null,
  },
  current: { app: { version: "0.2.0" }, reachable: true, updater: base, error: null },
  off: {
    app: { version: "0.2.0" },
    reachable: true,
    updater: { ...base, mode: "off", automatic: false },
    error: null,
  },
  unreachable: {
    app: { version: "0.2.0" },
    reachable: false,
    updater: null,
    error: "The update service is not reachable.",
  },
};

function demoTransport(state: string): UpdatesTransport {
  return {
    async request({ action }) {
      const answer = STATES[state]!;
      if (action === "install") return { status: 202, data: STATES.installing };
      return { status: 200, data: answer };
    },
  };
}

function useDemoController(state: string) {
  return useMemo(() => {
    const controller = new UpdatesController({
      transport: demoTransport(state),
      appName: "Meldgrove Example",
      project: "example",
      locale,
      storage: installStorage(`demo.${state}`),
      notify: toastNotice,
      reload: () => undefined,
    });
    controller.start();
    return controller;
  }, [state]);
}

function UpdateDemo({ state, settings = false }: { state: string; settings?: boolean }) {
  const controller = useDemoController(state);
  return (
    <UpdatesContextProvider controller={controller} guideUrl="https://github.com/meldgrove/ui#readme">
      {settings ? (
        <UpdatesSettingsCard />
      ) : (
        <div className="flex items-center gap-2 text-sm" data-demo-update={state}>
          <UpdateButton />
          <span className="text-muted-foreground">{state}</span>
        </div>
      )}
    </UpdatesContextProvider>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{props.title}</h2>
      {props.children}
    </section>
  );
}

function Demo() {
  const [confirm, setConfirm] = useState(false);
  const [secret, setSecret] = useState(initialSecret(true));
  const [page, setPage] = useState(2);
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">@meldgrove/ui</h1>
          <p className="text-muted-foreground text-sm">
            Theme, components and the update button of the Meldgrove apps.
          </p>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm">
          {[
            ["Light", "?"],
            ["Dark", "?theme=dark"],
            ["Deutsch", "?locale=de"],
            ["App accent", "?accent=green"],
            ["App accent, dark", "?accent=green&theme=dark"],
          ].map(([label, href]) => (
            <a key={href} href={href} className="text-primary underline-offset-4 hover:underline">
              {label}
            </a>
          ))}
        </nav>
      </header>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Delete</Button>
          <Button variant="link">Link</Button>
          <Button size="sm">
            <Plus /> Small
          </Button>
          <Button size="icon" variant="outline" aria-label="Search">
            <Search />
          </Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </Section>

      <Section title="Update button">
        <div className="flex flex-wrap gap-6">
          {Object.keys(STATES).map((state) => (
            <UpdateDemo key={state} state={state} />
          ))}
        </div>
      </Section>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Form</CardTitle>
            <CardDescription>Fields, choices and a write-only secret.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" placeholder="Ada Lovelace" />
              <FieldDescription>As it appears on receipts.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="team">Team</FieldLabel>
              <Select defaultValue="ops">
                <SelectTrigger id="team" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ops">Operations</SelectItem>
                  <SelectItem value="programs">Programs</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="note">Note</FieldLabel>
              <Textarea id="note" placeholder="Anything else?" />
            </Field>
            <div className="flex items-center gap-2">
              <Checkbox id="terms" defaultChecked />
              <Label htmlFor="terms">Send a copy to me</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="notify" defaultChecked />
              <Label htmlFor="notify">Notifications</Label>
            </div>
            <RadioGroup defaultValue="monthly">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="monthly" id="monthly" />
                <Label htmlFor="monthly">Monthly</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="yearly" id="yearly" />
                <Label htmlFor="yearly">Yearly</Label>
              </div>
            </RadioGroup>
            <SecretField
              id="token"
              label="API token"
              stored
              hint="…3f9a"
              value={secret}
              onChange={setSecret}
              removable
            />
          </CardContent>
        </Card>

        <UpdateDemo state="available" settings />
      </div>

      <Section title="Table and pager">
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ["Train ticket Berlin", "Approved", "89.00 €"],
                ["Workshop catering", "Waiting", "312.50 €"],
                ["Printer toner", "Paid", "64.90 €"],
              ].map(([name, state, amount]) => (
                <TableRow key={name}>
                  <TableCell>{name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{state}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{amount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <Pager page={page} pageSize={20} total={57} onPage={setPage} />
      </Section>

      <Section title="States and messages">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <LoadingState />
          </Card>
          <Card>
            <EmptyState title="No requests yet" description="New requests show here." icon={<Inbox />} />
          </Card>
          <Card>
            <ErrorState error={new Error("The server did not answer.")} onRetry={() => undefined} />
          </Card>
        </div>
        <Alert>
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>Alerts carry short, important messages.</AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <CopyButton text="https://example.org/invite/abc" />
          <Button variant="outline" onClick={() => setConfirm(true)}>
            Delete request…
          </Button>
        </div>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title="Delete this request?"
          description="It is gone for everyone. This cannot be undone."
          destructive
          confirmLabel="Delete"
          onConfirm={() => undefined}
        />
      </Section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UIProvider locale={locale}>
      <TooltipProvider>
        <Demo />
        <Toaster />
      </TooltipProvider>
    </UIProvider>
  </StrictMode>,
);
