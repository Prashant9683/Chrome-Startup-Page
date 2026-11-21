const key = "startpage.weather";
export const weatherRefreshMs = 30 * 60_000;
const day = 24 * 60 * 60_000;

const conditions = [
  [[0], "clear", "Clear"],
  [[1], "mostly-clear", "Mainly clear"],
  [[2], "clouds", "Partly cloudy"],
  [[3], "overcast", "Overcast"],
  [[45, 48], "fog", "Fog"],
  [[51, 53, 55], "drizzle", "Drizzle"],
  [[56, 57], "drizzle", "Freezing drizzle"],
  [[61, 63, 65], "rain", "Rain"],
  [[66, 67], "rain", "Freezing rain"],
  [[71, 73, 75, 77], "snow", "Snow"],
  [[80, 81, 82], "showers", "Showers"],
  [[85, 86], "snow", "Snow showers"],
  [[95], "storm", "Thunderstorms"],
  [[96, 99], "hail", "Thunderstorms with hail"],
];
const byCode = new Map(
  conditions.flatMap(([codes, sky, label]) =>
    codes.map((code) => [code, { sky, label }]),
  ),
);
export function condition(code) {
  return byCode.get(code) ?? { sky: "clear", label: "" };
}

export async function observation(
  config,
  { request = fetch, storage = localStorage, now = Date.now(), signal } = {},
) {
  const city = config.location.trim();
  const unit = config.unit.startsWith("fah") ? "fahrenheit" : "celsius";
  const id = JSON.stringify([city.toLowerCase(), unit]);
  let cached;
  try {
    cached = JSON.parse(storage.getItem(key));
  } catch {
    /* Storage can be unavailable. */
  }
  const usable =
    cached?.id === id &&
    typeof cached.text === "string" &&
    Number.isFinite(cached.at) &&
    now >= cached.at;
  if (
    usable &&
    Object.hasOwn(cached, "weatherCode") &&
    now - cached.at < weatherRefreshMs
  )
    return { ...cached, stale: false };
  async function json(url, params) {
    const response = await request(url + "?" + new URLSearchParams(params), {
      signal,
    });
    if (!response.ok) throw Error("Weather unavailable");
    return response.json();
  }
  try {
    const location = await json(
      "https://geocoding-api.open-meteo.com/v1/search",
      { name: city, count: 1, language: "en" },
    );
    const place = location.results?.[0];
    if (
      !place ||
      !Number.isFinite(place.latitude) ||
      !Number.isFinite(place.longitude)
    )
      throw Error("City not found");
    const forecast = await json("https://api.open-meteo.com/v1/forecast", {
      latitude: place.latitude,
      longitude: place.longitude,
      current: "temperature_2m,weather_code,is_day,wind_speed_10m",
      daily: "sunrise,sunset",
      timezone: "auto",
      timeformat: "unixtime",
      forecast_days: 2,
      temperature_unit: unit,
    });
    const temp = forecast.current?.temperature_2m;
    if (!Number.isFinite(temp)) throw Error("Weather unavailable");
    const { weather_code, is_day, wind_speed_10m } = forecast.current;
    const text = [
      Math.round(temp) + (unit === "celsius" ? "°C" : "°F"),
      condition(weather_code).label,
    ]
      .filter(Boolean)
      .join(" · ");
    const rises = forecast.daily?.sunrise;
    const solarDays = (Array.isArray(rises) ? rises : []).flatMap((rise, i) => {
      const set = forecast.daily.sunset?.[i];
      return Number.isFinite(rise) &&
        Number.isFinite(set) &&
        rise > 0 &&
        set > rise
        ? [{ rise: rise * 1000, set: set * 1000 }]
        : [];
    });
    const result = {
      id,
      at: now,
      text,
      place: place.name || city,
      solarDays,
      weatherCode: Number.isInteger(weather_code) ? weather_code : null,
      isDay: is_day === 0 || is_day === 1 ? Boolean(is_day) : null,
      windKmh: Number.isFinite(wind_speed_10m) ? wind_speed_10m : 0,
    };
    try {
      storage.setItem(key, JSON.stringify(result));
    } catch {
      /* The observation is still useful. */
    }
    return { ...result, stale: false };
  } catch (error) {
    if (usable && now - cached.at < day) return { ...cached, stale: true };
    throw error;
  }
}
