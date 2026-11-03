/**
 * Datenmodell, Menü-Kategorien mit Fragen, Berechnungen und Plausibilitätsprüfungen.
 * Keine DOM-Abhängigkeit: alles hier ist in Node testbar.
 */
import {
  Datum, Land, Region, Ort, istDatum, plusTage, wochentag, kalendertage, fmt, monatsErster, monatsLetzter,
  schnittMitMonat, tageVonBis, feiertag, arbeitstage, ueberschneiden, teile,
} from './kalender';
import { GRENZEN, jahreswerte } from './parameter';

// ---------------------------------------------------------------- Modell

export type Beschaeftigung = 'vollzeit' | 'teilzeit' | 'minijob' | 'werkstudent' | 'azubi';
export type Lohnform = 'gehalt' | 'stundenlohn';

export interface Mitarbeiter {
  id: string;
  persNr: string;
  name: string;
  beschaeftigung: Beschaeftigung;
  lohnform: Lohnform;
  gehalt?: number;
  stundenlohn?: number;
  wochenstunden: number;
  /** Mo … So */
  arbeitstage: boolean[];
  eintritt?: Datum;
  beispiel?: boolean;
}

export interface Kopf {
  mandantNr: string;
  firma: string;
  ansprechpartner: string;
  /** 'JJJJ-MM' */
  monat: string;
  land: Land;
  /** Regionale Feiertage am Ort der Arbeitsstätte */
  regionen: Region[];
}

export type Werte = Record<string, string>;
export interface Eintrag { id: string; maId: string; typ: Typ; w: Werte }

export interface Meldung {
  kopf: Kopf;
  mitarbeiter: Mitarbeiter[];
  eintraege: Eintrag[];
  erledigt: Record<string, boolean>;
  hinweiseGelesen: boolean;
  nachricht: string;
}

export interface Kontext { kopf: Kopf; ma: Mitarbeiter; eintraege: Eintrag[] }
export type Stufe = 'fehler' | 'warnung' | 'info';
export interface Befund { stufe: Stufe; text: string; feld?: string }

export const BESCHAEFTIGUNG: Record<Beschaeftigung, string> = {
  vollzeit: 'Vollzeit', teilzeit: 'Teilzeit', minijob: 'Minijob', werkstudent: 'Werkstudent/in', azubi: 'Auszubildende/r',
};

export const ort = (k: Kopf): Ort => ({ land: k.land, regionen: k.regionen ?? [] });
export const kontext = (m: Meldung, ma: Mitarbeiter): Kontext => ({ kopf: m.kopf, ma, eintraege: m.eintraege });

/** Tagessoll in Stunden: Wochenstunden ÷ Zahl der Arbeitstage */
export function stundenJeTag(ma: Mitarbeiter): number {
  const n = ma.arbeitstage.filter(Boolean).length || 5;
  return Math.round((ma.wochenstunden / n) * 100) / 100;
}

/** Deutsche Zahl lesen: "1.234,5" → 1234.5; leer → undefined; ungültig → NaN */
export function zahl(s: string | undefined | null): number | undefined {
  if (s == null || s.trim() === '') return undefined;
  const t = s.trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
const z0 = (s: string | undefined): number => { const n = zahl(s); return n && !Number.isNaN(n) ? n : 0; };

export const euro = (n: number): string => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
export const std = (n: number): string => n.toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' Std.';
const r2 = (n: number): number => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- Kategorien

export type Typ =
  | 'arbeitszeit' | 'ueberstunden' | 'zuschlaege'
  | 'urlaub' | 'krank' | 'kindkrank' | 'unbezahlt' | 'mutterschutz'
  | 'einmalzahlung' | 'sachbezug' | 'vorschuss'
  | 'austritt' | 'sonstiges';

export type Gruppe = 'zeit' | 'abwesend' | 'geld' | 'sonst';
export type Feldart = 'stunden' | 'betrag' | 'zahl' | 'auswahl' | 'zeitraum' | 'datum' | 'text';
export interface Option { wert: string; text: string; hilfe?: string }
export interface Feld {
  key: string;
  art: Feldart;
  frage: string;
  hilfe?: string;
  pflicht?: boolean;
  optionen?: Option[];
  zeigeWenn?: (w: Werte, k: Kontext) => boolean;
}
export interface Kategorie {
  typ: Typ;
  titel: string;
  gruppe: Gruppe;
  symbol: string;
  kurz: string;
  felder: Feld[];
  zeitraum?: boolean;
  einmalig?: boolean;
  nurStundenlohn?: boolean;
}

export const GRUPPEN: [Gruppe, string][] = [
  ['zeit', 'Arbeitszeit'], ['abwesend', 'Abwesenheit'], ['geld', 'Geld & Extras'], ['sonst', 'Sonstiges'],
];

const JA_NEIN: Option[] = [{ wert: 'ja', text: 'Ja' }, { wert: 'nein', text: 'Nein' }];
const WEISS_NICHT: Option = { wert: 'unbekannt', text: 'Weiß ich nicht' };

export const SYMBOL = {
  uhr: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3.5 2',
  plus: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5v8m-4-4h8',
  sonne: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  krank: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  kind: 'M12 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6 21v-3a6 6 0 0 1 12 0v3',
  pause: 'M5 5h14v14H5zM10 9v6m4-6v6',
  mond: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
  geld: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM6 10v4m12-4v4',
  geschenk: 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-1.5-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3.5-2-5 1',
  pfeil: 'M4 12h12m-4-5 5 5-5 5M20 4v16',
  baby: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-5 18c0-3 2.2-6 5-6s5 3 5 6',
  tuer: 'M5 21V3h10v18M15 3l4 2v16l-4-2M11 12h.01',
  sprech: 'M4 5h16v11H9l-5 4z',
};

const monatNr = (k: Kontext): number => teile(monatsErster(k.kopf.monat)).m;

export const KATEGORIEN: Kategorie[] = [
  {
    typ: 'arbeitszeit', titel: 'Gearbeitete Stunden', gruppe: 'zeit', symbol: SYMBOL.uhr, nurStundenlohn: true, einmalig: true,
    kurz: 'Wie viele Stunden hat die Person in diesem Monat gearbeitet?',
    felder: [{ key: 'stunden', art: 'stunden', pflicht: true, frage: 'Wie viele Stunden wurden insgesamt gearbeitet?', hilfe: 'Nur tatsächlich gearbeitete Stunden. Urlaub, Krankheit und Feiertage tragen Sie nicht hier ein – die rechnen wir getrennt.' }],
  },
  {
    typ: 'ueberstunden', titel: 'Überstunden', gruppe: 'zeit', symbol: SYMBOL.plus,
    kurz: 'Es wurde mehr gearbeitet als vereinbart.',
    felder: [
      { key: 'stunden', art: 'stunden', pflicht: true, frage: 'Wie viele Überstunden sind angefallen?' },
      { key: 'verwendung', art: 'auswahl', pflicht: true, frage: 'Was soll mit den Überstunden passieren?', optionen: [
        { wert: 'auszahlen', text: 'Mit diesem Lohn auszahlen' },
        { wert: 'zeitkonto', text: 'Auf das Zeitkonto buchen', hilfe: 'Wird später mit Freizeit ausgeglichen.' },
      ] },
      { key: 'zuschlag', art: 'zahl', frage: 'Gibt es einen Überstundenzuschlag? Wenn ja, wie viel Prozent?', hilfe: 'Steht meist im Arbeits- oder Tarifvertrag. Kein Zuschlag: 0 eintragen.', zeigeWenn: (w) => w.verwendung === 'auszahlen' },
    ],
  },
  {
    typ: 'zuschlaege', titel: 'Nacht-, Sonntags- oder Feiertagsarbeit', gruppe: 'zeit', symbol: SYMBOL.mond,
    kurz: 'Es wurde nachts, sonntags oder an Feiertagen gearbeitet.',
    felder: [
      { key: 'nacht', art: 'stunden', frage: 'Stunden zwischen 20 und 6 Uhr', hilfe: 'Keine: einfach leer lassen.' },
      { key: 'nacht_0_4', art: 'stunden', frage: 'Davon zwischen 0 und 4 Uhr – nur wenn die Schicht schon vor Mitternacht begonnen hat', hilfe: 'Für diese Stunden gilt ein höherer steuerfreier Zuschlag (40 % statt 25 %). Wenn Sie es nicht wissen: leer lassen.', zeigeWenn: (w) => z0(w.nacht) > 0 },
      { key: 'sonntag', art: 'stunden', frage: 'Stunden an Sonntagen' },
      { key: 'feiertag', art: 'stunden', frage: 'Stunden an Feiertagen', hilfe: 'Auch Silvester ab 14 Uhr und Heiligabend ab 14 Uhr zählen hier mit.' },
      { key: 'feiertag_150', art: 'stunden', frage: 'Davon am 24.12. ab 14 Uhr, am 25./26.12. oder am 1. Mai', hilfe: 'Für diese Tage gilt ein höherer steuerfreier Zuschlag (150 % statt 125 %).', zeigeWenn: (w, k) => z0(w.feiertag) > 0 && [5, 12].includes(monatNr(k)) },
    ],
  },
  {
    typ: 'urlaub', titel: 'Urlaub', gruppe: 'abwesend', symbol: SYMBOL.sonne, zeitraum: true,
    kurz: 'Bezahlter Erholungsurlaub.',
    felder: [
      { key: 'zeitraum', art: 'zeitraum', pflicht: true, frage: 'Von wann bis wann war Urlaub?', hilfe: 'Wählen Sie den ersten und den letzten Urlaubstag. Wochenenden und Feiertage werden automatisch nicht mitgezählt.' },
      { key: 'halbtage', art: 'zahl', frage: 'Waren halbe Urlaubstage dabei? Wenn ja, wie viele?', hilfe: 'Zum Beispiel Heiligabend als halber Tag. Keine halben Tage: einfach weiter.' },
    ],
  },
  {
    typ: 'krank', titel: 'Krankheit', gruppe: 'abwesend', symbol: SYMBOL.krank, zeitraum: true,
    kurz: 'Die Person war arbeitsunfähig krank.',
    felder: [
      { key: 'zeitraum', art: 'zeitraum', pflicht: true, frage: 'Von wann bis wann war die Person krank?', hilfe: 'Wenn die Krankheit noch andauert, wählen Sie als Ende den letzten bekannten Tag laut Krankmeldung. Bitte keine Diagnose angeben – die brauchen wir nicht.' },
      { key: 'au', art: 'auswahl', pflicht: true, frage: 'Gibt es eine Krankmeldung vom Arzt?', hilfe: 'Bei gesetzlich Versicherten läuft die Krankmeldung elektronisch (eAU). Wir rufen sie bei der Krankenkasse ab. Privat Versicherte müssen die Papier-Bescheinigung abgeben.', optionen: [
        { wert: 'ja', text: 'Ja, die Person war beim Arzt' }, { wert: 'nein', text: 'Nein, ohne Arzt' }, WEISS_NICHT,
      ] },
      { key: 'unfall', art: 'auswahl', pflicht: true, frage: 'War es ein Arbeits- oder Wegeunfall?', optionen: JA_NEIN },
      { key: 'vorher', art: 'auswahl', frage: 'War die Person in den letzten 6 Monaten schon einmal wegen derselben Krankheit krank?', hilfe: 'Wichtig für die 6-Wochen-Frist der Lohnfortzahlung. Wenn Sie es nicht wissen, wählen Sie „Weiß ich nicht“.', optionen: [...JA_NEIN, WEISS_NICHT] },
      { key: 'vorher_wann', art: 'text', frage: 'Wann war das ungefähr?', hilfe: 'Zum Beispiel „10.–21. März“. Wir prüfen dann, ob die Lohnfortzahlung schon verbraucht ist.', zeigeWenn: (w) => w.vorher === 'ja' },
    ],
  },
  {
    typ: 'kindkrank', titel: 'Kind krank', gruppe: 'abwesend', symbol: SYMBOL.kind, zeitraum: true,
    kurz: 'Die Person hat ein krankes Kind betreut.',
    felder: [
      { key: 'zeitraum', art: 'zeitraum', pflicht: true, frage: 'Von wann bis wann wurde das Kind betreut?' },
      { key: 'alter', art: 'auswahl', pflicht: true, frage: 'Ist das Kind jünger als 12 Jahre?', optionen: [...JA_NEIN, { wert: 'behindert', text: 'Nein, aber das Kind hat eine Behinderung und braucht Hilfe' }] },
      { key: 'bescheinigung', art: 'auswahl', pflicht: true, frage: 'Gibt es eine Bescheinigung vom Kinderarzt?', optionen: JA_NEIN },
      { key: 'bezahlt', art: 'auswahl', pflicht: true, frage: 'Zahlen Sie den Lohn für diese Tage weiter?', hilfe: 'Meist nicht – dann zahlt die Krankenkasse Kinderkrankengeld. Steht im Arbeitsvertrag nichts dazu, kann ein Anspruch auf Weiterzahlung für wenige Tage bestehen (§ 616 BGB).', optionen: [
        { wert: 'nein', text: 'Nein, unbezahlt (Kinderkrankengeld)' }, { wert: 'ja', text: 'Ja, Lohn läuft weiter' }, WEISS_NICHT,
      ] },
    ],
  },
  {
    typ: 'unbezahlt', titel: 'Unbezahlt frei', gruppe: 'abwesend', symbol: SYMBOL.pause, zeitraum: true,
    kurz: 'Die Person hatte frei, ohne Lohn.',
    felder: [
      { key: 'zeitraum', art: 'zeitraum', pflicht: true, frage: 'Von wann bis wann war die Person unbezahlt frei?' },
      { key: 'grund', art: 'text', frage: 'Warum? (optional)', hilfe: 'Zum Beispiel Sonderurlaub, unentschuldigtes Fehlen.' },
    ],
  },
  {
    typ: 'mutterschutz', titel: 'Mutterschutz / Elternzeit', gruppe: 'abwesend', symbol: SYMBOL.baby, zeitraum: true,
    kurz: 'Schwangerschaft, Mutterschutz oder Elternzeit.',
    felder: [
      { key: 'art', art: 'auswahl', pflicht: true, frage: 'Worum geht es?', optionen: [
        { wert: 'beschaeftigungsverbot', text: 'Beschäftigungsverbot vom Arzt' },
        { wert: 'mutterschutz', text: 'Mutterschutz (vor/nach der Geburt)' },
        { wert: 'elternzeit', text: 'Elternzeit' },
      ] },
      { key: 'geburt', art: 'datum', frage: 'Voraussichtlicher oder tatsächlicher Geburtstermin', hilfe: 'Steht im Mutterpass bzw. in der Geburtsurkunde. Daraus berechnen wir die Schutzfristen.', zeigeWenn: (w) => w.art === 'mutterschutz', pflicht: true },
      { key: 'verlaengert', art: 'auswahl', frage: 'Frühgeburt, Mehrlinge oder Behinderung des Kindes?', hilfe: 'Dann verlängert sich die Schutzfrist nach der Geburt auf 12 Wochen.', zeigeWenn: (w) => w.art === 'mutterschutz', optionen: [...JA_NEIN, WEISS_NICHT] },
      { key: 'zeitraum', art: 'zeitraum', pflicht: true, frage: 'Von wann bis wann?', hilfe: 'Wenn das Ende noch nicht feststeht, wählen Sie den Monatsletzten.' },
    ],
  },
  {
    typ: 'einmalzahlung', titel: 'Prämie oder Sonderzahlung', gruppe: 'geld', symbol: SYMBOL.geld,
    kurz: 'Bonus, Weihnachtsgeld, Urlaubsgeld oder eine andere Extrazahlung.',
    felder: [
      { key: 'art', art: 'auswahl', pflicht: true, frage: 'Was für eine Zahlung ist es?', optionen: [
        { wert: 'praemie', text: 'Prämie / Bonus' }, { wert: 'weihnachtsgeld', text: 'Weihnachtsgeld' },
        { wert: 'urlaubsgeld', text: 'Urlaubsgeld' }, { wert: 'jubilaeum', text: 'Jubiläumszahlung' }, { wert: 'sonstige', text: 'Etwas anderes' },
      ] },
      { key: 'betrag', art: 'betrag', pflicht: true, frage: 'Wie hoch ist der Betrag (brutto)?', hilfe: 'Brutto heißt: vor Abzug von Steuern und Sozialversicherung.' },
      { key: 'wiederkehrend', art: 'auswahl', frage: 'Gibt es diese Zahlung jedes Jahr?', optionen: JA_NEIN, zeigeWenn: (_w, k) => k.ma.beschaeftigung === 'minijob' },
    ],
  },
  {
    typ: 'sachbezug', titel: 'Gutschein oder Geschenk', gruppe: 'geld', symbol: SYMBOL.geschenk,
    kurz: 'Tankgutschein, Einkaufskarte, Geburtstagsgeschenk.',
    felder: [
      { key: 'art', art: 'auswahl', pflicht: true, frage: 'Was hat die Person bekommen?', optionen: [
        { wert: 'gutschein', text: 'Gutschein / Guthabenkarte', hilfe: 'z. B. Tankgutschein, Einkaufskarte' },
        { wert: 'geschenk', text: 'Geschenk zu einem persönlichen Anlass', hilfe: 'z. B. Geburtstag, Hochzeit, Geburt eines Kindes' },
        { wert: 'sonstige', text: 'Etwas anderes' },
      ] },
      { key: 'form', art: 'auswahl', pflicht: true, frage: 'War es eine Sache (z. B. Blumen, Buch, Gutschein) oder Bargeld/Überweisung?', zeigeWenn: (w) => w.art === 'geschenk', optionen: [
        { wert: 'sache', text: 'Eine Sache oder ein Gutschein' }, { wert: 'geld', text: 'Bargeld oder Überweisung' },
      ] },
      { key: 'betrag', art: 'betrag', pflicht: true, frage: 'Welchen Wert hatte es (inkl. MwSt.)?' },
    ],
  },
  {
    typ: 'vorschuss', titel: 'Vorschuss bereits gezahlt', gruppe: 'geld', symbol: SYMBOL.pfeil,
    kurz: 'Sie haben schon Geld vorab überwiesen.',
    felder: [
      { key: 'betrag', art: 'betrag', pflicht: true, frage: 'Wie viel wurde vorab ausgezahlt?', hilfe: 'Der Betrag wird vom Auszahlungsbetrag abgezogen.' },
      { key: 'datum', art: 'datum', pflicht: true, frage: 'Wann wurde gezahlt?' },
    ],
  },
  {
    typ: 'austritt', titel: 'Person hört auf', gruppe: 'sonst', symbol: SYMBOL.tuer, einmalig: true,
    kurz: 'Kündigung, Aufhebungsvertrag oder Vertragsende.',
    felder: [
      { key: 'datum', art: 'datum', pflicht: true, frage: 'Was ist der letzte Tag laut Vertrag?', hilfe: 'Das rechtliche Ende des Arbeitsverhältnisses, nicht der letzte Tag im Büro.' },
      { key: 'grund', art: 'auswahl', pflicht: true, frage: 'Wie endet das Arbeitsverhältnis?', optionen: [
        { wert: 'an', text: 'Die Person hat gekündigt' }, { wert: 'ag', text: 'Wir haben gekündigt' },
        { wert: 'aufhebung', text: 'Aufhebungsvertrag' }, { wert: 'befristung', text: 'Befristung läuft aus' },
      ] },
      { key: 'resturlaub', art: 'zahl', frage: 'Wie viele Urlaubstage sind noch offen und sollen ausgezahlt werden?', hilfe: 'Keine: 0 eintragen.' },
    ],
  },
  {
    typ: 'sonstiges', titel: 'Etwas anderes', gruppe: 'sonst', symbol: SYMBOL.sprech,
    kurz: 'Passt nichts? Schreiben Sie uns, was los war.',
    felder: [{ key: 'text', art: 'text', pflicht: true, frage: 'Was sollen wir wissen?' }],
  },
];

export const kat = (typ: Typ): Kategorie => KATEGORIEN.find((k) => k.typ === typ)!;
export const optionText = (typ: Typ, feld: string, wert: string | undefined): string =>
  kat(typ).felder.find((f) => f.key === feld)?.optionen?.find((o) => o.wert === wert)?.text ?? (wert || '');

export function sichtbareFelder(k: Kategorie, w: Werte, ctx: Kontext): Feld[] {
  return k.felder.filter((f) => !f.zeigeWenn || f.zeigeWenn(w, ctx));
}

// ---------------------------------------------------------------- Berechnungen

/** Vereinbarte Stunden im Monat (Arbeitstage inkl. Feiertage × Tagessoll) */
export function sollStunden(k: Kontext): number {
  const { tage, feiertage } = arbeitstage(monatsErster(k.kopf.monat), monatsLetzter(k.kopf.monat), k.ma.arbeitstage, ort(k.kopf));
  return r2((tage + feiertage.length) * stundenJeTag(k.ma));
}

export interface Zeitraumwerte {
  /** Arbeitstage im Abrechnungsmonat (Urlaub: abzüglich halber Tage) */
  tage: number;
  stunden: number;
  /** davon mit Lohn (Krank: nur innerhalb der 6 Wochen und nach der Wartezeit) */
  tageBezahlt: number;
  stundenBezahlt: number;
  kalendertage: number;
  feiertage: Datum[];
  /** Zeitraum reicht über den Monat hinaus */
  ausserhalb: boolean;
}

export function bezahlteArt(e: Eintrag): boolean {
  return e.typ === 'urlaub' || e.typ === 'krank' || (e.typ === 'kindkrank' && e.w.bezahlt === 'ja');
}

export function zeitraumwerte(e: Eintrag, k: Kontext): Zeitraumwerte | null {
  const von = e.w.zeitraum_von, bis = e.w.zeitraum_bis;
  if (!istDatum(von) || !istDatum(bis) || bis < von) return null;
  const kt = kalendertage(von, bis);
  const s = schnittMitMonat(von, bis, k.kopf.monat);
  if (!s) return { tage: 0, stunden: 0, tageBezahlt: 0, stundenBezahlt: 0, kalendertage: kt, feiertage: [], ausserhalb: true };
  const { tage, feiertage } = arbeitstage(s[0], s[1], k.ma.arbeitstage, ort(k.kopf));
  let t = tage;
  if (e.typ === 'urlaub') t -= z0(e.w.halbtage) / 2;

  let bezahlt = bezahlteArt(e) ? t : 0;
  if (e.typ === 'krank') {
    // Entgeltfortzahlung: nur bis zum 42. Kalendertag dieses Eintrags und erst nach 4 Wochen Beschäftigung.
    const efzEnde = plusTage(von, GRENZEN.efzKalendertage - 1);
    const wartezeitEnde = k.ma.eintritt ? plusTage(k.ma.eintritt, GRENZEN.wartezeitTage - 1) : undefined;
    bezahlt = 0;
    for (const d of tageVonBis(s[0], s[1])) {
      if (!k.ma.arbeitstage[wochentag(d)] || feiertag(d, k.kopf.land, k.kopf.regionen)) continue;
      if (d > efzEnde) continue;
      if (wartezeitEnde && d <= wartezeitEnde) continue;
      bezahlt++;
    }
  }
  const sjt = stundenJeTag(k.ma);
  return {
    tage: t, stunden: r2(t * sjt), tageBezahlt: bezahlt, stundenBezahlt: r2(bezahlt * sjt),
    kalendertage: kt, feiertage, ausserhalb: s[0] !== von || s[1] !== bis,
  };
}

/** Feiertage, die bei Stundenlohn bezahlt werden (§ 2 EFZG) – nicht bei unbezahlten Zeiten. */
export function feiertagsverguetung(k: Kontext): { tage: Datum[]; stunden: number } {
  const ohneLohn = k.eintraege.filter((e) => e.maId === k.ma.id &&
    (e.typ === 'unbezahlt' || e.typ === 'mutterschutz' || (e.typ === 'kindkrank' && e.w.bezahlt !== 'ja')));
  const austritt = k.eintraege.find((e) => e.maId === k.ma.id && e.typ === 'austritt')?.w.datum;
  const tage: Datum[] = [];
  for (const d of tageVonBis(monatsErster(k.kopf.monat), monatsLetzter(k.kopf.monat))) {
    if (!k.ma.arbeitstage[wochentag(d)] || !feiertag(d, k.kopf.land, k.kopf.regionen)) continue;
    if (k.ma.eintritt && d < k.ma.eintritt) continue;
    if (austritt && d > austritt) continue;
    if (ohneLohn.some((e) => istDatum(e.w.zeitraum_von) && istDatum(e.w.zeitraum_bis) && d >= e.w.zeitraum_von && d <= e.w.zeitraum_bis)) continue;
    tage.push(d);
  }
  return { tage, stunden: r2(tage.length * stundenJeTag(k.ma)) };
}

/** Bezahlte Abwesenheitsstunden (Urlaub, Krank mit EFZ, Kind krank bezahlt) */
export function bezahlteAbwesenheit(m: Meldung, ma: Mitarbeiter): number {
  const k = kontext(m, ma);
  return r2(m.eintraege.filter((e) => e.maId === ma.id && bezahlteArt(e))
    .reduce((s, e) => s + (zeitraumwerte(e, k)?.stundenBezahlt || 0), 0));
}

export function stundensatz(ma: Mitarbeiter): number {
  return ma.lohnform === 'stundenlohn' ? ma.stundenlohn || 0 : (ma.gehalt || 0) / ((ma.wochenstunden * 13) / 3 || 1);
}

/** Geschätzter Monatsverdienst (für Minijob-Grenze). Steuerfreie Sachbezüge zählen nicht. */
export function verdienst(m: Meldung, ma: Mitarbeiter): number {
  const k = kontext(m, ma);
  const eigene = m.eintraege.filter((e) => e.maId === ma.id);
  let n = ma.lohnform === 'gehalt'
    ? ma.gehalt || 0
    : (z0(eigene.find((e) => e.typ === 'arbeitszeit')?.w.stunden) + bezahlteAbwesenheit(m, ma) + feiertagsverguetung(k).stunden) * (ma.stundenlohn || 0);
  for (const e of eigene) {
    if (e.typ === 'einmalzahlung') n += z0(e.w.betrag);
    if (e.typ === 'ueberstunden' && e.w.verwendung === 'auszahlen') n += z0(e.w.stunden) * stundensatz(ma) * (1 + z0(e.w.zuschlag) / 100);
  }
  return r2(n);
}

/** Summe der Gutscheine/Sachbezüge im Monat, die unter die 50-€-Freigrenze fallen */
export function sachbezugSumme(m: Meldung, ma: Mitarbeiter): number {
  return r2(m.eintraege.filter((e) => e.maId === ma.id && e.typ === 'sachbezug' && e.w.art !== 'geschenk')
    .reduce((s, e) => s + z0(e.w.betrag), 0));
}

/** Mutterschutzfristen aus dem Geburtstermin (§ 3 MuSchG) */
export function mutterschutzfristen(geburt: Datum, verlaengert: boolean): { von: Datum; bis: Datum } {
  return {
    von: plusTage(geburt, -GRENZEN.mutterschutzVorher),
    bis: plusTage(geburt, verlaengert ? GRENZEN.mutterschutzNachherVerlaengert : GRENZEN.mutterschutzNachher),
  };
}

// ---------------------------------------------------------------- Prüfungen

/** Prüft ein einzelnes Feld (Pflicht, Format, Zeitraum im Monat). */
export function pruefeFeld(f: Feld, w: Werte, k: Kontext): Befund[] {
  const out: Befund[] = [];
  const b = (stufe: Stufe, text: string) => out.push({ stufe, text, feld: f.key });
  const monat = k.kopf.monat;

  if (f.art === 'zeitraum') {
    const von = w[`${f.key}_von`], bis = w[`${f.key}_bis`];
    if (!von && !bis) { if (f.pflicht) b('fehler', 'Bitte wählen Sie den ersten und den letzten Tag.'); return out; }
    if (!istDatum(von)) { b('fehler', 'Der erste Tag fehlt oder ist kein gültiges Datum.'); return out; }
    if (!istDatum(bis)) { b('fehler', 'Der letzte Tag fehlt oder ist kein gültiges Datum.'); return out; }
    if (bis < von) { b('fehler', 'Der letzte Tag liegt vor dem ersten Tag.'); return out; }
    if (!schnittMitMonat(von, bis, monat)) b('fehler', 'Der Zeitraum liegt komplett außerhalb des Abrechnungsmonats. Bitte im richtigen Monat melden.');
    else if (von < monatsErster(monat) || bis > monatsLetzter(monat)) b('info', 'Der Zeitraum reicht über den Monat hinaus. Abgerechnet werden nur die Tage in diesem Monat; den Rest übernehmen wir in den Folgemonat.');
    if (k.ma.eintritt && von < k.ma.eintritt) b('fehler', `Der Zeitraum beginnt vor dem Eintritt am ${fmt(k.ma.eintritt)}.`);
    return out;
  }
  const v = w[f.key];
  if (v == null || v.trim() === '') {
    if (f.pflicht) b('fehler', f.art === 'auswahl' ? 'Bitte wählen Sie eine Antwort.' : 'Bitte füllen Sie dieses Feld aus.');
    return out;
  }
  if (f.art === 'stunden' || f.art === 'betrag' || f.art === 'zahl') {
    const n = zahl(v)!;
    if (Number.isNaN(n)) { b('fehler', 'Bitte nur eine Zahl eingeben, z. B. 12,5.'); return out; }
    if (n < 0) { b('fehler', 'Negative Werte sind nicht möglich.'); return out; }
    if (f.pflicht && n === 0) b('fehler', 'Der Wert ist 0. Wenn nichts angefallen ist, brechen Sie diesen Eintrag einfach ab.');
    if ((f.art === 'stunden' || f.art === 'betrag') && Math.round(n * 100) !== n * 100) b('fehler', 'Höchstens zwei Nachkommastellen, z. B. 7,75.');
    if (f.art === 'stunden' && n > 300) b('fehler', 'Mehr als 300 Stunden in einem Monat sind nicht möglich. Tippfehler?');
    if (f.art === 'betrag' && n > 50000) b('warnung', 'Sehr hoher Betrag. Bitte prüfen Sie die Eingabe.');
  }
  if (f.art === 'datum' && !istDatum(v)) b('fehler', 'Bitte ein gültiges Datum wählen.');
  return out;
}

/** Prüft einen Eintrag fachlich. */
export function pruefeEintrag(e: Eintrag, k: Kontext, m?: Meldung): Befund[] {
  const kategorie = kat(e.typ);
  const out: Befund[] = [];
  for (const f of sichtbareFelder(kategorie, e.w, k)) out.push(...pruefeFeld(f, e.w, k));
  if (out.some((b) => b.stufe === 'fehler')) return out;

  const b = (stufe: Stufe, text: string) => out.push({ stufe, text });
  const ma = k.ma, monat = k.kopf.monat;
  const jw = jahreswerte(monat).werte;
  const zr = kategorie.zeitraum ? zeitraumwerte(e, k) : null;
  const n = (key: string) => z0(e.w[key]);

  switch (e.typ) {
    case 'arbeitszeit': {
      const soll = sollStunden(k), h = n('stunden');
      const at = arbeitstage(monatsErster(monat), monatsLetzter(monat), ma.arbeitstage, ort(k.kopf)).tage;
      if (at > 0 && h / at > GRENZEN.maxTagesstunden) b('warnung', `Das sind im Schnitt ${std(h / at)} je Arbeitstag. Erlaubt sind höchstens 10 Stunden am Tag (§ 3 Arbeitszeitgesetz).`);
      if (soll > 0 && h > soll * 1.5) b('warnung', `Deutlich mehr als vereinbart (etwa ${std(soll)} im Monat). Stimmt die Zahl?`);
      if (soll > 0 && h < soll * 0.3 && ma.beschaeftigung !== 'minijob') b('info', `Deutlich weniger als vereinbart (etwa ${std(soll)} im Monat). Gab es Urlaub oder Krankheit? Dann bitte zusätzlich eintragen.`);
      break;
    }
    case 'ueberstunden':
      if (ma.lohnform === 'stundenlohn') b('info', 'Bei Stundenlohn sind Überstunden meist schon in den gearbeiteten Stunden enthalten. Tragen Sie sie hier nur ein, wenn sie zusätzlich bezahlt werden.');
      if (e.w.verwendung === 'auszahlen' && n('zuschlag') > 100) b('warnung', 'Ein Zuschlag über 100 % ist ungewöhnlich. Bitte prüfen.');
      break;
    case 'urlaub':
      if (zr && zr.tage <= 0 && !zr.ausserhalb) b('fehler', 'In diesem Zeitraum liegt kein Arbeitstag der Person (nur Wochenende oder Feiertage). Bitte Zeitraum prüfen.');
      if (zr && zr.feiertage.length) b('info', `${zr.feiertage.length} Feiertag(e) im Zeitraum zählen nicht als Urlaubstag.`);
      if (n('halbtage') && zr && n('halbtage') > (zr.tage + n('halbtage') / 2) * 2) b('fehler', 'Mehr halbe Tage als Urlaubstage im Zeitraum.');
      if (zr && zr.tage > 25) b('warnung', 'Mehr als 25 Urlaubstage am Stück. Bitte prüfen.');
      break;
    case 'krank': {
      if (!zr) break;
      if (zr.kalendertage > GRENZEN.efzKalendertage) b('warnung', `Die Krankheit dauert ${zr.kalendertage} Kalendertage. Nach 6 Wochen endet die Lohnfortzahlung, danach zahlt die Krankenkasse Krankengeld. Wir kümmern uns um die Meldung.`);
      if (e.w.vorher === 'ja') b('warnung', 'Gleiche Krankheit innerhalb von 6 Monaten (Fortsetzungserkrankung): Die früheren Tage werden auf die 6 Wochen angerechnet (§ 3 Abs. 1 EFZG). Wir prüfen das.');
      if (zr.kalendertage > 3 && e.w.au === 'nein') b('warnung', 'Ab dem 4. Krankheitstag ist eine ärztliche Krankmeldung nötig (§ 5 EFZG). Ohne Krankmeldung kann die Lohnfortzahlung entfallen.');
      if (e.w.au === 'unbekannt') b('info', 'Kein Problem: Wir fragen die elektronische Krankmeldung bei der Krankenkasse ab.');
      if (e.w.unfall === 'ja') b('warnung', 'Arbeitsunfall: Dauert die Arbeitsunfähigkeit länger als 3 Tage, muss die Unfallanzeige innerhalb von 3 Tagen an die Berufsgenossenschaft (§ 193 SGB VII).');
      if (ma.eintritt && istDatum(e.w.zeitraum_von) && kalendertage(ma.eintritt, e.w.zeitraum_von) <= GRENZEN.wartezeitTage) b('warnung', 'Die Person ist noch keine 4 Wochen im Betrieb. In dieser Zeit besteht kein Anspruch auf Lohnfortzahlung (§ 3 Abs. 3 EFZG), die Krankenkasse zahlt Krankengeld.');
      if (zr.tage === 0 && !zr.ausserhalb) b('info', 'Im Zeitraum liegt kein Arbeitstag der Person. Es fällt keine Lohnfortzahlung an.');
      break;
    }
    case 'kindkrank':
      if (e.w.alter === 'nein') b('warnung', 'Für Kinder ab 12 Jahren (ohne Behinderung) gibt es kein Kinderkrankengeld. Die Tage sind dann unbezahlt frei.');
      if (e.w.bescheinigung === 'nein') b('warnung', 'Ohne ärztliche Bescheinigung zahlt die Krankenkasse kein Kinderkrankengeld. Bitte reichen Sie sie nach.');
      if (e.w.bezahlt === 'unbekannt') b('info', 'Wir prüfen anhand des Arbeitsvertrags, ob der Lohn weiterläuft (§ 616 BGB).');
      if (zr && zr.tage > jw.kinderkrankTage) b('warnung', `Mehr als ${jw.kinderkrankTage} Arbeitstage am Stück. Kinderkrankengeld gibt es ${monat.slice(0, 4)} für höchstens ${jw.kinderkrankTage} Tage je Kind und Elternteil (Alleinerziehende ${jw.kinderkrankTageAlleinerziehend}).`);
      break;
    case 'unbezahlt':
      if (zr && zr.kalendertage > GRENZEN.unbezahltMaxTage) b('warnung', 'Unbezahlt frei länger als einen Monat: Die Person ist danach nicht mehr über Sie sozialversichert (§ 7 Abs. 3 SGB IV). Wir melden sie ab; bitte informieren Sie die Person, dass sie sich selbst versichern muss.');
      break;
    case 'mutterschutz':
      if (e.w.art === 'elternzeit') b('info', 'Bitte senden Sie uns den Antrag auf Elternzeit, falls noch nicht geschehen.');
      if (e.w.art === 'beschaeftigungsverbot') b('info', 'Bitte senden Sie uns das ärztliche Attest zum Beschäftigungsverbot. Der Lohn wird über die U2 erstattet.');
      if (e.w.art === 'mutterschutz' && istDatum(e.w.geburt)) {
        const f = mutterschutzfristen(e.w.geburt, e.w.verlaengert === 'ja');
        b('info', `Schutzfrist laut Geburtstermin: ${fmt(f.von)} bis ${fmt(f.bis)}. Sie zahlen einen Zuschuss zum Mutterschaftsgeld; die Erstattung (U2) beantragen wir.`);
        // Der Teil der Schutzfrist, der in diesen Monat fällt, muss vom Eintrag abgedeckt sein.
        const imMonat = schnittMitMonat(f.von, f.bis, monat);
        if (imMonat && istDatum(e.w.zeitraum_von) && istDatum(e.w.zeitraum_bis)
          && (e.w.zeitraum_von > imMonat[0] || e.w.zeitraum_bis < imMonat[1]))
          b('warnung', `Der eingetragene Zeitraum deckt die Schutzfrist in diesem Monat (${fmt(imMonat[0], false)}–${fmt(imMonat[1], false)}) nicht ab. Nach der Geburt ist eine Beschäftigung verboten, vorher nur auf ausdrücklichen Wunsch der Mitarbeiterin. Bitte prüfen.`);
      }
      break;
    case 'zuschlaege': {
      const nacht = n('nacht'), sonntag = n('sonntag'), feier = n('feiertag');
      if (nacht + sonntag + feier === 0) b('fehler', 'Bitte tragen Sie mindestens bei einer Art Stunden ein.');
      if (n('nacht_0_4') > nacht) b('fehler', 'Die Stunden zwischen 0 und 4 Uhr können nicht mehr sein als alle Nachtstunden.');
      if (n('feiertag_150') > feier) b('fehler', 'Die Stunden an Weihnachten/1. Mai können nicht mehr sein als alle Feiertagsstunden.');
      let ft = 0, so = 0;
      for (const d of tageVonBis(monatsErster(monat), monatsLetzter(monat))) {
        if (feiertag(d, k.kopf.land, k.kopf.regionen)) ft++;
        if (wochentag(d) === 6) so++;
      }
      const dez = monatNr(k) === 12;
      const moeglich = ft * 24 + (dez ? 20 : 0); // 24.12. und 31.12. jeweils ab 14 Uhr
      if (feier > 0 && moeglich === 0) b('warnung', 'In diesem Monat gibt es an Ihrem Ort keinen Feiertag. Sind Sonntagsstunden gemeint?');
      else if (feier > moeglich) b('fehler', `Mehr Feiertagsstunden als möglich (${ft} Feiertag(e) im Monat).`);
      if (sonntag > so * 24) b('fehler', `Mehr Sonntagsstunden als möglich (${so} Sonntage im Monat).`);
      if (sonntag > 0 && ['BB', 'HE'].includes(k.kopf.land)) {
        const hohe = [...tageVonBis(monatsErster(monat), monatsLetzter(monat))].filter((d) => wochentag(d) === 6 && feiertag(d, k.kopf.land, k.kopf.regionen));
        if (hohe.length) b('info', `${hohe.map((d) => feiertag(d, k.kopf.land, k.kopf.regionen)).join(' und ')} ist in Ihrem Bundesland ein gesetzlicher Feiertag. Arbeit an diesem Tag bitte als Feiertagsstunden eintragen, nicht als Sonntagsstunden.`);
      }
      if (dez && feier > 0) b('info', 'Hinweis: Silvester ab 14 Uhr zählt wie ein Feiertag, Heiligabend ab 14 Uhr wie der 25./26.12.');
      break;
    }
    case 'einmalzahlung':
      if (ma.beschaeftigung === 'minijob') b('warnung', e.w.wiederkehrend === 'ja'
        ? `Bei Minijobs zählen jährlich wiederkehrende Zahlungen zur ${euro(jw.minijobGrenze)}-Grenze (aufs Jahr gerechnet). Wir prüfen, ob die Grenze überschritten wird.`
        : `Einmalige Zahlungen können bei Minijobs die Grenze von ${euro(jw.minijobGrenze)} überschreiten. Wir prüfen das.`);
      break;
    case 'sachbezug':
      if (e.w.art === 'geschenk' && e.w.form === 'geld') b('warnung', 'Geldgeschenke sind immer steuer- und beitragspflichtig, auch zum Geburtstag. Der Betrag wird mit dem Lohn abgerechnet.');
      else if (e.w.art === 'geschenk' && n('betrag') > GRENZEN.geschenkFreigrenze) b('warnung', `Sachgeschenke zu persönlichen Anlässen sind nur bis ${euro(GRENZEN.geschenkFreigrenze)} steuerfrei. Darüber wird der gesamte Betrag versteuert.`);
      if (e.w.art !== 'geschenk') {
        const summe = m ? sachbezugSumme(m, ma) : n('betrag');
        if (summe > GRENZEN.sachbezugFreigrenze) b('warnung', `Gutscheine und Sachbezüge sind zusammen nur bis ${euro(GRENZEN.sachbezugFreigrenze)} im Monat steuerfrei (Freigrenze). Bei ${euro(summe)} wird der gesamte Betrag versteuert, nicht nur der Teil über 50 €.`);
        if (e.w.art === 'gutschein') b('info', 'Steuerfrei nur, wenn der Gutschein zusätzlich zum Lohn gegeben wird und nicht in Bargeld getauscht werden kann.');
      }
      break;
    case 'vorschuss':
      if (istDatum(e.w.datum) && e.w.datum > monatsLetzter(monat)) b('warnung', 'Das Datum liegt nach dem Abrechnungsmonat.');
      if (ma.lohnform === 'gehalt' && ma.gehalt && n('betrag') > ma.gehalt) b('warnung', 'Der Vorschuss ist höher als das Monatsgehalt.');
      break;
    case 'austritt':
      if (istDatum(e.w.datum) && e.w.datum < monatsErster(monat)) b('fehler', 'Das Austrittsdatum liegt vor dem Abrechnungsmonat. Bitte melden Sie sich direkt bei uns.');
      if (istDatum(e.w.datum) && e.w.datum > monatsLetzter(monat)) b('info', 'Der Austritt liegt in einem späteren Monat. Wir merken ihn vor.');
      if (n('resturlaub') > 30) b('warnung', 'Mehr als 30 offene Urlaubstage. Bitte prüfen.');
      break;
  }
  return out;
}

/** Alle Prüfungen für eine Person, inklusive Querprüfungen zwischen den Einträgen. */
export function pruefePerson(ma: Mitarbeiter, m: Meldung): Befund[] {
  const k = kontext(m, ma);
  const eigene = m.eintraege.filter((e) => e.maId === ma.id);
  const out: Befund[] = [];
  const b = (stufe: Stufe, text: string) => out.push({ stufe, text });
  const jw = jahreswerte(m.kopf.monat);

  for (const e of eigene) for (const x of pruefeEintrag(e, k, m)) out.push({ ...x, text: `${kat(e.typ).titel}: ${x.text}` });

  const mitZeitraum = eigene.filter((e) => kat(e.typ).zeitraum && istDatum(e.w.zeitraum_von) && istDatum(e.w.zeitraum_bis));
  for (let i = 0; i < mitZeitraum.length; i++) for (let j = i + 1; j < mitZeitraum.length; j++) {
    const a = mitZeitraum[i], c = mitZeitraum[j];
    if (!ueberschneiden(a.w.zeitraum_von, a.w.zeitraum_bis, c.w.zeitraum_von, c.w.zeitraum_bis)) continue;
    const urlaubKrank = [a.typ, c.typ].includes('urlaub') && [a.typ, c.typ].includes('krank');
    b('fehler', urlaubKrank
      ? 'Urlaub und Krankheit überschneiden sich. Krankheitstage mit ärztlicher Krankmeldung gelten nicht als Urlaub (§ 9 BUrlG). Bitte den Urlaub entsprechend kürzen.'
      : `${kat(a.typ).titel} (${fmt(a.w.zeitraum_von, false)}–${fmt(a.w.zeitraum_bis, false)}) und ${kat(c.typ).titel} (${fmt(c.w.zeitraum_von, false)}–${fmt(c.w.zeitraum_bis, false)}) überschneiden sich.`);
  }
  for (const kk of KATEGORIEN.filter((x) => x.einmalig))
    if (eigene.filter((e) => e.typ === kk.typ).length > 1) b('fehler', `„${kk.titel}“ ist mehrfach eingetragen. Bitte zusammenfassen.`);

  const austritt = eigene.find((e) => e.typ === 'austritt')?.w.datum;
  if (istDatum(austritt)) for (const e of mitZeitraum)
    if (e.w.zeitraum_bis > austritt && e.w.zeitraum_von <= monatsLetzter(m.kopf.monat)) b('fehler', `${kat(e.typ).titel} reicht über den letzten Tag (${fmt(austritt)}) hinaus.`);

  const arbeitszeit = eigene.find((e) => e.typ === 'arbeitszeit');
  const schonWeg = istDatum(austritt) && austritt < monatsErster(m.kopf.monat);
  if (ma.lohnform === 'stundenlohn' && !arbeitszeit && !schonWeg) {
    const abw = mitZeitraum.length > 0;
    b(abw ? 'warnung' : 'fehler', abw ? 'Es fehlen die gearbeiteten Stunden. War die Person den ganzen Monat abwesend? Dann ist das in Ordnung.' : 'Bei Stundenlohn brauchen wir die gearbeiteten Stunden.');
  }

  if (ma.beschaeftigung !== 'azubi') {
    const ml = jw.werte.mindestlohn;
    if (ma.lohnform === 'stundenlohn' && ma.stundenlohn && ma.stundenlohn < ml) b('fehler', `Der Stundenlohn (${euro(ma.stundenlohn)}) liegt unter dem Mindestlohn von ${euro(ml)} (${jw.jahr}).`);
    if (ma.lohnform === 'gehalt' && ma.gehalt && ma.wochenstunden) {
      const satz = stundensatz(ma);
      if (satz < ml) b('warnung', `Umgerechnet ${euro(satz)} je Stunde – unter dem Mindestlohn von ${euro(ml)} (${jw.jahr}). Bitte Gehalt oder Wochenstunden prüfen.`);
    }
  }
  if (ma.beschaeftigung === 'minijob') {
    const v = verdienst(m, ma), g = jw.werte.minijobGrenze;
    if (v > g) b('warnung', `Geschätzter Verdienst ${euro(v)} liegt über der Minijob-Grenze von ${euro(g)}. Unvorhersehbar und höchstens in 2 Monaten im Jahr ist das erlaubt, sonst wird der Job sozialversicherungspflichtig. Wir melden uns.`);
  }
  if (ma.lohnform === 'stundenlohn' && arbeitszeit) {
    const soll = sollStunden(k);
    const bezahlt = z0(arbeitszeit.w.stunden) + bezahlteAbwesenheit(m, ma) + feiertagsverguetung(k).stunden;
    if (soll > 0 && ma.beschaeftigung !== 'minijob' && bezahlt < soll * 0.8 && !mitZeitraum.some((e) => e.typ === 'unbezahlt' || e.typ === 'krank'))
      b('info', `Insgesamt ${std(bezahlt)} bezahlt bei etwa ${std(soll)} vereinbarter Zeit. Fehlt etwas?`);
  }
  return out;
}

export type Status = 'offen' | 'fehler' | 'warnung' | 'ok';
export function status(ma: Mitarbeiter, m: Meldung): Status {
  if (!m.eintraege.some((e) => e.maId === ma.id) && !m.erledigt[ma.id]) return 'offen';
  const bf = pruefePerson(ma, m);
  return bf.some((x) => x.stufe === 'fehler') ? 'fehler' : bf.some((x) => x.stufe === 'warnung') ? 'warnung' : 'ok';
}

/** Prüfungen der Stammdaten im Dialog */
export interface MaEntwurf {
  id: string; name?: string; persNr?: string; beschaeftigung: Beschaeftigung; lohnform: Lohnform;
  betragText?: string; stundenText?: string; arbeitstage: boolean[]; eintritt?: string;
}
export function pruefeStammdaten(d: MaEntwurf, m: Meldung): Befund[] {
  const out: Befund[] = [];
  const b = (stufe: Stufe, text: string, feld: string) => out.push({ stufe, text, feld });
  const ml = jahreswerte(m.kopf.monat).werte;
  if (!d.name?.trim()) b('fehler', 'Bitte den Namen eintragen.', 'name');
  if (!d.persNr?.trim()) b('fehler', 'Bitte die Personalnummer eintragen. Sie steht auf der Lohnabrechnung.', 'persNr');
  else if (!/^\d{1,6}$/.test(d.persNr.trim())) b('fehler', 'Die Personalnummer besteht nur aus Ziffern (höchstens 6).', 'persNr');
  else if (m.mitarbeiter.some((x) => x.persNr === d.persNr!.trim() && x.id !== d.id)) b('fehler', 'Diese Personalnummer gibt es schon.', 'persNr');
  const h = zahl(d.stundenText);
  if (h === undefined || Number.isNaN(h) || h <= 0) b('fehler', 'Bitte die Wochenstunden laut Vertrag eintragen.', 'stunden');
  else if (h > 48) b('warnung', 'Mehr als 48 Stunden pro Woche sind nach dem Arbeitszeitgesetz im Durchschnitt nicht erlaubt.', 'stunden');
  const v = zahl(d.betragText);
  if (v === undefined || Number.isNaN(v) || v <= 0) b('fehler', d.lohnform === 'gehalt' ? 'Bitte das Monatsgehalt (brutto) eintragen.' : 'Bitte den Stundenlohn eintragen.', 'betrag');
  else if (d.lohnform === 'stundenlohn' && v > 200) b('warnung', 'Sehr hoher Stundenlohn. Ist vielleicht das Monatsgehalt gemeint?', 'betrag');
  else if (d.lohnform === 'gehalt' && v < 100) b('warnung', 'Sehr niedriges Monatsgehalt. Ist vielleicht der Stundenlohn gemeint?', 'betrag');
  else if (d.beschaeftigung !== 'azubi' && d.lohnform === 'stundenlohn' && v < ml.mindestlohn) b('fehler', `Unter dem Mindestlohn von ${euro(ml.mindestlohn)}.`, 'betrag');
  if (d.beschaeftigung === 'minijob' && d.lohnform === 'gehalt' && v && v > ml.minijobGrenze) b('fehler', `Ein Minijob darf höchstens ${euro(ml.minijobGrenze)} im Monat bringen.`, 'betrag');
  if (!d.arbeitstage.some(Boolean)) b('fehler', 'Bitte mindestens einen Arbeitstag wählen.', 'tage');
  if (d.eintritt && !istDatum(d.eintritt)) b('fehler', 'Ungültiges Eintrittsdatum.', 'eintritt');
  if (d.eintritt && d.eintritt > monatsLetzter(m.kopf.monat)) b('warnung', 'Der Eintritt liegt nach dem Abrechnungsmonat.', 'eintritt');
  return out;
}

/** Hinweis, wenn für das Jahr keine Werte hinterlegt sind. */
export function meldungsBefunde(m: Meldung): Befund[] {
  const jw = jahreswerte(m.kopf.monat);
  return jw.geschaetzt ? [{ stufe: 'warnung', text: `Für ${m.kopf.monat.slice(0, 4)} sind noch keine Grenzwerte hinterlegt; geprüft wird mit den Werten von ${jw.jahr}.` }] : [];
}
