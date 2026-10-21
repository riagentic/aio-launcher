// Entry — wiring only.
import { launcher } from "./cell.ts";
import { aio } from "aio";

const io = () => import("./launcher.server.ts");

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
  }],
  onStart: async () => {
    await launcher.scan();
    void launcher.check(); // network — must not hold up boot
  },
  electron: { ignoreDebugEnv: true, strictPin: true },
  wire: { refuseShortCalls: true },
});
