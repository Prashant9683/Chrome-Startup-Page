import { searchResults, resolveQuery } from "./search.js";

export function searchBox({
  get,
  sites,
  engines,
  icon,
  visit,
  settings,
  preview,
}) {
  const input = document.querySelector("#query");
  const form = document.querySelector("#search-form");
  const list = document.querySelector("#results");
  let options = [],
    selected = -1;
  function resetList() {
    list.replaceChildren();
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    options = [];
    selected = -1;
  }
  function close() {
    resetList();
    preview(null);
  }
  function select(index) {
    if (selected >= 0)
      list.children[selected].setAttribute("aria-selected", "false");
    selected = index;
    const row = list.children[index];
    row.setAttribute("aria-selected", "true");
    input.setAttribute("aria-activedescendant", row.id);
    preview(options[index]);
    return row;
  }
  function paint() {
    resetList();
    const text = input.value.trim();
    if (!text) {
      preview(null);
      return;
    }
    form.style.setProperty(
      "--query-length",
      String(Array.from(input.value).length),
    );
    options = searchResults(text, get(), sites(), engines);
    for (const [index, item] of options.entries()) {
      const row = document.createElement("li");
      row.id = "result-" + index;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", "false");
      const name = document.createElement("span");
      name.textContent =
        item.action === "calculate"
          ? "= " + item.result
          : item.action === "settings"
            ? "Open settings"
            : item.kind === "search" && index > 0
              ? "Search for “" + text + "”"
              : item.name || text;
      const detail = document.createElement("span");
      detail.className = "result-detail";
      detail.textContent =
        item.action === "calculate"
          ? "Use result"
          : item.category || item.label || "";
      row.append(icon(item), name, detail);
      row.onmousedown = (event) => event.preventDefault();
      row.onclick = () => run(item);
      list.append(row);
    }
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    select(0);
  }
  function run(item, newTab = false) {
    if (!item) return;
    close();
    if (item.action === "calculate") {
      input.value = item.result;
      input.focus();
      input.select();
      return;
    }
    if (item.action === "settings") {
      input.value = "";
      settings();
      return;
    }
    visit(item, newTab);
  }
  input.addEventListener("input", paint);
  input.addEventListener("focus", paint);
  form.addEventListener("focusout", (event) => {
    if (!form.contains(event.relatedTarget)) close();
  });
  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Escape") {
      if (!list.hidden) close();
      else {
        input.value = "";
        input.blur();
      }
      event.preventDefault();
    } else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      const previous = selected;
      if (list.hidden) paint();
      if (!options.length) return;
      event.preventDefault();
      const next =
        event.key === "ArrowDown"
          ? (previous + 1) % options.length
          : previous <= 0
            ? options.length - 1
            : previous - 1;
      select(next).scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      const forced = event.ctrlKey || event.metaKey;
      run(
        !forced && selected >= 0
          ? options[selected]
          : resolveQuery(input.value, get(), sites(), engines, forced),
        event.altKey,
      );
    }
  });
  form.onsubmit = (event) => {
    event.preventDefault();
    run(
      selected >= 0
        ? options[selected]
        : resolveQuery(input.value, get(), sites(), engines),
    );
  };
  return {
    refresh: () =>
      document.activeElement === input && input.getClientRects().length
        ? paint()
        : close(),
    focus: () => input.focus(),
  };
}
