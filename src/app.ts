// Entry — wiring only.
import { launcher } from "./cell.ts";
import { aio } from "aio";
import { toFileUrl } from "@std/path";

const io = () => import("./launcher.server.ts");
const { FROM_SOURCE, RELEASE_DIR } = await io();

await aio.run({
  ui: {
    theme: "full",
    title: "AIO APPS LAUNCHER",
    width: 1200,
    height: 820,
    // closing the window hides it; Quit lives in the tray menu
    tray: {
      tooltip: "AIO APPS LAUNCHER",
      menu: [
        { label: "Check for updates", method: "launcher:check" },
        { label: "Update all", method: "launcher:updateAll" },
        { label: "Settings", route: "/settings" },
        "-",
      ],
      closeToTray: true,
    },
  },
  routes: {
    // /media/<id>/<icon|shot> — app icons + screenshots for the cards
    "/media/*": async (req) => {
      const [, , id, kind] = new URL(req.url).pathname.split("/");
      const d = launcher.registry.find((x) => x.id === id);
      return d && (kind === "icon" || kind === "shot")
        ? (await io()).media(launcher.appsDir, d, launcher.runs[d.id], kind)
        : new Response("not found", { status: 404 });
    },
  },
  schedules: [{
    id: "check",
    every: 3_600_000,
    action: launcher.check.action(),
  }, {
    id: "selfCheck",
    every: 6 * 3_600_000,
    action: launcher.selfCheck.action(),
  }],
  onStart: async () => {
    await launcher.scan();
    void launcher.check(); // network — must not hold up boot
    void launcher.selfCheck();
  },
  // a release build updates from the newest GitHub release, mirrored locally by
  // launcher.selfCheck (aio reads a directory; release assets are flat)
  updates: FROM_SOURCE ? undefined : {
    source: toFileUrl(RELEASE_DIR).href,
    allowUnsigned: true, // releases come over HTTPS from the repo itself, like its source
    check: false, // selfCheck mirrors first, then asks
  },
  electron: { ignoreDebugEnv: true, strictPin: true },
  wire: { refuseShortCalls: true },
});
