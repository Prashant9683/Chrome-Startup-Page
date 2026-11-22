import { homepage } from "./homepage.js";
import { applyAppearance, systemDark } from "./appearance.js";
import { catalogFor, engineTemplates } from "./search.js";
import { brandPreview } from "./brand.js";
import {
  preferences,
  previousEngine,
  readSaved,
  watchSaved,
  writeSaved,
} from "./preferences.js";
import { shortcutLibrary } from "./library.js";
import { settingsDialog } from "./settings.js";
import { searchBox } from "./autocomplete.js";
import { clockReading, minuteClock } from "./clock.js";
import { landscapeScene, mountainLandscape } from "./landscape.js";
import { weatherReadout } from "./weather.js";
import { installedVersion } from "./version.js";

const $ = (selector) => document.querySelector(selector);
const engines = engineTemplates(window.CONFIG);
const library = $("#library");
const icons = window.ICONS;
$('[data-icon="settings"]').innerHTML = icons.settings;
const defaults = await fetch("config.json").then((response) => response.json());
let config,
  sites,
  currentWeather,
  loadNumber = 0;
let switchingLayout = false;
const drawLandscape = mountainLandscape($("#landscape"));
const tick = minuteClock(updateClock);
const updateWeather = weatherReadout($("#weather"), data => {
  currentWeather = data;
  tick();
});
function notice(message) {
  $("#notice").textContent = message;
  $("#notice").hidden = !message;
}
function icon(site) {
  const span = document.createElement("span");
  span.className = "site-icon";
  span.setAttribute("aria-hidden", "true");
  // Only packaged artwork may become markup. Imported link names are text.
  if (Object.hasOwn(icons, site.icon)) {
    span.innerHTML = icons[site.icon];
  } else span.textContent = site.name?.slice(0, 1).toUpperCase() || "↗";
  return span;
}
function visit(site, newTab = false) {
  const separate = site.newTab ?? (site.id ? config.linkInNewTab : false);
  if (newTab || separate)
    window.open(site.url, "_blank", "noopener,noreferrer");
  else location.assign(site.url);
}
function linkTo(site, className) {
  const a = document.createElement("a");
  a.href = site.url;
  a.className = className;
  a.target = (site.newTab ?? config.linkInNewTab) ? "_blank" : "_self";
  a.rel = "noopener noreferrer";
  a.title = site.name + " · " + new URL(site.url).host;
  const label = document.createElement("span");
  label.className = "tile-label";
  label.textContent = site.name;
  a.append(icon(site), label);
  return a;
}
function renderPins() {
  const pins = config.pinned
    .map((id) => sites.find((site) => site.id === id))
    .filter(Boolean);
  $("#pins").replaceChildren(...pins.map((site) => linkTo(site, "tile")));
  if (!pins.length) {
    const empty = document.createElement("span");
    empty.className = "empty";
    empty.textContent = "Pin a shortcut from the library.";
    $("#pins").append(empty);
  }
}
function updateClock(now) {
  if (!config) return;
  const info = clockReading(now, config);
  $("#clock-time").dateTime = now.toISOString();
  $("#clock-time").textContent = info.time;
  $("#period").textContent = info.period;
  $("#greeting").textContent = info.greeting;
  $("#brand-greeting").textContent = info.greeting;
  $("#date").textContent = info.date;
  $("#zone").textContent = info.zone;
  drawLandscape(landscapeScene(+now, info.minuteOfDay, currentWeather));
}
function render() {
  document.title = config.title || "Startpage by Prashant Gehlot";
  sites = catalogFor(window.CONFIG.macros, config.squares);
  $("#desk").hidden = false;
  $("#preferences").hidden = !config.settingsIcon;
  $("#brand-greeting").hidden = $("#greeting").hidden = config.disableMessage;
  $("#clock").hidden = $("#date").hidden = config.disableDate;
  $("#focus-search").hidden = $("#search").hidden = config.disableSearchBar;
  $("#query").placeholder =
    "Search " + config.searchEngine + " or type a shortcut";
  search.refresh();
  applyAppearance(config);
  tick();
  renderPins();
  if (library.open) shortcuts.render();
  updateWeather(config);
}
async function load() {
  const seq = ++loadNumber;
  let saved;
  try {
    saved = await readSaved();
  } catch {
    notice("Saved settings are unavailable. Showing defaults.");
    saved = {};
  }
  if (seq !== loadNumber || switchingLayout) return;
  config = preferences(
    { searchEngine: previousEngine(window.CONFIG), ...saved },
    defaults,
    engines,
  );
  if (
    config.layout === "classic" &&
    !new URLSearchParams(location.search).has("desk")
  ) {
    switchingLayout = true;
    location.replace("classic.html");
    return;
  }
  render();
}
async function save(patch) {
  await writeSaved(patch);
  await load();
}
const showSettings = await settingsDialog({
  get: () => config,
  validate: (input) => preferences(input, defaults, engines, true),
  save,
  engines,
  version: await installedVersion(),
});
const search = searchBox({
  get: () => config,
  sites: () => sites,
  engines,
  icon,
  visit,
  settings: showSettings,
  preview: brandPreview(window.CONFIG.macros),
});
const shortcuts = shortcutLibrary({
  get: () => config,
  sites: () => sites,
  linkTo,
  edit: (update) =>
    navigator.locks.request("startpage-shortcuts", async () => {
      const latest = preferences(await readSaved(), defaults, engines);
      await save(update(latest));
    }),
});
$("#browse").onclick = $("#library-key").onclick = shortcuts.open;
$("#focus-search").onclick = search.focus;
$("#preferences").onclick = showSettings;
for (const button of library.querySelectorAll("[data-close]"))
  button.onclick = () => button.closest("dialog").close();
document.addEventListener("keydown", (event) => {
  if (
    !config ||
    event.isComposing ||
    event.defaultPrevented ||
    document.querySelector("dialog[open]")
  )
    return;
  const key = event.key.toLowerCase();
  const primaryModifier = event.ctrlKey || event.metaKey;
  const plainKey = !primaryModifier && !event.altKey;
  // On a Mac, Option+K can report a dead key instead of the letter K.
  const legacyLibraryKey = event.altKey && !primaryModifier &&
    (key === "k" || event.code === "KeyK");
  const editing = event.target.matches(
    "input,textarea,select,[contenteditable=true]",
  );
  if (primaryModifier && key === ",") {
    event.preventDefault();
    showSettings();
  } else if (
    !event.shiftKey &&
    ((primaryModifier && !event.altKey && key === "k") || legacyLibraryKey)
  ) {
    event.preventDefault();
    shortcuts.open();
  } else if (!config.disableSearchBar && !editing && plainKey && key === "/") {
    event.preventDefault();
    search.focus();
  } else if (!editing && event.shiftKey && plainKey) {
    const site = sites.find((site) => site.key === event.code);
    if (site) {
      event.preventDefault();
      visit(site);
    }
  } else if (
    !config.disableSearchBar &&
    !editing &&
    plainKey &&
    event.key.length === 1 &&
    event.key.trim() &&
    !event.target.closest("button,a")
  )
    search.focus();
});
systemDark.addEventListener("change", () => {
  if (config) {
    applyAppearance(config);
    tick();
  }
});
watchSaved(load);
if (new URLSearchParams(location.search).has("desk")) {
  try {
    await writeSaved({ layout: "desk" });
    history.replaceState(null, "", "index.html");
  } catch {
    notice(
      "Startpage is open for this tab. The default layout could not be saved.",
    );
  }
}
await load();
if (!switchingLayout) homepage(notice);
