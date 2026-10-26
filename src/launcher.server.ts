// Server-only I/O: git, am, deno, and launching built apps.
import { basename, dirname, extname, join, SEPARATOR as SEP } from "@std/path";
import {
  type AppDef,
  blankInfo,
  ICONS,
  type Info,
  type Media,
  pickArtifact,
  type Place,
  profileIdOf,
  rawOf,
  readmeOf,
  type Run,
  shotOf,
  sourcesOf,
  versionsOf,
  webOf,
} from "./apps.ts";

const HOME = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
const dec = (b: Uint8Array) => new TextDecoder().decode(b);
// deno-lint-ignore no-control-regex
const plain = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
const tail = (s: string, n = 6) =>
  plain(s).trim().split("\n").slice(-n).join("\n");

const OS = Deno.build.os;
/** Where deno, am and git live when a desktop start (Finder, a menu) gave no shell PATH. */
const TOOL_DIRS = [
  join(HOME, ".deno", "bin"),
  join(HOME, ".local", "bin"),
  ...(OS === "darwin" ? ["/opt/homebrew/bin", "/usr/local/bin"] : []),
];

/** Our own AIO_* / ELECTRON_* settings must not leak into the apps we build or run. */
const env = (): Record<string, string> => {
  const e = Object.fromEntries(
    Object.entries(Deno.env.toObject()).filter(([k]) =>
      !/^(AIO_|ELECTRON_)/.test(k)
    ),
  );
  const key = Object.keys(e).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const sep = OS === "windows" ? ";" : ":";
  const have = (e[key] ?? "").split(sep).filter(Boolean);
  e[key] = [...have, ...TOOL_DIRS.filter((d) => !have.includes(d))].join(sep);
  return e;
};

const DEFAULT_ROOT = join(HOME, ".aio-launcher", "apps");
export const rootOf = (appsDir: string): string =>
  appsDir ? appsDir.replace(/^~(?=[\\/]|$)/, HOME) : DEFAULT_ROOT;
const workOf = (root: string, d: AppDef) => join(root, d.id, d.dir);

/** The tools an install needs, and how to get each. */
export const TOOLS: Record<string, string> = {
  git: OS === "windows"
    ? "winget install Git.Git"
    : OS === "darwin"
    ? "xcode-select --install"
    : "your package manager, e.g. sudo apt install git",
  am: OS === "windows"
    ? "irm https://raw.githubusercontent.com/riagentic/aio/main/install.ps1 | iex"
    : "curl -fsSL https://raw.githubusercontent.com/riagentic/aio/main/install.sh | sh",
};
TOOLS.deno = TOOLS.am!; // am's installer brings deno

/** `cmd` as found on the PATH the launcher gives its children, or "". */
async function which(cmd: string): Promise<string> {
  const e = env(), key = Object.keys(e).find((k) => k.toUpperCase() === "PATH");
  const exts = OS === "windows" ? [".exe", ".cmd", ".bat"] : [""];
  for (const dir of (key ? e[key]! : "").split(OS === "windows" ? ";" : ":")) {
    for (const x of exts) {
      const p = join(dir, cmd + x);
      if (dir && await Deno.stat(p).then((s) => s.isFile, () => false)) {
        return p;
      }
    }
  }
  return "";
}

/** The TOOLS not on PATH — the UI says what to install instead of failing per app. */
export async function missingTools(): Promise<{ tool: string; how: string }[]> {
  const found = await Promise.all(Object.keys(TOOLS).map(which));
  const gone = Object.keys(TOOLS).filter((_, i) => !found[i]);
  return gone.filter((t) => t !== "deno" || !gone.includes("am")) // one installer for both
    .map((tool) => ({ tool, how: TOOLS[tool]! }));
}

async function run(cmd: string, args: string[], cwd: string) {
  // Windows runs am through its .cmd shim — cmd.exe only ever sees our fixed words
  const [exe, argv] = OS === "windows" && cmd === "am"
    ? ["cmd", ["/d", "/c", "am", ...args]]
    : [cmd, args];
  let out: Deno.CommandOutput;
  try {
    out = await new Deno.Command(exe, {
      args: argv,
      cwd,
      stdin: "null",
      clearEnv: true,
      // no prompt may wait on a person: a git login window would hang the update check
      env: {
        ...env(),
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "never",
        NO_COLOR: "1",
      },
    }).output(); // a missing program throws here, synchronously
  } catch (e) {
    if (e instanceof Deno.errors.NotFound && !(await exists(cwd))) {
      throw new Error(`folder not found: ${cwd}`);
    }
    if (e instanceof Deno.errors.NotFound && TOOLS[cmd]) {
      throw new Error(`${cmd} is not installed — get it: ${TOOLS[cmd]}`);
    }
    throw e;
  }
  return {
    ok: out.success,
    out: dec(out.stdout).trim(),
    all: dec(out.stdout) + dec(out.stderr),
  };
}

/** run + append to the app's log + throw with the output tail on failure. */
async function sh(
  cmd: string,
  args: string[],
  cwd: string,
  log: string,
): Promise<string> {
  const r = await run(cmd, args, cwd);
  await Deno.writeTextFile(log, `$ ${cmd} ${args.join(" ")}\n${r.all}\n`, {
    append: true,
  });
  if (!r.ok) {
    throw new Error(
      cmd === "git" && NO_ACCESS.test(r.all)
        ? NO_ACCESS_MSG
        : `${cmd} ${args[0]} failed:\n${tail(r.all)}`,
    );
  }
  return r.out;
}

/** What git says when a repo needs a login (private) or does not exist. */
const NO_ACCESS =
  /could not read Username|Authentication failed|Repository not found|terminal prompts disabled/;
const NO_ACCESS_MSG =
  "no access — the repo is private (needs a git login) or gone";

const exists = (p: string) => Deno.stat(p).then(() => true, () => false);
const logOf = async (root: string, d: AppDef) => {
  await Deno.mkdir(root, { recursive: true });
  return join(root, `${d.id}.log`);
};

const MARK = ".aio-launcher";

/** Clones are reset and deleted only inside a folder the launcher owns: marked, or new/empty when first used. */
async function own(root: string): Promise<void> {
  if (await exists(join(root, MARK))) return;
  const empty = await Array.fromAsync(Deno.readDir(root)).then(
    (es) => es.length === 0,
    () => true, // missing
  );
  if (!empty && root !== DEFAULT_ROOT) {
    throw new Error(
      `${root} is not empty and not an aio-launcher folder — choose an empty one`,
    );
  }
  await Deno.mkdir(root, { recursive: true });
  await Deno.writeTextFile(
    join(root, MARK),
    "Managed by AIO APPS LAUNCHER: app clones here are reset and deleted.\n",
  );
}

/** Version fingerprint = the HEADs of every repo the app needs, space-joined. */
export async function remoteHead(d: AppDef): Promise<string> {
  const one = async (repo: string) => {
    const r = await run("git", ["ls-remote", "--", repo, "HEAD"], HOME);
    const head = r.out.split(/\s/)[0];
    if (!r.ok || !head) {
      throw new Error(
        NO_ACCESS.test(r.all)
          ? NO_ACCESS_MSG
          : tail(r.all, 2) || `${repo} has no HEAD`,
      );
    }
    return head;
  };
  return (await Promise.all(sourcesOf(d).map((x) => one(x.repo)))).join(" ");
}

/** Clone each repo, or move an existing clone to its remote HEAD. Returns the new fingerprint. */
export async function fetchRepo(appsDir: string, d: AppDef): Promise<string> {
  const root = rootOf(appsDir);
  await own(root);
  const log = await logOf(root, d);
  const heads: string[] = [];
  for (const src of sourcesOf(d)) {
    const dir = join(root, src.dir);
    if (await exists(join(dir, ".git"))) {
      // the URL, not `origin`: a leftover clone of a removed app may point elsewhere
      await sh("git", ["fetch", "--depth=1", "--", src.repo, "HEAD"], dir, log);
      await sh("git", ["reset", "--hard", "FETCH_HEAD"], dir, log); // launcher-owned clone
    } else {
      await sh("git", ["clone", "--depth=1", "--", src.repo, dir], root, log);
    }
    heads.push(await sh("git", ["rev-parse", "HEAD"], dir, log));
  }
  return heads.join(" ");
}

/** am fix links dep/aio (+ installs Electron for an offline app); then build the electron target. Returns the binary. */
export async function build(appsDir: string, d: AppDef): Promise<string> {
  const root = rootOf(appsDir),
    work = workOf(root, d),
    log = await logOf(root, d);
  // an online app starts from the shared Electron store: the build needs no Electron of its own
  const cfg = await Deno.readTextFile(join(work, "deno.json")).then(
    JSON.parse,
    () => null,
  );
  const online = cfg?.build?.electronRuntime === "online";
  await sh("am", online ? ["fix", "--no-download"] : ["fix"], work, log);
  // launcher ≤ 0.1.3 unpacked macOS apps into dist/*.open — the build refuses foreign files there
  const dist = join(work, "dist");
  for (const e of await Array.fromAsync(Deno.readDir(dist)).catch(() => [])) {
    if (e.name.endsWith(".open")) {
      await Deno.remove(join(dist, e.name), { recursive: true });
    }
  }
  if (d.prebuild) await sh("deno", ["task", d.prebuild], work, log);
  // not `compile`: its default target is per-app (mushradar: browser)
  await sh("deno", ["task", "build", "--targets=electron"], work, log);
  const bin = await artifactOf(work);
  if (!bin) {
    throw new Error(
      "build finished but dist/manifest.json names no electron artifact",
    );
  }
  return bin;
}

type Manifest = {
  targets?: { target: string; ok: boolean; artifacts?: { file: string }[] }[];
};

async function artifactOf(work: string): Promise<string | undefined> {
  const m: Manifest = await Deno.readTextFile(
    join(work, "dist", "manifest.json"),
  ).then(JSON.parse, () => ({}));
  const file = pickArtifact(
    (m.targets ?? []).filter((t) => t.ok && t.target.startsWith("electron"))
      .flatMap((t) => t.artifacts ?? []).map((a) => a.file),
    OS,
  );
  return file && await exists(join(work, "dist", file))
    ? join(work, "dist", file)
    : undefined;
}

/** What is already on disk: HEAD + built binary per app. */
export async function scan(
  appsDir: string,
  defs: AppDef[],
): Promise<
  Record<string, { commit: string; artifact: string; info: Info }>
> {
  const root = rootOf(appsDir);
  const one = async (d: AppDef) => {
    const heads = await Promise.all(
      sourcesOf(d).map(async (src) => {
        const r = await run("git", ["rev-parse", "HEAD"], join(root, src.dir))
          .catch(() => ({ ok: false, out: "" })); // no such folder
        return r.ok ? r.out : "";
      }),
    );
    const commit = heads.every(Boolean) ? heads.join(" ") : ""; // any repo missing = not installed
    return [d.id, {
      commit,
      artifact: await artifactOf(workOf(root, d)) ?? "",
      info: commit ? await localInfo(appsDir, d) : blankInfo(),
    }] as const;
  };
  return Object.fromEntries(await Promise.all(defs.map(one)));
}

/** An AppImage mounts itself with FUSE; where FUSE is missing it can unpack and run instead. */
const noFuse = async () =>
  OS === "linux" &&
  !(await exists("/dev/fuse") &&
    !!(await which("fusermount3") || await which("fusermount")));

/** Start a built app detached — it outlives the launcher. Throws when it quits failing right away. */
export async function open(
  appsDir: string,
  d: AppDef,
  artifact: string,
): Promise<void> {
  // macOS: the program inside the .app, run directly — `open` would drop our environment
  const exe = OS === "darwin"
    ? await macExe(join(rootOf(appsDir), ".open", d.id), artifact)
    : artifact;
  const child = new Deno.Command(exe, {
    stdin: "null",
    stdout: "null",
    stderr: "null",
    clearEnv: true,
    env: {
      ...env(),
      AIO_MOVE_TO_APPLICATIONS: "never", // the launcher owns where the app lives
      ...(await noFuse() ? { APPIMAGE_EXTRACT_AND_RUN: "1" } : {}),
    },
  }).spawn();
  child.unref();
  const quit = await Promise.race([
    child.status,
    new Promise<null>((r) => setTimeout(r, 5_000, null)),
  ]);
  if (quit && !quit.success) {
    throw new Error(
      `${
        basename(artifact)
      } quit at start (exit code ${quit.code}) — its log is in ⋯ → Profile Directory`,
    );
  }
}

/** macOS ships a .app inside an archive: unpack it into `dir` (again when the archive
 *  changed — never into dist/, which the next build refuses to empty), return its program. */
async function macExe(dir: string, archive: string): Promise<string> {
  const stamp = join(dir, ".from"),
    want = `${archive} ${(await Deno.stat(archive)).mtime?.getTime()}`;
  if (await Deno.readTextFile(stamp).catch(() => "") !== want) {
    await Deno.remove(dir, { recursive: true }).catch(() => {});
    await Deno.mkdir(dir, { recursive: true });
    const x = async (cmd: string, args: string[]) => {
      const r = await run(cmd, args, dir);
      if (!r.ok) throw new Error(`${cmd} failed:\n${tail(r.all)}`);
    };
    if (archive.endsWith(".dmg")) {
      const mnt = `${dir}.mnt`;
      await x("hdiutil", [
        "attach",
        "-nobrowse",
        "-readonly",
        "-mountpoint",
        mnt,
        archive,
      ]);
      try {
        await x("sh", ["-c", 'cp -R "$1"/*.app "$2"/', "sh", mnt, dir]);
      } finally {
        await run("hdiutil", ["detach", mnt], dir);
      }
    } else if (archive.endsWith(".zip")) {
      await x("ditto", ["-x", "-k", archive, dir]);
    } else await x("tar", ["-xzf", archive, "-C", dir]);
    await Deno.writeTextFile(stamp, want);
  }
  const app = (await Array.fromAsync(Deno.readDir(dir)))
    .find((e) => e.name.endsWith(".app"))?.name;
  if (!app) throw new Error(`no .app inside ${basename(archive)}`);
  const bin = join(dir, app, "Contents", "MacOS");
  const exe = (await Array.fromAsync(Deno.readDir(bin))).find((e) => e.isFile);
  if (!exe) throw new Error(`no program inside ${app}`);
  return join(bin, exe.name);
}

/** Hand a URL or folder to the desktop (browser / file manager). */
function launch(target: string): void {
  const [cmd, ...args] = OS === "darwin"
    ? ["open"]
    : OS === "windows"
    ? ["explorer"]
    : ["xdg-open"];
  new Deno.Command(cmd!, {
    args: [...args, target],
    stdin: "null",
    stdout: "null",
    stderr: "null",
    clearEnv: true,
    env: env(),
  }).spawn().unref();
}

/** Open one of an app's places. Throws when it does not exist (yet). */
export async function reveal(
  appsDir: string,
  d: AppDef,
  artifact: string,
  what: Place,
): Promise<void> {
  const work = workOf(rootOf(appsDir), d);
  const need = async (p: string, why: string) => {
    if (!p || !await exists(p)) throw new Error(why);
    return p;
  };
  const url = (u: string) => {
    if (!u) throw new Error(`${d.repo} has no web page`);
    return u;
  };
  launch(
    what === "readme"
      ? url(readmeOf(d))
      : what === "repo"
      ? url(webOf(d.repo))
      : what === "appDir"
      ? await need(
        artifact ? dirname(artifact) : work,
        `${d.name} is not installed`,
      )
      : await need(
        await profileOf(work),
        `${d.name} has no profile yet — open it once`,
      ),
  );
}

async function profileOf(work: string): Promise<string> {
  const cfg = await Deno.readTextFile(join(work, "deno.json")).then(
    JSON.parse,
    () => null,
  );
  return cfg ? join(HOME, `.${profileIdOf(cfg, basename(work))}`) : "";
}

/** Delete an app's clone, log and unpacked macOS copy, and its extra repos that no other app in `all` uses. Profile stays. */
export async function remove(
  appsDir: string,
  d: AppDef,
  all: AppDef[],
): Promise<void> {
  const root = rootOf(appsDir);
  await own(root);
  const shared = new Set(
    all.filter((x) => x.id !== d.id).flatMap(sourcesOf).map((x) => x.dir),
  );
  const dirs = sourcesOf(d).map((x) => x.dir).filter((x) => !shared.has(x));
  for (const p of [...dirs, `${d.id}.log`, join(".open", d.id)]) {
    await Deno.remove(join(root, p), { recursive: true }).catch((e) => {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    });
  }
}

// ── app info: icon, screenshot, versions ─────────────────────────────────────

const json = (t: string | null) => {
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
};
const firstOf = async <T>(xs: T[], ok: (x: T) => Promise<boolean>) => {
  for (const x of xs) if (await ok(x)) return x;
  return undefined;
};

/** Info from the installed copy. */
export async function localInfo(appsDir: string, d: AppDef): Promise<Info> {
  const root = rootOf(appsDir), repo = join(root, d.id), work = workOf(root, d);
  const text = (p: string) =>
    Deno.readTextFile(join(work, p)).catch(() => null);
  const has = (p: string) => exists(join(work, p));
  const git = (args: string[]) =>
    run("git", args, repo).then((r) => (r.ok ? r.out : ""), () => "");
  const built = join(work, ".aio", "build", "AppDir"); // aio's generated icon
  const gen = await Array.fromAsync(Deno.readDir(built)).then(
    (es) => es.find((e) => e.name.endsWith(".png"))?.name,
    () => undefined,
  );
  const shot = shotOf(await text("README.md") ?? "");
  return {
    rev: await git(["rev-parse", "HEAD"]),
    date: await git(["log", "-1", "--format=%cI"]),
    ...versionsOf(
      json(await text("deno.json")),
      d.dir
        ? json(
          await Deno.readTextFile(join(repo, "deno.json")).catch(() => null),
        )
        : null,
    ),
    icon: await firstOf(ICONS, has) ??
      (gen ? `.aio/build/AppDir/${gen}` : ""),
    shot: await firstOf([shot, "docs/screenshot.png"].filter(Boolean), has) ??
      "",
  };
}

const MAX = 8 << 20; // a README image bigger than this is not a thumbnail
/** GET a file, or null: failed, or over MAX (stopped at MAX, never buffered whole). */
const get = async (url: string): Promise<Uint8Array | null> => {
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) }).catch(
    () => null,
  );
  if (!r?.ok || !r.body || Number(r.headers.get("content-length")) > MAX) {
    await r?.body?.cancel();
    return null;
  }
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for await (const p of r.body) {
      size += p.length;
      if (size > MAX) {
        await r.body.cancel().catch(() => {});
        return null;
      }
      parts.push(p);
    }
  } catch {
    return null;
  }
  const b = new Uint8Array(size);
  parts.reduce((at, p) => (b.set(p, at), at + p.length), 0);
  return b;
};
const cacheOf = (root: string, id: string, path: string) =>
  join(root, ".media", id, path.replaceAll("/", "_"));

/** Info from the remote at `rev` (GitHub only); its icon + screenshot land in the media cache. */
export async function remoteInfo(
  appsDir: string,
  d: AppDef,
  rev: string,
): Promise<Info> {
  const base = rawOf(d, rev), root = rootOf(appsDir);
  if (!base) throw new Error(`${d.repo} is not on GitHub`);
  const text = async (url: string) => {
    const b = await get(url);
    return b && new TextDecoder().decode(b);
  };
  const cfg = await text(`${base}deno.json`);
  if (cfg === null) throw new Error(`no deno.json in ${d.repo}`);
  await Deno.mkdir(join(root, ".media", d.id), { recursive: true });
  const keep = async (path: string) => {
    const b = await get(base + path);
    if (b) await Deno.writeFile(cacheOf(root, d.id, path), b);
    return !!b;
  };
  const shot = shotOf(await text(`${base}README.md`) ?? "");
  return {
    rev,
    date: "",
    ...versionsOf(
      json(cfg),
      d.dir
        ? json(await text(`${rawOf({ ...d, dir: "" }, rev)}deno.json`))
        : null,
    ),
    icon: await firstOf(ICONS, keep) ?? "",
    shot: await firstOf([shot, "docs/screenshot.png"].filter(Boolean), keep) ??
      "",
  };
}

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** dir/rel with symlinks resolved — throws when it leaves dir (a repo can ship a symlink). */
async function inside(dir: string, rel: string): Promise<string> {
  const [base, p] = await Promise.all([
    Deno.realPath(dir),
    Deno.realPath(join(dir, rel)),
  ]);
  if (!p.startsWith(base + SEP)) throw new Error("outside the app folder");
  return p;
}

/** The /media route: an app's icon or screenshot, from its install or the cache. */
export async function media(
  appsDir: string,
  d: AppDef,
  r: Run | undefined,
  kind: Media,
): Promise<Response> {
  const root = rootOf(appsDir), local = !!(r?.commit && r.info.rev);
  const path = (local ? r!.info : r?.latest)?.[kind] ?? "";
  const type = TYPES[extname(path).toLowerCase()];
  const body = path && type
    ? await inside(
      local ? workOf(root, d) : join(root, ".media", d.id),
      local ? path : basename(cacheOf(root, d.id, path)),
    ).then((p) => Deno.readFile(p)).catch(() => null)
    : null;
  return body
    ? new Response(body, {
      headers: {
        "content-type": type!,
        "cache-control": "max-age=31536000, immutable", // the URL carries the rev
        "content-security-policy":
          "default-src 'none'; style-src 'unsafe-inline'", // an SVG from a repo runs nothing
        "x-content-type-options": "nosniff",
      },
    })
    : new Response("not found", { status: 404 });
}

// ── the launcher's own updates ───────────────────────────────────────────────

/** The newest GitHub release, mirrored in the layout aio's updater reads (`<dir>/prod/<os>-<arch>.json`). */
export const RELEASE_DIR = join(HOME, ".aio-launcher", "release");
const LATEST = Deno.env.get("AIO_LAUNCHER_RELEASES") ?? // a test release host
  "https://github.com/riagentic/aio-launcher/releases/latest/download/";
/** Run from source (deno is the process): nothing to swap — that is `git pull`. */
export const FROM_SOURCE = /^deno(\.exe)?$/i.test(basename(Deno.execPath()));

/** Copy the newest release's manifests for this machine; `withBuild` also the file they name. */
export async function mirrorRelease(withBuild: boolean): Promise<void> {
  const dir = join(RELEASE_DIR, "prod"), plat = `${OS}-${Deno.build.arch}`;
  await Deno.mkdir(dir, { recursive: true });
  const keep = new Set<string>();
  // a zip install reads the kind-specific manifest first, then the platform's
  for (const name of [`${plat}.json`, `${plat}.electron-zip.json`]) {
    const r = await fetch(LATEST + name, {
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status === 404) {
      await r.body?.cancel();
      continue; // this release has no such manifest
    }
    if (!r.ok) {
      await r.body?.cancel();
      throw new Error(`launcher release: HTTP ${r.status} for ${name}`);
    }
    const text = await r.text();
    await Deno.writeTextFile(join(dir, name), text);
    keep.add(name);
    const file = basename(String(JSON.parse(text).url ?? ""));
    if (!withBuild || !file) continue;
    keep.add(file);
    if (await exists(join(dir, file))) continue;
    const b = await fetch(LATEST + file);
    if (!b.ok || !b.body) {
      await b.body?.cancel();
      throw new Error(`launcher release: HTTP ${b.status} for ${file}`);
    }
    await Deno.writeFile(join(dir, `${file}.part`), b.body); // aio checks its sha256
    await Deno.rename(join(dir, `${file}.part`), join(dir, file));
  }
  // what the newest release does not name is an older one: gone, or it piles up
  for await (const e of Deno.readDir(dir)) {
    if (!keep.has(e.name) && (withBuild || e.name.endsWith(".json"))) {
      await Deno.remove(join(dir, e.name), { recursive: true });
    }
  }
}
