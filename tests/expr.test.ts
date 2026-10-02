import { expect, it } from "vitest";
import { evaluate, parseExpression } from "../src/mapping/expr";

it("parses field refs and numbers", () => {
  expect(parseExpression("total + gst")).toEqual({ tokens: ["total", "+", "gst"], refs: ["total", "gst"] });
});

it("multiplies before adding", () => {
  expect(evaluate(parseExpression("total + gst * 2"), { total: 100, gst: 15 })).toBe(130);
  expect(evaluate(parseExpression("total * 1.15 - 5"), { total: 100 })).toBe(110);
});

it("rounds to cents", () => {
  expect(evaluate(parseExpression("a * 1.15"), { a: 10.01 })).toBe(11.51);
});

it.each(["process.exit()", "total +", "", "total gst", "-5", "Total + gst", "total / 2", "(total)"])(
  "rejects %j",
  (src) => {
    expect(() => parseExpression(src)).toThrow(/Invalid expression/);
  },
);
