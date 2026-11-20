import { useState, type ReactNode } from "react";
import { ArrowRight, MoreHorizontal, Pencil, Search } from "lucide-react";
import { Avatar, AvatarFallback } from "../../src/components/avatar.tsx";
import { Badge } from "../../src/components/badge.tsx";
import { Button } from "../../src/components/button.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../src/components/card.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../src/components/dropdown-menu.tsx";
import { Field, FieldDescription, FieldLabel } from "../../src/components/field.tsx";
import { Input } from "../../src/components/input.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../../src/components/input-group.tsx";
import { Label } from "../../src/components/label.tsx";
import { NativeSelect, NativeSelectOption } from "../../src/components/native-select.tsx";
import { Pager } from "../../src/components/pager.tsx";
import { EmptyState } from "../../src/components/states.tsx";
import { Switch } from "../../src/components/switch.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../src/components/table.tsx";
import { Textarea } from "../../src/components/textarea.tsx";
import { cn } from "../../src/lib/utils.ts";
import { OVERVIEW, type DemoApp, type List, type Row } from "./apps.ts";
import type { Crumb } from "../../src/components/app-frame.tsx";
import { Page, PageHeader } from "../../src/components/page.tsx";
import { AboutCard, AppearanceCard, KeyboardShortcutsCard } from "../../src/components/settings-cards.tsx";
import { Link } from "./router.tsx";
import { setVariants, type Variants } from "./state.ts";

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0]!, words.at(-1)!] : words;
  return letters.map((word) => word[0]!.toUpperCase()).join("");
}

const STRONG = new Set(["Open", "Waiting", "Proposal", "Consent", "Draft", "Registration open", "Admin"]);
const QUIET = new Set(["Done", "Won", "Sent", "Viewer"]);

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={STRONG.has(status) ? "default" : QUIET.has(status) ? "secondary" : "outline"}
      className="font-normal"
    >
      {status}
    </Badge>
  );
}

/* ── Dashboard blocks ── */

function StatTile({ stat }: { stat: DemoApp["stats"][number] }) {
  const body = (
    <Card className="gap-1 py-4 transition-colors group-hover/stat:border-ring/50">
      <CardHeader className="px-4">
        <CardDescription>{stat.label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">{stat.value}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground px-4 text-xs">{stat.note}</CardContent>
    </Card>
  );
  return stat.to ? (
    <Link
      to={stat.to}
      className="group/stat rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

function StatRow({ app, compact = false }: { app: DemoApp; compact?: boolean }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", compact ? "lg:grid-cols-4" : "xl:grid-cols-4")}>
      {app.stats.map((stat) => (
        <StatTile key={stat.label} stat={stat} />
      ))}
    </div>
  );
}

function BarChart({ app }: { app: DemoApp }) {
  const max = Math.max(...app.chart.points.map((point) => point.value));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{app.chart.title}</CardTitle>
        <CardDescription>{app.chart.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className="flex h-44 items-end gap-2"
          role="img"
          aria-label={`${app.chart.title}, ${app.chart.description}`}
        >
          {app.chart.points.map((point, index) => (
            <div key={point.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-muted-foreground text-xs tabular-nums">{point.value}</span>
              <div
                className={cn(
                  "w-full rounded-t-sm",
                  index === app.chart.points.length - 1 ? "bg-primary/40" : "bg-primary",
                )}
                style={{ height: `${(point.value / max) * 100}%` }}
              />
              <span className="text-muted-foreground hidden text-[10px] whitespace-nowrap sm:block">
                {point.label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityList({ app, grouped = false, limit }: { app: DemoApp; grouped?: boolean; limit?: number }) {
  const items = app.activity.slice(0, limit);
  const days = [...new Set(items.map((item) => item.day))];
  const renderItem = (item: DemoApp["activity"][number]) => (
    <li key={item.to + item.when} className="flex gap-3">
      <Avatar className="size-8">
        <AvatarFallback className="text-xs">{initials(item.who)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 text-sm">
        <p>
          <span className="font-medium">{item.who}</span> {item.what}{" "}
          <Link to={item.to} className="underline-offset-4 hover:underline">
            {item.target}
          </Link>
        </p>
        <p className="text-muted-foreground text-xs">{grouped ? item.when : `${item.day}, ${item.when}`}</p>
      </div>
    </li>
  );
  if (!grouped) return <ul className="flex flex-col gap-4">{items.map(renderItem)}</ul>;
  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => (
        <section key={day} className="flex flex-col gap-3">
          <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{day}</h3>
          <ul className="flex flex-col gap-4">{items.filter((item) => item.day === day).map(renderItem)}</ul>
        </section>
      ))}
    </div>
  );
}

function WorkList({ app, prominent = false }: { app: DemoApp; prominent?: boolean }) {
  return (
    <ul className={cn("flex flex-col", prominent ? "gap-3" : "divide-y")}>
      {app.work.map((item) => (
        <li
          key={item.to}
          className={cn(
            "flex flex-col gap-2 sm:flex-row sm:items-center",
            prominent ? "bg-card rounded-lg border p-4" : "py-3 first:pt-0 last:pb-0",
          )}
        >
          <div className="min-w-0 flex-1">
            <Link to={item.to} className="font-medium underline-offset-4 hover:underline">
              {item.title}
            </Link>
            <p className="text-muted-foreground text-xs">{item.meta}</p>
          </div>
          {prominent ? (
            <Button size="sm" variant="outline" asChild>
              <Link to={item.to}>{item.action}</Link>
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function QuickActions({ app }: { app: DemoApp }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {app.quick.map((action) => (
          <Button key={action.label} variant="outline" className="justify-start" asChild>
            <Link to={action.to}>
              <action.icon aria-hidden="true" />
              {action.label}
            </Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

function greeting(app: DemoApp) {
  return `Good morning, ${app.user.name.split(" ")[0]}`;
}

export function Dashboard({ app, variant }: { app: DemoApp; variant: Variants["dash"] }) {
  if (variant === "work") {
    return (
      <Page>
        <PageHeader title={greeting(app)} description={`${app.work.length} things wait for you.`} />
        <section aria-labelledby="work" className="flex flex-col gap-3">
          <h2 id="work" className="text-base font-semibold">
            {app.workTitle}
          </h2>
          <WorkList app={app} prominent />
        </section>
        <StatRow app={app} compact />
        <Card>
          <CardHeader>
            <CardTitle>Recently</CardTitle>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/${app.nav[0]!.items[1]}`}>
                  Show all <ArrowRight />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ActivityList app={app} limit={3} />
          </CardContent>
        </Card>
      </Page>
    );
  }
  if (variant === "activity") {
    return (
      <Page>
        <PageHeader title={greeting(app)} description={`What happened in ${app.name} lately.`} />
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>Changes by everyone, newest first</CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityList app={app} grouped />
            </CardContent>
          </Card>
          <div className="flex flex-col gap-6">
            <QuickActions app={app} />
            <Card>
              <CardHeader>
                <CardTitle>{app.workTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                <WorkList app={app} />
              </CardContent>
            </Card>
            <Card className="gap-3">
              <CardHeader>
                <CardTitle>In numbers</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-3">
                  {app.stats.map((stat) => (
                    <div key={stat.label}>
                      <dt className="text-muted-foreground text-xs">{stat.label}</dt>
                      <dd className="text-lg font-semibold tabular-nums">{stat.value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
      </Page>
    );
  }
  return (
    <Page>
      <PageHeader
        title={greeting(app)}
        description={`${app.organization} in ${app.name} today.`}
        actions={
          <Button asChild>
            <Link to="/new">
              <app.mainAction.icon />
              {app.mainAction.label}
            </Link>
          </Button>
        }
      />
      <StatRow app={app} />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <BarChart app={app} />
        </div>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{app.workTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <WorkList app={app} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityList app={app} limit={4} />
        </CardContent>
      </Card>
    </Page>
  );
}

/* ── List, detail, history ── */

export function ListPage({ app, list }: { app: DemoApp; list: List }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const statuses = [...new Set(list.rows.map((row) => row.status))];
  const rows = list.rows.filter(
    (row) =>
      (!status || row.status === status) &&
      `${row.id} ${row.title} ${row.person}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <Page>
      <PageHeader
        title={list.label}
        description={list.description}
        actions={
          list.newLabel ? (
            <Button asChild>
              <Link to={list.key === app.mainAction.list ? "/new" : `/${list.key}`}>{list.newLabel}</Link>
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <InputGroup className="sm:max-w-xs">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder={`Filter ${list.label.toLowerCase()}…`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={`Filter ${list.label.toLowerCase()}`}
          />
        </InputGroup>
        <NativeSelect
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label={list.columns.status}
        >
          <NativeSelectOption value="">Every {list.columns.status.toLowerCase()}</NativeSelectOption>
          {statuses.map((value) => (
            <NativeSelectOption key={value} value={value}>
              {value}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nothing matches" description="Change the filter to see more." />
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {list.showId ? <TableHead className="w-24">No.</TableHead> : null}
                <TableHead>{list.columns.title}</TableHead>
                <TableHead>{list.columns.status}</TableHead>
                <TableHead className="hidden md:table-cell">{list.columns.person}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">{list.columns.updated}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  {list.showId ? (
                    <TableCell className="text-muted-foreground tabular-nums">{row.id}</TableCell>
                  ) : null}
                  <TableCell className="max-w-80 font-medium whitespace-normal">
                    <Link to={`/${list.key}/${row.id}`} className="underline-offset-4 hover:underline">
                      {row.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell">{row.person}</TableCell>
                  <TableCell className="text-muted-foreground hidden text-right sm:table-cell">
                    {row.updated}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager page={page} pageSize={25} total={rows.length} onPage={setPage} />
    </Page>
  );
}

function RecordTabs({ list, row, current }: { list: List; row: Row; current: "details" | "history" }) {
  const base = `/${list.key}/${row.id}`;
  const tabs = [
    { key: "details", label: "Details", to: base },
    { key: "history", label: "History", to: `${base}/history` },
  ] as const;
  return (
    <nav aria-label={`${row.title}: sections`} className="flex gap-1 border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          to={tab.to}
          aria-current={tab.key === current ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab.key === current
              ? "border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

function RecordHeader({ list, row }: { list: List; row: Row }) {
  return (
    <PageHeader
      title={row.title}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge status={row.status} />
          {list.showId ? `${row.id} · ` : ""}
          {list.columns.person}: {row.person}
        </span>
      }
      actions={
        <>
          <Button variant="outline">
            <Pencil />
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuItem>Copy link</DropdownMenuItem>
              <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    />
  );
}

export function DetailPage({ list, row }: { list: List; row: Row }) {
  return (
    <Page>
      <RecordHeader list={list} row={row} />
      <RecordTabs list={list} row={row} current="details" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed">{list.text}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {list.showId ? (
                <>
                  <dt className="text-muted-foreground">No.</dt>
                  <dd className="tabular-nums">{row.id}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">{list.columns.status}</dt>
              <dd>
                <StatusBadge status={row.status} />
              </dd>
              <dt className="text-muted-foreground">{list.columns.person}</dt>
              <dd className="min-w-0 truncate">{row.person}</dd>
              <dt className="text-muted-foreground">{list.columns.updated}</dt>
              <dd>{row.updated}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}

export function HistoryPage({ list, row }: { list: List; row: Row }) {
  const events = [
    {
      who: row.person,
      what: `set ${list.columns.status.toLowerCase()} to “${row.status}”`,
      when: row.updated,
    },
    { who: "Jane Doe", what: "added a comment", when: "2 days earlier" },
    { who: "Jane Doe", what: "changed the description", when: "3 days earlier" },
    { who: row.person, what: "created it", when: "5 days earlier" },
  ];
  return (
    <Page>
      <RecordHeader list={list} row={row} />
      <RecordTabs list={list} row={row} current="history" />
      <Card>
        <CardContent>
          <ol className="relative flex flex-col gap-5 border-l pl-6">
            {events.map((event, index) => (
              <li key={index} className="relative text-sm">
                <span className="bg-background absolute top-1 -left-[29px] size-2.5 rounded-full border-2 border-primary" />
                <p>
                  <span className="font-medium">{event.who}</span> {event.what}
                </p>
                <p className="text-muted-foreground text-xs">{event.when}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </Page>
  );
}

/* ── Form, settings, not found ── */

export function NewPage({ app }: { app: DemoApp }) {
  const list = app.lists[app.mainAction.list]!;
  return (
    <Page className="max-w-3xl">
      <PageHeader title={app.mainAction.label} description={`A new entry in ${list.label}.`} />
      <Card>
        <CardContent className="flex flex-col gap-5">
          <Field>
            <FieldLabel htmlFor="title">{list.columns.title}</FieldLabel>
            <Input id="title" placeholder="A short, clear title" />
          </Field>
          <Field>
            <FieldLabel htmlFor="text">Description</FieldLabel>
            <Textarea id="text" rows={5} />
            <FieldDescription>What is needed, by when, and why.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="person">{list.columns.person}</FieldLabel>
            <NativeSelect id="person" wrapperClassName="w-full">
              {[...new Set(list.rows.map((row) => row.person))].map((person) => (
                <NativeSelectOption key={person}>{person}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to={`/${list.key}`}>Cancel</Link>
          </Button>
          <Button asChild>
            <Link to={`/${list.key}`}>Save</Link>
          </Button>
        </CardFooter>
      </Card>
    </Page>
  );
}

export function SettingsPage({ app, variants }: { app: DemoApp; variants: Variants }) {
  return (
    <Page className="max-w-3xl">
      <PageHeader title="Settings" description="Your own settings in this app." />
      <AppearanceCard value={variants.theme} onChange={(theme) => setVariants({ theme })} />
      <KeyboardShortcutsCard enabled={variants.keys} onEnabledChange={(keys) => setVariants({ keys })} />
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <Label htmlFor="notify" className="font-normal">
            Email me when something waits for me
          </Label>
          <Switch id="notify" defaultChecked />
        </CardContent>
      </Card>
      <AboutCard appName={app.name} repositoryUrl={app.repo} />
    </Page>
  );
}

/* ── Routes ── */

export type Resolved = { crumbs: Crumb[]; element: ReactNode; bare?: boolean };

export function resolve(app: DemoApp, path: string, variants: Variants): Resolved {
  const [section, id, sub] = path.split("/").filter(Boolean);
  if (!section)
    return { crumbs: [{ label: OVERVIEW.label }], element: <Dashboard app={app} variant={variants.dash} /> };
  if (section === "settings")
    return { crumbs: [{ label: "Settings" }], element: <SettingsPage app={app} variants={variants} /> };
  if (section === "new") {
    const list = app.lists[app.mainAction.list]!;
    return {
      crumbs: [{ label: list.label, href: `/${list.key}` }, { label: "New" }],
      element: <NewPage app={app} />,
    };
  }
  const list = app.lists[section];
  const row = list?.rows.find((candidate) => candidate.id === id);
  if (list && !id)
    return { crumbs: [{ label: list.label }], element: <ListPage key={list.key} app={app} list={list} /> };
  if (list && row) {
    const label = list.crumb === "id" ? row.id : row.title;
    const listCrumb = { label: list.label, href: `/${list.key}` };
    if (sub === "history") {
      return {
        crumbs: [listCrumb, { label, href: `/${list.key}/${row.id}` }, { label: "History" }],
        element: <HistoryPage list={list} row={row} />,
      };
    }
    return { crumbs: [listCrumb, { label }], element: <DetailPage list={list} row={row} /> };
  }
  return {
    crumbs: [{ label: "Not found" }],
    element: (
      <Page>
        <EmptyState
          title="This page is not part of the demo"
          action={
            <Button asChild>
              <Link to="/">Back to the overview</Link>
            </Button>
          }
        />
      </Page>
    ),
  };
}
