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
import { observation, weatherRefreshMs } from "./weather.js";
import { installedVersion } from "./version.js";

const $ = (selector) => document.querySelector(selector);
const engines = engineTemplates(window.CONFIG);
const library = $("#library");
const icons = window.ICONS;
const gear =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m9 3 .6-1h4.8L15 5l2 .9 2.8-.6 2 3.5-1.9 2v2.4l1.9 2-2 3.5-2.8-.6-2 .9-.6 2.5H9.6L9 19l-2-.9-2.8.6-2-3.5 1.9-2v-2.4l-1.9-2 2-3.5 2.8.6L9 5Z"/><circle cx="12" cy="12" r="3.2"/></svg>';
$('[data-icon="settings"]').innerHTML = gear;
const defaults = await fetch("config.json").then((response) => response.json());
let config,
  sites,
  weatherTimer,
  weatherController,
  weatherKey,
  currentWeather,
  loadNumber = 0;
const darkMedia = matchMedia("(prefers-color-scheme: dark)");
const drawLandscape = mountainLandscape($("#landscape"));
const tick = minuteClock(updateClock);
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
function theme() {
  document.documentElement.dataset.theme =
    config.theme === "system"
      ? darkMedia.matches
        ? "dark"
        : "light"
      : config.theme === "custom"
        ? "dark"
        : config.theme;
  const colors = {
    backgroundColor: "page-bg",
    messageColor: "greeting-ink",
    dateColor: "date-ink",
    weatherColor: "weather-ink",
    searchColor: "search-ink",
    searchBackgroundColor: "search-bg",
    squareColor: "tile-ink",
    squareBackgroundColor: "tile-bg",
    autocompleteHighlightBackgroundColor: "highlight",
  };
  for (const [key, variable] of Object.entries(colors)) {
    const value = config.theme === "custom" && config.style[key];
    document.documentElement.style.setProperty(
      "--" + variable,
      value && CSS.supports("color", value) ? value : "",
    );
  }
  tick();
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
async function weather(force = false) {
  const key = JSON.stringify([config.disableWeather, config.weatherConf]);
  if (key === weatherKey && !force) return;
  weatherKey = key;
  clearTimeout(weatherTimer);
  weatherController?.abort();
  const controller = new AbortController();
  weatherController = controller;
  const el = $("#weather");
  if (!force) {
    el.hidden = true;
    currentWeather = undefined;
    tick();
  }
  if (config.disableWeather || !config.weatherConf.location.trim()) return;
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const data = await observation(config.weatherConf, {
      signal: controller.signal,
    });
    if (controller !== weatherController) return;
    currentWeather = data;
    el.textContent = data.text + (data.stale ? " · cached" : "");
    el.title =
      data.place + " · Open-Meteo · " + new Date(data.at).toLocaleString();
  } catch {
    if (controller !== weatherController) return;
    currentWeather = undefined;
    el.textContent = "Weather unavailable";
    el.title = "Weather by Open-Meteo";
  } finally {
    clearTimeout(timeout);
  }
  el.hidden = false;
  tick();
  if (!document.hidden) {
    const delay =
      currentWeather && !currentWeather.stale
        ? Math.max(1000, currentWeather.at + weatherRefreshMs - Date.now())
        : weatherRefreshMs;
    weatherTimer = setTimeout(() => weather(true), delay);
  }
}
function render() {
  document.title = config.title || "Startpage";
  sites = catalogFor(window.CONFIG.macros, config.squares);
  $("#desk").hidden = false;
  $("#preferences").hidden = !config.settingsIcon;
  $("#brand-greeting").hidden = $("#greeting").hidden = config.disableMessage;
  $("#clock").hidden = $("#date").hidden = config.disableDate;
  $("#focus-search").hidden = $("#search").hidden = config.disableSearchBar;
  $("#query").placeholder =
    "Search " + config.searchEngine + " or type a shortcut";
  search.refresh();
  theme();
  renderPins();
  if (library.open) shortcuts.render();
  weather();
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
  if (seq !== loadNumber) return;
  config = preferences(
    { searchEngine: previousEngine(window.CONFIG), ...saved },
    defaults,
    engines,
  );
  if (
    config.layout === "classic" &&
    !new URLSearchParams(location.search).has("desk")
  ) {
    location.replace("classic.html");
    return;
  }
  render();
}
async function save(patch) {
  await writeSaved(patch);
  await load();
}
const showSettings = settingsDialog({
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
for (const button of document.querySelectorAll("[data-close]"))
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
  const editing = event.target.matches(
    "input,textarea,select,[contenteditable=true]",
  );
  if ((event.ctrlKey || event.metaKey) && key === ",") {
    event.preventDefault();
    showSettings();
  } else if (event.altKey && key === "k") {
    event.preventDefault();
    shortcuts.open();
  } else if (
    !config.disableSearchBar &&
    (((event.ctrlKey || event.metaKey) && key === "k") ||
      (!editing && key === "/"))
  ) {
    event.preventDefault();
    search.focus();
  } else if (
    !editing &&
    event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
  ) {
    const site = sites.find((site) => site.key === event.code);
    if (site) {
      event.preventDefault();
      visit(site);
    }
  } else if (
    !config.disableSearchBar &&
    !editing &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    event.key.length === 1 &&
    event.key.trim() &&
    !event.target.closest("button,a")
  )
    search.focus();
});
darkMedia.addEventListener("change", () => {
  if (config) theme();
});
document.addEventListener("visibilitychange", () => {
  if (!config) return;
  if (!document.hidden) weather(true);
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
