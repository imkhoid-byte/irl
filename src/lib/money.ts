export function formatMoney(cents: number, opts: { showCents?: boolean } = {}): string {
  const showCents = opts.showCents ?? cents % 100 !== 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  }).format(cents / 100);
}

/**
 * Both people pay exactly half; neither subsidises the other. Totals must be even
 * (in cents) so the split is exact — the catalog refuses odd totals.
 */
export function splitEvenly(totalCents: number): number {
  if (!Number.isInteger(totalCents) || totalCents <= 0) throw new Error("Total must be a positive whole number of cents");
  if (totalCents % 2 !== 0) throw new Error("Total must split evenly between two people");
  return totalCents / 2;
}

export type PriceBreakdown = {
  totalCents: number;
  shareCents: number;
  feeCents: number;
  dueCents: number;
};

export function priceBreakdown(totalCents: number, feeCents: number): PriceBreakdown {
  if (!Number.isInteger(feeCents) || feeCents < 0) throw new Error("Fee must be a non-negative whole number of cents");
  const shareCents = splitEvenly(totalCents);
  return { totalCents, shareCents, feeCents, dueCents: shareCents + feeCents };
}
