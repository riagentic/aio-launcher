// Main page — toolbar (update all, sort, search, grid/compact/list) + one card per app.
import type { JSX } from "aio";
import { Link, useLocal } from "aio/air";
import { toast } from "aio/ui";
import { actionOf, type Sort, viewOf } from "../apps.ts";
import { launcher } from "../cell.ts";
import { AppCard } from "./AppCard.tsx";
import { CompactIcon, GridIcon, ListIcon } from "./icons.tsx";

type View = "grid" | "compact" | "list";
const VIEWS: [View, string, () => JSX.Element][] = [
  ["grid", "Grid view", GridIcon],
  ["compact", "Compact view", CompactIcon],
  ["list", "List view", ListIcon],
];

const SORTS: [Sort, string][] = [
  ["name", "Name (A–Z)"],
  ["status", "Updates first"],
  ["updated", "Recently updated"],
];

export function Home(): JSX.Element {
  const [q, setQ] = useLocal("");
  const [sort, setSort] = useLocal<Sort>("name");
  const [view, setView] = useLocal<View>("grid");
  const [zoom, setZoom] = useLocal("");
  if (launcher.registry.length === 0) {
    return (
      <p class="muted">
        No apps in the list. Add some in <Link to="/settings">Settings</Link>.
      </p>
    );
  }
  const updates =
    launcher.registry.filter((d) => actionOf(launcher.runs[d.id]) === "update")
      .length;
  const shown = viewOf(launcher.registry, launcher.runs, q, sort);
  return (
    <>
      <div class="toolbar">
        <button
          type="button"
          class="primary"
          disabled={updates === 0}
          onClick={() =>
            launcher.updateAll().catch((e: Error) =>
              toast(e.message, { variant: "error" })
            )}
        >
          Update all ({updates})
        </button>
        <span class="grow" />
        <label class="muted small" for="sort">Sort</label>
        <select
          id="sort"
          value={sort}
          onChange={(e: Event) =>
            setSort((e.target as HTMLSelectElement).value as Sort)}
        >
          {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input
          type="search"
          class="search"
          placeholder="Search apps"
          aria-label="Search apps"
          value={q}
          onInput={(e: Event) => setQ((e.target as HTMLInputElement).value)}
        />
        <div class="seg" role="group" aria-label="Layout">
          {VIEWS.map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              class={view === v ? "on" : ""}
              aria-label={label}
              title={label}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              <Icon />
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0
        ? <p class="muted">No app matches “{q}”.</p>
        : (
          <div class={`apps ${view}`}>
            {shown.map((d) => (
              <AppCard
                key={d.id}
                def={d}
                run={launcher.runs[d.id]}
                onZoom={setZoom}
              />
            ))}
          </div>
        )}
      {zoom
        ? (
          <div
            class="lightbox"
            role="dialog"
            aria-label="Screenshot"
            onClick={() => setZoom("")}
          >
            <img src={zoom} alt="Screenshot" />
          </div>
        )
        : null}
    </>
  );
}
