"use client";

import { useT } from "../lib/i18n.tsx";
import { aboutMessages } from "./about-messages.ts";
import { MeldgroveLink } from "./meldgrove-link.tsx";

/** "<App> is part of Meldgrove, …", with "Meldgrove" linking to the app's repository. */
export function PartOfMeldgrove(props: { appName: string; repositoryUrl: string }) {
  const t = useT(aboutMessages);
  const [before, after] = t("partOf", { app: props.appName }).split("{meldgrove}");
  return (
    <>
      {before}
      <MeldgroveLink href={props.repositoryUrl} newTabLabel={t("newTab")} />
      {after}
    </>
  );
}
