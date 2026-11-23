import { calculate } from "./calculator.js";

// Both launchers use the shortcuts and templates shipped in config.js.
export function engineTemplates(config) {
  const engines = Object.fromEntries(
    Object.values(config.engines).map((engine) => [
      engine.name,
      engine.types.query.template,
    ]),
  );
  return {
    ...engines,
    Yahoo: "https://search.yahoo.com/search?p={$}",
    Ecosia: "https://www.ecosia.org/search?q={$}",
    Startpage: "https://www.startpage.com/do/search?query={$}",
    Baidu: "https://www.baidu.com/s?wd={$}",
  };
}

export function webURL(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return null;
  try {
    return new URL(value).href;
  } catch {
    return null;
  }
}

export function address(text) {
  if (/\s/.test(text)) return null;
  if (/^https?:\/\//i.test(text)) return webURL(text);
  if (
    !/^(?:localhost|\[[\da-f:]+\]|[\p{L}\d-]+(?:\.[\p{L}\d-]+)+)(?::\d+)?(?:[/?#]|$)/iu.test(
      text,
    )
  )
    return null;
  const local = /^(?:localhost|127\.\d+\.\d+\.\d+|\[::1\])(?=[:/?#]|$)/i.test(
    text,
  );
  return webURL((local ? "http://" : "https://") + text);
}

export function linkId(groupName, link) {
  return JSON.stringify([groupName, link.name, link.url]);
}

export function catalogFor(macros, groups) {
  const sites = macros.map((site) => ({ ...site, id: site.name }));
  for (const group of groups) {
    const entries = group.url ? [group, ...group.links] : group.links;
    for (const link of entries) {
      sites.push({
        ...link,
        id: linkId(group.name, link),
        category: group.name,
        color: group.color,
        triggers: [],
      });
    }
  }
  return sites;
}

// Exact shortcuts win, followed by the visible name and then alias prefixes.
// Substring, category and host matches are useful suggestions below a web search.
function rankedMatches(term, sites) {
  function rank(site) {
    const name = site.name.toLowerCase();
    if (name === term || site.triggers.includes(term)) return 0;
    if (name.startsWith(term)) return 1;
    if (site.triggers.some((alias) => alias.startsWith(term))) return 2;
    if (name.includes(term)) return 3;
    if (
      site.category.toLowerCase().includes(term) ||
      new URL(site.url).hostname.includes(term)
    )
      return 4;
    return Infinity;
  }
  return sites
    .map((site) => ({ site, rank: rank(site) }))
    .filter((match) => Number.isFinite(match.rank))
    .sort((a, b) => a.rank - b.rank);
}

export function matches(query, sites) {
  const term = query.trim().toLowerCase();
  return term ? rankedMatches(term, sites).map((match) => match.site) : sites;
}

function webSearch(text, settings, engines) {
  return {
    kind: "search",
    url: engines[settings.searchEngine].replace("{$}", () =>
      encodeURIComponent(text),
    ),
    label: settings.searchEngine,
  };
}

function explicitTarget(text, settings, sites) {
  if (/^--settings?$/i.test(text)) return { action: "settings" };
  const result = calculate(text);
  if (result !== null) return { action: "calculate", result };
  const direct = address(text);
  if (direct) return { url: direct, label: new URL(direct).host };
  const match = text.match(/^([^?/'\s]+)([?/' ])([\s\S]*)$/);
  if (match) {
    const [, key, op, arg] = match;
    const alias = key.toLowerCase();
    // Explicit legacy aliases win for the two legacy operators.
    if (
      (op === "'" || op === "/") &&
      Object.hasOwn(settings.quickLinks, alias)
    ) {
      const entry = settings.quickLinks[alias];
      const base = typeof entry === "string" ? entry : entry.URL;
      const tail =
        op === "/"
          ? "/" + arg.split("/").map(encodeURIComponent).join("/")
          : (entry.Search || "/search?q=") + encodeURIComponent(arg);
      return { url: base.replace(/\/$/, "") + tail, label: new URL(base).host };
    }
    const site = sites.find((s) => s.triggers.includes(alias));
    const command =
      op !== " " && site?.commands?.[op === "/" ? "go" : "search"];
    if (command) {
      const argument =
        op === "/"
          ? arg.split("/").map(encodeURIComponent).join("/")
          : encodeURIComponent(arg);
      return {
        ...site,
        url: command.template
          .replace("{@}", () => site.url.replace(/\/$/, ""))
          .replace("{$}", () => argument),
        label: site.name,
      };
    }
  }
  return null;
}

export function searchResults(raw, settings, sites, engines) {
  const text = raw.trim();
  if (!text) return [];
  const ranked = rankedMatches(text.toLowerCase(), sites);
  const direct = explicitTarget(text, settings, sites);
  if (direct) {
    return [
      direct,
      ...ranked
        .filter(({ site }) => site.id !== direct.id)
        .slice(0, 5)
        .map(({ site }) => site),
    ];
  }
  // Reserve a row for searching the literal input, even on a common prefix.
  const results = ranked.slice(0, 5);
  const prefixes = results.filter((match) => match.rank <= 2).length;
  const options = results.map((match) => match.site);
  options.splice(prefixes, 0, webSearch(text, settings, engines));
  return options;
}

export function resolveQuery(
  raw,
  settings,
  sites,
  engines,
  forceSearch = false,
) {
  if (forceSearch && raw.trim())
    return webSearch(raw.trim(), settings, engines);
  return searchResults(raw, settings, sites, engines)[0] ?? null;
}
