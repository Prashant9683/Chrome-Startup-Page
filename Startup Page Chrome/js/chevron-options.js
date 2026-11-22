// Labels and grouping belong to Settings. Defaults, allowed ranges and linked
// palette colors come from the same schema the launcher uses.
const sections = [
  [
    "general",
    "Browser tab",
    [
      ["general.tabTitle", "Tab title", "name browser tab"],
      ["general.locale", "Language code", "locale regional formatting"],
    ],
  ],
  [
    "search",
    "Typing & suggestions",
    [
      ["query.field.caret", "Show the typing cursor", "caret cursor"],
      ["query.field.fontSize", "Search text size", "query font typography"],
      [
        "query.suggestions.fontSize",
        "Suggestion text size",
        "autocomplete font",
      ],
      [
        "query.suggestions.autocompleteLimit",
        "Maximum suggestions",
        "autocomplete limit results",
      ],
      [
        "query.forceSearchEngineOnCtrl",
        "Hold Ctrl to use the search engine",
        "force web search control shortcut",
      ],
      [
        "query.notifyAboutForcedSearchEngine",
        "Show the forced-search indicator",
        "notify search engine control",
      ],
      [
        "general.quickRedirect",
        "Skip the animation when opening a link",
        "instant redirect navigation",
      ],
    ],
  ],
  [
    "search",
    "Search history",
    [
      ["general.searchHistory", "Remember searches", "save history privacy"],
      [
        "query.suggestions.historyLimit",
        "Maximum history suggestions",
        "recent searches limit",
      ],
    ],
  ],
  [
    "time",
    "Chevron menu clock",
    [
      ["menu.time.fontSize", "Menu clock text size", "font time"],
      [
        "menu.time.format",
        "Menu clock pattern",
        "custom time format",
        "Keep h:MM to use your shared clock settings.",
      ],
    ],
  ],
  [
    "launcher",
    "Shape & motion",
    [
      ["chevron.size", "Chevron size", "symbol logo width"],
      ["chevron.thickness", "Stroke thickness", "chevron line weight"],
      [
        "general.animationSpeed",
        "Animation duration",
        "transition motion speed",
      ],
      ["chevron.quickLook.topCurvature", "Upper curve", "top curvature shape"],
      [
        "chevron.quickLook.bottomCurvature",
        "Lower curve",
        "bottom curvature shape",
      ],
    ],
  ],
  [
    "launcher",
    "Shortcut preview",
    [
      [
        "chevron.quickLook.fontSize",
        "Preview text size",
        "quick look font label",
      ],
      ["chevron.quickLook.marquee", "Scroll long labels", "marquee quick look"],
      [
        "chevron.quickLook.showMacrosLabel",
        "Show shortcut labels",
        "macro name quick look",
      ],
    ],
  ],
  [
    "launcher",
    "Shortcut menu",
    [
      ["menu.rows", "Grid rows", "menu shortcuts tiles grid height"],
      ["menu.columns", "Grid columns", "menu shortcuts tiles grid width"],
      ["menu.gap", "Tile spacing", "grid gap"],
      ["menu.pagination", "Show page dots", "pagination navigation"],
      ["menu.arrows", "Show navigation arrows", "previous next page"],
      ["menu.drag", "Drag between pages", "swipe menu navigation"],
    ],
  ],
  [
    "assistant",
    "Currency",
    [
      [
        "query.liveCurrency",
        "Live currency conversions",
        "exchange rates money",
        "Fetch the base currency’s daily rates from jsDelivr when you type a conversion.",
      ],
    ],
  ],
  [
    "assistant",
    "AI chat",
    [
      [
        "query.AI.enabled",
        "Enable AI chat",
        "assistant openai double space",
        "Double-space sends your prompt to OpenAI using your API key.",
      ],
      [
        "query.AI.apiKey",
        "API key",
        "openai token credentials secret",
        "Stored on this device.",
      ],
      ["query.AI.model", "Model", "openai chat completions"],
      ["query.AI.temperature", "Response randomness", "temperature creativity"],
      ["query.AI.language", "Response language", "answer reply language"],
    ],
  ],
];
const colors = {
  primary: "Primary text",
  secondary: "Base background",
  accent: "Accent",
  chevron: "Chevron mark",
  query: "Search text",
  suggestions: "Suggestions",
  time: "Clock",
  background: "Page background",
  card: "Shortcut card",
  prefix: "Command prefix",
  visited: "Visited links",
};
const at = (object, path) => path.reduce((node, key) => node?.[key], object);
const valueOf = (input) =>
  input.type === "checkbox"
    ? input.checked
    : input.type === "number"
      ? input.valueAsNumber
      : input.value;

export function chevronOptions(schema, read) {
  let controls, reset, clearHistory;
  return {
    open(form, refresh) {
      let paletteMode = document.documentElement.dataset.colorScheme;
      let chosenPalette;
      function group(page, title) {
        const node = document.createElement("div");
        node.className = "setting-group";
        node.dataset.local = "";
        const heading = document.createElement("h4");
        heading.textContent = title;
        node.append(heading);
        form.querySelector('[data-page="' + page + '"]').append(node);
        return node;
      }
      function field(parent, path, spec, value, title, keywords, help) {
        const row = document.createElement("label");
        row.className = "setting-row local-setting";
        row.dataset.setting = [keywords, path.at(-1)].join(" ");
        const name = document.createElement("span");
        name.textContent = title;
        const input = document.createElement("input");
        input.setAttribute("aria-label", title);
        if (typeof value === "boolean") {
          row.classList.add("switch-row");
          input.type = "checkbox";
          input.setAttribute("role", "switch");
          input.checked = value;
        } else {
          if (typeof value === "number") {
            input.type = "number";
            input.min = spec.min;
            input.max = spec.max;
            input.step = spec.step;
            input.required = true;
            const unit = spec.format?.replace("{@}", "");
            if (unit) name.append(" (" + unit + ")");
          } else if (path.at(-1) === "apiKey") {
            input.type = "password";
            input.autocomplete = "off";
          } else if ("contrast" in spec && /^#[0-9a-f]{6}$/i.test(value)) {
            input.type = "color";
          }
          input.value = value;
          if (spec.placeholder) input.placeholder = spec.placeholder;
        }
        row.append(name, input);
        if (help) {
          const hint = document.createElement("small");
          hint.id = "chevron-hint-" + controls.length;
          hint.textContent = help;
          input.setAttribute("aria-describedby", hint.id);
          row.append(hint);
        }
        parent.append(row);
        controls.push({ path, input, original: valueOf(input) });
        return input;
      }
      function populate(current) {
        controls = [];
        form
          .querySelectorAll(".setting-group[data-local]")
          .forEach((el) => el.remove());
        for (const [page, title, fields] of sections) {
          const node = group(page, title);
          for (const [key, label, keywords, hint] of fields) {
            const path = key.split(".");
            const spec = at(schema, path);
            field(
              node,
              path,
              spec,
              at(current, path) ?? spec.defaultValue,
              label,
              keywords,
              hint,
            );
          }
          if (title === "Search history") {
            const row = document.createElement("label");
            row.className = "setting-row switch-row";
            row.dataset.setting =
              "delete erase clear saved recent history privacy";
            clearHistory = document.createElement("input");
            clearHistory.type = "checkbox";
            clearHistory.setAttribute("role", "switch");
            row.append("Clear local history on save", clearHistory);
            node.append(row);
          }
        }

        const palettes = current.appearance.themes;
        chosenPalette = Object.hasOwn(palettes, current.appearance.activeTheme)
          ? current.appearance.activeTheme
          : "default";
        const toolbar = group("colors", "Palette");
        const picker = document.createElement("label");
        picker.className = "setting-row";
        picker.dataset.setting = "active theme collection";
        const select = document.createElement("select");
        for (const key of Object.keys(palettes))
          select.add(new Option(key, key));
        select.value = chosenPalette;
        picker.append("Active palette", select);
        if (select.length > 1) toolbar.append(picker);
        controls.push({
          path: ["appearance", "activeTheme"],
          input: select,
          original: select.value,
        });
        const mode = document.createElement("div");
        mode.className = "palette-modes";
        mode.dataset.setting = "edit light dark palette";
        const modes = ["light", "dark"];
        for (const scheme of modes) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent =
            scheme === "dark" ? "Dark palette" : "Light palette";
          button.onclick = () => {
            paletteMode = scheme;
            updatePalette();
            refresh();
          };
          mode.append(button);
        }
        toolbar.append(mode);
        const sheets = [];
        for (const [key, palette] of Object.entries(palettes)) {
          for (const scheme of modes) {
            if (!palette?.[scheme]) continue;
            const node = group(
              "colors",
              scheme === "dark" ? "Dark colors" : "Light colors",
            );
            node.classList.add("color-sheet");
            sheets.push({ key, scheme, node });
            const specs = schema.appearance.themes.default[scheme];
            const pickers = {};
            for (const [keyColor, spec] of Object.entries(specs)) {
              const path = ["appearance", "themes", key, scheme, keyColor];
              const input = field(
                node,
                path,
                spec,
                at(current, path) ?? spec.defaultValue,
                colors[keyColor] || keyColor,
                "palette colour " + scheme,
              );
              pickers[keyColor] = input;
              input.oninput = () => {
                for (const sibling of Object.keys(spec.dependants || {})) {
                  const target = pickers[sibling];
                  target.value = input.value;
                  target.dispatchEvent(new Event("input"));
                }
              };
            }
          }
        }
        function updatePalette() {
          for (const [index, button] of [...mode.children].entries())
            button.setAttribute(
              "aria-pressed",
              String(modes[index] === paletteMode),
            );
          for (const { key, scheme, node } of sheets) {
            node.toggleAttribute("data-unavailable", key !== chosenPalette);
            node.dataset.inactive = String(scheme !== paletteMode);
          }
        }
        select.onchange = () => {
          chosenPalette = select.value;
          updatePalette();
          refresh();
        };
        updatePalette();
      }
      reset = false;
      populate(read());
      form.querySelector("[data-reset]").onclick = () => {
        const clear = clearHistory.checked;
        reset = true;
        populate(read(true));
        clearHistory.checked = clear;
        refresh();
        form.querySelector("#settings-status").textContent =
          "Chevron defaults loaded. Save settings to keep them.";
      };
    },
    edits() {
      const fields = controls
        .filter(({ input, original }) => valueOf(input) !== original)
        .map(({ path, input }) => [path, valueOf(input)]);
      return { fields, reset, clearHistory: clearHistory.checked };
    },
  };
}
