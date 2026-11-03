#!/usr/bin/env python3
"""Server für die Monatsmeldung – nur Python-Standardbibliothek.

    python server.py --kanzlei "LOHNunion" [--port 8080] [--eingang eingang]

Liefert web/ aus und nimmt Meldungen an. Je Meldung entsteht ein Ordner
eingang/<Mandant>_<JJJJ-MM>_<Zeitstempel>/ mit
    meldung.json                 alle Antworten (UTF-8)
    <Mandant>_<Monat>_Uebergabe.csv
    <Mandant>_<Monat>_LODAS.txt   DATEV LODAS ASCII-Import
    <Mandant>_<Monat>_SBS.csv     SBS Lohn Portal
    <Mandant>_<Monat>_Hinweise.txt Arbeitsliste fürs Lohnbüro
Textdateien in Windows-1252 mit CRLF.

Lohnarten-Zuordnung: konfig/lohnarten.standard.json, je Mandant überschreibbar in
konfig/mandanten/<MandantNr>.json (nur die abweichenden Einträge).

Nur für den lokalen Betrieb bzw. hinter einem Reverse-Proxy mit Anmeldung gedacht:
Der Server bindet an 127.0.0.1 und hat selbst keine Benutzerverwaltung.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HIER = pathlib.Path(__file__).resolve().parent
WEB = HIER / "web"
KONFIG = HIER / "konfig"
MAX_BYTES = 2 * 1024 * 1024
ERLAUBTE_DATEI = re.compile(r"^[\w-]{1,40}_\d{4}-\d{2}_(Uebergabe|LODAS|SBS|Hinweise)\.(csv|txt)$")


def mische(basis: dict, extra: dict) -> dict:
    """Mandantenkonfiguration eine Ebene tief über die Standardkonfiguration legen."""
    out = dict(basis)
    for k, v in extra.items():
        if isinstance(v, dict) and isinstance(basis.get(k), dict):
            out[k] = {**basis[k], **v}
            if k == "lodas" and isinstance(v.get("bs"), dict):
                out[k]["bs"] = {**basis[k].get("bs", {}), **v["bs"]}
        else:
            out[k] = v
    return out


def konfig_fuer(mandant: str) -> dict:
    basis = json.loads((KONFIG / "lohnarten.standard.json").read_text(encoding="utf-8"))
    if re.fullmatch(r"\d{1,10}", mandant or ""):
        datei = KONFIG / "mandanten" / f"{mandant}.json"
        if datei.is_file():
            basis = mische(basis, json.loads(datei.read_text(encoding="utf-8")))
    return basis


class Handler(SimpleHTTPRequestHandler):
    kanzlei = "Ihr Lohnbüro"
    eingang = HIER / "eingang"
    port = 8080

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(WEB), **kw)

    # -------- Schutz: nur lokaler Host, gleiche Herkunft
    def _host_ok(self) -> bool:
        host = (self.headers.get("Host") or "").split(":")[0]
        return host in ("127.0.0.1", "localhost")

    def _herkunft_ok(self) -> bool:
        origin = self.headers.get("Origin")
        return origin is None or origin in (f"http://127.0.0.1:{self.port}", f"http://localhost:{self.port}")

    def _json(self, status: int, daten: dict) -> None:
        body = json.dumps(daten, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if not self._host_ok():
            return self._json(HTTPStatus.MISDIRECTED_REQUEST, {"fehler": "Unbekannter Host"})
        url = urlparse(self.path)
        if url.path == "/api/status":
            return self._json(200, {"server": True, "kanzlei": self.kanzlei})
        if url.path == "/api/konfig":
            mandant = parse_qs(url.query).get("mandant", [""])[0]
            return self._json(200, konfig_fuer(mandant))
        if url.path.startswith("/api/"):
            return self._json(404, {"fehler": "Unbekannt"})
        return super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        if not self._host_ok() or not self._herkunft_ok():
            return self._json(HTTPStatus.FORBIDDEN, {"fehler": "Nicht erlaubt"})
        if urlparse(self.path).path != "/api/meldung":
            return self._json(404, {"fehler": "Unbekannt"})
        laenge = int(self.headers.get("Content-Length") or 0)
        if not 0 < laenge <= MAX_BYTES:
            return self._json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"fehler": "Meldung zu groß oder leer"})
        try:
            daten = json.loads(self.rfile.read(laenge).decode("utf-8"))
            kopf = daten["meldung"]["kopf"]
            mandant = re.sub(r"[^\w-]", "_", str(kopf["mandantNr"]))[:40] or "Mandant"
            monat = str(kopf["monat"])
            if not re.fullmatch(r"\d{4}-\d{2}", monat):
                raise ValueError("Monat")
        except (ValueError, KeyError, TypeError, UnicodeDecodeError):
            return self._json(HTTPStatus.BAD_REQUEST, {"fehler": "Meldung ist unvollständig."})

        stempel = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        ordner = self.eingang / f"{mandant}_{monat}_{stempel}"
        ordner.mkdir(parents=True, exist_ok=False)
        (ordner / "meldung.json").write_text(json.dumps(daten, ensure_ascii=False, indent=2), encoding="utf-8")
        gespeichert = ["meldung.json"]
        for d in daten.get("dateien", []):
            name = str(d.get("name", ""))
            if not ERLAUBTE_DATEI.fullmatch(name):
                continue  # nur die bekannten Ausgabedateien, keine Pfade
            text = str(d.get("text", "")).replace("\r\n", "\n").replace("\n", "\r\n")
            (ordner / name).write_bytes(text.encode("cp1252", errors="replace"))
            gespeichert.append(name)
        self.log_message("Meldung gespeichert: %s (%d Dateien)", ordner.name, len(gespeichert))
        return self._json(200, {"ok": True, "ordner": ordner.name, "dateien": gespeichert})


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--kanzlei", default="Ihr Lohnbüro")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--eingang", default=str(HIER / "eingang"))
    a = ap.parse_args()
    Handler.kanzlei, Handler.port, Handler.eingang = a.kanzlei, a.port, pathlib.Path(a.eingang).resolve()
    if not (WEB / "app.js").is_file():
        raise SystemExit("web/app.js fehlt – bitte zuerst  python build.py  ausführen.")
    print(f"Monatsmeldung für {a.kanzlei}: http://127.0.0.1:{a.port}  (Eingang: {Handler.eingang})")
    ThreadingHTTPServer(("127.0.0.1", a.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
