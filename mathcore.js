// mathcore.js —— 不依赖 Compute Engine 的纯数值/多项式内核
// 提供：AST 快速编译、有理函数运算、多项式因式分解与求根、部分分式积分、
//       极限数值估计、数值求根、tanh-sinh 数值积分、不等式区间、线性方程组消元

// ==========================================
// 0. 数字格式与有理数识别
// ==========================================

export function gcdInt(a, b) {
    a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b));
    while (b) { const t = b; b = a % b; a = t; }
    return a || 1;
}

/** 将浮点数近似为分母不超过 maxDen 的分数；失败返回 null */
export function toFrac(val, maxDen = 2000, tol = 1e-9) {
    if (typeof val !== 'number' || !isFinite(val)) return null;
    if (Math.abs(val - Math.round(val)) < tol) return { num: Math.round(val), den: 1 };
    const sign = val < 0 ? -1 : 1;
    let x = Math.abs(val);
    let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = x;
    for (let i = 0; i < 40; i++) {
        const a = Math.floor(b);
        [h0, h1] = [h1, a * h1 + h0];
        [k0, k1] = [k1, a * k1 + k0];
        if (k1 > maxDen) return null;
        if (Math.abs(x - h1 / k1) < tol * Math.max(1, x)) {
            const g = gcdInt(h1, k1);
            return { num: sign * h1 / g, den: k1 / g };
        }
        const frac = b - a;
        if (frac < 1e-14) break;
        b = 1 / frac;
    }
    return null;
}

/** 数值 → LaTeX（有理数用分式，否则保留 6 位有效数字） */
export function fmt(val) {
    if (typeof val !== 'number' || isNaN(val)) return '\\text{无定义}';
    if (!isFinite(val)) return val > 0 ? '\\infty' : '-\\infty';
    const f = toFrac(val);
    if (f) return f.den === 1 ? `${f.num}` : `${f.num < 0 ? '-' : ''}\\frac{${Math.abs(f.num)}}{${f.den}}`;
    const s = Number(val.toPrecision(7)).toString();
    return s.includes('e') ? val.toExponential(4) : s;
}

/** 数值 → MathJSON（有理数用 Rational，否则保留浮点） */
export function numAst(val) {
    const f = toFrac(val);
    if (f) return f.den === 1 ? f.num : ['Rational', f.num, f.den];
    return Number(val.toPrecision(12));
}

/** 尝试把数值识别为常见精确形式 (有理数、k·π、k·e、√r、ln 2…) */
export function recognize(val, tol = 1e-7) {
    if (typeof val !== 'number' || !isFinite(val)) return null;
    const near = (a, b) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
    const f = toFrac(val, 120, Math.min(tol, 1e-8));
    if (f) return { exact: true, latex: fmt(f.num / f.den), ast: numAst(f.num / f.den), kind: 'rational' };

    const withConst = (c, latex, astSym) => {
        const r = toFrac(val / c, 60, tol);
        if (!r || r.num === 0) return null;
        if (!near(r.num / r.den * c, val)) return null;
        const a = Math.abs(r.num), sign = r.num < 0 ? '-' : '';
        const body = a === 1 ? latex : `${a}${latex}`;
        const ltClean = r.den === 1 ? `${sign}${body}` : `${sign}\\frac{${body}}{${r.den}}`;
        return { exact: true, latex: ltClean, ast: ['Multiply', numAst(r.num / r.den), astSym], kind: 'const' };
    };
    const sqrtRational = () => {
        const sq = toFrac(val * val, 12, tol);
        if (sq && sq.num > 0 && sq.num <= 200 && near(Math.sqrt(sq.num / sq.den), Math.abs(val))) {
            const body = sq.den === 1 ? `${sq.num}` : `\\frac{${sq.num}}{${sq.den}}`;
            return { exact: true, latex: `${val < 0 ? '-' : ''}\\sqrt{${body}}`, ast: val < 0 ? ['Negate', ['Sqrt', numAst(sq.num / sq.den)]] : ['Sqrt', numAst(sq.num / sq.den)], kind: 'sqrt' };
        }
        return null;
    };
    return withConst(Math.PI, '\\pi', 'Pi')
        || withConst(Math.E, 'e', 'ExponentialE')
        || withConst(Math.PI * Math.PI, '\\pi^{2}', ['Power', 'Pi', 2])
        || withConst(Math.sqrt(Math.PI), '\\sqrt{\\pi}', ['Sqrt', 'Pi'])
        || sqrtRational()
        || withConst(Math.LN2, '\\ln 2', ['Ln', 2])
        || withConst(Math.LN10, '\\ln 10', ['Ln', 10])
        || (() => { const g = toFrac(val, 2000, 1e-9); return g ? { exact: true, latex: fmt(g.num / g.den), ast: numAst(g.num / g.den), kind: 'rational' } : null; })();
}

/** 结果 → { latex, exact }：能识别则给精确形式，否则小数近似 */
export function describeNumber(val) {
    if (val === Infinity) return { latex: '+\\infty', exact: true };
    if (val === -Infinity) return { latex: '-\\infty', exact: true };
    const r = recognize(val);
    if (r) return { latex: r.latex, exact: true, ast: r.ast };
    return { latex: fmt(val), exact: false };
}

// ==========================================
// 1. MathJSON 解包与快速编译
// ==========================================

export function unwrap(node) {
    let cur = node;
    for (let i = 0; i < 12; i++) {
        if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
            if (cur.sym !== undefined) return cur.sym;
            if (cur.num !== undefined) { const n = Number(cur.num); return isNaN(n) ? cur.num : n; }
            if (cur.fn) { cur = cur.fn; continue; }
            if (cur.json) { cur = cur.json; continue; }
            return cur;
        }
        if (Array.isArray(cur)) {
            const op = cur[0];
            if (op === 'Function') { cur = cur[1]; continue; }
            if ((op === 'Block' || op === 'Hold' || op === 'Delimiter' || op === 'Parentheses') && cur.length >= 2) { cur = cur[1]; continue; }
            return cur;
        }
        return cur;
    }
    return cur;
}

const FUNCS_1 = {
    Sin: Math.sin, Cos: Math.cos, Tan: Math.tan,
    Cot: v => 1 / Math.tan(v), Sec: v => 1 / Math.cos(v), Csc: v => 1 / Math.sin(v),
    Arcsin: Math.asin, Arccos: Math.acos, Arctan: Math.atan,
    Arccot: v => Math.PI / 2 - Math.atan(v),
    Sinh: Math.sinh, Cosh: Math.cosh, Tanh: Math.tanh,
    Coth: v => 1 / Math.tanh(v), Sech: v => 1 / Math.cosh(v), Csch: v => 1 / Math.sinh(v),
    Arsinh: Math.asinh, Arcosh: Math.acosh, Artanh: Math.atanh,
    Exp: Math.exp, Abs: Math.abs, Sign: Math.sign,
    Floor: Math.floor, Ceil: Math.ceil, Round: Math.round,
    Lb: v => (v <= 0 ? NaN : Math.log2(v)),
    Ln: v => (v <= 0 ? NaN : Math.log(v)),
    Sqrt: v => (v < 0 ? NaN : Math.sqrt(v)),
    Square: v => v * v,
    Factorial: v => gamma(v + 1),
    Gamma: gamma
};

function gamma(z) {
    if (Number.isInteger(z) && z > 0 && z < 171) { let r = 1; for (let i = 2; i < z; i++) r *= i; return r; }
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    z -= 1;
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
        -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

function realPow(b, e) {
    if (b < 0 && !Number.isInteger(e)) {
        const inv = 1 / e;
        if (Number.isInteger(Math.round(inv)) && Math.abs(inv - Math.round(inv)) < 1e-12 && Math.round(inv) % 2 !== 0) {
            return -Math.pow(-b, e);          // 奇次方根：(-8)^(1/3) = -2
        }
        return NaN;
    }
    return Math.pow(b, e);
}

/**
 * 把 MathJSON 编译成原生 JS 函数。
 * vars 为字符串：返回 f(x)；为数组：返回 f(v1, v2, ...)。
 * 遇到未知算子抛出 Error('unsupported:Op')，调用方可回退到 Compute Engine。
 */
export function compileAST(ast, vars) {
    const single = !Array.isArray(vars);
    const names = single ? [vars] : vars;
    const idx = new Map(names.map((n, i) => [n, i]));

    function c(node) {
        const n = unwrap(node);
        if (typeof n === 'number') return () => n;
        if (typeof n === 'string') {
            if (idx.has(n)) { const i = idx.get(n); return e => e[i]; }
            switch (n) {
                case 'Pi': return () => Math.PI;
                case 'ExponentialE': case 'e': return () => Math.E;
                case 'Half': return () => 0.5;
                case 'PositiveInfinity': case 'Infinity': return () => Infinity;
                case 'NegativeInfinity': return () => -Infinity;
                case 'ImaginaryUnit': return () => NaN;
            }
            const num = Number(n);
            if (n.trim() !== '' && !isNaN(num)) return () => num;
            throw new Error('unsupported:symbol ' + n);
        }
        if (!Array.isArray(n)) throw new Error('unsupported:node');
        const [op, ...args] = n;
        const a = args.map(c);

        if (FUNCS_1[op] && a.length === 1) { const f = FUNCS_1[op]; return e => f(a[0](e)); }
        switch (op) {
            case 'Add': return e => { let s = 0; for (const f of a) s += f(e); return s; };
            case 'Subtract': return e => a[0](e) - a[1](e);
            case 'Negate': return e => -a[0](e);
            case 'Multiply': return e => { let s = 1; for (const f of a) s *= f(e); return s; };
            case 'Divide': return e => { const d = a[1](e); return d === 0 ? NaN : a[0](e) / d; };
            case 'Rational': return a.length === 2 ? (e => a[0](e) / a[1](e)) : a[0];
            case 'Power': return e => realPow(a[0](e), a[1](e));
            case 'Root': return e => realPow(a[0](e), 1 / a[1](e));
            case 'Log': return a.length === 1
                ? (e => { const v = a[0](e); return v <= 0 ? NaN : Math.log10(v); })
                : (e => { const v = a[0](e), b = a[1](e); return v <= 0 || b <= 0 ? NaN : Math.log(v) / Math.log(b); });
            case 'Arctan2': return e => Math.atan2(a[0](e), a[1](e));
            case 'Max': return e => Math.max(...a.map(f => f(e)));
            case 'Min': return e => Math.min(...a.map(f => f(e)));
            case 'Mod': return e => { const m = a[1](e); return ((a[0](e) % m) + m) % m; };
            case 'Sequence': case 'Tuple': if (a.length === 1) return a[0]; break;
        }
        throw new Error('unsupported:' + op);
    }

    const f = c(ast);
    return single ? (x => f([x])) : ((...v) => f(v));
}

/** 判断 AST 是否包含指定符号 */
export function containsSymbol(node, name) {
    const n = unwrap(node);
    if (typeof n === 'string') return n === name;
    if (Array.isArray(n)) return n.slice(1).some(x => containsSymbol(x, name));
    return false;
}

/** 收集自由符号（排除常量名与函数名） */
export function freeSymbols(node, out = new Set()) {
    const n = unwrap(node);
    const reserved = new Set(['Pi', 'ExponentialE', 'e', 'Half', 'PositiveInfinity', 'NegativeInfinity', 'Infinity',
        'ImaginaryUnit', 'Nothing', 'True', 'False', 'dx', 'dy']);
    if (typeof n === 'string') { if (!reserved.has(n) && isNaN(Number(n))) out.add(n); }
    else if (Array.isArray(n)) {
        for (let i = 1; i < n.length; i++) freeSymbols(n[i], out);
    }
    return out;
}

// ==========================================
// 2. 多项式与有理函数
// ==========================================

const TOL = 1e-10;
export const pTrim = (p) => { const r = p.slice(); while (r.length > 1 && Math.abs(r[r.length - 1]) < TOL) r.pop(); return r.length ? r : [0]; };
export const pDeg = (p) => { const t = pTrim(p); return t.length === 1 && Math.abs(t[0]) < TOL ? -1 : t.length - 1; };
export const pAdd = (a, b) => pTrim(Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] || 0) + (b[i] || 0)));
export const pSub = (a, b) => pAdd(a, b.map(v => -v));
export const pScale = (a, k) => pTrim(a.map(v => v * k));
export function pMul(a, b) {
    const r = new Array(a.length + b.length - 1).fill(0);
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] += a[i] * b[j];
    return pTrim(r);
}
export function pPow(p, n) { let r = [1]; for (let i = 0; i < n; i++) r = pMul(r, p); return r; }
export const pDeriv = (p) => pTrim(p.slice(1).map((c, i) => c * (i + 1)));
export const pEval = (p, x) => { let r = 0; for (let i = p.length - 1; i >= 0; i--) r = r * x + p[i]; return r; };

export function pDivMod(a, b) {
    a = pTrim(a); b = pTrim(b);
    if (pDeg(b) < 0) throw new Error('division by zero polynomial');
    let r = a.slice(), q = new Array(Math.max(a.length - b.length + 1, 1)).fill(0);
    const lb = b[b.length - 1];
    for (let i = r.length - b.length; i >= 0; i--) {
        const f = r[i + b.length - 1] / lb;
        q[i] = f;
        for (let j = 0; j < b.length; j++) r[i + j] -= f * b[j];
    }
    return { q: pTrim(q), r: pTrim(r.map(v => Math.abs(v) < 1e-9 ? 0 : v)) };
}

export function pGcd(a, b) {
    a = pTrim(a); b = pTrim(b);
    let guard = 0;
    while (pDeg(b) >= 0 && guard++ < 60) {
        const { r } = pDivMod(a, b);
        a = b; b = r;
    }
    const lead = a[a.length - 1];
    return pTrim(a.map(v => v / lead));
}

/**
 * 把 AST 转成有理函数 {n, d}（多项式系数低次→高次）。非有理函数返回 null。
 */
export function ratFromAst(node, v) {
    const one = [1];
    const mk = (n, d = one) => ({ n: pTrim(n), d: pTrim(d) });
    const add = (A, B) => mk(pAdd(pMul(A.n, B.d), pMul(B.n, A.d)), pMul(A.d, B.d));
    const mul = (A, B) => mk(pMul(A.n, B.n), pMul(A.d, B.d));
    const inv = (A) => (pDeg(A.n) < 0 ? null : mk(A.d, A.n));

    function go(node) {
        const n = unwrap(node);
        if (typeof n === 'number') return isFinite(n) ? mk([n]) : null;
        if (typeof n === 'string') {
            if (n === v) return mk([0, 1]);
            if (n === 'Pi') return mk([Math.PI]);
            if (n === 'ExponentialE' || n === 'e') return mk([Math.E]);
            if (n === 'Half') return mk([0.5]);
            const num = Number(n);
            return (n.trim() !== '' && !isNaN(num)) ? mk([num]) : null;
        }
        if (!Array.isArray(n)) return null;
        const [op, ...args] = n;
        switch (op) {
            case 'Add': { let acc = mk([0]); for (const a of args) { const r = go(a); if (!r) return null; acc = add(acc, r); } return acc; }
            case 'Subtract': { const A = go(args[0]), B = go(args[1]); return A && B ? add(A, mk(pScale(B.n, -1), B.d)) : null; }
            case 'Negate': { const A = go(args[0]); return A ? mk(pScale(A.n, -1), A.d) : null; }
            case 'Multiply': { let acc = mk([1]); for (const a of args) { const r = go(a); if (!r) return null; acc = mul(acc, r); } return acc; }
            case 'Divide': { const A = go(args[0]), B = go(args[1]); const iB = B && inv(B); return A && iB ? mul(A, iB) : null; }
            case 'Rational': { const A = go(args[0]), B = go(args[1]); const iB = B && inv(B); return A && iB ? mul(A, iB) : null; }
            case 'Square': { const A = go(args[0]); return A ? mul(A, A) : null; }
            case 'Power': {
                const A = go(args[0]);
                if (!A) return null;
                let e;
                try { e = compileAST(args[1], '__none__')(0); } catch (_) { return null; }
                if (!Number.isInteger(e) || Math.abs(e) > 24) return null;
                let acc = mk([1]);
                for (let i = 0; i < Math.abs(e); i++) acc = mul(acc, A);
                return e >= 0 ? acc : inv(acc);
            }
            default: return null;
        }
    }
    return go(node);
}

/** 约去分子分母公因式 */
export function reduceRat(R) {
    if (pDeg(R.d) < 1 || pDeg(R.n) < 0) {
        const lead = R.d[R.d.length - 1];
        return { n: pScale(R.n, 1 / lead), d: pScale(R.d, 1 / lead) };
    }
    const g = pGcd(R.n, R.d);
    let n = R.n, d = R.d;
    if (pDeg(g) >= 1) { n = pDivMod(n, g).q; d = pDivMod(d, g).q; }
    const lead = d[d.length - 1];
    return { n: pScale(n, 1 / lead), d: pScale(d, 1 / lead) };
}

export function polyFromAst(node, v) {
    const R = ratFromAst(node, v);
    if (!R) return null;
    if (pDeg(R.d) === 0) return pScale(R.n, 1 / R.d[0]);
    const red = reduceRat(R);
    return pDeg(red.d) === 0 ? pScale(red.n, 1 / red.d[0]) : null;
}

// --- 多项式 → AST / LaTeX ---

export function polyToAst(p, v) {
    const terms = [];
    for (let i = p.length - 1; i >= 0; i--) {
        const c = p[i];
        if (Math.abs(c) < TOL) continue;
        const pow = i === 0 ? null : (i === 1 ? v : ['Power', v, i]);
        if (!pow) terms.push(numAst(c));
        else if (Math.abs(c - 1) < TOL) terms.push(pow);
        else terms.push(['Multiply', numAst(c), pow]);
    }
    return terms.length === 0 ? 0 : (terms.length === 1 ? terms[0] : ['Add', ...terms]);
}

export function polyLatex(p, v = 'x') {
    let out = '';
    for (let i = p.length - 1; i >= 0; i--) {
        const c = p[i];
        if (Math.abs(c) < TOL) continue;
        const a = Math.abs(c);
        const body = i === 0 ? fmt(a) : `${Math.abs(a - 1) < TOL ? '' : fmt(a)}${v}${i > 1 ? `^{${i}}` : ''}`;
        out += out === '' ? (c < 0 ? '-' : '') + body : (c < 0 ? ' - ' : ' + ') + body;
    }
    return out || '0';
}

// ==========================================
// 3. 求根与因式分解
// ==========================================

function divisors(n) {
    n = Math.abs(Math.round(n));
    const ds = [];
    for (let i = 1; i * i <= n && i <= 1e6; i++) if (n % i === 0) { ds.push(i); if (i * i !== n) ds.push(n / i); }
    return ds;
}

function toIntegerPoly(p) {
    let den = 1;
    for (const c of p) {
        const f = toFrac(c, 1000);
        if (!f) return null;
        den = den / gcdInt(den, f.den) * f.den;
        if (den > 1e6) return null;
    }
    const ints = p.map(c => Math.round(c * den));
    const g = ints.reduce((a, b) => gcdInt(a, b), 0) || 1;
    return ints.map(c => c / g);
}

/** Durand–Kerner：返回所有复根 [{re, im}] */
function durandKerner(p) {
    const n = pDeg(p);
    const lead = p[n];
    const a = p.slice(0, n + 1).map(c => c / lead);
    const evalC = (z) => {
        let re = 1, im = 0;
        for (let i = n - 1; i >= 0; i--) {
            const nr = re * z.re - im * z.im + a[i];
            const ni = re * z.im + im * z.re;
            re = nr; im = ni;
        }
        return { re, im };
    };
    const R = 1 + Math.max(...a.slice(0, n).map(Math.abs));
    let zs = Array.from({ length: n }, (_, k) => {
        const ang = 2 * Math.PI * k / n + 0.4;
        return { re: R * 0.5 * Math.cos(ang), im: R * 0.5 * Math.sin(ang) };
    });
    for (let it = 0; it < 800; it++) {
        let maxd = 0;
        zs = zs.map((z, i) => {
            let dr = 1, di = 0;
            zs.forEach((w, j) => {
                if (i === j) return;
                const xr = z.re - w.re, xi = z.im - w.im;
                const nr = dr * xr - di * xi, ni = dr * xi + di * xr;
                dr = nr; di = ni;
            });
            const f = evalC(z);
            const den = dr * dr + di * di || 1e-300;
            const qr = (f.re * dr + f.im * di) / den, qi = (f.im * dr - f.re * di) / den;
            maxd = Math.max(maxd, Math.hypot(qr, qi));
            return { re: z.re - qr, im: z.im - qi };
        });
        if (maxd < 1e-15 * R) break;
    }
    return zs;
}

/**
 * 实系数多项式的完整分解。
 * 返回 { lead, roots: [{re, im, mult, exact}], degree }
 */
export function polyRoots(poly) {
    let p = pTrim(poly);
    const deg0 = pDeg(p);
    const roots = [];
    if (deg0 < 1) return { lead: p[0], roots, degree: Math.max(deg0, 0) };
    const lead = p[p.length - 1];

    // 1) 零根
    let zeroMult = 0;
    while (p.length > 1 && Math.abs(p[0]) < TOL) { p = p.slice(1); zeroMult++; }
    if (zeroMult) roots.push({ re: 0, im: 0, mult: zeroMult, exact: true });

    // 2) 有理根（精确）
    const ints = pDeg(p) >= 1 ? toIntegerPoly(p) : null;
    if (ints) {
        let ip = ints.slice();
        let progress = true;
        while (progress && ip.length > 2) {
            progress = false;
            const a0 = ip[0], an = ip[ip.length - 1];
            const ps = divisors(a0), qs = divisors(an);
            outer: for (const pp of ps) for (const qq of qs) for (const sgn of [1, -1]) {
                const r = sgn * pp / qq;
                if (Math.abs(pEval(ip, r)) < 1e-7 * (1 + Math.abs(a0))) {
                    let mult = 0;
                    while (ip.length > 1 && Math.abs(pEval(ip, r)) < 1e-7 * (1 + Math.abs(a0))) {
                        ip = pDivMod(ip, [-r, 1]).q; mult++;
                        if (ip.length <= 1) break;
                    }
                    roots.push({ re: r, im: 0, mult, exact: true });
                    progress = true;
                    break outer;
                }
            }
        }
        p = ip;
    }

    // 3) 剩余部分
    const d = pDeg(p);
    if (d === 1) {
        roots.push({ re: -p[0] / p[1], im: 0, mult: 1, exact: !!ints });
    } else if (d === 2) {
        const [c, b, a] = p;
        const disc = b * b - 4 * a * c;
        if (Math.abs(disc) < 1e-12) roots.push({ re: -b / (2 * a), im: 0, mult: 2, exact: true });
        else if (disc > 0) {
            const s = Math.sqrt(disc);
            roots.push({ re: (-b + s) / (2 * a), im: 0, mult: 1, exact: false });
            roots.push({ re: (-b - s) / (2 * a), im: 0, mult: 1, exact: false });
        } else {
            const s = Math.sqrt(-disc) / (2 * Math.abs(a));
            roots.push({ re: -b / (2 * a), im: s, mult: 1, exact: false });
            roots.push({ re: -b / (2 * a), im: -s, mult: 1, exact: false });
        }
    } else if (d > 2) {
        const zs = durandKerner(p);
        const used = new Array(zs.length).fill(false);
        zs.forEach((z, i) => {
            if (used[i]) return;
            const group = [z]; used[i] = true;
            zs.forEach((w, j) => { if (!used[j] && Math.hypot(z.re - w.re, z.im - w.im) < 1e-4 * (1 + Math.hypot(z.re, z.im))) { group.push(w); used[j] = true; } });
            const re = group.reduce((s, g) => s + g.re, 0) / group.length;
            const im = group.reduce((s, g) => s + g.im, 0) / group.length;
            roots.push({ re, im: Math.abs(im) < 1e-7 ? 0 : im, mult: group.length, exact: false });
        });
    }
    roots.forEach(r => { if (Math.abs(r.im) < 1e-9) r.im = 0; r.re = r.re || 0; });
    return { lead, roots, degree: deg0 };
}

/** 实数域因式分解：lead·Π(x-r)^m·Π(x²+px+q)^m */
export function factorReal(poly) {
    const { lead, roots } = polyRoots(poly);
    const linear = [], quad = [];
    roots.filter(r => r.im === 0).forEach(r => linear.push({ r: r.re, mult: r.mult, exact: r.exact }));
    roots.filter(r => r.im > 0).forEach(r => quad.push({ p: -2 * r.re, q: r.re * r.re + r.im * r.im, mult: r.mult }));
    linear.sort((a, b) => a.r - b.r);
    return { lead, linear, quad };
}

export function factorLatex({ lead, linear, quad }, v = 'x') {
    const parts = [];
    const lf = toFrac(lead);
    if (!(lf && lf.num === 1 && lf.den === 1)) parts.push(Math.abs(lead + 1) < TOL ? '-' : fmt(lead));
    linear.forEach(({ r, mult }) => {
        const base = Math.abs(r) < TOL ? v : (r > 0 ? `${v} - ${fmt(r)}` : `${v} + ${fmt(-r)}`);
        const needParen = Math.abs(r) >= TOL;
        const b = needParen ? `\\left(${base}\\right)` : base;
        parts.push(mult > 1 ? `${b}^{${mult}}` : b);
    });
    quad.forEach(({ p, q, mult }) => {
        const b = `\\left(${polyLatex([q, p, 1], v)}\\right)`;
        parts.push(mult > 1 ? `${b}^{${mult}}` : b);
    });
    return parts.join('') || '1';
}

// ==========================================
// 4. 线性方程组 / 线性表达式
// ==========================================

export function solveLinearSystem(matrix, vector) {
    if (!matrix || !vector || matrix.length === 0) return null;
    const N = vector.length;
    const m = matrix.map((row, i) => [...row, vector[i]]);
    for (let i = 0; i < N; i++) {
        let maxRow = i;
        for (let k = i + 1; k < N; k++) if (Math.abs(m[k][i]) > Math.abs(m[maxRow][i])) maxRow = k;
        [m[i], m[maxRow]] = [m[maxRow], m[i]];
        if (Math.abs(m[i][i]) < 1e-11) return null;
        for (let k = i + 1; k < N; k++) {
            const f = m[k][i] / m[i][i];
            for (let j = i; j <= N; j++) m[k][j] -= f * m[i][j];
        }
    }
    const ans = new Array(N).fill(0);
    for (let i = N - 1; i >= 0; i--) {
        let s = 0;
        for (let j = i + 1; j < N; j++) s += m[i][j] * ans[j];
        ans[i] = (m[i][N] - s) / m[i][i];
    }
    return ans.map(val => Math.abs(Math.round(val) - val) < 1e-9 ? Math.round(val) : val);
}

/** 提取关于 vars 的线性形式：{ coef: {x: a, y: b}, c } ；非线性返回 null */
export function linearForm(node, vars) {
    function go(node) {
        const n = unwrap(node);
        if (typeof n === 'number') return { coef: {}, c: n };
        if (typeof n === 'string') {
            if (vars.includes(n)) return { coef: { [n]: 1 }, c: 0 };
            const cv = n === 'Pi' ? Math.PI : (n === 'ExponentialE' || n === 'e') ? Math.E : Number(n);
            return isNaN(cv) ? null : { coef: {}, c: cv };
        }
        if (!Array.isArray(n)) return null;
        const [op, ...args] = n;
        const comb = (A, B, s) => {
            const coef = { ...A.coef };
            for (const k in B.coef) coef[k] = (coef[k] || 0) + s * B.coef[k];
            return { coef, c: A.c + s * B.c };
        };
        const scale = (A, k) => ({ coef: Object.fromEntries(Object.entries(A.coef).map(([a, b]) => [a, b * k])), c: A.c * k });
        const isConst = (A) => Object.values(A.coef).every(v => Math.abs(v) < 1e-14);
        switch (op) {
            case 'Add': { let acc = { coef: {}, c: 0 }; for (const a of args) { const r = go(a); if (!r) return null; acc = comb(acc, r, 1); } return acc; }
            case 'Subtract': { const A = go(args[0]), B = go(args[1]); return A && B ? comb(A, B, -1) : null; }
            case 'Negate': { const A = go(args[0]); return A ? scale(A, -1) : null; }
            case 'Multiply': {
                let acc = { coef: {}, c: 1 };
                for (const a of args) {
                    const r = go(a); if (!r) return null;
                    if (isConst(acc)) acc = scale(r, acc.c);
                    else if (isConst(r)) acc = scale(acc, r.c);
                    else return null;
                }
                return acc;
            }
            case 'Divide': { const A = go(args[0]), B = go(args[1]); return A && B && isConst(B) && B.c !== 0 ? scale(A, 1 / B.c) : null; }
            case 'Rational': { const A = go(args[0]), B = go(args[1]); return A && B && isConst(B) && B.c !== 0 ? scale(A, 1 / B.c) : null; }
            default: return null;
        }
    }
    return go(node);
}

/** 高斯-若尔当消元，返回 { type: 'unique'|'none'|'infinite', solution, rank, rref } */
export function gaussJordan(aug, nVars) {
    const m = aug.map(r => r.slice());
    let row = 0;
    const pivots = [];
    for (let col = 0; col < nVars && row < m.length; col++) {
        let best = row;
        for (let k = row + 1; k < m.length; k++) if (Math.abs(m[k][col]) > Math.abs(m[best][col])) best = k;
        if (Math.abs(m[best][col]) < 1e-10) continue;
        [m[row], m[best]] = [m[best], m[row]];
        const pv = m[row][col];
        m[row] = m[row].map(v => v / pv);
        for (let k = 0; k < m.length; k++) {
            if (k === row) continue;
            const f = m[k][col];
            if (Math.abs(f) > 0) m[k] = m[k].map((v, j) => v - f * m[row][j]);
        }
        pivots.push(col);
        row++;
    }
    const clean = m.map(r => r.map(v => (Math.abs(v) < 1e-10 ? 0 : v)));
    for (const r of clean) {
        if (r.slice(0, nVars).every(v => v === 0) && Math.abs(r[nVars]) > 1e-8) return { type: 'none', rank: pivots.length, rref: clean };
    }
    if (pivots.length < nVars) return { type: 'infinite', rank: pivots.length, pivots, rref: clean };
    const solution = new Array(nVars).fill(0);
    pivots.forEach((c, i) => { solution[c] = clean[i][nVars]; });
    return { type: 'unique', solution, rank: pivots.length, rref: clean };
}

// ==========================================
// 5. 数值工具：极限、求根、积分
// ==========================================

function richardson(f, x0, sgn) {
    const h0 = 0.08, L = 7;
    const T = [];
    for (let i = 0; i < L; i++) {
        T[i] = [f(x0 + sgn * h0 / Math.pow(2, i))];
        if (!isFinite(T[i][0])) return NaN;
        for (let j = 1; j <= i; j++) {
            const k = Math.pow(2, j);
            T[i][j] = (k * T[i][j - 1] - T[i - 1][j - 1]) / (k - 1);
        }
    }
    const a = T[L - 1][L - 1], b = T[L - 1][L - 3];
    return Math.abs(a - b) < 1e-6 * (1 + Math.abs(a)) ? a : NaN;
}

/**
 * 数值极限估计。point 可为有限数或 ±Infinity；side: 'both' | '+' | '-'。
 * 返回 { kind: 'finite'|'inf'|'dne', value, left, right }
 */
export function numericLimit(f, point, side = 'both') {
    const safe = (x) => { try { const v = f(x); return typeof v === 'number' ? v : NaN; } catch (_) { return NaN; } };

    if (!isFinite(point)) {
        const sgn = point > 0 ? 1 : -1;
        const xs = [1e3, 1e4, 1e5, 1e6, 1e7, 1e8].map(v => sgn * v);
        const ys = xs.map(safe);
        if (ys.some(v => isNaN(v))) return { kind: 'dne' };
        const last = ys[ys.length - 1], prev = ys[ys.length - 2];
        if (Math.abs(last - prev) < 1e-5 * (1 + Math.abs(last)) && Math.abs(ys[3] - ys[4]) < 1e-3 * (1 + Math.abs(last))) {
            // 对最后两点（x 相差 10 倍）做 Richardson 外推，消去 1/x 型误差项
            let v = (10 * last - prev) / 9;
            if (Math.abs(v) < 1e-9) v = 0;
            return { kind: 'finite', value: v };
        }
        const grows = ys.every((v, i) => i === 0 || Math.abs(v) > Math.abs(ys[i - 1]) * 1.2) && Math.abs(last) > 1e6;
        if (grows) return { kind: 'inf', value: Math.sign(last) * Infinity };
        return { kind: 'dne' };
    }

    const probeSide = (sgn) => {
        const v = richardson(safe, point, sgn);
        if (!isNaN(v)) return { kind: 'finite', value: v };
        const hs = [1e-3, 1e-5, 1e-7, 1e-9].map(h => safe(point + sgn * h));
        if (hs.every(isFinite) && hs.every((y, i) => i === 0 || Math.abs(y) > Math.abs(hs[i - 1]) * 3) && Math.abs(hs[3]) > 1e5) {
            return { kind: 'inf', value: Math.sign(hs[3]) * Infinity };
        }
        return { kind: 'dne' };
    };
    const R = side === '-' ? null : probeSide(1);
    const L = side === '+' ? null : probeSide(-1);
    if (side === '+') return { ...R, right: R };
    if (side === '-') return { ...L, left: L };
    if (L.kind === 'finite' && R.kind === 'finite') {
        if (Math.abs(L.value - R.value) < 1e-6 * (1 + Math.abs(L.value))) return { kind: 'finite', value: (L.value + R.value) / 2, left: L, right: R };
        return { kind: 'dne', left: L, right: R };
    }
    if (L.kind === 'inf' && R.kind === 'inf' && L.value === R.value) return { kind: 'inf', value: L.value, left: L, right: R };
    return { kind: 'dne', left: L, right: R };
}

/** 扫描 [lo, hi] 内的零点、极点与定义域边界 */
export function scanRoots(f, lo = -10, hi = 10, N = 6000) {
    const roots = [], poles = [], edges = [];
    const safe = (x) => { try { const v = f(x); return typeof v === 'number' ? v : NaN; } catch (_) { return NaN; } };
    const snap = (x) => { const r = Math.round(x * 1e6) / 1e6; return Math.abs(x - r) < 1e-9 ? r : x; };
    const push = (arr, x) => { x = snap(x); if (!arr.some(r => Math.abs(r - x) < 1e-6)) arr.push(x); };
    const xs = Array.from({ length: N + 1 }, (_, i) => lo + (hi - lo) * i / N);
    const ys = xs.map(safe);

    for (let i = 0; i < N; i++) {
        const y0 = ys[i], y1 = ys[i + 1];
        const f0 = isFinite(y0), f1 = isFinite(y1);
        if (f0 && f1) {
            if (y0 === 0) { push(roots, xs[i]); continue; }
            if (y0 * y1 < 0) {
                let a = xs[i], b = xs[i + 1], fa = y0;
                for (let k = 0; k < 80; k++) {
                    const m = (a + b) / 2, fm = safe(m);
                    if (!isFinite(fm)) break;
                    if (fa * fm <= 0) b = m; else { a = m; fa = fm; }
                }
                const r = (a + b) / 2, fr = safe(r);
                if (isFinite(fr) && Math.abs(fr) < 1e-5) push(roots, r);
                else push(poles, r);
            }
        } else if (f0 !== f1) {
            // 一侧有定义、一侧无定义：定位边界，区分极点与定义域边界
            let a = f0 ? xs[i] : xs[i + 1], b = f0 ? xs[i + 1] : xs[i];   // a 有定义，b 无定义
            for (let k = 0; k < 80; k++) { const m = (a + b) / 2; if (isFinite(safe(m))) a = m; else b = m; }
            const edge = f0 ? b : a;
            const probe = safe(a);
            if (isFinite(probe) && Math.abs(probe) > 1e6) push(poles, edge);
            else push(edges, edge);
        } else if (i > 0 && isNaN(y0) && isFinite(ys[i - 1]) && isFinite(y1)) {
            // 孤立的无定义点（如网格恰好落在极点）
            const l = safe(xs[i] - 1e-9), r = safe(xs[i] + 1e-9);
            if ((isFinite(l) && Math.abs(l) > 1e5) || (isFinite(r) && Math.abs(r) > 1e5)) push(poles, xs[i]);
            else push(edges, xs[i]);
        }
    }
    // 相切零点：|f| 的局部极小
    for (let i = 1; i < N; i++) {
        const a = Math.abs(ys[i - 1]), b = Math.abs(ys[i]), c = Math.abs(ys[i + 1]);
        if (isFinite(a) && isFinite(b) && isFinite(c) && b <= a && b <= c && b < 1e-2) {
            let l = xs[i - 1], r = xs[i + 1];
            const g = (x) => Math.abs(safe(x));
            for (let k = 0; k < 100; k++) {
                const m1 = l + (r - l) / 3, m2 = r - (r - l) / 3;
                if (g(m1) < g(m2)) r = m2; else l = m1;
            }
            const x = (l + r) / 2;
            if (g(x) < 1e-7 && !roots.some(q => Math.abs(q - x) < 1e-4)) push(roots, x);
        }
    }
    const srt = (arr) => arr.sort((p, q) => p - q);
    return { roots: srt(roots), poles: srt(poles), edges: srt(edges) };
}

/** tanh-sinh / exp-sinh / sinh-sinh 数值积分，支持端点奇异与无穷区间 */
export function integrateNumeric(f, a, b) {
    if (a === b) return 0;
    if (a > b) return -integrateNumeric(f, b, a);
    const safe = (x) => { try { const v = f(x); return isFinite(v) ? v : 0; } catch (_) { return 0; } };
    let g, wfun;
    if (isFinite(a) && isFinite(b)) {
        const mid = (a + b) / 2, half = (b - a) / 2;
        g = (t) => {
            const u = Math.PI / 2 * Math.sinh(t);
            if (u < 0) { const e = Math.exp(2 * u); return a + half * 2 * e / (1 + e); }   // 靠近 a 端：避免相消误差
            const e = Math.exp(-2 * u); return b - half * 2 * e / (1 + e);
        };
        wfun = (t) => { const u = Math.PI / 2 * Math.sinh(t); const c = Math.cosh(u); return half * (Math.PI / 2) * Math.cosh(t) / (c * c); };
    } else if (isFinite(a) && !isFinite(b)) {
        g = (t) => a + Math.exp(Math.PI / 2 * Math.sinh(t));
        wfun = (t) => Math.exp(Math.PI / 2 * Math.sinh(t)) * (Math.PI / 2) * Math.cosh(t);
    } else if (!isFinite(a) && isFinite(b)) {
        g = (t) => b - Math.exp(Math.PI / 2 * Math.sinh(t));
        wfun = (t) => Math.exp(Math.PI / 2 * Math.sinh(t)) * (Math.PI / 2) * Math.cosh(t);
    } else {
        g = (t) => Math.sinh(Math.PI / 2 * Math.sinh(t));
        wfun = (t) => Math.cosh(Math.PI / 2 * Math.sinh(t)) * (Math.PI / 2) * Math.cosh(t);
    }
    const T = 4.2;
    let h = 1, prev = null, sum = 0;
    // 初始层
    const term = (t) => { const w = wfun(t); return isFinite(w) ? w * safe(g(t)) : 0; };
    sum = term(0);
    for (let t = h; t <= T; t += h) sum += term(t) + term(-t);
    let I = sum * h;
    for (let level = 1; level <= 7; level++) {
        h /= 2;
        for (let t = h; t <= T; t += 2 * h) sum += term(t) + term(-t);
        const next = sum * h;
        if (prev !== null && Math.abs(next - I) < 1e-11 * (1 + Math.abs(next))) { return next; }
        prev = I; I = next;
    }
    return I;
}

// ==========================================
// 6. 不等式区间
// ==========================================

/**
 * 根据临界点与测试点符号生成解集区间。
 * rel: '<' | '<=' | '>' | '>='；f 为 F(x)=lhs-rhs 的数值函数；
 * roots 为零点，poles 为极点/不可取点，edges 为定义域边界（函数值有限时可取）。
 */
export function solveSignIntervals(f, rel, roots, poles, edges = [], window = null) {
    const call = (x) => { try { const v = f(x); return typeof v === 'number' ? v : NaN; } catch (_) { return NaN; } };
    const strict = rel === '<' || rel === '>';
    const wantStrict = (v) => (rel[0] === '<' ? v < -1e-12 : v > 1e-12);
    const pts = [...roots, ...poles, ...edges].sort((a, b) => a - b).filter((x, i, arr) => i === 0 || Math.abs(x - arr[i - 1]) > 1e-7);

    const bounds = window ? [window.lo, ...pts.filter(x => x > window.lo && x < window.hi), window.hi] : [-Infinity, ...pts, Infinity];
    if (window) { pts.length = 0; pts.push(...bounds.slice(1, -1)); }
    const segOK = [];
    for (let i = 0; i < bounds.length - 1; i++) {
        const l = bounds[i], r = bounds[i + 1];
        const sample = l === -Infinity ? (r === Infinity ? 0 : r - 1 - Math.abs(r)) : (r === Infinity ? l + 1 + Math.abs(l) : (l + r) / 2);
        const v = call(sample);
        segOK.push(isFinite(v) && wantStrict(v));
    }
    const ptOK = pts.map(x => {
        const v = call(x);
        if (!isFinite(v)) return false;
        return strict ? wantStrict(v) : (rel[0] === '<' ? v <= 1e-9 : v >= -1e-9);
    });

    const out = [];
    let cur = null;
    for (let i = 0; i < segOK.length; i++) {
        if (segOK[i]) {
            const lc = i > 0 ? ptOK[i - 1] : !!window;
            const rc = i < pts.length ? ptOK[i] : !!window;
            if (cur && ptOK[i - 1]) { cur.r = bounds[i + 1]; cur.rc = rc; }
            else { if (cur) out.push(cur); cur = { l: bounds[i], r: bounds[i + 1], lc, rc }; }
        } else if (cur) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    // 孤立成立的点（≤ / ≥ 时）
    pts.forEach((x, j) => {
        if (ptOK[j] && !out.some(s => x >= s.l - 1e-9 && x <= s.r + 1e-9)) out.push({ l: x, r: x, lc: true, rc: true, point: true });
    });
    return out.sort((a, b) => a.l - b.l);
}

export function intervalsLatex(segs) {
    if (segs.length === 0) return '\\varnothing';
    return segs.map(s => {
        if (s.point) return `\\left\\{${fmt(s.l)}\\right\\}`;
        const a = s.l === -Infinity ? '-\\infty' : fmt(s.l);
        const b = s.r === Infinity ? '+\\infty' : fmt(s.r);
        return `${s.l === -Infinity || !s.lc ? '(' : '['}${a}, ${b}${s.r === Infinity || !s.rc ? ')' : ']'}`;
    }).join(' \\cup ');
}

// ==========================================
// 7. 有理函数积分（多项式除法 + 部分分式）
// ==========================================

function sqrtAst(v) {
    const s = Math.sqrt(v);
    const f = toFrac(s, 500);
    return f && Math.abs(f.num / f.den - s) < 1e-10 ? numAst(s) : ['Sqrt', numAst(v)];
}

/**
 * ∫ num/den dx（num、den 为实系数多项式）。
 * 返回 { ast, steps:[{title, latex}] } 或 null（分母无法分解时）
 */
export function integrateRational(num, den, v = 'x') {
    num = pTrim(num); den = pTrim(den);
    const steps = [];
    if (pDeg(den) < 1) return null;

    // 约分
    const red = reduceRat({ n: num, d: den });
    num = red.n; den = red.d;
    if (pDeg(den) < 1) {
        return { ast: ['Multiply', numAst(1 / den[0]), polyAntiderivativeAst(num, v)], steps };
    }

    const terms = [];
    // 多项式长除法
    let rem = num;
    if (pDeg(num) >= pDeg(den)) {
        const { q, r } = pDivMod(num, den);
        steps.push({
            title: '分子次数不低于分母，先做多项式长除法',
            latex: `\\frac{${polyLatex(num, v)}}{${polyLatex(den, v)}} = ${polyLatex(q, v)} + \\frac{${polyLatex(r, v)}}{${polyLatex(den, v)}}`
        });
        terms.push(polyAntiderivativeAst(q, v));
        rem = r;
    }
    if (pDeg(rem) < 0 || (rem.length === 1 && Math.abs(rem[0]) < TOL)) {
        return { ast: terms.length === 1 ? terms[0] : ['Add', ...terms], steps };
    }

    // 分母分解（首一化）
    const fac = factorReal(den);
    const lead = fac.lead;
    const nrm = pScale(rem, 1 / lead);
    const irreducible = fac.linear.length === 0 && fac.quad.length === 1 && fac.quad[0].mult === 1;
    steps.push(irreducible
        ? { title: '分母在实数域内不可再分解（判别式小于 0）', latex: `${polyLatex(den, v)} \\;\\text{不可约}` }
        : { title: '在实数域内对分母因式分解', latex: `${polyLatex(den, v)} = ${factorLatex(fac, v)}` });

    // 构造未知量与基函数
    const unknowns = [];
    const factorsList = [
        ...fac.linear.map(f => ({ type: 'lin', r: f.r, mult: f.mult, poly: [-f.r, 1] })),
        ...fac.quad.map(f => ({ type: 'quad', p: f.p, q: f.q, mult: f.mult, poly: [f.q, f.p, 1] }))
    ];
    const denMonic = pScale(den, 1 / lead);
    const labels = 'ABCDEFGHIJKLMNPQRSTUVWXYZ'.split('');
    let li = 0;
    const decompLatex = [];
    factorsList.forEach(fd => {
        for (let k = 1; k <= fd.mult; k++) {
            const pk = pPow(fd.poly, k);
            const basis = pDivMod(denMonic, pk).q;
            const pkLatex = k === 1 ? `\\left(${polyLatex(fd.poly, v)}\\right)` : `\\left(${polyLatex(fd.poly, v)}\\right)^{${k}}`;
            if (fd.type === 'lin') {
                const l = labels[li++];
                unknowns.push({ fd, k, kind: 'c', basis, label: l });
                decompLatex.push(`\\frac{${l}}{${pkLatex}}`);
            } else {
                const l1 = labels[li++], l2 = labels[li++];
                unknowns.push({ fd, k, kind: 'x', basis: pMul(basis, [0, 1]), label: l1 });
                unknowns.push({ fd, k, kind: 'c', basis, label: l2 });
                decompLatex.push(`\\frac{${l1}${v} + ${l2}}{${pkLatex}}`);
            }
        }
    });
    steps.push({
        title: '设定部分分式展开形式（待定系数）',
        latex: `\\frac{${polyLatex(rem, v)}}{${polyLatex(den, v)}} = ${decompLatex.join(' + ')}`
    });

    const N = unknowns.length;
    if (N !== pDeg(denMonic)) return null;
    const M = [], V = [];
    for (let d = 0; d < N; d++) { M.push(unknowns.map(u => u.basis[d] || 0)); V.push(nrm[d] || 0); }
    const sol = solveLinearSystem(M, V);
    if (!sol) return null;

    // 求值（每个系数取一条等式展示）
    steps.push({
        title: '比较两端同次幂系数，解得待定系数',
        latex: unknowns.map((u, i) => `${u.label} = ${fmt(sol[i] / lead)}`).join(',\\; ')
    });

    // 逐项积分
    let idx = 0;
    const out = [...terms];
    const coefLead = 1 / lead;
    factorsList.forEach(fd => {
        for (let k = 1; k <= fd.mult; k++) {
            if (fd.type === 'lin') {
                const A = sol[idx++] * coefLead;
                if (Math.abs(A) < TOL) continue;
                const base = fd.r === 0 ? v : (fd.r > 0 ? ['Subtract', v, numAst(fd.r)] : ['Add', v, numAst(-fd.r)]);
                if (k === 1) out.push(['Multiply', numAst(A), ['Ln', ['Abs', base]]]);
                else out.push(['Multiply', numAst(A / (1 - k)), ['Power', base, 1 - k]]);
            } else {
                const B = sol[idx++] * coefLead, D = sol[idx++] * coefLead;
                const { p, q } = fd;
                const h = p / 2, s2 = q - h * h;
                const Q = polyToAst([q, p, 1], v);
                const E = D - B * h;
                if (Math.abs(B) > TOL) {
                    if (k === 1) out.push(['Multiply', numAst(B / 2), ['Ln', Q]]);
                    else out.push(['Multiply', numAst(B / (2 * (1 - k))), ['Power', Q, 1 - k]]);
                }
                if (Math.abs(E) > TOL) {
                    const xh = h === 0 ? v : ['Add', v, numAst(h)];
                    const s = sqrtAst(s2);
                    // J_1 = (1/s) arctan((x+h)/s)
                    let J = ['Multiply', ['Divide', 1, s], ['Arctan', ['Divide', xh, s]]];
                    for (let j = 2; j <= k; j++) {
                        const c1 = 2 * s2 * (j - 1);
                        J = ['Add',
                            ['Divide', xh, ['Multiply', numAst(c1), ['Power', Q, j - 1]]],
                            ['Multiply', numAst((2 * j - 3) / c1), J]];
                    }
                    out.push(['Multiply', numAst(E), J]);
                }
            }
        }
    });
    return { ast: out.length === 1 ? out[0] : ['Add', ...out], steps };
}

export function polyAntiderivativeAst(p, v) {
    const terms = [];
    p.forEach((c, i) => {
        if (Math.abs(c) < TOL) return;
        const coef = c / (i + 1);
        const pow = i + 1 === 1 ? v : ['Power', v, i + 1];
        terms.push(Math.abs(coef - 1) < TOL ? pow : ['Multiply', numAst(coef), pow]);
    });
    return terms.length === 0 ? 0 : (terms.length === 1 ? terms[0] : ['Add', ...terms]);
}

// ==========================================
// 8. 矩阵运算（数值矩阵）
// ==========================================

const clean0 = (v) => (Math.abs(v) < 1e-10 ? 0 : (Math.abs(v - Math.round(v)) < 1e-10 ? Math.round(v) : v));

export const matShape = (A) => [A.length, A[0].length];
export const matIdentity = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
export const matT = (A) => A[0].map((_, j) => A.map(r => r[j]));
export const matScale = (A, k) => A.map(r => r.map(v => clean0(v * k)));
export const matAdd = (A, B, s = 1) => A.map((r, i) => r.map((v, j) => clean0(v + s * B[i][j])));
export function matMul(A, B) {
    return A.map((_, i) => B[0].map((__, j) => clean0(A[i].reduce((s, v, k) => s + v * B[k][j], 0))));
}
export const matTrace = (A) => clean0(A.reduce((s, r, i) => s + r[i], 0));

/** 行列式（部分主元消元），同时返回上三角矩阵与换行次数 */
export function matDet(A) {
    const n = A.length;
    const U = A.map(r => r.slice());
    let swaps = 0, det = 1;
    for (let c = 0; c < n; c++) {
        let p = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(U[r][c]) > Math.abs(U[p][c])) p = r;
        if (Math.abs(U[p][c]) < 1e-12) return { det: 0, U: U.map(r => r.map(clean0)), swaps };
        if (p !== c) { [U[p], U[c]] = [U[c], U[p]]; swaps++; }
        for (let r = c + 1; r < n; r++) {
            const f = U[r][c] / U[c][c];
            for (let k = c; k < n; k++) U[r][k] -= f * U[c][k];
        }
        det *= U[c][c];
    }
    return { det: clean0(det * (swaps % 2 ? -1 : 1)), U: U.map(r => r.map(clean0)), swaps };
}

/** 逆矩阵（高斯-若尔当）；奇异返回 null */
export function matInverse(A) {
    const n = A.length;
    const M = A.map((r, i) => [...r, ...matIdentity(n)[i]]);
    for (let c = 0; c < n; c++) {
        let p = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
        if (Math.abs(M[p][c]) < 1e-12) return null;
        [M[p], M[c]] = [M[c], M[p]];
        const pv = M[c][c];
        M[c] = M[c].map(v => v / pv);
        for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; M[r] = M[r].map((v, k) => v - f * M[c][k]); }
    }
    return M.map(r => r.slice(n).map(clean0));
}

export function matRank(A, tol = 1e-9) {
    const M = A.map(r => r.slice());
    let rank = 0;
    for (let c = 0; c < M[0].length && rank < M.length; c++) {
        let p = rank;
        for (let r = rank + 1; r < M.length; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
        if (Math.abs(M[p][c]) < tol) continue;
        [M[p], M[rank]] = [M[rank], M[p]];
        for (let r = rank + 1; r < M.length; r++) { const f = M[r][c] / M[rank][c]; for (let k = c; k < M[0].length; k++) M[r][k] -= f * M[rank][k]; }
        rank++;
    }
    return rank;
}

/** 特征多项式 det(λI − A) 的系数（低次→高次），Faddeev–LeVerrier */
export function matCharPoly(A) {
    const n = A.length, c = new Array(n + 1).fill(0);
    c[n] = 1;
    let Mk = A.map(r => r.map(() => 0));
    for (let k = 1; k <= n; k++) {
        const AM = matMul(A, Mk);
        Mk = AM.map((r, i) => r.map((v, j) => v + (i === j ? c[n - k + 1] : 0)));
        c[n - k] = -matTrace(matMul(A, Mk)) / k;
    }
    return c.map(clean0);
}

/** (A − λI)v = 0 的基础解系 */
export function matNullspace(M, tol = 1e-7) {
    const R = M.map(r => r.slice()), rows = R.length, cols = R[0].length;
    const piv = [];
    let r0 = 0;
    for (let c = 0; c < cols && r0 < rows; c++) {
        let p = r0;
        for (let r = r0 + 1; r < rows; r++) if (Math.abs(R[r][c]) > Math.abs(R[p][c])) p = r;
        if (Math.abs(R[p][c]) < tol) continue;
        [R[p], R[r0]] = [R[r0], R[p]];
        const pv = R[r0][c];
        R[r0] = R[r0].map(v => v / pv);
        for (let r = 0; r < rows; r++) if (r !== r0) { const f = R[r][c]; R[r] = R[r].map((v, k) => v - f * R[r0][k]); }
        piv.push(c); r0++;
    }
    const free = Array.from({ length: cols }, (_, i) => i).filter(i => !piv.includes(i));
    return free.map(f => {
        const v = new Array(cols).fill(0);
        v[f] = 1;
        piv.forEach((pc, i) => { v[pc] = -R[i][f]; });
        // 归一化为首个非零分量为正的整数比（若可能）
        const nz = v.find(x => Math.abs(x) > 1e-9) || 1;
        let w = v.map(x => x / nz);
        for (let d = 1; d <= 12; d++) { if (w.every(x => Math.abs(x * d - Math.round(x * d)) < 1e-7)) { w = w.map(x => Math.round(x * d)); break; } }
        return w.map(clean0);
    });
}

const numOrParen = (v) => (v < 0 ? `(${fmt(v)})` : fmt(v));

/** 矩阵 → LaTeX（统一使用圆括号矩阵） */
export function matLatex(A, env = 'pmatrix') {
    return `\\begin{${env}} ${A.map(r => r.map(v => fmt(clean0(v))).join(' & ')).join(' \\\\ ')} \\end{${env}}`;
}
/** 增广矩阵 [A | B] */
export function augLatex(A, B) {
    const n = A[0].length, m = B[0].length;
    return `\\left[\\begin{array}{${'c'.repeat(n)}|${'c'.repeat(m)}} ${A.map((r, i) => [...r, ...B[i]].map(v => fmt(clean0(v))).join(' & ')).join(' \\\\ ')} \\end{array}\\right]`;
}
export function matEntryDetail(A, B, i, j) {
    const terms = A[i].map((v, k) => `${numOrParen(v)}\\cdot${numOrParen(B[k][j])}`).join(' + ');
    return `c_{${i + 1}${j + 1}} = ${terms} = ${fmt(clean0(A[i].reduce((s, v, k) => s + v * B[k][j], 0)))}`;
}

// ==========================================
// 9. 统一的 LaTeX 打印器：项排序、括号、上下标规范
// ==========================================

const GREEK = new Set(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu', 'sigma', 'phi', 'omega', 'rho', 'tau']);
const FN_NAMES = {
    Sin: '\\sin', Cos: '\\cos', Tan: '\\tan', Cot: '\\cot', Sec: '\\sec', Csc: '\\csc',
    Arcsin: '\\arcsin', Arccos: '\\arccos', Arctan: '\\arctan', Arccot: '\\operatorname{arccot}',
    Sinh: '\\sinh', Cosh: '\\cosh', Tanh: '\\tanh', Coth: '\\coth', Sech: '\\operatorname{sech}', Csch: '\\operatorname{csch}',
    Arsinh: '\\operatorname{arsinh}', Arcosh: '\\operatorname{arcosh}', Artanh: '\\operatorname{artanh}',
    Ln: '\\ln', Lb: '\\log_{2}', Sign: '\\operatorname{sgn}', Floor: '\\operatorname{floor}', Ceil: '\\operatorname{ceil}'
};

function symbolLatex(n) {
    switch (n) {
        case 'Pi': return '\\pi';
        case 'ExponentialE': return 'e';
        case 'ImaginaryUnit': return 'i';
        case 'PositiveInfinity': case 'Infinity': return '\\infty';
        case 'NegativeInfinity': return '-\\infty';
        case 'Half': return '\\frac{1}{2}';
        case 'Y': return 'y';
        case 'Yp': return "y'";
        case 'Ypp': return "y''";
        case 'NaN': return '\\text{无定义}';
        case 'ComplexInfinity': return '\\infty';
    }
    if (GREEK.has(n)) return `\\${n}`;
    let m = n.match(/^([A-Za-z])(\d+)$/);
    if (m) return `${m[1]}_{${m[2]}}`;
    m = n.match(/^([A-Za-z])_(.+)$/);
    if (m) return `${m[1]}_{${m[2]}}`;
    if (/^[A-Za-z]$/.test(n)) return n;
    if (/^[A-Za-z]+$/.test(n)) return `\\mathrm{${n}}`;
    return n;
}

/** 把 MathJSON 打印成规范 LaTeX；遇到不支持的算子抛出异常，由调用方回退 */
export function astToLatex(ast, options = {}) {
    const free = [...freeSymbols(ast)];
    const mainVar = options.mainVar || (free.includes('x') ? 'x' : (free.find(s => /^[a-z]$/.test(s)) || null));
    const isVar = (n) => n === mainVar;

    const numOf = (node) => {
        const n = unwrap(node);
        if (typeof n === 'number') return n;
        if (Array.isArray(n) && n[0] === 'Rational' && typeof n[1] === 'number' && typeof n[2] === 'number') return n[1] / n[2];
        if (n === 'Half') return 0.5;
        return null;
    };
    const isInt = (v) => v !== null && Math.abs(v - Math.round(v)) < 1e-12;

    const degOf = (node) => {
        const n = unwrap(node);
        if (typeof n === 'number') return 0;
        if (typeof n === 'string') return isVar(n) ? 1 : 0;
        if (!Array.isArray(n)) return 0;
        const [op, ...a] = n;
        switch (op) {
            case 'Power': { const e = numOf(a[1]); return e === null ? 0.5 : degOf(a[0]) * e; }
            case 'Square': return degOf(a[0]) * 2;
            case 'Sqrt': return degOf(a[0]) * 0.5;
            case 'Multiply': return a.reduce((s, x) => s + degOf(x), 0);
            case 'Divide': return degOf(a[0]) - degOf(a[1]);
            case 'Negate': return degOf(a[0]);
            case 'Add': case 'Subtract': return Math.max(...a.map(degOf));
            case 'Rational': return 0;
            default: return 0.5;
        }
    };

    const wrap = (r, need) => {
        if (r.p >= need) return r.s;
        const tall = /\\frac|\\int|\\sqrt|\\left|\\sum/.test(r.s);
        return tall ? `\\left(${r.s}\\right)` : `(${r.s})`;
    };
    const R = (s, p, extra = {}) => ({ s, p, ...extra });

    // 拆出符号：返回 { neg, node }
    const splitSign = (node) => {
        const n = unwrap(node);
        const v = numOf(n);
        if (v !== null && v < 0) return { neg: true, node: typeof n === 'number' ? -n : ['Rational', -n[1], n[2]] };
        if (Array.isArray(n) && n[0] === 'Negate') { const s = splitSign(n[1]); return { neg: !s.neg, node: s.node }; }
        if (Array.isArray(n) && n[0] === 'Multiply') {
            const first = numOf(n[1]);
            if (first !== null && first < 0) return { neg: true, node: first === -1 && n.length === 3 ? n[2] : ['Multiply', -first, ...n.slice(2)] };
        }
        return { neg: false, node: n };
    };

    const flattenAdd = (node, sign, out) => {
        const n = unwrap(node);
        if (Array.isArray(n) && n[0] === 'Add') n.slice(1).forEach(x => flattenAdd(x, sign, out));
        else if (Array.isArray(n) && n[0] === 'Subtract') { flattenAdd(n[1], sign, out); flattenAdd(n[2], -sign, out); }
        else if (Array.isArray(n) && n[0] === 'Negate') flattenAdd(n[1], -sign, out);
        else { const sp = splitSign(n); out.push({ neg: (sign < 0) !== sp.neg, node: sp.node }); }
    };

    // 乘积：拆成分子、分母、数值系数
    const collectProduct = (node, inv, st) => {
        const n = unwrap(node);
        const v = numOf(n);
        if (v !== null) {
            const f = toFrac(v);
            if (f && !(typeof n === 'number' && f.den === 1)) { st.coefNum *= inv ? f.den : f.num; st.coefDen *= inv ? f.num : f.den; }
            else if (inv) st.coefDen *= v; else st.coefNum *= v;
            return;
        }
        if (Array.isArray(n)) {
            const [op, ...a] = n;
            if (op === 'Multiply') { a.forEach(x => collectProduct(x, inv, st)); return; }
            if (op === 'Divide') { collectProduct(a[0], inv, st); collectProduct(a[1], !inv, st); return; }
            if (op === 'Negate') { st.coefNum *= -1; collectProduct(a[0], inv, st); return; }
            if (op === 'Power') {
                const e = numOf(a[1]);
                if (e !== null && e < 0) { (inv ? st.num : st.den).push(e === -1 ? a[0] : ['Power', a[0], -e]); return; }
            }
            if (op === 'Exp') {
                const sp = splitSign(a[0]);
                if (sp.neg) { (inv ? st.num : st.den).push(['Exp', sp.node]); return; }
            }
        }
        (inv ? st.den : st.num).push(n);
    };

    const rank = (node) => {
        const n = unwrap(node);
        if (typeof n === 'string') return isVar(n) ? [2, n] : [1, n];
        if (Array.isArray(n)) {
            if (n[0] === 'Power' && unwrap(n[1]) === mainVar) return [2, mainVar];
            if (n[0] === 'Power' && typeof unwrap(n[1]) === 'string') return [typeof unwrap(n[1]) === 'string' && isVar(unwrap(n[1])) ? 2 : 1, unwrap(n[1])];
            if (n[0] === 'Square' && typeof unwrap(n[1]) === 'string') return [isVar(unwrap(n[1])) ? 2 : 1, unwrap(n[1])];
            if (n[0] === 'Add' || n[0] === 'Subtract') return [4, ''];
        }
        return [3, ''];
    };

    const joinFactors = (items) => {
        let out = '';
        items.forEach((f, i) => {
            if (i === 0) { out = f.s; return; }
            const prev = items[i - 1];
            const sep = (prev.fnTail || /^e\^/.test(f.s) || /^\\(?:sin|cos|tan|cot|sec|csc|ln|log|arc|operatorname)/.test(f.s) && /[A-Za-z}]$/.test(prev.s) && !prev.paren) ? '\\,' : '';
            const needSpace = !sep && /\\[A-Za-z]+$/.test(prev.s) && /^[A-Za-z]/.test(f.s);
            out += (needSpace ? ' ' : sep) + f.s;
        });
        return out;
    };

    const renderFactor = (node) => {
        const r = render(node);
        if (r.p < 2) return { s: wrap(r, 2), paren: true, fnTail: false };
        return { s: r.s, paren: false, fnTail: !!r.fnTail };
    };

    const renderProductFactors = (list) => {
        const sorted = list.map((n, i) => ({ n, i, r: rank(n) })).sort((a, b) => (a.r[0] - b.r[0]) || (a.r[0] <= 2 && a.r[1] !== b.r[1] ? (a.r[1] < b.r[1] ? -1 : 1) : 0) || (a.i - b.i));
        return sorted.map(x => renderFactor(x.n));
    };

    function renderProduct(node) {
        const st = { num: [], den: [], coefNum: 1, coefDen: 1 };
        collectProduct(node, false, st);
        let neg = st.coefNum * st.coefDen < 0;
        let cn = Math.abs(st.coefNum), cd = Math.abs(st.coefDen);
        if (cd !== 1 || !isInt(cn)) { const f = toFrac(cn / cd); if (f) { cn = f.num; cd = f.den; } else { cn = cn / cd; cd = 1; } }
        else { const g = gcdInt(cn, cd); cn /= g; cd /= g; }
        if (cn === 0) return R('0', 4);

        const numF = renderProductFactors(st.num);
        const denF = renderProductFactors(st.den);
        const hasDen = denF.length > 0 || cd !== 1;
        let numStr, numPrec = 4;
        if (!hasDen) {
            const parts = [];
            if (cn !== 1 || numF.length === 0) parts.push({ s: fmt(cn), paren: false });
            parts.push(...numF);
            numStr = joinFactors(parts);
            numPrec = parts.length > 1 ? 2 : (numF.length === 1 && !numF[0].paren ? 3 : (numF.length === 1 ? 2 : 4));
            const lastIsFn = parts[parts.length - 1].fnTail;
            const s = (neg ? '-' : '') + numStr;
            return R(s, neg ? 0 : (parts.length > 1 ? 2 : (numF.length === 1 ? (st.num[0] && render(st.num[0]).p) : 4)), { fnTail: lastIsFn });
        }
        const nParts = [];
        if (cn !== 1 || numF.length === 0) nParts.push({ s: fmt(cn), paren: false });
        nParts.push(...numF);
        const dParts = [];
        if (cd !== 1 || denF.length === 0) dParts.push({ s: fmt(cd), paren: false });
        dParts.push(...denF);
        const strip = (items) => items.map(f => (f.paren ? { ...f, s: f.s.replace(/^\\left\(|^\(/, '').replace(/\\right\)$|\)$/, '') } : f));
        const nS = nParts.length === 1 && nParts[0].paren ? strip(nParts)[0].s : joinFactors(nParts);
        const dS = dParts.length === 1 && dParts[0].paren ? strip(dParts)[0].s : joinFactors(dParts);
        return R(`${neg ? '-' : ''}\\frac{${nS}}{${dS}}`, neg ? 0 : 4);
    }

    function renderAdd(node) {
        const terms = [];
        flattenAdd(node, 1, terms);
        const sorted = terms.map((t, i) => ({ ...t, i, d: degOf(t.node) })).sort((a, b) => (b.d - a.d) || (a.i - b.i));
        let s = '';
        sorted.forEach((t, i) => {
            const body = render(t.node);
            const txt = body.p < 1 ? wrap(body, 1) : body.s;
            if (i === 0) s = (t.neg ? '-' : '') + txt;
            else s += (t.neg ? ' - ' : ' + ') + txt;
        });
        return R(s, sorted.length === 1 && !sorted[0].neg ? render(sorted[0].node).p : 0);
    }

    function argOf(u, fnLatex) {
        const r = render(u);
        const simple = typeof unwrap(u) === 'string' || (typeof unwrap(u) === 'number' && unwrap(u) >= 0 && isInt(unwrap(u)));
        if (simple) return R(`${fnLatex} ${r.s}`, 3, { fnTail: true });
        if (r.p === 4 && /^\\left\|/.test(r.s)) return R(`${fnLatex}${r.s}`, 3, { fnTail: true });
        return R(`${fnLatex}${/\\frac|\\int|\\sqrt|\\left/.test(r.s) ? `\\left(${r.s}\\right)` : `(${r.s})`}`, 3);
    }

    function renderPower(base, ex) {
        const e = numOf(ex);
        const bn = unwrap(base);
        if (e === 1) return render(bn);
        if (e === 0.5) return R(`\\sqrt{${render(bn).s}}`, 4);
        if (e !== null && e < 0) return renderProduct(['Power', bn, e]);
        if (e !== null && isInt(e) && Array.isArray(bn) && FN_NAMES[bn[0]] && bn.length === 2 && ['Sin', 'Cos', 'Tan', 'Cot', 'Sec', 'Csc', 'Sinh', 'Cosh', 'Tanh'].includes(bn[0])) {
            const a = argOf(bn[1], `${FN_NAMES[bn[0]]}^{${e}}`);
            return a;
        }
        if (e !== null && !isInt(e)) {
            const f = toFrac(e);
            if (f && f.num === 1 && f.den > 2 && f.den <= 9) return R(`\\sqrt[${f.den}]{${render(bn).s}}`, 4);
        }
        const rb = render(bn);
        const baseStr = (rb.p >= 4 && !/\\frac/.test(rb.s) && !(typeof bn === 'number' && bn < 0)) ? rb.s : wrap({ s: rb.s, p: -1 }, 0);
        const needParen = !(rb.p >= 4 && !/\\frac/.test(rb.s)) || (typeof bn === 'number' && bn < 0) || (Array.isArray(bn) && (bn[0] === 'Exp'));
        const b = needParen ? ( /\\frac|\\int|\\sqrt|\\left/.test(rb.s) ? `\\left(${rb.s}\\right)` : `(${rb.s})`) : rb.s;
        return R(`${b}^{${render(ex).s}}`, 3);
    }

    function render(node) {
        const n = unwrap(node);
        if (typeof n === 'number') {
            if (!isFinite(n)) return R(isNaN(n) ? '\\text{无定义}' : (n > 0 ? '\\infty' : '-\\infty'), 4);
            if (n < 0) return R(`-${fmt(-n)}`, 0);
            return R(fmt(n), 4);
        }
        if (typeof n === 'string') return R(symbolLatex(n), n === 'NegativeInfinity' ? 0 : 4);
        if (!Array.isArray(n)) throw new Error('unsupported node');
        const [op, ...a] = n;
        switch (op) {
            case 'Add': case 'Subtract': return renderAdd(n);
            case 'Negate': { const sp = splitSign(n); const inner = render(sp.node); return sp.neg ? R(`-${inner.p < 1 ? wrap(inner, 1) : inner.s}`, 0) : inner; }
            case 'Multiply': case 'Divide': return renderProduct(n);
            case 'Rational': { const v = numOf(n); if (v === null) return renderProduct(['Divide', a[0], a[1]]); const f = toFrac(v); return f && f.den !== 1 ? R(`${f.num < 0 ? '-' : ''}\\frac{${Math.abs(f.num)}}{${f.den}}`, f.num < 0 ? 0 : 4) : R(fmt(v), v < 0 ? 0 : 4); }
            case 'Power': return renderPower(a[0], a[1]);
            case 'Square': return renderPower(a[0], 2);
            case 'Sqrt': return R(`\\sqrt{${render(a[0]).s}}`, 4);
            case 'Root': { const k = numOf(a[1]); return k === 2 ? R(`\\sqrt{${render(a[0]).s}}`, 4) : R(`\\sqrt[${render(a[1]).s}]{${render(a[0]).s}}`, 4); }
            case 'Exp': return R(`e^{${render(a[0]).s}}`, 3);
            case 'Abs': return R(`\\left|${render(a[0]).s}\\right|`, 4);
            case 'Log': return a.length === 1 ? argOf(a[0], '\\log') : argOf(a[0], `\\log_{${render(a[1]).s}}`);
            case 'Integrate': return R(`\\int ${render(a[0]).s} \\, d${a[1] ? render(a[1]).s : 'x'}`, 0);
            case 'Delimiter': return render(a[0]);
            default:
                if (FN_NAMES[op] && a.length === 1) return argOf(a[0], FN_NAMES[op]);
                throw new Error('unsupported:' + op);
        }
    }
    return render(ast).s;
}

/**
 * 包装 Compute Engine：让所有 box(...).toLatex() 走统一打印器（失败时回退到 CE 自带输出）
 */
export function wrapCE(ce) {
    const targets = new WeakMap();
    const unwrapArg = (a) => (a && typeof a === 'object' && targets.has(a) ? targets.get(a) : a);
    const isBox = (r) => r && typeof r === 'object' && typeof r.toLatex === 'function' && 'json' in r;
    const wrapBox = (b) => {
        const proxy = new Proxy(b, {
            get(t, k) {
                if (k === 'toLatex') return (...args) => { try { return astToLatex(t.json); } catch (e) { return t.toLatex(...args); } };
                const v = Reflect.get(t, k, t);
                if (typeof v === 'function') return (...args) => { const r = v.apply(t, args.map(unwrapArg)); return isBox(r) ? wrapBox(r) : r; };
                return v;
            }
        });
        targets.set(proxy, b);
        return proxy;
    };
    return new Proxy(ce, {
        get(t, k) {
            const v = Reflect.get(t, k, t);
            if ((k === 'box' || k === 'parse') && typeof v === 'function') return (...args) => { const r = v.apply(t, args.map(unwrapArg)); return isBox(r) ? wrapBox(r) : r; };
            return typeof v === 'function' ? v.bind(t) : v;
        }
    });
}
