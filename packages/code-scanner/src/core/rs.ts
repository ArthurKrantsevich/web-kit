import { polyEval, polyMul, type GenericGF } from "./gf";

export interface RsResult {
  corrected: number;
  erasures: number;
}

/**
 * Corrects `received` in place (index 0 = highest degree). `erasures` are indices known to be wrong (duplicates and
 * out-of-range indices are ignored). Berlekamp–Massey over the syndromes multiplied by the erasure locator, roots by
 * trial over the positions, Forney's formula with the field's generator base. Returns the counts, or null when the
 * word cannot be corrected (the locator's degree does not match its roots, too many erasures, or a non-zero syndrome
 * after the correction).
 */
export function rsDecode(gf: GenericGF, received: number[], ecCount: number, erasures: readonly number[] = []): RsResult | null {
  const n = received.length;
  const S = new Array<number>(ecCount);
  let allZero = true;
  for (let i = 0; i < ecCount; i++) {
    let s = 0;
    const a = gf.alpha(gf.generatorBase + i);
    for (let k = 0; k < n; k++) s = gf.add(gf.mul(s, a), received[k]!);
    S[i] = s;
    if (s !== 0) allZero = false;
  }
  if (allZero) return { corrected: 0, erasures: 0 };
  const known = [...new Set(erasures)].filter((p) => p >= 0 && p < n);
  if (known.length > ecCount) return null;
  // Γ(x) = Π (1 − X_j x) over the erasures, X_j = α^(n − 1 − position)
  let gamma = [1];
  for (const pos of known) gamma = polyMul(gf, gamma, [1, gf.neg(gf.alpha(n - 1 - pos))]);
  // modified syndromes T(x) = S(x)·Γ(x) mod x^ecCount
  const T = polyMul(gf, S, gamma).slice(0, ecCount);
  // Berlekamp–Massey for the errors, over the symbols the erasures do not cover
  const s = known.length;
  let lambda = [1], B = [1], L = 0, m = 1, b = 1;
  for (let r = s; r < ecCount; r++) {
    let delta = T[r]!;
    for (let i = 1; i <= L; i++) delta = gf.add(delta, gf.mul(lambda[i] ?? 0, T[r - i]!));
    if (delta === 0) { m++; continue; }
    const coefficient = gf.mul(delta, gf.inv(b));
    const next = lambda.slice();
    for (let i = 0; i < B.length; i++) {
      const index = i + m;
      while (next.length <= index) next.push(0);
      next[index] = gf.sub(next[index]!, gf.mul(coefficient, B[i]!));
    }
    if (2 * L <= r - s) { L = r - s + 1 - L; B = lambda; b = delta; m = 1; } else m++;
    lambda = next;
  }
  while (lambda.length > 1 && lambda[lambda.length - 1] === 0) lambda.pop();
  if (lambda.length - 1 !== L || 2 * L + s > ecCount) return null;
  // Ψ = Λ·Γ, its roots are the inverse positions
  const psi = polyMul(gf, lambda, gamma), positions: number[] = [];
  for (let pos = 0; pos < n; pos++) if (polyEval(gf, psi, gf.alpha(-(n - 1 - pos))) === 0) positions.push(pos);
  if (positions.length !== psi.length - 1) return null;
  // Ω = S·Ψ mod x^ecCount; Ψ' the formal derivative (i·ψ_i as repeated addition)
  const omega = polyMul(gf, S, psi).slice(0, ecCount), derivative: number[] = [];
  for (let i = 1; i < psi.length; i++) {
    let c = 0;
    for (let k = 0; k < i; k++) c = gf.add(c, psi[i]!);
    derivative.push(c);
  }
  for (const pos of positions) {
    const X = gf.alpha(n - 1 - pos), xInv = gf.inv(X);
    const numerator = polyEval(gf, omega, xInv), denominator = polyEval(gf, derivative, xInv);
    if (denominator === 0) return null;
    // e_j = −X_j^(1−b) · Ω(X_j⁻¹) / Ψ'(X_j⁻¹)
    const e = gf.neg(gf.mul(gf.pow(X, 1 - gf.generatorBase), gf.mul(numerator, gf.inv(denominator))));
    received[pos] = gf.sub(received[pos]!, e);
  }
  for (let i = 0; i < ecCount; i++) {
    let v = 0;
    const a = gf.alpha(gf.generatorBase + i);
    for (let k = 0; k < n; k++) v = gf.add(gf.mul(v, a), received[k]!);
    if (v !== 0) return null;
  }
  return { corrected: positions.length - s, erasures: s };
}
