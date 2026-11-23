const greetings = [
  [
    6,
    [
      "it’s too late for another tab. Get some sleep.",
      "the tabs will keep. How about a pillow?",
      "bookmark that thought. Morning-you can take it from here.",
      "one last song, then lights out?",
      "even the cursor is blinking slowly. Bedtime?",
      "let’s leave a little mystery for tomorrow. Sleep well.",
      "you can pick this up after breakfast. Sweet dreams.",
    ],
  ],
  [
    9,
    [
      "you’re up early. What’s first today?",
      "the kettle’s barely awake. How about you?",
      "what gets the first quiet hour today?",
      "before the inbox wakes up, what’s on your mind?",
      "first sip, fresh page. Where shall we start?",
      "got a song for the morning commute?",
      "there’s still time for the good breakfast.",
    ],
  ],
  [
    12,
    [
      "good morning! What are we working on today?",
      "which idea gets the good morning light?",
      "coffee in reach? Let’s open the interesting thing first.",
      "what would you love to have finished by lunch?",
      "pick a soundtrack for the morning. What’s playing?",
      "got a question worth a little rabbit hole?",
      "what’s the one tab you actually came here for?",
    ],
  ],
  [
    14,
    [
      "it’s lunchtime. What sounds good?",
      "your sandwich deserves your full attention.",
      "what’s on the lunch menu besides more tabs?",
      "how about a lunch break with the lid closed?",
      "got time for a walk around the block after lunch?",
      "save your spot. Lunch tastes better while it’s warm.",
      "what’s cooking? And yes, leftovers count.",
    ],
  ],
  [
    17,
    [
      "how’s your afternoon going? Time for a stretch?",
      "shoulders down. When did you last look out the window?",
      "is this a tea afternoon or a second-coffee afternoon?",
      "got ten minutes for that little side project?",
      "time for the afternoon B-side. What’s playing?",
      "what’s the smallest thing you’d like to finish before dinner?",
      "that water glass could use a refill. You too?",
    ],
  ],
  [
    20,
    [
      "good evening. What’s on for tonight?",
      "what song would you play over today’s closing credits?",
      "dinner first, or one last rabbit hole?",
      "the evening’s yours. What are you curious about?",
      "what was the best five minutes of your day?",
      "got an album you’ve been saving for a quiet evening?",
      "where did we leave that book you were into?",
    ],
  ],
  [
    24,
    [
      "it’s getting late. Ready to call it a day?",
      "leave yourself a note for tomorrow and call it a night.",
      "what’s worth bookmarking before the lights go out?",
      "time to trade the screen glow for a bedside lamp?",
      "what’s one good thing you’re taking from today?",
      "is this the last tab, or the last-last tab?",
      "how about a quiet song to wind down?",
    ],
  ],
];

function personalGreeting(hour, name, dayNumber) {
  const [, lines] = greetings.find(([until]) => hour < until);
  const line =
    lines[((dayNumber % lines.length) + lines.length) % lines.length];
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
  // Use the displayed civil date so every tab agrees, including across DST.
  const local = Object.fromEntries(
    format("en-GB", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, Number(value)]),
  );
  const { hour, minute } = local;
  const dayNumber =
    Date.UTC(local.year, local.month - 1, local.day) / 86_400_000;
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
    greeting:
      settings.message || personalGreeting(hour, settings.user, dayNumber),
  };
}
