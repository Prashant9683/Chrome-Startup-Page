import { address, linkId, matches } from "./search.js";

export function shortcutLibrary({ get, sites, linkTo, edit }) {
  const dialog = document.querySelector("#library");
  const filter = dialog.querySelector("#library-query");
  const list = dialog.querySelector("#library-list");
  const status = dialog.querySelector("#library-status");
  const editor = dialog.querySelector("#new-shortcut");
  const form = dialog.querySelector("#add-form");
  const submit = form.querySelector("[type=submit]");
  const remove = form.querySelector("#remove-shortcut");
  let editingId;

  function setEditor(site) {
    editingId = site?.id;
    form.elements.name.value = site?.name || "";
    form.elements.url.value = site?.url || "";
    editor.querySelector("summary").textContent = site
      ? "Edit shortcut"
      : "Add a shortcut";
    submit.textContent = site ? "Save shortcut" : "Add shortcut";
    remove.hidden = !site;
    editor.open = Boolean(site);
    if (site) form.elements.name.focus();
  }
  async function commit(update) {
    try {
      await edit(update);
      status.textContent = "";
      return true;
    } catch (error) {
      status.textContent = error.message;
      return false;
    }
  }
  function render() {
    const oldFocus = document.activeElement?.dataset.pin;
    list.replaceChildren();
    for (const site of matches(filter.value, sites())) {
      const row = document.createElement("div");
      row.className = "library-row";
      const alias = document.createElement("span");
      alias.className = "alias";
      alias.textContent = site.triggers[0] || site.category;
      if (site.color && CSS.supports("color", site.color))
        alias.style.color = site.color;
      const pin = document.createElement("button");
      const pinned = get().pinned.includes(site.id);
      pin.className = "pin-toggle";
      pin.dataset.pin = site.id;
      pin.textContent = pinned ? "★" : "☆";
      pin.setAttribute("aria-label", (pinned ? "Unpin " : "Pin ") + site.name);
      pin.setAttribute("aria-pressed", String(pinned));
      pin.onclick = () =>
        commit((latest) => ({
          pinned: pinned
            ? latest.pinned.filter((id) => id !== site.id)
            : [...new Set([...latest.pinned, site.id])],
        }));
      row.append(linkTo(site, "site-info"), alias);
      if (
        site.category === "Personal" &&
        get().squares.some(
          (group) =>
            group.name === "Personal" &&
            group.links.some((link) => linkId(group.name, link) === site.id),
        )
      ) {
        const button = document.createElement("button");
        button.className = "text-button";
        button.textContent = "Edit";
        button.setAttribute("aria-label", "Edit " + site.name);
        button.onclick = () => setEditor(site);
        row.append(button);
      }
      row.append(pin);
      list.append(row);
      if (oldFocus === site.id) pin.focus({ preventScroll: true });
    }
    if (!list.children.length) list.textContent = "No matching shortcuts.";
  }
  async function changePersonal(replacement) {
    const originalId = editingId;
    const success = await commit((latest) => {
      const squares = structuredClone(latest.squares);
      let group = squares.find(
        (item) =>
          item.name === "Personal" &&
          (!originalId ||
            item.links.some((link) => linkId(item.name, link) === originalId)),
      );
      if (originalId && !group)
        throw Error("This shortcut changed in another tab. Reopen it to edit.");
      if (!group) {
        group = { name: "Personal", links: [] };
        squares.push(group);
      }
      const index = group.links.findIndex(
        (link) => linkId(group.name, link) === originalId,
      );
      if (
        replacement &&
        group.links.some(
          (item, i) =>
            i !== index &&
            item.url === replacement.url &&
            item.name === replacement.name,
        )
      ) {
        throw Error("This shortcut already exists.");
      }
      if (index === -1) group.links.push(replacement);
      else if (replacement) Object.assign(group.links[index], replacement);
      else group.links.splice(index, 1);
      const patch = { squares };
      if (latest.pinned.includes(originalId))
        patch.pinned = replacement
          ? latest.pinned.map((id) =>
              id === originalId ? linkId(group.name, replacement) : id,
            )
          : latest.pinned.filter((id) => id !== originalId);
      return patch;
    });
    if (success) {
      setEditor(null);
      filter.value = replacement?.name || "";
      render();
      filter.focus();
    }
  }
  form.onsubmit = (event) => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    const url = address(form.elements.url.value.trim());
    if (!name || !url) {
      status.textContent = "Enter a name and a valid web address.";
      return;
    }
    changePersonal({ name, url });
  };
  remove.onclick = () => changePersonal(null);
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !event.isComposing) {
      event.preventDefault();
      dialog.close();
    }
  });
  editor.addEventListener("toggle", () => {
    if (!editor.open && editingId) setEditor(null);
  });
  filter.oninput = render;
  return {
    render,
    open() {
      filter.value = "";
      status.textContent = "";
      setEditor(null);
      render();
      dialog.showModal();
      filter.focus();
    },
  };
}
