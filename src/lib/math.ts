/**
 * Exact rational arithmetic for marking and generating mathematics.
 * Avoids floating point surprises (0.1 + 0.2) when checking answers.
 */
export class Frac {
  readonly n: bigint;
  readonly d: bigint;
  constructor(n: bigint, d: bigint = 1n) {
    if (d === 0n) throw new Error('Division by zero');
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n < 0n ? -n : n, d);
    this.n = g ? n / g : n;
    this.d = g ? d / g : d;
  }
  static of(x: number | bigint) {
    if (typeof x === 'bigint') return new Frac(x);
    return parseNumber(String(x))!;
  }
  add(o: Frac) { return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o: Frac) { return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o: Frac) { return new Frac(this.n * o.n, this.d * o.d); }
  div(o: Frac) { return new Frac(this.n * o.d, this.d * o.n); }
  eq(o: Frac) { return this.n === o.n && this.d === o.d; }
  isInt() { return this.d === 1n; }
  toString(): string {
    if (this.d === 1n) return this.n.toString();
    // Prefer a terminating decimal if short, otherwise a fraction.
    return `${this.n}/${this.d}`;
  }
  toMixed(): string {
    if (this.d === 1n) return this.n.toString();
    const neg = this.n < 0n;
    const an = neg ? -this.n : this.n;
    const whole = an / this.d;
    const rem = an % this.d;
    return (neg ? '-' : '') + (whole ? `${whole} ` : '') + `${rem}/${this.d}`;
  }
  toDecimal(maxDp = 6): string | null {
    let d = this.d;
    while (d % 2n === 0n) d /= 2n;
    while (d % 5n === 0n) d /= 5n;
    if (d !== 1n) return null;
    const num = Number(this.n) / Number(this.d);
    return String(+num.toFixed(maxDp));
  }
}

function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a;
}

const FULLWIDTH = /[０-９．／＋－]/g;

export function normaliseDigits(s: string) {
  return s
    .replace(FULLWIDTH, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[×xX＊]/g, '*')
    .replace(/[÷]/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/,(?=\d{3}\b)/g, '');
}

/** Parse "12", "-3.5", "3/4", "1 3/4", "1又3/4", "50%" into an exact fraction. */
export function parseNumber(raw: string): Frac | null {
  let s = normaliseDigits(raw).trim().replace(/^\$|元$/g, '').trim();
  if (!s) return null;
  let pct = false;
  if (s.endsWith('%')) {
    pct = true;
    s = s.slice(0, -1).trim();
  }
  let m = s.match(/^(-?\d+)\s*(?:又|\s)\s*(\d+)\s*\/\s*(\d+)$/);
  let f: Frac | null = null;
  if (m) {
    const whole = BigInt(m[1]);
    const frac = new Frac(BigInt(m[2]), BigInt(m[3]));
    f = whole < 0n ? new Frac(whole).sub(frac) : new Frac(whole).add(frac);
  } else if ((m = s.match(/^(-?\d+)\s*\/\s*(\d+)$/))) {
    if (BigInt(m[2]) === 0n) return null;
    f = new Frac(BigInt(m[1]), BigInt(m[2]));
  } else if ((m = s.match(/^(-?)(\d*)\.?(\d*)$/)) && (m[2] || m[3])) {
    const intPart = m[2] || '0';
    const dec = m[3] || '';
    const n = BigInt(intPart + dec) * (m[1] ? -1n : 1n);
    f = new Frac(n, 10n ** BigInt(dec.length));
  }
  if (f && pct) f = f.div(new Frac(100n));
  return f;
}

/**
 * Evaluate a simple arithmetic expression exactly: + - * / ( ) with integers, decimals and fractions.
 * Returns null when the expression is not purely arithmetic (we never guess).
 */
export function evaluate(expr: string): Frac | null {
  const s = normaliseDigits(expr).replace(/=\s*\??\s*$/, '').replace(/\s+/g, '');
  if (!s || !/^[\d+\-*/().]+$/.test(s)) return null;
  let i = 0;
  const peek = () => s[i];
  function num(): Frac | null {
    const m = s.slice(i).match(/^\d+(\.\d+)?/);
    if (!m) return null;
    i += m[0].length;
    return parseNumber(m[0]);
  }
  function factor(): Frac | null {
    if (peek() === '-') {
      i++;
      const f = factor();
      return f ? new Frac(0n).sub(f) : null;
    }
    if (peek() === '(') {
      i++;
      const e = expression();
      if (peek() !== ')') return null;
      i++;
      return e;
    }
    return num();
  }
  function term(): Frac | null {
    let a = factor();
    while (a && (peek() === '*' || peek() === '/')) {
      const op = s[i++];
      const b = factor();
      if (!b) return null;
      if (op === '/' && b.n === 0n) return null;
      a = op === '*' ? a.mul(b) : a.div(b);
    }
    return a;
  }
  function expression(): Frac | null {
    let a = term();
    while (a && (peek() === '+' || peek() === '-')) {
      const op = s[i++];
      const b = term();
      if (!b) return null;
      a = op === '+' ? a.add(b) : a.sub(b);
    }
    return a;
  }
  try {
    const r = expression();
    return i === s.length ? r : null;
  } catch {
    return null;
  }
}

/** Try to compute a draft answer for a question like "3 + 4 = ?" or "12 ÷ 3 =". */
export function draftAnswerFor(question: string): string | null {
  const q = normaliseDigits(question);
  const m = q.match(/([\d\s+\-*/().]+)=\s*(\?|_+|\(\s*\)|（\s*）|$)/);
  const candidate = m ? m[1] : q;
  const r = evaluate(candidate);
  if (!r) return null;
  return r.isInt() ? r.toString() : r.toDecimal() ?? r.toString();
}

// Seeded random so a generated worksheet can be regenerated identically.
export function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
