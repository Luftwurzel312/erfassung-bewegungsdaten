/**
 * Zuordnung der fachlichen Schlüssel (urlaub, krank, zuschlag_nacht …) zu den Lohnarten
 * und Ausfallschlüsseln des Lohnprogramms. Die Standarddatei liegt in
 * konfig/lohnarten.standard.json; der Server mischt je Mandant konfig/mandanten/<Nr>.json darüber.
 */
import standard from '../../konfig/lohnarten.standard.json';

export type Wertart = 'stunden' | 'tage' | 'betrag';
export interface LohnartZuordnung { text: string; wert: Wertart; lodas?: string; sbs?: string; nurStundenlohn?: boolean }
export interface FehlzeitZuordnung { text: string; lodas?: string; sbs?: string }
export interface Konfig {
  geprueft: boolean;
  hinweis?: string;
  lodas: { beraterNr: string; versionDb?: string; bs: Record<Wertart, string> };
  sbs: { firmennummer?: string; monatsformat?: 'MM.JJJJ' | 'JJJJMM' };
  lohnarten: Record<string, LohnartZuordnung>;
  fehlzeiten: Record<string, FehlzeitZuordnung>;
}

export const STANDARD: Konfig = standard as Konfig;

/** Mandantenkonfiguration über die Standardkonfiguration legen (eine Ebene tief je Bereich). */
export function mische(basis: Konfig, extra?: Partial<Konfig> | null): Konfig {
  if (!extra) return basis;
  return {
    ...basis, ...extra,
    lodas: { ...basis.lodas, ...extra.lodas, bs: { ...basis.lodas.bs, ...extra.lodas?.bs } },
    sbs: { ...basis.sbs, ...extra.sbs },
    lohnarten: { ...basis.lohnarten, ...extra.lohnarten },
    fehlzeiten: { ...basis.fehlzeiten, ...extra.fehlzeiten },
  };
}
