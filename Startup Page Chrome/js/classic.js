import { clockReading, minuteClock } from "./clock.js";
import { preferences, readSaved, watchSaved } from "./preferences.js";
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
const greeting = document.querySelector("#classic-greeting");
let config = defaults;
let revision = 0;
const tick = minuteClock((date) => {
  greeting.hidden = config.disableMessage;
  greeting.textContent = clockReading(date, config).greeting;
});
async function loadGreeting() {
  const current = ++revision;
  const saved = await readSaved().catch(() => ({}));
  if (current !== revision) return;
  config = preferences(saved, defaults, engines);
  tick();
}
watchSaved(loadGreeting);
await Promise.all([import("../script.js"), loadGreeting()]);
