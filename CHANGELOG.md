# Änderungen

## Monatsmeldung 2.1.0 – 04.11.2026

Oberfläche im Design des LOHNunion-Mandantenportals. Logik, Prüfungen und Exporte unverändert.

**Gestaltung**
- Farben aus dem Portal übernommen: Navy `#01425E` (Titel, Werte), Portal-Blau `#4AAEE7` (Knöpfe, aktiver Reiter, Kartentitel), Hintergrund `#F8FBFD`, Rahmen `#CBD5E1`, Trennlinien `#E7E7E7`.
- Kopfzeile weiß mit Reiter-Navigation (aktiver Schritt blau unterstrichen) und „Abrechnungsmonat: MM.JJJJ“ rechts.
- Heller Seitenkopf mit großem Titel und Kennzahlen (Mandantennummer, Abrechnungsmonat, Bundesland), Hauptaktion rechts.
- Inhalte in weißen Karten mit hellblauem Abschnittstitel und feiner Linie (wie „Kundengruppe“ / „Allgemeine Angaben“). Schritt 1 in zwei Karten „Abrechnung“ und „Allgemeine Angaben“, Schritt 2 je Person drei Karten, Schritt 3 „Übersicht“ und „Absenden“.
- Eingabefelder mit 4-px-Rundung und eigenem Auswahlpfeil, Bezeichnungen klein und grau, Werte navy.
- Schrift: „DIN Next LT Pro“ bzw. „DIN 2014“, wenn installiert, sonst Barlow (Google Fonts, DIN-ähnlich).
- Dunkelmodus auf die neue Palette abgestimmt.

**Hinweis Barrierefreiheit**: Weiße Schrift auf `#4AAEE7` hat nur ca. 2,6 : 1 Kontrast (WCAG verlangt 4,5 : 1). Übernommen, weil es dem Portal entspricht; für Text auf Weiß wird ein dunkleres Blau (`#1F7FB8`) verwendet.

## Monatsmeldung 2.0.0 – 03.11.2026

Quellstand neu aufgebaut (TypeScript, getrennt in Kalender, Parameter, Regeln, Export, Oberfläche) und um die Ergebnisse der Marktanalyse ergänzt.

**Neu**
- Export **DATEV LODAS** (ASCII-Import): `[Allgemein]`, `[Satzbeschreibung]`, Bewegungsdaten über `u_lod_bwd_buchung_standard`, taggenaue Fehlzeiten über `u_lod_psd_fehlzeiten` im Abschnitt `[Stammdaten]`; Prüfung 5-stelliger Personal- und Mandantennummern.
- Export **SBS Lohn / SBS Lohn plus** als CSV für eine Lohn-Portal-Definition (ID 684/686).
- **Hinweisliste** für das Lohnbüro: eAU abrufen, Unfallanzeige, Ab-/Unterbrechungsmeldungen mit Abgabegrund, Entgeltbescheinigungen, U2, Austritt, Minijob, Sachbezug, § 3b-Grundlohn.
- **Lohnarten-Zuordnung als Konfiguration** (`konfig/lohnarten.standard.json`), je Mandant überschreibbar; Warnung, solange `"geprueft": false`.
- **Jahrestabelle** für Mindestlohn, Minijob-Grenze und Kinderkrankentage: 2026 und 2027 (14,60 € / 633 € / 10 Tage).
- **Regionale Feiertage** (Mariä Himmelfahrt BY, Augsburger Friedensfest, Fronleichnam SN/TH) und Oster-/Pfingstsonntag als Feiertag in BB und HE.
- **§ 3b EStG**: Nachtarbeit 0–4 Uhr (40 %) und Feiertage mit 150 % getrennt; Silvester/Heiligabend ab 14 Uhr berücksichtigt.
- **Mutterschutz**: Schutzfristen aus dem Geburtstermin berechnet und mit dem Zeitraum abgeglichen.
- Download der Dateien in Windows-1252 auch ohne Server.

**Korrigiert**
- Krankheit: Bei Stundenlohn werden nur noch die Tage bis zum 42. Kalendertag und nach der Wartezeit als bezahlt gerechnet (vorher alle Tage).
- Sachbezug: 50-€-Freigrenze über alle Gutscheine des Monats statt je Eintrag; Hinweis „Freigrenze, nicht Freibetrag“.
- Geschenke: Abfrage Sache oder Geld; Geldgeschenke sind immer steuerpflichtig.
- Mindestlohn und Minijob-Grenze nach dem Jahr des Abrechnungsmonats statt fest 2026.
- Personalnummer nur aus Ziffern.
