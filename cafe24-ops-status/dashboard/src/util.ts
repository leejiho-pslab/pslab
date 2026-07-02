// n일 전 날짜(YYYY-MM-DD). UTC 기준으로 파싱·계산·포맷해 로컬 타임존(KST 등)에서
// 하루가 밀리는 문제를 방지한다. (예: KST에서 로컬 파싱 후 toISOString 하면 -1일 발생)
export function daysBefore(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
