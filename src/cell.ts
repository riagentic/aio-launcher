// Launcher cell — the app list (settings, persisted) + per-app status (rebuilt from disk at boot).
import { cell } from "aio";
import { updates } from "aio/updates";
import {
  actionOf,
  type AppDef,
  blankInfo,
  blankRun,
  checkDef,
  DEFAULT_APPS,
  type Place,
  PLACES,
  type Run,
  withNewDefaults,
} from "./apps.ts";

export type State = {
  registry: AppDef[];
  offered: string[]; // default app ids already added once — a removed one is not re-added
  appsDir: string;
  runs: Record<string, Run>;
  checking: boolean;
  checkedAt: number; // last finished update check (ms, 0 = never)
  missing: { tool: string; how: string }[]; // not on PATH — installs cannot run
};

/** v1 entries had no extras/prebuild: a known app takes the defaults' values. */
type V1 = Omit<AppDef, "extras" | "prebuild"> & Partial<AppDef>;
const upgrade = (d: V1): AppDef => {
  const base: Pick<AppDef, "extras" | "prebuild"> =
    DEFAULT_APPS.find((x) => x.id === d.id) ?? { extras: [], prebuild: "" };
  return { ...base, ...d };
};

const io = () => import("./launcher.server.ts");
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Fold what is on disk into the runs; an app mid-install keeps its own view. */
async function rescan(s: State): Promise<void> {
  Object.assign(s, withNewDefaults(s.registry, s.offered));
  const found = await (await io()).scan(
    s.appsDir,
    s.registry.map((d) => ({ ...d })),
  );
  for (const [id, f] of Object.entries(found)) {
    const r = (s.runs[id] ??= blankRun());
    if (!r.busy) Object.assign(r, f);
  }
}

type Io = Awaited<ReturnType<typeof io>> & { dir: string; all: AppDef[] };

/** One long job on one app: busy + step while it runs, a throw lands in `error`. */
async function job(
  s: State,
  id: string,
  step: string,
  work: (d: AppDef, r: () => Run, x: Io) => Promise<void>,
): Promise<void> {
  const found = s.registry.find((d) => d.id === id);
  if (!found) throw new Error(`no app ${id}`);
  const d = { ...found },
    dir = s.appsDir,
    all = s.registry.map((x) => ({ ...x }));
  const r = () => (s.runs[id] ??= blankRun());
  if (r().busy) return;
  Object.assign(r(), { busy: true, error: "", step });
  try {
    await work(d, r, { ...(await io()), dir, all });
  } catch (e) {
    r().error = msg(e);
  } finally {
    Object.assign(r(), { busy: false, step: "" });
  }
}

let line: Promise<unknown> = Promise.resolve();
/** One install at a time: parallel `am fix` runs race on aio's shared install, parallel builds swamp the machine. */
const inTurn = <T>(f: () => Promise<T>): Promise<T> => {
  const p = line.then(f);
  line = p.catch(() => {});
  return p;
};

/** Clone/fetch → build; the fingerprint and binary land in the run. */
const setup = (d: AppDef, r: () => Run, x: Io): Promise<void> => {
  r().step = "Waiting for other installs…";
  return inTurn(() => build(d, r, x));
};

async function build(d: AppDef, r: () => Run, x: Io): Promise<void> {
  r().step = "Downloading…";
  const commit = await x.fetchRepo(x.dir, d);
  Object.assign(r(), {
    commit,
    remote: commit,
    artifact: "",
    step: "Building…",
  });
  r().info = await x.localInfo(x.dir, d); // the new source's version, built or not
  r().artifact = await x.build(x.dir, d);
}

/** The defaults v2 shipped, frozen: every later one is new to a v2 store. */
const V2_DEFAULTS = [
  "amui",
  "mdview",
  "bsv",
  "fixable",
  "mushradar",
  "cc",
  "spacy",
  "netmap",
  "machine",
  "llama-master",
  "protector",
  "writy",
  "fjssm",
];

/** Stored v1/v2 → v3. `s` arrives merged with the defaults, so `offered` is set here, not `??`-ed. */
export const migrate = (s: State, from: number): State => ({
  ...s,
  registry: (s.registry as V1[]).map(upgrade),
  offered: from < 3 ? V2_DEFAULTS : s.offered,
});

const wipe = (r: Run) =>
  Object.assign(r, { commit: "", artifact: "", info: blankInfo() });

export const launcher = cell("launcher", {
  version: 3,
  // v2: entries gained extras + prebuild · v3: `offered` (see V2_DEFAULTS)
  onMigrate: migrate,
  state: {
    registry: DEFAULT_APPS,
    offered: DEFAULT_APPS.map((d) => d.id),
    appsDir: "",
    runs: {},
    checking: false,
    checkedAt: 0,
    missing: [],
  } as State,
  persist: { include: ["registry", "offered", "appsDir"] },
  long: [
    "install",
    "reinstall",
    "updateAll",
    "uninstall",
    "open",
    "check",
    "selfCheck",
    "selfUpdate",
  ],
  args: {
    reveal: [null, (v) => PLACES.includes(v as Place) || "unknown place"],
  },
  concurrency: { check: "first", scan: "newest" },
  methods: {
    addApp(s, d: AppDef) {
      const why = checkDef(d, s.registry);
      if (why !== true) throw new Error(why);
      s.registry.push(d);
    },
    removeApp(s, id: string) {
      if (s.runs[id]?.busy) throw new Error(`${id} is busy`);
      s.registry = s.registry.filter((d) => d.id !== id);
      delete s.runs[id];
    },
    async setAppsDir(s, dir: string) {
      if (Object.values(s.runs).some((r) => r.busy)) {
        throw new Error("wait for running installs");
      }
      const d = dir.trim();
      if (d && !/^(\/|~([\\/]|$)|[A-Za-z]:[\\/])/.test(d)) {
        throw new Error(
          "install folder must be an absolute path (or start with ~/)",
        );
      }
      s.appsDir = d;
      // the remote HEAD is the same anywhere; info + media cache belong to the old folder
      s.runs = Object.fromEntries(
        Object.entries(s.runs).map((
          [id, r],
        ) => [id, { ...blankRun(), remote: r.remote }]),
      );
      await rescan(s);
    },
    /** Read what is installed + built from disk. */
    scan: rescan,
    /** Ask each remote for its HEAD — a newer one turns Open into Update. */
    // aio-ok: re-reads runs after each await on purpose — an install may have moved them
    async check(s) {
      s.checking = true;
      try {
        const defs = s.registry.map((d) => ({ ...d })), dir = s.appsDir;
        const { remoteHead, remoteInfo, missingTools } = await io();
        s.missing = await missingTools();
        await Promise.all(defs.map(async (d) => {
          const head = await remoteHead(d).then(
            (h) => ({ h, e: "" }),
            (e) => ({ h: "", e: `update check: ${msg(e)}` }),
          );
          const rev = head.h.split(" ")[0] ?? "";
          const latest = rev && rev !== s.runs[d.id]?.latest.rev
            ? await remoteInfo(dir, d, rev).catch(() => null) // no info ≠ no update
            : null;
          if (s.appsDir !== dir) return; // folder changed meanwhile: its media is elsewhere
          if (!s.registry.some((x) => x.id === d.id)) return; // removed meanwhile
          const r = (s.runs[d.id] ??= blankRun());
          if (latest) r.latest = latest;
          if (r.busy) return;
          if (head.h) r.remote = head.h;
          const e = s.missing.some((m) => m.tool === "git") ? "" : head.e; // the banner says it once
          if (!r.error || r.error.startsWith("update check:")) r.error = e; // keep install errors
        }));
        s.checkedAt = Date.now();
      } finally {
        s.checking = false;
      }
    },
    /** Install or update: clone/fetch → am fix → deno task build --targets=electron. */
    async install(s, id: string) {
      s.missing = await (await io()).missingTools();
      await job(s, id, "Downloading…", setup);
    },
    /** Update every app that has one: all queue at once, `inTurn` builds one at a time. */
    async updateAll(s) {
      const ids = s.registry.filter((d) => actionOf(s.runs[d.id]) === "update")
        .map((d) => d.id);
      await Promise.all(ids.map((id) => job(s, id, "Downloading…", setup)));
    },
    /** The launcher's own update: mirror the newest GitHub release, let aio's updater judge it. */
    async selfCheck() {
      const x = await io();
      if (x.FROM_SOURCE) return;
      await x.mirrorRelease(false);
      await updates.check();
    },
    /** Download that release and hand it to aio's updater: verify, swap, restart. */
    async selfUpdate() {
      const x = await io();
      if (x.FROM_SOURCE) {
        throw new Error("running from source — update with git pull");
      }
      await x.mirrorRelease(true);
      await updates.check();
      await updates.apply();
    },
    /** Delete the app's files, then install it fresh. */
    async reinstall(s, id: string) {
      await job(s, id, "Removing…", async (d, r, x) => {
        await x.remove(x.dir, d, x.all);
        wipe(r());
        await setup(d, r, x);
      });
    },
    /** Delete the app's files (and extra repos no other app uses); its profile stays. */
    async uninstall(s, id: string) {
      await job(s, id, "Removing…", async (d, r, x) => {
        await x.remove(x.dir, d, x.all);
        wipe(r());
      });
    },
    /** Open the app's README, repo page, app folder or profile folder. */
    async reveal(s, id: string, what: Place) {
      const d = s.registry.find((x) => x.id === id);
      if (!d) throw new Error(`no app ${id}`);
      const dir = s.appsDir, artifact = s.runs[id]?.artifact ?? ""; // read before the await
      await (await io()).reveal(dir, { ...d }, artifact, what);
    },
    async open(s, id: string) {
      const path = s.runs[id]?.artifact,
        dir = s.appsDir,
        d = s.registry.find((x) => x.id === id);
      if (!path || !d) throw new Error(`${id} is not built`);
      await (await io()).open(dir, { ...d }, path);
    },
  },
});
