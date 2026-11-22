import { homepageChecks } from "./homepage-browser.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_CORE_PATH || "playwright-core",
);
const root = fileURLToPath(new URL("../", import.meta.url));
const context = await chromium.launchPersistentContext("", {
  channel: "chromium",
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--disable-extensions-except=" + root, "--load-extension=" + root],
  viewport: { width: 1280, height: 800 },
  acceptDownloads: true,
});
context.setDefaultTimeout(8000);
const errors = [],
  external = [];
let weatherMode = "ok",
  forecastCalls = 0;
context.on("page", (page) => {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      /violates the following Content Security Policy directive/.test(
        message.text(),
      )
    )
      errors.push(message.text());
  });
});
await context.route(/^https?:/, async (route) => {
  const url = new URL(route.request().url());
  external.push(url.href);
  if (url.hostname === "cdn.jsdelivr.net")
    return route.fulfill({ json: { usd: { eur: 0.91 } } });
  if (url.hostname === "api.openai.com") {
    assert.equal(
      route.request().headers().authorization,
      "Bearer fixture-only",
    );
    return route.fulfill({
      contentType: "text/event-stream",
      body: 'data: {"choices":[{"delta":{"content":"Browser fixture reply"}}]}\n\ndata: [DONE]\n',
    });
  }
  if (url.hostname.endsWith("open-meteo.com")) {
    if (weatherMode === "offline") return route.abort();
    if (url.hostname === "api.open-meteo.com") forecastCalls++;
    return route.fulfill({
      json: url.hostname.startsWith("geocoding")
        ? { results: [{ name: "Berlin", latitude: 52.5, longitude: 13.4 }] }
        : {
            current: {
              temperature_2m: 18,
              weather_code: 2,
              is_day: 1,
              wind_speed_10m: 12,
            },
            daily: {
              sunrise: [Math.floor(Date.now() / 1000) - 7200],
              sunset: [Math.floor(Date.now() / 1000) + 28800],
            },
          },
    });
  }
  return route.fulfill({
    contentType: "text/html",
    body: "<title>Navigation target</title>",
  });
});
const page = await context.newPage();
const get = (selector) => page.locator(selector);
const button = (name) => page.getByRole("button", { name, exact: true });
async function start(p = page) {
  await p.goto("chrome://newtab/");
  await p.locator("#desk:not([hidden])").waitFor();
}
async function shot(name) {
  if (!process.env.SCREENSHOT_DIR) return;
  await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(process.env.SCREENSHOT_DIR, name + ".png"),
  });
}
async function checkPixelType(selectors) {
  const result = await page.evaluate(async (selectors) => {
    await document.fonts.ready;
    return {
      loaded: [...document.fonts].some(
        (face) => face.family === "Departure Mono" && face.status === "loaded",
      ),
      families: selectors.map(
        (selector) =>
          getComputedStyle(document.querySelector(selector)).fontFamily,
      ),
    };
  }, selectors);
  assert.ok(result.loaded, "bundled pixel face is available offline");
  result.families.forEach((family, i) =>
    assert.match(family, /^"Departure Mono"/, selectors[i]),
  );
}
async function openSettings() {
  await button("Open settings").click();
}
async function section(name) {
  const nav = get("#settings-nav");
  if (!(await nav.isVisible())) await get("#all-settings").click();
  await nav.getByRole("button", {name, exact:true}).click();
}
async function choose(name, value) {
  await get('#settings input[name="' + name + '"][value="' + value + '"]').check();
}
async function save() {
  await button("Save settings").click();
  await get("#settings").waitFor({ state: "hidden" });
}
async function openLibrary() {
  await button("All shortcuts").click();
}
async function check(label, fn) {
  await fn();
  console.log("PASS", label);
}
try {
  console.log("Chromium", context.browser()?.version());
  await check(
    "unpacked extension owns a real new tab and starts entirely offline",
    async () => {
      await context.setOffline(true);
      await start();
      assert.equal(
        await page.evaluate(() => location.protocol),
        "chrome-extension:",
      );
      const installed = await page.evaluate(() => ({
        id: chrome.runtime.id,
        host: location.hostname,
        name: chrome.runtime.getManifest().name,
        author: chrome.runtime.getManifest().author,
      }));
      assert.equal(installed.id, installed.host);
      assert.equal(installed.author, "Prashant Gehlot");
      assert.equal(installed.name, "Startpage by Prashant Gehlot");
      assert.equal(await page.title(), installed.name);
      console.log("Installed extension ID", installed.id);
      assert.equal(await get("#pins a").count(), 6);
      assert.equal(await get("#weather").isVisible(), false);
      assert.equal(external.length, 0);
      await checkPixelType([
        ".wordmark",
        "#clock-time",
        "#greeting",
        "#query",
        ".tile-label",
        "kbd",
      ]);
      assert.equal(
        await get("#pins svg[shape-rendering=crispEdges]").count(),
        6,
      );
      assert.ok(
        await get("#preferences svg[shape-rendering=crispEdges]").count(),
      );
      assert.equal(await get("footer.bar .credit").count(), 0);
      for (const selector of ["header.bar", "#search-form", ".tile", "footer.bar"]) {
        const style = await get(selector).first().evaluate(el => {
          const css = getComputedStyle(el);
          return [css.borderWidth, css.backgroundColor, css.boxShadow];
        });
        assert.deepEqual(style, ["0px", "rgba(0, 0, 0, 0)", "none"], selector);
      }
      await shot("desktop");
      await context.setOffline(false);
    },
  );
  await homepageChecks({page, context, start, openSettings, section, choose, save, shot, check});
  await check("themes and color schemes switch independently and persist", async () => {
    const root = get("html");
    await openSettings();
    await section("Appearance");
    assert.equal(await get("[name=visualTheme]:checked").inputValue(), "pixel");
    assert.equal(await get("[name=colorScheme]:checked").inputValue(), "dark");
    await choose("visualTheme", "editorial");
    await choose("colorScheme", "light");
    await button("Cancel").click();
    assert.equal(await root.getAttribute("data-theme"), "pixel");
    assert.equal(await root.getAttribute("data-color-scheme"), "dark");
    for (const style of ["original", "editorial", "terminal", "mac-terminal", "vintage-windows", "glass", "pixel"]) {
      const papers = [];
      for (const mode of ["light", "dark"]) {
        await openSettings();
        await section("Appearance");
        await choose("visualTheme", style);
        await choose("colorScheme", mode);
        await save();
        assert.equal(await root.getAttribute("data-theme"), style);
        assert.equal(await root.getAttribute("data-color-scheme"), mode);
        papers.push(await root.evaluate(el => getComputedStyle(el).backgroundColor));
        assert.equal(await get(".prompt-shell").isVisible(), style === "mac-terminal");
        assert.equal(await get(".prompt-chevron").isVisible(), style !== "mac-terminal");
        if (style === "mac-terminal") {
          assert.equal(await get(".prompt-shell").innerText(), "user@macbook ~ %");
          const families = await page.locator(
            "#query, #clock-time, #greeting, .wordmark, .tile-label, footer kbd, #home-notes, #settings .type-sample, #settings button",
          ).evaluateAll(elements => elements.map(el => getComputedStyle(el).fontFamily));
          for (const family of families) assert.match(family, /^Menlo\b/);
        }
        const pixel = style === "pixel";
        assert.equal(await get("#preferences .pixel-icon").isVisible(), pixel);
        assert.equal(await get("#pins .smooth-icon:visible").count(), pixel ? 0 : 6);
        const clock = await get("#clock-time").evaluate(el => {
          const css = getComputedStyle(el);
          return { font: css.fontFamily, mask: css.maskImage };
        });
        assert.match(clock.font, {
          "mac-terminal": /Menlo/, "vintage-windows": /Verdana/,
          glass: /Avenir Next/, original: /system-ui/, editorial: /Georgia/, terminal: /JetBrains Mono/, pixel: /Departure Mono/,
        }[style]);
        assert.equal(clock.mask !== "none", pixel);
        if (style === "glass") {
          assert.equal(await get("#search-form").evaluate(el => getComputedStyle(el).backdropFilter), "none");
        }
        await shot("theme-" + style + "-" + mode);
      }
      assert.notEqual(papers[0], papers[1]);
      await get("#query").fill("spoti");
      assert.match(await get(".brand-plane > div").first().textContent(), /SPOTIFY/);
      assert.equal(await get("#results").evaluate(el => getComputedStyle(el).boxShadow), "none");
      await get("#query").fill("");
    }
    await page.emulateMedia({ colorScheme: "light" });
    await openSettings();
    await section("Appearance");
    await choose("visualTheme", "editorial");
    await choose("colorScheme", "system");
    await save();
    await start();
    const other = await context.newPage();
    await start(other);
    assert.equal(await other.locator("html").getAttribute("data-theme"), "editorial");
    assert.equal(await root.getAttribute("data-color-scheme"), "light");
    assert.equal(await root.getAttribute("data-theme"), "editorial");
    await page.emulateMedia({ colorScheme: "dark" });
    await get('html[data-theme="editorial"][data-color-scheme="dark"]').waitFor();
    await openSettings();
    await section("Appearance");
    assert.equal(await get("[name=colorScheme]:checked").inputValue(), "system");
    await choose("visualTheme", "pixel");
    await choose("colorScheme", "dark");
    await save();
    await other.locator('html[data-theme="pixel"][data-color-scheme="dark"]').waitFor();
    await other.close();
    await page.emulateMedia({ colorScheme: null });
  });
  await check("both footer shortcuts open the library from an active search", async () => {
    assert.deepEqual(await get("#library-key kbd").allTextContents(), ["Ctrl+K", "⌘K"]);
    for (const chord of ["Control+k", "Meta+k", "Alt+k"]) {
      await get("#query").fill("spo");
      await page.keyboard.press(chord);
      await get("#library[open]").waitFor();
      assert.equal(await get("#library-query").evaluate(el => el === document.activeElement), true);
      await page.keyboard.press("Escape");
      assert.equal(await get("#query").inputValue(), "spo");
    }
    await get("#query").fill("");
    await get("#focus-search").focus();
    await page.keyboard.press("/");
    assert.equal(await get("#query").evaluate(el => el === document.activeElement), true);
  });
  await check(
    "typing from the page, local suggestions and the selected keyboard result",
    async () => {
      await page.locator("body").click({ position: { x: 2, y: 2 } });
      await page.keyboard.type("tw");
      assert.equal(await get("#query").inputValue(), "tw");
      await get("#results li").nth(1).waitFor();
      const expected = await get("#results li")
        .nth(1)
        .locator("span")
        .nth(1)
        .innerText();
      const url = await page.evaluate(
        (name) => CONFIG.macros.find((s) => s.name === name).url,
        expected,
      );
      assert.equal(
        await get("#query").getAttribute("aria-activedescendant"),
        "result-0",
      );
      await page.keyboard.press("ArrowDown");
      assert.equal(
        await get("#query").getAttribute("aria-activedescendant"),
        "result-1",
      );
      await Promise.all([
        page.waitForURL(new URL(url).href),
        page.keyboard.press("Enter"),
      ]);
      await start();
    },
  );
  await check(
    "recognized shortcuts paint the chosen brand while typing and restore the desk on dismissal",
    async () => {
      const input = get("#query"),
        layer = get("#brand-backdrop");
      const row = get(".brand-plane > div").first();
      const requests = external.length;
      await input.fill("");
      await input.pressSequentially("spo");
      assert.equal(await layer.isVisible(), true);
      assert.equal(
        await layer.evaluate((el) => getComputedStyle(el).backgroundColor),
        "rgb(28, 204, 91)",
      );
      assert.ok((await row.textContent()).match(/SPOTIFY/g).length > 5);
      assert.equal(
        await row.evaluate((el) => getComputedStyle(el).animationName),
        "wordmark-drift",
      );
      assert.equal(await layer.getAttribute("aria-hidden"), "true");
      assert.equal(await get("#brand-greeting").isVisible(), true);
      assert.ok(
        (await get("#brand-greeting").innerText()).includes("Prashant"),
      );
      const controls = await page.evaluate(() =>
        [
          "header.bar",
          "footer.bar",
          "#brand-greeting",
          "#search-form",
          "#results",
          "#results li",
          "#preferences",
          ".enter",
        ].map((selector) => {
          const style = getComputedStyle(document.querySelector(selector));
          return [
            selector,
            style.backgroundColor,
            style.boxShadow,
            style.borderTopWidth,
          ];
        }),
      );
      for (const [selector, background, shadow, border] of controls) {
        assert.equal(background, "rgba(0, 0, 0, 0)", selector);
        assert.equal(shadow, "none", selector);
        assert.equal(border, "0px", selector);
      }
      assert.ok(
        await input.evaluate(
          (el) => parseFloat(getComputedStyle(el).fontSize) > 60,
        ),
      );
      assert.equal(
        await input.evaluate((el) => getComputedStyle(el).color),
        "rgb(0, 0, 0)",
      );
      await checkPixelType([
        "#query",
        "#brand-greeting",
        ".brand-plane > div",
        "#results li",
      ]);
      await shot("spotify");
      await page.setViewportSize({ width: 360, height: 740 });
      await shot("spotify-narrow");
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.equal(
        await row.evaluate((el) => getComputedStyle(el).animationName),
        "none",
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await input.fill("spo?late night jazz");
      assert.match(await row.textContent(), /SPOTIFY/);
      await input.fill("spo?" + "long song title ".repeat(10));
      assert.ok(
        await input.evaluate(
          (el) => el.getBoundingClientRect().right <= innerWidth,
        ),
      );
      await input.fill("https://open.spotify.com/collection/tracks");
      assert.match(await row.textContent(), /SPOTIFY/);
      await input.fill("GitHub");
      assert.equal(
        await input.evaluate((el) => getComputedStyle(el).color),
        "rgb(255, 255, 255)",
      );
      await shot("github");
      await input.fill("Wikipedia");
      assert.equal(
        await input.evaluate((el) => getComputedStyle(el).color),
        "rgb(0, 0, 0)",
      );
      await input.fill("ig");
      assert.match(await row.textContent(), /INSTAGRAM/);
      assert.match(
        await layer.evaluate((el) => getComputedStyle(el).backgroundImage),
        /radial-gradient/,
      );
      await shot("instagram");
      await input.fill("tw");
      await input.press("ArrowDown");
      const name = await get("#results [aria-selected=true] > span")
        .nth(1)
        .textContent();
      assert.ok((await row.textContent()).includes(name.toUpperCase()));
      await input.press("Escape");
      assert.equal(await layer.isVisible(), false);
      await input.fill("sp");
      await input.blur();
      assert.equal(await layer.isVisible(), false);
      await input.focus();
      assert.equal(await layer.isVisible(), true);
      await input.fill("");
      assert.equal(await layer.isVisible(), false);
      assert.equal(external.length, requests);
      await input.fill("spo");
      await Promise.all([
        page.waitForURL("https://open.spotify.com/"),
        button("Go").click(),
      ]);
      await start();
    },
  );
  await check(
    "typing and deleting shortcut prefixes keeps the selected result and backdrop in sync",
    async () => {
      const input = get("#query"),
        layer = get("#brand-backdrop");
      const row = get(".brand-plane > div").first();
      const requests = external.length;
      for (const [word, name] of [
        ["spotify", "Spotify"],
        ["netflix", "Netflix"],
      ]) {
        await input.fill("");
        for (const letter of word) {
          await input.pressSequentially(letter);
          const expected =
            (await input.inputValue()) === "s" ? "Stack Overflow" : name;
          assert.ok((await row.textContent()).includes(expected.toUpperCase()));
          assert.equal(
            await get("#results [aria-selected=true] > span")
              .nth(1)
              .textContent(),
            expected,
          );
        }
      }
      await input.fill("spoti");
      await input.press("ArrowDown");
      assert.match(
        await get("#results [aria-selected=true]").innerText(),
        /Search for “spoti”/,
      );
      assert.match(await row.textContent(), /GOOGLE/);
      await input.press("ArrowUp");
      assert.match(await row.textContent(), /SPOTIFY/);
      await input.pressSequentially("q");
      assert.equal(await input.inputValue(), "spotiq");
      assert.ok((await row.textContent()).match(/GOOGLE/g).length > 1);
      assert.equal(
        await row.evaluate((el) => getComputedStyle(el).animationName),
        "wordmark-drift",
      );
      const colors = await layer.evaluate(el => ({
        image: getComputedStyle(el).backgroundImage,
        scene: getComputedStyle(el).backgroundColor,
        theme: getComputedStyle(document.documentElement).backgroundColor,
      }));
      assert.equal(colors.image, "none");
      assert.equal(colors.scene, colors.theme);
      assert.equal(await get(".hero").isVisible(), false);
      assert.equal(await get("#brand-greeting").isVisible(), true);
      await shot("google-search");
      await input.press("Backspace");
      assert.match(await row.textContent(), /SPOTIFY/);
      await input.fill("a quiet cafe near me");
      assert.match(await row.textContent(), /GOOGLE/);
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.equal(
        await row.evaluate((el) => getComputedStyle(el).animationName),
        "none",
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await input.press("Escape");
      assert.equal(await layer.isVisible(), false);
      for (const value of [
        "   ",
        "12 × 5",
        "--settings",
        "example.org/path",
        "",
      ]) {
        await input.fill(value);
        assert.equal(await layer.isVisible(), false, value);
      }
      assert.equal(await get(".hero").isVisible(), true);
      assert.equal(external.length, requests);
    },
  );
  await check(
    "calculator gives a usable result without navigation or network",
    async () => {
      const count = external.length;
      await get("#query").fill("12 × (3 + 2)");
      await get("#results").getByText("= 60").waitFor();
      await get("#query").press("Enter");
      assert.equal(await get("#query").inputValue(), "60");
      assert.equal(external.length, count);
      await get("#query").fill("");
    },
  );
  await check(
    "engine search, forced literal alias, macro path and direct navigation",
    async () => {
      for (const [text, key, expected] of [
        [
          "C++ & Café",
          "Enter",
          "https://www.google.com/search?q=C%2B%2B%20%26%20Caf%C3%A9",
        ],
        ["yt", "Control+Enter", "https://www.google.com/search?q=yt"],
        ["spoti", "Meta+Enter", "https://www.google.com/search?q=spoti"],
        ["  SPOTIF  ", "Enter", "https://open.spotify.com/"],
        ["netfl", "Enter", "https://www.netflix.com/"],
        ["g/OpenAI/project", "Enter", "https://github.com/OpenAI/project"],
        ["example.org/path", "Enter", "https://example.org/path"],
      ]) {
        await get("#query").fill(text);
        await Promise.all([
          page.waitForURL(expected),
          get("#query").press(key),
        ]);
        await start();
      }
    },
  );
  await check(
    "settings cancel, invalid zone, save, persistence and cross-tab update",
    async () => {
      const other = await context.newPage();
      await start(other);
      await openSettings();
      await checkPixelType([
        "#settings-title",
        "#settings label",
        "#settings input",
        "#settings select",
        "#config-text",
        "#settings button",
      ]);
      assert.equal(await get("#settings .modal-foot .credit").innerText(), "Made with ❤️ by Prashant Gehlot");
      for (const selector of ["#settings-nav button", "#settings [data-page=general] .setting-row"]) {
        assert.equal(await get(selector).first().evaluate(el => getComputedStyle(el).borderBottomWidth), "1px");
      }
      const greetingSwitch = page.getByRole("switch", { name: "Show greeting" });
      await greetingSwitch.focus();
      const knobPosition = () => greetingSwitch.evaluate(el => getComputedStyle(el, "::before").transform);
      assert.equal(await greetingSwitch.isChecked(), true);
      const onPosition = await knobPosition();
      assert.notEqual(onPosition, "none");
      await page.keyboard.press("Space");
      assert.equal(await greetingSwitch.isChecked(), false);
      assert.notEqual(await knobPosition(), onPosition);
      await page.keyboard.press("Space");
      await shot("settings");
      await page
        .getByRole("textbox", { name: "Name", exact: true })
        .fill("Discard");
      await button("Cancel").click();
      assert.doesNotMatch(await get("#greeting").innerText(), /Discard/);
      await openSettings();
      await page
        .getByRole("textbox", { name: "Name", exact: true })
        .fill("Sam");
      await section("Clock & weather");
      await page.getByLabel("Time zone", { exact: true }).fill("Invalid/Zone");
      await section("General");
      await button("Save settings").click();
      assert.match(await get("#settings-status").innerText(), /time zone/);
      await page.getByLabel("Time zone", { exact: true }).fill("Asia/Kolkata");
      await section("Search & shortcuts");
      await page
        .getByLabel("Search engine", { exact: true })
        .selectOption("Brave");
      await section("Appearance");
      await choose("colorScheme", "light");
      await save();
      await other.waitForFunction(() =>
        document.querySelector("#greeting")?.textContent.includes("Sam"),
      );
      assert.equal(
        await page.locator("html").getAttribute("data-color-scheme"),
        "light",
      );
      await start();
      assert.match(await get("#query").getAttribute("placeholder"), /Brave/);
      await get("#query").fill("a quiet cafe");
      assert.match(
        await get(".brand-plane > div").first().textContent(),
        /GOOGLE/,
      );
      await Promise.all([
        page.waitForURL("https://search.brave.com/search?q=a%20quiet%20cafe"),
        get("#query").press("Enter"),
      ]);
      await start();
      await other.close();
    },
  );
  await check(
    "library filtering, pin toggles, custom shortcut and popup target",
    async () => {
      await openLibrary();
      await checkPixelType([
        "#library-title",
        "#library-query",
        ".library-row",
        ".pin-toggle",
      ]);
      await shot("library");
      await get("#library-query").fill("GitHub");
      await button("Unpin GitHub").click();
      await button("Pin GitHub").waitFor();
      await get("#new-shortcut summary").click();
      await page
        .getByRole("textbox", { name: "Name", exact: true })
        .fill("Lab notes");
      await page.getByLabel("Web address").fill("https://example.org/notes");
      await button("Add shortcut").click();
      await button("Pin Lab notes").click();
      await button("Unpin Lab notes").waitFor();
      await button("Edit Lab notes").click();
      await page.getByLabel("Web address").fill("https://example.org/notes/v2");
      await button("Save shortcut").click();
      await get("#new-shortcut:not([open])").waitFor({ state: "attached" });
      await button("Unpin Lab notes").waitFor();
      await button("Close shortcuts").click();
      assert.equal(
        await get("#pins")
          .getByRole("link", { name: "GitHub", exact: true })
          .count(),
        0,
      );
      await openSettings();
      await section("Search & shortcuts");
      await page.getByLabel("Open shortcuts in a new tab").check();
      await save();
      const [popup] = await Promise.all([
        context.waitForEvent("page"),
        get("#pins").getByRole("link", { name: "Lab notes" }).click(),
      ]);
      await popup.waitForURL("https://example.org/notes/v2");
      await popup.close();
    },
  );
  await check(
    "export, rejected import, preview, cancellation and legacy JSON import",
    async () => {
      await openSettings();
      await section("Data & backups");
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        button("Export JSON").click(),
      ]);
      const exported = JSON.parse(
        await readFile(await download.path(), "utf8"),
      );
      assert.equal(exported.user, "Sam");
      assert.equal(exported.visualTheme, "pixel");
      assert.equal(exported.colorScheme, "light");
      assert.ok(exported.squares.find((group) => group.name === "Personal"));
      async function upload(json) {
        await get("#import-file").setInputFiles({
          name: "config.json",
          mimeType: "application/json",
          buffer: Buffer.from(json),
        });
      }
      await upload("invalid");
      await page.waitForFunction(() =>
        document
          .querySelector("#settings-status")
          .textContent.includes("Import failed"),
      );
      assert.equal(
        await get("[name=user]").inputValue(),
        "Sam",
      );
      // Simulate a backup created before appearance and scheme were separated.
      delete exported.visualTheme;
      delete exported.colorScheme;
      const backup = JSON.stringify({
        ...exported,
        theme: "dark",
        user: "Imported",
        timeZone: "India/Kolkata",
        quickLinks: { w: { URL: "https://example.org", Search: "/?find=" } },
      });
      await upload(backup);
      await page.waitForFunction(
        () => document.querySelector("[name=user]").value === "Imported",
      );
      await button("Cancel").click();
      assert.match(await get("#greeting").innerText(), /Sam/);
      await openSettings();
      await section("Data & backups");
      await upload(backup);
      await page.waitForFunction(
        () => document.querySelector("[name=user]").value === "Imported",
      );
      await save();
      await start();
      assert.match(await get("#greeting").innerText(), /Imported/);
      assert.equal(await get("html").getAttribute("data-theme"), "pixel");
      assert.equal(await get("html").getAttribute("data-color-scheme"), "dark");
      assert.equal(await get("#zone").innerText(), "Asia/Kolkata");
      await get("#query").fill("w'fish & chips");
      await Promise.all([
        page.waitForURL("https://example.org/?find=fish%20%26%20chips"),
        get("#query").press("Enter"),
      ]);
      await start();
    },
  );
  await check("removing a custom shortcut also removes its pin", async () => {
    await openLibrary();
    await get("#library-query").fill("Lab notes");
    await button("Edit Lab notes").click();
    await button("Remove shortcut").click();
    await get("#new-shortcut:not([open])").waitFor({ state: "attached" });
    await get("#library-query").fill("Lab notes");
    assert.equal(
      await get("#library-list").innerText(),
      "No matching shortcuts.",
    );
    await button("Close shortcuts").click();
    assert.equal(
      await get("#pins").getByRole("link", { name: "Lab notes" }).count(),
      0,
    );
  });
  await check(
    "storage quota error keeps the form open and the last configuration intact",
    async () => {
      await openSettings();
      await section("Data & backups");
      const draft = JSON.parse(await get("#config-text").inputValue());
      draft.message = "x".repeat(9000);
      await get("#config-text").fill(JSON.stringify(draft));
      await button("Save settings").click();
      await page.waitForFunction(() =>
        document
          .querySelector("#settings-status")
          .textContent.toLowerCase()
          .includes("quota"),
      );
      assert.ok(await get("#settings").isVisible());
      assert.equal(
        await page.evaluate(
          async () => (await chrome.storage.sync.get("message")).message || "",
        ),
        "",
      );
      await button("Cancel").click();
    },
  );
  await check(
    "enabled weather, fresh cache, stale offline observation and unavailable city",
    async () => {
      await openSettings();
      await section("Clock & weather");
      await page.getByLabel("Show weather").check();
      await page.getByLabel("City", { exact: true }).fill("Berlin");
      await save();
      await get("#weather").getByText("18°C · Partly cloudy").waitFor();
      assert.equal(forecastCalls, 1);
      await start();
      await get("#weather").getByText("18°C · Partly cloudy").waitFor();
      assert.equal(forecastCalls, 1);
      await page.evaluate(() => {
        const key = "startpage.weather",
          data = JSON.parse(localStorage.getItem(key));
        data.at -= 3600000;
        localStorage.setItem(key, JSON.stringify(data));
      });
      weatherMode = "offline";
      await start();
      await get("#weather")
        .getByText(/cached/)
        .waitFor();
      await openSettings();
      await section("Clock & weather");
      await page.getByLabel("City", { exact: true }).fill("Oslo");
      await save();
      await get("#weather").getByText("Weather unavailable").waitFor();
      await openSettings();
      await section("Clock & weather");
      await page.getByLabel("Show weather").uncheck();
      await save();
    },
  );
  await check(
    "small viewport, native dialog keyboard isolation and focus recovery",
    async () => {
      await page.setViewportSize({ width: 320, height: 568 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await shot("mobile");
      await page.keyboard.press("Alt+k");
      await get("#library-query").fill("nomatchesxyz");
      assert.equal(
        await get("#library-list").innerText(),
        "No matching shortcuts.",
      );
      assert.equal(await get("#query").inputValue(), "");
      await page.keyboard.press("Escape");
      await get("#library").waitFor({ state: "hidden" });
      await openSettings();
      await section("Data & backups");
      assert.equal(
        await page.evaluate(
          () =>
            document.querySelector("#settings").getBoundingClientRect().right <=
            innerWidth,
        ),
        true,
      );
      await button("Cancel").click();
      assert.equal(
        await button("Open settings").evaluate(
          (el) => el === document.activeElement,
        ),
        true,
      );
      await page.setViewportSize({ width: 1280, height: 800 });
    },
  );
  await check(
    "upgrade reads old sync keys, link targets, custom colors and visibility preferences",
    async () => {
      const prior = await page.evaluate(() => chrome.storage.sync.get(null));
      await page.evaluate(async () => {
        await chrome.storage.sync.clear();
        await chrome.storage.sync.set({
          user: "Older profile",
          style: { backgroundColor: "#222222", messageColor: "orange" },
          timeZone: "India/Kolkata",
          disableSearchBar: true,
          settingsIcon: false,
          disableWeather: true,
          linkInNewTab: true,
          squares: [
            {
              name: "Work",
              links: [
                {
                  name: "Internal notes",
                  url: "http://localhost:8000/",
                  newTab: false,
                },
              ],
            },
          ],
        });
      });
      await start();
      assert.equal(await get("#preferences").isVisible(), false);
      assert.equal(await get("#search").isVisible(), false);
      assert.equal(
        await get("#greeting").evaluate((el) => getComputedStyle(el).color),
        "rgb(255, 165, 0)",
      );
      await openLibrary();
      await get("#library-query").fill("Internal notes");
      assert.equal(
        await get("#library-list a").getAttribute("target"),
        "_self",
      );
      await button("Close shortcuts").click();
      await page.keyboard.press("Control+,");
      assert.equal(
        await get("[name=colorScheme]:checked").inputValue(),
        "custom",
      );
      await section("Appearance");
      await choose("colorScheme", "light");
      await save();
      assert.notEqual(
        await get("#greeting").evaluate((el) => getComputedStyle(el).color),
        "rgb(255, 165, 0)",
      );
      await page.evaluate(async (saved) => {
        await chrome.storage.sync.clear();
        await chrome.storage.sync.set(saved);
      }, prior);
      await start();
    },
  );
  await check(
    "classic launcher, shared settings, local Chevron options and switching layouts",
    async () => {
      await openSettings();
      await choose("layout", "classic");
      await Promise.all([
        page.waitForURL("**/classic.html"),
        button("Save settings").click(),
      ]);
      const classicInput = page.locator("#root .app input").first();
      await page.waitForFunction(() =>
        document.activeElement?.matches("#root .app input"),
      );
      await checkPixelType([
        "#classic-greeting",
        "#root .app input",
      ]);
      await shot("classic");
      await classicInput.pressSequentially("git");
      await page.waitForFunction(() =>
        document
          .querySelector("#root")
          .innerText.toLowerCase()
          .includes("github"),
      );
      await page.keyboard.press("Escape");
      await openSettings();
      assert.equal(await get("[name=layout]:checked").inputValue(), "classic");
      assert.equal(await get("a.desk-return").count(), 0);
      assert.equal(await get(".classic-footer").count(), 0);
      assert.equal(await get("#settings .modal-foot .credit").innerText(), "Made with ❤️ by Prashant Gehlot");
      await page.getByLabel("Name", { exact: true }).pressSequentially("Discard");
      await choose("layout", "desk");
      await button("Cancel").click();
      assert.equal(await classicInput.inputValue(), "");
      await page.keyboard.press("Meta+,");
      assert.equal(await get("[name=layout]:checked").inputValue(), "classic");
      await section("Appearance");
      await choose("visualTheme", "glass");
      await section("Appearance");
      await choose("colorScheme", "light");
      await save();
      await openSettings();
      assert.equal(await get("html").getAttribute("data-color-scheme"), "light");
      assert.equal(await get("#settings").evaluate(el => getComputedStyle(el).borderWidth), "0px");
      await shot("classic-settings");
      await section("Appearance");
      await choose("colorScheme", "dark");
      await save();
      await get('body[data-color-scheme="dark"]').waitFor();
      assert.match(await get(".app").evaluate(el => getComputedStyle(el).backgroundImage), /gradient/);
      await openSettings();
      await section("Clock & weather");
      await page.getByLabel("Show weather").check();
      await page.getByLabel("City", { exact: true }).fill("Berlin");
      await save();
      await get(".classic-readout #weather").waitFor();
      assert.match(await get("#weather").innerText(), /18°C/);
      await openSettings();
      await section("Clock & weather");
      await page.getByLabel("Show weather").uncheck();
      await save();
      assert.equal(await get("#weather").isVisible(), false);
      await classicInput.fill("--settings");
      await classicInput.press("Enter");
      await get("#settings[open]").waitFor();
      await button("Cancel").click();
      await page.reload();
      const requestsBefore = external.length;
      await classicInput.fill("10 usd to eur");
      await classicInput.press("Space");
      await classicInput.press("Space");
      await page.waitForTimeout(400);
      assert.equal(external.length, requestsBefore);
      await classicInput.press("Escape");
      await openSettings();
      await section("Online tools");
      await page.getByRole("switch", { name: "Live currency conversions", exact: true }).check();
      await page.getByLabel("Enable AI chat", {exact:true}).check();
      await save();
      await classicInput.fill("10 usd to eur");
      await page.getByText("9.1 EUR", { exact: true }).waitFor();
      await classicInput.press("Escape");
      await classicInput.fill("Sample");
      await classicInput.press("Space");
      await classicInput.press("Space");
      await page.getByText(/Add an API key/).waitFor();
      assert.ok(
        !external.some((url) => url.startsWith("https://api.openai.com")),
      );
      await openSettings();
      const findSetting = get("#find-setting");
      await findSetting.fill("tab title");
      await page.getByLabel("Tab title", {exact:true}).fill("My Chevron");
      await findSetting.fill("missing-setting-xyz");
      assert.match(await get("#settings-matches").innerText(), /No matching/);
      await findSetting.press("Escape");
      assert.equal(await findSetting.inputValue(), "");
      await findSetting.fill("api key");
      await findSetting.press("Enter");
      assert.ok(await page.getByLabel("API key",{exact:true}).evaluate(el => document.activeElement === el));
      await page.getByLabel("API key", {exact:true}).fill("fixture-only");
      await findSetting.fill("fixture-only");
      assert.match(await get("#settings-matches").innerText(), /No matching/);
      await section("Launcher colors");
      await button("Dark palette").click();
      const darkColors = get('.color-sheet:visible');
      await darkColors.getByLabel("Accent", {exact:true}).fill("#112233");
      assert.equal(await darkColors.getByLabel("Command prefix", {exact:true}).inputValue(), "#112233");
      await shot("classic-colors");
      await save();
      await openSettings();
      await page.setViewportSize({width: 360, height: 640});
      await section("Chevron launcher");
      await get("#find-setting").fill("grid columns");
      assert.equal(await page.getByLabel("Grid columns", {exact:true}).inputValue(), "4");
      await page.getByLabel("Grid columns", {exact:true}).fill("7");
      await shot("classic-settings-narrow");
      await get("#find-setting").fill("reset");
      await button("Restore Chevron defaults").click();
      await button("Cancel").click();
      await page.setViewportSize({width:1280,height:800});
      await openSettings();
      await section("Launcher colors");
      await button("Dark palette").click();
      assert.equal(await get(".color-sheet:visible").getByLabel("Accent",{exact:true}).inputValue(),"#112233");
      await button("Cancel").click();
      assert.equal(await page.title(), "My Chevron");
      assert.ok(!JSON.stringify(await page.evaluate(() => chrome.storage.sync.get(null))).includes("fixture-only"));
      await page.evaluate(() => {
        localStorage.setItem(
          "history",
          JSON.stringify([{ id: "old history entry", type: "query" }]),
        );
      });
      await page.reload();
      await classicInput.waitFor({ state: "attached" });
      assert.equal(await page.title(), "My Chevron");
      await classicInput.fill("old history");
      await page.getByText("old history entry", { exact: true }).waitFor();
      await classicInput.press("Escape");
      await classicInput.fill("Sample");
      await classicInput.press("Space");
      await classicInput.press("Space");
      await page.getByText("Browser fixture reply", { exact: true }).waitFor();
      await openSettings();
      await choose("layout", "desk");
      await Promise.all([page.waitForURL("**/index.html"), button("Save settings").click()]);
      await get("#desk:not([hidden])").waitFor();
      await page.evaluate(() => {
        localStorage.setItem("settings", "broken json");
        localStorage.setItem("history", "{}");
      });
      await page.goto(
        new URL("classic.html", await page.evaluate(() => location.href)).href,
      );
      await page.locator("#root .app input").waitFor({ state: "attached" });
      assert.equal(
        await page.evaluate(() =>
          localStorage.getItem("startpage.recovered.settings"),
        ),
        "broken json",
      );
      assert.equal(
        await page.evaluate(() =>
          localStorage.getItem("startpage.recovered.history"),
        ),
        "{}",
      );
      await openSettings();
      await choose("layout", "desk");
      await Promise.all([page.waitForURL("**/index.html"), button("Save settings").click()]);
      await start();
    },
  );
  if (process.env.LIVE_SERVICES === "1") {
    await context.unrouteAll({ behavior: "wait" });
    await check(
      "live weather and exchange rates from the extension origin",
      async () => {
        const results = await page.evaluate(async () => {
          const { observation } = await import(
            chrome.runtime.getURL("js/weather.js")
          );
          const { convertCurrency } = await import(
            chrome.runtime.getURL("js/classic-services.js")
          );
          return Promise.allSettled([
            observation(
              { location: "Berlin", unit: "cel" },
              { storage: sessionStorage, signal: AbortSignal.timeout(10000) },
            ),
            convertCurrency(1, "USD", "EUR"),
          ]).then((items) =>
            items.map((item) =>
              item.status === "fulfilled" ? item.value : String(item.reason),
            ),
          );
        });
        console.log("Live responses", results);
        assert.equal(results[0]?.place, "Berlin");
        assert.ok(Number.isInteger(results[0].weatherCode));
        assert.ok(results[0].solarDays.length > 0);
        assert.ok(results[1] > 0);
      },
    );
  }
  // Playwright pauses the clock for every page in the context.
  await check(
    "an open new tab greets Prashant at midnight and both layouts honor saved names and visibility",
    async () => {
      await page.evaluate(() =>
        chrome.storage.sync.set({
          user: "Prashant",
          message: "",
          disableMessage: false,
          timeZone: "Asia/Kolkata",
        }),
      );
      const timed = await context.newPage();
      await timed.clock.install({ time: new Date("2025-01-01T18:29:00Z") });
      await timed.clock.pauseAt(new Date("2025-01-01T18:29:59Z"));
      await start(timed);
      const greeting = timed.locator("#greeting");
      await timed.waitForFunction(() =>
        document
          .querySelector("#greeting")
          .textContent.includes("wind down"),
      );
      await timed.clock.runFor(1100);
      assert.equal(
        await greeting.textContent(),
        "Prashant, it’s too late for another tab. Get some sleep.",
      );
      if (process.env.SCREENSHOT_DIR)
        await timed.screenshot({
          path: path.join(process.env.SCREENSHOT_DIR, "midnight.png"),
        });
      await timed.evaluate(() => chrome.storage.sync.set({ user: "Mira" }));
      await timed.waitForFunction(() =>
        document.querySelector("#greeting").textContent.startsWith("Mira,"),
      );
      const classic = await timed.evaluate(() =>
        chrome.runtime.getURL("classic.html"),
      );
      await timed.goto(classic);
      await timed.locator("#classic-greeting").waitFor();
      assert.equal(
        await timed.locator("#classic-greeting").innerText(),
        "Mira, it’s too late for another tab. Get some sleep.",
      );
      const today = await timed.locator("#classic-greeting").innerText();
      await timed.clock.fastForward(24 * 60 * 60 * 1000);
      const tomorrow = await timed.locator("#classic-greeting").innerText();
      assert.match(tomorrow, /^Mira, /);
      assert.notEqual(tomorrow, today);
      await timed.evaluate(() =>
        chrome.storage.sync.set({ disableMessage: true }),
      );
      await timed.locator("#classic-greeting").waitFor({ state: "hidden" });
      await timed.close();
    },
  );
  await check(
    "mountain sunrise crosses the ridge on an open tab and daytime rain honors reduced motion",
    async () => {
      const timed = await context.newPage();
      try {
        const before = Date.UTC(2025, 1, 4, 23, 59, 59);
        await timed.clock.setSystemTime(before);
        await start(timed);
        const canvas = timed.locator("#landscape");
        const pixels = async () =>
          createHash("sha256")
            .update(await canvas.evaluate((el) => el.toDataURL()))
            .digest("hex");
        // Track amber pixels in the actual canvas, independent of the text clock.
        const sun = () =>
          canvas.evaluate((el) => {
            const { data } = el
              .getContext("2d")
              .getImageData(0, 0, el.width, el.height);
            let count = 0,
              totalY = 0;
            for (let i = 0; i < data.length; i += 4) {
              if (
                data[i] > 220 &&
                data[i + 1] > 155 &&
                data[i + 1] < 195 &&
                data[i + 2] < 126 &&
                data[i + 3] > 100
              ) {
                count++;
                totalY += Math.floor(i / 4 / el.width);
              }
            }
            return { count, y: totalY / count };
          });
        const seed = async (rain) =>
          timed.evaluate(
            async ({ before, rain }) => {
              const rise = rain
                ? before - 5 * 3_600_000
                : before + 45 * 60_000 + 1000;
              localStorage.setItem(
                "startpage.weather",
                JSON.stringify({
                  id: JSON.stringify(["berlin", "celsius"]),
                  at: before,
                  place: "Berlin",
                  weatherCode: rain ? 65 : 0,
                  text: rain ? "18°C · Rain" : "18°C · Clear",
                  solarDays: [{ rise, set: rise + 12 * 3_600_000 }],
                  windKmh: 0,
                }),
              );
              await chrome.storage.sync.set({
                visualTheme: "pixel",
                colorScheme: "dark",
                disableWeather: false,
                weatherConf: { location: "Berlin", unit: "cel" },
                timeZone: "UTC",
              });
            },
            { before, rain },
          );
        await seed(false);
        await start(timed);
        await timed.locator("#weather").getByText("18°C · Clear").waitFor();
        await canvas.scrollIntoViewIfNeeded();
        await timed.clock.runFor(500);
        assert.equal((await sun()).count, 0);
        await timed.clock.runFor(1050);
        const first = await sun();
        assert.ok(first.count > 3, "sun appears beyond the ridge at dawn");
        await timed.clock.fastForward(7000);
        assert.ok((await sun()).y < first.y, "sun rises on screen");

        await seed(true);
        await start(timed);
        await timed.locator("#weather").getByText("18°C · Rain").waitFor();
        await timed.clock.runFor(200);
        const moving = await pixels();
        await timed.clock.runFor(480);
        assert.notEqual(await pixels(), moving);
        assert.ok((await sun()).count > 3);
        await timed.locator("#query").fill("spo");
        await canvas.waitFor({ state: "hidden" });
        await timed.clock.runFor(320);
        const hidden = await pixels();
        await timed.clock.runFor(480);
        assert.equal(await pixels(), hidden, "hidden mountains stop animating");
        await timed.locator("#query").fill("");
        await canvas.waitFor({ state: "visible" });
        await timed.clock.runFor(480);
        assert.notEqual(await pixels(), hidden);
        await timed.emulateMedia({ reducedMotion: "reduce" });
        await timed.clock.runFor(200);
        const still = await pixels();
        await timed.clock.runFor(640);
        assert.equal(await pixels(), still, "reduced motion holds one frame");
        if (process.env.SCREENSHOT_DIR)
          await timed.screenshot({
            path: path.join(process.env.SCREENSHOT_DIR, "daytime-rain.png"),
          });
        // Clearing the weather preference drops the city sky immediately.
        await timed.evaluate(() =>
          chrome.storage.sync.set({ disableWeather: true }),
        );
        await timed.locator("#weather").waitFor({ state: "hidden" });
        assert.equal((await sun()).count, 0);
        assert.notEqual(await pixels(), still);
      } finally {
        await timed.close();
      }
    },
  );
  assert.deepEqual(errors, []);
  console.log("PASS no uncaught page errors or extension CSP violations");
} finally {
  await context.close();
}
