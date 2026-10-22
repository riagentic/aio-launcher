import { assertEquals } from "@std/assert";
import {
  actionOf,
  blankInfo,
  blankRun,
  checkDef,
  DEFAULT_APPS,
  idOf,
  mediaUrl,
  pickArtifact,
  profileIdOf,
  rawOf,
  readmeOf,
  repoName,
  shotOf,
  sourcesOf,
  versionLabel,
  versionsOf,
  viewOf,
  webOf,
} from "../src/apps.ts";

const run = (o: Partial<ReturnType<typeof blankRun>>) => ({
  ...blankRun(),
  ...o,
});

Deno.test("actionOf: the one button", () => {
  assertEquals(actionOf(undefined), "install");
  assertEquals(actionOf(run({ busy: true })), "busy");
  assertEquals(
    actionOf(run({ commit: "a", artifact: "/x", busy: true })),
    "busy",
  );
  assertEquals(actionOf(run({ commit: "a", artifact: "/x" })), "open");
  assertEquals(
    actionOf(run({ commit: "a", artifact: "/x", remote: "a" })),
    "open",
  );
  assertEquals(
    actionOf(run({ commit: "a", artifact: "/x", remote: "b" })),
    "update",
  );
  assertEquals(actionOf(run({ commit: "a" })), "install"); // cloned, build failed → retry
});

Deno.test("idOf slugs names", () => {
  assertEquals(idOf("  My App! v2 "), "my-app-v2");
  assertEquals(idOf("!!!"), "");
});

Deno.test("checkDef refuses what would reach git or the filesystem", () => {
  const d = {
    id: "x",
    name: "x",
    repo: "https://github.com/a/b",
    dir: "",
    about: "",
    extras: [],
    prebuild: "",
  };
  assertEquals(checkDef(d, DEFAULT_APPS), true);
  assertEquals(checkDef({ ...d, dir: "sub/app" }, []), true);
  assertEquals(checkDef({ ...d, repo: "git@github.com:a/b.git" }, []), true);
  assertEquals(typeof checkDef({ ...d, id: "" }, []), "string");
  assertEquals(typeof checkDef({ ...d, id: "amui" }, DEFAULT_APPS), "string");
  assertEquals(typeof checkDef({ ...d, prebuild: "-x" }, []), "string"); // no flags
  assertEquals(typeof checkDef({ ...d, id: "word" }, DEFAULT_APPS), "string"); // bsv's extra folder
  assertEquals(
    typeof checkDef({ ...d, repo: "--upload-pack=x" }, []),
    "string",
  );
  assertEquals(typeof checkDef({ ...d, repo: "https://a b" }, []), "string");
  assertEquals(typeof checkDef({ ...d, dir: "../etc" }, []), "string");
  assertEquals(typeof checkDef({ ...d, dir: "/abs" }, []), "string");
});

Deno.test("extras: folder names, sources, and refusals", () => {
  assertEquals(repoName("https://github.com/riagentic/word"), "word");
  assertEquals(repoName("git@github.com:a/word.git/"), "word");
  const bsv = DEFAULT_APPS.find((d) => d.id === "bsv")!;
  assertEquals(sourcesOf(bsv).map((x) => x.dir), ["bsv", "word"]);
  const d = { ...bsv, id: "x" };
  assertEquals(checkDef(d, []), true);
  assertEquals(
    typeof checkDef({ ...d, extras: ["https://a/.."] }, []),
    "string",
  );
  assertEquals(
    typeof checkDef({ ...d, extras: ["https://a/x"] }, []),
    "string",
  ); // named like the app
  assertEquals(
    typeof checkDef({ ...d, prebuild: "a; rm -rf /" }, []),
    "string",
  );
});

Deno.test("web URLs, README, profile id", () => {
  assertEquals(
    webOf("https://github.com/riagentic/cc"),
    "https://github.com/riagentic/cc",
  );
  assertEquals(webOf("git@github.com:a/b.git"), "https://github.com/a/b");
  assertEquals(
    webOf("ssh://git@github.com/a/b.git/"),
    "https://github.com/a/b",
  );
  assertEquals(webOf("/home/me/repo"), "");
  const amui = DEFAULT_APPS.find((d) => d.id === "amui")!;
  assertEquals(
    readmeOf(amui),
    "https://github.com/riagentic/aio/blob/HEAD/amui/README.md",
  );
  assertEquals(readmeOf({ ...amui, repo: "/local", dir: "" }), "");
  assertEquals(profileIdOf({ appId: "rib", title: "Bible" }, "bsv"), "rib");
  assertEquals(
    profileIdOf({ title: "Claude Control" }, "cc"),
    "claude-control",
  );
  assertEquals(profileIdOf({ name: "@x/spacy" }, "s"), "spacy");
  assertEquals(profileIdOf({}, "My App"), "my-app");
});

Deno.test("versionsOf: own aioVersion, else the aio repo's version", () => {
  assertEquals(
    versionsOf({ version: "0.4", aioVersion: "v1.0.22-beta" }, null),
    {
      version: "0.4",
      aio: "1.0.22-beta",
    },
  );
  assertEquals(
    versionsOf({ version: "0.1.0" }, {
      name: "@riagentic/aio",
      version: "1.0.22-beta",
    }),
    { version: "0.1.0", aio: "1.0.22-beta" },
  );
  assertEquals(versionsOf(null, { name: "x", version: "9" }), {
    version: "",
    aio: "",
  });
});

Deno.test("shotOf: first local README image, never a URL or ../", () => {
  assertEquals(
    shotOf("![a](https://x/y.png)\n![b](./docs/s.png)"),
    "docs/s.png",
  );
  assertEquals(
    shotOf('<img width="9" src="docs/shot.webp">'),
    "docs/shot.webp",
  );
  assertEquals(shotOf("![a](../../etc/x.png) ![b](/abs.png) ![c](a.txt)"), "");
});

Deno.test("rawOf: GitHub raw base with the app folder", () => {
  const amui = DEFAULT_APPS.find((d) => d.id === "amui")!;
  assertEquals(
    rawOf(amui, "abc"),
    "https://raw.githubusercontent.com/riagentic/aio/abc/amui/",
  );
  assertEquals(rawOf({ ...amui, repo: "/srv/git/x" }), "");
});

Deno.test("versionLabel + mediaUrl: installed vs remote info", () => {
  const info = {
    ...blankInfo(),
    rev: "a",
    version: "0.3",
    icon: "src/icon.png",
  };
  const r = {
    ...blankRun(),
    commit: "a",
    remote: "b",
    artifact: "/x",
    info,
    latest: { ...info, rev: "b", version: "0.4" },
  };
  assertEquals(versionLabel(r), "v0.3 → v0.4");
  assertEquals(versionLabel({ ...r, remote: "a" }), "v0.3");
  assertEquals(versionLabel({ ...blankRun(), latest: r.latest }), "v0.4");
  assertEquals(mediaUrl("x", r, "icon"), "/media/x/icon?v=a%3Asrc%2Ficon.png");
  assertEquals(mediaUrl("x", r, "shot"), "");
});

Deno.test("viewOf: search, then sort", () => {
  const runs = { mdview: { ...blankRun(), commit: "a", remote: "b" } };
  const ids = (q: string, s: "name" | "status") =>
    viewOf(DEFAULT_APPS, runs, q, s).map((d) => d.id);
  assertEquals(ids("markdown", "name"), ["mdview"]);
  assertEquals(ids("", "status")[0], "mdview"); // the update comes first
  assertEquals(ids("", "name")[0], "amui");
});

Deno.test("pickArtifact: the file that opens on each OS", () => {
  const f = ["a.zip", "a.exe", "a.AppImage", "a.dmg", "a.app.tar.gz"];
  assertEquals(pickArtifact(f, "linux"), "a.AppImage");
  assertEquals(pickArtifact(f, "windows"), "a.exe"); // not the zip
  assertEquals(pickArtifact(f, "darwin"), "a.app.tar.gz");
  assertEquals(pickArtifact(["a.zip"], "linux"), "");
});
