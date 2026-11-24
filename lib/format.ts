const priceFmt = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });

/** 12.5 -> "€12.50" */
export function formatPrice(value: number): string {
  return priceFmt.format(value);
}

/** 6.33 -> "6.3 m" (one decimal for metres) */
export function formatMetres(value: number): string {
  return `${value.toFixed(1)} m`;
}

/** 85.9 -> "86°" (whole degrees) */
export function formatDegrees(value: number): string {
  return `${Math.round(value)}°`;
}

/** side -> "left of centre" | "right of centre" | "centre" */
export function formatSide(side: 'left' | 'right' | 'centre'): string {
  return side === 'centre' ? 'centre' : `${side} of centre`;
}

export function seatTypeLabel(type: 'standard' | 'recliner'): string {
  return type === 'recliner' ? 'Recliner' : 'Standard';
}
