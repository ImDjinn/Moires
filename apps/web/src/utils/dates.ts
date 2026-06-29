export function daysBetween(a: string, b: string): number {
  const msPerDay = 86400000;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay);
}

export function dateToX(date: string, rangeStart: string, dayWidthPx: number): number {
  return daysBetween(rangeStart, date) * dayWidthPx;
}

export function xToDate(x: number, rangeStart: string, dayWidthPx: number): string {
  const days = Math.round(x / dayWidthPx);
  const d = new Date(rangeStart);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function isWeekend(date: string): boolean {
  const day = new Date(date).getDay();
  return day === 0 || day === 6;
}

export function generateDays(rangeStart: string, rangeEnd: string): string[] {
  const days: string[] = [];
  const end = new Date(rangeEnd);
  const d = new Date(rangeStart);
  while (d <= end) {
    days.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function addDays(date: string, n: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

/** "29/06 – 12/07" pour l'en-tête d'un sprint. */
export function formatSprintRange(start: string, finish: string): string {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  return `${fmt(start)} – ${fmt(finish)}`;
}

/** Nombre de jours ouvrés (lun–ven) inclus dans l'intervalle. */
export function workingDays(start: string, finish: string): number {
  let count = 0;
  const d = new Date(start);
  const end = new Date(finish);
  while (d <= end) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}
