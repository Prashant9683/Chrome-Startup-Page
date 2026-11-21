// Both layouts read the same solid colors, gradient directions and stops.
export function brandBackground(palette) {
  if (palette.type === "solid") return palette.color;
  const direction =
    palette.angle ?? (palette.gradientType === "linear" ? 45 : "");
  const stops = palette.colors.map((color, index) =>
    palette.stops?.[index] != null
      ? color + " " + palette.stops[index] + "%"
      : color,
  );
  if (direction !== "")
    stops.unshift(
      typeof direction === "number" ? direction + "deg" : direction,
    );
  return palette.gradientType + "-gradient(" + stops.join(", ") + ")";
}

// Find one ink that reads across the entire scene. A gradient with both
// light and dark stops can need a slight tint even with pure black or white.
export function sceneColors(palette, textColor) {
  const colors = palette.colors ?? [palette.color];
  // Custom catalogs can also specify CSS variables, named colors or alpha.
  // Those palettes already provide their intended foreground in textColor.
  if (!colors.every((color) => /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color))) {
    return { ink: textColor, wash: "transparent" };
  }
  const stops = colors.map((hex) => {
    const digits = hex.slice(1);
    const full =
      digits.length === 3 ? [...digits].map((ch) => ch + ch).join("") : digits;
    return full.match(/../g).map((pair) => parseInt(pair, 16) / 255);
  });
  // Include the blends between stops as well as the listed colors.
  const samples = [...stops];
  for (let i = 1; i < stops.length; i++) {
    for (const position of [0.25, 0.5, 0.75]) {
      samples.push(
        stops[i].map(
          (end, j) => stops[i - 1][j] * (1 - position) + end * position,
        ),
      );
    }
  }
  function luminance(rgb, tint, amount) {
    const linear = rgb.map((channel) => {
      const value = channel * (1 - amount) + tint * amount;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }
  for (let percent = 0; percent <= 100; percent += 4) {
    const amount = percent / 100;
    const darkest = Math.min(
      ...samples.map((rgb) => luminance(rgb, 1, amount)),
    );
    const lightest = Math.max(
      ...samples.map((rgb) => luminance(rgb, 0, amount)),
    );
    const blackContrast = (darkest + 0.05) / 0.05;
    const whiteContrast = 1.05 / (lightest + 0.05);
    if (Math.max(blackContrast, whiteContrast) >= 5) {
      const darkInk = blackContrast >= whiteContrast;
      return {
        ink: darkInk ? "#000" : "#fff",
        wash: darkInk
          ? `rgb(255 255 255 / ${percent}%)`
          : `rgb(0 0 0 / ${percent}%)`,
      };
    }
  }
}

const googleSearch = {
  name: "Google Search",
  bgColor: {
    type: "gradient",
    gradientType: "linear",
    angle: 115,
    colors: ["#4285f4", "#ea4335", "#fbbc04", "#34a853"],
    stops: [18, 44, 66, 88],
  },
  textColor: "#000",
};

export function brandPreview(macros) {
  const layer = document.querySelector("#brand-backdrop");
  const plane = layer.querySelector(".brand-plane");
  const byName = new Map(macros.map((site) => [site.name, site]));
  const byHost = new Map();
  for (const site of macros) {
    byHost.set(new URL(site.url).hostname.replace(/^www\./, ""), site);
    byHost.set(site.normalisedURL, site);
  }
  let current;
  return (target) => {
    let brand;
    if (target?.kind === "search") {
      brand = googleSearch;
    } else if (target?.url) {
      brand =
        byName.get(target.id) ??
        byHost.get(new URL(target.url).hostname.replace(/^www\./, ""));
    }
    if (brand === current) return;
    current = brand;
    layer.hidden = !brand;
    if (!brand) {
      document.body.style.removeProperty("--scene-ink");
      return;
    }
    const { ink, wash } = sceneColors(brand.bgColor, brand.textColor);
    document.body.style.setProperty("--scene-ink", ink);
    layer.style.setProperty("--scene-wash", wash);
    layer.style.background = brandBackground(brand.bgColor);
    plane.style.color = brand.textColor;
    const word = brand.name.toUpperCase() + "   ";
    plane.style.setProperty("--word-step", word.length + "ch");
    // The plane overscans the viewport so rotated rows cover the corners.
    if (!plane.childElementCount) {
      for (let i = 0; i < 16; i++) plane.append(document.createElement("div"));
    }
    const rowText = word.repeat(Math.ceil(96 / word.length));
    for (const row of plane.children) row.textContent = rowText;
  };
}
