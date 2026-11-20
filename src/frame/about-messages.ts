import { defineMessages } from "../lib/i18n-core.ts";

/** The Meldgrove line of the sign-in page and the About card. */
export const aboutMessages = defineMessages({
  en: {
    partOf: "{app} is part of {meldgrove}, open-source apps for nonprofits and small teams.",
    newTab: "(GitHub, opens in a new tab)",
  },
  de: {
    partOf:
      "{app} gehört zu {meldgrove}, Open-Source-Apps für gemeinnützige Organisationen und kleine Teams.",
    newTab: "(GitHub, öffnet in einem neuen Tab)",
  },
});
