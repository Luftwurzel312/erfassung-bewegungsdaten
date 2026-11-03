# Monatsmeldung – geführte Erfassung der Lohn-Bewegungsdaten

Für Mandanten ohne Lohnwissen: Sie wählen pro Person aus einem Menü, was im Monat passiert ist, und werden Frage für Frage durch die nötigen Angaben geführt. Plausibilitätsprüfungen laufen sofort mit. Beim Lohnbüro kommen an:

| Datei | Zweck |
|---|---|
| `<Mandant>_<JJJJ-MM>_LODAS.txt` | DATEV LODAS, ASCII-Import (*Mandant → Daten übernehmen → ASCII-Import*) |
| `<Mandant>_<JJJJ-MM>_SBS.csv` | SBS Lohn / SBS Lohn plus, Import über eine Lohn-Portal-Definition |
| `<Mandant>_<JJJJ-MM>_Hinweise.txt` | Arbeitsliste: eAU abrufen, Unfallanzeige, Ab-/Unterbrechungsmeldungen, Bescheinigungen, Prüfpunkte |
| `<Mandant>_<JJJJ-MM>_Uebergabe.csv` | Neutrale Übersicht aller Angaben mit Schlüssel und Lohnart |
| `meldung.json` | Vollständige Meldung mit allen Antworten |

Alle Textdateien in Windows-1252, Semikolon, Dezimalkomma, CRLF.

## Start

```bash
npm install                                   # einmalig: esbuild + TypeScript
python build.py                               # TypeScript -> web/app.js, dazu dist/monatsmeldung.html
python server.py --kanzlei "LOHNunion"        # http://127.0.0.1:8080
python build.py --check                       # Typprüfung + 36 Logiktests + Build
```

Mit Server landen die Dateien in `eingang/<Mandant>_<JJJJ-MM>_<Zeitstempel>/`. `dist/monatsmeldung.html` läuft auch ohne Server (Doppelklick); dann zeigt die Ergebnisseite die Dateien für das Lohnbüro an und bietet sie zum Herunterladen an.

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/kalender.ts` | Datum, Ostern, Feiertage aller 16 Länder **plus regionale Feiertage** (Mariä Himmelfahrt BY, Augsburger Friedensfest, Fronleichnam SN/TH; Oster- und Pfingstsonntag BB/HE) |
| `src/parameter.ts` | **Jahrestabelle** Mindestlohn, Minijob-Grenze, Kinderkrankentage (2026, 2027) und feste Grenzen |
| `src/regeln.ts` | Datenmodell, Menü-Kategorien mit Fragen, Berechnungen, Plausibilitätsprüfungen |
| `src/export/zeilen.ts` | Neutrale Übergabezeilen mit fachlichem Schlüssel und taggenaue Fehlzeiten |
| `src/export/konfig.ts` | Lohnarten-Zuordnung laden und je Mandant überlagern |
| `src/export/formate.ts` | Übergabe-CSV, **LODAS-ASCII**, **SBS-CSV** |
| `src/export/hinweise.ts` | Arbeitsliste für das Lohnbüro |
| `src/export/cp1252.ts` | Windows-1252-Kodierung für Downloads im Browser |
| `src/app.ts` | Oberfläche: 3 Schritte, Assistent, Kalender, Stammdaten, Ergebnisseite |
| `konfig/lohnarten.standard.json` | Zuordnung Schlüssel → LODAS-/SBS-Lohnart und Ausfallschlüssel |
| `server.py` | Auslieferung, Konfiguration je Mandant, Annahme – nur Python-Standardbibliothek |
| `test/logik.test.ts` | 36 Tests: Feiertage, Jahreswerte, EFZ, Sachbezug, Mutterschutz, Exporte, Kodierung |

## Lohnarten zuordnen (vor dem ersten echten Import)

1. `konfig/lohnarten.standard.json` öffnen. Jeder fachliche Schlüssel (`arbeitszeit`, `urlaub`, `zuschlag_nacht_0_4`, `einmal_weihnachtsgeld` …) bekommt die Kanzlei-Lohnart für LODAS (`lodas`) und SBS (`sbs`). `wert` sagt, ob Stunden, Tage oder ein Betrag übergeben wird; `nurStundenlohn` unterdrückt die Zeile bei Gehaltsempfängern (dort laufen Urlaub/Krank nur als Fehlzeit).
2. Unter `fehlzeiten` die LODAS-Ausfallschlüssel und die SBS-Lohnarten für Abwesenheitstage eintragen.
3. `lodas.beraterNr` und die Bearbeitungsschlüssel `lodas.bs` (Stunden/Tage/Betrag) gegen das Schnittstellenhandbuch `LODAS_SSH.pdf` bzw. die Lohnartenliste prüfen.
4. Mit einem Testmandanten importieren, dann `"geprueft": true` setzen. Solange `false`, steht ein Warnhinweis in der LODAS-Datei und in der Hinweisliste.
5. Abweichungen einzelner Mandanten: `konfig/mandanten/<MandantNr>.json` mit nur den abweichenden Einträgen (Vorlage: `konfig/mandanten/beispiel.json`).

### LODAS-Datei

```
[Allgemein]
Version_SST=1.0
BeraterNr=1234567
MandantenNr=20417
Feldtrennzeichen=;
Zahlenkomma=,
Stringbegrenzer='
Kommentarkennzeichen=*

[Satzbeschreibung]
1;u_lod_bwd_buchung_standard;abrechnung_zeitraum#bwd;bs_nr#bwd;bs_wert_butab#bwd;la_eigene#bwd;pnr#bwd;
2;u_lod_psd_fehlzeiten;pnr#psd;datum_von_ttmmjjjj#psd;datum_bis_ttmmjjjj#psd;grund_fehlzeiten#psd;

[Bewegungsdaten]
1;01.11.2026;1;88,00;1000;1002;

[Stammdaten]
2;1001;12112026;16112026;'U';
```

- Bewegungsdaten je Lohnart mit Abrechnungsmonat `01.MM.JJJJ` in jeder Zeile; Personalnummer und Mandantennummer höchstens 5-stellig (wird geprüft).
- Fehlzeiten als Personalstammdaten (`#psd`) im Abschnitt `[Stammdaten]`, taggenau über den ganzen Zeitraum. Krankheit wird am Ende der Entgeltfortzahlung (Tag 42) bzw. nach der Wartezeit geteilt (`krank` / `krank_ohne_efz`).
- Austritt, Freitext und „Keine Änderungen“ erzeugen keine Buchung; sie stehen als Kommentar in der Datei und in der Hinweisliste.

### SBS-Datei (Lohn Portal)

Kopfzeile `Firma;Personalnummer;Abrechnungsmonat;Lohnart;Stunden;Tage;Betrag;Von;Bis;Text`. Einmalig in SBS: **LP-Basis (ID 683) → LP-Definition (ID 684)** die Spalten den SBS-Feldern zuordnen; danach monatlich **LP-Import (ID 686) → Übernahme in die Erfassung (ID 152) → Kontrolle (ID 326) → Brutto/Netto (ID 330)**. Der Import ist nur möglich, solange für den Monat noch keine Abrechnung gelaufen ist. Abwesenheiten stehen mit Von/Bis und den Arbeitstagen im Abrechnungsmonat. Das Festformat BEWA (ID 140) ist nicht umgesetzt, weil die Feldpositionen nicht öffentlich dokumentiert sind.

## Plausibilitätsprüfungen (Auswahl)

- **Zeitraum**: Pflicht, Ende ≥ Beginn, Schnitt mit dem Monat, nicht vor Eintritt; Überschneidungen; Urlaub + Krankheit (§ 9 BUrlG); Abwesenheit über den Austritt hinaus; doppelte Einträge.
- **Krankheit**: Entgeltfortzahlung taggenau bis Tag 42 und erst nach der Wartezeit (§ 3 Abs. 3 EFZG) – nur diese Tage werden bei Stundenlohn bezahlt; AU ab Tag 4 (§ 5 EFZG); Fortsetzungserkrankung mit Angabe des früheren Zeitraums; Arbeitsunfall mit Frist der Unfallanzeige (§ 193 SGB VII).
- **Kind krank**: Alter unter 12, Bescheinigung, Höchsttage je Jahr (2026: 15/30, 2027: 10/20), § 616 BGB.
- **Mutterschutz**: Schutzfristen aus dem Geburtstermin (6 Wochen vor, 8 bzw. 12 Wochen nach der Geburt) und Abgleich mit dem eingetragenen Zeitraum.
- **Stundenlohn**: gearbeitete Stunden fehlen, > 10 Std./Arbeitstag, deutlich über/unter Soll; automatische Feiertagsvergütung (nicht bei unbezahlten Zeiten).
- **Mindestlohn und Minijob** nach dem Jahr des Abrechnungsmonats (2026: 13,90 € / 603 €, 2027: 14,60 € / 633 €).
- **Sachbezug**: 50-€-Freigrenze über **alle** Gutscheine des Monats (kein Freibetrag); Geschenke nur als Sachzuwendung bis 60 € steuerfrei, Geldgeschenke immer steuerpflichtig.
- **§ 3b EStG**: Nachtstunden 0–4 Uhr bei Schichtbeginn vor Mitternacht (40 %), Feiertage 150 % (24.12. ab 14 Uhr, 25./26.12., 1.5.), Silvester ab 14 Uhr als Feiertag, Ostersonntag/Pfingstsonntag in BB/HE als Feiertag; Grundlohn über 25 €/50 € je Stunde in der Hinweisliste.
- **Unbezahlt > 1 Monat**: Ende der Versicherungspflicht (§ 7 Abs. 3 SGB IV), Abmeldung mit Datum in der Hinweisliste.

## Jährlich pflegen

- `JAHRESWERTE` in `src/parameter.ts` zum Jahreswechsel ergänzen. Fehlt ein Jahr, wird mit dem letzten bekannten Jahr geprüft und ein Hinweis angezeigt.
- Kinderkrankentage 2027 sind mit dem Regelfall (10/20 Tage) hinterlegt. Wird die Sonderregel verlängert, dort anpassen.

## Bekannte Grenzen der Demo

- Keine Anmeldung, keine Mandantentrennung, kein Freigabe-Workflow, kein revisionssicheres Protokoll. Stammdaten liegen im Browser. Für den Echtbetrieb mit Gesundheitsdaten (Art. 9 DSGVO) braucht es Benutzerverwaltung, TLS, Verschlüsselung, AV-Vertrag und Löschkonzept.
- Die Lohnarten, Ausfallschlüssel und Bearbeitungsschlüssel in der Standardkonfiguration sind Beispiele. Die LODAS-Feldnamen folgen dem Schnittstellenhandbuch, wie es in öffentlichen Beispielen zitiert wird; verbindlich ist erst ein Testimport.
- Die 6-Wochen-Frist wird je Eintrag gezählt. Vorerkrankungen aus Vormonaten werden abgefragt und in die Hinweisliste übernommen, aber nicht verrechnet.
- Gemeindegenaue Feiertage werden über die Auswahl „örtliche Feiertage“ abgebildet, nicht über eine Gemeindeliste.
- Kein Urlaubs- oder Zeitkonto mit Übertrag; die Monatsmeldung kennt nur den Abrechnungsmonat.
- Die Hinweistexte sind Arbeitshilfen mit Paragrafenverweis, keine Rechtsberatung.
