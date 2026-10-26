// Root — navbar + two screens.
import type { JSX } from "aio";
import { Link, Route } from "aio/air";
import { ToastHost } from "aio/ui";
import { launcher } from "./cell.ts";
import { Home } from "./ui/Home.tsx";
import { Settings } from "./ui/Settings.tsx";
import { GearIcon, Mark, RefreshIcon } from "./ui/icons.tsx";
import { SelfUpdate } from "./ui/SelfUpdate.tsx";

export default function App(): JSX.Element {
  return (
    <>
      <nav class="nav">
        <Link to="/" class="brand">
          <Mark />
          AIO APPS LAUNCHER
        </Link>
        <span class="grow" />
        <SelfUpdate />
        <button
          type="button"
          class="icon ghost"
          aria-label="Check for updates"
          title="Check for updates"
          disabled={launcher.checking}
          onClick={() => {
            launcher.check();
            launcher.selfCheck();
          }}
        >
          <RefreshIcon spin={launcher.checking} />
        </button>
        <Link
          to="/settings"
          class="icon"
          aria-label="Settings"
          title="Settings"
        >
          <GearIcon />
        </Link>
      </nav>
      <main>
        <Route path="/" element={<Home />} />
        <Route path="/settings" element={<Settings />} />
      </main>
      <footer class="foot mono">
        {launcher.checking
          ? "Checking for updates…"
          : launcher.checkedAt
          ? `Checked ${
            new Date(launcher.checkedAt).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })
          } · ${launcher.registry.length} apps · from GitHub`
          : `${launcher.registry.length} apps`}
      </footer>
      <ToastHost />
    </>
  );
}
