/**
 * Kalender: Datum als 'JJJJ-MM-TT'-String, Feiertage nach Bundesland und Region.
 *
 * Warum keine Bibliothek (feiertagejs / date-holidays)? Die landesweiten Feiertage sind
 * in 40 Zeilen exakt abbildbar, und die gemeindeabhängigen Fälle (Mariä Himmelfahrt in
 * Bayern, Fronleichnam in Sachsen/Thüringen) muss man auch mit Bibliothek selbst pflegen.
 * So bleibt die Demo ohne Laufzeit-Abhängigkeit.
 */
export type Datum = string;

export const LAENDER = {
  BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen',
  HH: 'Hamburg', HE: 'Hessen', MV: 'Mecklenburg-Vorpommern', NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz', SL: 'Saarland', SN: 'Sachsen',
  ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen',
} as const;
export type Land = keyof typeof LAENDER;

/** Regionale Feiertage, die vom Ort der Arbeitsstätte abhängen (§ 3b Abs. 2 S. 4 EStG). */
export const REGIONEN = {
  BY_MARIAE: { land: 'BY', text: 'Gemeinde mit Mariä Himmelfahrt (15.08.)', hilfe: 'Gilt in bayerischen Gemeinden mit überwiegend katholischer Bevölkerung – das sind die meisten. Liste beim Bayerischen Landesamt für Statistik.' },
  BY_AUGSBURG: { land: 'BY', text: 'Stadt Augsburg (Friedensfest 08.08.)', hilfe: 'Nur im Stadtgebiet Augsburg.' },
  SN_FRONLEICHNAM: { land: 'SN', text: 'Gemeinde mit Fronleichnam', hilfe: 'Einzelne Gemeinden im Landkreis Bautzen (sorbisches Siedlungsgebiet).' },
  TH_FRONLEICHNAM: { land: 'TH', text: 'Gemeinde mit Fronleichnam', hilfe: 'Landkreis Eichsfeld und einzelne Gemeinden im Unstrut-Hainich-Kreis und Wartburgkreis.' },
} as const;
export type Region = keyof typeof REGIONEN;

export const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export const WT_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export const p2 = (n: number): string => String(n).padStart(2, '0');

/** Normalisiert Überläufe (z. B. Monat 13, Tag 0). */
export function datum(j: number, m: number, t: number): Datum {
  const d = new Date(Date.UTC(j, m - 1, t));
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

export function teile(d: Datum): { j: number; m: number; t: number } {
  const [j, m, t] = d.split('-').map(Number);
  return { j, m, t };
}

export function istDatum(d: unknown): d is Datum {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const { j, m, t } = teile(d);
  return datum(j, m, t) === d;
}

export function plusTage(d: Datum, n: number): Datum {
  const { j, m, t } = teile(d);
  return datum(j, m, t + n);
}

/** 0 = Montag … 6 = Sonntag */
export function wochentag(d: Datum): number {
  const { j, m, t } = teile(d);
  return (new Date(Date.UTC(j, m - 1, t)).getUTCDay() + 6) % 7;
}

export const tageImMonat = (j: number, m: number): number => new Date(Date.UTC(j, m, 0)).getUTCDate();
export const monatsErster = (monat: string): Datum => `${monat}-01`;
export function monatsLetzter(monat: string): Datum {
  const [j, m] = monat.split('-').map(Number);
  return datum(j, m, tageImMonat(j, m));
}
export function monatPlus(monat: string, n: number): string {
  const [j, m] = monat.split('-').map(Number);
  return datum(j, m + n, 1).slice(0, 7);
}

/** Kalendertage inklusive Start und Ende. */
export function kalendertage(von: Datum, bis: Datum): number {
  const a = teile(von), b = teile(bis);
  return Math.round((Date.UTC(b.j, b.m - 1, b.t) - Date.UTC(a.j, a.m - 1, a.t)) / 864e5) + 1;
}

export function fmt(d: Datum | undefined, mitJahr = true): string {
  if (!istDatum(d)) return '–';
  const { j, m, t } = teile(d);
  return mitJahr ? `${p2(t)}.${p2(m)}.${j}` : `${p2(t)}.${p2(m)}.`;
}
export function monatsName(monat: string): string {
  const [j, m] = monat.split('-').map(Number);
  return `${MONATE[m - 1]} ${j}`;
}

/** Ostersonntag nach Gauß/Meeus. */
export function ostersonntag(j: number): Datum {
  const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return datum(j, monat, tag);
}

function berechneFeiertage(j: number, land: Land, regionen: readonly Region[]): Map<Datum, string> {
  const r = new Map<Datum, string>();
  const os = ostersonntag(j);
  const add = (d: Datum, name: string, nur?: Land[]) => { if (!nur || nur.includes(land)) r.set(d, name); };
  const reg = (x: Region) => regionen.includes(x) && REGIONEN[x].land === land;

  add(datum(j, 1, 1), 'Neujahr');
  add(datum(j, 1, 6), 'Heilige Drei Könige', ['BW', 'BY', 'ST']);
  add(datum(j, 3, 8), 'Internationaler Frauentag', ['BE', 'MV']);
  add(plusTage(os, -2), 'Karfreitag');
  // Ostersonntag/Pfingstsonntag sind nur in BB und HE gesetzliche Feiertage.
  // Wichtig für § 3b EStG: Feiertagszuschlag (125 %) statt Sonntagszuschlag (50 %).
  add(os, 'Ostersonntag', ['BB', 'HE']);
  add(plusTage(os, 1), 'Ostermontag');
  add(datum(j, 5, 1), 'Tag der Arbeit');
  add(plusTage(os, 39), 'Christi Himmelfahrt');
  add(plusTage(os, 49), 'Pfingstsonntag', ['BB', 'HE']);
  add(plusTage(os, 50), 'Pfingstmontag');
  add(plusTage(os, 60), 'Fronleichnam', ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']);
  if (reg('SN_FRONLEICHNAM') || reg('TH_FRONLEICHNAM')) r.set(plusTage(os, 60), 'Fronleichnam (regional)');
  if (reg('BY_AUGSBURG')) r.set(datum(j, 8, 8), 'Augsburger Friedensfest');
  add(datum(j, 8, 15), 'Mariä Himmelfahrt', ['SL']);
  if (reg('BY_MARIAE')) r.set(datum(j, 8, 15), 'Mariä Himmelfahrt (regional)');
  add(datum(j, 9, 20), 'Weltkindertag', ['TH']);
  add(datum(j, 10, 3), 'Tag der Deutschen Einheit');
  add(datum(j, 10, 31), 'Reformationstag', ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']);
  add(datum(j, 11, 1), 'Allerheiligen', ['BW', 'BY', 'NW', 'RP', 'SL']);
  if (land === 'SN') {
    // Buß- und Bettag: Mittwoch vor dem 23. November
    let d = datum(j, 11, 22);
    while (wochentag(d) !== 2) d = plusTage(d, -1);
    r.set(d, 'Buß- und Bettag');
  }
  add(datum(j, 12, 25), '1. Weihnachtstag');
  add(datum(j, 12, 26), '2. Weihnachtstag');
  return r;
}

const cache = new Map<string, Map<Datum, string>>();
export function feiertag(d: Datum, land: Land, regionen: readonly Region[] = []): string | undefined {
  const j = teile(d).j;
  const key = `${j}|${land}|${[...regionen].sort().join(',')}`;
  if (!cache.has(key)) cache.set(key, berechneFeiertage(j, land, regionen));
  return cache.get(key)!.get(d);
}

export function* tageVonBis(von: Datum, bis: Datum): Generator<Datum> {
  for (let d = von; d <= bis; d = plusTage(d, 1)) yield d;
}

/** Schnitt eines Zeitraums mit einem Monat. */
export function schnittMitMonat(von: Datum, bis: Datum, monat: string): [Datum, Datum] | null {
  const a = von > monatsErster(monat) ? von : monatsErster(monat);
  const b = bis < monatsLetzter(monat) ? bis : monatsLetzter(monat);
  return a <= b ? [a, b] : null;
}

export const ueberschneiden = (a1: Datum, a2: Datum, b1: Datum, b2: Datum): boolean => a1 <= b2 && b1 <= a2;

export interface Ort { land: Land; regionen: Region[] }

/** Arbeitstage der Person im Zeitraum (ohne Feiertage) und die Feiertage, die auf Arbeitstage fallen. */
export function arbeitstage(von: Datum, bis: Datum, woche: boolean[], ort: Ort): { tage: number; feiertage: Datum[] } {
  let tage = 0;
  const feiertage: Datum[] = [];
  for (const d of tageVonBis(von, bis)) {
    if (!woche[wochentag(d)]) continue;
    if (feiertag(d, ort.land, ort.regionen)) feiertage.push(d);
    else tage++;
  }
  return { tage, feiertage };
}
