/**
 * Decorative 1D barcode, deterministic from a string (same ref → same bars).
 * Not a real symbology; the QR code carries the scannable data.
 */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Alternating bar/space widths (in modules), with start/stop guards. */
export function barcodeModules(value: string): number[] {
  const rand = rng(hash(value));
  const widths: number[] = [2, 1, 1, 1]; // start guard
  for (let i = 0; i < value.length * 6 + 12; i++) widths.push(1 + Math.floor(rand() * 3.2));
  widths.push(1, 1, 2, 1, 2); // stop guard (bar last)
  if (widths.length % 2 === 0) widths.push(1);
  return widths;
}

export function Barcode({ value, color = '#16161a', className }: { value: string; color?: string; className?: string }) {
  const widths = barcodeModules(value);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = 0;
  const bars: { x: number; w: number }[] = [];
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return (
    <svg
      role="img"
      aria-label={`Barcode for ${value}`}
      viewBox={`0 0 ${total} 40`}
      preserveAspectRatio="none"
      className={className}
      shapeRendering="crispEdges"
    >
      {bars.map((b) => (
        <rect key={b.x} x={b.x} y={0} width={b.w} height={40} fill={color} />
      ))}
    </svg>
  );
}
