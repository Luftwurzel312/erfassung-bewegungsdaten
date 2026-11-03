/**
 * Ausgabeformate:
 *  - Übergabe-CSV (neutral, alle Angaben, zum Lesen und Archivieren)
 *  - DATEV LODAS: ASCII-Import (Mandant | Daten übernehmen | ASCII-Import)
 *  - SBS Lohn / SBS Lohn plus: CSV für eine Lohn-Portal-Definition (ID 684), Import über ID 686
 * Alle Texte nur mit Zeichen aus Windows-1252, Zeilenende CRLF.
 */
import { Datum, fmt, teile, p2, schnittMitMonat } from '../kalender';
import { Meldung } from '../regeln';
import { Konfig, Wertart } from './konfig';
import { Zeile, Fehlzeit, erzeugeZeilen } from './zeilen';
import { nur1252 } from './cp1252';

export interface Ausgabe { dateiname: string; text: string; probleme: string[] }

const CRLF = '\r\n';
const dez = (n: number | undefined): string => (n === undefined || n === 0 ? '' : n.toFixed(2).replace('.', ','));
const csvFeld = (s: string): string => (/[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const ttmmjjjj = (d: Datum): string => { const { j, m, t } = teile(d); return `${p2(t)}${p2(m)}${j}`; };
const wertVon = (z: Zeile, w: Wertart): number | undefined => (w === 'stunden' ? z.stunden : w === 'tage' ? z.tage : z.betrag);
const datei = (m: Meldung, teil: string, endung: string) =>
  `${(m.kopf.mandantNr || 'Mandant').replace(/[^\w-]/g, '_')}_${m.kopf.monat}_${teil}.${endung}`;

// ---------------------------------------------------------------- Übergabe-CSV

export function uebergabeCsv(m: Meldung, k: Konfig): Ausgabe {
  const { zeilen } = erzeugeZeilen(m);
  const [j, mo] = m.kopf.monat.split('-');
  const kopf = ['Mandant', 'Monat', 'PersNr', 'Name', 'Schluessel', 'Bezeichnung', 'LODAS-Lohnart', 'SBS-Lohnart', 'Von', 'Bis', 'Tage', 'Stunden', 'Betrag', 'Hinweis'];
  const zeilenText = zeilen.map((z) => {
    const la = k.lohnarten[z.schluessel];
    return [m.kopf.mandantNr, `${mo}/${j}`, z.persNr, z.name, z.schluessel, z.bezeichnung, la?.lodas ?? '', la?.sbs ?? '',
      z.von ? fmt(z.von) : '', z.bis ? fmt(z.bis) : '', dez(z.tage), dez(z.stunden), dez(z.betrag), z.hinweis]
      .map((s) => csvFeld(nur1252(String(s)))).join(';');
  });
  return { dateiname: datei(m, 'Uebergabe', 'csv'), text: [kopf.join(';'), ...zeilenText].join(CRLF) + CRLF, probleme: [] };
}

// ---------------------------------------------------------------- gemeinsame Zuordnung

interface Buchung { z: Zeile; lohnart: string; wertart: Wertart; wert: number }

function buchungen(zeilen: Zeile[], k: Konfig, programm: 'lodas' | 'sbs', probleme: string[]): Buchung[] {
  const out: Buchung[] = [];
  for (const z of zeilen) {
    if (z.schluessel === 'info') continue;
    const la = k.lohnarten[z.schluessel];
    if (!la) {
      // Abwesenheiten ohne Lohnart sind normal (laufen nur als Fehlzeit)
      if (!k.fehlzeiten[z.schluessel]) probleme.push(`${z.name}: Für „${z.bezeichnung}“ (${z.schluessel}) ist keine Lohnart hinterlegt.`);
      continue;
    }
    if (la.nurStundenlohn && z.lohnform !== 'stundenlohn') continue;
    const wert = wertVon(z, la.wert);
    if (!wert) continue;
    const nr = la[programm];
    if (!nr) { probleme.push(`${z.name}: Für „${la.text}“ ist keine ${programm.toUpperCase()}-Lohnart hinterlegt.`); continue; }
    out.push({ z, lohnart: nr, wertart: la.wert, wert });
  }
  return out;
}

// ---------------------------------------------------------------- LODAS

/**
 * Aufbau nach DATEV-Schnittstellenhandbuch LODAS (LODAS_SSH.pdf):
 *   [Allgemein]        Kopf mit Berater- und Mandantennummer
 *   [Satzbeschreibung] Satzart;Tabelle;Feld#bereich;…
 *   [Bewegungsdaten]   u_lod_bwd_buchung_standard: Lohnart + Bearbeitungsschlüssel + Wert
 *   [Stammdaten]       u_lod_psd_fehlzeiten: taggenaue Fehlzeiten mit Ausfallschlüssel
 */
export function lodasAscii(m: Meldung, k: Konfig): Ausgabe {
  const probleme: string[] = [];
  const { zeilen, fehlzeiten } = erzeugeZeilen(m);
  const [j, mo] = m.kopf.monat.split('-');
  const zeitraum = `01.${mo}.${j}`;

  if (!k.lodas.beraterNr) probleme.push('Beraternummer fehlt in der Konfiguration (lodas.beraterNr).');
  if (!/^\d{1,5}$/.test(m.kopf.mandantNr)) probleme.push(`Mandantennummer „${m.kopf.mandantNr}“ ist für LODAS ungültig (1–5 Ziffern).`);
  for (const ma of m.mitarbeiter) if (!/^\d{1,5}$/.test(ma.persNr)) probleme.push(`${ma.name}: Personalnummer „${ma.persNr}“ ist für LODAS ungültig (1–5 Ziffern).`);
  const pnrOk = (p: string) => /^\d{1,5}$/.test(p);

  // Die Datei beginnt mit [Allgemein]; Kommentare erst, wenn das Kommentarzeichen deklariert ist.
  const zl: string[] = ['[Allgemein]', 'Version_SST=1.0'];
  if (k.lodas.versionDb) zl.push(`Version_DB=${k.lodas.versionDb}`);
  zl.push(`BeraterNr=${k.lodas.beraterNr}`, `MandantenNr=${m.kopf.mandantNr}`,
    'Feldtrennzeichen=;', 'Zahlenkomma=,', "Stringbegrenzer='", 'Kommentarkennzeichen=*');
  zl.push(`* Monatsmeldung ${m.kopf.firma} – ${mo}/${j} – erzeugt ${new Date().toLocaleString('de-DE')}`);
  if (!k.geprueft) zl.push('* ACHTUNG: Lohnarten-Zuordnung noch nicht geprüft (konfig: "geprueft": false). Vor dem Import abgleichen.');
  zl.push('');

  const bu = buchungen(zeilen, k, 'lodas', probleme).filter((b) => pnrOk(b.z.persNr));
  const fz = fehlzeiten.filter((f) => pnrOk(f.persNr)).map((f) => ({ f, schl: k.fehlzeiten[f.schluessel]?.lodas }));
  for (const x of fz) if (!x.schl) probleme.push(`${x.f.name}: Für Fehlzeit „${x.f.schluessel}“ ist kein LODAS-Ausfallschlüssel hinterlegt.`);

  zl.push('[Satzbeschreibung]',
    '1;u_lod_bwd_buchung_standard;abrechnung_zeitraum#bwd;bs_nr#bwd;bs_wert_butab#bwd;la_eigene#bwd;pnr#bwd;',
    '2;u_lod_psd_fehlzeiten;pnr#psd;datum_von_ttmmjjjj#psd;datum_bis_ttmmjjjj#psd;grund_fehlzeiten#psd;', '');

  zl.push('[Bewegungsdaten]');
  let letzte = '';
  for (const b of bu) {
    if (b.z.persNr !== letzte) { zl.push(`* ${b.z.persNr} ${b.z.name}`); letzte = b.z.persNr; }
    zl.push(`1;${zeitraum};${k.lodas.bs[b.wertart]};${dez(b.wert)};${b.lohnart};${b.z.persNr};`);
  }
  zl.push('');
  const mitSchl = fz.filter((x) => x.schl);
  if (mitSchl.length) {
    zl.push('[Stammdaten]');
    for (const { f, schl } of mitSchl) {
      const grund = /^\d+$/.test(schl!) ? schl : `'${schl!.replace(/'/g, '')}'`;
      zl.push(`* ${f.persNr} ${f.name}: ${k.fehlzeiten[f.schluessel].text}`);
      zl.push(`2;${f.persNr};${ttmmjjjj(f.von)};${ttmmjjjj(f.bis)};${grund};`);
    }
    zl.push('');
  }
  const ohne = zeilen.filter((z) => z.schluessel === 'info');
  if (ohne.length) {
    zl.push('* Hinweise ohne Buchung (siehe Hinweisliste):');
    for (const z of ohne) zl.push(`* ${z.persNr} ${z.name}: ${z.bezeichnung}${z.hinweis ? ' – ' + z.hinweis : ''}`.replace(/[\r\n]+/g, ' '));
  }
  return { dateiname: datei(m, 'LODAS', 'txt'), text: nur1252(zl.join(CRLF) + CRLF), probleme };
}

// ---------------------------------------------------------------- SBS Lohn

/**
 * SBS Lohn / SBS Lohn plus – Lohn Portal:
 *   ID 683 LP-Basis → ID 684 LP-Definition (Spalten dieser Datei einmalig zuordnen)
 *   → ID 686 LP-Import → ID 152 Übernahme in die Erfassung → ID 326 Kontrolle → ID 330 Brutto/Netto.
 * Eine Zeile je Buchung; Abwesenheiten zusätzlich mit Von/Bis und Arbeitstagen im Monat.
 */
export const SBS_SPALTEN = ['Firma', 'Personalnummer', 'Abrechnungsmonat', 'Lohnart', 'Stunden', 'Tage', 'Betrag', 'Von', 'Bis', 'Text'];

export function sbsCsv(m: Meldung, k: Konfig): Ausgabe {
  const probleme: string[] = [];
  const { zeilen, fehlzeiten } = erzeugeZeilen(m);
  const [j, mo] = m.kopf.monat.split('-');
  const monat = k.sbs.monatsformat === 'JJJJMM' ? `${j}${mo}` : `${mo}.${j}`;
  const firma = k.sbs.firmennummer || m.kopf.mandantNr;
  for (const ma of m.mitarbeiter) if (!/^\d{1,6}$/.test(ma.persNr)) probleme.push(`${ma.name}: Personalnummer „${ma.persNr}“ ist für SBS ungültig (1–6 Ziffern).`);

  const rows: string[][] = [];
  for (const b of buchungen(zeilen, k, 'sbs', probleme)) {
    rows.push([firma, b.z.persNr, monat, b.lohnart,
      b.wertart === 'stunden' ? dez(b.wert) : '', b.wertart === 'tage' ? dez(b.wert) : '', b.wertart === 'betrag' ? dez(b.wert) : '',
      b.z.von ? fmt(b.z.von) : '', b.z.bis ? fmt(b.z.bis) : '', b.z.bezeichnung]);
  }
  for (const f of fehlzeiten) {
    if (!schnittMitMonat(f.von, f.bis, m.kopf.monat)) continue; // Abschnitt liegt ganz in einem anderen Monat
    const la = k.fehlzeiten[f.schluessel]?.sbs;
    if (!la) { probleme.push(`${f.name}: Für Fehlzeit „${f.schluessel}“ ist keine SBS-Lohnart hinterlegt.`); continue; }
    rows.push([firma, f.persNr, monat, la, '', dez(f.arbeitstageImMonat) || '0,00', '', fmt(f.von), fmt(f.bis), k.fehlzeiten[f.schluessel].text]);
  }
  const text = [SBS_SPALTEN, ...rows].map((r) => r.map((s) => csvFeld(nur1252(s))).join(';')).join(CRLF) + CRLF;
  return { dateiname: datei(m, 'SBS', 'csv'), text, probleme };
}

export type { Fehlzeit };
