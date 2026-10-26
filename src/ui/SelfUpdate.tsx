// The launcher's own update: a nav button while a release waits, progress while it installs.
import type { JSX } from "aio";
import { toast } from "aio/ui";
import { updates } from "aio/updates";
import { launcher } from "../cell.ts";

const fail = (e: Error) => toast(e.message, { variant: "error" });

export function SelfUpdate(): JSX.Element | null {
  const u = updates, next = u.available;
  if (u.status === "downloading") {
    return (
      <span class="self">
        Updating launcher… {Math.round(u.progress * 100)}%
      </span>
    );
  }
  if (u.status === "applying" || u.status === "staged") {
    return <span class="self">Restarting launcher…</span>;
  }
  return next
    ? (
      <button
        type="button"
        class="self"
        title={next.notes || `${next.reason} — the launcher restarts`}
        onClick={() => launcher.selfUpdate().catch(fail)}
      >
        Update launcher to v{next.version}
      </button>
    )
    : null;
}
