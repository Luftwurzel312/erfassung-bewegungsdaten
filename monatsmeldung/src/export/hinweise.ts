/**
 * Arbeitsliste für das Lohnbüro: Was muss neben der Buchung erledigt werden?
 * (eAU-Abruf, Meldungen, Bescheinigungen, Prüfungen). Der Mandant sieht diese Liste nicht.
 */
import { fmt, istDatum, plusTage, monatsErster, monatsLetzter, kalendertage } from '../kalender';
import { GRENZEN, jahreswerte } from '../parameter';
import {
  Meldung, kat, kontext, zeitraumwerte, verdienst, sachbezugSumme, mutterschutzfristen, euro, zahl,
} from '../regeln';
import { Konfig } from './konfig';
import { nur1252 } from './cp1252';

export type Thema = 'eAU' | 'Meldung' | 'Bescheinigung' | 'Erstattung' | 'Prüfen' | 'Info';
export interface Aufgabe { persNr: string; name: string; thema: Thema; text: string; frist?: string }

const nz = (s?: string) => { const n = zahl(s); return n && !Number.isNaN(n) ? n : 0; };

export function aufgaben(m: Meldung, konfig?: Konfig): Aufgabe[] {
  const out: Aufgabe[] = [];
  const allg = (thema: Thema, text: string) => out.push({ persNr: '', name: 'Allgemein', thema, text });
  const jw = jahreswerte(m.kopf.monat);
  if (konfig && !konfig.geprueft) allg('Prüfen', 'Lohnarten-Zuordnung ist noch nicht geprüft. LODAS-/SBS-Datei vor dem Import abgleichen.');
  if (jw.geschaetzt) allg('Prüfen', `Für ${m.kopf.monat.slice(0, 4)} sind keine Grenzwerte hinterlegt (geprüft mit ${jw.jahr}).`);
  if (m.nachricht.trim()) allg('Info', `Nachricht des Mandanten: ${m.nachricht.trim()}`);

  for (const ma of m.mitarbeiter) {
    const k = kontext(m, ma);
    const a = (thema: Thema, text: string, frist?: string) => out.push({ persNr: ma.persNr, name: ma.name, thema, text, frist });
    const eigene = m.eintraege.filter((e) => e.maId === ma.id);

    if (ma.eintritt && ma.eintritt >= monatsErster(m.kopf.monat) && ma.eintritt <= monatsLetzter(m.kopf.monat))
      a('Meldung', `Neueintritt am ${fmt(ma.eintritt)}: Personalfragebogen anfordern, Anmeldung (Abgabegrund 10), Sofortmeldung bei Branchen nach § 28a Abs. 4 SGB IV prüfen.`);

    for (const e of eigene) {
      const zr = kat(e.typ).zeitraum ? zeitraumwerte(e, k) : null;
      const zeit = istDatum(e.w.zeitraum_von) ? `${fmt(e.w.zeitraum_von)}–${fmt(e.w.zeitraum_bis)}` : '';
      switch (e.typ) {
        case 'krank': {
          if (e.w.au !== 'nein') a('eAU', `eAU abrufen für ${zeit} (bei privat Versicherten Papier-AU anfordern).`);
          else if (zr && zr.kalendertage > 3) a('Prüfen', `Krank ${zeit} ohne ärztliche AU über 3 Kalendertage: Leistungsverweigerungsrecht § 7 EFZG klären.`);
          if (e.w.unfall === 'ja') a('Meldung', `Arbeitsunfall (${zeit}): Unfallanzeige an die BG, wenn AU > 3 Kalendertage (§ 193 SGB VII).`, istDatum(e.w.zeitraum_von) ? `3 Tage nach Kenntnis` : undefined);
          if (e.w.vorher === 'ja' || e.w.vorher === 'unbekannt') a('Prüfen', `Vorerkrankungen prüfen (Fortsetzungserkrankung, § 3 Abs. 1 S. 2 EFZG)${e.w.vorher_wann ? `: lt. Mandant ${e.w.vorher_wann}` : ''}. Ggf. Vorerkrankungsanfrage an die Krankenkasse.`);
          if (zr && zr.tageBezahlt < zr.tage) {
            const efzEnde = plusTage(e.w.zeitraum_von, GRENZEN.efzKalendertage - 1);
            a('Bescheinigung', `Kein Anspruch auf Entgeltfortzahlung für ${zr.tage - zr.tageBezahlt} Arbeitstag(e) (Wartezeit oder Ende 6 Wochen am ${fmt(efzEnde)}): Entgeltbescheinigung Krankengeld (EEL) übermitteln; Unterbrechungsmeldung (Abgabegrund 51) prüfen, wenn ein voller Kalendermonat ohne Entgelt.`);
          }
          break;
        }
        case 'kindkrank':
          if (e.w.bezahlt !== 'ja') a('Bescheinigung', `Kind krank ${zeit}: Entgeltbescheinigung Kinderkrankengeld (EEL) übermitteln.`);
          if (e.w.bezahlt === 'unbekannt') a('Prüfen', 'Kind krank: Anspruch nach § 616 BGB anhand des Arbeitsvertrags prüfen.');
          if (e.w.alter === 'nein') a('Prüfen', 'Kind krank: Kind ist 12 oder älter – kein Kinderkrankengeld, Freistellung unbezahlt.');
          break;
        case 'unbezahlt':
          if (zr && zr.kalendertage > GRENZEN.unbezahltMaxTage && istDatum(e.w.zeitraum_von)) {
            const ende = plusTage(e.w.zeitraum_von, GRENZEN.unbezahltMaxTage - 1);
            a('Meldung', `Unbezahlt ${zeit}: Versicherungspflicht endet nach einem Monat (§ 7 Abs. 3 SGB IV) – Abmeldung (Abgabegrund 34) zum ${fmt(ende)}, Anmeldung (13) bei Wiederaufnahme.`);
          }
          break;
        case 'mutterschutz':
          if (e.w.art === 'mutterschutz') {
            const f = istDatum(e.w.geburt) ? mutterschutzfristen(e.w.geburt, e.w.verlaengert === 'ja') : null;
            a('Erstattung', `Mutterschutz${f ? ` (Schutzfrist ${fmt(f.von)}–${fmt(f.bis)})` : ''}: Zuschuss zum Mutterschaftsgeld berechnen, U2-Erstattung beantragen, Entgeltbescheinigung Mutterschaftsgeld, Unterbrechungsmeldung (51) prüfen.`);
            if (e.w.verlaengert === 'unbekannt') a('Prüfen', 'Mutterschutz: verlängerte Schutzfrist (Früh-/Mehrlingsgeburt, Behinderung) klären.');
          } else if (e.w.art === 'beschaeftigungsverbot') {
            a('Erstattung', `Beschäftigungsverbot ${zeit}: Attest anfordern, Mutterschutzlohn (§ 18 MuSchG) zahlen, U2-Erstattung beantragen.`);
          } else {
            a('Meldung', `Elternzeit ${zeit}: Antrag anfordern, Unterbrechungsmeldung (Abgabegrund 52) prüfen, Urlaubskürzung (§ 17 BEEG) beachten.`);
          }
          break;
        case 'zuschlaege':
          if (ma.lohnform === 'stundenlohn' && (ma.stundenlohn || 0) > GRENZEN.grundlohn3bSv)
            a('Prüfen', `Zuschläge § 3b EStG: Grundlohn ${euro(ma.stundenlohn!)} über ${euro(GRENZEN.grundlohn3bSv)}/Std. – Zuschläge insoweit beitragspflichtig (§ 1 SvEV)${(ma.stundenlohn || 0) > GRENZEN.grundlohn3bSteuer ? `, über ${euro(GRENZEN.grundlohn3bSteuer)} auch steuerpflichtig` : ''}.`);
          break;
        case 'sachbezug':
          if (e.w.art === 'geschenk' && e.w.form === 'geld') a('Prüfen', `Geldgeschenk ${euro(nz(e.w.betrag))}: steuer- und beitragspflichtig abrechnen.`);
          else if (e.w.art === 'geschenk' && nz(e.w.betrag) > GRENZEN.geschenkFreigrenze) a('Prüfen', `Sachgeschenk ${euro(nz(e.w.betrag))} über ${euro(GRENZEN.geschenkFreigrenze)}: voll steuerpflichtig, ggf. Pauschalierung § 37b EStG.`);
          break;
        case 'vorschuss':
          a('Info', `Vorschuss ${euro(nz(e.w.betrag))} vom ${fmt(e.w.datum)} mit dem Nettolohn verrechnen.`);
          break;
        case 'austritt': {
          a('Meldung', `Austritt zum ${fmt(e.w.datum)}: Abmeldung (Abgabegrund 30), Arbeitsbescheinigung (BEA) an die Bundesagentur, Lohnsteuerbescheinigung.`);
          if (nz(e.w.resturlaub) > 0) a('Prüfen', `Urlaubsabgeltung ${nz(e.w.resturlaub)} Tage (§ 7 Abs. 4 BUrlG) – Anspruch anhand Urlaubskartei prüfen.`);
          if (istDatum(e.w.datum) && ma.eintritt && kalendertage(ma.eintritt, e.w.datum) < 183) a('Prüfen', 'Austritt in den ersten 6 Monaten: nur Teilurlaub (§ 5 BUrlG).');
          break;
        }
        case 'sonstiges':
          a('Info', `Freitext: ${e.w.text}`);
          break;
      }
    }

    const sb = sachbezugSumme(m, ma);
    if (sb > GRENZEN.sachbezugFreigrenze) a('Prüfen', `Sachbezüge/Gutscheine zusammen ${euro(sb)} über der Freigrenze von ${euro(GRENZEN.sachbezugFreigrenze)}: voll steuer- und beitragspflichtig oder Pauschalierung § 37b EStG.`);
    if (ma.beschaeftigung === 'minijob') {
      const v = verdienst(m, ma);
      if (v > jw.werte.minijobGrenze) a('Prüfen', `Minijob: geschätzter Verdienst ${euro(v)} über ${euro(jw.werte.minijobGrenze)} – Jahresbetrachtung und gelegentliches Überschreiten (max. 2 Monate) prüfen.`);
    }
  }
  return out;
}

export function aufgabenText(m: Meldung, liste: Aufgabe[]): string {
  const zl = [`Hinweise zur Monatsmeldung ${m.kopf.firma} (Mandant ${m.kopf.mandantNr}), ${m.kopf.monat}`, ''];
  let letzte = '';
  for (const x of liste) {
    const wer = x.persNr ? `${x.persNr} ${x.name}` : x.name;
    if (wer !== letzte) { zl.push('', wer); letzte = wer; }
    zl.push(`  [ ] ${x.thema}: ${x.text}${x.frist ? ` (Frist: ${x.frist})` : ''}`);
  }
  if (!liste.length) zl.push('Keine besonderen Aufgaben.');
  return nur1252(zl.join('\r\n') + '\r\n');
}
