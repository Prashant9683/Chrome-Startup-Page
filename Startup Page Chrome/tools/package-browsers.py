"""Build unsigned browser packages from the same runtime, using only Python's stdlib."""
import json
import os
import tempfile
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
output = root / "dist"
output.mkdir(exist_ok=True)
files = [root / name for name in (
    "index.html", "classic.html", "settings.html", "config.js", "config.json",
    "icons.js", "script.js", "style.css", "font.css", "LICENSE", "THIRD_PARTY_NOTICES.txt",
)]
for folder in ("css", "js", "img", "fonts", "licenses"):
    files.extend(path for path in sorted((root / folder).rglob("*"))
                 if path.is_file() and not path.name.startswith("."))

for target in ("chromium", "firefox", "safari"):
    manifest = json.loads((root / "manifest.json").read_text())
    if target == "firefox":
        manifest["browser_specific_settings"] = {"gecko": {"id": "startpage@prashantgehlot"}}
    elif target == "safari":
        manifest["browser_url_overrides"] = manifest.pop("chrome_url_overrides")
    with tempfile.NamedTemporaryFile(dir=output, delete=False) as temp:
        archive = Path(temp.name)
    try:
        with ZipFile(archive, "w", ZIP_DEFLATED) as package:
            package.writestr("manifest.json", json.dumps(manifest, indent=2) + "\n")
            for path in files:
                package.write(path, path.relative_to(root))
        dest = output / ("startpage-" + target + ".zip")
        os.replace(archive, dest)
        print(dest)
    finally:
        archive.unlink(missing_ok=True)
