export async function installedVersion() {
  const manifest =
    globalThis.chrome?.runtime?.getManifest?.() ??
    (await fetch("manifest.json").then((response) => response.json()));
  return manifest.version;
}
