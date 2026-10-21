import { assertEquals, assertStringIncludes } from "@std/assert";
import { testCell } from "aio/testing";
import { DEFAULT_APPS } from "../src/apps.ts";
import { launcher } from "../src/cell.ts";

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
