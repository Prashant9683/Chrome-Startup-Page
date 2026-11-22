import { settingsNavigation } from "./settings-navigation.js";
import { homepageSettings } from "./homepage-options.js";
import { changes, validZone } from "./preferences.js";

export async function settingsDialog({ get, validate, save, engines, version, classicOptions }) {
  const markup = await fetch(new URL("../settings.html", import.meta.url));
  if (!markup.ok) throw Error("Could not load Settings.");
  document.body.insertAdjacentHTML("beforeend", await markup.text());
  const dialog = document.querySelector("#settings");
  const form = document.querySelector("#settings-form");
  const submit = form.querySelector('[type="submit"]');
  const dismiss = dialog.querySelectorAll("[data-close]");
  for (const button of dismiss) button.onclick = () => dialog.close();
  dialog.addEventListener("cancel", event => {
    if (submit.disabled) event.preventDefault();
  });
  const field = form.elements;
  const textFields = [
    "user", "searchEngine", "visualTheme", "colorScheme", "timeZone", "layout",
  ];
  const json = document.querySelector("#config-text");
  const status = document.querySelector("#settings-status");
  const homepage = homepageSettings(form, status);
  const navigation = settingsNavigation(form, classicOptions, homepage.load);
  form.addEventListener("invalid", event => navigation.reveal(event.target), true);
  let original,
    draft,
    pendingJson = false;
  for (const name of Object.keys(engines))
    field.searchEngine.add(new Option(name));
  for (const name of Intl.supportedValuesOf?.("timeZone") || []) {
    document.querySelector("#time-zones").append(new Option(name));
  }
  document.querySelector("#version").textContent = "Startpage " + version + " · © 2026 Prashant Gehlot";

  function updatePaletteHint() {
    const note = form.querySelector("#glass-palette-note");
    if (note) note.hidden = field.visualTheme.value !== "glass";
  }
  function setControls() {
    form.querySelector("[name=colorScheme][value=custom]").closest("label").hidden =
      !Object.keys(draft.style).length && draft.colorScheme !== "custom";
    for (const key of textFields)
      field[key].value = draft[key];
    field.hourFormat.value = draft.disable24Hour ? "12" : "24";
    field.showGreeting.checked = !draft.disableMessage;
    field.linkInNewTab.checked = draft.linkInNewTab;
    field.showWeather.checked = !draft.disableWeather;
    field.city.value = draft.weatherConf.location;
    field.unit.value = draft.weatherConf.unit.startsWith("fah") ? "fah" : "cel";
    document.querySelector("#weather-fields").hidden = draft.disableWeather;
    json.value = JSON.stringify(draft, null, 2);
    pendingJson = false;
    updatePaletteHint();
    navigation.refresh();
  }

  function readControls() {
    for (const key of textFields)
      draft[key] = field[key].value.trim();
    draft.disable24Hour = field.hourFormat.value === "12";
    draft.disableMessage = !field.showGreeting.checked;
    draft.linkInNewTab = field.linkInNewTab.checked;
    draft.disableWeather = !field.showWeather.checked;
    draft.weatherConf = {
      ...draft.weatherConf,
      location: field.city.value.trim(),
      unit: field.unit.value,
    };
    document.querySelector("#weather-fields").hidden = draft.disableWeather;
  }

  function applyJson() {
    const next = validate(JSON.parse(json.value));
    draft = next;
    setControls();
    status.textContent = "Configuration loaded. Save settings to keep it.";
  }

  form.addEventListener("input", (event) => {
    if (event.target === json) {
      pendingJson = true;
      return;
    }
    if (event.target.id === "find-setting" || event.target.closest("[data-local]")) return;
    if (event.target.type === "file" || event.target.closest("#homepage-options")) return;
    readControls();
    if (event.target.name === "visualTheme") updatePaletteHint();
    if (event.target === field.showWeather) navigation.refresh();
    if (!pendingJson) json.value = JSON.stringify(draft, null, 2);
    status.textContent = "";
  });
  json.addEventListener("change", () => {
    try {
      applyJson();
    } catch (error) {
      status.textContent = error.message;
    }
  });
  document.querySelector("#apply-json").onclick = () => {
    try {
      applyJson();
    } catch (error) {
      status.textContent = error.message;
    }
  };
  document.querySelector("#export-btn").onclick = () => {
    try {
      if (pendingJson) applyJson();
      else readControls();
      const blob = new Blob([JSON.stringify(validate(draft), null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "startpage-config.json";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      status.textContent = error.message;
    }
  };
  const file = document.querySelector("#import-file");
  document.querySelector("#import-btn").onclick = () => file.click();
  file.onchange = async () => {
    const selected = file.files[0];
    file.value = "";
    if (!selected) return;
    const session = original;
    try {
      if (selected.size > 1024 * 1024)
        throw Error("Choose a configuration smaller than 1 MB.");
      const contents = await selected.text();
      if (!dialog.open || original !== session) return;
      const next = validate(JSON.parse(contents));
      draft = next;
      setControls();
      status.textContent = "Backup loaded. Save settings to keep it.";
    } catch (error) {
      status.textContent = "Import failed. " + error.message;
    }
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    try {
      if (pendingJson) {
        try { applyJson(); } catch (error) { navigation.reveal(json); throw error; }
      } else readControls();
      if (!validZone(draft.timeZone)) {
        navigation.reveal(field.timeZone);
        throw Error(
          "Enter a time zone such as Asia/Kolkata, or leave it blank for device time.",
        );
      }
      if (!draft.disableWeather && !draft.weatherConf.location.trim()) {
        navigation.reveal(field.city);
        throw Error("Enter a city for weather.");
      }
      submit.disabled = true;
      for (const button of dismiss) button.disabled = true;
      const patch = changes(original, validate(draft));
      await homepage.save(() => save(patch, classicOptions?.edits()));
      dialog.close();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      submit.disabled = false;
      for (const button of dismiss) button.disabled = false;
    }
  };
  return () => {
    if (dialog.open) return;
    original = structuredClone(get());
    draft = structuredClone(original);
    status.textContent = "";
    homepage.open();
    classicOptions?.open(form, navigation.refresh);
    navigation.open();
    setControls();
    dialog.showModal();
  };
}
