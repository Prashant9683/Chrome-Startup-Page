export const systemDark = matchMedia("(prefers-color-scheme: dark)");

export function applyAppearance(config) {
  document.documentElement.dataset.theme = config.visualTheme;
  document.documentElement.dataset.colorScheme =
    config.colorScheme === "system"
      ? systemDark.matches
        ? "dark"
        : "light"
      : config.colorScheme === "custom"
        ? "dark"
        : config.colorScheme;
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
    const value = config.colorScheme === "custom" && config.style[key];
    document.documentElement.style.setProperty(
      "--" + variable,
      value && CSS.supports("color", value) ? value : "",
    );
  }
}
