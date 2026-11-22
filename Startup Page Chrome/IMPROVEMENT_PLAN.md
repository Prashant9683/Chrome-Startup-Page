# Startpage improvement plan

## Architecture found in the original project

Chrome loads `index.html` through the Manifest V3 `newtab` override. There is no service worker, build manifest, source map, or existing test suite. The page starts two independent applications.

| Files | Responsibility | Finding |
| --- | --- | --- |
| `script.js`, `style.css` | Bundled React Chevron launcher, animations, theme editor, history, search, optional AI and currency lookups | The launcher owns a full viewport and uses localStorage. Its remote autocomplete inserts a script that extension pages cannot load. A small viewport can trigger a blocking mobile warning. |
| `config.js`, `icons.js` | Site aliases, pinned sites, keyboard shortcuts, command templates, search engines and local brand artwork | These catalogs can serve both interfaces without duplicating shortcut definitions. |
| `js/main.js`, `js/search.js`, `js/autocomplete.js`, `config.json` | A second greeting, clock, weather, grouped links and quick-link parser | Startup references missing search and link containers. The date and greeting use different clocks. Weather uses HTTP and a bundled key. Keyboard selection always navigates to the first result. |
| `js/settings.js`, `js/version.js`, JSONEditor assets | A second editor, JSON backups and remote release checks | Closing saves, imports lack validation, and the version check points at another project's releases. The editor reads top-level Chrome sync keys, separately from Chevron preferences. |
| `scss/main.scss`, `css/main.css`, `font.css`, `fonts/`, `img/` | The second layout, alternative font declarations, packaged fonts and extension icon | Fixed dimensions and competing body styles clip the page. The standalone font stylesheet references absent files. The shipped bundle already embeds its own fonts. |

## Implementation sequence

1. **Give the new tab one owner.** Build the default view with native HTML, CSS and small JavaScript modules. Retain the chevron, keyboard-first navigation, clock and shortcuts. Put the original Chevron interface behind a preference with a return path so its themes, history and advanced tools remain accessible.
2. **Make search useful offline.** Reuse the catalog for exact aliases, site searches such as `yt?music`, site paths, local suggestions and pinned links. Support direct addresses, ordinary searches, legacy quick links and a keyboard-selectable result list. Keep the idle page to a single search field and a short row of pins. Put the full catalog and pin controls in a dialog.
3. **Make configuration reversible.** Add labeled controls for common settings and validated JSON import/export. Preserve existing sync keys, grouped links and per-link tab preferences. Keep edits in a draft until Save succeeds. Reflect saved changes across open new tabs. Use the installed manifest for the version.
4. **Make time and weather reliable.** Use one configured time zone for the greeting, date and clock. Make weather opt-in for fresh installations. Cache city-based HTTPS observations, label stale data and handle an unavailable service without blocking search. Keep the extension's existing permission footprint.
5. **Verify the shipped entry points.** Run deterministic tests for parsing, settings and weather. Load the unpacked extension in an isolated Chromium profile, open a real new tab, and exercise typing, keyboard selection, pins, settings, backups, legacy data, offline behavior, narrow layouts and the classic launcher.
6. **Animate the mountain landscape beside the clock.** Keep the dot grid and mountain silhouettes. Move the sun over the ridge at dawn and dusk, layer the current city's weather over the day or night sky, and use the configured clock for a fully offline scene. Check the actual canvas in Chrome, including a tab left open through sunrise, reduced motion and city changes.

## Acceptance criteria

- A fresh new tab opens and searches offline with all UI assets available locally. Submitting an external search or link can still require connectivity.
- The chosen suggestion, engine and tab target determine navigation. Literal query punctuation survives encoding.
- A failed save or invalid backup leaves the last saved configuration usable. Existing preferences remain available after an upgrade.
- Both layouts are reachable. The default works at phone and desktop widths with keyboard-visible focus.
- The final verification record identifies the browser and test commands, and distinguishes provider fixtures from live service checks.

## Follow-up from integration testing

The old search field also obtained calculator suggestions from remote autocomplete. Restore that behavior locally in both layouts. Exercise the classic launcher's optional network features separately, including interrupted chat streams and unavailable exchange rates. Keep them out of the default tab's startup path.

## Delivered in 2.0.0

The initial 2.0 desk loaded approximately 81 KB of JavaScript from disk, including all shortcut definitions and icons. The original entry point referenced 2.25 MB. At release this was a 96.4% reduction in uncompressed JavaScript for the default tab. Both figures count the scripts and modules on the startup path and exclude fonts and CSS.

| Entry or module | Current responsibility |
| --- | --- |
| `index.html`, `css/main.css`, `js/main.js` | Responsive desk, keyboard shortcuts, navigation, theme and refresh lifecycle |
| `config.json`, `js/preferences.js`, `js/settings.js` | Defaults, validation, legacy sync keys, form drafts, JSON backups and cross-tab updates |
| `config.js`, `icons.js`, `js/search.js`, `js/autocomplete.js`, `js/calculator.js` | Shared shortcut catalog, local matching, command routing, result selection and arithmetic |
| `js/brand.js` | Original shortcut colors and gradients, plus the default layout’s animated field of diagonal site names |
| `js/library.js` | Library filtering, pinning and personal shortcut creation, editing and removal |
| `js/clock.js`, `js/weather.js`, `js/landscape.js` | Zoned clock and greeting, city weather cache, solar timing and animated mountain landscape |
| `classic.html`, `js/classic.js`, `script.js`, `style.css`, `js/classic-services.js` | Original Chevron launcher, local history, advanced themes and optional chat and currency tools |

Fresh installs use the Pixel theme and Dark color scheme, follow the device time zone, show six pins and make no external requests on opening a tab. Settings offers Pixel, Original, Editorial, Terminal and Glass independently of the color scheme. Existing synced custom colors are selectable under **Color scheme**. An existing sync configuration still controls the greeting, weather, links and visibility. Classic keeps its own local history, themes and optional API key. The Startpage JSON backup covers the desk configuration and personal shortcuts. It excludes Classic's local history and credentials.

Typing selects the top shortcut and previews its brand as the query grows. Exact aliases take priority, followed by name prefixes and alias prefixes. For example, `s` selects Stack Overflow and every prefix from `sp` through `spotify` selects Spotify. Enter opens the selected result, and the arrow keys cycle through alternatives. The query, greeting and controls sit directly on the animated background. Foreground colors adapt to the palette, and the repeating lettering softens beneath the query. Ordinary search text such as `spotify playlist ideas` shows a scrolling GOOGLE SEARCH pattern over the four Google logo colors. Selecting the web search option or pressing Command+Enter or Ctrl+Enter searches the typed text using the saved engine. The backdrop follows keyboard selections and respects reduced motion. Both layouts use the saved name and time zone to rotate 49 lines across seven daily periods. The default name is Prashant. A saved custom message takes priority.

Both layouts use the same Settings dialog. Choose **Settings → General → New-tab layout** to switch either way. Settings has searchable topics for the launcher, colors and optional online tools. The original React source tree and build recipe were absent from the provided project. The bundled launcher remains the maintenance boundary for Classic. The unused JSONEditor bundle and its styles were removed. The legacy Sass and alternate font definitions are outside both active startup paths.

Weather uses the configured city and a 30-minute cache. If refresh fails, a matching cached observation can be displayed for up to 24 hours with a visible cached label. Classic currency conversion requests a daily rate table and applies the amount locally. [Open-Meteo geocoding](https://open-meteo.com/en/docs/geocoding-api), [weather API](https://open-meteo.com/en/docs), [exchange-rate data source](https://github.com/fawazahmed0/exchange-api)

The small mountain scene on the default layout follows the weather city's sunrise and sunset. Dawn and dusk span up to 45 minutes on either side of each event. The sun climbs from the left ridge, crosses the sky, and sinks behind the right ridge. At night, a crescent and stars sit above the mountains. Fresh observations add clouds, fog, drizzle, rain, showers, snow, thunderstorms or hail. Strong wind moves clouds faster and angles the rain. Expired observations can still supply the solar timetable. With weather off, dawn and dusk are centered on 06:00 and 18:00 in the clock's time zone.

The canvas draws on a fixed dot grid and reuses a cached mountain layer. It pauses when hidden and honors the system's reduced-motion preference with a still illustration.

## Verification on 20 November 2026

| Check | Result |
| --- | --- |
| Original unpacked extension | Reproduced the missing search-input startup exception. With external requests blocked, weather also failed and retained its loading message. |
| Node.js 22.16.0 | All 14 test groups passed. Coverage includes every bundled alias, command template and engine, legacy imports, time-zone boundaries, cache expiry, arithmetic, split UTF-8 chat streams and failed requests. |
| Chrome for Testing 149.0.7827.55 | All 15 deterministic browser scenarios passed using the unpacked extension in a temporary profile. Chrome opened the override through `chrome://newtab/`. The run recorded zero uncaught page errors and zero detected extension CSP violations. |
| Interaction and persistence | Verified the selected suggestion's destination, actual popup targets, custom link edits and removal, cross-tab updates, canceled edits, legacy colors and visibility switches, JSON downloads and imports, and recovery from a real Chrome sync quota rejection. |
| Layout and offline behavior | Inspected 1280 × 800 dark and 320 × 568 light layouts. Checked keyboard focus, Escape, dialog overflow, a disconnected first load, cached weather and provider failure. |
| Brand previews and greetings | Verified Spotify while typing and navigating with Go, the borderless controls, GitHub’s dark palette, Wikipedia’s light palette, Instagram’s radial gradient, keyboard-selected shortcuts, reduced motion, and desktop and narrow viewport rendering. An open tab crossed midnight in Asia/Kolkata and displayed the sleep message. Saved names and the greeting visibility setting were checked in Classic as well. |
| Live providers | Berlin geocoding and weather, and a USD-to-EUR conversion, succeeded from the extension origin. Classic chat used a synthetic streaming response and test key. No user's API account was accessed. |
| Static checks | Every project JavaScript file passed `node --check`. Manifest resources and local HTML entry-point references passed the asset checks. |

## Landscape verification on 21 November 2026

All 17 unit tests and 16 deterministic Chrome scenarios passed. The new tests cover every supported weather code, solar events across midnight, polar day and night, wind, expired observations and upgrading the old text-only cache. In Chrome, a tab stayed open through dawn and the sun's pixels moved up the ridge. Rain moved during normal viewing, paused behind the Spotify search animation, resumed on dismissal and held still under reduced motion. Disabling weather restored the clock-based sky immediately. The live Berlin request returned two days of solar events and current weather and wind. The browser reported zero uncaught page errors and zero extension CSP violations.

## Homepage personalization

The Startpage desk has two optional widgets. Notes saves a scratchpad as you type. To-do tracks reminders, completion and optional due dates against the local calendar. Both start disabled. Users can place them with a pointer or keyboard. The placement routine checks the visible desk sections and the other widget, and reserves scrollable space below the desk when the window is too narrow.

The shared Settings dialog stores these switches and a display-sized copy of the chosen wallpaper in local IndexedDB. Text, tasks and positions live in local browser storage. Open tabs receive changes, and a Web Lock serializes reminder edits across tabs. The wallpaper applies frosted surfaces only to the idle desk. Opening a search hands the full background back to the search animation.

## Run it locally

Load this folder through **Load unpacked** in Chrome's extensions developer mode. For an existing unpacked installation pointing to this folder, click **Reload**, then open a new tab. The extension runs directly from its checked-in files.

With Node.js 22 or newer, run the unit and browser suites from this directory.

```sh
npm test
npm ci
npx playwright-core install chromium
npm run test:browser
```

Set `LIVE_SERVICES=1` for the additional live weather and exchange-rate checks. `CHROMIUM_PATH` can point at an existing Chrome for Testing executable. `SCREENSHOT_DIR` saves the tested desktop and narrow layouts.
