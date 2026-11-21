// Parse only arithmetic. A short expression bound also bounds nesting depth.
export function calculate(text) {
  if (
    text.length > 160 ||
    !/[+*/×÷−-]/.test(text) ||
    /[^\d.()+*/×÷−\s-]/.test(text)
  )
    return null;
  const input = text
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replaceAll("−", "-");
  const tokens = input.match(/\d+(?:\.\d*)?|\.\d+|[^\s]/g) || [];
  let pos = 0;
  function factor() {
    const token = tokens[pos++];
    if (token === "-") return -factor();
    if (token === "+") return factor();
    if (token === "(") {
      const value = expression();
      return tokens[pos++] === ")" ? value : NaN;
    }
    return token && /^(?:\d|\.\d)/.test(token) ? Number(token) : NaN;
  }
  function product() {
    let value = factor();
    while (tokens[pos] === "*" || tokens[pos] === "/") {
      const op = tokens[pos++];
      const right = factor();
      value = op === "*" ? value * right : value / right;
    }
    return value;
  }
  function expression() {
    let value = product();
    while (tokens[pos] === "+" || tokens[pos] === "-") {
      const op = tokens[pos++];
      const right = product();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }
  const value = expression();
  return pos === tokens.length && Number.isFinite(value)
    ? String(Number(value.toPrecision(14)))
    : null;
}
