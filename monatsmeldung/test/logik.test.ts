/* Tests der Rechenlogik und der Exporte. Start: npm test */
import { feiertag, ostersonntag, arbeitstage, monatsLetzter } from '../src/kalender';
import { jahreswerte } from '../src/parameter';
import {
  Meldung, Mitarbeiter, Eintrag, pruefePerson, pruefeEintrag, zeitraumwerte, kontext, feiertagsverguetung,
  verdienst, mutterschutzfristen, sachbezugSumme, zahl,
} from '../src/regeln';
import { STANDARD, mische } from '../src/export/konfig';
import { erzeugeZeilen } from '../src/export/zeilen';
import { lodasAscii, sbsCsv, uebergabeCsv } from '../src/export/formate';
import { aufgaben } from '../src/export/hinweise';
import { kodiere1252, nur1252 } from '../src/export/cp1252';

declare const process: { exit(code: number): never };
let ok = 0, fail = 0;
function t(name: string, fn: () => void) {
  try { fn(); ok++; } catch (e) { fail++; console.log(`FAIL ${name}\n     ${(e as Error).message}`); }
}
function eq<T>(a: T, b: T, msg = '') {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} erwartet ${JSON.stringify(b)}, erhalten ${JSON.stringify(a)}`);
}
const hat = (bf: { text: string }[], re: RegExp) => bf.some((b) => re.test(b.text));

const MOFR = [true, true, true, true, true, false, false];
function ma(x: Partial<Mitarbeiter> = {}): Mitarbeiter {
  return { id: 'a', persNr: '101', name: 'Anna Test', beschaeftigung: 'vollzeit', lohnform: 'gehalt', gehalt: 3000, wochenstunden: 40, arbeitstage: MOFR, ...x };
}
function meldung(monat: string, mas: Mitarbeiter[], eintraege: Omit<Eintrag, 'id'>[], land: Meldung['kopf']['land'] = 'SH', regionen: Meldung['kopf']['regionen'] = []): Meldung {
  return {
    kopf: { mandantNr: '20417', firma: 'Test GmbH', ansprechpartner: '', monat, land, regionen },
    mitarbeiter: mas, eintraege: eintraege.map((e, i) => ({ ...e, id: 'e' + i })), erledigt: {}, hinweiseGelesen: false, nachricht: '',
  };
}

// ---------------- Kalender
t('Ostern 2026/2027', () => { eq(ostersonntag(2026), '2026-04-05'); eq(ostersonntag(2027), '2027-03-28'); });
t('Reformationstag SH, nicht BY', () => { eq(feiertag('2026-10-31', 'SH'), 'Reformationstag'); eq(feiertag('2026-10-31', 'BY'), undefined); });
t('Buß- und Bettag Sachsen 2026', () => eq(feiertag('2026-11-18', 'SN'), 'Buß- und Bettag'));
t('Mariä Himmelfahrt nur regional in BY', () => {
  eq(feiertag('2026-08-15', 'BY'), undefined);
  eq(feiertag('2026-08-15', 'BY', ['BY_MARIAE']), 'Mariä Himmelfahrt (regional)');
  eq(feiertag('2026-08-15', 'SL'), 'Mariä Himmelfahrt');
});
t('Augsburger Friedensfest nur mit Region', () => { eq(feiertag('2026-08-08', 'BY'), undefined); eq(feiertag('2026-08-08', 'BY', ['BY_AUGSBURG']), 'Augsburger Friedensfest'); });
t('Region eines anderen Landes wirkt nicht', () => eq(feiertag('2026-08-08', 'SN', ['BY_AUGSBURG']), undefined));
t('Fronleichnam Thüringen regional', () => { eq(feiertag('2026-06-04', 'TH'), undefined); eq(feiertag('2026-06-04', 'TH', ['TH_FRONLEICHNAM']), 'Fronleichnam (regional)'); });
t('Ostersonntag Feiertag in BB und HE', () => { eq(feiertag('2026-04-05', 'BB'), 'Ostersonntag'); eq(feiertag('2026-04-05', 'HE'), 'Ostersonntag'); eq(feiertag('2026-04-05', 'SH'), undefined); });
t('Arbeitstage November 2026 SH Mo–Fr', () => eq(arbeitstage('2026-11-01', '2026-11-30', MOFR, { land: 'SH', regionen: [] }).tage, 21));

// ---------------- Jahreswerte
t('Mindestlohn je Jahr', () => { eq(jahreswerte('2026-12').werte.mindestlohn, 13.9); eq(jahreswerte('2027-01').werte.mindestlohn, 14.6); });
t('Minijob-Grenze 2027 = 633', () => eq(jahreswerte('2027-03').werte.minijobGrenze, 633));
t('Minijob-Grenze folgt der Formel', () => {
  for (const j of [2026, 2027]) { const w = jahreswerte(`${j}-01`).werte; eq(w.minijobGrenze, Math.ceil((w.mindestlohn * 130) / 3)); }
});
t('Unbekanntes Jahr: letztes bekanntes + Hinweis', () => { const j = jahreswerte('2029-01'); eq(j.jahr, 2027); eq(j.geschaetzt, true); });
t('Mindestlohn 2027 greift bei 14 €', () => {
  const m = meldung('2027-01', [ma({ lohnform: 'stundenlohn', stundenlohn: 14, gehalt: undefined })], [{ maId: 'a', typ: 'arbeitszeit', w: { stunden: '160' } }]);
  eq(hat(pruefePerson(m.mitarbeiter[0], m), /unter dem Mindestlohn von 14,60/), true);
  const m26 = { ...m, kopf: { ...m.kopf, monat: '2026-12' } };
  eq(hat(pruefePerson(m26.mitarbeiter[0], m26), /Mindestlohn/), false);
});

// ---------------- Zahlen
t('Deutsche Zahlen', () => { eq(zahl('1.234,5'), 1234.5); eq(zahl('7,75'), 7.75); eq(zahl(''), undefined); eq(Number.isNaN(zahl('abc')!), true); });

// ---------------- Krank / EFZ
t('Krank 6 Wochen: bezahlte Tage enden nach Tag 42', () => {
  // 01.10.–30.11.2026; Tag 42 = 11.11.2026. November SH: 2.–11.11. = 8 Arbeitstage bezahlt
  const m = meldung('2026-11', [ma()], [{ maId: 'a', typ: 'krank', w: { zeitraum_von: '2026-10-01', zeitraum_bis: '2026-11-30', au: 'ja', unfall: 'nein' } }]);
  const zr = zeitraumwerte(m.eintraege[0], kontext(m, m.mitarbeiter[0]))!;
  eq(zr.tage, 21); eq(zr.tageBezahlt, 8);
});
t('Krank in Wartezeit unbezahlt', () => {
  const m = meldung('2026-11', [ma({ eintritt: '2026-11-02' })], [{ maId: 'a', typ: 'krank', w: { zeitraum_von: '2026-11-16', zeitraum_bis: '2026-11-20', au: 'ja', unfall: 'nein' } }]);
  const zr = zeitraumwerte(m.eintraege[0], kontext(m, m.mitarbeiter[0]))!;
  eq(zr.tageBezahlt, 0, 'Wartezeit bis 29.11.');
  eq(hat(pruefePerson(m.mitarbeiter[0], m), /noch keine 4 Wochen/), true);
});
t('Krank-Fehlzeiten werden am EFZ-Ende geteilt', () => {
  const m = meldung('2026-11', [ma()], [{ maId: 'a', typ: 'krank', w: { zeitraum_von: '2026-10-01', zeitraum_bis: '2026-11-30', au: 'ja', unfall: 'nein' } }]);
  const fz = erzeugeZeilen(m).fehlzeiten.map((f) => [f.schluessel, f.von, f.bis]);
  eq(fz, [['krank', '2026-10-01', '2026-11-11'], ['krank_ohne_efz', '2026-11-12', '2026-11-30']]);
});
t('Urlaub + Krank überschneiden: § 9 BUrlG', () => {
  const m = meldung('2026-11', [ma()], [
    { maId: 'a', typ: 'urlaub', w: { zeitraum_von: '2026-11-09', zeitraum_bis: '2026-11-13' } },
    { maId: 'a', typ: 'krank', w: { zeitraum_von: '2026-11-11', zeitraum_bis: '2026-11-12', au: 'ja', unfall: 'nein' } },
  ]);
  eq(hat(pruefePerson(m.mitarbeiter[0], m), /§ 9 BUrlG/), true);
});

// ---------------- Feiertage, Stundenlohn
t('Feiertagsvergütung Stundenlohn, nicht bei unbezahlt', () => {
  const p = ma({ lohnform: 'stundenlohn', stundenlohn: 16, gehalt: undefined, wochenstunden: 20 });
  const m = meldung('2026-12', [p], [{ maId: 'a', typ: 'arbeitszeit', w: { stunden: '70' } }]);
  eq(feiertagsverguetung(kontext(m, p)).tage, ['2026-12-25']); // 26.12. ist Samstag
  const m2 = meldung('2026-12', [p], [{ maId: 'a', typ: 'unbezahlt', w: { zeitraum_von: '2026-12-21', zeitraum_bis: '2026-12-31' } }]);
  eq(feiertagsverguetung(kontext(m2, p)).tage, []);
});

// ---------------- Geld
t('Sachbezug: Freigrenze über alle Gutscheine des Monats', () => {
  const m = meldung('2026-11', [ma()], [
    { maId: 'a', typ: 'sachbezug', w: { art: 'gutschein', betrag: '30' } },
    { maId: 'a', typ: 'sachbezug', w: { art: 'gutschein', betrag: '25' } },
  ]);
  eq(sachbezugSumme(m, m.mitarbeiter[0]), 55);
  eq(hat(pruefePerson(m.mitarbeiter[0], m), /gesamte Betrag versteuert/), true);
});
t('Geldgeschenk immer steuerpflichtig', () => {
  const m = meldung('2026-11', [ma()], [{ maId: 'a', typ: 'sachbezug', w: { art: 'geschenk', form: 'geld', betrag: '20' } }]);
  eq(hat(pruefeEintrag(m.eintraege[0], kontext(m, m.mitarbeiter[0]), m), /immer steuer/), true);
});
t('Minijob: Verdienst mit Feiertagen und Prämie', () => {
  const p = ma({ beschaeftigung: 'minijob', lohnform: 'stundenlohn', stundenlohn: 14, gehalt: undefined, wochenstunden: 10, arbeitstage: [false, false, false, true, true, false, false] });
  const m = meldung('2026-12', [p], [{ maId: 'a', typ: 'arbeitszeit', w: { stunden: '40' } }, { maId: 'a', typ: 'einmalzahlung', w: { art: 'weihnachtsgeld', betrag: '100' } }]);
  eq(verdienst(m, p), 14 * (40 + 5) + 100); // 25.12. ist Freitag → 5 Std. Feiertag
  eq(hat(pruefePerson(p, m), /über der Minijob-Grenze von 603/), true);
});

// ---------------- Mutterschutz, Zuschläge, Kind krank
t('Mutterschutzfristen', () => {
  eq(mutterschutzfristen('2026-12-15', false), { von: '2026-11-03', bis: '2027-02-09' });
  eq(mutterschutzfristen('2026-12-15', true).bis, '2027-03-09');
});
t('Zuschläge: 0–4 Uhr nicht mehr als Nacht', () => {
  const m = meldung('2026-11', [ma()], [{ maId: 'a', typ: 'zuschlaege', w: { nacht: '10', nacht_0_4: '12' } }]);
  eq(hat(pruefeEintrag(m.eintraege[0], kontext(m, m.mitarbeiter[0])), /0 und 4 Uhr/), true);
});
t('Zuschläge: Ostersonntag BB als Feiertag melden', () => {
  const m = meldung('2026-04', [ma()], [{ maId: 'a', typ: 'zuschlaege', w: { sonntag: '8' } }], 'BB');
  eq(hat(pruefeEintrag(m.eintraege[0], kontext(m, m.mitarbeiter[0])), /Ostersonntag/), true);
});
t('Zuschläge Dezember: Silvester-Stunden zulässig', () => {
  // SH Dezember 2026: 2 Feiertage → 48 + 20 Std. möglich
  const m = meldung('2026-12', [ma()], [{ maId: 'a', typ: 'zuschlaege', w: { feiertag: '60' } }]);
  eq(hat(pruefeEintrag(m.eintraege[0], kontext(m, m.mitarbeiter[0])), /Mehr Feiertagsstunden/), false);
});
t('Kind krank: Tage-Hinweis nach Jahr', () => {
  const m = meldung('2027-02', [ma()], [{ maId: 'a', typ: 'kindkrank', w: { zeitraum_von: '2027-02-01', zeitraum_bis: '2027-02-15', alter: 'ja', bescheinigung: 'ja', bezahlt: 'nein' } }]);
  eq(hat(pruefeEintrag(m.eintraege[0], kontext(m, m.mitarbeiter[0])), /höchstens 10 Tage/), true);
});

// ---------------- Exporte
const beispiel = () => {
  const s = ma({ id: 'b', persNr: '102', name: 'Bernd Stunde', lohnform: 'stundenlohn', stundenlohn: 16.5, gehalt: undefined, wochenstunden: 24, arbeitstage: [true, true, true, false, false, false, false] });
  return meldung('2026-11', [ma(), s], [
    { maId: 'a', typ: 'urlaub', w: { zeitraum_von: '2026-11-09', zeitraum_bis: '2026-11-13' } },
    { maId: 'a', typ: 'einmalzahlung', w: { art: 'praemie', betrag: '250' } },
    { maId: 'b', typ: 'arbeitszeit', w: { stunden: '96,5' } },
    { maId: 'b', typ: 'zuschlaege', w: { nacht: '10', nacht_0_4: '4' } },
  ]);
};
t('LODAS: Kopf, Satzbeschreibung, Buchungen', () => {
  const x = lodasAscii(beispiel(), STANDARD).text;
  eq(x.startsWith('[Allgemein]\r\nVersion_SST=1.0\r\nBeraterNr=1234567\r\nMandantenNr=20417'), true, 'Kopf');
  eq(x.includes('1;u_lod_bwd_buchung_standard;abrechnung_zeitraum#bwd;bs_nr#bwd;bs_wert_butab#bwd;la_eigene#bwd;pnr#bwd;'), true, 'Satzbeschreibung');
  eq(x.includes('1;01.11.2026;3;250,00;2000;101;'), true, 'Prämie');
  eq(x.includes('1;01.11.2026;1;96,50;1000;102;'), true, 'Arbeitsstunden');
  eq(x.includes('1;01.11.2026;1;6,00;1400;102;'), true, 'Nacht 25 %');
  eq(x.includes('1;01.11.2026;1;4,00;1401;102;'), true, 'Nacht 40 %');
  eq(x.includes("[Stammdaten]"), true);
  eq(x.includes("2;101;09112026;13112026;'U';"), true, 'Fehlzeit Urlaub');
  eq(/;1100;101;/.test(x), false, 'Urlaubsstunden nicht bei Gehalt');
  eq(x.split('\r\n').every((z) => !z.includes('\n')), true, 'CRLF');
});
t('LODAS: Personalnummer > 5 Stellen wird gemeldet', () => {
  const m = beispiel(); m.mitarbeiter[0].persNr = '123456';
  eq(lodasAscii(m, STANDARD).probleme.some((p) => /Personalnummer/.test(p)), true);
});
t('LODAS: fehlende Lohnart wird gemeldet', () => {
  const k = mische(STANDARD, { lohnarten: { einmal_praemie: { text: 'Prämie', wert: 'betrag', sbs: '0600' } } });
  eq(lodasAscii(beispiel(), k).probleme.some((p) => /keine LODAS-Lohnart/.test(p)), true);
});
t('SBS: Kopfzeile und Zeilen', () => {
  const x = sbsCsv(beispiel(), STANDARD).text.split('\r\n');
  eq(x[0], 'Firma;Personalnummer;Abrechnungsmonat;Lohnart;Stunden;Tage;Betrag;Von;Bis;Text');
  eq(x.includes('20417;101;11.2026;0600;;;250,00;;;Prämie / Bonus'), true, 'Prämie');
  eq(x.includes('20417;101;11.2026;0250;;5,00;;09.11.2026;13.11.2026;Urlaub'), true, 'Urlaubstage');
});
t('Übergabe-CSV enthält Feiertagsvergütung automatisch', () => {
  const m = beispiel(); m.kopf.monat = '2026-04'; // Ostermontag 06.04. ist ein Montag
  m.eintraege = m.eintraege.filter((e) => e.maId === 'b').map((e) => e);
  eq(uebergabeCsv(m, STANDARD).text.includes('feiertag;Feiertagsvergütung'), true);
});
t('Hinweisliste: eAU, Unfall, Abmeldung', () => {
  const m = meldung('2026-11', [ma()], [
    { maId: 'a', typ: 'krank', w: { zeitraum_von: '2026-11-02', zeitraum_bis: '2026-11-06', au: 'ja', unfall: 'ja' } },
    { maId: 'a', typ: 'unbezahlt', w: { zeitraum_von: '2026-11-09', zeitraum_bis: '2026-12-31' } },
  ]);
  const a = aufgaben(m, STANDARD).map((x) => x.text).join('\n');
  eq(/eAU abrufen/.test(a), true); eq(/Unfallanzeige/.test(a), true); eq(/Abgabegrund 34\) zum 09\.12\.2026/.test(a), true);
});
t('Windows-1252', () => {
  eq([...kodiere1252('Ä€–ß')], [0xc4, 0x80, 0x96, 0xdf]);
  eq(nur1252('a≥b😀'), 'a?b?');
});
t('Monatsletzter', () => eq(monatsLetzter('2028-02'), '2028-02-29'));

console.log(`${ok} Tests ok, ${fail} fehlgeschlagen`);
if (fail) process.exit(1);
