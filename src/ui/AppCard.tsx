// One app: version strip, icon, screenshot, status, the single Install / Update / Open button, and a "..." menu.
import type { JSX } from "aio";
import { useLocal } from "aio/air";
import { Confirm, Menu, type MenuItem, toast } from "aio/ui";
import {
  actionOf,
  type AppDef,
  LABEL,
  mediaUrl,
  type Place,
  readmeOf,
  type Run,
  shownInfo,
  versionLabel,
  webOf,
} from "../apps.ts";
import { launcher } from "../cell.ts";

const fail = (e: Error) => toast(e.message, { variant: "error" });

const day = (iso: string) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
    : "";

const status = (r?: Run): string =>
  r?.busy
    ? r.step
    : !r?.commit
    ? "Not installed"
    : !r.artifact
    ? "Downloaded · not built"
    : r.info.date
    ? `Updated ${day(r.info.date)}`
    : "Installed";

/** The "..." menu, in the order the user asked for. */
const itemsOf = (d: AppDef, r?: Run): MenuItem[] => {
  const idle = !r?.busy, installed = idle && !!r?.commit;
  return [
    { id: "readme", label: "Readme", disabled: !readmeOf(d) },
    { id: "open", label: "Open", disabled: !idle || !r?.artifact },
    { id: "appDir", label: "App Directory", disabled: !installed },
    { id: "profileDir", label: "Profile Directory" },
    { id: "reinstall", label: "Reinstall", disabled: !installed },
    { id: "uninstall", label: "Uninstall", disabled: !installed, danger: true },
    { id: "repo", label: "Github repository", disabled: !webOf(d.repo) },
  ];
};

/** App icon; the first letter when the app ships none (or it fails to load). */
function Logo(p: { name: string; src: string }): JSX.Element {
  const [broken, setBroken] = useLocal("");
  return p.src && broken !== p.src
    ? (
      <img
        class="logo"
        src={p.src}
        alt=""
        onError={() => setBroken(p.src)}
      />
    )
    : (
      <span class="logo letter" aria-hidden="true">
        {p.name.slice(0, 1).toUpperCase()}
      </span>
    );
}

export function AppCard(
  p: { def: AppDef; run?: Run; onZoom: (src: string) => void },
): JSX.Element {
  const d = p.def, r = p.run, id = d.id, act = actionOf(r);
  const [asking, setAsking] = useLocal(false);
  const info = shownInfo(r), next = r?.latest.version;
  const shot = mediaUrl(id, r, "shot");
  const label = act === "update" && next ? `Update to v${next}` : LABEL[act];
  const go = () =>
    (act === "open" ? launcher.open(id) : launcher.install(id)).catch(fail);
  const pick = (what: string) =>
    (what === "open"
      ? launcher.open(id)
      : what === "reinstall"
      ? launcher.reinstall(id)
      : what === "uninstall"
      ? Promise.resolve(setAsking(true))
      : launcher.reveal(id, what as Place)).catch(fail);
  return (
    <article class={`app ${act}`}>
      <div class="strip mono">
        <span class="ver">{versionLabel(r) || "—"}</span>
        <span class="grow" />
        {webOf(d.repo)
          ? (
            <button
              type="button"
              class="link"
              aria-label={`GitHub page of ${d.name}`}
              onClick={() => launcher.reveal(id, "repo").catch(fail)}
            >
              GitHub ↗
            </button>
          )
          : null}
      </div>
      <div class="body">
        <header>
          <Logo name={d.name} src={mediaUrl(id, r, "icon")} />
          <div class="grow">
            <h3>{d.name}</h3>
            <p class="muted">{d.about}</p>
          </div>
        </header>
        {shot
          ? (
            <button
              type="button"
              class="shot"
              aria-label={`Screenshot of ${d.name}`}
              onClick={() => p.onZoom(shot)}
            >
              <img src={shot} alt="" loading="lazy" />
            </button>
          )
          : (
            <div class="shot none" aria-hidden="true">
              <Logo name={d.name} src={mediaUrl(id, r, "icon")} />
            </div>
          )}
        {act === "update" ? <span class="badge">Update available</span> : null}
        <p class={`status ${r?.busy ? "busy" : ""}`}>
          {status(r)}
          {info.aio && !r?.busy ? ` · aio ${info.aio}` : ""}
        </p>
        {r?.error ? <pre class="error">{r.error}</pre> : null}
        <div class="actions">
          <button
            type="button"
            class={`go ${
              act === "update" || act === "install" ? "primary" : ""
            }`}
            t={`go-${id}`}
            aria-label={`${label} ${d.name}`}
            disabled={act === "busy"}
            onClick={go}
          >
            {label}
          </button>
          <Menu
            class="more"
            trigger="…"
            label={`More actions for ${d.name}`}
            items={itemsOf(d, r)}
            onSelect={pick}
          />
        </div>
      </div>
      <Confirm
        open={asking}
        title={`Uninstall ${d.name}?`}
        message="Deletes the downloaded code and the built app. Your app data (profile folder) stays."
        confirmLabel="Uninstall"
        danger
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          launcher.uninstall(id).catch(fail);
        }}
      />
    </article>
  );
}
