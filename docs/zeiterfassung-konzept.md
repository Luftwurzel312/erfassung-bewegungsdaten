> Konzept der Zeiterfassung (Stand 03.11.2026). Der Quellcode wird als Modul `zeiterfassung/` ergänzt. Laut Marktanalyse soll die Zeiterfassung nicht zum eigenen Produkt ausgebaut werden; siehe `docs/marktanalyse-2026-11.md`.

# Zeiterfassung – tägliche Erfassung für die Lohnabrechnung

Demo für Mandanten ohne Lohnwissen: Mitarbeiter stempeln mit einem Klick (Kommen, Pause, Gehen), tragen Abwesenheiten als Zeitraum ein und werden Frage für Frage durch die nötigen Angaben geführt. Plausibilitätsprüfungen laufen sofort mit. Am Monatsende entstehen zwei Übergabedateien für die Lohnabrechnung.

## Start

```bash
npm install                                  # einmalig: esbuild, TypeScript, jsdom
python build.py                              # TypeScript -> web/app.js, dazu dist/zeit.html (alles in einer Datei)
python server.py --kanzlei "LOHNunion"       # http://127.0.0.1:8080
```

`dist/zeit.html` läuft auch ohne Server (Doppelklick). Dann werden die beiden CSV-Dateien beim „Übergeben“ heruntergeladen statt in `eingang/` gespeichert.

Direktlinks: `zeit.html#monat`, `#abschluss`, `#abwesenheit`, `#verwaltung`, auch mit Monat und Mitarbeiter: `#monat:2026-10:ma2`.

Prüfungen: `npm test` (Rechenlogik), `python build.py --check` (zusätzlich Typprüfung), `npm run smoke` (spielt die gebaute Oberfläche in jsdom durch; vorher bauen).

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/kalender.ts` | Datum/Uhrzeit als Wanduhr-Strings, Feiertage aller 16 Bundesländer (landesweit), Osterrechnung |
| `src/zeit.ts` | Datenmodell, Stempelungen -> Arbeitsblöcke, Pausen-/Nacht-/Sonntags-/Feiertagsminuten, Soll/Ist/Zeitkonto, alle Prüfungen, CSV-Export, Windows-1252 |
| `src/demo.ts` | Beispieldaten mit absichtlich eingebauten Auffälligkeiten |
| `src/app.ts` | Oberfläche: Heute, Mein Monat, Abwesenheit, Monatsabschluss, Verwaltung |
| `web/styles.css` | Gestaltung (hell/dunkel, große Touch-Flächen, ab ca. 400 px Breite) |
| `server.py` | Auslieferung und Annahme der Übergabe, nur Python-Standardbibliothek, nur 127.0.0.1 |
| `test/` | `zeit.test.ts` (Logik), `smoke.mjs` (Oberfläche) |

Gespeichert werden nur Stempelungen und Abwesenheiten. Arbeitsblöcke, Pausen, Zuschlagsstunden, Soll/Ist und alle Hinweise werden daraus berechnet. So bleibt jede Korrektur nachvollziehbar, und Nachträge sind als solche markiert (mit Pflichtgrund).

## Bildschirme

- **Heute**: Uhr, große Schaltflächen, die nur den jeweils sinnvollen nächsten Schritt zeigen (Kommen / Pause beginnen / Pause beenden / Gehen). Beim Kommen wird gewählt, wo gearbeitet wird; bei Dienstreise, Außendienst und Schulung ist Ziel bzw. Zweck Pflicht. Fehlt gestern das Gehen, wird nur noch „Gehen nachtragen“ angeboten.
- **Mein Monat**: Tagesliste mit Zeiten, Pause, Stunden, Feiertagen und Hinweisen; Tipp auf einen Tag zeigt Buchungen, erlaubt Nachtrag (auch Nachtschicht) und Löschen.
- **Abwesenheit**: Urlaub (auch halbe Tage) · Krank · Kind krank · Zeitausgleich · Sonderurlaub · Unbezahlt frei. Je Art gezielte Fragen, Live-Prüfung und Zählung der Arbeitstage.
- **Monatsabschluss**: Prüfübersicht aller Mitarbeiter mit Sprung zum betroffenen Tag. Fehler sperren die Übergabe, Warnungen müssen bestätigt werden.
- **Verwaltung**: Bundesland, Mitarbeiter (Wochenstunden, Arbeitstage, Entgeltart, Ein-/Austritt), Änderungsprotokoll.

## Übergabe

Eingang: `eingang/<Mandant>_Zeit_<JJJJ-MM>_<Zeitstempel>` als `.json` (alle Daten), `_Monat.csv` (Summen je Mitarbeiter) und `_Tage.csv` (Tagesliste als Nachweis). CSV: Windows-1252, Semikolon, Dezimalkomma, CRLF.

`_Monat.csv` enthält je Mitarbeiter: Soll-, Ist-, Nacht-, Sonntags-, Feiertagsstunden, Feiertagsvergütung (nur Stundenlohn), Urlaub, Krank (Arbeits- und Kalendertage), Kind krank, Zeitausgleich, Sonderurlaub, unbezahlt, Dienstreise, Außendienst, Homeoffice, Schulung, Saldo.

## Plausibilitätsprüfungen (Auswahl)

- Buchungen: Gehen vergessen (nach 16 Std.), Gehen ohne Kommen, doppeltes Kommen, Zukunft, Überschneidung bei Nachträgen, Ziel bei Dienstreise fehlt, Arbeitstag ohne Buchung und ohne Abwesenheit
- Arbeitszeit: > 8 Std. (Hinweis), > 10 Std. (§ 3 ArbZG), Pause 30/45 Min. nach 6/9 Std., Pausen zählen ab 15 Min. (§ 4), nicht > 6 Std. am Stück, Ruhezeit 11 Std. (§ 5)
- Sonn- und Feiertagsarbeit: Ersatzruhetag (§ 11 ArbZG), Nachtstunden 20–6 Uhr (§ 3b EStG)
- Abwesenheit: Überschneidung, Urlaub + Krank (§ 9 BUrlG), Urlaub ohne Arbeitstag im Zeitraum, Zeitraum außerhalb Ein-/Austritt
- Krank: AU ab dem 4. Kalendertag (§ 5 EFZG), Vorerkrankung, Wartezeit 4 Wochen (§ 3 Abs. 3), mehr als 42 Tage (Ende Entgeltfortzahlung), Arbeitsunfall -> Unfallanzeige (§ 193 SGB VII)
- Kind krank: Alter ab 12, Bescheinigung (§ 45 SGB V) · Sonderurlaub ohne Grund · unbezahlt über einen Monat (§ 7 Abs. 3 SGB IV)
- Feiertagsvergütung für Stundenlöhner wird automatisch erzeugt (nicht bei unbezahlt/Kind krank)

## So wird gerechnet

- Tagessoll = Wochenstunden ÷ Zahl der Arbeitstage. Feiertage haben Soll 0.
- Gutschrift (zählt wie gearbeitet): Urlaub, Sonderurlaub, Krank bis zum 42. Kalendertag. Zeitausgleich bekommt keine Gutschrift (Zeitkonto sinkt). Unbezahlt, Kind krank und Krank ab Tag 43 kürzen das Soll.
- Zeitkonto = Ist + Gutschrift − Soll. Im laufenden Monat zählt das Soll nur bis gestern (heute erst, wenn der Tag abgeschlossen ist).
- Die Zuordnung eines Arbeitsblocks zum Tag richtet sich nach dem Kommen; Nacht-/Sonntags-/Feiertagsminuten werden nach dem echten Kalendertag verteilt (Nachtschicht Samstag auf Sonntag ergibt Sonntagsstunden).

## Bekannte Grenzen der Demo

- Keine Anmeldung und keine Mandantentrennung; Stammdaten und Buchungen liegen nur im Browser. Die Uhrzeit kommt von der Uhr des Geräts (kein Manipulationsschutz), das Änderungsprotokoll ist kein revisionssicheres Audit-Log.
- Nur die gesetzlichen Regeln; Tarifverträge, Betriebsvereinbarungen, Jugendarbeitsschutz und abweichende Pausenmodelle sind nicht abgebildet.
- Zuschläge ohne Prozentsätze und ohne die Sonderregeln für Heiligabend/Silvester (ab 14 Uhr) und die 0–4-Uhr-Regel.
- Regionale Feiertage fehlen; Rechnung in Wanduhrzeit (Zeitumstellung ±1 Std.).
- Zeitkonto ohne Anfangsbestand und Übertrag; 42 Tage je Eintrag; Kind krank als unbezahlt; kein Mutterschutz, Elternzeit, Kurzarbeit, Schichtmodell.

## Bei Übernahme ins Repo angleichen

- Feiertage und Regionen aus `monatsmeldung/src/kalender.ts` übernehmen (regionale Feiertage, BB/HE Oster-/Pfingstsonntag).
- `_Monat.csv` über `monatsmeldung/konfig/lohnarten.standard.json` in LODAS/SBS umsetzen bzw. als Vorbelegung der Monatsmeldung nutzen.
- § 3b-Klassifikation: 0–4 Uhr bei Beginn vor Mitternacht, 24.12./31.12. ab 14 Uhr.
