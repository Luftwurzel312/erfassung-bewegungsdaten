/**
 * Oberfläche: 3 Schritte (Firma & Monat → Mitarbeitende → Prüfen & senden), geführter
 * Frage-Assistent je Kategorie, Kalenderauswahl, Stammdaten-Dialog, Ergebnisseite.
 * Bewusst ohne Framework: ein Zustand, eine render()-Funktion, Ereignis-Delegation.
 */
import {
  LAENDER, REGIONEN, Land, Region, MONATE, WT_KURZ, datum, teile, istDatum, wochentag, tageImMonat,
  monatsErster, monatsLetzter, monatPlus, fmt, monatsName, feiertag, tageVonBis,
} from './kalender';
import { jahreswerte } from './parameter';
import {
  Meldung, Mitarbeiter, Eintrag, Kontext, Befund, Feld, Typ, Werte, MaEntwurf, Status,
  KATEGORIEN, GRUPPEN, BESCHAEFTIGUNG, kat, kontext, sichtbareFelder, pruefeFeld, pruefeEintrag, pruefePerson,
  pruefeStammdaten, status, stundenJeTag, sollStunden, zeitraumwerte, feiertagsverguetung, verdienst, zahl,
  euro, std, meldungsBefunde, ort,
} from './regeln';
import { Konfig, STANDARD, mische } from './export/konfig';
import { erzeugeZeilen, Zeile } from './export/zeilen';
import { Ausgabe, lodasAscii, sbsCsv, uebergabeCsv } from './export/formate';
import { aufgaben, aufgabenText, Aufgabe } from './export/hinweise';
import { kodiere1252 } from './export/cp1252';

// ---------------------------------------------------------------- Zustand

type Ansicht = 'start' | 'personen' | 'pruefen' | 'fertig';
interface Assistent { typ: Typ; eintragId?: string; schritt: number; w: Werte; kalMonat: string; zeigeFehler: boolean }
interface StammDialog { neu: boolean; zeigeFehler: boolean; daten: MaEntwurf }
interface Ergebnis { ok: boolean; text: string; ablage?: string[] }

const SPEICHER = 'monatsmeldung.v2';
let m: Meldung;
let ansicht: Ansicht = 'start';
let aktivMa = '';
let wz: Assistent | null = null;
let stamm: StammDialog | null = null;
let loeschFrage: string | null = null;
let ergebnis: Ergebnis | null = null;
let mitServer = false;
let kanzlei = 'Ihr Lohnbüro';
let konfig: Konfig = STANDARD;
let ausgabeTab = 'hinweise';
/** In eingebetteten Ansichten (z. B. veröffentlichte Demo) sind Downloads gesperrt. */
const imRahmen = (() => { try { return window.self !== window.top; } catch { return true; } })();

const neueId = () => Math.random().toString(36).slice(2, 10);
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const heuteMonat = () => { const d = new Date(); return datum(d.getFullYear(), d.getMonth() + 1, 1).slice(0, 7); };
const ctx = (ma: Mitarbeiter): Kontext => kontext(m, ma);
const person = (id: string) => m.mitarbeiter.find((x) => x.id === id);
const ico = (pfad: string, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${pfad}"/></svg>`;
const STATUS_TEXT: Record<Status, string> = { offen: 'Noch offen', fehler: 'Bitte korrigieren', warnung: 'Hinweise', ok: 'Fertig' };
const chip = (s: Status) => `<span class="chip chip-${s}">${STATUS_TEXT[s]}</span>`;
const kopfFertig = () => !!(m.kopf.firma.trim() && m.kopf.mandantNr.trim() && m.kopf.monat);

function beispieldaten(): Meldung {
  const monat = heuteMonat();
  const tag = (t: number) => `${monat}-${String(t).padStart(2, '0')}`;
  const mofr = [true, true, true, true, true, false, false];
  return {
    kopf: { mandantNr: '20417', firma: 'Fischräucherei Beispiel GmbH', ansprechpartner: '', monat, land: 'SH', regionen: [] },
    mitarbeiter: [
      { id: 'm1', persNr: '1001', name: 'Anna Petersen', beschaeftigung: 'vollzeit', lohnform: 'gehalt', gehalt: 3450, wochenstunden: 40, arbeitstage: mofr, beispiel: true },
      { id: 'm2', persNr: '1002', name: 'Jonas Bruhn', beschaeftigung: 'teilzeit', lohnform: 'stundenlohn', stundenlohn: 16.5, wochenstunden: 24, arbeitstage: [true, true, true, false, false, false, false], beispiel: true },
      { id: 'm3', persNr: '1003', name: 'Mira Lorenzen', beschaeftigung: 'minijob', lohnform: 'stundenlohn', stundenlohn: 14, wochenstunden: 10, arbeitstage: [false, false, false, true, true, false, false], beispiel: true },
      { id: 'm4', persNr: '1004', name: 'Tim Hansen', beschaeftigung: 'vollzeit', lohnform: 'gehalt', gehalt: 3100, wochenstunden: 40, arbeitstage: mofr, beispiel: true },
    ],
    eintraege: [
      { id: neueId(), maId: 'm1', typ: 'urlaub', w: { zeitraum_von: tag(12), zeitraum_bis: tag(16) } },
      { id: neueId(), maId: 'm3', typ: 'arbeitszeit', w: { stunden: '46' } },
      { id: neueId(), maId: 'm4', typ: 'krank', w: { zeitraum_von: tag(5), zeitraum_bis: tag(9), au: 'ja', unfall: 'nein', vorher: 'nein' } },
      { id: neueId(), maId: 'm4', typ: 'einmalzahlung', w: { art: 'praemie', betrag: '250' } },
    ],
    erledigt: {}, hinweiseGelesen: false, nachricht: '',
  };
}

function laden() {
  try {
    const roh = localStorage.getItem(SPEICHER) ?? localStorage.getItem('monatsmeldung.v1');
    if (roh) {
      const x = JSON.parse(roh);
      m = x.m; ansicht = x.ansicht || 'start'; aktivMa = x.aktivMa || '';
      m.kopf.regionen ??= []; // Daten aus Version 1
      return;
    }
  } catch { /* defekter Speicher: neu beginnen */ }
  m = beispieldaten();
}
function speichern() {
  try { localStorage.setItem(SPEICHER, JSON.stringify({ m, ansicht: ansicht === 'fertig' ? 'pruefen' : ansicht, aktivMa })); } catch { /* privat/voll */ }
}

// ---------------------------------------------------------------- Bausteine

function befundListe(bf: Befund[], leer = ''): string {
  if (!bf.length) return leer;
  const rang = { fehler: 0, warnung: 1, info: 2 };
  return `<ul class="befunde">${[...bf].sort((a, b) => rang[a.stufe] - rang[b.stufe]).map((b) =>
    `<li class="bf bf-${b.stufe}"><span class="bf-marke">${b.stufe === 'fehler' ? 'Fehler' : b.stufe === 'warnung' ? 'Achtung' : 'Info'}</span><span>${esc(b.text)}</span></li>`).join('')}</ul>`;
}

function wochentageText(t: boolean[]) {
  if (t.slice(0, 5).every(Boolean) && !t[5] && !t[6]) return 'Mo–Fr';
  return WT_KURZ.filter((_, i) => t[i]).join(', ') || 'keine Tage';
}
function maZeile(ma: Mitarbeiter) {
  const geld = ma.lohnform === 'gehalt' ? `Gehalt ${euro(ma.gehalt || 0)}` : `${euro(ma.stundenlohn || 0)} je Std.`;
  return `${BESCHAEFTIGUNG[ma.beschaeftigung]} · ${geld} · ${ma.wochenstunden.toLocaleString('de-DE')} Std./Woche · ${wochentageText(ma.arbeitstage)}`;
}

function eintragKurz(e: Eintrag, ma: Mitarbeiter): string {
  const k = kat(e.typ), w = e.w;
  const opt = (key: string) => k.felder.find((f) => f.key === key)?.optionen?.find((o) => o.wert === w[key])?.text;
  const n = (key: string) => zahl(w[key]) || 0;
  if (k.zeitraum) {
    const zr = zeitraumwerte(e, ctx(ma));
    const teile = [`${fmt(w.zeitraum_von, false)}–${fmt(w.zeitraum_bis, false)}`];
    if (zr) teile.push(`${zr.tage.toLocaleString('de-DE')} Arbeitstag${zr.tage === 1 ? '' : 'e'}`, std(zr.stunden));
    if (e.typ === 'mutterschutz') teile.unshift(opt('art') || '');
    if (e.typ === 'krank') {
      teile.push(w.au === 'ja' ? 'mit Krankmeldung' : w.au === 'nein' ? 'ohne Krankmeldung' : 'Krankmeldung unklar');
      if (zr && zr.tageBezahlt < zr.tage) teile.push(`${zr.tage - zr.tageBezahlt} Tag(e) ohne Lohnfortzahlung`);
    }
    return teile.filter(Boolean).join(' · ');
  }
  switch (e.typ) {
    case 'arbeitszeit': return std(n('stunden'));
    case 'ueberstunden': return `${std(n('stunden'))} · ${opt('verwendung')}`;
    case 'zuschlaege': return ([['nacht', 'nachts'], ['sonntag', 'sonntags'], ['feiertag', 'feiertags']] as const)
      .filter(([key]) => n(key)).map(([key, t]) => `${std(n(key))} ${t}`).join(' · ');
    case 'einmalzahlung': case 'sachbezug': return `${opt('art')}${w.form === 'geld' ? ' (Geld)' : ''} · ${euro(n('betrag'))}`;
    case 'vorschuss': return `${euro(n('betrag'))} am ${fmt(w.datum)}`;
    case 'austritt': return `Letzter Tag ${fmt(w.datum)} · ${opt('grund')}`;
    case 'sonstiges': return (w.text || '').length > 80 ? w.text.slice(0, 80) + ' …' : w.text;
  }
  return '';
}

// ---------------------------------------------------------------- Kopf

function kopfleiste(): string {
  const schritte: [Ansicht, string][] = [['start', 'Firma & Monat'], ['personen', 'Mitarbeitende'], ['pruefen', 'Prüfen & senden']];
  const aktiv = ansicht === 'fertig' ? 3 : schritte.findIndex(([a]) => a === ansicht);
  return `<header class="kopfbar"><div class="kopf-innen">
    <div class="marke"><span class="marke-zeichen" aria-hidden="true">${ico('M4 4h16v16H4zM4 9h16M9 4v16')}</span>
      <div><div class="marke-name">Monatsmeldung</div><div class="marke-sub">${esc(kanzlei)}${m.kopf.firma ? ` · ${esc(m.kopf.firma)}` : ''}</div></div></div>
    <nav class="stepper" aria-label="Fortschritt">${schritte.map(([ziel, text], i) => `<button class="st ${i === aktiv ? 'st-aktiv' : ''} ${i < aktiv ? 'st-fertig' : ''}" data-a="gehe" data-ziel="${ziel}" ${i > aktiv && !kopfFertig() ? 'disabled' : ''} ${i === aktiv ? 'aria-current="step"' : ''}>
        <span class="st-nr">${i < aktiv ? '✓' : i + 1}</span><span class="st-text">${text}</span></button>`).join('')}</nav>
    <div class="monat-pille" title="Abrechnungsmonat">Abrechnungsmonat: <strong>${monatKurz(m.kopf.monat)}</strong></div>
  </div></header>`;
}

/** „2026-11“ → „11.2026“ wie im Mandantenportal. */
function monatKurz(monat: string): string {
  const [j, mo] = monat.split('-');
  return `${mo}.${j}`;
}

/** Heller Seitenkopf mit großem Titel (Portal-Stil). `meta` als Paare Bezeichnung/Wert. */
function seitenkopf(titel: string, opt: { eyebrow?: string; lead?: string; meta?: [string, string][]; rechts?: string; breite?: string } = {}): string {
  return `<section class="seitenkopf"><div class="seitenkopf-innen ${opt.breite ?? ''}">
    <div class="seitenkopf-text">
      ${opt.eyebrow ? `<p class="eyebrow">${opt.eyebrow}</p>` : ''}
      <h1>${titel}</h1>
      ${opt.lead ? `<p class="lead">${opt.lead}</p>` : ''}
      ${opt.meta?.length ? `<dl class="meta">${opt.meta.map(([k, v]) => `<div><dt>${k}:</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
    </div>
    ${opt.rechts ? `<div class="seitenkopf-rechts">${opt.rechts}</div>` : ''}
  </div></section>`;
}

function kopfMeta(): [string, string][] {
  return [
    ...(m.kopf.mandantNr ? [['Mandantennummer', esc(m.kopf.mandantNr)] as [string, string]] : []),
    ['Abrechnungsmonat', monatKurz(m.kopf.monat)],
    ['Bundesland', esc(LAENDER[m.kopf.land])],
  ];
}

// ---------------------------------------------------------------- Schritt 1

function seiteStart(): string {
  const monate: string[] = [];
  for (let i = -3; i <= 1; i++) monate.push(monatPlus(heuteMonat(), i));
  if (!monate.includes(m.kopf.monat)) monate.unshift(m.kopf.monat);
  const fehlt = [!m.kopf.firma.trim() && 'Firmenname', !m.kopf.mandantNr.trim() && 'Mandantennummer'].filter(Boolean);
  const regionen = (Object.keys(REGIONEN) as Region[]).filter((r) => REGIONEN[r].land === m.kopf.land);
  return `<main>${seitenkopf('Für welchen Monat melden Sie?', {
    eyebrow: 'Schritt 1 von 3', breite: 'seite-schmal',
    lead: 'Sie gehen gleich Person für Person durch und tippen an, was im Monat passiert ist. Wir fragen nur, was wir für die Lohnabrechnung brauchen, und prüfen Ihre Angaben sofort.',
  })}
  <div class="seite seite-schmal stapel">
  <section class="karte start">
    <h2 class="kt">Abrechnung</h2>
    <div class="formgrid">
      <label class="feld"><span>Abrechnungsmonat</span>
        <select id="k-monat" data-k="monat">${monate.map((x) => `<option value="${x}" ${x === m.kopf.monat ? 'selected' : ''}>${monatsName(x)}</option>`).join('')}</select></label>
      <label class="feld"><span>Bundesland des Betriebs</span>
        <select id="k-land" data-k="land">${Object.entries(LAENDER).map(([k, n]) => `<option value="${k}" ${k === m.kopf.land ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <small>Für die Feiertage. Maßgeblich ist der Ort, an dem gearbeitet wird.</small></label>
      ${regionen.length ? `<fieldset class="feld feld-breit"><legend>Gibt es bei Ihnen zusätzliche örtliche Feiertage?</legend>
        ${regionen.map((r) => `<label class="check"><input type="checkbox" data-a="region" data-r="${r}" ${m.kopf.regionen.includes(r) ? 'checked' : ''}><span>${esc(REGIONEN[r].text)}<br><small class="leise">${esc(REGIONEN[r].hilfe)}</small></span></label>`).join('')}
      </fieldset>` : ''}
    </div>
    ${feiertagsZeile()}
  </section>
  <section class="karte">
    <h2 class="kt">Allgemeine Angaben</h2>
    <div class="formgrid">
      <label class="feld"><span>Firmenname</span><input id="k-firma" data-k="firma" value="${esc(m.kopf.firma)}" autocomplete="organization"></label>
      <label class="feld"><span>Ihre Mandantennummer</span><input id="k-mandant" data-k="mandantNr" value="${esc(m.kopf.mandantNr)}" inputmode="numeric"><small>Steht auf jeder Lohnabrechnung oben rechts.</small></label>
      <label class="feld feld-breit"><span>Ihr Name (für Rückfragen)</span><input id="k-ap" data-k="ansprechpartner" value="${esc(m.kopf.ansprechpartner)}" autocomplete="name" placeholder="optional"></label>
    </div>
  </section>
  <div class="aktionen">
    ${fehlt.length ? `<span class="leise">Noch nötig: ${fehlt.join(', ')}</span>` : ''}
    <button class="btn btn-haupt" data-a="gehe" data-ziel="personen" ${fehlt.length ? 'disabled' : ''}>Weiter zu den Mitarbeitenden</button>
  </div>
  ${m.mitarbeiter.some((x) => x.beispiel) ? '<p class="beispiel-hinweis">Diese Demo startet mit Beispieldaten (erfundene Firma und Personen). <button class="link" data-a="leeren">Alles leeren und neu beginnen</button></p>' : ''}
  </div></main>`;
}

function feiertagsZeile(): string {
  const liste: string[] = [];
  for (const d of tageVonBis(monatsErster(m.kopf.monat), monatsLetzter(m.kopf.monat))) {
    const f = feiertag(d, m.kopf.land, m.kopf.regionen);
    if (f) liste.push(`${f} (${WT_KURZ[wochentag(d)]}, ${fmt(d, false)})`);
  }
  const mn = MONATE[teile(monatsErster(m.kopf.monat)).m - 1];
  return `<p class="feiertage">${liste.length ? `Feiertage im ${mn}: ${esc(liste.join(', '))}` : `Im ${monatsName(m.kopf.monat)} gibt es in ${LAENDER[m.kopf.land]} keinen gesetzlichen Feiertag.`}</p>`;
}

// ---------------------------------------------------------------- Schritt 2

function seitePersonen(): string {
  if (!m.mitarbeiter.length) return `<main>${seitenkopf('Noch keine Mitarbeitenden', { eyebrow: 'Schritt 2 von 3', breite: 'seite-schmal', meta: kopfMeta() })}
    <div class="seite seite-schmal"><section class="karte leer">
    <h2 class="kt">Mitarbeitende anlegen</h2><p class="lead">Legen Sie die Personen an, die Sie in diesem Monat bezahlen. Das geht schnell und muss nur einmal gemacht werden.</p>
    <div class="aktionen"><button class="btn btn-haupt" data-a="ma-neu">Person hinzufügen</button></div></section></div></main>`;
  if (!person(aktivMa)) aktivMa = m.mitarbeiter[0].id;
  const fertig = m.mitarbeiter.filter((x) => ['ok', 'warnung'].includes(status(x, m))).length;
  return `<main>${seitenkopf(`Mitarbeitende im ${monatsName(m.kopf.monat)}`, {
    eyebrow: 'Schritt 2 von 3', meta: kopfMeta(),
    rechts: '<button class="btn btn-haupt" data-a="gehe" data-ziel="pruefen">Alles prüfen und senden</button>',
  })}
  <div class="seite personen">
    <aside class="liste" aria-label="Mitarbeitende">
      <div class="liste-kopf"><h2 class="kt">Mitarbeitende</h2><span class="zaehler">${fertig} von ${m.mitarbeiter.length} fertig</span></div>
      <div class="fortschritt"><span style="width:${(fertig / m.mitarbeiter.length) * 100}%"></span></div>
      <ul>${m.mitarbeiter.map((x) => { const s = status(x, m); return `<li><button class="person ${x.id === aktivMa ? 'person-aktiv' : ''}" data-a="ma-waehle" data-id="${x.id}" ${x.id === aktivMa ? 'aria-current="true"' : ''}>
        <span class="punkt punkt-${s}" aria-hidden="true"></span>
        <span class="person-text"><span class="person-name">${esc(x.name)}</span><span class="person-sub">Nr. ${esc(x.persNr)} · ${BESCHAEFTIGUNG[x.beschaeftigung]}</span></span>
        <span class="sr">${STATUS_TEXT[s]}</span></button></li>`; }).join('')}</ul>
      <button class="btn voll" data-a="ma-neu">+ Person hinzufügen</button>
    </aside>
    <div class="detail">${detail(person(aktivMa)!)}</div>
  </div></main>`;
}

const KUERZEL: Partial<Record<Typ, string>> = { urlaub: 'U', krank: 'K', kindkrank: 'KK', unbezahlt: 'UF', mutterschutz: 'M' };

function monatsleiste(ma: Mitarbeiter): string {
  const [j, mo] = m.kopf.monat.split('-').map(Number);
  const n = tageImMonat(j, mo);
  const zr = m.eintraege.filter((e) => e.maId === ma.id && kat(e.typ).zeitraum && istDatum(e.w.zeitraum_von) && istDatum(e.w.zeitraum_bis));
  const austritt = m.eintraege.find((e) => e.maId === ma.id && e.typ === 'austritt')?.w.datum;
  let html = '';
  for (let t = 1; t <= n; t++) {
    const d = datum(j, mo, t), wt = wochentag(d), ft = feiertag(d, m.kopf.land, m.kopf.regionen);
    const hier = zr.filter((e) => d >= e.w.zeitraum_von && d <= e.w.zeitraum_bis);
    const typ = hier[0]?.typ;
    const cls = ['tag', ma.arbeitstage[wt] ? '' : 'tag-frei', ft ? 'tag-feiertag' : '', typ ? `tag-${typ}` : '', hier.length > 1 ? 'tag-konflikt' : '',
      (ma.eintritt && d < ma.eintritt) || (austritt && d > austritt) ? 'tag-aus' : ''].filter(Boolean).join(' ');
    const titel = [`${WT_KURZ[wt]} ${fmt(d)}`, ft, ...hier.map((e) => kat(e.typ).titel), ma.arbeitstage[wt] ? '' : 'kein Arbeitstag'].filter(Boolean).join(' · ');
    html += `<div class="${cls}" title="${esc(titel)}"><span class="tag-wt">${WT_KURZ[wt]}</span><span class="tag-nr">${t}</span><span class="tag-k">${hier.length > 1 ? '!' : typ ? KUERZEL[typ] : ft ? 'F' : ''}</span></div>`;
  }
  return `<div class="leiste-wrap"><div class="leiste" style="--tage:${n}" role="img" aria-label="Monatsübersicht ${esc(ma.name)}">${html}</div>
    <div class="legende"><span><i class="lg lg-urlaub"></i>Urlaub</span><span><i class="lg lg-krank"></i>Krank</span><span><i class="lg lg-kindkrank"></i>Kind krank</span><span><i class="lg lg-unbezahlt"></i>Unbezahlt / Elternzeit</span><span><i class="lg lg-feiertag"></i>Feiertag</span><span><i class="lg lg-frei"></i>Kein Arbeitstag</span></div></div>`;
}

function detail(ma: Mitarbeiter): string {
  const eigene = m.eintraege.filter((e) => e.maId === ma.id);
  const bf = pruefePerson(ma, m);
  const vorname = ma.name.split(' ')[0];
  const mn = MONATE[teile(monatsErster(m.kopf.monat)).m - 1];
  const naechste = m.mitarbeiter[m.mitarbeiter.findIndex((x) => x.id === ma.id) + 1];
  const k = ctx(ma);
  const fv = ma.lohnform === 'stundenlohn' ? feiertagsverguetung(k) : null;
  const fehltStunden = ma.lohnform === 'stundenlohn' && !eigene.some((e) => e.typ === 'arbeitszeit');
  const kats = KATEGORIEN.filter((x) => !x.nurStundenlohn || ma.lohnform === 'stundenlohn');
  return `<section class="karte">
    <div class="detail-kopf">
      <div><h2 class="person-titel">${esc(ma.name)}</h2>
        <dl class="meta"><div><dt>Personalnummer:</dt><dd>${esc(ma.persNr)}</dd></div><div><dt>Beschäftigung:</dt><dd>${esc(maZeile(ma))}</dd></div></dl></div>
      <div class="detail-kopf-r">${chip(status(ma, m))}<button class="btn btn-haupt" data-a="ma-bearbeiten" data-id="${ma.id}">Stammdaten bearbeiten</button></div>
    </div>
    ${monatsleiste(ma)}
    </section>
    <section class="karte frage-block">
      <h2 class="kt">Was war im ${mn} bei ${esc(vorname)}?</h2>
      <p class="leise">Tippen Sie an, was zutrifft. Sie können mehrere Dinge nacheinander eintragen.${ma.lohnform === 'gehalt' ? ' Das Gehalt läuft automatisch – melden Sie nur, was davon abweicht.' : ''}</p>
      ${GRUPPEN.map(([g, titel]) => `<div class="gruppe"><h3>${titel}</h3><div class="kacheln">${kats.filter((x) => x.gruppe === g).map((x) => {
        const anzahl = eigene.filter((e) => e.typ === x.typ).length;
        const pflicht = x.typ === 'arbeitszeit' && fehltStunden;
        return `<button class="kachel ${pflicht ? 'kachel-pflicht' : ''}" data-a="wz-start" data-typ="${x.typ}">
          ${ico(x.symbol, 'kachel-ico')}
          <span class="kachel-titel">${esc(x.titel)}${anzahl ? `<span class="kachel-zahl">${anzahl}</span>` : ''}</span>
          <span class="kachel-text">${esc(x.kurz)}</span>${pflicht ? '<span class="kachel-marke">Bitte eintragen</span>' : ''}</button>`;
      }).join('')}</div></div>`).join('')}
    </section>
    <section class="karte eintraege">
      <h2 class="kt">Eingetragen für ${mn}</h2>
      ${eigene.length ? `<ul class="eintrag-liste">${eigene.map((e) => {
        const eb = pruefeEintrag(e, k, m);
        const s = eb.some((x) => x.stufe === 'fehler') ? 'fehler' : eb.some((x) => x.stufe === 'warnung') ? 'warnung' : 'ok';
        return `<li class="eintrag">
          <span class="eintrag-ico eintrag-${e.typ}">${ico(kat(e.typ).symbol)}</span>
          <div class="eintrag-text"><strong>${esc(kat(e.typ).titel)}</strong><span>${esc(eintragKurz(e, ma))}</span></div>
          <span class="punkt punkt-${s}" title="${s === 'ok' ? 'In Ordnung' : s === 'fehler' ? 'Fehler' : 'Hinweis'}"></span>
          <div class="eintrag-akt"><button class="btn btn-klein" data-a="wz-bearbeiten" data-id="${e.id}">Ändern</button>
          ${loeschFrage === e.id ? `<button class="btn btn-klein btn-gefahr" data-a="loeschen" data-id="${e.id}">Wirklich löschen</button><button class="btn btn-klein" data-a="loeschen-nein">Nein</button>`
            : `<button class="btn btn-klein btn-leise" data-a="loeschen-frage" data-id="${e.id}" aria-label="Eintrag löschen">Löschen</button>`}</div></li>`;
      }).join('')}</ul>` : '<p class="leer-text">Noch nichts eingetragen.</p>'}
      ${fv && fv.tage.length ? `<p class="auto">Automatisch berücksichtigt: ${fv.tage.length} Feiertag(e) mit ${std(fv.stunden)} (${fv.tage.map((d) => fmt(d, false)).join(', ')}). Feiertage werden bezahlt, auch ohne Arbeit.</p>` : ''}
      ${ma.beschaeftigung === 'minijob' ? `<p class="auto">Geschätzter Verdienst im Monat: <strong>${euro(verdienst(m, ma))}</strong> (Grenze ${euro(jahreswerte(m.kopf.monat).werte.minijobGrenze)}).</p>` : ''}
    ${bf.length ? `<div class="pruef-block"><h3 class="kt-klein">Prüfung</h3>${befundListe(bf)}</div>` : ''}
    <div class="detail-fuss">
      ${eigene.length ? '<span></span>' : `<label class="check"><input type="checkbox" id="erl-${ma.id}" data-a="erledigt" data-id="${ma.id}" ${m.erledigt[ma.id] ? 'checked' : ''}>
        <span>Bei ${esc(vorname)} gab es nichts Besonderes. ${ma.lohnform === 'gehalt' ? 'Gehalt wie immer.' : ''}</span></label>`}
      ${naechste ? `<button class="btn btn-haupt" data-a="ma-waehle" data-id="${naechste.id}">Weiter zu ${esc(naechste.name.split(' ')[0])}</button>`
        : '<button class="btn btn-haupt" data-a="gehe" data-ziel="pruefen">Alles prüfen und senden</button>'}
    </div>
    </section>`;
}

// ---------------------------------------------------------------- Schritt 3

function seitePruefen(): string {
  const { zeilen } = erzeugeZeilen(m);
  const liste = m.mitarbeiter.map((ma) => ({ ma, s: status(ma, m), bf: pruefePerson(ma, m) }));
  const offen = liste.filter((x) => x.s === 'fehler' || x.s === 'offen');
  const warnungen = liste.some((x) => x.bf.some((b) => b.stufe === 'warnung'));
  const senden = !offen.length && m.mitarbeiter.length > 0 && (!warnungen || m.hinweiseGelesen);
  const mb = meldungsBefunde(m);
  return `<main>${seitenkopf(`Alles prüfen und an ${esc(kanzlei)} senden`, {
    eyebrow: 'Schritt 3 von 3', breite: 'seite-mittel', meta: kopfMeta(),
    lead: offen.length ? `Bei ${offen.length} ${offen.length === 1 ? 'Person fehlt' : 'Personen fehlt'} noch etwas. Tippen Sie auf den Namen, um es zu ergänzen.` : 'Alle Personen sind bearbeitet. Bitte lesen Sie die Hinweise und senden Sie dann ab.',
  })}
  <div class="seite seite-mittel stapel">
  ${mb.length ? `<section class="karte"><h2 class="kt">Hinweise zur Meldung</h2>${befundListe(mb)}</section>` : ''}
  <section class="karte">
    <h2 class="kt">Übersicht</h2>
    <div class="tabelle-wrap"><table class="uebersicht">
      <thead><tr><th>Person</th><th>Gemeldet</th><th>Status</th></tr></thead>
      <tbody>${liste.map(({ ma, s, bf }) => {
        const eigene = m.eintraege.filter((e) => e.maId === ma.id);
        return `<tr><td><button class="link" data-a="ma-waehle" data-id="${ma.id}">${esc(ma.name)}</button><div class="leise">Nr. ${esc(ma.persNr)}</div></td>
          <td>${eigene.length ? `<ul class="mini">${eigene.map((e) => `<li><strong>${esc(kat(e.typ).titel)}:</strong> ${esc(eintragKurz(e, ma))}</li>`).join('')}</ul>` : m.erledigt[ma.id] ? 'Keine Änderungen' : '<span class="leise">–</span>'}
          ${bf.length ? befundListe(bf) : ''}</td><td>${chip(s)}</td></tr>`;
      }).join('')}</tbody></table></div>
    <details class="vorschau"><summary>So kommt die Meldung bei uns an (${zeilen.length} Zeilen)</summary>
      <div class="tabelle-wrap">${zeilenTabelle(zeilen)}</div></details>
  </section>
  <section class="karte">
    <h2 class="kt">Absenden</h2>
    <label class="feld feld-breit"><span>Nachricht an uns (optional)</span>
      <textarea id="nachricht" data-k="nachricht" rows="3" placeholder="z. B. Herr Hansen bekommt ab nächstem Monat mehr Gehalt.">${esc(m.nachricht)}</textarea></label>
    ${warnungen ? `<label class="check"><input type="checkbox" id="gelesen" data-a="gelesen" ${m.hinweiseGelesen ? 'checked' : ''}><span>Ich habe die Hinweise gelesen. Offene Punkte klären wir bei Bedarf mit Ihnen.</span></label>` : ''}
    <div class="aktionen">
      <button class="btn" data-a="gehe" data-ziel="personen">Zurück</button>
      <button class="btn btn-haupt" data-a="senden" ${senden ? '' : 'disabled'}>Meldung für ${monatsName(m.kopf.monat)} senden</button>
    </div>
  </section></div></main>`;
}

function zeilenTabelle(zeilen: Zeile[]): string {
  const f = (n?: number) => (n ? n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
  return `<table class="zeilen"><thead><tr><th>Pers.-Nr.</th><th>Name</th><th>Was</th><th>Von</th><th>Bis</th><th class="r">Tage</th><th class="r">Std.</th><th class="r">Betrag</th><th>Hinweis</th></tr></thead>
    <tbody>${zeilen.map((z) => `<tr><td>${esc(z.persNr)}</td><td>${esc(z.name)}</td><td>${esc(z.bezeichnung)}</td><td>${z.von ? fmt(z.von, false) : ''}</td><td>${z.bis ? fmt(z.bis, false) : ''}</td>
      <td class="r">${f(z.tage)}</td><td class="r">${f(z.stunden)}</td><td class="r">${f(z.betrag)}</td><td>${esc(z.hinweis)}</td></tr>`).join('')}</tbody></table>`;
}

// ---------------------------------------------------------------- Ergebnis (für das Lohnbüro)

interface Paket { lodas: Ausgabe; sbs: Ausgabe; csv: Ausgabe; liste: Aufgabe[]; hinweise: Ausgabe }
function paket(): Paket {
  const liste = aufgaben(m, konfig);
  return {
    lodas: lodasAscii(m, konfig), sbs: sbsCsv(m, konfig), csv: uebergabeCsv(m, konfig), liste,
    hinweise: { dateiname: `${m.kopf.mandantNr}_${m.kopf.monat}_Hinweise.txt`, text: aufgabenText(m, liste), probleme: [] },
  };
}

function seiteFertig(): string {
  const e = ergebnis!, p = paket();
  const probleme = [...new Set([...p.lodas.probleme, ...p.sbs.probleme])];
  const tabs: [string, string, Ausgabe | null][] = [
    ['hinweise', `Hinweisliste (${p.liste.length})`, p.hinweise], ['lodas', 'DATEV LODAS', p.lodas], ['sbs', 'SBS Lohn', p.sbs], ['csv', 'Übergabe-CSV', p.csv], ['json', 'JSON', null],
  ];
  const aktiv = tabs.find(([id]) => id === ausgabeTab) ?? tabs[0];
  const inhalt = aktiv[0] === 'hinweise' ? aufgabenHtml(p.liste)
    : aktiv[0] === 'json' ? `<pre class="code">${esc(JSON.stringify(m, null, 2))}</pre>`
      : `<pre class="code">${esc(aktiv[2]!.text)}</pre>`;
  return `<main>${seitenkopf(e.ok ? 'Danke, Ihre Meldung ist da.' : 'Demo: Meldung erstellt', {
    breite: 'seite-mittel', lead: esc(e.text), meta: kopfMeta(),
    rechts: '<div class="haken" aria-hidden="true">' + ico('M5 12.5 10 17 19 7') + '</div>',
  })}
  <div class="seite seite-mittel stapel">
  <section class="karte fertig">
    ${e.ablage?.length ? `<p class="leise">Gespeichert: ${e.ablage.map((d) => `<code>${esc(d)}</code>`).join(', ')}</p>` : ''}
    ${mitServer ? '' : `
    <h2 class="kt">Für das Lohnbüro</h2>
    <p class="leise">Diese Ansicht sieht der Mandant im Echtbetrieb nicht. Die Dateien werden in Windows-1252 mit CRLF gespeichert, wie LODAS und SBS sie erwarten.</p>
    ${!konfig.geprueft ? befundListe([{ stufe: 'warnung', text: 'Lohnarten-Zuordnung ist ein Beispiel (konfig/lohnarten.standard.json, "geprueft": false). Vor dem ersten echten Import abstimmen und mit einem Testmandanten importieren.' }]) : ''}
    ${probleme.length ? befundListe(probleme.map((t) => ({ stufe: 'fehler' as const, text: t }))) : ''}
    <div class="segment" role="tablist">${tabs.map(([id, text]) => `<button type="button" role="tab" class="seg ${id === aktiv[0] ? 'seg-an' : ''}" aria-selected="${id === aktiv[0]}" data-a="tab" data-tab="${id}">${text}</button>`).join('')}</div>
    <div class="code-kopf"><span class="leise">${aktiv[2] ? esc(aktiv[2].dateiname) : 'Vollständige Meldung mit allen Antworten'}</span>
      <span><button class="btn btn-klein" data-a="kopieren">Kopieren</button> ${aktiv[2] && !imRahmen ? `<button class="btn btn-klein btn-zart" data-a="download" data-tab="${aktiv[0]}">Herunterladen</button>` : ''}</span></div>
    <div id="ausgabe">${inhalt}</div>`}
    <div class="aktionen"><button class="btn" data-a="gehe" data-ziel="pruefen">Zurück zur Übersicht</button>
      <button class="btn btn-haupt" data-a="neuer-monat">Nächsten Monat beginnen</button></div>
  </section></div></main>`;
}

function aufgabenHtml(liste: Aufgabe[]): string {
  if (!liste.length) return '<p class="alles-ok">Keine besonderen Aufgaben.</p>';
  return `<div class="tabelle-wrap"><table><thead><tr><th>Person</th><th>Thema</th><th>Aufgabe</th></tr></thead><tbody>${liste.map((a) =>
    `<tr><td>${esc(a.persNr ? `${a.persNr} ${a.name}` : a.name)}</td><td><span class="chip chip-offen">${esc(a.thema)}</span></td><td>${esc(a.text)}${a.frist ? `<div class="leise">Frist: ${esc(a.frist)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

// ---------------------------------------------------------------- Assistent

const wzFelder = (): Feld[] => sichtbareFelder(kat(wz!.typ), wz!.w, ctx(person(aktivMa)!));
const hatWert = (f: Feld) => (f.art === 'zeitraum' ? !!(wz!.w[`${f.key}_von`] || wz!.w[`${f.key}_bis`]) : !!(wz!.w[f.key] ?? '').trim());

function dialogAssistent(): string {
  const a = wz!, k = kat(a.typ), ma = person(aktivMa)!, felder = wzFelder();
  const zus = a.schritt >= felder.length, f = felder[a.schritt];
  return `<div class="overlay" data-a="wz-hintergrund"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="wz-titel">
    <div class="dlg-kopf"><span class="dlg-ico">${ico(k.symbol)}</span>
      <div><div class="eyebrow">${esc(ma.name)} · ${monatsName(m.kopf.monat)}</div><h2 id="wz-titel">${esc(k.titel)}</h2></div>
      <button class="x" data-a="wz-zu" aria-label="Schließen">${ico('M6 6l12 12M18 6 6 18')}</button></div>
    <div class="schrittbalken" aria-hidden="true">${Array.from({ length: felder.length + 1 }, (_, i) => `<span class="${i < a.schritt ? 'sb-fertig' : i === a.schritt ? 'sb-aktiv' : ''}"></span>`).join('')}</div>
    <p class="schritt-text">${zus ? 'Zusammenfassung' : `Frage ${a.schritt + 1} von ${felder.length}`}</p>
    <div class="dlg-inhalt">${zus ? zusammenfassung() : frage(f)}</div>
    <div class="dlg-fuss"><button class="btn" data-a="wz-zurueck">${a.schritt === 0 ? 'Abbrechen' : 'Zurück'}</button>
      ${zus ? speichernKnopf() : `<button class="btn btn-haupt" data-a="wz-weiter">${!f.pflicht && !hatWert(f) ? 'Überspringen' : 'Weiter'}</button>`}</div>
  </div></div>`;
}

function frage(f: Feld): string {
  const w = wz!.w, id = `wz-${f.key}`;
  let eingabe = '';
  switch (f.art) {
    case 'zeitraum': eingabe = kalender(f); break;
    case 'auswahl': eingabe = `<div class="optionen" role="radiogroup" aria-labelledby="frage">${f.optionen!.map((o) => `<button type="button" class="option ${w[f.key] === o.wert ? 'option-an' : ''}" role="radio" aria-checked="${w[f.key] === o.wert}" data-a="wz-option" data-key="${f.key}" data-wert="${o.wert}">
        <span class="radio" aria-hidden="true"></span><span><span class="option-text">${esc(o.text)}</span>${o.hilfe ? `<span class="option-hilfe">${esc(o.hilfe)}</span>` : ''}</span></button>`).join('')}</div>`; break;
    case 'datum': eingabe = `<input class="gross" type="date" id="${id}" data-f="${f.key}" value="${esc(w[f.key] || '')}">`; break;
    case 'text': eingabe = `<textarea class="gross" id="${id}" data-f="${f.key}" rows="4">${esc(w[f.key] || '')}</textarea>`; break;
    default: {
      const einheit = f.art === 'stunden' ? 'Stunden' : f.art === 'betrag' ? '€' : '';
      eingabe = `<div class="zahl-eingabe"><input class="gross" id="${id}" data-f="${f.key}" inputmode="decimal" autocomplete="off" value="${esc(w[f.key] || '')}" placeholder="${f.art === 'betrag' ? '0,00' : '0'}">${einheit ? `<span class="einheit">${einheit}</span>` : ''}</div>`;
      if (wz!.typ === 'arbeitszeit') eingabe += `<p class="leise">Zum Vergleich: Laut Vertrag sind es etwa ${std(sollStunden(ctx(person(aktivMa)!)))} in diesem Monat.</p>`;
    }
  }
  return `<h3 class="frage" id="frage">${esc(f.frage)}${f.pflicht ? '' : ' <span class="optional">optional</span>'}</h3>
    ${f.hilfe ? `<p class="hilfe">${esc(f.hilfe)}</p>` : ''}
    <div class="eingabe">${eingabe}</div><div id="wz-live" aria-live="polite">${liveBefunde(f)}</div>`;
}

function liveBefunde(f: Feld): string {
  const ma = person(aktivMa)!;
  let bf = pruefeFeld(f, wz!.w, ctx(ma));
  if (!wz!.zeigeFehler) bf = bf.filter((b) => b.stufe !== 'fehler' || hatWert(f));
  let rechnung = '';
  if (f.art === 'zeitraum') {
    const zr = zeitraumwerte({ id: '', maId: ma.id, typ: wz!.typ, w: wz!.w }, ctx(ma));
    if (zr && !bf.some((b) => b.stufe === 'fehler')) rechnung = `<div class="rechnung"><span><strong>${zr.kalendertage}</strong> Kalendertag${zr.kalendertage === 1 ? '' : 'e'}</span><span><strong>${zr.tage.toLocaleString('de-DE')}</strong> Arbeitstag${zr.tage === 1 ? '' : 'e'} im Monat</span><span><strong>${std(zr.stunden)}</strong> (${std(stundenJeTag(ma))} je Tag)</span></div>`;
  }
  return rechnung + befundListe(bf);
}

function kalender(f: Feld): string {
  const a = wz!, ma = person(aktivMa)!;
  const von = a.w[`${f.key}_von`], bis = a.w[`${f.key}_bis`];
  const [j, mo] = a.kalMonat.split('-').map(Number);
  const andere = m.eintraege.filter((e) => e.maId === ma.id && e.id !== a.eintragId && kat(e.typ).zeitraum && istDatum(e.w.zeitraum_von) && istDatum(e.w.zeitraum_bis));
  let raster = '';
  for (let i = 0; i < wochentag(datum(j, mo, 1)); i++) raster += '<span class="kz kz-leer"></span>';
  for (let t = 1; t <= tageImMonat(j, mo); t++) {
    const d = datum(j, mo, t), wt = wochentag(d), ft = feiertag(d, m.kopf.land, m.kopf.regionen);
    const belegt = andere.find((e) => d >= e.w.zeitraum_von && d <= e.w.zeitraum_bis);
    const an = istDatum(von) && d >= von && d <= (istDatum(bis) ? bis : von);
    const cls = ['kz', ma.arbeitstage[wt] ? '' : 'kz-frei', ft ? 'kz-feiertag' : '', belegt ? `kz-belegt kz-${belegt.typ}` : '', an ? 'kz-an' : '',
      d === von ? 'kz-start' : '', d === (bis || von) ? 'kz-ende' : '', d.slice(0, 7) !== m.kopf.monat ? 'kz-fremd' : ''].filter(Boolean).join(' ');
    const titel = [fmt(d), ft, belegt ? `bereits: ${kat(belegt.typ).titel}` : '', ma.arbeitstage[wt] ? '' : 'kein Arbeitstag'].filter(Boolean).join(' · ');
    raster += `<button type="button" class="${cls}" data-a="kal-tag" data-d="${d}" data-key="${f.key}" title="${esc(titel)}" aria-label="${esc(titel)}" aria-pressed="${an}">${t}${ft ? '<i class="kz-punkt"></i>' : ''}</button>`;
  }
  const kal = (n: number) => monatPlus(a.kalMonat, n), grenze = (n: number) => monatPlus(m.kopf.monat, n);
  const hinweis = istDatum(von) ? (!istDatum(bis) || bis === von ? 'Jetzt auf den letzten Tag tippen (oder Weiter, wenn es nur ein Tag war).' : 'Zum Neu-Wählen wieder auf den ersten Tag tippen.') : 'Tippen Sie auf den ersten Tag.';
  return `<div class="kalender">
    <div class="kal-kopf"><button type="button" class="btn btn-klein" data-a="kal-monat" data-m="${kal(-1)}" ${kal(-1) < grenze(-2) ? 'disabled' : ''} aria-label="Vormonat">‹</button>
      <strong>${monatsName(a.kalMonat)}</strong>
      <button type="button" class="btn btn-klein" data-a="kal-monat" data-m="${kal(1)}" ${kal(1) > grenze(2) ? 'disabled' : ''} aria-label="Folgemonat">›</button></div>
    <div class="kal-raster">${WT_KURZ.map((x) => `<span class="kal-wt">${x}</span>`).join('')}${raster}</div>
    <p class="kal-hinweis">${hinweis}</p>
    <div class="kal-eingaben">
      <label class="feld"><span>Erster Tag</span><input type="date" id="wz-${f.key}-von" data-f="${f.key}_von" value="${esc(von || '')}"></label>
      <label class="feld"><span>Letzter Tag</span><input type="date" id="wz-${f.key}-bis" data-f="${f.key}_bis" value="${esc(bis || '')}"></label></div>
    <div class="kal-legende"><span><i class="lg lg-frei"></i>kein Arbeitstag</span><span><i class="lg lg-feiertag"></i>Feiertag</span>${andere.length ? '<span><i class="lg lg-belegt"></i>schon eingetragen</span>' : ''}</div>
  </div>`;
}

/** Nur sichtbare Felder übernehmen (versteckte Antworten verwerfen). */
function entwurf(): Eintrag {
  const ma = person(aktivMa)!;
  const felder = sichtbareFelder(kat(wz!.typ), wz!.w, ctx(ma));
  const erlaubt = new Set(felder.flatMap((f) => (f.art === 'zeitraum' ? [`${f.key}_von`, `${f.key}_bis`] : [f.key])));
  const w: Werte = {};
  for (const [key, v] of Object.entries(wz!.w)) if (erlaubt.has(key) && v !== '') w[key] = v.trim();
  if (w.zeitraum_von && !w.zeitraum_bis) w.zeitraum_bis = w.zeitraum_von;
  return { id: wz!.eintragId || 'neu', maId: aktivMa, typ: wz!.typ, w };
}

function entwurfBefunde(): Befund[] {
  const e = entwurf(), ma = person(aktivMa)!;
  const probe: Meldung = { ...m, eintraege: [...m.eintraege.filter((x) => x.id !== e.id), e] };
  const quer = pruefePerson(ma, probe).filter((b) => /überschneiden|mehrfach|reicht über/.test(b.text));
  return [...pruefeEintrag(e, kontext(probe, ma), probe), ...quer];
}

function zusammenfassung(): string {
  const ma = person(aktivMa)!, e = entwurf();
  const zeilen = wzFelder().map((f) => {
    const v = e.w[f.key];
    const text = f.art === 'zeitraum' ? `${fmt(e.w[`${f.key}_von`])} bis ${fmt(e.w[`${f.key}_bis`])}`
      : f.art === 'auswahl' ? f.optionen!.find((o) => o.wert === v)?.text || '–'
        : f.art === 'datum' ? fmt(v) : f.art === 'betrag' ? (v ? euro(zahl(v) || 0) : '–') : f.art === 'stunden' ? (v ? std(zahl(v) || 0) : '–') : v || '–';
    return `<div class="zf-zeile"><dt>${esc(f.frage)}</dt><dd>${esc(text)}</dd></div>`;
  });
  const zr = kat(e.typ).zeitraum ? zeitraumwerte(e, ctx(ma)) : null;
  const mn = MONATE[teile(monatsErster(m.kopf.monat)).m - 1];
  return `<h3 class="frage">Stimmt das so?</h3>
    <dl class="zf">${zeilen.join('')}
      ${zr ? `<div class="zf-zeile zf-rechnung"><dt>Daraus berechnet</dt><dd>${zr.tage.toLocaleString('de-DE')} Arbeitstage · ${std(zr.stunden)} im ${mn}</dd></div>` : ''}</dl>
    ${befundListe(entwurfBefunde(), '<p class="alles-ok">Keine Auffälligkeiten.</p>')}`;
}
function speichernKnopf(): string {
  const f = entwurfBefunde().some((b) => b.stufe === 'fehler');
  return `<button class="btn btn-haupt" data-a="wz-speichern" ${f ? 'disabled' : ''}>${f ? 'Bitte erst korrigieren' : 'Speichern'}</button>`;
}

function assistentStarten(typ: Typ, eintrag?: Eintrag) {
  if (!eintrag && kat(typ).einmalig) eintrag = m.eintraege.find((e) => e.maId === aktivMa && e.typ === typ);
  wz = { typ, eintragId: eintrag?.id, schritt: 0, w: { ...(eintrag?.w || {}) }, kalMonat: (eintrag?.w.zeitraum_von || m.kopf.monat).slice(0, 7), zeigeFehler: false };
  render(); fokus();
}
function weiter() {
  const a = wz!, felder = wzFelder(), f = felder[a.schritt];
  if (f) {
    if (f.art === 'zeitraum' && a.w[`${f.key}_von`] && !a.w[`${f.key}_bis`]) a.w[`${f.key}_bis`] = a.w[`${f.key}_von`];
    if (pruefeFeld(f, a.w, ctx(person(aktivMa)!)).some((b) => b.stufe === 'fehler')) {
      a.zeigeFehler = true;
      const live = $('#wz-live');
      if (live) live.innerHTML = liveBefunde(f); else render();
      $('#wz-live .bf-fehler')?.scrollIntoView({ block: 'nearest' });
      return;
    }
  }
  a.schritt = Math.min(a.schritt + 1, wzFelder().length);
  a.zeigeFehler = false;
  render(); fokus();
}
function eintragSpeichern() {
  if (entwurfBefunde().some((b) => b.stufe === 'fehler')) return;
  const e = entwurf();
  if (wz!.eintragId) m.eintraege = m.eintraege.map((x) => (x.id === e.id ? e : x));
  else m.eintraege.push({ ...e, id: neueId() });
  delete m.erledigt[aktivMa];
  m.hinweiseGelesen = false;
  wz = null;
  render();
  toast(`${kat(e.typ).titel} gespeichert`);
}
function fokus() {
  $<HTMLElement>('.dlg-inhalt input:not([type=date]), .dlg-inhalt textarea, .dlg-inhalt .option, .dlg-inhalt .kz:not(.kz-leer)')?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- Stammdaten

function dialogStamm(): string {
  const s = stamm!, d = s.daten;
  const bf = pruefeStammdaten(d, m);
  const sichtbar = s.zeigeFehler ? bf : bf.filter((b) => b.stufe !== 'fehler');
  const am = (feld: string) => befundListe(sichtbar.filter((b) => b.feld === feld));
  return `<div class="overlay" data-a="ma-hintergrund"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="ma-titel">
    <div class="dlg-kopf"><div><div class="eyebrow">Stammdaten</div><h2 id="ma-titel">${s.neu ? 'Person hinzufügen' : esc(d.name)}</h2></div>
      <button class="x" data-a="ma-zu" aria-label="Schließen">${ico('M6 6l12 12M18 6 6 18')}</button></div>
    <div class="dlg-inhalt">
      <div class="formgrid">
        <label class="feld"><span>Vor- und Nachname</span><input id="ma-name" data-m="name" value="${esc(d.name || '')}">${am('name')}</label>
        <label class="feld"><span>Personalnummer</span><input id="ma-persnr" data-m="persNr" value="${esc(d.persNr || '')}" inputmode="numeric">${am('persNr')}</label>
      </div>
      <fieldset class="feld"><legend>Art der Beschäftigung</legend><div class="segment">${(Object.keys(BESCHAEFTIGUNG) as (keyof typeof BESCHAEFTIGUNG)[]).map((b) =>
        `<button type="button" class="seg ${d.beschaeftigung === b ? 'seg-an' : ''}" aria-pressed="${d.beschaeftigung === b}" data-a="ma-wert" data-key="beschaeftigung" data-wert="${b}">${BESCHAEFTIGUNG[b]}</button>`).join('')}</div></fieldset>
      <fieldset class="feld"><legend>Wie wird bezahlt?</legend><div class="segment">
        <button type="button" class="seg ${d.lohnform === 'gehalt' ? 'seg-an' : ''}" aria-pressed="${d.lohnform === 'gehalt'}" data-a="ma-wert" data-key="lohnform" data-wert="gehalt">Festes Monatsgehalt</button>
        <button type="button" class="seg ${d.lohnform === 'stundenlohn' ? 'seg-an' : ''}" aria-pressed="${d.lohnform === 'stundenlohn'}" data-a="ma-wert" data-key="lohnform" data-wert="stundenlohn">Nach Stunden</button></div></fieldset>
      <div class="formgrid">
        <label class="feld"><span>${d.lohnform === 'gehalt' ? 'Monatsgehalt brutto' : 'Stundenlohn brutto'}</span><div class="zahl-eingabe"><input id="ma-betrag" data-m="betragText" inputmode="decimal" value="${esc(d.betragText || '')}"><span class="einheit">€</span></div>${am('betrag')}</label>
        <label class="feld"><span>Stunden pro Woche laut Vertrag</span><div class="zahl-eingabe"><input id="ma-std" data-m="stundenText" inputmode="decimal" value="${esc(d.stundenText || '')}"><span class="einheit">Std.</span></div>${am('stunden')}</label>
      </div>
      <fieldset class="feld"><legend>An welchen Tagen wird normalerweise gearbeitet?</legend>
        <div class="wochentage">${WT_KURZ.map((x, i) => `<button type="button" class="wt ${d.arbeitstage[i] ? 'wt-an' : ''}" aria-pressed="${!!d.arbeitstage[i]}" data-a="ma-tag" data-i="${i}">${x}</button>`).join('')}</div>
        <small>Wichtig für die Berechnung von Urlaubs- und Krankheitstagen.</small>${am('tage')}</fieldset>
      <label class="feld"><span>Eintrittsdatum (nur bei neuen Personen)</span><input type="date" id="ma-eintritt" data-m="eintritt" value="${esc(d.eintritt || '')}">${am('eintritt')}</label>
      ${s.neu ? '<p class="leise">Für neue Personen brauchen wir zusätzlich den Personalfragebogen. Wir senden ihn Ihnen zu.</p>' : ''}
    </div>
    <div class="dlg-fuss">
      ${s.neu ? '<button class="btn" data-a="ma-zu">Abbrechen</button>' : loeschFrage === d.id ? '<button class="btn btn-gefahr" data-a="ma-loeschen">Person und Einträge löschen</button>' : `<button class="btn btn-leise" data-a="loeschen-frage" data-id="${d.id}">Person löschen</button>`}
      <button class="btn btn-haupt" data-a="ma-speichern">${s.neu ? 'Hinzufügen' : 'Speichern'}</button>
    </div></div></div>`;
}

function stammOeffnen(ma?: Mitarbeiter) {
  loeschFrage = null;
  stamm = ma
    ? { neu: false, zeigeFehler: false, daten: { ...ma, arbeitstage: [...ma.arbeitstage], betragText: String(ma.lohnform === 'gehalt' ? ma.gehalt : ma.stundenlohn).replace('.', ','), stundenText: String(ma.wochenstunden).replace('.', ',') } }
    : { neu: true, zeigeFehler: false, daten: { id: neueId(), beschaeftigung: 'vollzeit', lohnform: 'gehalt', arbeitstage: [true, true, true, true, true, false, false] } };
  render(); fokus();
}
function stammSpeichern() {
  const s = stamm!;
  if (pruefeStammdaten(s.daten, m).some((b) => b.stufe === 'fehler')) { s.zeigeFehler = true; render(); return; }
  const d = s.daten, betrag = zahl(d.betragText)!;
  const ma: Mitarbeiter = {
    id: d.id, name: d.name!.trim(), persNr: d.persNr!.trim(), beschaeftigung: d.beschaeftigung, lohnform: d.lohnform,
    wochenstunden: zahl(d.stundenText)!, arbeitstage: d.arbeitstage, eintritt: d.eintritt || undefined,
    ...(d.lohnform === 'gehalt' ? { gehalt: betrag } : { stundenlohn: betrag }),
  };
  if (s.neu) m.mitarbeiter.push(ma); else m.mitarbeiter = m.mitarbeiter.map((x) => (x.id === ma.id ? ma : x));
  if (ma.lohnform !== 'stundenlohn') m.eintraege = m.eintraege.filter((e) => !(e.maId === ma.id && e.typ === 'arbeitszeit'));
  aktivMa = ma.id; stamm = null;
  if (ansicht === 'start') ansicht = 'personen';
  render();
  toast(s.neu ? `${ma.name} hinzugefügt` : 'Stammdaten gespeichert');
}

// ---------------------------------------------------------------- Senden, Hilfen

let toastTimer = 0;
function toast(text: string) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = text; t.classList.add('toast-an');
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => t!.classList.remove('toast-an'), 2200);
}

function herunterladen(a: Ausgabe) {
  const url = URL.createObjectURL(new Blob([kodiere1252(a.text)], { type: 'text/plain;charset=windows-1252' }));
  const link = document.createElement('a');
  link.href = url; link.download = a.dateiname; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function senden() {
  const p = paket();
  if (mitServer) {
    try {
      const antwort = await fetch('api/meldung', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meldung: m, zeilen: erzeugeZeilen(m), aufgaben: p.liste, erstellt: new Date().toISOString(),
          dateien: [p.csv, p.lodas, p.sbs, p.hinweise].map((x) => ({ name: x.dateiname, text: x.text })) }),
      });
      const j = await antwort.json();
      ergebnis = antwort.ok ? { ok: true, text: `Wir haben die Meldung für ${monatsName(m.kopf.monat)} erhalten und melden uns bei Rückfragen.`, ablage: j.dateien }
        : { ok: false, text: j.fehler || 'Senden fehlgeschlagen. Bitte versuchen Sie es erneut.' };
    } catch {
      ergebnis = { ok: false, text: 'Keine Verbindung zum Server. Ihre Eingaben sind gespeichert – bitte später erneut senden.' };
    }
    if (!ergebnis.ok) { toast(ergebnis.text); return; }
  } else {
    ergebnis = { ok: false, text: 'In dieser Demo wird nichts übertragen. Unten sehen Sie, was beim Lohnbüro ankommt: Hinweisliste, LODAS- und SBS-Importdatei. Mit dem mitgelieferten Python-Server werden die Dateien direkt im Eingangsordner gespeichert.' };
  }
  ansicht = 'fertig'; render(); window.scrollTo({ top: 0 });
}

function neuerMonat() {
  m = { ...m, kopf: { ...m.kopf, monat: monatPlus(m.kopf.monat, 1) }, eintraege: [], erledigt: {}, hinweiseGelesen: false, nachricht: '' };
  ergebnis = null; ansicht = 'personen'; aktivMa = m.mitarbeiter[0]?.id || '';
  render();
}

// ---------------------------------------------------------------- Rendern und Ereignisse

function render() {
  const seite = ansicht === 'start' ? seiteStart() : ansicht === 'personen' ? seitePersonen() : ansicht === 'pruefen' ? seitePruefen() : seiteFertig();
  $('#app')!.innerHTML = kopfleiste() + seite + (wz ? dialogAssistent() : '') + (stamm ? dialogStamm() : '');
  document.body.classList.toggle('modal-offen', !!(wz || stamm));
  speichern();
}

document.addEventListener('click', async (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement & { disabled?: boolean; checked?: boolean }>('[data-a]');
  if (!el || el.disabled) return;
  const a = el.dataset.a!;
  if ((a === 'wz-hintergrund' || a === 'ma-hintergrund') && ev.target !== el) return;
  const d = el.dataset;
  switch (a) {
    case 'gehe': if (d.ziel !== 'start' && !kopfFertig()) return; ansicht = d.ziel as Ansicht; loeschFrage = null; render(); window.scrollTo({ top: 0 }); break;
    case 'leeren': m = { kopf: { mandantNr: '', firma: '', ansprechpartner: '', monat: heuteMonat(), land: m.kopf.land, regionen: [] }, mitarbeiter: [], eintraege: [], erledigt: {}, hinweiseGelesen: false, nachricht: '' }; render(); break;
    case 'region': {
      const r = d.r as Region;
      m.kopf.regionen = (el as HTMLInputElement).checked ? [...new Set([...m.kopf.regionen, r])] : m.kopf.regionen.filter((x) => x !== r);
      m.hinweiseGelesen = false; render(); break;
    }
    case 'ma-waehle': aktivMa = d.id!; ansicht = 'personen'; loeschFrage = null; render(); $('.detail')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); break;
    case 'ma-neu': stammOeffnen(); break;
    case 'ma-bearbeiten': stammOeffnen(person(d.id!)); break;
    case 'ma-zu': case 'ma-hintergrund': stamm = null; loeschFrage = null; render(); break;
    case 'ma-wert': (stamm!.daten as unknown as Record<string, string>)[d.key!] = d.wert!; render(); break;
    case 'ma-tag': stamm!.daten.arbeitstage[+d.i!] = !stamm!.daten.arbeitstage[+d.i!]; render(); break;
    case 'ma-speichern': stammSpeichern(); break;
    case 'ma-loeschen': {
      const id = stamm!.daten.id;
      m.mitarbeiter = m.mitarbeiter.filter((x) => x.id !== id); m.eintraege = m.eintraege.filter((e) => e.maId !== id);
      stamm = null; loeschFrage = null; aktivMa = m.mitarbeiter[0]?.id || ''; render(); toast('Person gelöscht'); break;
    }
    case 'erledigt': m.erledigt[d.id!] = !!(el as HTMLInputElement).checked; render(); break;
    case 'gelesen': m.hinweiseGelesen = !!(el as HTMLInputElement).checked; render(); break;
    case 'wz-start': assistentStarten(d.typ as Typ); break;
    case 'wz-bearbeiten': { const e = m.eintraege.find((x) => x.id === d.id); if (e) assistentStarten(e.typ, e); break; }
    case 'wz-zu': case 'wz-hintergrund': wz = null; render(); break;
    case 'wz-weiter': weiter(); break;
    case 'wz-zurueck': if (wz!.schritt === 0) wz = null; else { wz!.schritt--; wz!.zeigeFehler = false; } render(); fokus(); break;
    case 'wz-option': wz!.w[d.key!] = d.wert!; render(); $<HTMLElement>('.option-an')?.focus(); break;
    case 'wz-speichern': eintragSpeichern(); break;
    case 'kal-monat': wz!.kalMonat = d.m!; render(); break;
    case 'kal-tag': {
      const key = d.key!, tag = d.d!, w = wz!.w, von = w[`${key}_von`], bis = w[`${key}_bis`];
      if (!von || (bis && bis !== von)) { w[`${key}_von`] = tag; w[`${key}_bis`] = tag; }
      else if (tag < von) { w[`${key}_von`] = tag; w[`${key}_bis`] = von; }
      else w[`${key}_bis`] = tag;
      render(); $<HTMLElement>(`[data-d="${tag}"]`)?.focus(); break;
    }
    case 'loeschen-frage': loeschFrage = d.id!; render(); break;
    case 'loeschen-nein': loeschFrage = null; render(); break;
    case 'loeschen': m.eintraege = m.eintraege.filter((e) => e.id !== d.id); loeschFrage = null; render(); toast('Eintrag gelöscht'); break;
    case 'senden': await senden(); break;
    case 'neuer-monat': neuerMonat(); break;
    case 'tab': ausgabeTab = d.tab!; render(); break;
    case 'download': { const p = paket(); const x = ({ hinweise: p.hinweise, lodas: p.lodas, sbs: p.sbs, csv: p.csv } as Record<string, Ausgabe>)[d.tab!]; if (x) herunterladen(x); break; }
    case 'kopieren': {
      const pre = $('#ausgabe');
      try { await navigator.clipboard.writeText(pre?.innerText || ''); toast('Kopiert'); }
      catch { const r = document.createRange(); r.selectNodeContents(pre!); const s = getSelection()!; s.removeAllRanges(); s.addRange(r); toast('Markiert – mit Strg+C kopieren'); }
      break;
    }
  }
});

document.addEventListener('input', (ev) => {
  const t = ev.target as HTMLInputElement;
  if (t.dataset.k) {
    const key = t.dataset.k;
    if (key === 'nachricht') { m.nachricht = t.value; speichern(); return; }
    if (key === 'land') { m.kopf.land = t.value as Land; m.kopf.regionen = []; m.hinweiseGelesen = false; render(); return; }
    (m.kopf as unknown as Record<string, string>)[key] = t.value;
    if (key === 'monat') { m.hinweiseGelesen = false; render(); return; }
    speichern();
    const knopf = $<HTMLButtonElement>('.start [data-ziel="personen"]');
    if (knopf) knopf.disabled = !kopfFertig();
    return;
  }
  if (t.dataset.f && wz) {
    wz.w[t.dataset.f] = t.value;
    const f = wzFelder()[wz.schritt];
    if (t.type === 'date') return;
    const live = $('#wz-live'); if (live && f) live.innerHTML = liveBefunde(f);
    const knopf = $('[data-a="wz-weiter"]'); if (knopf && f) knopf.textContent = !f.pflicht && !hatWert(f) ? 'Überspringen' : 'Weiter';
    return;
  }
  if (t.dataset.m && stamm) (stamm.daten as unknown as Record<string, string>)[t.dataset.m] = t.value;
});

document.addEventListener('change', (ev) => {
  const t = ev.target as HTMLInputElement;
  if (t.dataset.f && wz && t.type === 'date') {
    wz.w[t.dataset.f] = t.value;
    if (istDatum(t.value)) wz.kalMonat = t.value.slice(0, 7);
    render(); document.getElementById(t.id)?.focus();
  }
  if (t.dataset.m && stamm) { const id = t.id; render(); document.getElementById(id)?.focus(); }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && (wz || stamm)) { wz = null; stamm = null; render(); return; }
  const t = ev.target as HTMLElement;
  if (ev.key === 'Enter' && t.tagName === 'INPUT' && wz) { ev.preventDefault(); weiter(); }
  else if (ev.key === 'Enter' && t.tagName === 'INPUT' && stamm) { ev.preventDefault(); stammSpeichern(); }
});

async function start() {
  laden();
  try {
    const r = await fetch('api/status', { cache: 'no-store' });
    if (r.ok) { const s = await r.json(); mitServer = !!s.server; if (s.kanzlei) kanzlei = s.kanzlei; }
  } catch { mitServer = false; }
  if (mitServer && m.kopf.mandantNr) {
    try {
      const r = await fetch(`api/konfig?mandant=${encodeURIComponent(m.kopf.mandantNr)}`, { cache: 'no-store' });
      if (r.ok) konfig = mische(STANDARD, await r.json());
    } catch { /* Standard verwenden */ }
  }
  render();
}
start();

// für Tests im Browser
(window as unknown as Record<string, unknown>).__monatsmeldung = { get m() { return m; }, ort: () => ort(m.kopf) };
