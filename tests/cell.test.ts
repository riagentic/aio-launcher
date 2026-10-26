import { assertEquals, assertStringIncludes } from "@std/assert";
import { testCell } from "aio/testing";
import { DEFAULT_APPS } from "../src/apps.ts";
import { launcher, migrate, type State } from "../src/cell.ts";

const app = {
  id: "demo",
  name: "demo",
  repo: "https://github.com/a/demo",
  dir: "",
  about: "",
  extras: [],
  prebuild: "",
};

testCell(launcher, "add, refuse, remove", async (t) => {
  t.expect.state((s) => s.registry.length === DEFAULT_APPS.length);
  t.send.addApp(app);
  t.expect.state((s) => s.registry.at(-1)?.id === "demo");
  await t.expect.rejects(() => t.send.addApp(app), /already/);
  await t.expect.rejects(
    () => t.send.addApp({ ...app, id: "evil", repo: "--upload-pack=x" }),
    /repository/,
  );
  t.send.removeApp("demo");
  t.expect.state((s) => !s.registry.some((d) => d.id === "demo"));
});

testCell(
  launcher,
  "scan an empty folder, install failure is shown, open refuses unbuilt",
  async (t) => {
    const dir = await Deno.makeTempDir();
    const repo = `${dir}/src`; // a git repo with no aio app in it: clone works, am fix/compile fail
    await Deno.mkdir(repo);
    for (
      const args of [["init", "-q"], [
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@t",
        "commit",
        "-q",
        "--allow-empty",
        "-m",
        "x",
      ]]
    ) {
      await new Deno.Command("git", { args, cwd: repo }).output();
    }
    await t.send.setAppsDir(`${dir}/apps`);
    t.expect.state((s) =>
      s.appsDir === `${dir}/apps` && s.runs.amui?.commit === ""
    );
    t.send.addApp({ ...app, repo });
    await t.send.install("demo");
    const r = t.state.runs.demo!;
    assertEquals([r.busy, r.artifact, r.commit.length], [false, "", 40]);
    assertStringIncludes(r.error, "failed");
    await t.expect.rejects(() => t.send.open("demo"), /not built/);
    await t.expect.rejects(
      () => t.send.reveal("demo", "nowhere" as never),
      /unknown place/,
    );
    await t.expect.rejects(() => t.send.reveal("demo", "repo"), /no web page/); // a local repo
    await t.expect.rejects(
      () => t.send.reveal("demo", "profileDir"),
      /no profile/,
    );
    await t.send.uninstall("demo");
    t.expect.state((s) =>
      s.runs.demo?.commit === "" && s.runs.demo.error === ""
    );
    assertEquals(
      (await Array.fromAsync(Deno.readDir(`${dir}/apps`))).map((e) => e.name),
      [".aio-launcher"], // only the ownership marker is left
    );
    await t.send.reinstall("demo"); // clones again, the build fails again: shown, not thrown
    t.expect.state((s) =>
      s.runs.demo?.commit.length === 40 && s.runs.demo.error !== ""
    );
    // a folder with someone else's files is never cloned into or cleaned
    await Deno.mkdir(`${dir}/mine/demo`, { recursive: true });
    await t.send.setAppsDir(`${dir}/mine`);
    await t.send.install("demo");
    assertStringIncludes(
      t.state.runs.demo!.error,
      "not an aio-launcher folder",
    );
    await t.expect.rejects(() => t.send.setAppsDir("apps"), /absolute/);
    await Deno.remove(dir, { recursive: true });
  },
);

const git = (cwd: string, ...args: string[]) =>
  new Deno.Command("git", { args, cwd }).output();
const commit = (cwd: string) =>
  git(
    cwd,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    cwd, // repos made in the same second must still differ
  );

testCell(launcher, "update all queues every app at once", async (t) => {
  const dir = await Deno.makeTempDir();
  const ids = ["one", "two"];
  for (const id of ids) {
    await Deno.mkdir(`${dir}/${id}`);
    await git(`${dir}/${id}`, "init", "-q");
    await commit(`${dir}/${id}`);
  }
  await t.send.setAppsDir(`${dir}/apps`);
  t.state.registry.forEach((d) => t.send.removeApp(d.id)); // only the two local apps
  for (const id of ids) {
    t.send.addApp({ ...app, id, name: id, repo: `${dir}/${id}` });
    await t.send.install(id); // clones; the build fails (no aio app) — the commit still lands
    await commit(`${dir}/${id}`); // a newer HEAD upstream
  }
  await t.send.check();
  t.expect.state((s) =>
    ids.every((id) => s.runs[id]!.remote !== s.runs[id]!.commit)
  );
  const all = t.send.updateAll();
  await new Promise((r) => setTimeout(r, 0)); // its first commit lands; the first build is still spawning
  assertEquals(ids.map((id) => t.state.runs[id]!.busy), [true, true]); // live, mid-call: all queued
  await all;
  t.expect.state((s) =>
    ids.every((id) =>
      !s.runs[id]!.busy && s.runs[id]!.remote === s.runs[id]!.commit
    )
  );
  await Deno.remove(dir, { recursive: true });
});

testCell(
  launcher,
  "re-added id builds its new repo, a failed check keeps the install error, a missing subfolder says so",
  async (t) => {
    const dir = await Deno.makeTempDir();
    for (const id of ["a", "b"]) {
      await Deno.mkdir(`${dir}/${id}`);
      await git(`${dir}/${id}`, "init", "-q");
      await commit(`${dir}/${id}`);
    }
    const head = async (id: string) =>
      new TextDecoder().decode(
        (await new Deno.Command("git", {
          args: ["rev-parse", "HEAD"],
          cwd: `${dir}/${id}`,
        }).output()).stdout,
      ).trim();
    await t.send.setAppsDir(`${dir}/apps`);
    t.send.addApp({ ...app, repo: `${dir}/a` });
    await t.send.install("demo");
    t.send.removeApp("demo"); // the clone stays on disk
    t.send.addApp({ ...app, repo: `${dir}/b` });
    await t.send.install("demo");
    assertEquals(t.state.runs.demo!.commit, await head("b"));
    const built = t.state.runs.demo!.error;
    assertStringIncludes(built, "failed");
    await Deno.remove(`${dir}/b`, { recursive: true }); // its remote is gone
    await t.send.check();
    assertEquals(t.state.runs.demo!.error, built);
    t.send.addApp({
      ...app,
      id: "sub",
      name: "sub",
      repo: `${dir}/a`,
      dir: "nope",
    });
    await t.send.install("sub");
    assertStringIncludes(t.state.runs.sub!.error, "folder not found");
    await Deno.remove(dir, { recursive: true });
  },
);

Deno.test("migrate: a v2 store gets every default but ayd as offered", () => {
  const s: State = {
    registry: DEFAULT_APPS,
    offered: ["x"],
    appsDir: "",
    runs: {},
    checking: false,
    checkedAt: 0,
    missing: [],
  };
  const ids = (from: number) => migrate(s, from).offered;
  assertEquals(ids(2).includes("amui"), true);
  for (const id of ["ayd", "calcaio"]) assertEquals(ids(2).includes(id), false); // added after v2
  assertEquals(ids(3), ["x"]);
});
