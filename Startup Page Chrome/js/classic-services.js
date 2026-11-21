// The original double-space action uses the key entered in the classic settings.
export async function chatReply({
  messages,
  model,
  temperature,
  key,
  signal,
  onText,
  request = fetch,
}) {
  const response = await request("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key,
    },
    body: JSON.stringify({ messages, model, temperature, stream: true }),
    signal,
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw Error(
      details.error?.message ||
        "The chat service returned " + response.status + ".",
    );
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "",
    content = "";
  function consume(line) {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    const token = JSON.parse(data).choices?.[0]?.delta?.content;
    if (typeof token === "string") {
      content += token;
      onText(content);
    }
  }
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += value;
      const lines = pending.split("\n");
      pending = lines.pop();
      lines.forEach(consume);
    }
    consume(pending);
    return { content, role: "assistant" };
  } finally {
    reader.releaseLock();
  }
}

// Fetch the daily rate table for the base currency. The amount stays local.
export async function convertCurrency(amount, from, to, request = fetch) {
  const base = from.toLowerCase(),
    quote = to.toLowerCase();
  if (base === quote) return amount;
  const response = await request(
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/" +
      base +
      ".json",
    { signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) return null;
  const table = await response.json();
  const rate = table[base]?.[quote];
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const value = amount * rate;
  return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
}
