# Änderungen

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
