import { ArrowUpRight } from "lucide-react";
import { cn } from "../lib/utils.ts";

/** "Meldgrove" as a link to an app's repository, opening in a new tab. */
export function MeldgroveLink(props: { href: string; className?: string; newTabLabel: string }) {
  return (
    <a
      href={props.href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "hover:text-foreground inline-flex items-center gap-0.5 underline underline-offset-4",
        props.className,
      )}
    >
      Meldgrove
      <ArrowUpRight className="size-3" aria-hidden="true" />
      <span className="sr-only">{props.newTabLabel}</span>
    </a>
  );
}
