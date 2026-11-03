/**
 * Neutrale Übergabezeilen: was ist passiert, mit fachlichem Schlüssel statt Lohnart.
 * Erst LODAS-/SBS-Export ordnen über die Konfiguration Lohnarten zu.
 */
import { Datum, fmt, istDatum, plusTage, schnittMitMonat, arbeitstage } from '../kalender';
import { GRENZEN } from '../parameter';
import {
  Meldung, Lohnform, kat, kontext, optionText, zeitraumwerte, feiertagsverguetung, zahl, ort,
} from '../regeln';

export interface Zeile {
  persNr: string;
  name: string;
  lohnform: Lohnform;
  /** Fachlicher Schlüssel, z. B. 'urlaub', 'zuschlag_nacht', 'einmal_praemie'; 'info' = nur Hinweis */
  schluessel: string;
  bezeichnung: string;
  von?: Datum;
  bis?: Datum;
  tage?: number;
  stunden?: number;
  betrag?: number;
  hinweis: string;
}

/** Taggenauer Abwesenheitszeitraum für die Fehlzeiten im Lohnprogramm */
export interface Fehlzeit {
  persNr: string; name: string; schluessel: string; von: Datum; bis: Datum;
  /** Arbeitstage der Person in diesem Abschnitt, soweit er im Abrechnungsmonat liegt */
  arbeitstageImMonat: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const nz = (s: string | undefined) => { const n = zahl(s); return n && !Number.isNaN(n) ? n : 0; };

export function erzeugeZeilen(m: Meldung): { zeilen: Zeile[]; fehlzeiten: Fehlzeit[] } {
  const zeilen: Zeile[] = [];
  const fehlzeiten: Fehlzeit[] = [];

  for (const ma of m.mitarbeiter) {
    const k = kontext(m, ma);
    const add = (schluessel: string, bezeichnung: string, x: Partial<Zeile> = {}) =>
      zeilen.push({ persNr: ma.persNr, name: ma.name, lohnform: ma.lohnform, schluessel, bezeichnung, hinweis: '', ...x });
    const fz = (schluessel: string, von: Datum, bis: Datum) => {
      if (!istDatum(von) || !istDatum(bis) || bis < von) return;
      const s = schnittMitMonat(von, bis, m.kopf.monat);
      const at = s ? arbeitstage(s[0], s[1], ma.arbeitstage, ort(m.kopf)).tage : 0;
      fehlzeiten.push({ persNr: ma.persNr, name: ma.name, schluessel, von, bis, arbeitstageImMonat: at });
    };
    const eigene = m.eintraege.filter((e) => e.maId === ma.id);

    for (const e of eigene) {
      const zr = kat(e.typ).zeitraum ? zeitraumwerte(e, k) : null;
      const zeit = zr ? { von: e.w.zeitraum_von, bis: e.w.zeitraum_bis, tage: zr.tage, stunden: zr.stundenBezahlt } : {};
      const n = (key: string) => nz(e.w[key]);
      switch (e.typ) {
        case 'arbeitszeit': add('arbeitszeit', 'Gearbeitete Stunden', { stunden: n('stunden') }); break;
        case 'urlaub':
          add('urlaub', 'Urlaub', { ...zeit, hinweis: n('halbtage') ? `${n('halbtage')} halbe Tage` : '' });
          fz('urlaub', e.w.zeitraum_von, e.w.zeitraum_bis);
          break;
        case 'krank': {
          const ohne = zr ? zr.tage - zr.tageBezahlt : 0;
          add('krank', 'Krankheit', {
            ...zeit,
            hinweis: [
              e.w.au === 'ja' ? 'eAU abrufen' : e.w.au === 'nein' ? 'ohne AU' : 'AU unklar',
              e.w.unfall === 'ja' ? 'Arbeitsunfall' : '',
              e.w.vorher === 'ja' ? `Vorerkrankung prüfen${e.w.vorher_wann ? ` (${e.w.vorher_wann})` : ''}` : '',
              ohne > 0 ? `${ohne} Tag(e) ohne Entgeltfortzahlung` : '',
            ].filter(Boolean).join(', '),
          });
          // Fehlzeit aufteilen: bis Tag 42 mit EFZ, danach Krankengeld; in der Wartezeit ohne EFZ.
          if (istDatum(e.w.zeitraum_von) && istDatum(e.w.zeitraum_bis)) {
            const wzEnde = ma.eintritt ? plusTage(ma.eintritt, GRENZEN.wartezeitTage - 1) : '';
            const efzEnde = plusTage(e.w.zeitraum_von, GRENZEN.efzKalendertage - 1);
            const art = (d: Datum) => (d <= wzEnde || d > efzEnde ? 'krank_ohne_efz' : 'krank');
            let start = e.w.zeitraum_von;
            for (let d = start; d <= e.w.zeitraum_bis; d = plusTage(d, 1)) {
              const naechster = plusTage(d, 1);
              if (naechster > e.w.zeitraum_bis || art(naechster) !== art(d)) { fz(art(d), start, d); start = naechster; }
            }
          }
          break;
        }
        case 'kindkrank': {
          const bezahlt = e.w.bezahlt === 'ja';
          add(bezahlt ? 'kindkrank_bezahlt' : 'kindkrank', bezahlt ? 'Kind krank (bezahlt)' : 'Kind krank (unbezahlt)', {
            ...zeit, stunden: bezahlt ? zr?.stundenBezahlt : undefined,
            hinweis: `Kind unter 12: ${optionText('kindkrank', 'alter', e.w.alter)}; Bescheinigung: ${optionText('kindkrank', 'bescheinigung', e.w.bescheinigung)}${e.w.bezahlt === 'unbekannt' ? '; § 616 BGB prüfen' : ''}`,
          });
          fz(bezahlt ? 'kindkrank_bezahlt' : 'kindkrank', e.w.zeitraum_von, e.w.zeitraum_bis);
          break;
        }
        case 'unbezahlt':
          add('unbezahlt', 'Unbezahlt frei', { ...zeit, stunden: undefined, hinweis: e.w.grund || '' });
          fz('unbezahlt', e.w.zeitraum_von, e.w.zeitraum_bis);
          break;
        case 'mutterschutz': {
          const art = e.w.art || 'mutterschutz';
          add(art, optionText('mutterschutz', 'art', art), {
            ...zeit, stunden: undefined,
            hinweis: istDatum(e.w.geburt) ? `Geburtstermin ${fmt(e.w.geburt)}${e.w.verlaengert === 'ja' ? ', verlängerte Schutzfrist' : ''}` : '',
          });
          fz(art, e.w.zeitraum_von, e.w.zeitraum_bis);
          break;
        }
        case 'ueberstunden':
          add(e.w.verwendung === 'auszahlen' ? 'ueberstunden_aus' : 'ueberstunden_konto',
            e.w.verwendung === 'auszahlen' ? 'Überstunden ausgezahlt' : 'Überstunden aufs Zeitkonto',
            { stunden: n('stunden'), hinweis: n('zuschlag') ? `Zuschlag ${n('zuschlag')} %` : '' });
          break;
        case 'zuschlaege': {
          const nacht = n('nacht'), n04 = n('nacht_0_4'), feier = n('feiertag'), f150 = n('feiertag_150');
          if (nacht - n04 > 0) add('zuschlag_nacht', 'Nachtarbeit 20–6 Uhr', { stunden: r2(nacht - n04) });
          if (n04 > 0) add('zuschlag_nacht_0_4', 'Nachtarbeit 0–4 Uhr (Beginn vor 0 Uhr)', { stunden: n04 });
          if (n('sonntag') > 0) add('zuschlag_sonntag', 'Sonntagsarbeit', { stunden: n('sonntag') });
          if (feier - f150 > 0) add('zuschlag_feiertag', 'Feiertagsarbeit', { stunden: r2(feier - f150) });
          if (f150 > 0) add('zuschlag_feiertag_150', 'Feiertagsarbeit 24.12./25.12./26.12./1.5.', { stunden: f150 });
          break;
        }
        case 'einmalzahlung':
          add(`einmal_${e.w.art || 'sonstige'}`, optionText('einmalzahlung', 'art', e.w.art), { betrag: n('betrag') });
          break;
        case 'sachbezug': {
          const s = e.w.art === 'geschenk' ? (e.w.form === 'geld' ? 'geschenk_geld' : 'sachbezug_geschenk')
            : e.w.art === 'gutschein' ? 'sachbezug_gutschein' : 'sachbezug_sonstige';
          add(s, optionText('sachbezug', 'art', e.w.art), { betrag: n('betrag') });
          break;
        }
        case 'vorschuss': add('vorschuss', 'Vorschuss', { betrag: n('betrag'), von: e.w.datum }); break;
        case 'austritt':
          add('info', 'Austritt', { bis: e.w.datum, hinweis: optionText('austritt', 'grund', e.w.grund) });
          if (n('resturlaub') > 0) add('resturlaub_abgeltung', 'Urlaubsabgeltung', { tage: n('resturlaub') });
          break;
        case 'sonstiges': add('info', 'Nachricht', { hinweis: e.w.text }); break;
      }
    }

    if (ma.lohnform === 'stundenlohn') {
      const fv = feiertagsverguetung(k);
      if (fv.stunden > 0) add('feiertag', 'Feiertagsvergütung', { tage: fv.tage.length, stunden: fv.stunden, hinweis: 'automatisch: ' + fv.tage.map((d) => fmt(d, false)).join(', ') });
    }
    if (!eigene.length && m.erledigt[ma.id]) add('info', 'Keine Änderungen', { hinweis: 'wie Vormonat' });
  }
  return { zeilen, fehlzeiten };
}
