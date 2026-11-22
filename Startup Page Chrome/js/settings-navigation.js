// The finder filters the real form controls, so browsing and searching share a draft.
export function settingsNavigation(form, classic, showHomepage) {
  if (!classic)
    form.querySelectorAll("[data-classic]").forEach((el) => el.remove());
  const nav = form.querySelector("#settings-nav");
  const content = form.querySelector(".settings-content");
  const finder = form.querySelector("#find-setting");
  const clear = form.querySelector("#clear-setting-search");
  const summary = form.querySelector("#settings-matches");
  const back = form.querySelector("#all-settings");
  const pages = [...form.querySelectorAll("[data-page]")];
  const buttons = new Map();
  let active = pages[0];
  let indexVisible = false;

  function browse(page, focus = false) {
    active = page;
    indexVisible = false;
    finder.value = "";
    refresh();
    content.scrollTop = 0;
    if (focus) page.querySelector("h3").focus({ preventScroll: true });
  }
  for (const page of pages) {
    const button = document.createElement("button");
    button.type = "button";
    page.id ||= "settings-" + page.dataset.page;
    button.setAttribute("aria-controls", page.id);
    button.textContent = page.querySelector("h3").textContent;
    button.onclick = () => browse(page, true);
    buttons.set(page, button);
    nav.append(button);
  }
  function refresh() {
    const words = finder.value
      .toLocaleLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const filtering = words.length > 0;
    let count = 0;
    form.classList.toggle("finding", filtering);
    form.classList.toggle("section-index", indexVisible && !filtering);
    clear.hidden = !finder.value;
    for (const page of pages) {
      let matches = 0;
      for (const group of page.querySelectorAll(".setting-group")) {
        let found = 0;
        const context = [
          buttons.get(page).textContent,
          group.querySelector("h4")?.textContent,
        ];
        for (const row of group.querySelectorAll("[data-setting]")) {
          const eligible = !row.closest(
            "[data-unavailable], #weather-fields[hidden]",
          );
          const text = [...context, row.dataset.setting, row.textContent]
            .join(" ")
            .toLocaleLowerCase();
          const match = eligible && words.every((word) => text.includes(word));
          row.hidden = !match;
          if (match) found++;
        }
        // Browsing shows a single palette mode. The finder can reach both.
        group.hidden =
          !found || (!filtering && group.dataset.inactive === "true");
        matches += found;
      }
      page.hidden = filtering ? !matches : active !== page;
      const button = buttons.get(page);
      if (!filtering && active === page)
        button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
      count += matches;
    }
    summary.hidden = !filtering;
    summary.textContent = !filtering
      ? ""
      : count
        ? count + (count === 1 ? " matching setting" : " matching settings")
        : "No matching settings. Try a different word.";
    if (!form.querySelector("#homepage-options").hidden) showHomepage();
  }
  finder.oninput = () => {
    indexVisible = false;
    refresh();
    content.scrollTop = 0;
  };
  clear.onclick = () => {
    finder.value = "";
    refresh();
    finder.focus();
  };
  back.onclick = () => {
    finder.value = "";
    indexVisible = true;
    refresh();
    buttons.get(active).focus();
  };
  form.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      finder.select();
      finder.focus();
    } else if (event.key === "Escape" && finder.value) {
      event.preventDefault();
      clear.click();
    } else if (event.key === "Enter" && event.target === finder) {
      event.preventDefault();
      const visible = [
        ...content.querySelectorAll(
          "[data-setting] input, [data-setting] select, [data-setting] button, [data-setting] textarea",
        ),
      ].filter((el) => !el.disabled && el.getClientRects().length);
      const query = finder.value.trim().toLocaleLowerCase();
      const exact = visible.find(
        (el) =>
          (el.getAttribute("aria-label") || el.labels?.[0]?.textContent || "")
            .trim()
            .toLocaleLowerCase() === query,
      );
      (exact || visible[0])?.focus();
    }
  });
  function reveal(input) {
    const page = input.closest("[data-page]");
    if (page && !input.getClientRects().length) {
      // A hidden color mode can only contain color pickers or unrestricted text.
      browse(page);
    }
    input.focus();
  }
  return { refresh, reveal, open: () => browse(pages[0]) };
}
