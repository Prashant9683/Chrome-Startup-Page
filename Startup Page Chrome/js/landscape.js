import { condition, weatherRefreshMs } from "./weather.js";

const minute = 60_000;
const twilight = 45 * minute;
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const wrap = (x, period) => ((x % period) + period) % period;

// Solar events are absolute instants. The desk clock may show a different city.
export function landscapeScene(now, minuteOfDay, weather) {
  const fresh =
    weather &&
    !weather.stale &&
    now >= weather.at &&
    now - weather.at < weatherRefreshMs;
  const sky = condition(fresh ? weather.weatherCode : null).sky;
  const windy = Boolean(fresh && weather.windKmh >= 28);
  const heavy =
    fresh && [55, 57, 65, 67, 75, 82, 86, 99].includes(weather.weatherCode);
  const atmosphere = { sky, windy, heavy: Boolean(heavy) };
  const days = Array.isArray(weather?.solarDays)
    ? weather.solarDays.filter(
        (day) =>
          Number.isFinite(day?.rise) &&
          Number.isFinite(day.set) &&
          day.set > day.rise,
      )
    : [];
  const distance = ({ rise, set }) => Math.max(rise - now, now - set, 0);
  const nearest = days.reduce(
    (best, day) => (!best || distance(day) < distance(best) ? day : best),
    null,
  );
  let rise, set;
  if (nearest && distance(nearest) < 24 * 60 * minute) {
    ({ rise, set } = nearest);
  } else if (fresh && typeof weather.isDay === "boolean") {
    // Polar day/night, or a provider response without a solar timetable.
    return {
      ...atmosphere,
      phase: weather.isDay ? "day" : "night",
      progress: 0.5,
    };
  } else {
    rise = now + (6 * 60 - minuteOfDay) * minute;
    set = rise + 12 * 60 * minute;
  }
  const span = Math.min(twilight, (set - rise) / 4);
  let phase = "night";
  if (Math.abs(now - rise) <= span) phase = "sunrise";
  else if (Math.abs(now - set) <= span) phase = "sunset";
  else if (now > rise && now < set) phase = "day";
  const progress = clamp((now - rise + span) / (set - rise + 2 * span), 0, 1);
  return { ...atmosphere, phase, progress };
}

// Grid coordinates, shared by the sky and all three cut-paper mountain ridges.
const cols = 90,
  rows = 43,
  pitch = 3,
  size = 2;
const ridges = [
  [
    [0, 30],
    [9, 25],
    [15, 27],
    [26, 17],
    [32, 21],
    [40, 13],
    [56, 27],
    [65, 22],
    [73, 24],
    [82, 18],
    [90, 21],
  ],
  [
    [0, 34],
    [13, 29],
    [21, 31],
    [33, 23],
    [44, 29],
    [50, 26],
    [60, 31],
    [69, 24],
    [80, 29],
    [90, 26],
  ],
  [
    [0, 37],
    [13, 34],
    [23, 36],
    [34, 32],
    [45, 35],
    [58, 32],
    [70, 35],
    [82, 31],
    [90, 34],
  ],
];
const heights = ridges.map((points) =>
  Array.from({ length: cols }, (_, x) => {
    const i = points.findIndex(([end]) => end > x);
    const [a, y] = points[i - 1],
      [b, z] = points[i];
    return Math.round(y + ((z - y) * (x - a)) / (b - a));
  }),
);
const edge = (x) => Math.min(1, (x + 1) / 5, (cols - x) / 5);
function terrainPaths() {
  // Batch the permanent mountain dots by opacity so each frame reuses the paths.
  const tones = Array.from({ length: 16 }, () => new Path2D());
  for (let x = 0; x < cols; x++) {
    const [back, mid, front] = heights.map((layer) => layer[x]);
    for (let y = back; y < rows - 2; y++) {
      const ridge = y >= front ? front : y >= mid ? mid : back;
      const depth = y - ridge;
      const strength = ridge === front ? 0.91 : ridge === mid ? 0.69 : 0.58;
      const alpha =
        strength *
        (0.29 + 0.71 * Math.exp(-depth / 3.6)) *
        edge(x) *
        Math.min(1, (rows - 2 - y) / 4);
      tones[Math.round(15 * alpha)].rect(x * pitch, y * pitch, size, size);
    }
  }
  return tones;
}

const cumulus = [
  "      +++",
  "    ++###++",
  "  ++#######+++",
  " +############+",
  "+##############++",
  "#################+",
  "  ==============",
];
const stratus = [
  "        +++++",
  "    ++++#####++++",
  " +++#############++++",
  "+####################++",
  "  ===================",
];
const clouds = [
  [12, 9, 0.64],
  [51, 3, 0.4],
  [77, 10, 0.72],
  [32, 2, 0.49],
  [103, 5, 0.45],
];
const stars = [
  [4, 9],
  [14, 4],
  [23, 12],
  [34, 6],
  [45, 3],
  [53, 11],
  [59, 5],
  [73, 9],
  [84, 3],
  [87, 14],
];
const bolt = [
  [0, 0],
  [-1, 1],
  [-2, 2],
  [-3, 3],
  [-2, 3],
  [-1, 3],
  [-2, 4],
  [-3, 5],
  [-4, 6],
];

function skyArt(ctx, scene, palette, seconds, still) {
  const { sky, phase, progress, windy, heavy } = scene;
  const { ink, accent, dusk, water, moon } = palette;
  const night = phase === "night";
  const lowSun = phase === "sunrise" || phase === "sunset";
  const wet = ["drizzle", "rain", "showers", "snow", "storm", "hail"].includes(
    sky,
  );
  const storm = sky === "storm" || sky === "hail";
  const veiled = wet || sky === "overcast" || sky === "fog";

  function dot(x, y, color, alpha = 1, cover = false, ridge = 0) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= cols || y < 0 || y >= heights[ridge][x]) return;
    if (cover) ctx.clearRect(x * pitch, y * pitch, size, size);
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha * edge(x);
    ctx.fillRect(x * pitch, y * pitch, size, size);
  }

  if (night || lowSun) {
    stars.forEach(([x, y], i) => {
      const glow = 0.7 + 0.27 * Math.sin(seconds * 0.9 + i * 2);
      dot(x, y, moon, glow * (veiled ? 0.3 : lowSun ? 0.38 : 1));
      if (i % 3 === 0 && glow > 0.85 && !veiled && night) {
        dot(x - 1, y, moon, 0.28);
        dot(x + 1, y, moon, 0.28);
        dot(x, y - 1, moon, 0.28);
        dot(x, y + 1, moon, 0.28);
      }
    });
  }

  const cx = night ? 75 : 13 + 64 * progress;
  // Ease into the current solar position when dawn or dusk first comes into view.
  const arrival = lowSun && !still ? 4.5 * Math.exp(-seconds / 6) : 0;
  const cy = night
    ? 6.5
    : 24 -
      17 * Math.sin(Math.PI * progress) +
      (phase === "sunrise" ? arrival : -arrival);
  const radius = lowSun ? 6.5 : 5.2;
  const color = night ? moon : phase === "sunset" ? dusk : accent;
  for (let x = Math.floor(cx - radius - 2); x <= cx + radius + 2; x++) {
    for (let y = Math.floor(cy - radius - 2); y <= cy + radius + 2; y++) {
      const r = Math.hypot(x - cx, y - cy);
      if (
        r <= radius &&
        (!night || Math.hypot(x - cx - 2.5, y - cy + 1.8) > radius - 0.5)
      )
        dot(x, y, color, veiled ? 0.7 : 0.95);
      else if (
        lowSun &&
        !veiled &&
        r > radius + 1 &&
        r < radius + 2 &&
        (x + y) % 3 === 0
      )
        dot(x, y, color, 0.4);
    }
  }

  if (sky === "fog") {
    for (let i = 0; i < 13; i++) {
      const start = wrap(i * 37 + seconds * (i % 2 ? 0.7 : 1.2), 116) - 23;
      const length = 15 + (i % 4) * 4,
        y = 10 + (i % 7) * 3;
      for (let j = 0; j < length; j++) {
        const wisp = Math.sin((Math.PI * j) / length);
        dot(start + j, y, moon, 0.6 * wisp, true, 2);
        if (wisp > 0.6) dot(start + j, y - 1, moon, 0.28 * wisp, true, 2);
      }
    }
  }

  const count =
    sky === "mostly-clear"
      ? 1
      : sky === "clouds"
        ? 2
        : sky === "showers"
          ? 3
          : veiled && sky !== "fog"
            ? 5
            : 0;
  for (let i = 0; i < count; i++) {
    const [start, top, speed] = clouds[i];
    const x = wrap(start + seconds * speed * (windy ? 3 : 1) + 22, 115) - 22;
    const shape = veiled && i % 2 === 0 ? stratus : cumulus;
    const tone = storm ? water : night ? moon : ink;
    shape.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const pixel = row[dx];
        if (pixel === " ") continue;
        const alpha = pixel === "+" ? 0.72 : pixel === "=" ? 0.24 : 0.44;
        dot(x + dx, top + dy, tone, alpha * (night ? 0.76 : 1), true);
      }
    });
    if (!wet) continue;
    const snow = sky === "snow",
      drizzle = sky === "drizzle";
    const shower = sky === "showers";
    const drops = (drizzle ? 8 : shower ? 22 : 16) + (heavy ? 8 : 0);
    for (let j = 0; j < drops; j++) {
      const seed = i * 17 + j;
      const fall = wrap(
        seconds * (snow ? 2.4 : drizzle ? 5 : 10) + seed * 8.3,
        22,
      );
      const drift = snow ? 1.7 * Math.sin(fall / 4 + seed) : 0;
      const dx =
        x +
        ((j * 7.7) % (shape[3].length - 2)) -
        fall * (windy ? 0.46 : 0.16) +
        drift;
      const dy = top + shape.length + fall;
      const ridge = j % 3 === 0 ? 2 : 1;
      if (snow || (sky === "hail" && j % 3 === 0)) {
        dot(dx, dy, ink, 0.94, false, ridge);
        if (snow && j % 7 === 0) {
          dot(dx - 1, dy, moon, 0.4, false, ridge);
          dot(dx + 1, dy, moon, 0.4, false, ridge);
          dot(dx, dy - 1, moon, 0.4, false, ridge);
          dot(dx, dy + 1, moon, 0.4, false, ridge);
        }
      } else {
        dot(dx, dy, water, drizzle ? 0.6 : 0.96, false, ridge);
        if (!drizzle) dot(dx + 0.35, dy - 1, water, 0.58, false, ridge);
        if (heavy) dot(dx + 0.65, dy - 2, water, 0.34, false, ridge);
      }
    }
    if (storm && i === 0) {
      const glow = still
        ? 0.85
        : clamp(1 - wrap(seconds + 0.22, 7) / 1.35, 0, 1);
      if (glow)
        for (const [dx, dy] of bolt)
          dot(x + 12 + dx, top + shape.length + dy, accent, glow, true);
    }
  }

  if (windy) {
    for (let i = 0; i < 5; i++) {
      const x = wrap(29 * i + seconds * (5 + i), 103) - 10;
      for (let j = 0; j < 8; j++) dot(x + j, 5 + i * 4, ink, 0.15 + j * 0.045);
    }
  } else if (!night && !veiled) {
    // Two distant birds glide together and beat their wings a frame apart.
    for (let i = 0; i < 2; i++) {
      const x = wrap(53 + seconds * 1.35 + i * 6, 104) - 7;
      const y = 10 + i * 2 + Math.sin(seconds * 0.33 + i);
      const wing = Math.sin(seconds * 2.4 + i) > 0 ? -1 : 0;
      dot(x - 1, y + wing, ink, 0.64);
      dot(x, y, ink, 0.76);
      dot(x + 1, y + wing, ink, 0.64);
    }
  }
}

export function mountainLandscape(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const layers = terrainPaths();
  const mountain = document.createElement("canvas");
  const mountainCtx = mountain.getContext("2d");
  let mountainKey;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let scene,
    palette,
    timer,
    started,
    visible = false;

  function frame() {
    clearTimeout(timer);
    if (!visible || document.hidden || !scene || !canvas.checkVisibility())
      return;
    const scale = Math.min(devicePixelRatio || 1, 3);
    const width = Math.round(270 * scale),
      height = Math.round(130 * scale);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(width / 270, 0, 0, height / 130, 0, 0);
    ctx.clearRect(0, 0, 270, 130);
    const night = scene.phase === "night";
    const mountainInk = night ? palette.moon : palette.ink;
    const key = [width, height, mountainInk, night].join("/");
    if (key !== mountainKey) {
      mountainKey = key;
      mountain.width = width;
      mountain.height = height;
      mountainCtx.setTransform(width / 270, 0, 0, height / 130, 0, 0);
      mountainCtx.fillStyle = mountainInk;
      layers.forEach((path, i) => {
        mountainCtx.globalAlpha = (i / 15) * (night ? 0.83 : 1);
        mountainCtx.fill(path);
      });
    }
    ctx.drawImage(mountain, 0, 0, 270, 130);
    const seconds = motion.matches ? 0 : (performance.now() - started) / 1000;
    skyArt(ctx, scene, palette, seconds, motion.matches);
    ctx.globalAlpha = 1;
    if (!motion.matches) timer = setTimeout(frame, 160);
  }

  new IntersectionObserver((entries) => {
    const entry = entries.at(-1);
    visible = entry.isIntersecting && entry.intersectionRect.width > 0;
    frame();
  }).observe(canvas);
  motion.addEventListener("change", frame);
  document.addEventListener("visibilitychange", frame);
  return (next) => {
    if (scene?.phase !== next.phase) started = performance.now();
    scene = next;
    const style = getComputedStyle(canvas);
    const read = (key) => style.getPropertyValue("--" + key).trim();
    palette = {
      ink: read("ink"),
      accent: read("accent"),
      water: read("rain-ink"),
      moon: read("moon-ink"),
      dusk: read("dusk-ink"),
    };
    frame();
  };
}
