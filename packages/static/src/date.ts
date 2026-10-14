// RFC 9110 IMF-fixdate, hand-rolled from the getUTC* getters (verified
// byte-identical to toUTCString on scriptc 0.3.1, probe case 8).
// scriptc>=X: replace with toUTCString once it lowers.
const DAYS = "SunMonTueWedThuFriSat";
const MONTHS = "JanFebMarAprMayJunJulAugSepOctNovDec";

function pad2(n: number): string {
  return n < 10 ? "0" + String(n) : String(n);
}

export function httpDate(ms: number): string {
  const d = new Date(ms);
  const wd = d.getUTCDay() * 3;
  const mo = d.getUTCMonth() * 3;
  return (
    DAYS.slice(wd, wd + 3) +
    ", " +
    pad2(d.getUTCDate()) +
    " " +
    MONTHS.slice(mo, mo + 3) +
    " " +
    String(d.getUTCFullYear()) +
    " " +
    pad2(d.getUTCHours()) +
    ":" +
    pad2(d.getUTCMinutes()) +
    ":" +
    pad2(d.getUTCSeconds()) +
    " GMT"
  );
}
