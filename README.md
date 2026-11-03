# Erfassung Bewegungsdaten

Demo-Werkzeuge, mit denen kleine Unternehmen ohne Lohnwissen die Bewegungsdaten für die Lohnabrechnung liefern. Das Interface ist so einfach wie möglich; die Fachlogik (EFZG, BUrlG, MuSchG, § 3b EStG, Minijob, Sachbezug) steckt in den Fragen und Prüfungen. Sprachen: TypeScript, CSS, Python.

| Modul | Zweck | Stand |
|---|---|---|
| [`monatsmeldung/`](monatsmeldung/README.md) | Monatliche Meldung je Person: Menü, geführte Fragen, Live-Prüfung; Ausgabe als **DATEV-LODAS-ASCII**, **SBS-Lohn-CSV**, Hinweisliste fürs Lohnbüro | v2, getestet |
| `zeiterfassung/` | Tägliche Erfassung: Kommen, Pause, Gehen, Abwesenheiten, Dienstreise; Monatsübergabe als CSV | wird aus dem bestehenden Stand ergänzt, Konzept in [`docs/zeiterfassung-konzept.md`](docs/zeiterfassung-konzept.md) |

Jedes Modul hat ein eigenes `package.json`, `build.py` und `server.py` und lässt sich einzeln starten. Voraussetzungen: Node.js ≥ 18 (nur für den Build) und Python ≥ 3.9.

```bash
cd monatsmeldung
npm install
python build.py --check
python server.py --kanzlei "LOHNunion"
```

## Einordnung

Die Marktanalyse vom November 2026 ([`docs/marktanalyse-2026-11.md`](docs/marktanalyse-2026-11.md)) kommt zu dem Ergebnis:

- **Monatsmeldung weiterentwickeln.** Die Datenübergabe lösen DATEV Personal, Taxmaro oder ADDISON Lohn Online bereits. Einen geführten Frage-Assistenten mit fachlicher Live-Prüfung für Laien und eine Arbeitsliste für den Lohnbuchhalter bietet keines der geprüften Produkte.
- **Zeiterfassung nicht zum Produkt ausbauen.** Revisionssicherheit, Benutzerverwaltung, Apps und Terminals decken Anbieter wie clockin, ZEP, TimeTac (DATEV) oder Clockodo und Papershift (SBS/ADDISON) für wenige Euro je Nutzer ab.

## Datenschutz

Meldungen enthalten Gesundheitsdaten (Krankheit, Mutterschutz). Die Übergabeordner `eingang/` sind per `.gitignore` ausgeschlossen. Das Repository sollte privat bleiben. Für den Echtbetrieb fehlen Anmeldung, Mandantentrennung, Verschlüsselung und ein revisionssicheres Protokoll (siehe „Bekannte Grenzen“ in den Modul-READMEs).
