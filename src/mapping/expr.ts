// A tiny arithmetic language for derived fields: field names, numbers, + - *.
// No parentheses, no functions, no eval.
export type Expr = { tokens: string[]; refs: string[] };

const ID = /^[a-z_][a-z0-9_]*$/;
const NUM = /^\d+(\.\d+)?$/;
const OP = /^[+\-*]$/;

export function parseExpression(src: string): Expr {
  const tokens = src.trim().split(/\s*([+\-*])\s*/).filter(Boolean);
  const valid =
    tokens.length % 2 === 1 && tokens.every((t, i) => (i % 2 ? OP.test(t) : ID.test(t) || NUM.test(t)));
  if (!valid) throw new Error(`Invalid expression: "${src}"`);
  return { tokens, refs: [...new Set(tokens.filter((t) => ID.test(t)))] };
}

export function evaluate(expr: Expr, values: Record<string, number>): number {
  const val = (t: string) => (NUM.test(t) ? Number(t) : values[t]);
  const terms = [val(expr.tokens[0])];
  const signs: string[] = [];
  for (let i = 1; i < expr.tokens.length; i += 2) {
    const op = expr.tokens[i];
    const v = val(expr.tokens[i + 1]);
    if (op === "*") terms[terms.length - 1] *= v;
    else {
      signs.push(op);
      terms.push(v);
    }
  }
  const result = terms.slice(1).reduce((acc, v, i) => (signs[i] === "+" ? acc + v : acc - v), terms[0]);
  return Math.round(result * 100) / 100;
}
