/**
 * type-motion — kinetic typography: text and numbers as animated citizens. Counters/number tickers,
 * word-by-word / typewriter reveals, big-number "slams", scramble/decode, and text-along-a-path.
 * Pure value/format helpers + themed draw helpers. All deterministic and seekable.
 */

export interface NumberFormat {
  decimals?: number;
  commas?: boolean;
  prefix?: string;
  suffix?: string;
}

export function formatNumber(n: number, opts: NumberFormat = {}): string {
  const { decimals = 0, commas = true, prefix = "", suffix = "" } = opts;
  const fixed = Math.abs(n).toFixed(decimals);
  const neg = n < 0 && Number(fixed) !== 0; // avoid "-0" when rounding brings a small negative to zero
  let body = fixed;
  if (commas) {
    const [int, frac] = fixed.split(".");
    const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    body = frac ? `${withCommas}.${frac}` : withCommas;
  }
  return `${neg ? "-" : ""}${prefix}${body}${suffix}`;
}
