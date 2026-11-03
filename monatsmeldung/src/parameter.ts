/**
 * Rechengrößen nach Kalenderjahr. Gewählt wird immer der Wert für den Abrechnungsmonat,
 * damit eine Meldung für Dezember 2026 nicht mit den Werten von 2027 geprüft wird.
 *
 * Jährlich zum Jahreswechsel prüfen und ein neues Jahr ergänzen. Fehlt ein Jahr,
 * gilt das letzte bekannte Jahr und die Prüfübersicht zeigt einen Hinweis.
 */
export interface Jahreswerte {
  /** Allgemeiner Mindestlohn je Stunde (MiLoG, Mindestlohnanpassungsverordnung) */
  mindestlohn: number;
  /** Geringfügigkeitsgrenze je Monat (§ 8 Abs. 1a SGB IV): Mindestlohn × 130 / 3, aufgerundet */
  minijobGrenze: number;
  /** Kinderkrankengeld: Arbeitstage je Kind und Elternteil / Höchstgrenze (§ 45 Abs. 2 SGB V) */
  kinderkrankTage: number;
  kinderkrankMax: number;
  kinderkrankTageAlleinerziehend: number;
  kinderkrankMaxAlleinerziehend: number;
  quelle: string;
}

export const JAHRESWERTE: Record<number, Jahreswerte> = {
  2026: {
    mindestlohn: 13.9, minijobGrenze: 603,
    kinderkrankTage: 15, kinderkrankMax: 35, kinderkrankTageAlleinerziehend: 30, kinderkrankMaxAlleinerziehend: 70,
    quelle: 'MiLoV5 § 1 Nr. 1; § 8 Abs. 1a SGB IV; § 45 Abs. 2a SGB V (Sonderregel 2024–2026)',
  },
  2027: {
    mindestlohn: 14.6, minijobGrenze: 633,
    // Sonderregel läuft Ende 2026 aus. Wird sie verlängert, hier anpassen.
    kinderkrankTage: 10, kinderkrankMax: 25, kinderkrankTageAlleinerziehend: 20, kinderkrankMaxAlleinerziehend: 50,
    quelle: 'MiLoV5 § 1 Nr. 2; § 8 Abs. 1a SGB IV; § 45 Abs. 2 SGB V (Regelfall, Stand 11/2026)',
  },
};

/** Fest im Gesetz, ändern sich selten. */
export const GRENZEN = {
  /** Sachbezug-Freigrenze je Monat (§ 8 Abs. 2 S. 11 EStG) – Freigrenze, kein Freibetrag */
  sachbezugFreigrenze: 50,
  /** Aufmerksamkeiten zu persönlichen Anlässen (R 19.6 LStR), nur Sachzuwendungen */
  geschenkFreigrenze: 60,
  /** Entgeltfortzahlung 6 Wochen (§ 3 Abs. 1 EFZG) */
  efzKalendertage: 42,
  /** Wartezeit 4 Wochen (§ 3 Abs. 3 EFZG) */
  wartezeitTage: 28,
  /** Höchstarbeitszeit je Werktag (§ 3 ArbZG) */
  maxTagesstunden: 10,
  /** Fortbestand der Versicherungspflicht bei unbezahlter Freistellung (§ 7 Abs. 3 SGB IV) */
  unbezahltMaxTage: 31,
  /** § 3b EStG: steuerfreier Grundlohn höchstens 50 €/Std., SV-frei nur bis 25 €/Std. (§ 1 SvEV) */
  grundlohn3bSteuer: 50,
  grundlohn3bSv: 25,
  /** Mutterschutzfristen (§ 3 MuSchG) in Tagen */
  mutterschutzVorher: 42,
  mutterschutzNachher: 56,
  mutterschutzNachherVerlaengert: 84,
} as const;

export function jahreswerte(monat: string): { werte: Jahreswerte; jahr: number; geschaetzt: boolean } {
  const jahr = Number(monat.slice(0, 4));
  if (JAHRESWERTE[jahr]) return { werte: JAHRESWERTE[jahr], jahr, geschaetzt: false };
  const bekannt = Object.keys(JAHRESWERTE).map(Number).sort((a, b) => a - b);
  const naechstes = bekannt.filter((j) => j <= jahr).pop() ?? bekannt[0];
  return { werte: JAHRESWERTE[naechstes], jahr: naechstes, geschaetzt: true };
}
