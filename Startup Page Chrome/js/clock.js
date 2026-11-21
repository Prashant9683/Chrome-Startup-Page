const greetings = [
  [6, "it’s too late for another tab. Get some sleep."],
  [9, "you’re up early. What’s first today?"],
  [12, "good morning! What are we working on today?"],
  [14, "it’s lunchtime. What sounds good?"],
  [17, "how’s your afternoon going? Time for a stretch?"],
  [20, "good evening. What’s on for tonight?"],
  [24, "it’s getting late. Ready to call it a day?"],
];

function personalGreeting(hour, name) {
  const [, line] = greetings.find(([until]) => hour < until);
  const user = name.trim();
  return user ? user + ", " + line : line[0].toUpperCase() + line.slice(1);
}

export function minuteClock(render) {
  let timer;
  function tick() {
    clearTimeout(timer);
    render(new Date());
    if (!document.hidden)
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
  }
  document.addEventListener("visibilitychange", tick);
  return tick;
}

export function clockReading(date, settings, locale) {
  const zone = settings.timeZone || undefined;
  const format = (language, options) =>
    new Intl.DateTimeFormat(language, { timeZone: zone, ...options });
  const [hour, minute] = format("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(date)
    .split(":")
    .map(Number);
  const parts = format(locale, {
    hour: settings.disable24Hour ? "numeric" : "2-digit",
    minute: "2-digit",
    hourCycle: settings.disable24Hour ? "h12" : "h23",
  }).formatToParts(date);
  return {
    hour,
    minuteOfDay: hour * 60 + minute,
    time: parts
      .filter((part) => ["hour", "literal", "minute"].includes(part.type))
      .map((part) => part.value)
      .join("")
      .trim(),
    period: parts.find((part) => part.type === "dayPeriod")?.value || "",
    date: format(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(date),
    zone: (
      zone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "Local"
    ).replaceAll("_", " "),
    greeting: settings.message || personalGreeting(hour, settings.user),
  };
}
