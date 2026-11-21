import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  catalogFor,
  matches,
  searchResults,
  resolveQuery,
  engineTemplates,
  address,
} from "../js/search.js";
import { preferences, changes, validZone } from "../js/preferences.js";
import { clockReading } from "../js/clock.js";
import { sceneColors } from "../js/brand.js";
import { observation } from "../js/weather.js";
import { landscapeScene } from "../js/landscape.js";

const read = (path) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");
const window = {};
runInNewContext(read("config.js"), { window });
runInNewContext(read("icons.js"), { window });
const defaults = JSON.parse(read("config.json"));
const macros = structuredClone(window.CONFIG.macros);
const engines = engineTemplates(window.CONFIG);
const sites = catalogFor(macros, []);
const resolve = (text, config = defaults) =>
  resolveQuery(text, config, sites, engines);
const check = (value, strict = true) =>
  preferences(value, defaults, engines, strict);

test("brand foregrounds adapt across the catalog and preserve custom CSS palettes", () => {
  for (const site of macros) {
    const { ink, wash } = sceneColors(site.bgColor, site.textColor);
    assert.match(ink, /^#(?:000|fff)$/);
    assert.ok(wash.startsWith("rgb("), site.name);
  }
  assert.deepEqual(sceneColors({ color: "#1ccc5b" }, "#000"), {
    ink: "#000",
    wash: "rgb(255 255 255 / 0%)",
  });
  assert.deepEqual(sceneColors({ color: "#333" }, "#fff"), {
    ink: "#fff",
    wash: "rgb(0 0 0 / 0%)",
  });
  assert.deepEqual(sceneColors({ colors: ["var(--sky)", "navy"] }, "ivory"), {
    ink: "ivory",
    wash: "transparent",
  });
});
test("all bundled name and alias prefixes select a shortcut, with exact aliases taking priority", () => {
  for (const site of sites) {
    for (const keyword of [site.name, ...site.triggers]) {
      for (let length = 1; length <= keyword.length; length++) {
        const prefix = keyword.slice(0, length).trimEnd().toLowerCase();
        const options = searchResults(
          prefix.toUpperCase(),
          defaults,
          sites,
          engines,
        );
        const first = options[0];
        const exact = sites.find(
          (s) => s.name.toLowerCase() === prefix || s.triggers.includes(prefix),
        );
        if (exact) assert.equal(first.id, exact.id, prefix);
        else
          assert.ok(
            [first.name, ...first.triggers].some((key) =>
              key.toLowerCase().startsWith(prefix),
            ),
            prefix,
          );
        assert.ok(
          options.some((option) => option.kind === "search"),
          prefix,
        );
        assert.equal(
          options.filter((option) => option.id === first.id).length,
          1,
          prefix,
        );
      }
    }
  }
  assert.equal(resolve("s").name, "Stack Overflow");
  for (const prefix of ["sp", "spo", "spot", "spoti", "spotif", "spotify"]) {
    assert.equal(resolve(prefix).name, "Spotify", prefix);
  }
  for (const prefix of [
    "n",
    "ne",
    "net",
    "netf",
    "netfl",
    "netfli",
    "netflix",
  ]) {
    assert.equal(resolve(prefix).name, "Netflix", prefix);
  }
  assert.equal(resolve("stack ov").name, "Stack Overflow");
  assert.equal(resolve("vkon").name, "VK");
  for (const text of [
    "tify",
    "Shopping",
    "spotify lyrics",
    "netflix shows",
    "spotlight",
  ]) {
    assert.equal(resolve(text).kind, "search", text);
  }
});

test("both entry points reference packaged scripts, styles and manifest icon", () => {
  const manifest = JSON.parse(read("manifest.json"));
  assert.equal(manifest.chrome_url_overrides.newtab, "index.html");
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.version, JSON.parse(read("package.json")).version);
  for (const page of ["index.html", "classic.html"]) {
    for (const [, path] of read(page).matchAll(
      /(?:src|href)="(?!https?:)([^"?#]+)/g,
    )) {
      assert.ok(existsSync(new URL("../" + path, import.meta.url)), path);
    }
  }
  assert.ok(existsSync(new URL("../" + manifest.icons["64"], import.meta.url)));
  assert.ok(!read("index.html").includes("jsoneditor.min"));
});
test("default pins and every shipped alias, engine, and command resolve", () => {
  for (const id of defaults.pinned)
    assert.ok(sites.find((site) => site.id === id));
  for (const site of sites) {
    for (const alias of site.triggers)
      assert.equal(resolve(alias).id, site.id, alias);
    for (const [type, command] of Object.entries(site.commands || {})) {
      const result = resolve(
        site.triggers[0] + (type === "go" ? "/" : "?") + "A & B",
      );
      assert.equal(
        result.url,
        command.template
          .replace("{@}", site.url.replace(/\/$/, ""))
          .replace("{$}", "A%20%26%20B"),
      );
    }
  }
  for (const searchEngine of Object.keys(engines)) {
    const query = "C++ & C# / café";
    const url = new URL(resolve(query, { ...defaults, searchEngine }).url);
    assert.ok([...url.searchParams.values()].includes(query), searchEngine);
  }
});
test("direct addresses, paths and forced searches preserve intent", () => {
  assert.equal(address("localhost:3000/a"), "http://localhost:3000/a");
  assert.equal(address("[::1]:8080"), "http://[::1]:8080/");
  assert.equal(
    address("docs.example.technology/a?x=1"),
    "https://docs.example.technology/a?x=1",
  );
  assert.equal(
    resolve("g/OpenAI/project").url,
    "https://github.com/OpenAI/project",
  );
  assert.equal(resolve("HTTPS://example.com/a").url, "https://example.com/a");
  assert.equal(resolve("  "), null);
  assert.deepEqual(resolve("--setting"), { action: "settings" });
  assert.equal(
    new URL(
      resolveQuery("yt", defaults, sites, engines, true).url,
    ).searchParams.get("q"),
    "yt",
  );
  assert.equal(address("a normal query"), null);
});
test("imported groups and legacy quick links remain available", () => {
  const config = check({
    squares: [
      {
        name: "Personal",
        url: "https://example.org",
        links: [{ name: "Docs", url: "https://example.net", newTab: false }],
      },
    ],
    quickLinks: {
      d: { URL: "https://duckduckgo.com", Search: "/?q=" },
      g: "https://github.com",
    },
  });
  assert.equal(
    resolve("d'cats & dogs", config).url,
    "https://duckduckgo.com/?q=cats%20%26%20dogs",
  );
  assert.equal(
    resolve("g/org/repo", config).url,
    "https://github.com/org/repo",
  );
  const all = catalogFor(macros, config.squares);
  assert.equal(matches("Personal", all).length, 2);
  assert.equal(resolveQuery("Docs", config, all, engines).newTab, false);
  assert.equal(matches("git", all)[0].name, "GitHub");
});
test("strict imports reject invalid structures and non-web links", () => {
  for (const value of [
    null,
    [],
    {},
    { unrelated: true },
    { pinned: "x" },
    { timeZone: "Atlantis" },
    { searchEngine: "unknown" },
    {
      squares: [
        { name: "X", links: [{ name: "X", url: "data:text/plain,hi" }] },
      ],
    },
    { quickLinks: { x: { URL: "ftp://example.com" } } },
    { disableWeather: false, weatherConf: { unit: "cel", location: "" } },
  ]) {
    assert.throws(() => check(value), undefined, JSON.stringify(value));
  }
  assert.deepEqual(check(defaults), defaults);
});
test("partial old settings recover per field without editing the input", () => {
  const old = {
    user: "Pat",
    timeZone: "India/Kolkata",
    disableWeather: true,
    pinned: 42,
  };
  const config = check(old, false);
  assert.equal(config.user, "Pat");
  assert.equal(config.timeZone, "Asia/Kolkata");
  assert.deepEqual(config.pinned, defaults.pinned);
  assert.equal(old.timeZone, "India/Kolkata");
  assert.deepEqual(changes(config, { ...config, user: "Jules" }), {
    user: "Jules",
  });
  assert.equal(validZone(""), true);
});
test("clock, day and greeting agree across midnight and DST", () => {
  const now = new Date("2025-01-01T00:05:00Z");
  const la = clockReading(
    now,
    { ...defaults, user: "A", timeZone: "America/Los_Angeles" },
    "en-US",
  );
  assert.match(la.date, /Tuesday, December 31/);
  assert.equal(
    la.greeting,
    "A, how’s your afternoon going? Time for a stretch?",
  );
  assert.equal(la.time, "4:05");
  assert.equal(la.period, "PM");
  const utc = clockReading(
    now,
    { ...defaults, timeZone: "UTC", disable24Hour: false, message: "Welcome" },
    "en-GB",
  );
  assert.equal(utc.time, "00:05");
  assert.equal(utc.period, "");
  assert.equal(utc.greeting, "Welcome");
  const dst = clockReading(
    new Date("2025-03-09T07:01:00Z"),
    { ...defaults, timeZone: "America/New_York" },
    "en-US",
  );
  assert.equal(dst.hour, 3);
});
test("named greetings follow the local hour and respect a blank name or custom message", () => {
  const config = { ...defaults, timeZone: "Asia/Kolkata" };
  const midnight = new Date("2025-01-01T18:30:00Z");
  assert.equal(
    clockReading(midnight, config).greeting,
    "Prashant, it’s too late for another tab. Get some sleep.",
  );
  assert.match(
    clockReading(new Date(midnight - 1), config).greeting,
    /call it a day/,
  );
  const times = [
    [0, "Get some sleep"],
    [6, "up early"],
    [9, "good morning"],
    [12, "lunchtime"],
    [14, "afternoon"],
    [17, "good evening"],
    [20, "getting late"],
  ];
  for (const [hour, part] of times) {
    const reading = clockReading(new Date(+midnight + hour * 3_600_000), {
      ...config,
      user: "  Mira  ",
    });
    assert.ok(reading.greeting.startsWith("Mira, "));
    assert.ok(reading.greeting.includes(part));
  }
  assert.equal(
    clockReading(midnight, { ...config, user: "" }).greeting,
    "It’s too late for another tab. Get some sleep.",
  );
  assert.equal(
    clockReading(midnight, { ...config, message: "On holiday." }).greeting,
    "On holiday.",
  );
});
test("landscape follows city solar events across midnight and falls back to the desk clock offline", () => {
  const hour = 3_600_000,
    rise = Date.UTC(2025, 0, 1, 23),
    set = rise + 10 * hour;
  const at = (now, extra) =>
    landscapeScene(now, 0, {
      at: now,
      weatherCode: 63,
      solarDays: [
        { rise, set },
        { rise: rise + 24 * hour, set: set + 24 * hour },
      ],
      ...extra,
    });
  assert.equal(at(rise - hour).phase, "night");
  assert.equal(at(rise).phase, "sunrise");
  assert.equal(at(rise + 3 * hour).phase, "day");
  assert.ok(at(rise + 4 * hour).progress > at(rise + 3 * hour).progress);
  assert.equal(at(set).phase, "sunset");
  assert.equal(at(set + hour).phase, "night");
  assert.equal(at(rise + 24 * hour).phase, "sunrise");
  assert.equal(at(rise, { stale: true }).phase, "sunrise");
  assert.equal(at(set, { stale: true }).sky, "clear");
  for (const [minutes, phase] of [
    [0, "night"],
    [360, "sunrise"],
    [720, "day"],
    [1080, "sunset"],
    [1380, "night"],
  ])
    assert.equal(landscapeScene(rise, minutes).phase, phase);
  for (const isDay of [true, false])
    assert.equal(
      at(rise, { solarDays: [], isDay }).phase,
      isDay ? "day" : "night",
    );
  assert.equal(
    at(rise, { solarDays: [null, { rise: 0, set: 0 }] }).phase,
    "night",
  );
});

test("weather effects combine independently with daylight, honor wind and expire", () => {
  const now = Date.UTC(2025, 0, 1, 12);
  for (const [sky, codes] of Object.entries({
    clear: [0, null, 123],
    "mostly-clear": [1],
    clouds: [2],
    overcast: [3],
    fog: [45, 48],
    drizzle: [51, 53, 55, 56, 57],
    rain: [61, 63, 65, 66, 67],
    snow: [71, 73, 75, 77, 85, 86],
    showers: [80, 81, 82],
    storm: [95],
    hail: [96, 99],
  })) {
    for (const code of codes)
      for (const isDay of [true, false]) {
        const scene = landscapeScene(now, 720, {
          at: now,
          weatherCode: code,
          isDay,
          windKmh: 40,
        });
        assert.equal(scene.sky, sky);
        assert.equal(scene.phase, isDay ? "day" : "night");
        assert.ok(scene.windy);
      }
  }
  const rain = { at: now, weatherCode: 65, windKmh: 35 };
  assert.ok(landscapeScene(now, 720, rain).heavy);
  const expired = landscapeScene(now + 30 * 60_000, 750, rain);
  assert.equal(expired.sky, "clear");
  assert.equal(expired.windy, false);
});

function weatherFixture() {
  const data = new Map(),
    calls = [];
  const storage = {
    getItem: (key) => data.get(key),
    setItem: (key, value) => data.set(key, value),
  };
  const request = async (url) => {
    calls.push(new URL(url));
    const json = url.includes("geocoding")
      ? { results: [{ name: "Paris", latitude: 48.86, longitude: 2.35 }] }
      : {
          current: {
            temperature_2m: 0,
            weather_code: 71,
            is_day: 0,
            wind_speed_10m: 32,
          },
          daily: { sunrise: [18000, null], sunset: [64800, null] },
        };
    return { ok: true, json: async () => json };
  };
  return { storage, calls, request };
}
test("weather caches zero degrees, keys by location/unit and encodes the city", async () => {
  const fixture = weatherFixture();
  const config = { location: "Paris, FR", unit: "cel" };
  const result = await observation(config, { ...fixture, now: 1 });
  assert.equal(result.text, "0°C · Snow");
  assert.deepEqual(result.solarDays, [{ rise: 18000000, set: 64800000 }]);
  assert.equal(result.isDay, false);
  assert.equal(result.windKmh, 32);
  assert.equal(result.weatherCode, 71);
  assert.equal(fixture.calls[1].searchParams.get("timeformat"), "unixtime");
  assert.equal(fixture.calls[1].searchParams.get("daily"), "sunrise,sunset");
  assert.equal(fixture.calls[0].searchParams.get("name"), "Paris, FR");
  assert.equal(
    (await observation(config, { ...fixture, now: 500 })).stale,
    false,
  );
  assert.equal(fixture.calls.length, 2);
  await observation({ ...config, unit: "fah" }, { ...fixture, now: 500 });
  assert.equal(
    fixture.calls[3].searchParams.get("temperature_unit"),
    "fahrenheit",
  );
});
test("a text-only weather cache upgrades online and remains readable offline", async () => {
  const fixture = weatherFixture(),
    config = { location: "Paris", unit: "cel" };
  const legacy = {
    id: JSON.stringify(["paris", "celsius"]),
    at: 1,
    text: "0°C · Snow",
  };
  fixture.storage.setItem("startpage.weather", JSON.stringify(legacy));
  const offline = await observation(config, {
    ...fixture,
    now: 2,
    request: async () => {
      throw Error("Offline");
    },
  });
  assert.ok(offline.stale);
  assert.equal(offline.text, legacy.text);
  const fresh = await observation(config, { ...fixture, now: 3 });
  assert.equal(fresh.weatherCode, 71);
  assert.equal(fixture.calls.length, 2);
});
test("weather fails quietly, bounds stale results, and never borrows another city", async () => {
  const fixture = weatherFixture();
  const config = { location: "Paris", unit: "cel" };
  await observation(config, { ...fixture, now: 1 });
  const offline = {
    ...fixture,
    request: async () => {
      throw Error("Offline");
    },
    now: 3600000,
  };
  assert.equal((await observation(config, offline)).stale, true);
  await assert.rejects(observation(config, { ...offline, now: 90_000_000 }));
  await assert.rejects(observation({ ...config, location: "Oslo" }, offline));
  await assert.rejects(
    observation(
      { ...config, location: "Oslo" },
      {
        ...fixture,
        request: async () => ({ ok: true, json: async () => ({}) }),
      },
    ),
    /City not found/,
  );
});

test("local calculator handles precedence, parentheses and incomplete input", () => {
  for (const [input, expected] of [
    ["12 × (3 + 2)", "60"],
    ["0.1 + 0.2", "0.3"],
    ["(-3 + 2) / 4", "-0.25"],
    ["2--2", "4"],
  ]) {
    assert.deepEqual(resolve(input), { action: "calculate", result: expected });
  }
  for (const input of ["1/0", "2*", "2(3+2)", "2 + word", "7.2.0 + 1"])
    assert.ok(resolve(input).url);
});

test("classic chat assembles split UTF-8 events and handles server or network failure", async () => {
  const { chatReply } = await import("../js/classic-services.js");
  const bytes = new TextEncoder().encode(
    'data: {"choices":[{"delta":{"content":"café"}}]}\r\n\r\ndata: [DONE]\n',
  );
  const stream = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const updates = [];
  const args = {
    messages: [],
    model: "fixture-model",
    temperature: 0.4,
    key: "fixture",
    onText: (s) => updates.push(s),
  };
  const result = await chatReply({
    ...args,
    request: async (_, options) => {
      assert.equal(JSON.parse(options.body).model, "fixture-model");
      return new Response(stream);
    },
  });
  assert.deepEqual(result, { role: "assistant", content: "café" });
  assert.deepEqual(updates, ["café"]);
  await assert.rejects(
    chatReply({
      ...args,
      request: async () =>
        Response.json({ error: { message: "Bad key" } }, { status: 401 }),
    }),
    /Bad key/,
  );
  await assert.rejects(
    chatReply({
      ...args,
      request: async () => {
        throw Error("Offline");
      },
    }),
    /Offline/,
  );
});

test("currency conversions retain zero, omit unavailable rates, and request only the base table", async () => {
  const { convertCurrency } = await import("../js/classic-services.js");
  const request = async (url) => {
    assert.match(url, /\/usd\.json$/);
    return Response.json({ usd: { eur: 0.91 } });
  };
  assert.equal(await convertCurrency(10, "USD", "EUR", request), 9.1);
  assert.equal(await convertCurrency(0, "USD", "EUR", request), 0);
  assert.equal(await convertCurrency(1, "USD", "ABC", request), null);
  assert.equal(await convertCurrency(4, "USD", "USD", () => assert.fail()), 4);
});
