import { toast } from "sonner";
import type { Notice } from "./controller.ts";

/** Shows a notice of the update controller as a toast (`Toaster` from `@meldgrove/ui/sonner`). */
export function toastNotice(notice: Notice) {
  const show = notice.kind === "success" ? toast.success : toast.error;
  show(notice.title, notice.description ? { description: notice.description } : undefined);
}
