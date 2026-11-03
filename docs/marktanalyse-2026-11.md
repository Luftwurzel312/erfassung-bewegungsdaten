# Marktanalyse und Rechtsstand – November 2026

Kurzfassung der Recherche vom 03.11.2026 zu Monatsmeldung und Zeiterfassung. Preise teils aus Vergleichsportalen – vor einer Empfehlung beim Hersteller prüfen.

## Ergebnis

Eigenentwicklung **nur** für die Monatsmeldung als geführter „Lohn-Dolmetscher“ für Kleinstmandanten, mit importfähiger LODAS- und SBS-Datei. Der Mehrwert ist die Fehlervermeidung (weniger Rückfragen und Korrekturabrechnungen), nicht der Preis. Zeiterfassung über Standardprodukte.

Gegenprobe vor weiterer Investition: einen Pilotmandanten parallel in DATEV Personal oder Taxmaro erfassen lassen und Fehlerquote und Rückfragen vergleichen.

## Marktvergleich

| Produkt | Kurz | Preis (netto) | LODAS / SBS | Für Laien |
|---|---|---|---|---|
| DATEV Personal | Monatsdaten, An-/Abwesenheiten, eAU, Personalakte; Nachfolger der Vorerfassung online (abgeschaltet 30.09.2025) | 0,40 €/abgerechnetem AN + DATEV Unternehmen online | LODAS/LuG nativ, kein SBS | mittel: Lohnarten-Tabelle, kaum Prüfung |
| DATEV Lohn Vorerfassung (Excel) | Kanzlei bestückt Excel-Mappe | einmalig 28,35 € | Import LODAS/LuG | gut für Excel-Nutzer, keine Prüfung |
| Taxmaro | White-Label-HR-Portal, Prüftool für Lohnbuchhalter | ca. 3–5 €/MA | LODAS, LuG; Addison, SBS, Agenda | gut, aber kein Fach-Assistent |
| ADDISON Lohn Online / OneClick | Stamm-, Bewegungs-, Zeitdaten, eAU, Sofortmeldung | kein öffentlicher Preis | SBS Lohn nativ | mittel–gut |
| SBS Lohn Portal (ID 682–686) | frei definierbarer CSV-Import | in SBS-Lizenz | SBS | Kanzleiwerkzeug – **Ziel des SBS-Exports** |
| Personio | HR-Suite | ab ca. 10 €/MA | LIDS/LADS | überdimensioniert für 1–10 MA |
| Clockodo | Zeiterfassung | 4–12 €/Nutzer | DATEV LuG (ohne Zuschläge), API zu ADDISON OneClick | gut |
| Papershift | Dienstplan, Zuschläge | 4–9 €/MA + 39 € Support | LODAS, LuG, SBS Lohn plus | gut für Schicht |
| ZEP, clockin, TimeTac | Zeiterfassung | 4–10 €/Nutzer | DATEV Lohnimportdatenservice | gut |

## Umgesetzt in Monatsmeldung 2.0

| Befund | Umsetzung |
|---|---|
| Export nicht importierbar | LODAS-ASCII und SBS-CSV mit Lohnarten-Konfiguration je Mandant |
| Grenzwerte fest für 2026 | Jahrestabelle; 2027: Mindestlohn 14,60 € (MiLoV5 § 1 Nr. 2), Minijob 633 €, Kinderkrankentage 10/20 |
| Nur landesweite Feiertage | Regionale Feiertage; Oster-/Pfingstsonntag BB/HE (§ 3b Abs. 2 S. 4 EStG: Ort der Arbeitsstätte) |
| § 3b-Sonderregeln fehlen | 0–4 Uhr 40 %, 150 % für 24.12. ab 14 Uhr/25./26.12./1.5., Silvester ab 14 Uhr; Grundlohngrenzen 25/50 € |
| 50 €-Prüfung je Eintrag | Freigrenze über alle Sachbezüge des Monats |
| Geschenke | Nur Sachzuwendungen bis 60 € (R 19.6 LStR); Geld immer steuerpflichtig |
| EFZ pauschal | Taggenau bis Tag 42 und nach Wartezeit; Fehlzeit am EFZ-Ende geteilt |
| Mutterschutz ohne Fristen | Fristen aus Geburtstermin (§ 3 MuSchG) |
| Fehlende Aufgaben fürs Lohnbüro | Hinweisliste (eAU, Unfallanzeige, Abgabegründe 30/34/51/52, EEL, U2) |

## Offen (priorisiert)

1. Benutzer-, Rollen- und Mandantentrennung mit Freigabe-Workflow (Entwurf → freigegeben → abgerufen → abgerechnet).
2. Revisionssicheres Änderungsprotokoll (append-only, Serverzeit, Hash-Kette).
3. DSGVO-Paket: AV-Vertrag, TLS, Verschlüsselung, Hosting in der EU, Löschkonzept; keine Diagnosen erfassen (Art. 9 DSGVO).
4. Urlaubskonto mit Resturlaub und Verfall; Zeitkonto mit Übertrag.
5. Verkettung der 6-Wochen-Frist über Monate (Fortsetzungserkrankung).
6. LODAS-Testimport in einer echten Installation; Bearbeitungsschlüssel und Ausfallschlüssel gegen DATEV-Dok.-Nr. 1080789 / `LODAS_SSH.pdf` abgleichen.

## Rechtsstand Zeiterfassung

Pflicht seit BAG 13.09.2022 (1 ABR 22/21) aus § 3 Abs. 2 Nr. 1 ArbSchG. Der BMAS-Referentenentwurf vom 18.06.2026 sieht eine elektronische, taggenaue Aufzeichnung mit gestaffelten Übergangsfristen vor; Betriebe bis 10 Beschäftigte wären dauerhaft ausgenommen. Stand Ende September 2026 ohne Kabinettsbeschluss – vor Entscheidungen erneut prüfen.

## Quellen (Auswahl)

- [Fünfte Mindestlohnanpassungsverordnung (gesetze-im-internet.de)](https://www.gesetze-im-internet.de/milov5/BJNR10C0A0025.html)
- [DATEV Personal – Produktseite](https://www.datev.de/web/de/shop/produkt-details/datev-personal-20047)
- [Abschaltung LODAS-Vorerfassung online (connect-berlin)](https://www.connect-berlin.de/blog/datev-abschaltung-von-lodas-und-lohn-und-gehalt-vorerfassung-online.html)
- [Taxmaro im DATEV-Marktplatz](https://www.datev.de/web/de/marktplatz/taxmaro)
- [ADDISON Lohn Online](https://www.wolterskluwer.com/de-de/solutions/addison-komplettloesung-steuerberater/addison-lohn-und-gehaltsabrechnung/lohn-online)
- [Lobster: DATEV-LODAS-Format (Kopf, Satzbeschreibung, Beispielzeilen)](https://www.lobster-world.com/online/_data/docs/41/en/DatevLodasIU.html)
- [clokr Issue #304 zu LODAS-Satztypen](https://github.com/sebastianzabel/clokr/issues/304)
- [SBS Lohn Daten-Importe (ADDISON Akademie)](https://akademie.addison.de/sbs-lohn-daten-importe.html)
- [§ 3b EStG (dejure)](https://dejure.org/gesetze/EStG/3b.html)
- [TK: Kinderkrankengeld 2025 und 2026](https://www.tk.de/firmenkunden/service/fachthemen/versicherung-fachthema/kinderkrankengeld-2025-und-2026-2160374)
- [Referentenentwurf ArbZG 2026 (HWK)](https://www.hwkno.de/artikel/neuer-referentenentwurf-zur-aenderung-des-arbeitszeitgesetzes-76,0,15961.html)
