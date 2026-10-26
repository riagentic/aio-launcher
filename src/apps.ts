// Pure app-list logic — shared by the cell, the server module, and the UI.

/** One entry of the app list. `dir` = the app's folder inside the repo ("" = root).
 *  `extras` = repos cloned beside it (build-time data); `prebuild` = a deno task run before the build. */
export type AppDef = {
  id: string;
  name: string;
  repo: string;
  dir: string;
  about: string;
  extras: string[];
  prebuild: string;
};

/** What the launcher knows about one app on this machine. */
export type Run = {
  commit: string; // checked-out HEAD ("" = not installed)
  remote: string; // remote HEAD from the last check ("" = unknown)
  artifact: string; // built binary path ("" = not built)
  busy: boolean;
  step: string;
  error: string;
  info: Info; // from the installed copy
  latest: Info; // from the remote HEAD (last check)
};

/** What an app says about itself: deno.json + README + icon file. "" = unknown. */
export type Info = {
  rev: string; // commit it was read at ("" = never read)
  version: string;
  aio: string; // aio version the app is built on
  icon: string; // file path inside the app folder
  shot: string; // screenshot path inside the app folder
  date: string; // commit date, ISO
};

export type Media = "icon" | "shot";

export type Action = "install" | "update" | "open" | "busy";

/** Places the "..." menu opens. */
export const PLACES = ["readme", "repo", "appDir", "profileDir"] as const;
export type Place = typeof PLACES[number];

export const DEFAULT_APPS: AppDef[] = [
  {
    id: "amui",
    name: "amui",
    repo: "https://github.com/riagentic/aio",
    dir: "amui",
    about: "aio app manager",
    extras: [],
    prebuild: "",
  },
  {
    id: "mdview",
    name: "mdview",
    repo: "https://github.com/riagentic/mdview",
    dir: "",
    about: "Markdown viewer",
    extras: [],
    prebuild: "",
  },
  {
    id: "bsv",
    name: "bsv",
    repo: "https://github.com/riagentic/bsv",
    dir: "",
    about: "Bible Source Version reader",
    extras: ["https://github.com/riagentic/word"], // bible/word -> ../../word
    prebuild: "text",
  },
  {
    id: "fixable",
    name: "fixable",
    repo: "https://github.com/riagentic/fixable",
    dir: "",
    about: "Linux desktop health checks",
    extras: [],
    prebuild: "",
  },
  {
    id: "mushradar",
    name: "mushradar",
    repo: "https://github.com/riagentic/mushradar",
    dir: "",
    about: "Mushroom forecast map of Czechia",
    extras: [],
    prebuild: "",
  },
  {
    id: "cc",
    name: "cc",
    repo: "https://github.com/riagentic/cc",
    dir: "",
    about: "Claude Control: Claude Code across projects",
    extras: [],
    prebuild: "",
  },
  {
    id: "spacy",
    name: "spacy",
    repo: "https://github.com/riagentic/spacy",
    dir: "",
    about: "Where your disk space went",
    extras: [],
    prebuild: "",
  },
  {
    id: "netmap",
    name: "netmap",
    repo: "https://github.com/riagentic/netmap",
    dir: "",
    about: "Local network and internet path map",
    extras: [],
    prebuild: "",
  },
  {
    id: "machine",
    name: "machine",
    repo: "https://github.com/riagentic/machine",
    dir: "",
    about: "Live hardware monitor for your PC",
    extras: [],
    prebuild: "wasm", // rebuilds src/syscalls.wasm with Rust; keeps the committed one without
  },
  {
    id: "llama-master",
    name: "llama.master",
    repo: "https://github.com/riagentic/llama-master",
    dir: "",
    about: "Get, fit, run and chat with llama.cpp models",
    extras: [],
    prebuild: "",
  },
  {
    id: "protector",
    name: "protector",
    repo: "https://github.com/riagentic/protector",
    dir: "",
    about: "Keeps your workstation from freezing", // the protectord service installs separately
    extras: [],
    prebuild: "",
  },
  {
    id: "writy",
    name: "writy",
    repo: "https://github.com/riagentic/writy",
    dir: "",
    about: "Documents, sheets and slides in one .html file",
    extras: [],
    prebuild: "",
  },
  {
    id: "fjssm",
    name: "fjssm",
    repo: "https://github.com/riagentic/fjssm",
    dir: "",
    about: "Fuzzy job shop scheduling (FJSS Maker)",
    extras: [],
    prebuild: "",
  },
  {
    id: "ayd",
    name: "ayd",
    repo: "https://github.com/riagentic/ayd",
    dir: "",
    about: "YouTube video downloader (yt-dlp)",
    extras: [],
    prebuild: "",
  },
  {
    id: "calcaio",
    name: "calcaio",
    repo: "https://github.com/riagentic/calcaio",
    dir: "",
    about: "Scientific calculator",
    extras: [],
    prebuild: "",
  },
  {
    id: "space-invaders",
    name: "Space Invaders",
    repo: "https://github.com/riagentic/space-invaders",
    dir: "",
    about: "Neon arcade game",
    extras: [],
    prebuild: "",
  },
];

/** Defaults not offered yet join the list; one the user removed stays removed. */
export const withNewDefaults = (
  registry: AppDef[],
  offered: string[],
): { registry: AppDef[]; offered: string[] } => ({
  registry: [
    ...registry,
    ...DEFAULT_APPS.filter((d) =>
      !offered.includes(d.id) && !registry.some((x) => x.id === d.id)
    ),
  ],
  offered: [...new Set([...offered, ...DEFAULT_APPS.map((d) => d.id)])],
});

export const LABEL: Record<Action, string> = {
  install: "Install",
  update: "Update",
  open: "Open",
  busy: "Working…",
};

export const blankRun = (): Run => ({
  commit: "",
  remote: "",
  artifact: "",
  busy: false,
  step: "",
  error: "",
  info: blankInfo(),
  latest: blankInfo(),
});

export const blankInfo = (): Info => ({
  rev: "",
  version: "",
  aio: "",
  icon: "",
  shot: "",
  date: "",
});

/** The one button: what clicking it does now. */
export const actionOf = (r?: Run): Action =>
  !r
    ? "install"
    : r.busy
    ? "busy"
    : !r.commit
    ? "install"
    : r.remote && r.remote !== r.commit
    ? "update"
    : r.artifact
    ? "open"
    : "install";

export const idOf = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Folder an extra repo is cloned into, beside the apps: ".../word.git" → "word". */
export const repoName = (url: string): string =>
  url.replace(/\/+$/, "").split(/[/:]/).pop()!.replace(/\.git$/, "");

/** Every repo an app needs, with the folder (under the apps dir) it lives in. */
export const sourcesOf = (d: AppDef): { repo: string; dir: string }[] => [
  { repo: d.repo, dir: d.id },
  ...d.extras.map((repo) => ({ repo, dir: repoName(repo) })),
];

const REPO = /^(https:\/\/|ssh:\/\/|git@|file:\/\/|\/)[^\s]+$/;
const DIR = /^([\w.-]+\/)*[\w.-]+$/;

/** true, or why the entry is refused (bad repo/dir would reach git and the filesystem). */
export const checkDef = (d: AppDef, list: AppDef[]): true | string =>
  !/^[a-z0-9][a-z0-9-]*$/.test(d.id)
    ? "name needs a letter or digit"
    : list.some((x) => x.id === d.id)
    ? `"${d.id}" is already in the list`
    : !REPO.test(d.repo)
    ? "repository must be an https://, ssh://, git@ or local path"
    : d.dir !== "" && (!DIR.test(d.dir) || d.dir.split("/").includes(".."))
    ? "subfolder must be a plain relative path"
    : !d.extras.every((e) =>
        REPO.test(e) && /^[\w-][\w.-]*$/.test(repoName(e)) &&
        repoName(e) !== d.id
      )
    ? "extra repos must be https://, ssh://, git@ or local paths, not named like the app"
    : d.prebuild !== "" && !/^\w[\w:.-]*$/.test(d.prebuild)
    ? "build step must be a deno task name"
    : sourcesOf(d).some((src) =>
        list.some((x) =>
          sourcesOf(x).some((o) => o.dir === src.dir && o.repo !== src.repo)
        )
      )
    ? "a folder it needs is already used by another app"
    : true;

/** Browser URL of a repo ("" = not a web host): git@host:a/b.git, ssh://git@host/a/b → https://host/a/b. */
export const webOf = (repo: string): string => {
  const m = repo.match(
    /^(?:https:\/\/|ssh:\/\/git@|git@)([^/:]+)[/:](.+?)(?:\.git)?\/*$/,
  );
  return m ? `https://${m[1]}/${m[2]}` : "";
};

/** The app's README on its web host — GitHub's /blob/HEAD/ layout. */
export const readmeOf = (d: AppDef): string =>
  webOf(d.repo) &&
  `${webOf(d.repo)}/blob/HEAD/${d.dir ? `${d.dir}/` : ""}README.md`;

type Cfg = { version?: unknown; aioVersion?: unknown; name?: unknown };
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** aio's app id rule (appId → title → package name → folder), slugged: the profile is ~/.<id>. */
export const profileIdOf = (
  cfg: { appId?: unknown; title?: unknown; name?: unknown },
  folder: string,
): string =>
  idOf(
    [str(cfg.appId), str(cfg.title), str(cfg.name).split("/").pop()]
      .find(Boolean) ?? folder,
  );

/** Where aio apps keep their icon, best first (.aio/build is the generated one). */
export const ICONS = [
  "src/icon.svg",
  "src/icon.png",
  "assets/icon.svg",
  "assets/icon.png",
  "icon.svg",
  "icon.png",
];

/** version + aio from deno.json; an app inside the aio repo is on that repo's version. */
export const versionsOf = (
  cfg: Cfg | null,
  root: Cfg | null,
): Pick<Info, "version" | "aio"> => ({
  version: str(cfg?.version).replace(/^v/, ""),
  aio: (str(cfg?.aioVersion) ||
    (str(root?.name) === "@riagentic/aio" ? str(root?.version) : ""))
    .replace(/^v/, ""),
});

/** First local image the README shows — the app's own screenshot. */
export const shotOf = (readme: string): string => {
  for (
    const m of readme.matchAll(
      /!\[[^\]]*\]\(\s*<?([^)\s>]+)|<img\b[^>]*\bsrc=["']([^"']+)/g,
    )
  ) {
    const src = (m[1] ?? m[2] ?? "").replace(/^\.\//, "");
    if (
      /\.(png|jpe?g|webp|gif)$/i.test(src) && !/^[a-z]+:|^\/|\.\./i.test(src)
    ) return src;
  }
  return "";
};

/** raw file URL of a GitHub repo ("" = not GitHub) — where a not-installed app's info comes from. */
export const rawOf = (d: AppDef, rev = "HEAD"): string => {
  const web = webOf(d.repo);
  return web.startsWith("https://github.com/")
    ? `https://raw.githubusercontent.com/${web.slice(19)}/${rev}/${
      d.dir ? `${d.dir}/` : ""
    }`
    : "";
};

/** "0.4", "0.3 → 0.4" — the version strip on a card. */
/** The button text: "Update to v0.4" only when the version moves, else plain "Update". */
export const goLabel = (r?: Run): string => {
  const act = actionOf(r), next = r?.latest.version;
  return act === "update" && next && next !== r?.info.version
    ? `Update to v${next}`
    : LABEL[act];
};

export const versionLabel = (r?: Run): string => {
  const now = r?.info.version, next = r?.latest.version;
  return !r?.commit
    ? next ? `v${next}` : ""
    : now && next && next !== now && actionOf(r) === "update"
    ? `v${now} → v${next}`
    : now
    ? `v${now}`
    : "";
};

/** The info a card shows: the installed copy's, else the remote's. */
export const shownInfo = (r?: Run): Info =>
  r?.commit && r.info.rev ? r.info : r?.latest ?? blankInfo();

/** Image URL for the UI ("" = none); the query busts the cache when the file changes. */
export const mediaUrl = (id: string, r: Run | undefined, kind: Media) => {
  const i = shownInfo(r), path = i[kind];
  return path
    ? `/media/${id}/${kind}?v=${encodeURIComponent(`${i.rev}:${path}`)}`
    : "";
};

export type Sort = "name" | "updated" | "status";

const RANK: Record<Action, number> = {
  update: 0,
  busy: 1,
  open: 2,
  install: 3,
};

/** Filter by text, then sort — pure, for the toolbar. */
export const viewOf = (
  defs: AppDef[],
  runs: Record<string, Run>,
  q: string,
  sort: Sort,
): AppDef[] => {
  const t = q.trim().toLowerCase();
  const date = (d: AppDef) => shownInfo(runs[d.id]).date;
  return defs
    .filter((d) => !t || `${d.name} ${d.about}`.toLowerCase().includes(t))
    .toSorted((a, b) =>
      sort === "updated"
        ? date(b).localeCompare(date(a)) || a.name.localeCompare(b.name)
        : sort === "status"
        ? RANK[actionOf(runs[a.id])] - RANK[actionOf(runs[b.id])] ||
          a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name)
    );
};

/** The built file that opens an app on this OS, best first (Deno.build.os names). */
const OPENS: Record<string, RegExp[]> = {
  linux: [/\.AppImage$/],
  windows: [/\.exe$/], // the one-click SFX
  darwin: [/\.app\.tar\.gz$/, /\.zip$/, /\.dmg$/], // unpacked to a .app once
};

export const pickArtifact = (files: string[], os: string): string => {
  for (const re of OPENS[os] ?? []) {
    const f = files.find((x) => re.test(x));
    if (f) return f;
  }
  return "";
};
