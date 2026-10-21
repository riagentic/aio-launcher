# AIO APPS LAUNCHER

Install, update and open [aio](https://github.com/riagentic/aio) desktop apps
from one window. Each app is cloned from git and built on your machine.

![AIO APPS LAUNCHER: app cards with icons, screenshots and versions](docs/screenshot.png)

## Features

- 🧩 One card per app: icon, screenshot, version, aio version, last update
- ▶️ One button: **Install** → **Update to vX** → **Open**
- ⋯ Menu: Readme · Open · App / Profile directory · Reinstall · Uninstall ·
  GitHub
- 🔄 Hourly update check (`git ls-remote`), **Update all**
- 🔎 Search, sort, grid / compact / list views
- ⚙️ Settings: install folder, add / remove apps (any git repo, subfolder, extra
  repos, pre-build task)
- 🛎️ Tray icon — closing the window keeps it running

## Apps

amui · bsv · cc · fixable · fjssm · llama.master · machine · mdview · mushradar
· netmap · protector · spacy · writy

## Requirements

`git`, `deno` and [`am`](https://github.com/riagentic/aio) on `PATH`. Some apps
need more to build (e.g. `machine`: Rust + `wasm32-unknown-unknown`).

> ⚠️ Installing an app runs its repo's own build code. Add only repos you trust.

## Run

```sh
am fix                             # link the framework, install Electron
am start --client=electron         # or: deno task dev
deno task compile                  # AppImage → dist/
```

Apps go to `~/.aio-launcher/apps` (change it in Settings).

## How an app is installed

1. `git clone --depth=1` (plus any extra repos beside it)
2. `am fix`
3. `deno task <pre-build>` if set
4. `deno task build --targets=electron` → the Electron artifact in `dist/`

Card info comes from the app's own files: `deno.json` (`version`, `aioVersion`),
its icon (`src/icon.svg|png`, `assets/icon.*`), and the first image in its
`README.md` (or `docs/screenshot.png`). Apps not yet installed are read from
GitHub.

## Develop

```sh
deno task check && deno task lint && deno task test
```

## License

[MIT](LICENSE)
