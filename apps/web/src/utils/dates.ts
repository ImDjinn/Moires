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
