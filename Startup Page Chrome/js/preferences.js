import { extension } from "./extension-api.js";
import { webURL } from "./search.js";

const settingsKey = "startpage.preferences";
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const string = (value) => typeof value === "string";
const bool = (value) => typeof value === "boolean";
const link = (item) =>
  record(item) &&
  string(item.name) &&
  item.name.trim() &&
  webURL(item.url) &&
  (item.newTab === undefined || bool(item.newTab));
export function validZone(zone) {
  if (!string(zone)) return false;
  if (!zone) return true;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function validateField(key, value, defaults, engines) {
  switch (key) {
    case "timeZone":
      return validZone(value);
    case "layout":
      return ["desk", "classic"].includes(value);
    case "visualTheme":
      return ["pixel", "original", "editorial", "terminal", "mac-terminal", "vintage-windows", "glass"].includes(value);
    case "colorScheme":
      return ["system", "dark", "light", "custom"].includes(value);
    case "searchEngine":
      return string(value) && Object.hasOwn(engines, value);
    case "weatherConf":
      return (
        record(value) &&
        string(value.location) &&
        ["cel", "fah", "celsius", "fahrenheit"].includes(value.unit)
      );
    case "pinned":
      return (
        Array.isArray(value) &&
        value.every(string) &&
        new Set(value).size === value.length
      );
    case "squares":
      return (
        Array.isArray(value) &&
        value.every(
          (group) =>
            record(group) &&
            string(group.name) &&
            (!group.url || webURL(group.url)) &&
            (!group.color || string(group.color)) &&
            Array.isArray(group.links) &&
            group.links.every(link),
        )
      );
    case "quickLinks":
      return (
        record(value) &&
        Object.entries(value).every(
          ([key, entry]) =>
            key.length > 0 &&
            (webURL(entry) ||
              (record(entry) &&
                webURL(entry.URL) &&
                (entry.Search === undefined ||
                  (string(entry.Search) &&
                    entry.Search.startsWith("/") &&
                    !entry.Search.startsWith("//"))))),
        )
      );
    case "style":
      return record(value) && Object.values(value).every(string);
    default:
      return typeof value === typeof defaults[key];
  }
}

export function preferences(input, defaults, engines, strict = false) {
  // Earlier profiles and JSON backups stored the color scheme under "theme".
  if (
    record(input) &&
    Object.hasOwn(input, "theme") &&
    !Object.hasOwn(input, "colorScheme")
  )
    input = { ...input, colorScheme: input.theme };
  if (
    !record(input) ||
    (strict && !Object.keys(defaults).some((key) => Object.hasOwn(input, key)))
  ) {
    if (strict) throw Error("Choose a Startpage configuration object.");
    input = {};
  }
  const result = structuredClone(defaults);
  for (const key of Object.keys(defaults)) {
    if (!Object.hasOwn(input, key)) continue;
    let value = input[key];
    if (key === "timeZone" && value === "India/Kolkata") value = "Asia/Kolkata";
    if (!validateField(key, value, defaults, engines)) {
      if (strict) throw Error("Check the configuration field “" + key + "”.");
      continue;
    }
    result[key] = structuredClone(value);
  }
  if (!Object.hasOwn(input, "colorScheme") && Object.keys(result.style).length)
    result.colorScheme = "custom";
  if (strict && !result.disableWeather && !result.weatherConf.location.trim())
    throw Error("Enter a city for weather.");
  return result;
}

function readLocal(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}

export async function readSaved() {
  const area = extension?.storage?.sync ?? extension?.storage?.local;
  return area ? area.get(null) : readLocal(settingsKey);
}

// Only submit changed top-level fields so independent edits in other tabs survive.
export function changes(before, after) {
  return Object.fromEntries(
    Object.entries(after).filter(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(before[key]),
    ),
  );
}

export async function writeSaved(patch) {
  if (!Object.keys(patch).length) return;
  const area = extension?.storage?.sync ?? extension?.storage?.local;
  if (area) await area.set(patch);
  else
    localStorage.setItem(
      settingsKey,
      JSON.stringify({ ...readLocal(settingsKey), ...patch }),
    );
}

export function watchSaved(callback) {
  if (extension?.storage?.onChanged) {
    extension.storage.onChanged.addListener((_, area) => {
      if (area === (extension.storage.sync ? "sync" : "local")) callback();
    });
  } else
    window.addEventListener("storage", (e) => {
      if (e.key === settingsKey || e.key === null) callback();
    });
}

export function previousEngine(catalog) {
  const name = readLocal("settings")?.general?.searchEngine;
  return Object.hasOwn(catalog.engines, name)
    ? catalog.engines[name].name
    : undefined;
}
