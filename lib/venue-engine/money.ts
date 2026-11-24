/** Shared money formatting for every venue (cinema = EUR, stadium = AED). */
export type Currency = 'EUR' | 'AED';

const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const grouped0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const grouped2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Number part only: AED 1250 -> "1,250"; EUR 12.5 -> "12.50". */
export function formatAmount(value: number, currency: Currency): string {
  if (currency === 'EUR') return grouped2.format(value);
  return Number.isInteger(value) ? grouped0.format(value) : grouped2.format(value);
}

/** Full label: EUR 12.5 -> "€12.50"; AED 1250 -> "AED 1,250". */
export function formatMoney(value: number, currency: Currency): string {
  if (currency === 'EUR') return eur.format(value);
  return `AED ${formatAmount(value, currency)}`;
}

/** Signed difference for upsells: AED 2500 -> "+2,500 AED". */
export function formatUpsell(value: number, currency: Currency): string {
  return `+${formatAmount(value, currency)} ${currency}`;
}
