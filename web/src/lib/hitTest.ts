// Ray casting. polygon = [x1, y1, x2, y2, …], same units as the point.
export function pointInPolygon(x: number, y: number, p: number[]): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [p[i], p[i + 1], p[j], p[j + 1]];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const area = (p: number[]) => {
  const xs = p.filter((_, i) => i % 2 === 0);
  const ys = p.filter((_, i) => i % 2 === 1);
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
};

export function hitTest(x: number, y: number, fields: { id: number; polygon: number[] }[]): number | null {
  const hits = fields.filter((f) => f.polygon.length >= 6 && pointInPolygon(x, y, f.polygon));
  if (!hits.length) return null;
  return hits.reduce((a, b) => (area(b.polygon) < area(a.polygon) ? b : a)).id;
}
