export function daysBefore(date: string, n: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
