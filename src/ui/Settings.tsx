// Settings — where apps are installed + the app list (add / remove).
import type { JSX } from "aio";
import { Link, useLocal } from "aio/air";
import { Field, Input, toast } from "aio/ui";
import { type AppDef, idOf } from "../apps.ts";
import { launcher } from "../cell.ts";
import { BackIcon } from "./icons.tsx";

const fail = (e: Error) => toast(e.message, { variant: "error" });
const EMPTY = {
  name: "",
  repo: "",
  dir: "",
  about: "",
  extras: "",
  prebuild: "",
};

export function Settings(): JSX.Element {
  const [dir, setDir] = useLocal<string | null>(null); // null = not edited: show the saved value
  const [form, setForm] = useLocal(EMPTY);
  const set = (k: keyof typeof EMPTY) => (v: string) =>
    setForm({ ...form, [k]: v });
  const add = () => {
    const d: AppDef = {
      id: idOf(form.name),
      name: form.name.trim(),
      repo: form.repo.trim(),
      dir: form.dir.trim().replace(/^\/+|\/+$/g, ""),
      about: form.about.trim(),
      extras: form.extras.split(/[\s,]+/).filter(Boolean),
      prebuild: form.prebuild.trim(),
    };
    launcher.addApp(d).then(() => setForm(EMPTY), fail);
  };
  return (
    <div class="stack settings">
      <header class="page-head">
        <Link
          to="/"
          class="back"
          aria-label="Back to apps"
          title="Back to apps"
        >
          <BackIcon />
        </Link>
        <h1>Settings</h1>
      </header>
      <section class="card stack">
        <h2>Install folder</h2>
        <form
          class="row"
          onSubmit={() =>
            launcher.setAppsDir(dir ?? "").then(() => {
              setDir(null);
              launcher.check().catch(fail); // update info + media for the new folder
            }, fail)}
        >
          <Input
            class="grow"
            aria-label="Install folder"
            placeholder="~/.aio-launcher/apps (default)"
            value={dir ?? launcher.appsDir}
            onInput={setDir}
          />
          <button type="submit" class="primary" disabled={dir === null}>
            Save
          </button>
        </form>
      </section>

      <section class="card stack">
        <h2>Apps</h2>
        <ul class="list">
          {launcher.registry.map((d) => (
            <li key={d.id} class="row">
              <div class="grow">
                <strong>{d.name}</strong>{" "}
                <span class="muted small">{d.about}</span>
                <div class="muted small mono">
                  {d.repo}
                  {d.dir ? ` · ${d.dir}/` : ""}
                  {d.extras.map((e) => ` + ${e}`).join("")}
                  {d.prebuild ? ` · deno task ${d.prebuild}` : ""}
                </div>
              </div>
              <button
                type="button"
                class="ghost"
                aria-label={`Remove ${d.name}`}
                onClick={() => launcher.removeApp(d.id).catch(fail)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <form class="stack" onSubmit={add}>
          <h3>Add app</h3>
          <div class="row">
            <Field label="Name">
              <Input
                value={form.name}
                onInput={set("name")}
                placeholder="mdview"
              />
            </Field>
            <Field label="Repository">
              <Input
                value={form.repo}
                onInput={set("repo")}
                placeholder="https://github.com/riagentic/mdview"
              />
            </Field>
          </div>
          <div class="row">
            <Field label="Subfolder">
              <Input
                value={form.dir}
                onInput={set("dir")}
                placeholder="optional, e.g. amui"
              />
            </Field>
            <Field label="Description">
              <Input value={form.about} onInput={set("about")} />
            </Field>
          </div>
          <div class="row">
            <Field label="Extra repos">
              <Input
                value={form.extras}
                onInput={set("extras")}
                placeholder="optional, cloned beside the app"
              />
            </Field>
            <Field label="Build step">
              <Input
                value={form.prebuild}
                onInput={set("prebuild")}
                placeholder="optional deno task, run before the build"
              />
            </Field>
          </div>
          <div>
            <button
              type="submit"
              class="primary"
              disabled={!form.name.trim() || !form.repo.trim()}
            >
              Add
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
