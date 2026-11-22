// These preferences and the image belong to this browser profile, even when
// Chrome syncs the rest of the Settings form to another device.
const channel = new BroadcastChannel("startpage.homepage");
const updates = new EventTarget();
channel.onmessage = () => updates.dispatchEvent(new Event("change"));
export const onHomepageChange = (callback) =>
  updates.addEventListener("change", callback);

let database;
function openDatabase() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("startpage.homepage", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("options");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        database = undefined;
        reject(request.error);
      };
    });
  }
  return database;
}

// Read the previous values and apply only the changed keys in one transaction.
async function optionsTransaction(keys, patch) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("options", patch ? "readwrite" : "readonly");
    const store = tx.objectStore("options");
    const previous = {};
    for (const key of keys) {
      const request = store.get(key);
      request.onsuccess = () => {
        previous[key] = request.result;
      };
      if (patch) {
        if (patch[key] == null) store.delete(key);
        else store.put(patch[key], key);
      }
    }
    tx.oncomplete = () => resolve(previous);
    tx.onabort = () =>
      reject(tx.error || Error("Could not save homepage settings."));
  });
}
export const readHomepage = () =>
  optionsTransaction(["todos", "notes", "wallpaper"]);

async function storeOptions(patch) {
  const old = await optionsTransaction(Object.keys(patch), patch);
  updates.dispatchEvent(new Event("change"));
  channel.postMessage("change");
  return old;
}

async function prepareWallpaper(file) {
  // Store a display-sized raster. Large camera originals and animation frames
  // need not be decoded every time a new tab opens.
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw Error("Choose a readable JPG, PNG, WebP, AVIF or GIF image.");
  }
  try {
    const scale = Math.min(1, 3840 / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    canvas
      .getContext("2d")
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvas.convertToBlob({
      type: "image/webp",
      quality: 0.9,
    });
    return { blob, name: file.name, id: crypto.randomUUID() };
  } finally {
    bitmap.close();
  }
}

export function homepageSettings(form, status) {
  const fields = form.querySelector("#homepage-fields");
  const { homeNotes, homeTodos, homeImage } = form.elements;
  const preview = form.querySelector("#wallpaper-preview");
  const selection = form.querySelector("#wallpaper-selection");
  let original,
    picked,
    previewURL,
    session = 0;
  function display(image) {
    preview.removeAttribute("src");
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = image && URL.createObjectURL(image.blob);
    selection.hidden = !previewURL;
    if (previewURL) {
      preview.src = previewURL;
      preview.title = image.name;
    }
  }
  let loading = false;
  async function load() {
    if (loading || original) return;
    loading = true;
    const current = session;
    try {
      const stored = await readHomepage();
      if (current !== session) return;
      original = stored;
      homeNotes.checked = !!stored.notes;
      homeTodos.checked = !!stored.todos;
      display(stored.wallpaper);
      fields.disabled = false;
    } catch {
      if (current === session)
        status.textContent = "Homepage storage is unavailable.";
    } finally {
      if (current === session) loading = false;
    }
  }
  homeImage.onchange = () => {
    const file = homeImage.files[0];
    if (!file) return;
    picked = file;
    display({ blob: file, name: file.name });
    status.textContent = "";
  };
  form.querySelector("#remove-wallpaper").onclick = () => {
    picked = null;
    homeImage.value = "";
    display(null);
  };
  form.closest("dialog").addEventListener("close", () => {
    session++;
    display(null);
    picked = original = undefined;
  });
  return {
    load,
    open() {
      session++;
      original = picked = undefined;
      loading = false;
      fields.disabled = true;
      homeImage.value = "";
      display(null);
    },
    async save(saveShared) {
      if (!original) return saveShared();
      const patch = {};
      if (homeNotes.checked !== !!original.notes)
        patch.notes = homeNotes.checked;
      if (homeTodos.checked !== !!original.todos)
        patch.todos = homeTodos.checked;
      if (picked !== undefined)
        patch.wallpaper = picked && (await prepareWallpaper(picked));
      if (!Object.keys(patch).length) return saveShared();
      await navigator.locks.request("startpage.homepage.options", async () => {
        const before = await storeOptions(patch);
        try {
          await saveShared();
        } catch (error) {
          await storeOptions(before);
          throw error;
        }
      });
    },
  };
}
