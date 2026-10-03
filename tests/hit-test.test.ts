import { expect, it } from "vitest";
import { hitTest, pointInPolygon } from "../web/src/lib/hitTest";

const box = (x: number, y: number, w: number, h: number) => [x, y, x + w, y, x + w, y + h, x, y + h];

it("finds a point inside a polygon", () => {
  expect(pointInPolygon(1.5, 1.1, box(1, 1, 1, 0.2))).toBe(true);
  expect(pointInPolygon(2.5, 1.1, box(1, 1, 1, 0.2))).toBe(false);
  expect(pointInPolygon(1, 1, [])).toBe(false);
});

it("picks the smallest field that contains the point, or none", () => {
  const fields = [
    { id: 1, polygon: box(0, 0, 5, 5) },
    { id: 2, polygon: box(1, 1, 1, 0.2) },
    { id: 3, polygon: [] },
  ];
  expect(hitTest(1.5, 1.1, fields)).toBe(2);
  expect(hitTest(4, 4, fields)).toBe(1);
  expect(hitTest(9, 9, fields)).toBeNull();
});
