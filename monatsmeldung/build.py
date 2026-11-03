#!/usr/bin/env python3
"""Baut die Monatsmeldung.

    python build.py           TypeScript -> web/app.js und dist/monatsmeldung.html (eine Datei, läuft ohne Server)
    python build.py --check   zusätzlich Typprüfung und Logiktests
"""
import pathlib
import subprocess
import sys

HIER = pathlib.Path(__file__).resolve().parent
NPX = "npx.cmd" if sys.platform == "win32" else "npx"


def lauf(*befehl: str) -> None:
    print("›", " ".join(befehl))
    subprocess.run(befehl, cwd=HIER, check=True)


def main() -> None:
    if "--check" in sys.argv:
        lauf(NPX, "tsc", "--noEmit", "-p", ".")
        lauf("npm", "test") if sys.platform != "win32" else lauf("npm.cmd", "test")
    lauf(NPX, "esbuild", "src/app.ts", "--bundle", "--format=iife", "--target=es2020",
         "--outfile=web/app.js", "--log-level=warning")

    html = (HIER / "web/index.html").read_text(encoding="utf-8")
    css = (HIER / "web/styles.css").read_text(encoding="utf-8")
    js = (HIER / "web/app.js").read_text(encoding="utf-8").replace("</script", "<\\/script")
    html = html.replace('<link rel="stylesheet" href="styles.css">', f"<style>\n{css}\n</style>")
    html = html.replace('<script src="app.js"></script>', f"<script>\n{js}\n</script>")
    ziel = HIER / "dist/monatsmeldung.html"
    ziel.parent.mkdir(exist_ok=True)
    ziel.write_text(html, encoding="utf-8")
    print(f"✓ {ziel.relative_to(HIER)} ({ziel.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
