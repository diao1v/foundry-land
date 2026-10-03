import { expect, it } from "vitest";
import { cleanMarkers, describeOp, pct } from "../src/present";
import { GOOD_FIX } from "./fixtures";

it("describes fix operations in plain words", () => {
  expect(GOOD_FIX.map(describeOp)).toEqual([
    'Field "provider_no" also accepts the label "Provider ID"',
    'New field "gst" from the label "GST" (exact match)',
    'Compute "total" = total + gst (only when every input is present)',
  ]);
});

it("removes search-tool citation markers", () => {
  expect(cleanMarkers("Totals exclude GST 【6:0†source】.")).toBe("Totals exclude GST.");
  expect(cleanMarkers("  plain  ")).toBe("plain");
});

it("formats a change as a signed percentage", () => {
  expect(pct(-0.09828)).toBe("−9.8%");
  expect(pct(0)).toBe("0.0%");
  expect(pct(0.05)).toBe("+5.0%");
});
