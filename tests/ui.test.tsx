import { testUI } from "aio/testing";
import App from "../src/App.tsx";
import { launcher, type State } from "../src/cell.ts";

testUI(
  App,
  "cards show Install; settings adds and removes an app",
  async (ui) => {
    await ui.waitFor(() =>
      ui["go-amui"].text === "Install" && ui["go-mdview"].text === "Install"
    );
    ui.SettingsLink.click();
    ui.NameInput.type("Demo App");
    ui.RepositoryInput.type("https://github.com/a/demo");
    ui.AddButton.click();
    await ui.expectCell(
      launcher,
      (s: State) => s.registry.some((d) => d.id === "demo-app"),
    );
    ui.RemoveDemoAppButton.click();
    await ui.expectCell(
      launcher,
      (s: State) => !s.registry.some((d) => d.id === "demo-app"),
    );
    ui.BackToAppsLink.click();
    await ui.waitFor(() => ui.present("go-amui"));
  },
);

testUI(
  App,
  '"..." menu: not-installed app offers only web items',
  async (ui) => {
    ui.MoreActionsForAmuiButton.click();
    await ui.waitFor(() => ui.present("ReadmeMenuitem"));
    for (const off of ["Open", "AppDirectory", "Reinstall", "Uninstall"]) {
      if (!ui[`${off}Menuitem`].disabled) {
        throw new Error(
          `${off} should be disabled`,
        );
      }
    }
    if (ui.ReadmeMenuitem.disabled || ui.GithubRepositoryMenuitem.disabled) {
      throw new Error("web items should be enabled");
    }
  },
);
