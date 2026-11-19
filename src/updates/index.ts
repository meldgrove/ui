/**
 * The update button and the "Updates" settings for React apps:
 *
 *   <UpdatesProvider appName="Meldgrove Handbook" project="handbook" url="/api/admin/updates" guideUrl="…">
 *     <UpdateButton />          (top bar, admins only)
 *     <UpdatesSettingsCard />   (admin settings)
 *   </UpdatesProvider>
 */
export { UpdateButton } from "./update-button.tsx";
export { UpdatesSettings, UpdatesSettingsCard, automaticText } from "./updates-settings.tsx";
export {
  UpdatesProvider,
  UpdatesContextProvider,
  useUpdatesController,
  useUpdatesSnapshot,
  type UpdatesProviderProps,
} from "./react.tsx";
export { toastNotice } from "./notice.ts";
export {
  UpdatesController,
  runningVersion,
  type Notice,
  type SignedOutReason,
  type UpdatesControllerOptions,
  type UpdatesSnapshot,
} from "./controller.ts";
export { fetchTransport, readCookie, SignedOutError, type UpdatesTransport } from "./transport.ts";
export * from "./types.ts";
