import { applyAppearance, systemDark } from "./appearance.js";
import { settingsDialog } from "./settings.js";
import { installedVersion } from "./version.js";
import { weatherReadout } from "./weather.js";
import { chevronOptions } from "./chevron-options.js";
import { clockReading, minuteClock } from "./clock.js";
import {
  preferences,
  previousEngine,
  readSaved,
  watchSaved,
  writeSaved,
} from "./preferences.js";
import { engineTemplates } from "./search.js";

// The original bundle owns its localStorage keys. Recover malformed values
// into separate keys before the bundle attempts to parse them on startup.
for (const [key, valid] of [
  [
    "settings",
    (data) => data && typeof data === "object" && !Array.isArray(data),
  ],
  [
    "history",
    (data) =>
      Array.isArray(data) &&
      data.every((entry) => entry && typeof entry.id === "string"),
  ],
]) {
  const raw = localStorage.getItem(key);
  if (!raw) continue;
  try {
    if (!valid(JSON.parse(raw))) throw Error();
  } catch {
    localStorage.setItem("startpage.recovered." + key, raw);
    localStorage.removeItem(key);
  }
}
const defaults = await fetch("config.json").then((response) => response.json());
const engines = engineTemplates(window.CONFIG);
const engineKeys = new Map(
  Object.entries(window.CONFIG.engines).map(([id, entry]) => [entry.name, id]),
);
for (const [name, template] of Object.entries(engines)) {
  if (engineKeys.has(name)) continue;
  const original = window.CONFIG.engines.google;
  window.CONFIG.engines[name] = {
    ...original,
    name,
    types: {
      query: { template },
      calculator: { template: template.replace("{$}", "{@}") },
      currency: { template: template.replace("{$}", "{@}") },
    },
  };
  engineKeys.set(name, name);
}
const { classicSchema, readClassicOptions, renderClassic } = await import(
  "../script.js"
);
const greeting = document.querySelector("#classic-greeting");
const gear = document.querySelector("#preferences");
gear.innerHTML = window.ICONS.settings;
const updateWeather = weatherReadout(document.querySelector("#weather"));
let config,
  savedLayout,
  revision = 0;
let saving = false;
let leaving = false;

function returnToDesk() {
  if (leaving) return;
  leaving = true;
  location.replace("index.html");
}
const tick = minuteClock((date) => {
  if (!config) return;
  greeting.hidden = config.disableMessage;
  greeting.textContent = clockReading(date, config).greeting;
});

function render() {
  applyAppearance(config);
  const local = readClassicOptions();
  local.general.searchEngine = engineKeys.get(config.searchEngine);
  local.general.redirectTarget = config.linkInNewTab ? "_blank" : "_self";
  if (local.menu.time.format === "h:MM") local.sharedClock = config;
  const scheme = document.documentElement.dataset.colorScheme;
  const palettes = local.appearance.themes;
  const palette = {
    ...(palettes[local.appearance.activeTheme] || palettes.default)[scheme],
  };
  if (["glass", "mac-terminal", "vintage-windows"].includes(config.visualTheme)) {
    const css = getComputedStyle(document.documentElement);
    const color = (name) => css.getPropertyValue("--" + name).trim();
    Object.assign(palette, {
      primary: color("ink"),
      chevron: color("accent"),
      secondary: color("paper"),
      background: color("paper"),
      query: color("ink"),
      suggestions: color("muted"),
      time: color("ink"),
      prefix: color("accent"),
      visited: color("accent"),
    });
  }
  renderClassic(local, scheme, palette);
  gear.hidden = !config.settingsIcon;
  updateWeather(config);
  tick();
}

async function load() {
  const current = ++revision;
  const saved = await readSaved().catch(() => ({}));
  if (current !== revision || saving || leaving) return;
  config = preferences(
    { searchEngine: previousEngine(window.CONFIG), ...saved },
    defaults,
    engines,
  );
  // Direct links can preview Classic. Follow a subsequent saved layout switch.
  if (savedLayout === "classic" && config.layout === "desk") {
    returnToDesk();
    return;
  }
  savedLayout = config.layout;
  render();
}

async function save(patch, edits) {
  saving = true;
  try {
    await navigator.locks.request("startpage-chevron-options", async () => {
      const before = localStorage.getItem("settings");
      const localChanged = edits.reset || edits.fields.length > 0;
      if (localChanged) {
        const next = readClassicOptions(edits.reset);
        for (const [path, value] of edits.fields) {
          const group = path
            .slice(0, -1)
            .reduce((node, key) => node[key], next);
          group[path.at(-1)] = value;
        }
        localStorage.setItem("settings", JSON.stringify(next));
      }
      try {
        await writeSaved(patch);
      } catch (error) {
        if (localChanged) {
          if (before === null) localStorage.removeItem("settings");
          else localStorage.setItem("settings", before);
        }
        throw error;
      }
      if (edits.clearHistory) localStorage.removeItem("history");
    });
  } finally {
    saving = false;
  }
  if (patch.layout === "desk") returnToDesk();
  else if (edits.clearHistory) location.reload();
  else await load();
}

const showSettings = await settingsDialog({
  get: () => ({ ...config, layout: "classic" }),
  validate: (input) => preferences(input, defaults, engines, true),
  engines,
  version: await installedVersion(),
  save,
  classicOptions: chevronOptions(classicSchema, readClassicOptions),
});
gear.onclick = showSettings;
const dialog = document.querySelector("#settings");
// Keep Chevron's window-level shortcuts and autofocus inside the launcher.
for (const type of ["keydown", "keyup", "keypress", "contextmenu", "click"])
  dialog.addEventListener(type, (event) => event.stopPropagation());
document.addEventListener(
  "keydown",
  (event) => {
    if (!config || event.isComposing || dialog.open) return;
    const command =
      event.key === "Enter" &&
      event.target.matches("#root input") &&
      event.target.value.trim() === "--settings";
    if (command || ((event.metaKey || event.ctrlKey) && event.key === ",")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showSettings();
    }
  },
  true,
);
watchSaved(load);
window.addEventListener("storage", (event) => {
  if (event.key === "settings" && config) render();
});
systemDark.addEventListener("change", () => {
  if (config) render();
});
await load();
