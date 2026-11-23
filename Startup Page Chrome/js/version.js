import { extension } from "./extension-api.js";

export async function installedVersion() {
  const manifest =
    extension?.runtime?.getManifest?.() ??
    (await fetch("manifest.json").then((response) => response.json()));
  return manifest.version;
}
