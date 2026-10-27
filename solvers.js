// solvers.js —— 现代全功能微积分、代数与微分方程分步推导引擎
import * as MC from './mathcore.js';

/**
 * 求解线性代数方程组 (高斯主元消去法)
 */
export function solveLinearSystem(matrix, vector) {
    if (!matrix || !vector || matrix.length === 0) return null;
    const N = vector.length;
    let m = matrix.map((row, i) => [...row, vector[i]]);

    for (let i = 0; i < N; i++) {
        let maxRow = i;
        for (let k = i + 1; k < N; k++) {
            if (Math.abs(m[k][i]) > Math.abs(m[maxRow][i])) maxRow = k;
        }
        const temp = m[i];
        m[i] = m[maxRow];
        m[maxRow] = temp;

        if (Math.abs(m[i][i]) < 1e-11) return null;

        for (let k = i + 1; k < N; k++) {
            const factor = m[k][i] / m[i][i];
            for (let j = i; j <= N; j++) m[k][j] -= factor * m[i][j];
        }
    }

    const ans = new Array(N).fill(0);
    for (let i = N - 1; i >= 0; i--) {
        let sum = 0;
        for (let j = i + 1; j < N; j++) sum += m[i][j] * ans[j];
        ans[i] = (m[i][N] - sum) / m[i][i];
    }
    return ans.map(val => Math.abs(Math.round(val) - val) < 1e-9 ? Math.round(val) : val);
}

export function gcd(a, b) {
    a = Math.abs(Math.round(a));
    b = Math.abs(Math.round(b));
    while (b) { const t = b; b = a % b; a = t; }
    return a || 1;
}

/**
 * 连分数浮点数转精确有理分式表示
 */
export function toRational(val, tolerance = 1e-6) {
    if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
        return { num: 0, den: 1, latex: '0', ast: 0, isInt: true };
    }
    if (Number.isInteger(val) || Math.abs(Math.round(val) - val) < 1e-9) {
        const rounded = Math.round(val);
        return { num: rounded, den: 1, latex: `${rounded}`, ast: rounded, isInt: true };
    }

    let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
    let b = Math.abs(val);
    let iterations = 0;

    do {
        let a = Math.floor(b);
        let aux = h1; h1 = a * h1 + h2; h2 = aux;
        aux = k1; k1 = a * k1 + k2; k2 = aux;
        const diff = b - a;
        if (Math.abs(diff) < 1e-12) break;
        b = 1 / diff;
        iterations++;
    } while (Math.abs(Math.abs(val) - h1 / k1) > tolerance && k1 < 100000 && iterations < 20);

    let num = Math.sign(val) * h1, den = k1;
    const g = gcd(num, den);
    num /= g; den /= g;

    if (den === 1) return { num, den: 1, latex: `${num}`, ast: num, isInt: true };
    const signStr = num < 0 ? '-' : '';
    return {
        num, den,
        latex: `${signStr}\\frac{${Math.abs(num)}}{${den}}`,
        ast: ['Rational', num, den],
        isInt: false
    };
}

/**
 * 清理并美化 LaTeX 符号串
 */
export function cleanMathLatex(latexStr) {
    if (typeof latexStr !== 'string') return String(latexStr || '');
    let str = latexStr;

    // 格式化三角函数高次幂形式 \sin(x)^2 -> \sin^2(x)
    const funcs = 'sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|coth|arcsin|arccos|arctan';
    const wrappedPattern = new RegExp(`\\\\left\\(\\s*\\\\(${funcs})\\s*(\\\\left\\([\\s\\S]*?\\\\right\\)|\\([^()]*\\)|\\{[^{}]*\\})\\s*\\\\right\\)\\s*\\^\\s*(\\{[^{}]+\\}|[0-9a-zA-Z]+)`, 'g');
    str = str.replace(wrappedPattern, (m, fn, arg, exp) => `\\${fn}^${exp.startsWith('{') ? exp : `{${exp}}`}${arg}`);

    const directPattern = new RegExp(`\\\\(${funcs})\\s*(\\\\left\\([\\s\\S]*?\\\\right\\)|\\([^()]*\\)|\\{[^{}]*\\})\\s*\\^\\s*(\\{[^{}]+\\}|[0-9a-zA-Z]+)`, 'g');
    str = str.replace(directPattern, (m, fn, arg, exp) => `\\${fn}^${exp.startsWith('{') ? exp : `{${exp}}`}${arg}`);

    // 清理多余符号和正负号重叠
    str = str.replace(/\+\s*-/g, '- ')
             .replace(/-\s*-/g, '+ ')
             .replace(/\\left\(\s*\\right\)/g, '')
             .replace(/(?<![0-9.])1(?=\\ln)/g, '')
             .replace(/(?<![0-9.])1(?=\\pi)/g, '');

    return tidyLatex(str);
}

/**
 * 统一整理 LaTeX 书写习惯：去掉 x^{1}、1·x、+0，负号提到分式前，规整空白
 */
export function tidyLatex(str) {
    let t = str;
    for (let i = 0; i < 2; i++) {
        t = t
            .replace(/\^\{1\}(?![0-9.])/g, '')
            .replace(/(?<![0-9.\w\\{^_])1\s*(?:\\cdot\s*)?(?=(?:[a-zA-Z]\b|\\(?:sin|cos|tan|cot|sec|csc|ln|log|pi|exp|sqrt|frac|arctan|arcsin|arccos|mathrm)))/g, '')
            .replace(/\\frac\{-([^{}]+)\}\{([^{}]+)\}/g, '-\\frac{$1}{$2}')
            .replace(/\s*\+\s*0(?![0-9.\w])/g, '')
            .replace(/^0\s*\+\s*/, '')
            .replace(/\+\s*-/g, '- ')
            .replace(/-\s*-/g, '+ ')
            .replace(/\(\s*\)/g, '');
    }
    return t.replace(/[ \t]{2,}/g, ' ').trim();
}

/** 结果若含 π、根式、对数、分数等精确形式，附上近似小数，便于对照 */
export function withApprox(latex, value) {
    if (typeof value !== 'number' || !isFinite(value) || /\\approx|\\text|\\infty/.test(latex)) return latex;
    if (Math.abs(value - Math.round(value)) < 1e-9) return latex;
    if (!/\\(?:pi|sqrt|ln|frac)|(?:^|[^a-zA-Z\\])e(?:[^a-zA-Z]|$)/.test(latex)) return latex;
    return `${latex} \\approx ${Number(value.toPrecision(6))}`;
}

/**
 * 标题美化：去掉“步骤 N:”前缀（界面自带编号），并把标题中的 LaTeX 片段用 $...$ 包裹，供页面用 KaTeX 渲染
 */
export function prettifyTitle(title) {
    let t = String(title || '').replace(/^\s*步骤\s*\d+\s*[:：]\s*/, '').replace(/^[⚠️✅❗\s]+/u, '').replace(/[：:。.；;\s]+$/u, '').replace(/\s{2,}/g, ' ');
    if (t.includes('$')) return t;
    return t.replace(/(?:\\[a-zA-Z]+|[A-Za-z0-9]\^\{|[A-Za-z]_\{)[\x20-\x7E]*/g, (m) => {
        const trimmed = m.replace(/\s+$/, '');
        const tail = m.slice(trimmed.length);
        return `$${trimmed}$${tail}`;
    });
}

const KIND_LABELS = { given: '题目', method: '方法', compute: '计算', check: '检验', warn: '注意', conclusion: '结论' };

function inferKind(title, index) {
    if (index === 0) return 'given';
    if (/⚠|警告|未能|发散|不一致|不存在|无法|不支持|失败|无解|不收敛/.test(title)) return 'warn';
    if (/验证|检验|校验|交叉|排除增根/.test(title)) return 'check';
    if (/应用|套用|利用|采用|使用|查基本|查表|令 |选取|换元|分部|洛必达|公式|法则|定理|方法|识别|设定|尝试|化为|转化|改用/.test(title)) return 'method';
    return 'compute';
}

const GENERIC_FINAL = /^(得到.*(解|结果)|最终.*结果|追加任意积分常数.*|得到.*通解|.*的通解|满足初始条件的特解)$/;

/**
 * 统一输出：规整标题与 LaTeX、去掉空步骤与相邻重复步骤、给每步标注类型，
 * 并保证最后一步是与“结果”一致的结论。
 */
export function formatOutput({ resultLatex, steps, plotData, type }) {
    const result = cleanMathLatex(resultLatex || '');
    const norm = (x) => String(x).replace(/\s+/g, '');

    let list = (steps || [])
        .map(st => ({ title: prettifyTitle(st.title || ''), latex: cleanMathLatex(st.latex || ''), kind: st.kind }))
        .filter(st => st.latex || st.title);
    list = list.filter((st, i) => i === 0 || !(norm(st.latex) === norm(list[i - 1].latex) && st.title === list[i - 1].title));

    list.forEach((st, i) => { st.kind = st.kind || inferKind(st.title, i); });

    if (result && list.length) {
        const last = list[list.length - 1];
        const covered = norm(last.latex) === norm(result) || norm(last.latex).includes(norm(result));
        if (covered && last.kind !== 'warn') {
            last.kind = 'conclusion';
            if (GENERIC_FINAL.test(last.title) || !last.title) last.title = '结论';
        } else if (!covered) {
            list.push({ title: '结论', latex: result, kind: last.kind === 'warn' ? 'warn' : 'conclusion' });
        }
    }
    list.forEach(st => { if (!st.title) st.title = KIND_LABELS[st.kind] || ''; });

    return { resultLatex: result, steps: list, plotData: plotData || null, type: type || null };
}

/**
 * 递归解构 MathJSON AST (兼容对象形式与嵌套 Block/Hold/Function)
 */
export function unwrapAST(node) {
    if (!node) return { expr: 0, inferredVar: null };

    // 处理 CortexJS MathJSON 对象形式 { sym: 'x' } / { fn: [...] } / { num: 1 }
    if (typeof node === 'object' && !Array.isArray(node)) {
        if (node.sym) return { expr: node.sym, inferredVar: typeof node.sym === 'string' ? node.sym : null };
        if (node.num !== undefined) return { expr: node.num, inferredVar: null };
        if (node.fn) return unwrapAST(node.fn);
        if (node.json) return unwrapAST(node.json);
    }

    if (!Array.isArray(node)) return { expr: node, inferredVar: null };

    let curr = node;
    let inferredVar = null;

    if (curr[0] === 'Function') {
        if (typeof curr[2] === 'string') inferredVar = curr[2];
        curr = curr[1];
    }

    while (Array.isArray(curr) && (curr[0] === 'Block' || curr[0] === 'Hold' || curr[0] === 'Sequence')) {
        curr = curr[1];
    }

    if (Array.isArray(curr) && curr[0] === 'Function') {
        if (typeof curr[2] === 'string' && !inferredVar) inferredVar = curr[2];
        curr = curr[1];
        while (Array.isArray(curr) && (curr[0] === 'Block' || curr[0] === 'Hold')) curr = curr[1];
    }

    return { expr: curr, inferredVar };
}

export function isConstant(ast, variable) {
    if (typeof ast === 'number') return true;
    if (typeof ast === 'string') return ast !== variable;
    if (typeof ast === 'object' && !Array.isArray(ast)) {
        if (ast.sym) return ast.sym !== variable;
        if (ast.num !== undefined) return true;
        if (ast.fn) return isConstant(ast.fn, variable);
    }
    if (Array.isArray(ast)) return ast.slice(1).every(arg => isConstant(arg, variable));
    return true;
}

export function getFactorWeight(node) {
    const { expr } = unwrapAST(node);
    if (typeof expr === 'number') return 1;
    if (typeof expr === 'string') return ['Pi', 'ExponentialE', 'e'].includes(expr) ? 1.5 : 2;
    if (Array.isArray(expr)) {
        const op = expr[0];
        if (['Negate', 'Rational'].includes(op)) return 1;
        if (op === 'Power') return (expr[1] === 'ExponentialE' || expr[1] === 'e') ? 4 : 2.5;
        if (op === 'Add' || op === 'Subtract') return 3;
        if (['Sin', 'Cos', 'Tan', 'Cot', 'Sec', 'Csc', 'Arcsin', 'Arccos', 'Arctan', 'Ln', 'Log', 'Exp'].includes(op)) return 4;
    }
    return 3.5;
}

export function makeMultiply(factors, ce) {
    const flatList = [];
    const collect = (item) => {
        const { expr } = unwrapAST(item);
        if (Array.isArray(expr) && expr[0] === 'Multiply') {
            expr.slice(1).forEach(collect);
        } else if (expr !== 1 && expr !== '1') {
            flatList.push(expr);
        }
    };
    Array.isArray(factors) ? factors.forEach(collect) : collect(factors);

    if (flatList.length === 0) return ce.box(1);
    if (flatList.length === 1) return ce.box(flatList[0]);

    // 合并纯数值常数因子
    let numericProduct = 1;
    const nonNumeric = [];
    for (let f of flatList) {
        if (typeof f === 'number') {
            numericProduct *= f;
        } else {
            nonNumeric.push(f);
        }
    }

    if (numericProduct === 0) return ce.box(0);
    const finalFactors = [];
    if (numericProduct !== 1) finalFactors.push(numericProduct);
    finalFactors.push(...nonNumeric);

    if (finalFactors.length === 0) return ce.box(1);
    if (finalFactors.length === 1) return ce.box(finalFactors[0]);

    finalFactors.sort((a, b) => getFactorWeight(a) - getFactorWeight(b));
    return ce.box(['Multiply', ...finalFactors]);
}

export function polyMul(p1, p2) {
    const res = new Array(p1.length + p2.length - 1).fill(0);
    for (let i = 0; i < p1.length; i++) {
        for (let j = 0; j < p2.length; j++) res[i + j] += p1[i] * p2[j];
    }
    return res;
}

export function polyPow(p, exp) {
    let res = [1];
    for (let i = 0; i < exp; i++) res = polyMul(res, p);
    return res;
}

/**
 * 提取定义域约束（分母非零、根号非负、对数真数大于零）
 */
export function extractDomainConstraints(node, variable, ce, constraints = []) {
    const { expr } = unwrapAST(node);
    if (!Array.isArray(expr)) return constraints;

    const [op, ...args] = expr;

    if (op === 'Sqrt') {
        constraints.push({ type: '>=0', desc: "根号下非负", expr: args[0], latex: `${ce.box(args[0]).toLatex()} \\ge 0` });
    } else if (op === 'Power') {
        const [base, exp] = args;
        try {
            const expVal = ce.box(exp).evaluate();
            if (expVal.json && Array.isArray(expVal.json) && expVal.json[0] === 'Rational') {
                const den = expVal.json[2];
                if (den % 2 === 0) {
                    constraints.push({ type: '>=0', desc: "偶次根式非负", expr: base, latex: `${ce.box(base).toLatex()} \\ge 0` });
                }
            }
        } catch (e) { }
    }

    if (op === 'Divide' && args.length === 2) {
        constraints.push({ type: '!=0', desc: "分母非零", expr: args[1], latex: `${ce.box(args[1]).toLatex()} \\ne 0` });
    }

    if (op === 'Ln' || op === 'Log') {
        constraints.push({ type: '>0', desc: "对数真数大于零", expr: args[0], latex: `${ce.box(args[0]).toLatex()} > 0` });
    }

    if (op === 'Tan') {
        constraints.push({ type: 'cos!=0', desc: "正切函数定义域限制", expr: ['Cos', args[0]], latex: `\\cos(${ce.box(args[0]).toLatex()}) \\ne 0` });
    }

    for (let arg of args) extractDomainConstraints(arg, variable, ce, constraints);
    return constraints;
}

export function checkValueDomain(constraints, val, variable, ce) {
    for (let c of constraints) {
        try {
            const v = ce.box(c.expr).subs({ [variable]: val }).evaluate().valueOf();
            if (typeof v !== 'number' || isNaN(v)) return { valid: false, reason: c.desc, latex: c.latex };
            if (c.type === '!=0' && Math.abs(v) < 1e-9) return { valid: false, reason: "分母为 0", latex: c.latex };
            if (c.type === 'cos!=0' && Math.abs(v) < 1e-9) return { valid: false, reason: "正切函数无定义", latex: c.latex };
            if (c.type === '>=0' && v < -1e-9) return { valid: false, reason: "被开方数为负", latex: c.latex };
            if (c.type === '>0' && v <= 1e-9) return { valid: false, reason: "对数真数非正", latex: c.latex };
        } catch (e) {
            return { valid: false, reason: "超出定义域", latex: c.latex };
        }
    }
    return { valid: true };
}

/**
 * 编译高性能快速数学函数 (原生 JS 函数，避免渲染循环中 subs/evaluate 导致卡顿)
 */
export function buildMathFunction(ast, variable, ce) {
    if (ast === undefined || ast === null) return () => NaN;
    try { return MC.compileAST(ast, variable); } catch (e) { /* 含未知算子：回退到 Compute Engine */ }

    function compileNode(node) {
        const { expr } = unwrapAST(node);
        if (typeof expr === 'number') return () => expr;
        if (typeof expr === 'string') {
            if (expr === variable) return (x) => x;
            if (expr === 'Pi') return () => Math.PI;
            if (expr === 'ExponentialE' || expr === 'e') return () => Math.E;
            return () => NaN;
        }
        if (!Array.isArray(expr)) return () => NaN;

        const [op, ...args] = expr;
        const compiledArgs = args.map(compileNode);

        switch (op) {
            case 'Add':
                return (x) => compiledArgs.reduce((acc, fn) => acc + fn(x), 0);
            case 'Subtract':
                return (x) => compiledArgs[0](x) - compiledArgs[1](x);
            case 'Negate':
                return (x) => -compiledArgs[0](x);
            case 'Multiply':
                return (x) => compiledArgs.reduce((acc, fn) => acc * fn(x), 1);
            case 'Divide':
                return (x) => {
                    const den = compiledArgs[1](x);
                    return Math.abs(den) < 1e-12 ? NaN : compiledArgs[0](x) / den;
                };
            case 'Power':
                return (x) => Math.pow(compiledArgs[0](x), compiledArgs[1](x));
            case 'Sqrt':
                return (x) => {
                    const v = compiledArgs[0](x);
                    return v < 0 ? NaN : Math.sqrt(v);
                };
            case 'Sin': return (x) => Math.sin(compiledArgs[0](x));
            case 'Cos': return (x) => Math.cos(compiledArgs[0](x));
            case 'Tan': return (x) => Math.tan(compiledArgs[0](x));
            case 'Cot': return (x) => 1 / Math.tan(compiledArgs[0](x));
            case 'Sec': return (x) => 1 / Math.cos(compiledArgs[0](x));
            case 'Csc': return (x) => 1 / Math.sin(compiledArgs[0](x));
            case 'Arcsin': return (x) => Math.asin(compiledArgs[0](x));
            case 'Arccos': return (x) => Math.acos(compiledArgs[0](x));
            case 'Arctan': return (x) => Math.atan(compiledArgs[0](x));
            case 'Exp': return (x) => Math.exp(compiledArgs[0](x));
            case 'Ln': return (x) => {
                const v = compiledArgs[0](x);
                return v <= 0 ? NaN : Math.log(v);
            };
            case 'Log': return (x) => {
                const v = compiledArgs[0](x);
                return v <= 0 ? NaN : Math.log10(v);
            };
            case 'Abs': return (x) => Math.abs(compiledArgs[0](x));
            default:
                const boxed = ce.box(node);
                return (x) => {
                    try {
                        const val = boxed.subs({ [variable]: x }).evaluate().valueOf();
                        return typeof val === 'number' && !isNaN(val) ? val : NaN;
                    } catch (e) { return NaN; }
                };
        }
    }

    try {
        return compileNode(ast);
    } catch (e) {
        const boxed = ce.box(ast);
        return (x) => {
            try {
                const val = boxed.subs({ [variable]: x }).evaluate().valueOf();
                return typeof val === 'number' && !isNaN(val) ? val : NaN;
            } catch (err) { return NaN; }
        };
    }
}

export function hasTrigFunctions(node, variable) {
    const { expr } = unwrapAST(node);
    if (!Array.isArray(expr)) return false;
    const [op, ...args] = expr;
    if (['Sin', 'Cos', 'Tan', 'Cot', 'Sec', 'Csc'].includes(op) && !isConstant(args[0], variable)) {
        return true;
    }
    return args.some(arg => hasTrigFunctions(arg, variable));
}

export function substituteVariable(node, varName, replacementAst) {
    const { expr } = unwrapAST(node);
    if (expr === varName) return replacementAst;
    if (!Array.isArray(expr)) return expr;

    const [op, ...args] = expr;
    return [op, ...args.map(arg => substituteVariable(arg, varName, replacementAst))];
}

// ==========================================
// 1. 完备符号求导引擎
// ==========================================

export function differentiateNode(node, variable, ce, steps) {
    const { expr: unwrappedNode } = unwrapAST(node);

    if (isConstant(unwrappedNode, variable)) return ce.box(0);
    if (unwrappedNode === variable) return ce.box(1);
    if (!Array.isArray(unwrappedNode)) {
        return ce.box(['Derivative', unwrappedNode, variable]).evaluate();
    }

    const [op, ...args] = unwrappedNode;

    if (op === 'Add') {
        const derivs = args.map(a => differentiateNode(a, variable, ce, steps).json);
        return ce.box(['Add', ...derivs]).simplify();
    }

    if (op === 'Subtract' && args.length === 2) {
        const du = differentiateNode(args[0], variable, ce, steps), dv = differentiateNode(args[1], variable, ce, steps);
        return ce.box(['Subtract', du.json, dv.json]).simplify();
    }

    if (op === 'Negate' && args.length === 1) {
        return ce.box(['Negate', differentiateNode(args[0], variable, ce, steps).json]).simplify();
    }

    if (op === 'Multiply') {
        const constants = args.filter(a => isConstant(a, variable));
        const variables = args.filter(a => !isConstant(a, variable));

        if (constants.length > 0 && variables.length > 0) {
            const cBox = makeMultiply(constants, ce);
            const vBox = variables.length === 1 ? variables[0] : ['Multiply', ...variables];
            const dVar = differentiateNode(vBox, variable, ce, steps);
            return makeMultiply([cBox.json, dVar.json], ce).simplify();
        }

        if (args.length === 2) {
            const [u, v] = args;
            const du = differentiateNode(u, variable, ce, steps), dv = differentiateNode(v, variable, ce, steps);
            return ce.box(['Add', makeMultiply([du.json, v], ce).json, makeMultiply([u, dv.json], ce).json]).simplify();
        }

        const termBoxes = [];
        for (let i = 0; i < args.length; i++) {
            const d_i = differentiateNode(args[i], variable, ce, steps);
            const rest = args.filter((_, idx) => idx !== i);
            termBoxes.push(makeMultiply([d_i.json, ...rest], ce).json);
        }
        return ce.box(['Add', ...termBoxes]).simplify();
    }

    if (op === 'Divide' && args.length === 2) {
        const [u, v] = args;
        if (isConstant(u, variable)) {
            const dv = differentiateNode(v, variable, ce, steps);
            return ce.box(['Divide', makeMultiply([['Negate', u], dv.json], ce).json, ['Power', v, 2]]).simplify();
        }
        if (isConstant(v, variable)) {
            const du = differentiateNode(u, variable, ce, steps);
            return ce.box(['Divide', du.json, v]).simplify();
        }
        const du = differentiateNode(u, variable, ce, steps), dv = differentiateNode(v, variable, ce, steps);
        return ce.box(['Divide', ['Subtract', makeMultiply([du.json, v], ce).json, makeMultiply([u, dv.json], ce).json], ['Power', v, 2]]).simplify();
    }

    if (op === 'Power' && args.length === 2) {
        const [base, exp] = args;
        const baseIsConst = isConstant(base, variable);
        const expIsConst = isConstant(exp, variable);

        if (!baseIsConst && expIsConst) {
            const dBase = differentiateNode(base, variable, ce, steps);
            const newExp = ce.box(['Subtract', exp, 1]).evaluate();
            return makeMultiply([exp, ['Power', base, newExp.json], dBase.json], ce).simplify();
        }

        if (baseIsConst && !expIsConst) {
            const dExp = differentiateNode(exp, variable, ce, steps);
            if (base === 'ExponentialE' || base === 'e') {
                return makeMultiply([node, dExp.json], ce).simplify();
            }
            return makeMultiply([node, ['Ln', base], dExp.json], ce).simplify();
        }

        if (!baseIsConst && !expIsConst) {
            const du = differentiateNode(base, variable, ce, steps);
            const dv = differentiateNode(exp, variable, ce, steps);
            const inner = ['Add', makeMultiply([dv.json, ['Ln', base]], ce).json, ['Divide', makeMultiply([exp, du.json], ce).json, base]];
            return makeMultiply([node, inner], ce).simplify();
        }
    }

    if (op === 'Sqrt' && args.length === 1) {
        const inner = args[0];
        const du = differentiateNode(inner, variable, ce, steps);
        return ce.box(['Divide', du.json, ['Multiply', 2, ['Sqrt', inner]]]).simplify();
    }

    // 补充规则：Square / Root / 任意底对数 / 反双曲 / Sech / Csch / Arccot
    if (op === 'Square' && args.length === 1) {
        return differentiateNode(['Power', args[0], 2], variable, ce, steps);
    }
    if (op === 'Root' && args.length === 2) {
        return differentiateNode(['Power', args[0], ['Divide', 1, args[1]]], variable, ce, steps);
    }
    if (op === 'Log' && args.length === 2) {
        return differentiateNode(['Divide', ['Ln', args[0]], ['Ln', args[1]]], variable, ce, steps);
    }
    if (op === 'Lb' && args.length === 1) {
        return differentiateNode(['Divide', ['Ln', args[0]], ['Ln', 2]], variable, ce, steps);
    }
    const moreRules = {
        'Arsinh': (u, du) => ce.box(['Divide', du.json, ['Sqrt', ['Add', ['Power', u, 2], 1]]]),
        'Arcosh': (u, du) => ce.box(['Divide', du.json, ['Sqrt', ['Subtract', ['Power', u, 2], 1]]]),
        'Artanh': (u, du) => ce.box(['Divide', du.json, ['Subtract', 1, ['Power', u, 2]]]),
        'Arccot': (u, du) => ce.box(['Negate', ['Divide', du.json, ['Add', 1, ['Power', u, 2]]]]),
        'Sech': (u, du) => makeMultiply([['Negate', du.json], ['Sech', u], ['Tanh', u]], ce),
        'Csch': (u, du) => makeMultiply([['Negate', du.json], ['Csch', u], ['Coth', u]], ce),
        'Coth': (u, du) => ce.box(['Negate', ['Divide', du.json, ['Power', ['Sinh', u], 2]]])
    };
    if (moreRules[op] && args.length === 1) {
        const du = differentiateNode(args[0], variable, ce, steps);
        return moreRules[op](args[0], du).simplify();
    }

    const trigRules = {
        'Sin': (u, du) => makeMultiply([du.json, ['Cos', u]], ce),
        'Cos': (u, du) => makeMultiply([['Negate', du.json], ['Sin', u]], ce),
        'Tan': (u, du) => ce.box(['Divide', du.json, ['Power', ['Cos', u], 2]]),
        'Cot': (u, du) => ce.box(['Negate', ['Divide', du.json, ['Power', ['Sin', u], 2]]]),
        'Sec': (u, du) => makeMultiply([du.json, ['Sec', u], ['Tan', u]], ce),
        'Csc': (u, du) => makeMultiply([['Negate', du.json], ['Csc', u], ['Cot', u]], ce),
        'Arcsin': (u, du) => ce.box(['Divide', du.json, ['Sqrt', ['Subtract', 1, ['Power', u, 2]]]]),
        'Arccos': (u, du) => ce.box(['Divide', ['Negate', du.json], ['Sqrt', ['Subtract', 1, ['Power', u, 2]]]]),
        'Arctan': (u, du) => ce.box(['Divide', du.json, ['Add', 1, ['Power', u, 2]]]),
        'Ln': (u, du) => ce.box(['Divide', du.json, u]),
        'Log': (u, du) => ce.box(['Divide', du.json, makeMultiply([u, ['Ln', 10]], ce).json]),
        'Exp': (u, du) => makeMultiply([du.json, ['Exp', u]], ce),
        'Sinh': (u, du) => makeMultiply([du.json, ['Cosh', u]], ce),
        'Cosh': (u, du) => makeMultiply([du.json, ['Sinh', u]], ce),
        'Tanh': (u, du) => ce.box(['Divide', du.json, ['Power', ['Cosh', u], 2]]),
        'Abs': (u, du) => makeMultiply([du.json, ['Divide', u, ['Abs', u]]], ce)
    };

    if (trigRules[op]) {
        const inner = args[0];
        const du = differentiateNode(inner, variable, ce, steps);
        return trigRules[op](inner, du).simplify();
    }

    return ce.box(['Derivative', unwrappedNode, variable]).evaluate();
}

/**
 * 导数求解器导出主入口
 */
export function solveDerivative({ targetExpr, variable, order, conditionExpr }, ce) {
    const { expr: cleanExpr, inferredVar } = unwrapAST(targetExpr);
    const varName = variable || inferredVar || 'x';
    const numOrder = typeof order === 'number' ? Math.max(1, Math.min(order, 5)) : 1;
    const steps = [];

    steps.push({
        title: `步骤 1: 确定求导目标函数`,
        latex: `f(${varName}) = ${cleanMathLatex(ce.box(cleanExpr).toLatex())}`
    });

    let currentExpr = cleanExpr;
    for (let k = 1; k <= numOrder; k++) {
        const deriv = differentiateNode(currentExpr, varName, ce, steps).simplify();
        const primeStr = "'".repeat(k);
        steps.push({
            title: numOrder === 1 ? "应用求导法则与链式法则求导" : `计算 ${k} 阶导数 f^{(${k})}(${varName})`,
            latex: `f${primeStr}(${varName}) = ${cleanMathLatex(deriv.toLatex())}`
        });
        currentExpr = deriv.json;
    }

    const finalSimplified = ce.box(currentExpr).simplify();
    const condSuffix = conditionExpr ? ` \\quad (${ce.box(unwrapAST(conditionExpr).expr).toLatex()})` : '';

    const fn = buildMathFunction(cleanExpr, varName, ce);
    const dfn = buildMathFunction(finalSimplified.json, varName, ce);

    const plotData = {
        layers: [
            { id: 'f', label: `f(${varName}) = ${cleanMathLatex(ce.box(cleanExpr).toLatex())}`, name: `原函数 f(${varName})`, latex: `f(${varName}) = ${cleanMathLatex(ce.box(cleanExpr).toLatex())}`, color: '#38bdf8', visible: true, fn },
            { id: 'df', label: `f'(${varName}) = ${cleanMathLatex(finalSimplified.toLatex())}`, name: `导函数 f'(${varName})`, latex: `f'(${varName}) = ${cleanMathLatex(finalSimplified.toLatex())}`, color: '#f97316', dash: [5, 4], visible: true, fn: dfn }
        ],
        points: []
    };

    return formatOutput({
        resultLatex: `${cleanMathLatex(finalSimplified.toLatex())}${condSuffix}`,
        steps,
        plotData
    });
}

// ==========================================
// 2. 完备不定积分与定积分引擎
// ==========================================

export function extractFactors(denNode, variable, ce) {
    const rawFactors = [];
    const process = (node) => {
        const { expr } = unwrapAST(node);
        if (Array.isArray(expr)) {
            if (expr[0] === 'Multiply') {
                for (let i = 1; i < expr.length; i++) process(expr[i]);
            } else if (expr[0] === 'Power') {
                const base = expr[1];
                let expVal = 1;
                try { expVal = ce.box(expr[2]).evaluate().valueOf(); } catch (e) { }
                rawFactors.push({ base, exp: typeof expVal === 'number' ? expVal : 1 });
            } else {
                rawFactors.push({ base: expr, exp: 1 });
            }
        } else if (expr === variable || !isConstant(expr, variable)) {
            rawFactors.push({ base: expr, exp: 1 });
        }
    };
    process(denNode);

    const factors = [];
    for (let f of rawFactors) {
        const baseBox = ce.box(f.base);
        const cVal = baseBox.subs({ [variable]: 0 }).evaluate().valueOf();
        const d1 = differentiateNode(f.base, variable, ce, null).simplify();
        const bVal = d1.subs({ [variable]: 0 }).evaluate().valueOf();
        const d2 = differentiateNode(d1.json, variable, ce, null).simplify();
        const aVal = ce.box(['Divide', d2.subs({ [variable]: 0 }).evaluate().json, 2]).evaluate().valueOf();

        const a = typeof aVal === 'number' ? aVal : 0;
        const b = typeof bVal === 'number' ? bVal : 0;
        const c = typeof cVal === 'number' ? cVal : 0;

        if (Math.abs(a) > 1e-9) {
            const delta = b * b - 4 * a * c;
            if (Math.abs(delta) < 1e-7) {
                const r = -b / (2 * a);
                const linearBase = r === 0 ? variable : (r > 0 ? ['Subtract', variable, toRational(r).ast] : ['Add', variable, toRational(-r).ast]);
                factors.push({ base: linearBase, exp: f.exp * 2 });
            } else if (delta > 1e-7) {
                const sqrtDelta = Math.sqrt(delta);
                const r1 = (-b + sqrtDelta) / (2 * a);
                const r2 = (-b - sqrtDelta) / (2 * a);
                const base1 = r1 === 0 ? variable : (r1 > 0 ? ['Subtract', variable, toRational(r1).ast] : ['Add', variable, toRational(-r1).ast]);
                const base2 = r2 === 0 ? variable : (r2 > 0 ? ['Subtract', variable, toRational(r2).ast] : ['Add', variable, toRational(-r2).ast]);
                factors.push({ base: base1, exp: f.exp });
                factors.push({ base: base2, exp: f.exp });
            } else {
                factors.push(f);
            }
        } else {
            factors.push(f);
        }
    }

    return factors;
}

export function formatTermWithCoeff(coeffVal, termLatex, isFirst = false) {
    const frac = toRational(coeffVal);
    if (Math.abs(coeffVal) < 1e-9) return '';

    const isPos = frac.num > 0;
    const sign = isPos ? (isFirst ? '' : '+ ') : '- ';
    const absNum = Math.abs(frac.num);

    let coeffPart = '';
    if (absNum === 1 && frac.den === 1) {
        coeffPart = '';
    } else if (frac.den === 1) {
        coeffPart = `${absNum} `;
    } else {
        coeffPart = `\\frac{${absNum}}{${frac.den}} `;
    }

    return `${sign}${coeffPart}${termLatex}`;
}

export function integratePartialFractions(numNode, denNode, variable, ce, steps) {
    const factors = extractFactors(denNode, variable, ce);
    const factorData = [];
    let totalDegree = 0;

    for (let f of factors) {
        const baseBox = ce.box(f.base);
        const cVal = baseBox.subs({ [variable]: 0 }).evaluate().valueOf();
        const d1 = differentiateNode(f.base, variable, ce, null).simplify();
        const bVal = d1.subs({ [variable]: 0 }).evaluate().valueOf();
        const d2 = differentiateNode(d1.json, variable, ce, null).simplify();
        const aVal = ce.box(['Divide', d2.subs({ [variable]: 0 }).evaluate().json, 2]).evaluate().valueOf();

        const a = typeof aVal === 'number' ? aVal : 0;
        const b = typeof bVal === 'number' ? bVal : 0;
        const c = typeof cVal === 'number' ? cVal : 0;

        const isQuad = Math.abs(a) > 1e-9;
        const polyArr = isQuad ? [c, b, a] : [c, b];
        totalDegree += (isQuad ? 2 : 1) * f.exp;
        factorData.push({ base: f.base, exp: f.exp, a, b, c, isQuad, polyArr });
    }

    if (totalDegree > 0 && totalDegree <= 8) {
        const N = totalDegree;
        const unknowns = [];
        const labels = ['A', 'B', 'D', 'E', 'F', 'G', 'H', 'M', 'N', 'P', 'Q', 'R', 'S', 'T'];
        let varIdx = 0;
        const pfdTermsLaTeX = [];

        for (let fd of factorData) {
            for (let k = 1; k <= fd.exp; k++) {
                const denomAst = k === 1 ? fd.base : ['Power', fd.base, k];
                const denomLatex = ce.box(denomAst).toLatex();
                if (fd.isQuad) {
                    const l1 = labels[varIdx++], l2 = labels[varIdx++];
                    unknowns.push({ label: l1, isQuad: true, type: 'linear', fd, k });
                    unknowns.push({ label: l2, isQuad: true, type: 'const', fd, k });
                    pfdTermsLaTeX.push(`\\frac{${l1}${variable} + ${l2}}{${denomLatex}}`);
                } else {
                    const l = labels[varIdx++];
                    unknowns.push({ label: l, isQuad: false, type: 'const', fd, k });
                    pfdTermsLaTeX.push(`\\frac{${l}}{${denomLatex}}`);
                }
            }
        }

        if (steps) steps.push({
            title: "依据分母因式分解结构，设定部分分式展开式",
            latex: `\\frac{${ce.box(numNode).toLatex()}}{${ce.box(denNode).toLatex()}} = ${pfdTermsLaTeX.join(' + ')}`
        });

        const rhsTermsLatex = [];
        const unknownPolys = [];

        for (let u of unknowns) {
            let remPoly = [1];
            for (let fd of factorData) {
                const curExp = (fd === u.fd) ? (fd.exp - u.k) : fd.exp;
                if (curExp > 0) {
                    remPoly = polyMul(remPoly, polyPow(fd.polyArr, curExp));
                }
            }
            if (u.type === 'linear') {
                unknownPolys.push([0, ...remPoly]);
            } else {
                unknownPolys.push(remPoly);
            }
        }

        let currentUIdx = 0;
        for (let fd of factorData) {
            for (let k = 1; k <= fd.exp; k++) {
                let remFactorsLatex = [];
                for (let otherFd of factorData) {
                    const curExp = (otherFd === fd) ? (otherFd.exp - k) : otherFd.exp;
                    if (curExp > 0) {
                        const bLatex = ce.box(otherFd.base).toLatex();
                        remFactorsLatex.push(curExp === 1 ? `(${bLatex})` : `(${bLatex})^{${curExp}}`);
                    }
                }
                const remStr = remFactorsLatex.join('');
                if (fd.isQuad) {
                    const l1 = unknowns[currentUIdx++].label, l2 = unknowns[currentUIdx++].label;
                    rhsTermsLatex.push(`(${l1}${variable} + ${l2})${remStr}`);
                } else {
                    const l = unknowns[currentUIdx++].label;
                    rhsTermsLatex.push(`${l}${remStr ? `${remStr}` : ''}`);
                }
            }
        }

        if (steps) steps.push({
            title: "去分母建立分子多项式恒等式",
            latex: `${ce.box(numNode).toLatex()} = ${rhsTermsLatex.join(' + ')}`
        });

        const P_poly = new Array(N).fill(0);
        let curDeriv = numNode;
        let fact = 1;
        for (let d = 0; d < N; d++) {
            if (d > 0) {
                curDeriv = differentiateNode(curDeriv, variable, ce, null).json;
                fact *= d;
            }
            const coeff = ce.box(curDeriv).subs({ [variable]: 0 }).evaluate().valueOf();
            P_poly[d] = (typeof coeff === 'number' ? coeff : 0) / fact;
        }

        const M = [];
        const V = [];
        const systemEquationsLaTeX = [];

        for (let d = N - 1; d >= 0; d--) {
            const row = [];
            const eqTerms = [];
            for (let j = 0; j < N; j++) {
                const c = unknownPolys[j][d] || 0;
                row.push(c);
                if (Math.abs(c) > 1e-9) {
                    const fracC = toRational(c);
                    const l = unknowns[j].label;
                    if (fracC.num === 1 && fracC.den === 1) {
                        eqTerms.push(eqTerms.length === 0 ? l : `+ ${l}`);
                    } else if (fracC.num === -1 && fracC.den === 1) {
                        eqTerms.push(`- ${l}`);
                    } else if (c > 0) {
                        eqTerms.push(eqTerms.length === 0 ? `${fracC.latex}${l}` : `+ ${fracC.latex}${l}`);
                    } else {
                        eqTerms.push(`- ${toRational(-c).latex}${l}`);
                    }
                }
            }
            M.push(row);
            const targetVal = P_poly[d] || 0;
            V.push(targetVal);

            const eqLHS = eqTerms.length > 0 ? eqTerms.join(' ') : '0';
            const termName = d === 0 ? '\\text{常数项}:' : (d === 1 ? `${variable} \\text{ 项}:` : `${variable}^${d} \\text{ 项}:`);
            systemEquationsLaTeX.push(`${termName} & ${eqLHS} = ${toRational(targetVal).latex}`);
        }

        if (steps) steps.push({
            title: "展开并对比两端同次幂系数，建立待定系数方程组",
            latex: `\\begin{cases} ${systemEquationsLaTeX.join(' \\\\ ')} \\end{cases}`
        });

        const coeffs = solveLinearSystem(M, V);
        if (!coeffs) return ce.box(['Integrate', ['Divide', numNode, denNode], variable]).evaluate();

        const coeffStrs = unknowns.map((u, idx) => `${u.label} = ${toRational(coeffs[idx]).latex}`);
        if (steps) steps.push({
            title: "求解线性方程组，得出各待定系数值",
            latex: coeffStrs.join(', \\quad ')
        });

        let integralLatexTerms = [], finalAstTerms = [], finalLatexTerms = [];
        let i = 0;

        while (i < N) {
            const u = unknowns[i];
            const denomAst = u.k === 1 ? u.fd.base : ['Power', u.fd.base, u.k];
            const denomLatex = ce.box(denomAst).toLatex();

            if (!u.isQuad) {
                const A = coeffs[i++];
                if (Math.abs(A) < 1e-9) continue;
                const fracA = toRational(A);
                const sign = fracA.num < 0 ? '-' : (integralLatexTerms.length === 0 ? '' : '+');
                const absCoeff = fracA.num === 1 && fracA.den === 1 ? '' : `${toRational(Math.abs(A)).latex} `;
                integralLatexTerms.push(`${sign} ${absCoeff}\\int \\frac{1}{${denomLatex}} \\, d${variable}`);

                const K = A / u.fd.b;
                if (u.k === 1) {
                    finalAstTerms.push(['Multiply', toRational(K).ast, ['Ln', ['Abs', u.fd.base]]]);
                    finalLatexTerms.push(formatTermWithCoeff(K, `\\ln\\left|${ce.box(u.fd.base).toLatex()}\\right|`, finalLatexTerms.length === 0));
                } else {
                    const K2 = A / (u.fd.b * (1 - u.k));
                    const newDenom = u.k - 1 === 1 ? u.fd.base : ['Power', u.fd.base, u.k - 1];
                    finalAstTerms.push(['Multiply', toRational(K2).ast, ['Divide', 1, newDenom]]);
                    finalLatexTerms.push(formatTermWithCoeff(K2, `\\frac{1}{${ce.box(newDenom).toLatex()}}`, finalLatexTerms.length === 0));
                }
            } else {
                const B = coeffs[i], D = coeffs[i + 1];
                i += 2;
                if (Math.abs(B) < 1e-9 && Math.abs(D) < 1e-9) continue;

                let numStr = '';
                if (Math.abs(B) > 1e-9) {
                    const fracB = toRational(B);
                    numStr += fracB.num === 1 && fracB.den === 1 ? `${variable}` : (fracB.num === -1 && fracB.den === 1 ? `-${variable}` : `${fracB.latex}${variable}`);
                }
                if (Math.abs(D) > 1e-9) {
                    numStr += (numStr && D > 0) ? ` + ${toRational(D).latex}` : (numStr && D < 0 ? ` - ${toRational(-D).latex}` : `${toRational(D).latex}`);
                }
                const sign = integralLatexTerms.length === 0 ? '' : '+ ';
                integralLatexTerms.push(`${sign}\\int \\frac{${numStr}}{${denomLatex}} \\, d${variable}`);

                const a = u.fd.a, b = u.fd.b, c = u.fd.c, k = u.k;
                const K1 = B / (2 * a), K2 = D - (B * b) / (2 * a);

                if (Math.abs(K1) > 1e-9) {
                    if (k === 1) {
                        finalAstTerms.push(['Multiply', toRational(K1).ast, ['Ln', u.fd.base]]);
                        finalLatexTerms.push(formatTermWithCoeff(K1, `\\ln(${ce.box(u.fd.base).toLatex()})`, finalLatexTerms.length === 0));
                    } else {
                        const newDenom = k - 1 === 1 ? u.fd.base : ['Power', u.fd.base, k - 1];
                        finalAstTerms.push(['Multiply', toRational(K1 / (1 - k)).ast, ['Divide', 1, newDenom]]);
                        finalLatexTerms.push(formatTermWithCoeff(K1 / (1 - k), `\\frac{1}{${ce.box(newDenom).toLatex()}}`, finalLatexTerms.length === 0));
                    }
                }
                if (Math.abs(K2) > 1e-9) {
                    const p = b / (2 * a), q = Math.sqrt((c / a) - p * p);
                    const xPlusP = p === 0 ? variable : (p > 0 ? `(${variable} + ${toRational(p).latex})` : `(${variable} - ${toRational(-p).latex})`);

                    if (k === 1) {
                        const C_arc = K2 / (a * q);
                        finalAstTerms.push(['Multiply', toRational(C_arc).ast, ['Arctan', ['Divide', ['Add', variable, toRational(p).ast], toRational(q).ast]]]);
                        finalLatexTerms.push(formatTermWithCoeff(C_arc, `\\arctan\\left(\\frac{${xPlusP}}{${toRational(q).latex}}\\right)`, finalLatexTerms.length === 0));
                    } else if (k === 2) {
                        const C1 = K2 / (2 * a * a * q * q), C2 = K2 / (2 * a * a * q * q * q);
                        finalAstTerms.push(['Multiply', toRational(C1).ast, ['Divide', ['Add', variable, toRational(p).ast], u.fd.base]]);
                        finalAstTerms.push(['Multiply', toRational(C2).ast, ['Arctan', ['Divide', ['Add', variable, toRational(p).ast], toRational(q).ast]]]);
                        finalLatexTerms.push(formatTermWithCoeff(C1, `\\frac{${xPlusP}}{${ce.box(u.fd.base).toLatex()}}`, finalLatexTerms.length === 0));
                        finalLatexTerms.push(formatTermWithCoeff(C2, `\\arctan\\left(\\frac{${xPlusP}}{${toRational(q).latex}}\\right)`, finalLatexTerms.length === 0));
                    }
                }
            }
        }

        if (steps) steps.push({
            title: "逐项求积并化简得到关于原变量的原函数",
            latex: cleanMathLatex(`${finalLatexTerms.join(' ').replace(/\+ -/g, '- ')}`)
        });

        return ce.box(['Add', ...finalAstTerms]).simplify();
    }

    return ce.box(['Integrate', ['Divide', numNode, denNode], variable]).evaluate();
}

/**
 * 分部积分法引擎 (Integration by Parts: \int u v' dx = u v - \int u' v dx)
 */
export function integrateByParts(uNode, dvNode, variable, ce, steps) {
    const du = differentiateNode(uNode, variable, ce, null).simplify();
    const v = integrateNode(dvNode, variable, ce, null).simplify();

    if (steps) {
        steps.push({
            title: "应用分部积分公式：\\int u \\, dv = uv - \\int v \\, du",
            latex: `\\text{设 } u = ${ce.box(uNode).toLatex()}, \\quad dv = ${ce.box(dvNode).toLatex()} \\, d${variable} \\implies du = ${cleanMathLatex(du.toLatex())} \\, d${variable}, \\quad v = ${cleanMathLatex(v.toLatex())}`
        });
    }

    const uvTerm = makeMultiply([uNode, v.json], ce).simplify();
    const remIntegrand = makeMultiply([v.json, du.json], ce).simplify();

    if (steps) {
        steps.push({
            title: "代入分部积分公式展开",
            latex: `uv - \\int v \\, du = ${cleanMathLatex(uvTerm.toLatex())} - \\int \\left(${cleanMathLatex(remIntegrand.toLatex())}\\right) d${variable}`
        });
    }

    const intRem = integrateNode(remIntegrand.json, variable, ce, steps);
    const finalResult = ce.box(['Subtract', uvTerm.json, intRem.json]).simplify();

    return finalResult;
}

/**
 * 三角有理式万能代换 (Weierstrass Substitution: t = tan(x/2))
 */
export function integrateTrigRational(node, variable, ce, steps) {
    const nodeExpr = ce.box(node);

    const tVar = 't';
    let numPolyT = 2;
    let denPolyT = null;

    if (Array.isArray(node) && node[0] === 'Divide') {
        const [, numNode, denNode] = node;
        const denBox = ce.box(denNode);

        const v0 = denBox.subs({ [variable]: 0 }).evaluate().valueOf();
        const vPi = denBox.subs({ [variable]: Math.PI }).evaluate().valueOf();
        const vHalfPi = denBox.subs({ [variable]: Math.PI / 2 }).evaluate().valueOf();

        if (typeof v0 === 'number' && typeof vPi === 'number' && typeof vHalfPi === 'number' && !isNaN(v0) && !isNaN(vPi) && !isNaN(vHalfPi)) {
            const B = (v0 - vPi) / 2;
            const C = (v0 + vPi) / 2;
            const A = vHalfPi - C;

            // 校验：分母必须真的是 A·sin + B·cos + C 的形式，否则不是三角有理式
            const denCheck = MC.compileAST(denNode, variable);
            for (const t of [0.7, 1.9, 3.3, 5.1]) {
                const guess = A * Math.sin(t) + B * Math.cos(t) + C;
                if (!isFinite(denCheck(t)) || Math.abs(denCheck(t) - guess) > 1e-7 * (1 + Math.abs(guess))) return null;
            }

            const a2 = C - B;
            const a1 = 2 * A;
            const a0 = C + B;

            const t2 = ['Power', tVar, 2];
            const terms = [];
            if (Math.abs(a2) > 1e-7) terms.push(a2 === 1 ? t2 : ['Multiply', toRational(a2).ast, t2]);
            if (Math.abs(a1) > 1e-7) terms.push(a1 === 1 ? tVar : ['Multiply', toRational(a1).ast, tVar]);
            if (Math.abs(a0) > 1e-7) terms.push(toRational(a0).ast);

            denPolyT = terms.length === 0 ? 1 : (terms.length === 1 ? terms[0] : ['Add', ...terms]);

            if (numNode !== 1 && numNode !== '1') {
                const numBox = ce.box(numNode);
                const n0 = numBox.subs({ [variable]: 0 }).evaluate().valueOf();
                const nPi = numBox.subs({ [variable]: Math.PI }).evaluate().valueOf();
                const nHalfPi = numBox.subs({ [variable]: Math.PI / 2 }).evaluate().valueOf();
                if (typeof n0 === 'number' && typeof nPi === 'number' && typeof nHalfPi === 'number' && !isNaN(n0) && !isNaN(nPi) && !isNaN(nHalfPi)) {
                    const nB = (n0 - nPi) / 2;
                    const nC = (n0 + nPi) / 2;
                    const nA = nHalfPi - nC;
                    const na2 = 2 * (nC - nB), na1 = 4 * nA, na0 = 2 * (nC + nB);
                    const nTerms = [];
                    if (Math.abs(na2) > 1e-7) nTerms.push(na2 === 1 ? t2 : ['Multiply', toRational(na2).ast, t2]);
                    if (Math.abs(na1) > 1e-7) nTerms.push(na1 === 1 ? tVar : ['Multiply', toRational(na1).ast, tVar]);
                    if (Math.abs(na0) > 1e-7) nTerms.push(toRational(na0).ast);
                    numPolyT = nTerms.length === 0 ? 0 : (nTerms.length === 1 ? nTerms[0] : ['Add', ...nTerms]);
                } else {
                    denPolyT = null;
                }
            }
        }
    }

    if (!denPolyT) {
        return null;
    }

    if (steps) steps.push({
        title: "识别为三角有理式，应用万能代换公式（Weierstrass Substitution）",
        latex: `\\text{令 } t = \\tan\\left(\\frac{${variable}}{2}\\right) \\implies \\sin(${variable}) = \\frac{2t}{1+t^2}, \\quad \\cos(${variable}) = \\frac{1-t^2}{1+t^2}, \\quad d${variable} = \\frac{2}{1+t^2} \\, dt`
    });

    if (steps) steps.push({
        title: "代入并通分整理为关于代换变量 t 的标准有理分式",
        latex: `\\int ${cleanMathLatex(nodeExpr.toLatex())} \\, d${variable} = \\int \\frac{${cleanMathLatex(ce.box(numPolyT).toLatex())}}{${cleanMathLatex(ce.box(denPolyT).toLatex())}} \\, dt`
    });

    const resInT = integratePartialFractions(numPolyT, denPolyT, tVar, ce, steps);
    const backSubAst = substituteVariable(resInT.json, tVar, ['Tan', ['Divide', variable, 2]]);
    const finalResult = ce.box(backSubAst).simplify();

    if (steps) steps.push({
        title: `回代 t = \\tan\\left(\\frac{${variable}}{2}\\right) 得出最终原函数`,
        latex: `${cleanMathLatex(finalResult.toLatex())}`
    });

    return finalResult;
}

// ==========================================
// 2.5 进阶积分策略：线性代换、三角幂/积、指数×三角、u-换元、有理函数
// ==========================================

let _integrationDepth = 0;

export function isUnevaluatedIntegral(boxed) {
    try { return JSON.stringify(boxed.json).includes('"Integrate"'); } catch (e) { return false; }
}

function linearArg(node, variable) {
    const p = MC.polyFromAst(node, variable);
    return p && MC.pDeg(p) === 1 ? { a: p[1], b: p[0] } : null;
}

function constValue(node) {
    try {
        const v = MC.compileAST(node, '__none__')(0);
        return typeof v === 'number' && isFinite(v) ? v : null;
    } catch (e) { return null; }
}

const ELEMENTARY_ANTIDERIVS = {
    Sin: u => ['Negate', ['Cos', u]],
    Cos: u => ['Sin', u],
    Tan: u => ['Negate', ['Ln', ['Abs', ['Cos', u]]]],
    Cot: u => ['Ln', ['Abs', ['Sin', u]]],
    Sec: u => ['Ln', ['Abs', ['Add', ['Sec', u], ['Tan', u]]]],
    Csc: u => ['Negate', ['Ln', ['Abs', ['Add', ['Csc', u], ['Cot', u]]]]],
    Exp: u => ['Exp', u],
    Sinh: u => ['Cosh', u],
    Cosh: u => ['Sinh', u],
    Tanh: u => ['Ln', ['Cosh', u]],
    Ln: u => ['Subtract', ['Multiply', u, ['Ln', u]], u],
    Log: u => ['Divide', ['Subtract', ['Multiply', u, ['Ln', u]], u], ['Ln', 10]],
    Arctan: u => ['Subtract', ['Multiply', u, ['Arctan', u]], ['Multiply', ['Rational', 1, 2], ['Ln', ['Add', 1, ['Power', u, 2]]]]],
    Arcsin: u => ['Add', ['Multiply', u, ['Arcsin', u]], ['Sqrt', ['Subtract', 1, ['Power', u, 2]]]],
    Arccos: u => ['Subtract', ['Multiply', u, ['Arccos', u]], ['Sqrt', ['Subtract', 1, ['Power', u, 2]]]],
    Sqrt: u => ['Multiply', ['Rational', 2, 3], ['Power', u, ['Rational', 3, 2]]]
};
// 当自变量本身就是积分变量时，旧规则已有更详细的步骤，不重复拦截
const LEGACY_HANDLED = new Set(['Sin', 'Cos', 'Tan', 'Cot', 'Exp', 'Ln', 'Arctan']);

/** ∫ kind^n(u) du 的递推公式（kind: Sin | Cos | Tan） */
function trigPowerAst(kind, n, u) {
    if (n === 0) return u;
    if (n === 1) return ELEMENTARY_ANTIDERIVS[kind](u);
    const rec = trigPowerAst(kind, n - 2, u);
    if (kind === 'Sin') {
        return ['Add',
            ['Negate', ['Divide', ['Multiply', ['Power', ['Sin', u], n - 1], ['Cos', u]], n]],
            ['Multiply', ['Rational', n - 1, n], rec]];
    }
    if (kind === 'Cos') {
        return ['Add',
            ['Divide', ['Multiply', ['Power', ['Cos', u], n - 1], ['Sin', u]], n],
            ['Multiply', ['Rational', n - 1, n], rec]];
    }
    return ['Subtract', ['Divide', ['Power', ['Tan', u], n - 1], n - 1], rec];
}

function divideByA(ast, a) {
    return Math.abs(a - 1) < 1e-12 ? ast : ['Divide', ast, MC.numAst(a)];
}

/** 解析三角因子：返回 { kind: 'Sin'|'Cos', power, arg } 或 null */
function parseTrigFactor(node) {
    const n = unwrapAST(node).expr;
    if (!Array.isArray(n)) return null;
    if ((n[0] === 'Sin' || n[0] === 'Cos') && n.length === 2) return { kind: n[0], power: 1, arg: n[1] };
    if (n[0] === 'Square') {
        const inner = unwrapAST(n[1]).expr;
        if (Array.isArray(inner) && (inner[0] === 'Sin' || inner[0] === 'Cos')) return { kind: inner[0], power: 2, arg: inner[1] };
    }
    if (n[0] === 'Power') {
        const inner = unwrapAST(n[1]).expr;
        const e = constValue(n[2]);
        if (Array.isArray(inner) && (inner[0] === 'Sin' || inner[0] === 'Cos') && e !== null && Number.isInteger(e) && e >= 1 && e <= 12) {
            return { kind: inner[0], power: e, arg: inner[1] };
        }
    }
    return null;
}

function tryExpandCE(ast, ce) {
    try {
        const r = ce.box(['Expand', ast]).evaluate();
        return r;
    } catch (e) { return null; }
}

function integrateElementary(node, op, args, variable, ce) {
    const sub = [];
    const nodeLatex = cleanMathLatex(ce.box(node).toLatex());
    const done = (ast, title, latex) => {
        if (title) sub.push({ title, latex: latex || `\\int ${nodeLatex} \\, d${variable} = ${cleanMathLatex(ce.box(ast).toLatex())}` });
        return { ast, sub };
    };

    // --- (a) 基本函数 + 线性内层：∫ f(ax+b) dx = F(ax+b)/a
    if (ELEMENTARY_ANTIDERIVS[op] && args.length === 1) {
        const lin = linearArg(args[0], variable);
        if (lin && !(Math.abs(lin.a - 1) < 1e-12 && Math.abs(lin.b) < 1e-12 && LEGACY_HANDLED.has(op))) {
            const u = MC.polyToAst([lin.b, lin.a], variable);
            const uLatex = cleanMathLatex(ce.box(u).toLatex());
            const G = ELEMENTARY_ANTIDERIVS[op](u);
            return done(divideByA(G, lin.a),
                Math.abs(lin.a - 1) < 1e-12 && Math.abs(lin.b) < 1e-12 ? '查基本积分表' : `线性换元：令 u = ${uLatex}，则 du = ${MC.fmt(lin.a)}\\,d${variable}`);
        }
    }

    if (op === 'Power' && args.length === 2) {
        const baseN = unwrapAST(args[0]).expr;
        const n = constValue(args[1]);

        // (b) 线性底数的幂：(ax+b)^n
        const linBase = linearArg(baseN, variable);
        if (linBase && n !== null && !(Math.abs(linBase.a - 1) < 1e-12 && Math.abs(linBase.b) < 1e-12)) {
            const u = MC.polyToAst([linBase.b, linBase.a], variable);
            const G = Math.abs(n + 1) < 1e-12 ? ['Ln', ['Abs', u]] : ['Divide', ['Power', u, MC.numAst(n + 1)], MC.numAst(n + 1)];
            return done(divideByA(G, linBase.a), `线性换元：令 u = ${cleanMathLatex(ce.box(u).toLatex())}，应用幂函数积分法则`);
        }

        // (c) 指数函数 c^{ax+b}
        const linExp = linearArg(args[1], variable);
        if (linExp && constValue(baseN) !== null && constValue(baseN) > 0 && Math.abs(constValue(baseN) - 1) > 1e-12) {
            const c = constValue(baseN);
            const u = MC.polyToAst([linExp.b, linExp.a], variable);
            const G = Math.abs(c - Math.E) < 1e-12 ? ['Exp', u] : ['Divide', ['Power', baseN, u], ['Ln', baseN]];
            return done(divideByA(G, linExp.a), '指数函数积分：\\int a^u \\, du = \\frac{a^u}{\\ln a}');
        }

        // (d) Sec^2 / Csc^2 / Sin^n / Cos^n / Tan^n （线性内层）
        if (Array.isArray(baseN) && n !== null && Number.isInteger(n) && n >= 2 && n <= 12 && baseN.length === 2) {
            const lin = linearArg(baseN[1], variable);
            if (lin) {
                const u = MC.polyToAst([lin.b, lin.a], variable);
                if (baseN[0] === 'Sec' && n === 2) return done(divideByA(['Tan', u], lin.a), '查基本积分表：\\int \\sec^2 u \\, du = \\tan u');
                if (baseN[0] === 'Csc' && n === 2) return done(divideByA(['Negate', ['Cot', u]], lin.a), '查基本积分表：\\int \\csc^2 u \\, du = -\\cot u');
                if (['Sin', 'Cos', 'Tan'].includes(baseN[0]) && !(baseN[0] !== 'Tan' && n === 2 && Math.abs(lin.a - 1) < 1e-12 && Math.abs(lin.b) < 1e-12)) {
                    const title = baseN[0] === 'Tan'
                        ? `应用递推公式：\\int \\tan^n u \\, du = \\frac{\\tan^{n-1} u}{n-1} - \\int \\tan^{n-2} u \\, du （n = ${n}）`
                        : `应用降幂递推公式：\\int ${baseN[0] === 'Sin' ? '\\sin' : '\\cos'}^n u \\, du = ${baseN[0] === 'Sin' ? '-\\frac{\\sin^{n-1} u \\cos u}{n}' : '\\frac{\\cos^{n-1} u \\sin u}{n}'} + \\frac{n-1}{n}\\int ${baseN[0] === 'Sin' ? '\\sin' : '\\cos'}^{n-2} u \\, du （n = ${n}）`;
                    return done(divideByA(trigPowerAst(baseN[0], n, u), lin.a), title);
                }
            }
        }
    }

    // --- (e) Multiply：三角乘积 / 指数×三角
    if (op === 'Multiply') {
        const factors = args.map(a => unwrapAST(a).expr);

        // 指数 × 三角
        if (factors.length === 2) {
            const asExp = (f) => {
                if (Array.isArray(f) && f[0] === 'Exp') { const l = linearArg(f[1], variable); return l ? { lin: l, arg: f[1] } : null; }
                if (Array.isArray(f) && f[0] === 'Power' && (f[1] === 'ExponentialE' || f[1] === 'e')) { const l = linearArg(f[2], variable); return l ? { lin: l, arg: f[2] } : null; }
                return null;
            };
            for (const [i, j] of [[0, 1], [1, 0]]) {
                const ex = asExp(factors[i]);
                const tr = parseTrigFactor(factors[j]);
                if (ex && tr && tr.power === 1 && Math.abs(ex.lin.a) > 1e-12) {
                    const lin2 = linearArg(tr.arg, variable);
                    if (!lin2) continue;
                    const p = ex.lin.a, r = lin2.a;
                    const E = ['Exp', MC.polyToAst([ex.lin.b, ex.lin.a], variable)];
                    const S = ['Sin', tr.arg], C = ['Cos', tr.arg];
                    const bracket = tr.kind === 'Sin'
                        ? ['Subtract', ['Multiply', MC.numAst(p), S], ['Multiply', MC.numAst(r), C]]
                        : ['Add', ['Multiply', MC.numAst(p), C], ['Multiply', MC.numAst(r), S]];
                    return done(['Divide', ['Multiply', E, bracket], MC.numAst(p * p + r * r)],
                        '指数函数与三角函数乘积：连续两次分部积分后移项（循环积分），得 \\int e^{px}\\sin(rx)\\,dx = \\frac{e^{px}(p\\sin rx - r\\cos rx)}{p^2+r^2}');
                }
            }
        }

        // 三角函数之间的乘积
        const trigs = factors.map(parseTrigFactor);
        if (trigs.length >= 1 && trigs.every(t => t)) {
            const sameArg = trigs.every(t => JSON.stringify(t.arg) === JSON.stringify(trigs[0].arg));
            const lin = sameArg ? linearArg(trigs[0].arg, variable) : null;
            if (sameArg && lin) {
                let m = 0, nn = 0;
                trigs.forEach(t => { if (t.kind === 'Sin') m += t.power; else nn += t.power; });
                const u = trigs[0].arg;
                const mkPoly = (kOdd, other, flip) => {
                    // ∫ sin^m cos^n du，m 为奇数：令 t = cos u；n 为奇数：令 t = sin u
                    const k = (kOdd - 1) / 2;
                    let P = MC.pMul(MC.pPow([1, 0, -1], k), [...new Array(other).fill(0), 1]);
                    const F = MC.polyAntiderivativeAst(P, 't');
                    const back = substituteVariable(F, 't', flip);
                    return back;
                };
                if (m % 2 === 1) {
                    const F = mkPoly(m, nn, ['Cos', u]);
                    return done(divideByA(['Negate', F], lin.a), `\\sin 的次数为奇数：拆出一个 \\sin u\\,du = -d(\\cos u)，令 t = \\cos u，其余 \\sin^2 u = 1 - t^2`);
                }
                if (nn % 2 === 1) {
                    const F = mkPoly(nn, m, ['Sin', u]);
                    return done(divideByA(F, lin.a), `\\cos 的次数为奇数：拆出一个 \\cos u\\,du = d(\\sin u)，令 t = \\sin u，其余 \\cos^2 u = 1 - t^2`);
                }
                // 两者皆为偶数：半角公式降幂后展开
                if (m + nn <= 8) {
                    const u2 = ['Multiply', 2, u];
                    const expr = ['Multiply',
                        ['Power', ['Divide', ['Subtract', 1, ['Cos', u2]], 2], m / 2],
                        ['Power', ['Divide', ['Add', 1, ['Cos', u2]], 2], nn / 2]];
                    const ex = tryExpandCE(expr, ce);
                    if (ex) {
                        const inner = integrateNode(ex.json, variable, ce, null);
                        if (!isUnevaluatedIntegral(inner)) {
                            return done(inner.json, '\\sin、\\cos 均为偶次幂：用半角公式 \\sin^2 u = \\frac{1-\\cos 2u}{2}, \\cos^2 u = \\frac{1+\\cos 2u}{2} 降幂');
                        }
                    }
                }
            }
            // sin·cos / sin·sin / cos·cos 不同角：积化和差
            if (trigs.length === 2 && trigs.every(t => t.power === 1)) {
                const A = trigs[0].arg, B = trigs[1].arg;
                const la = linearArg(A, variable), lb = linearArg(B, variable);
                if (la && lb) {
                    const sum = ['Add', A, B], diff = ['Subtract', A, B];
                    let rewrite, formula;
                    const k0 = trigs[0].kind, k1 = trigs[1].kind;
                    if (k0 === 'Sin' && k1 === 'Cos') { rewrite = ['Add', ['Sin', sum], ['Sin', diff]]; formula = '\\sin A\\cos B = \\frac{\\sin(A+B)+\\sin(A-B)}{2}'; }
                    else if (k0 === 'Cos' && k1 === 'Sin') { rewrite = ['Subtract', ['Sin', sum], ['Sin', diff]]; formula = '\\cos A\\sin B = \\frac{\\sin(A+B)-\\sin(A-B)}{2}'; }
                    else if (k0 === 'Sin') { rewrite = ['Subtract', ['Cos', diff], ['Cos', sum]]; formula = '\\sin A\\sin B = \\frac{\\cos(A-B)-\\cos(A+B)}{2}'; }
                    else { rewrite = ['Add', ['Cos', diff], ['Cos', sum]]; formula = '\\cos A\\cos B = \\frac{\\cos(A-B)+\\cos(A+B)}{2}'; }
                    const half = ['Multiply', ['Rational', 1, 2], rewrite];
                    const inner = integrateNode(half, variable, ce, null);
                    if (!isUnevaluatedIntegral(inner)) return done(inner.json, `积化和差：${formula}`);
                }
            }
        }
    }

    // --- (f) 1/√(二次式)
    if (op === 'Divide' && args.length === 2) {
        const den = unwrapAST(args[1]).expr;
        const k = constValue(args[0]);
        if (k !== null && Array.isArray(den) && den[0] === 'Sqrt') {
            const q = MC.polyFromAst(den[1], variable);
            if (q && MC.pDeg(q) === 2) {
                const [c, b, a] = q;
                const Q = den[1];
                let G;
                if (a > 0) {
                    const sa = Math.sqrt(a);
                    G = ['Multiply', MC.numAst(1 / sa), ['Ln', ['Abs', ['Add',
                        ['Multiply', MC.numAst(2 * sa), ['Sqrt', Q]],
                        ['Add', ['Multiply', MC.numAst(2 * a), variable], MC.numAst(b)]]]]];
                } else if (a < 0) {
                    const sa = Math.sqrt(-a), disc = Math.sqrt(b * b - 4 * a * c);
                    G = ['Multiply', MC.numAst(1 / sa), ['Arcsin', ['Divide', ['Add', ['Multiply', MC.numAst(-2 * a), variable], MC.numAst(-b)], MC.numAst(disc)]]];
                }
                if (G) return done(['Multiply', MC.numAst(k), G], '配方后套用公式：\\int \\frac{dx}{\\sqrt{ax^2+bx+c}}');
            }
        }
    }
    return null;
}

/** 通用 u-换元：枚举被积函数的内层子表达式 g，检验 f(x)/g'(x) 是否只依赖 u */
function integrateBySubstitution(node, variable, ce) {
    const uName = variable === 'u' ? 'w' : 'u';
    const candidates = new Map();
    const collect = (n0) => {
        const n = unwrapAST(n0).expr;
        if (!Array.isArray(n)) return;
        n.slice(1).forEach(collect);
        if (!isConstant(n, variable)) candidates.set(JSON.stringify(n), n);
    };
    collect(node);
    candidates.delete(JSON.stringify(node));
    const list = [...candidates.values()].sort((p, q) => JSON.stringify(q).length - JSON.stringify(p).length).slice(0, 8);

    const replaceNode = (n0, targetKey, name) => {
        const n = unwrapAST(n0).expr;
        if (Array.isArray(n)) {
            if (JSON.stringify(n) === targetKey) return name;
            return [n[0], ...n.slice(1).map(a => replaceNode(a, targetKey, name))];
        }
        return n;
    };

    for (const g of list) {
        try {
            const key = JSON.stringify(g);
            const nodeU = replaceNode(node, key, uName);
            if (JSON.stringify(nodeU) === JSON.stringify(node)) continue;
            const lin = linearArg(g, variable);
            let integrandU;
            if (lin) {
                // x = (u - b)/a, dx = du/a
                const xOfU = ['Divide', ['Subtract', uName, MC.numAst(lin.b)], MC.numAst(lin.a)];
                const withX = substituteVariable(nodeU, variable, xOfU);
                integrandU = ce.box(['Divide', withX, MC.numAst(lin.a)]).simplify();
            } else {
                const dg = differentiateNode(g, variable, ce, null).simplify();
                if (dg.json === 0) continue;
                integrandU = ce.box(['Divide', nodeU, dg.json]).simplify();
            }
            if (MC.containsSymbol(integrandU.json, variable)) continue;

            const inner = integrateNode(integrandU.json, uName, ce, null);
            if (isUnevaluatedIntegral(inner)) continue;
            const back = ce.box(substituteVariable(inner.json, uName, g));
            const gLatex = cleanMathLatex(ce.box(g).toLatex());
            const sub = [
                { title: `选取内层函数作代换：令 u = ${gLatex}`, latex: `u = ${gLatex}, \\quad du = ${lin ? `${MC.fmt(lin.a)}\\,d${variable}` : `\\left(${cleanMathLatex(differentiateNode(g, variable, ce, null).simplify().toLatex())}\\right) d${variable}`}` },
                { title: '换元后只含 u，化为关于 u 的积分', latex: `\\int ${cleanMathLatex(integrandU.toLatex())} \\, du = ${cleanMathLatex(inner.toLatex())}` },
                { title: `回代 u = ${gLatex}`, latex: `${cleanMathLatex(back.toLatex())}` }
            ];
            return { ast: back.json, sub };
        } catch (e) { /* 尝试下一个候选 */ }
    }
    return null;
}

/** 进阶策略总入口；成功返回 CE 盒装表达式，失败返回 null */
function integrateAdvanced(node, op, args, variable, ce, steps) {
    if (_integrationDepth >= 4) return null;
    _integrationDepth++;
    try {
        // 1) 有理函数（含多项式乘积展开）
        const trivialPower = (op === 'Power' && unwrapAST(args[0]).expr === variable)
            || (op === 'Divide' && args.length === 2 && isConstant(args[0], variable) && unwrapAST(args[1]).expr === variable);
        if (!trivialPower) {
            const R = MC.ratFromAst(node, variable);
            if (R) {
                const red = MC.reduceRat(R);
                if (MC.pDeg(red.d) === 0) {
                    const P = MC.pScale(red.n, 1 / red.d[0]);
                    if (steps) steps.push({ title: '被积函数为多项式：展开后逐项应用幂函数积分法则', latex: `\\int \\left(${MC.polyLatex(P, variable)}\\right) d${variable}` });
                    return ce.box(MC.polyAntiderivativeAst(P, variable));
                }
                const ir = MC.integrateRational(red.n, red.d, variable);
                if (ir) {
                    if (steps) { steps.push({ title: '被积函数为有理函数', latex: `\\int \\frac{${MC.polyLatex(red.n, variable)}}{${MC.polyLatex(red.d, variable)}} \\, d${variable}` }); steps.push(...ir.steps); }
                    return ce.box(ir.ast);
                }
            }
        }
        // 2) 基本公式、三角幂/积、指数×三角
        const el = integrateElementary(node, op, args, variable, ce);
        if (el) { if (steps) steps.push(...el.sub); return ce.box(el.ast); }
        // 3) 通用 u-换元
        const us = integrateBySubstitution(node, variable, ce);
        if (us) { if (steps) steps.push(...us.sub); return ce.box(us.ast); }
        return null;
    } catch (e) {
        return null;
    } finally {
        _integrationDepth--;
    }
}

/**
 * 通用单节点不定积分求解器 (支持多项式、和差、常数倍提取、第一类换元法、分部积分法、部分分式)
 */
export function integrateNode(node, variable, ce, steps) {
    const { expr: unwrappedNode } = unwrapAST(node);
    const nodeExpr = ce.box(unwrappedNode);

    if (isConstant(unwrappedNode, variable)) {
        return makeMultiply([unwrappedNode, variable], ce).simplify();
    }
    if (unwrappedNode === variable) {
        return ce.box(['Multiply', ['Rational', 1, 2], ['Power', variable, 2]]).simplify();
    }
    if (!Array.isArray(unwrappedNode)) {
        return ce.box(['Integrate', unwrappedNode, variable]).evaluate();
    }

    const [op, ...args] = unwrappedNode;

    // 1. 和法则
    if (op === 'Add') {
        if (steps) steps.push({
            title: "应用积分和差法则：逐项分别求积分",
            latex: cleanMathLatex(`\\int \\left(${nodeExpr.toLatex()}\\right) d${variable} = ` +
                args.map(arg => `\\int ${ce.box(unwrapAST(arg).expr).toLatex()} \\, d${variable}`).join(' + '))
        });
        const integratedArgs = args.map(arg => integrateNode(arg, variable, ce, steps));
        return ce.box(['Add', ...integratedArgs.map(i => i.json)]).simplify();
    }

    // 2. 减法则
    if (op === 'Subtract' && args.length === 2) {
        const intU = integrateNode(args[0], variable, ce, steps);
        const intV = integrateNode(args[1], variable, ce, steps);
        return ce.box(['Subtract', intU.json, intV.json]).simplify();
    }

    // 3. 相反数法则
    if (op === 'Negate' && args.length === 1) {
        const intU = integrateNode(args[0], variable, ce, steps);
        return ce.box(['Negate', intU.json]).simplify();
    }

    // 4. 乘积法则与常数提取
    if (op === 'Multiply') {
        const constants = args.filter(a => isConstant(a, variable));
        const variables = args.filter(a => !isConstant(a, variable));

        if (constants.length > 0) {
            const cBox = makeMultiply(constants, ce);
            const vBox = variables.length === 0 ? 1 : (variables.length === 1 ? variables[0] : ['Multiply', ...variables]);
            if (steps) steps.push({
                title: "应用积分常数倍法则：将常数因子提取至积分号外",
                latex: `\\int \\left(${cleanMathLatex(nodeExpr.toLatex())}\\right) d${variable} = ${cleanMathLatex(cBox.toLatex())} \\int \\left(${cleanMathLatex(ce.box(vBox).toLatex())}\\right) d${variable}`
            });
            const intV = integrateNode(vBox, variable, ce, steps);
            return makeMultiply([cBox.json, intV.json], ce).simplify();
        }

        if (args.length === 2) {
            const [u, v] = args;
            const isPoly = (item) => {
                const unw = unwrapAST(item).expr;
                return unw === variable || (Array.isArray(unw) && unw[0] === 'Power' && unw[1] === variable && isConstant(unw[2], variable));
            };
            const isExpOrTrig = (item) => {
                const unw = unwrapAST(item).expr;
                return Array.isArray(unw) && ['Exp', 'Sin', 'Cos'].includes(unw[0]);
            };
            const isLogOrArc = (item) => {
                const unw = unwrapAST(item).expr;
                return Array.isArray(unw) && ['Ln', 'Log', 'Arctan', 'Arcsin'].includes(unw[0]);
            };

            if (isPoly(u) && isExpOrTrig(v)) {
                return integrateByParts(u, v, variable, ce, steps);
            }
            if (isPoly(v) && isExpOrTrig(u)) {
                return integrateByParts(v, u, variable, ce, steps);
            }
            if (isPoly(u) && isLogOrArc(v)) {
                return integrateByParts(v, u, variable, ce, steps);
            }
            if (isPoly(v) && isLogOrArc(u)) {
                return integrateByParts(u, v, variable, ce, steps);
            }
        }
    }

    // 4.5 进阶策略：多项式/有理函数、线性代换、三角幂与积、指数×三角、u-换元
    {
        const adv = integrateAdvanced(unwrappedNode, op, args, variable, ce, steps);
        if (adv) return adv;
    }

    // 5. 对数函数积分 \int \ln(x) dx = x \ln(x) - x
    if (op === 'Ln' && args[0] === variable) {
        if (steps) steps.push({
            title: "对 \\ln(x) 应用分部积分法",
            latex: `\\int \\ln(${variable}) \\, d${variable} = ${variable} \\ln(${variable}) - \\int ${variable} \\cdot \\frac{1}{${variable}} \\, d${variable} = ${variable}\\ln(${variable}) - ${variable}`
        });
        return ce.box(['Subtract', ['Multiply', variable, ['Ln', variable]], variable]);
    }

    // 6. 反正切函数积分 \int \arctan(x) dx
    if (op === 'Arctan' && args[0] === variable) {
        return integrateByParts(unwrappedNode, 1, variable, ce, steps);
    }

    // 7. 三角函数
    if (hasTrigFunctions(unwrappedNode, variable)) {
        if (op === 'Sin' && args[0] === variable) return ce.box(['Negate', ['Cos', variable]]).simplify();
        if (op === 'Cos' && args[0] === variable) return ce.box(['Sin', variable]);
        if (op === 'Tan' && args[0] === variable) {
            if (steps) steps.push({
                title: "改写为商形式应用第一类换元法",
                latex: `\\int \\tan(${variable}) \\, d${variable} = \\int \\frac{\\sin(${variable})}{\\cos(${variable})} \\, d${variable} = -\\ln|\\cos(${variable})|`
            });
            return ce.box(['Negate', ['Ln', ['Abs', ['Cos', variable]]]]).simplify();
        }
        if (op === 'Cot' && args[0] === variable) {
            return ce.box(['Ln', ['Abs', ['Sin', variable]]]).simplify();
        }

        const baseExpr = unwrapAST(args[0]).expr;
        const isExp2 = args[1] === 2 || args[1] === '2' || (typeof args[1] === 'number' && Math.abs(args[1] - 2) < 1e-9);

        if ((op === 'Power' && isExp2) || op === 'Square') {
            const isBaseSin = Array.isArray(baseExpr) && baseExpr[0] === 'Sin' && unwrapAST(baseExpr[1]).expr === variable;
            const isBaseCos = Array.isArray(baseExpr) && baseExpr[0] === 'Cos' && unwrapAST(baseExpr[1]).expr === variable;
            if (isBaseSin) {
                if (steps) steps.push({
                    title: "应用三角二倍角降幂公式: \\sin^2(x) = \\frac{1 - \\cos(2x)}{2}",
                    latex: `\\int \\sin^2(${variable}) \\, d${variable} = \\int \\frac{1 - \\cos(2${variable})}{2} \\, d${variable} = \\frac{${variable}}{2} - \\frac{\\sin(2${variable})}{4}`
                });
                return ce.box(['Subtract', ['Divide', variable, 2], ['Divide', ['Sin', ['Multiply', 2, variable]], 4]]).simplify();
            }
            if (isBaseCos) {
                if (steps) steps.push({
                    title: "应用三角二倍角降幂公式: \\cos^2(x) = \\frac{1 + \\cos(2x)}{2}",
                    latex: `\\int \\cos^2(${variable}) \\, d${variable} = \\int \\frac{1 + \\cos(2${variable})}{2} \\, d${variable} = \\frac{${variable}}{2} + \\frac{\\sin(2${variable})}{4}`
                });
                return ce.box(['Add', ['Divide', variable, 2], ['Divide', ['Sin', ['Multiply', 2, variable]], 4]]).simplify();
            }
        }

        const trigRationalRes = integrateTrigRational(unwrappedNode, variable, ce, steps);
        if (trigRationalRes) return trigRationalRes;
    }

    // 8. 分式与部分分式
    if (op === 'Divide' && args.length === 2) {
        const [u, v] = args;
        if (isConstant(u, variable) && v === variable) {
            const coeff = toRational(ce.box(u).evaluate().valueOf());
            if (steps) steps.push({
                title: "查基本积分表：\\int \\frac{1}{x} \\, dx = \\ln|x|",
                latex: `\\int \\frac{${ce.box(u).toLatex()}}{${variable}} \\, d${variable} = ${coeff.num === 1 && coeff.den === 1 ? '' : `${coeff.latex} `}\\ln|${variable}|`
            });
            return ce.box(['Multiply', coeff.ast, ['Ln', ['Abs', variable]]]);
        }
        return ce.box(['Integrate', unwrappedNode, variable]).evaluate();
    }

    // 9. 幂函数法则 \int x^n dx = \frac{x^{n+1}}{n+1}
    if (op === 'Power' && args[0] === variable && isConstant(args[1], variable)) {
        const n = ce.box(args[1]).evaluate().valueOf();
        if (Math.abs(n - (-1)) < 1e-9) {
            if (steps) steps.push({ title: "查基本积分表", latex: `\\int \\frac{1}{${variable}} \\, d${variable} = \\ln|${variable}|` });
            return ce.box(['Ln', ['Abs', variable]]);
        }
        const fracExp = toRational(n + 1);
        if (steps) steps.push({
            title: "查基本积分表：应用幂函数积分法则 \\int x^n \\, dx = \\frac{x^{n+1}}{n+1}",
            latex: `\\int ${variable}^{${toRational(n).latex}} \\, d${variable} = \\frac{${variable}^{${fracExp.latex}}}{${fracExp.latex}}`
        });
        return ce.box(['Divide', ['Power', variable, fracExp.ast], fracExp.ast]).simplify();
    }

    // 10. 指数函数
    if (op === 'Exp' && args[0] === variable) {
        return ce.box(['Power', 'ExponentialE', variable]);
    }

    return ce.box(['Integrate', unwrappedNode, variable]).evaluate();
}

/**
 * 把边界 AST 转成数值（支持 ±∞、π、e 等）
 */
export function toNumber(ast, ce) {
    try {
        const v = MC.compileAST(ast, '__v')(0);
        if (typeof v === 'number' && !isNaN(v)) return v;
    } catch (e) { }
    try {
        const v = ce.box(ast).evaluate().valueOf();
        if (typeof v === 'number') return v;
    } catch (e) { }
    return NaN;
}

function boundLatex(ast, num, ce) {
    if (num === Infinity) return '\\infty';
    if (num === -Infinity) return '-\\infty';
    return cleanMathLatex(ce.box(ast).toLatex());
}

/** 用中心差分检验 F' ≈ f，返回 { ok, tested } */
export function verifyAntiderivative(f, F) {
    let tested = 0, bad = 0;
    for (const x of [-2.7, -1.9, -1.3, -0.8, -0.35, 0.15, 0.45, 0.85, 1.35, 1.9, 2.6, 3.3]) {
        const h = 1e-5;
        const d = (F(x + h) - F(x - h)) / (2 * h), e = f(x);
        if (!isFinite(d) || !isFinite(e)) continue;
        tested++;
        if (Math.abs(d - e) > 1e-4 * (1 + Math.abs(e))) bad++;
    }
    return { ok: tested >= 3 && bad === 0, tested, bad };
}

/** 奇点性质：|f| ~ ε^{-α}。α ≥ 1 时发散 */
function classifySingularity(f, x0) {
    const at = (e) => Math.max(Math.abs(f(x0 + e)), Math.abs(f(x0 - e)));
    const a = at(1e-4), b = at(1e-6);
    if (!isFinite(a) || !isFinite(b) || b < 1e3) return { divergent: false, alpha: 0 };
    const alpha = Math.log(b / a) / Math.log(100);
    return { divergent: alpha >= 0.97, alpha };
}

function plotLayersForIntegral(varName, integrandFn, primitiveFn) {
    const layers = [{ id: 'f', label: `被积函数 f(${varName})`, name: '被积函数', latex: `f(${varName})`, color: '#38bdf8', visible: true, fn: integrandFn }];
    if (primitiveFn) layers.push({ id: 'F', label: `原函数 F(${varName})`, name: '原函数 (C=0)', latex: `F(${varName})`, color: '#c084fc', visible: true, fn: primitiveFn });
    return layers;
}

/**
 * 积分求解器导出主入口 (支持不定积分、定积分与反常积分)
 */
export function solveIntegral({ targetExpr, variable, lower, upper, isDefinite, conditionExpr }, ce) {
    const { expr: cleanExpr, inferredVar } = unwrapAST(targetExpr);
    const varName = inferredVar || variable || 'x';
    const steps = [];
    const integrandLatex = cleanMathLatex(ce.box(cleanExpr).toLatex());
    const integrandFn = buildMathFunction(cleanExpr, varName, ce);

    // ---------- 不定积分 ----------
    if (!isDefinite) {
        steps.push({ title: '确定不定积分目标函数', latex: `\\int ${integrandLatex} \\, d${varName}` });
        _integrationDepth = 0;
        const rawIntegral = integrateNode(cleanExpr, varName, ce, steps);

        if (isUnevaluatedIntegral(rawIntegral)) {
            steps.push({ title: '未能找到初等原函数', latex: `\\int ${integrandLatex} \\, d${varName} \\text{ 无法用本引擎的初等方法表示}` });
            return formatOutput({
                resultLatex: `\\int ${integrandLatex} \\, d${varName} \\quad \\text{(未能求得初等原函数)}`,
                steps,
                plotData: { layers: plotLayersForIntegral(varName, integrandFn, null), points: [] }
            });
        }

        const finalF = rawIntegral.simplify();
        const finalLatexClean = cleanMathLatex(finalF.toLatex());
        const condSuffix = conditionExpr ? ` \\quad (${ce.box(unwrapAST(conditionExpr).expr).toLatex()})` : '';
        const primitiveFn = buildMathFunction(finalF.json, varName, ce);

        const check = verifyAntiderivative(integrandFn, primitiveFn);
        steps.push({
            title: '追加任意积分常数 C',
            latex: `\\int ${integrandLatex} \\, d${varName} = ${finalLatexClean} + C${condSuffix}`
        });
        steps.push({
            title: check.ok ? '数值验证：对结果求导，与被积函数逐点吻合' : '⚠️ 数值验证未通过：对结果求导与被积函数不一致，请核对',
            latex: check.ok ? `\\frac{d}{d${varName}}\\left[${finalLatexClean}\\right] = ${integrandLatex}` : `\\text{(在 ${check.tested} 个采样点中有 ${check.bad} 个不吻合)}`
        });

        return formatOutput({
            resultLatex: `${finalLatexClean} + C${condSuffix}`,
            steps,
            plotData: { layers: plotLayersForIntegral(varName, integrandFn, primitiveFn), points: [] }
        });
    }

    // ---------- 定积分 / 反常积分 ----------
    const L = toNumber(lower, ce), U = toNumber(upper, ce);
    const lowTex = boundLatex(lower, L, ce), upTex = boundLatex(upper, U, ce);
    steps.push({
        title: `确定积分区间 $[${lowTex}, ${upTex}]$`,
        latex: `\\int_{${lowTex}}^{${upTex}} ${integrandLatex} \\, d${varName}`
    });
    if (isNaN(L) || isNaN(U)) {
        return formatOutput({ resultLatex: '\\text{积分上下限无法解析为数值}', steps, plotData: { layers: plotLayersForIntegral(varName, integrandFn, null), points: [] } });
    }

    const lo = Math.min(L, U), hi = Math.max(L, U);
    const improperInf = !isFinite(L) || !isFinite(U);

    // 奇点扫描
    let singular = [];
    if (isFinite(lo) && isFinite(hi) && hi > lo) {
        const scan = MC.scanRoots(integrandFn, lo, hi, 3000);
        singular = scan.poles.filter(p => p >= lo - 1e-9 && p <= hi + 1e-9);
        // 端点本身无定义
        [lo, hi].forEach(e => { if (!isFinite(integrandFn(e)) && !singular.some(p => Math.abs(p - e) < 1e-6)) { const near = Math.abs(integrandFn(e + (e === lo ? 1 : -1) * 1e-7)); if (near > 1e5) singular.push(e); } });
    }
    for (const p of singular) {
        const cls = classifySingularity(integrandFn, p);
        if (cls.divergent) {
            steps.push({ title: '⚠️ 奇点分析：被积函数在区间内无界', latex: `\\text{在 } ${varName} = ${MC.fmt(p)} \\text{ 处，} |f| \\sim \\varepsilon^{-${cls.alpha.toFixed(2)}}` });
            steps.push({ title: '反常积分敛散性判定（p 判别法：指数 ≥ 1 发散）', latex: `\\int_{${lowTex}}^{${upTex}} ${integrandLatex} \\, d${varName} \\text{ 发散}` });
            return formatOutput({
                resultLatex: `\\text{积分发散 (在 } ${varName} = ${MC.fmt(p)} \\text{ 处存在不可积奇点)}`,
                steps,
                plotData: { layers: plotLayersForIntegral(varName, integrandFn, null), points: [] }
            });
        }
        steps.push({ title: '奇点分析：瑕点处增长较慢，反常积分收敛', latex: `\\text{在 } ${varName} = ${MC.fmt(p)} \\text{ 处，} |f| \\sim \\varepsilon^{-${cls.alpha.toFixed(2)}} \\;(\\alpha<1)` });
    }
    const improper = improperInf || singular.length > 0;

    // 符号路径
    let finalF = null, primitiveFn = null, symbolicVal = NaN, symbolicLatex = null;
    _integrationDepth = 0;
    const rawIntegral = integrateNode(cleanExpr, varName, ce, steps);
    if (!isUnevaluatedIntegral(rawIntegral)) {
        finalF = rawIntegral.simplify();
        primitiveFn = buildMathFunction(finalF.json, varName, ce);
        if (!improper) {
            try {
                const fb = finalF.subs({ [varName]: upper }).evaluate();
                const fa = finalF.subs({ [varName]: lower }).evaluate();
                const dv = ce.box(['Subtract', fb.json, fa.json]).evaluate();
                const v = dv.valueOf();
                if (typeof v === 'number' && isFinite(v)) { symbolicVal = v; symbolicLatex = cleanMathLatex(dv.toLatex()); }
            } catch (e) { }
            steps.push({
                title: '应用牛顿-莱布尼茨公式代入端点求值',
                latex: `\\left[${cleanMathLatex(finalF.toLatex())}\\right]_{${lowTex}}^{${upTex}}${symbolicLatex ? ` = ${symbolicLatex}` : ''}`
            });
        } else {
            const limAt = (x) => {
                if (isFinite(x)) { const v = primitiveFn(x); return isFinite(v) ? v : MC.numericLimit(primitiveFn, x, x === lo ? '+' : '-').value; }
                const r = MC.numericLimit(primitiveFn, x); return r.kind === 'finite' ? r.value : (r.kind === 'inf' ? r.value : NaN);
            };
            const FU = limAt(U), FL = limAt(L);
            steps.push({
                title: '反常积分：化为端点极限 \\lim F(b) - \\lim F(a)',
                latex: `\\left[ F(${varName}) \\right]_{${lowTex}}^{${upTex}} = ${MC.describeNumber(FU).latex} - \\left(${MC.describeNumber(FL).latex}\\right)`
            });
            const v = FU - FL;
            if (isFinite(v)) symbolicVal = v;
        }
    } else {
        steps.push({ title: '未找到初等原函数，改用数值积分（tanh-sinh 双指数求积）', latex: `\\int_{${lowTex}}^{${upTex}} ${integrandLatex} \\, d${varName} \\approx \\text{数值求积}` });
    }

    // 数值积分交叉检验
    const sign = L <= U ? 1 : -1;
    const numericVal = sign * MC.integrateNumeric(integrandFn, lo, hi);
    let finalVal = numericVal, finalLatex, exact = false;

    const agree = isFinite(symbolicVal) && Math.abs(symbolicVal - numericVal) <= 1e-6 * (1 + Math.abs(numericVal));
    if (agree && !improper && symbolicLatex) {
        finalLatex = symbolicLatex;
        exact = true;
    } else {
        if (isFinite(symbolicVal) && !agree) {
            steps.push({ title: '⚠️ 符号结果与数值积分不一致，以数值积分为准', latex: `\\text{符号值} = ${MC.fmt(symbolicVal)}, \\quad \\text{数值积分} = ${MC.fmt(numericVal)}` });
        }
        const d = MC.describeNumber(finalVal);
        exact = d.exact;
        finalLatex = d.exact ? d.latex : `\\approx ${d.latex}`;
        if (d.exact) steps.push({ title: '数值积分并识别精确值', latex: `\\int_{${lowTex}}^{${upTex}} ${integrandLatex} \\, d${varName} = ${d.latex} \\approx ${MC.fmt(Number(finalVal.toPrecision(10)))}` });
        else steps.push({ title: '数值积分结果', latex: `\\int_{${lowTex}}^{${upTex}} ${integrandLatex} \\, d${varName} \\approx ${MC.fmt(finalVal)}` });
    }
    if (!isFinite(finalVal)) {
        return formatOutput({ resultLatex: '\\text{积分发散或无法数值估计}', steps, plotData: { layers: plotLayersForIntegral(varName, integrandFn, null), points: [] } });
    }

    const finite = isFinite(lo) && isFinite(hi);
    const plotData = {
        layers: plotLayersForIntegral(varName, integrandFn, primitiveFn),
        areas: [{
            layerId: 'f',
            from: finite ? lo : Math.max(lo, -40), to: finite ? hi : Math.min(hi, 40),
            topFn: integrandFn, bottomFn: () => 0, color: 'rgba(56, 189, 248, 0.25)'
        }],
        points: finite ? [
            { layerId: 'f', x: L, y: integrandFn(L), label: `积分下限 a=${MC.fmt(L)}`, name: '积分下限', latex: `a = ${MC.fmt(L)}`, style: 'solid', color: '#38bdf8' },
            { layerId: 'f', x: U, y: integrandFn(U), label: `积分上限 b=${MC.fmt(U)}`, name: '积分上限', latex: `b = ${MC.fmt(U)}`, style: 'solid', color: '#38bdf8' }
        ].filter(p => isFinite(p.y)) : []
    };
    return formatOutput({ resultLatex: withApprox(finalLatex, finalVal), steps, plotData });
}

// ==========================================
// 3. 极限求解器 (未定式判别、多阶洛必达、±∞、单侧极限、数值外推交叉验证)
// ==========================================

function parseLimitPoint(ast, ce) {
    const num = toNumber(ast, ce);
    if (num === Infinity) return { num, latex: '\\infty', ast: 'PositiveInfinity' };
    if (num === -Infinity) return { num, latex: '-\\infty', ast: ['Negate', 'PositiveInfinity'] };
    return { num, latex: cleanMathLatex(ce.box(ast).toLatex()), ast };
}

/** 判别 f 在点 pt 附近的未定式类型，返回 { name, latex } 或 null */
function classifyIndeterminate(expr, varName, pt) {
    const e = unwrapAST(expr).expr;
    if (!Array.isArray(e)) return null;
    const at = (n) => {
        try {
            const f = MC.compileAST(n, varName);
            const probe = isFinite(pt) ? [pt + 1e-9, pt - 1e-9] : [pt > 0 ? 1e9 : -1e9];
            const vals = probe.map(f).filter(v => !isNaN(v));
            return vals.length ? vals[0] : NaN;
        } catch (err) { return NaN; }
    };
    const isZero = (v) => Math.abs(v) < 1e-6, isInf = (v) => Math.abs(v) > 1e6;
    const [op, a, b] = e;
    if (op === 'Divide') {
        const n = at(a), d = at(b);
        if (isZero(n) && isZero(d)) return { name: '0/0', latex: '\\frac{0}{0}' };
        if (isInf(n) && isInf(d)) return { name: '∞/∞', latex: '\\frac{\\infty}{\\infty}' };
    }
    if (op === 'Multiply' && e.length === 3) {
        const x = at(a), y = at(b);
        if ((isZero(x) && isInf(y)) || (isInf(x) && isZero(y))) return { name: '0·∞', latex: '0 \\cdot \\infty' };
    }
    if ((op === 'Subtract' || op === 'Add') && e.length === 3) {
        const x = at(a), y = at(b);
        if (isInf(x) && isInf(y) && (op === 'Subtract' ? Math.sign(x) === Math.sign(y) : Math.sign(x) !== Math.sign(y))) return { name: '∞-∞', latex: '\\infty - \\infty' };
    }
    if (op === 'Power') {
        const base = at(a), ex = at(b);
        if (Math.abs(base - 1) < 1e-6 && isInf(ex)) return { name: '1^∞', latex: '1^{\\infty}' };
        if (isZero(base) && isZero(ex)) return { name: '0^0', latex: '0^{0}' };
        if (isInf(base) && isZero(ex)) return { name: '∞^0', latex: '\\infty^{0}' };
    }
    return null;
}

export function solveLimit({ targetExpr, variable, targetValue, conditionExpr, direction }, ce) {
    const { expr: cleanExpr, inferredVar } = unwrapAST(targetExpr);
    const varName = inferredVar || variable || 'x';
    const steps = [];
    const side = direction === '+' || direction === '-' ? direction : 'both';
    const pt = parseLimitPoint(targetValue === undefined || targetValue === null ? 0 : targetValue, ce);
    const exprLatex = cleanMathLatex(ce.box(cleanExpr).toLatex());
    const arrow = `${varName} \\to ${pt.latex}${side === '+' ? '^{+}' : side === '-' ? '^{-}' : ''}`;
    const fn = buildMathFunction(cleanExpr, varName, ce);

    steps.push({ title: '确定目标极限表达式及趋近点', latex: `\\lim_{${arrow}} \\left(${exprLatex}\\right)` });

    const buildPlot = (value, kind) => {
        const layers = [{ id: 'f', label: `f(${varName})`, name: `函数 f(${varName})`, latex: `f(${varName})`, color: '#38bdf8', visible: true, fn }];
        const points = [];
        if (kind === 'finite' && typeof value === 'number') {
            if (isFinite(pt.num)) {
                points.push({ x: pt.num, y: value, layerId: 'f', label: `极限值 L = ${MC.fmt(value)}`, name: '极限值', latex: `L = ${MC.fmt(value)}`, style: 'hollow', color: '#ef4444' });
            } else {
                layers.push({ id: 'asym', label: `水平渐近线 y = ${MC.fmt(value)}`, name: '水平渐近线', latex: `y = ${MC.fmt(value)}`, color: '#ef4444', dash: [6, 5], visible: true, fn: () => value });
            }
        } else if (kind === 'inf' && isFinite(pt.num)) {
            layers.push({ id: 'vasym', label: `竖直渐近线 ${varName} = ${MC.fmt(pt.num)}`, name: '竖直渐近线', latex: `${varName} = ${MC.fmt(pt.num)}`, color: '#ef4444', dash: [6, 5], visible: false, fn: () => NaN });
        }
        return { layers, points };
    };

    // 1) 直接代入（连续点）
    if (isFinite(pt.num) && side === 'both') {
        try {
            const direct = ce.box(cleanExpr).subs({ [varName]: pt.ast }).evaluate();
            const dv = direct.valueOf();
            const fnv = fn(pt.num);
            if (typeof dv === 'number' && isFinite(dv) && isFinite(fnv) && Math.abs(dv - fnv) < 1e-6 * (1 + Math.abs(fnv))) {
                steps.push({ title: '函数在该点连续，直接代入求值', latex: `\\lim_{${arrow}} \\left(${exprLatex}\\right) = ${cleanMathLatex(direct.toLatex())}` });
                return formatOutput({ resultLatex: withApprox(cleanMathLatex(direct.toLatex()), dv), steps, plotData: buildPlot(dv, 'finite') });
            }
        } catch (e) { /* 继续 */ }
    }

    // 2) 未定式判别与洛必达
    const form = classifyIndeterminate(cleanExpr, varName, pt.num);
    if (form) {
        steps.push({ title: `代入发现为 ${form.name} 型未定式`, latex: `\\lim_{${arrow}} \\left(${exprLatex}\\right) \\;\\to\\; ${form.latex}` });
    }

    let curExpr = cleanExpr;
    let hopital = 0;
    if (form && (form.name === '0/0' || form.name === '∞/∞')) {
        while (hopital < 5 && Array.isArray(curExpr) && curExpr[0] === 'Divide') {
            const [, num, den] = curExpr;
            const still = classifyIndeterminate(curExpr, varName, pt.num);
            if (!still || !(still.name === '0/0' || still.name === '∞/∞')) break;
            hopital++;
            steps.push({
                title: hopital === 1 ? `应用洛必达法则（${still.name} 型）` : `仍为 ${still.name} 型，第 ${hopital} 次应用洛必达法则`,
                latex: `\\lim_{${arrow}} \\frac{${cleanMathLatex(ce.box(num).toLatex())}}{${cleanMathLatex(ce.box(den).toLatex())}} = \\lim_{${arrow}} \\frac{\\left(${cleanMathLatex(ce.box(num).toLatex())}\\right)'}{\\left(${cleanMathLatex(ce.box(den).toLatex())}\\right)'}`
            });
            const dNum = differentiateNode(num, varName, ce, null).simplify();
            const dDen = differentiateNode(den, varName, ce, null).simplify();
            const ratio = ce.box(['Divide', dNum.json, dDen.json]).simplify();
            curExpr = ratio.json;
            steps.push({ title: '分别求导并化简', latex: `\\lim_{${arrow}} ${cleanMathLatex(ratio.toLatex())}` });
        }
    } else if (form && form.name === '0·∞' && Array.isArray(cleanExpr) && cleanExpr[0] === 'Multiply' && cleanExpr.length === 3) {
        steps.push({ title: '化乘积为商：f·g = f / (1/g)，转化为 0/0 或 ∞/∞ 型', latex: `f \\cdot g = \\frac{f}{1/g}` });
    } else if (form && form.name === '∞-∞') {
        steps.push({ title: '通分或有理化，将差式化为商再判断', latex: `f - g = \\frac{1}{g^{-1}} - \\frac{1}{f^{-1}}` });
    } else if (form && ['1^∞', '0^0', '∞^0'].includes(form.name)) {
        steps.push({ title: '取对数化为乘积型：f^g = e^{g\\ln f}', latex: `\\lim f^{g} = \\exp\\left(\\lim g \\ln f\\right)` });
    }

    // 3) 数值外推（对原式）作为判定依据
    const nl = MC.numericLimit(fn, pt.num, side);

    // 若洛必达后得到可直接计算的表达式，尝试精确值
    let exactTex = null, exactNum = NaN;
    if (hopital > 0) {
        try {
            const sub = isFinite(pt.num)
                ? ce.box(curExpr).subs({ [varName]: pt.ast }).evaluate()
                : ce.box(curExpr).evaluate();
            const sv = sub.valueOf();
            if (typeof sv === 'number' && isFinite(sv)) { exactNum = sv; exactTex = cleanMathLatex(sub.toLatex()); }
        } catch (e) { }
    }

    const sideNote = side === '+' ? '（右极限）' : side === '-' ? '（左极限）' : '';
    if (nl.kind === 'finite') {
        const v = nl.value;
        let latex, titleNote;
        if (exactTex && Math.abs(exactNum - v) <= 1e-5 * (1 + Math.abs(v))) {
            latex = exactTex; titleNote = '代入化简后的表达式求得极限';
        } else {
            const d = MC.describeNumber(v);
            latex = d.exact ? d.latex : `\\approx ${d.latex}`;
            titleNote = d.exact ? '数值外推（Richardson）并识别精确值' : '数值外推得到近似值';
        }
        if (nl.left && nl.right && side === 'both') {
            steps.push({ title: '分别计算左、右极限，两者相等', latex: `\\lim_{${varName}\\to ${pt.latex}^-} = ${MC.describeNumber(nl.left.value).latex}, \\quad \\lim_{${varName}\\to ${pt.latex}^+} = ${MC.describeNumber(nl.right.value).latex}` });
        }
        steps.push({ title: `${titleNote}${sideNote}`, latex: `\\lim_{${arrow}} \\left(${exprLatex}\\right) = ${latex}` });
        return formatOutput({ resultLatex: withApprox(latex, v), steps, plotData: buildPlot(v, 'finite') });
    }
    if (nl.kind === 'inf') {
        const tex = nl.value > 0 ? '+\\infty' : '-\\infty';
        steps.push({ title: `函数值无限增大，极限为无穷${sideNote}`, latex: `\\lim_{${arrow}} \\left(${exprLatex}\\right) = ${tex}` });
        return formatOutput({ resultLatex: tex, steps, plotData: buildPlot(nl.value, 'inf') });
    }
    // dne
    if (nl.left && nl.right) {
        const d = (r) => (r.kind === 'finite' ? MC.describeNumber(r.value).latex : (r.kind === 'inf' ? (r.value > 0 ? '+\\infty' : '-\\infty') : '\\text{不存在}'));
        steps.push({ title: '左、右极限不相等，极限不存在', latex: `\\lim_{${varName}\\to ${pt.latex}^-} = ${d(nl.left)}, \\quad \\lim_{${varName}\\to ${pt.latex}^+} = ${d(nl.right)}` });
    } else {
        steps.push({ title: '函数值在趋近过程中不收敛（振荡或无界且无确定符号）', latex: `\\lim_{${arrow}} \\left(${exprLatex}\\right) \\text{ 不存在}` });
    }
    return formatOutput({ resultLatex: '\\text{极限不存在}', steps, plotData: buildPlot(NaN, 'dne') });
}

// ==========================================
// 4. 方程求解器：多项式/有理方程（精确因式分解、重根、复根、增根检验）+ 超越方程（数值扫描）
// ==========================================

const hasFn = (ast, names) => { const s = JSON.stringify(ast); return names.some(n => s.includes(`"${n}"`)); };

function rootLatex(r) {
    const d = MC.describeNumber(r);
    return d.exact ? d.latex : MC.fmt(r);
}

export function solveEquation({ lhs, rhs, variable, conditionExpr }, ce) {
    const { expr: cL } = unwrapAST(lhs);
    const { expr: cR } = unwrapAST(rhs);
    const steps = [];
    const eqLatex = `${cleanMathLatex(ce.box(cL).toLatex())} = ${cleanMathLatex(ce.box(cR).toLatex())}`;
    steps.push({ title: '确定待求解方程', latex: eqLatex });

    const fL = buildMathFunction(cL, variable, ce);
    const fR = buildMathFunction(cR, variable, ce);
    const Lr = MC.ratFromAst(cL, variable), Rr = MC.ratFromAst(cR, variable);

    let valid = [], discarded = [], complex = [], special = null, mode = 'numeric', quadExact = null, scanNote = null;

    if (Lr && Rr) {
        mode = 'poly';
        const numer = MC.pSub(MC.pMul(Lr.n, Rr.d), MC.pMul(Rr.n, Lr.d));
        const denom = MC.pMul(Lr.d, Rr.d);
        const hasDen = MC.pDeg(denom) >= 1;
        if (hasDen) {
            const dr = MC.polyRoots(denom).roots.filter(r => r.im === 0);
            steps.push({
                title: '提取分式方程定义域限制（分母非零）',
                latex: `\\text{限制条件: } ${dr.length ? dr.map(r => `${variable} \\ne ${rootLatex(r.re)}`).join(', \\quad ') : '\\text{分母恒不为零}'}`
            });
        }
        if (MC.pDeg(numer) < 0) special = 'identity';
        else if (MC.pDeg(numer) === 0) special = 'none';
        else {
            const deg = MC.pDeg(numer);
            steps.push({
                title: hasDen ? '去分母，转化为整式方程' : '移项并整理为一般形式 F(x) = 0',
                latex: `${MC.polyLatex(numer, variable)} = 0`
            });
            if (deg === 2) {
                const [c, b, a] = numer;
                const delta = b * b - 4 * a * c;
                steps.push({
                    title: '计算一元二次方程判别式 \\Delta = b^2 - 4ac',
                    latex: `\\Delta = (${MC.fmt(b)})^2 - 4(${MC.fmt(a)})(${MC.fmt(c)}) = ${MC.fmt(delta)}`
                });
                const isInt = (t) => Math.abs(t - Math.round(t)) < 1e-9;
                if (delta > 1e-9 && isInt(a) && isInt(b) && isInt(delta) && !isInt(Math.sqrt(delta))) {
                    // 化简根式：Δ = k²·m
                    let k = 1, m = Math.round(delta);
                    for (let f = 2; f * f <= m; f++) while (m % (f * f) === 0) { m /= f * f; k *= f; }
                    let p = -b, q = k, d = 2 * a;
                    const g = MC.gcdInt(MC.gcdInt(p, q), d);
                    p /= g; q /= g; d /= g;
                    if (d < 0) { d = -d; p = -p; /* ± 号对称，无需翻转 q */ }
                    const rad = `${q === 1 ? '' : q}\\sqrt{${m}}`;
                    const numTex = p === 0 ? `\\pm ${rad}` : `${p} \\pm ${rad}`;
                    quadExact = `${variable} = ${d === 1 ? numTex : `\\frac{${numTex}}{${d}}`}`;
                }
            }
            const pr = MC.polyRoots(numer);
            if (deg >= 2) {
                const fac = MC.factorReal(numer);
                steps.push({
                    title: deg > 2 ? '尝试有理根定理，并对剩余因子数值求根，在实数域内因式分解' : '在实数域内因式分解',
                    latex: `${MC.factorLatex(fac, variable)} = 0`
                });
            }
            pr.roots.forEach(r => {
                if (r.im === 0) {
                    const bad = hasDen && Math.abs(MC.pEval(denom, r.re)) < 1e-8 * (1 + Math.abs(r.re) ** MC.pDeg(denom));
                    (bad ? discarded : valid).push(bad ? { val: r.re, reason: '分母为 0' } : { val: r.re, mult: r.mult });
                } else if (r.im > 0) complex.push(r);
            });
            const repeated = valid.filter(v => v.mult > 1);
            if (repeated.length) {
                steps.push({ title: '存在重根', latex: repeated.map(v => `${variable} = ${rootLatex(v.val)} \\;(\\text{${v.mult} 重})`).join(', \\quad ') });
            }
        }
    } else {
        const F = (x) => fL(x) - fR(x);
        let scan = MC.scanRoots(F, -10, 10, 8000);
        let range = '[-10, 10]';
        if (scan.roots.length === 0) { scan = MC.scanRoots(F, -100, 100, 20000); range = '[-100, 100]'; }
        valid = scan.roots.map(r => ({ val: r, mult: 1 }));
        const periodic = hasFn(cL, ['Sin', 'Cos', 'Tan', 'Cot', 'Sec', 'Csc']) || hasFn(cR, ['Sin', 'Cos', 'Tan', 'Cot', 'Sec', 'Csc']);
        scanNote = range;
        steps.push({
            title: '方程含超越函数或根式，无法化为多项式，改用符号分析 + 数值扫描（符号变化检测 + 二分法）',
            latex: `F(${variable}) = ${cleanMathLatex(ce.box(['Subtract', cL, cR]).toLatex())} = 0, \\quad ${variable} \\in ${range}`
        });
        if (periodic) steps.push({ title: '三角方程有无穷多组解，此处仅列出扫描区间内的实根', latex: `\\text{周期函数：解集 = 区间内各解 } + \\text{ 整数个周期}` });
    }

    // 组装结果：实根按从小到大排列
    valid.sort((p, q) => p.val - q.val);
    let resultLatex;
    const showRoots = valid.slice(0, 12);
    if (special === 'identity') resultLatex = `\\text{恒成立（定义域内任意 } ${variable}\\text{）}`;
    else if (special === 'none') resultLatex = '\\text{无解}';
    else if (valid.length === 0) {
        resultLatex = mode === 'poly' ? '\\text{无实数解}' : `\\text{在 ${scanNote} 内未找到实根}`;
        if (complex.length) resultLatex += `;\\; \\text{复数根: } ${complex.map(c => `${variable} = ${MC.fmt(c.re)} \\pm ${MC.fmt(c.im)}i`).join(', ')}`;
    } else if (quadExact && valid.length === 2 && valid.every(v => v.mult === 1)) {
        resultLatex = `${quadExact} \\approx ${valid.map(v => MC.fmt(v.val)).join(',\\; ')}`;
    } else {
        resultLatex = showRoots.map((v, i) => `${variable}${showRoots.length === 1 ? '' : `_{${i + 1}}`} = ${rootLatex(v.val)}`).join(', \\quad ')
            + (valid.length > 12 ? ', \\ldots' : '');
    }
    if (discarded.length) {
        steps.push({
            title: '代入原方程检验，排除增根',
            latex: `\\text{检验结果: } ${discarded.map(d => `${variable} = ${rootLatex(d.val)} \\; (\\text{${d.reason}，舍去})`).join(', \\quad ')}`
        });
    }
    if (complex.length && valid.length) {
        steps.push({ title: '另有共轭复数根（实数范围内不计）', latex: complex.map(c => `${variable} = ${MC.fmt(c.re)} \\pm ${MC.fmt(c.im)}i`).join(', \\quad ') });
    }
    steps.push({ title: '得到方程的解', latex: resultLatex });

    const rootPoints = valid.map(v => ({
        layerId: 'lhs', x: v.val, y: fL(v.val),
        label: `实根 (${rootLatex(v.val)})`, name: '方程实根', latex: `\\left(${rootLatex(v.val)}, ${rootLatex(fL(v.val))}\\right)`, style: 'solid', color: '#22c55e'
    }));
    const discardedPoints = discarded.map(d => ({
        layerId: 'lhs', x: d.val, y: 0, label: `增根 (${rootLatex(d.val)}): ${d.reason}`, name: '舍去增根',
        latex: `${variable} = ${rootLatex(d.val)}`, note: d.reason, style: 'hollow', color: '#ef4444'
    }));
    const plotData = {
        layers: [
            { id: 'lhs', label: 'LHS', name: '左侧 LHS', latex: `\\text{LHS} = ${cleanMathLatex(ce.box(cL).toLatex())}`, color: '#38bdf8', visible: true, fn: fL },
            { id: 'rhs', label: 'RHS', name: '右侧 RHS', latex: `\\text{RHS} = ${cleanMathLatex(ce.box(cR).toLatex())}`, color: '#f43f5e', dash: [4, 4], visible: true, fn: fR }
        ],
        points: [...rootPoints.filter(p => isFinite(p.y)), ...discardedPoints]
    };
    return formatOutput({ resultLatex, steps, plotData });
}

// ==========================================
// 4.1 不等式：符号区间法
// ==========================================

const REL_MAP = { Less: '<', LessEqual: '<=', Greater: '>', GreaterEqual: '>=' };
const REL_TEX = { '<': '<', '<=': '\\le', '>': '>', '>=': '\\ge' };

export function solveInequality({ lhs, rhs, rel }, ce) {
    const relation = REL_MAP[rel] || rel;
    const { expr: cL } = unwrapAST(lhs);
    const { expr: cR } = unwrapAST(rhs);
    const free = [...new Set([...MC.freeSymbols(cL), ...MC.freeSymbols(cR)])];
    const v = free.includes('x') ? 'x' : (free[0] || 'x');
    const steps = [];
    steps.push({ title: '确定待求解不等式', latex: `${cleanMathLatex(ce.box(cL).toLatex())} ${REL_TEX[relation]} ${cleanMathLatex(ce.box(cR).toLatex())}` });

    const fL = buildMathFunction(cL, v, ce), fR = buildMathFunction(cR, v, ce);
    const F = (x) => fL(x) - fR(x);
    const Lr = MC.ratFromAst(cL, v), Rr = MC.ratFromAst(cR, v);
    let roots = [], poles = [], edges = [], window = null;

    steps.push({ title: '移项，使一侧为 0，记 F(x) = 左 − 右', latex: `F(${v}) = ${cleanMathLatex(ce.box(['Subtract', cL, cR]).toLatex())} ${REL_TEX[relation]} 0` });

    if (Lr && Rr) {
        const numer = MC.pSub(MC.pMul(Lr.n, Rr.d), MC.pMul(Rr.n, Lr.d));
        const denom = MC.pMul(Lr.d, Rr.d);
        if (MC.pDeg(numer) >= 1) roots = MC.polyRoots(numer).roots.filter(r => r.im === 0).map(r => r.re);
        if (MC.pDeg(denom) >= 1) poles = MC.polyRoots(denom).roots.filter(r => r.im === 0).map(r => r.re);
            roots = roots.filter(r => !poles.some(p => Math.abs(p - r) < 1e-9));
        steps.push({
            title: '求临界点：F 的零点（分子）与不可取点（分母为 0）',
            latex: `\\text{零点: } ${roots.length ? roots.map(r => `${v} = ${rootLatex(r)}`).join(', ') : '\\text{无}'}; \\quad \\text{分母为 0: } ${poles.length ? poles.map(r => `${v} = ${rootLatex(r)}`).join(', ') : '\\text{无}'}`
        });
    } else {
        const sc = MC.scanRoots(F, -10, 10, 8000);
        roots = sc.roots; poles = sc.poles; edges = sc.edges; window = { lo: -10, hi: 10 };
        steps.push({
            title: '含超越函数/根式：数值扫描临界点（区间 [-10, 10]）',
            latex: `\\text{零点: } ${roots.slice(0, 8).map(r => rootLatex(r)).join(', ') || '\\text{无}'}`
        });
    }

    const segs = MC.solveSignIntervals(F, relation, roots, poles, edges, window);
    // 符号表
    const crit = [...roots, ...poles, ...edges].sort((a, b) => a - b).filter((x, i, a) => i === 0 || Math.abs(x - a[i - 1]) > 1e-7);
    const bnds = window ? [window.lo, ...crit.filter(x => x > window.lo && x < window.hi), window.hi] : [-Infinity, ...crit, Infinity];
    const rows = [];
    for (let i = 0; i < bnds.length - 1; i++) {
        const l = bnds[i], r = bnds[i + 1];
        const s = l === -Infinity ? (r === Infinity ? 0 : r - 1 - Math.abs(r)) : (r === Infinity ? l + 1 + Math.abs(l) : (l + r) / 2);
        const val = F(s);
        rows.push(`(${l === -Infinity ? '-\\infty' : rootLatex(l)}, ${r === Infinity ? '+\\infty' : rootLatex(r)}) & ${isFinite(val) ? (val > 0 ? 'F > 0' : 'F < 0') : '\\text{无定义}'}`);
    }
    steps.push({ title: '在每个区间取试探点判断 F 的符号', latex: `\\begin{aligned} ${rows.join(' \\\\ ')} \\end{aligned}` });

    const setLatex = MC.intervalsLatex(segs);
    const resultLatex = `${v} \\in ${setLatex}${window ? ' \\quad (\\text{在 } [-10,10] \\text{ 内})' : ''}`;
    steps.push({ title: '取满足不等式的区间并合并', latex: resultLatex });

    const FIN = (x) => { const y = F(x); return isFinite(y) ? y : NaN; };
    const plotData = {
        layers: [
            { id: 'F', label: 'F(x)', name: 'F(x) = 左 − 右', latex: `F(${v}) = ${cleanMathLatex(ce.box(['Subtract', cL, cR]).toLatex())}`, color: '#38bdf8', visible: true, fn: FIN },
            { id: 'zero', label: 'y = 0', name: '零线', latex: 'y = 0', color: '#94a3b8', dash: [3, 5], visible: true, fn: () => 0 }
        ],
        areas: segs.filter(s => !s.point).map(s => ({
            layerId: 'F', from: Math.max(s.l, -60), to: Math.min(s.r, 60), topFn: (x) => Math.max(-30, Math.min(30, F(x) || 0)), bottomFn: () => 0, color: 'rgba(34,197,94,0.22)'
        })),
        points: [
            ...roots.map(r => ({ layerId: 'F', x: r, y: 0, label: `零点 ${rootLatex(r)}`, name: '零点', latex: `${v} = ${rootLatex(r)}`, style: relation.includes('=') ? 'solid' : 'hollow', color: '#22c55e' })),
            ...poles.map(r => ({ layerId: 'F', x: r, y: 0, label: `不可取点 ${rootLatex(r)}`, name: '不可取点', latex: `${v} = ${rootLatex(r)}`, style: 'hollow', color: '#ef4444' }))
        ]
    };
    return formatOutput({ resultLatex, steps, plotData });
}

// ==========================================
// 4.2 方程组（线性：高斯-若尔当；非线性：多起点牛顿法）
// ==========================================

function implicitBranches(F) {
    const samples = [-3, -1.3, 0.7, 2.2, 4.1];
    let linearOnly = true;
    for (const x of samples) {
        const f0 = F(x, 0), f1 = F(x, 1), fm = F(x, -1), f2 = F(x, 2), f3 = F(x, 3);
        if (![f0, f1, fm, f2, f3].every(isFinite)) return null;
        const c0 = f0, c2 = (f1 + fm) / 2 - f0, c1 = (f1 - fm) / 2;
        if (Math.abs(f2 - (c0 + 2 * c1 + 4 * c2)) > 1e-6 * (1 + Math.abs(f2))) return null;
        if (Math.abs(f3 - (c0 + 3 * c1 + 9 * c2)) > 1e-6 * (1 + Math.abs(f3))) return null;
        if (Math.abs(c2) > 1e-9) linearOnly = false;
    }
    const coef = (x) => { const f0 = F(x, 0), f1 = F(x, 1), fm = F(x, -1); return [f0, (f1 - fm) / 2, (f1 + fm) / 2 - f0]; };
    const sol = (x, sgn) => {
        const [c0, c1, c2] = coef(x);
        if (Math.abs(c2) < 1e-12) return Math.abs(c1) < 1e-12 ? NaN : -c0 / c1;
        const d = c1 * c1 - 4 * c2 * c0;
        return d < 0 ? NaN : (-c1 + sgn * Math.sqrt(d)) / (2 * c2);
    };
    return linearOnly ? [(x) => sol(x, 1)] : [(x) => sol(x, 1), (x) => sol(x, -1)];
}

function newtonSystem(Fs, n) {
    const found = [];
    const grid = n === 1 ? [-5, -2, 0, 2, 5] : n === 2 ? [-6, -3, -1, 0, 1, 3, 6] : [-3, 0, 3];
    const starts = [[]];
    for (let i = 0; i < n; i++) { const next = []; starts.forEach(s => grid.forEach(g => next.push([...s, g + 0.137 * (i + 1)]))); starts.splice(0, starts.length, ...next); }
    for (const s0 of starts) {
        let x = s0.slice();
        let ok = false;
        for (let it = 0; it < 60; it++) {
            const fx = Fs.map(f => f(...x));
            if (fx.some(v => !isFinite(v))) break;
            if (Math.max(...fx.map(Math.abs)) < 1e-11) { ok = true; break; }
            const J = Fs.map(f => x.map((_, j) => { const h = 1e-6 * (1 + Math.abs(x[j])); const xp = x.slice(); xp[j] += h; return (f(...xp) - f(...x)) / h; }));
            const d = MC.solveLinearSystem(J, fx.map(v => -v));
            if (!d) break;
            x = x.map((v, i) => v + d[i]);
            if (x.some(v => Math.abs(v) > 1e6)) break;
        }
        if (ok && !found.some(f => f.every((v, i) => Math.abs(v - x[i]) < 1e-6))) found.push(x.map(v => (Math.abs(v) < 1e-12 ? 0 : v)));
    }
    return found;
}

export function solveEquationSystem({ equations }, ce) {
    const eqs = equations.map(e => ({ l: unwrapAST(e[1]).expr, r: unwrapAST(e[2]).expr }));
    const diffs = eqs.map(e => ['Subtract', e.l, e.r]);
    const varSet = new Set();
    diffs.forEach(d => MC.freeSymbols(d, varSet));
    const vars = [...varSet].sort((a, b) => (a === 'x' ? -1 : b === 'x' ? 1 : a.localeCompare(b)));
    const steps = [];
    steps.push({
        title: '确定方程组',
        latex: `\\begin{cases} ${eqs.map(e => `${cleanMathLatex(ce.box(e.l).toLatex())} = ${cleanMathLatex(ce.box(e.r).toLatex())}`).join(' \\\\ ')} \\end{cases}`
    });
    if (vars.length === 0) return formatOutput({ resultLatex: '\\text{方程组中没有未知数}', steps, plotData: null });

    const forms = diffs.map(d => MC.linearForm(d, vars));
    let solutionPoints = [], resultLatex;

    if (forms.every(f => f)) {
        const aug = forms.map(f => [...vars.map(v => f.coef[v] || 0), -f.c]);
        const mat = `\\left[\\begin{array}{${'c'.repeat(vars.length)}|c} ${aug.map(r => r.map(MC.fmt).join(' & ')).join(' \\\\ ')} \\end{array}\\right]`;
        steps.push({ title: `整理为线性方程组，写出增广矩阵（未知数顺序 ${vars.join(', ')}）`, latex: mat });
        const gj = MC.gaussJordan(aug, vars.length);
        steps.push({
            title: '高斯-若尔当消元，化为行最简形',
            latex: `\\left[\\begin{array}{${'c'.repeat(vars.length)}|c} ${gj.rref.map(r => r.map(MC.fmt).join(' & ')).join(' \\\\ ')} \\end{array}\\right]`
        });
        if (gj.type === 'unique') {
            resultLatex = vars.map((v, i) => `${v} = ${rootLatex(gj.solution[i])}`).join(', \\quad ');
            solutionPoints = [gj.solution];
        } else if (gj.type === 'none') {
            resultLatex = '\\text{方程组无解（方程之间矛盾）}';
        } else {
            const free = vars.filter((_, i) => !gj.pivots.includes(i));
            const lines = gj.pivots.map((pc, row) => {
                const terms = free.map(fv => { const c = -gj.rref[row][vars.indexOf(fv)]; return Math.abs(c) < 1e-10 ? '' : `${c > 0 ? '+' : '-'} ${Math.abs(c) === 1 ? '' : MC.fmt(Math.abs(c))}${fv}`; }).join(' ');
                return `${vars[pc]} = ${MC.fmt(gj.rref[row][vars.length])} ${terms}`;
            });
            resultLatex = `\\text{无穷多解: } ${lines.join(', \\; ')}, \\; ${free.join(', ')} \\in \\mathbb{R}`;
        }
    } else {
        if (vars.length !== eqs.length || vars.length > 3) {
            return formatOutput({ resultLatex: '\\text{非线性方程组仅支持方程数与未知数个数相同（至多 3 个）}', steps, plotData: null });
        }
        const Fs = diffs.map(d => MC.compileAST(d, vars));
        steps.push({ title: '含非线性项：采用多起点牛顿法（数值雅可比矩阵）搜索实数解', latex: `\\mathbf{x}_{k+1} = \\mathbf{x}_k - J^{-1}(\\mathbf{x}_k)\\,\\mathbf{F}(\\mathbf{x}_k)` });
        solutionPoints = newtonSystem(Fs, vars.length);
        resultLatex = solutionPoints.length
            ? solutionPoints.map((s, k) => `\\left(${s.map(rootLatex).join(', ')}\\right)${solutionPoints.length > 1 ? `_{${k + 1}}` : ''}`).join(', \\; ')
            : '\\text{未找到实数解}';
        if (solutionPoints.length) resultLatex = `(${vars.join(', ')}) = ` + resultLatex;
    }
    steps.push({ title: '得到方程组的解', latex: resultLatex });

    let plotData = null;
    if (vars.length === 2) {
        const colors = ['#38bdf8', '#f97316', '#a855f7', '#22c55e'];
        const layers = [];
        diffs.forEach((d, i) => {
            try {
                const F2 = MC.compileAST(d, vars);
                const br = implicitBranches(F2);
                if (br) br.forEach((f, k) => layers.push({ id: `eq${i}_${k}`, label: `方程 ${i + 1}`, name: `方程 ${i + 1}`, latex: `${cleanMathLatex(ce.box(eqs[i].l).toLatex())} = ${cleanMathLatex(ce.box(eqs[i].r).toLatex())}`, color: colors[i % 4], visible: true, fn: f }));
            } catch (e) { }
        });
        plotData = {
            layers,
            points: solutionPoints.map(s => ({ x: s[0], y: s[1], label: `解 (${rootLatex(s[0])}, ${rootLatex(s[1])})`, name: '方程组的解', latex: `\\left(${rootLatex(s[0])}, ${rootLatex(s[1])}\\right)`, style: 'solid', color: '#22c55e' }))
        };
    }
    return formatOutput({ resultLatex, steps, plotData });
}

// ==========================================
// 4.3 隐函数曲线 F(x, y) = 0（含二次曲线识别）
// ==========================================

export function solveImplicitCurve({ lhs, rhs, vars }, ce) {
    const { expr: cL } = unwrapAST(lhs), { expr: cR } = unwrapAST(rhs);
    const [vx, vy] = vars;
    const steps = [];
    const eqTex = `${cleanMathLatex(ce.box(cL).toLatex())} = ${cleanMathLatex(ce.box(cR).toLatex())}`;
    steps.push({ title: `识别为含两个变量 ${vx}, ${vy} 的二元方程（平面曲线）`, latex: eqTex });
    const F2 = MC.compileAST(['Subtract', cL, cR], [vx, vy]);

    // 二次曲线拟合：A x² + B xy + C y² + D x + E y + F0
    const basis = (x, y) => [x * x, x * y, y * y, x, y, 1];
    const pts = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]];
    const co = MC.solveLinearSystem(pts.map(p => basis(...p)), pts.map(p => F2(...p)));
    let isConic = false;
    if (co) {
        isConic = [[2, 1], [-2, 3], [1.5, -2.5], [3, 2], [-1.7, 0.6]].every(p => {
            const approx = basis(...p).reduce((s, b, i) => s + b * co[i], 0);
            return Math.abs(approx - F2(...p)) < 1e-7 * (1 + Math.abs(approx));
        });
    }
    let resultLatex = eqTex;
    if (isConic) {
        const [A, B, C, D, E, G] = co;
        const disc = B * B - 4 * A * C;
        steps.push({ title: '拟合为二次曲线 Ax² + Bxy + Cy² + Dx + Ey + F = 0', latex: `A=${MC.fmt(A)},\\; B=${MC.fmt(B)},\\; C=${MC.fmt(C)},\\; D=${MC.fmt(D)},\\; E=${MC.fmt(E)},\\; F=${MC.fmt(G)}` });
        let kind = disc < -1e-9 ? '椭圆（或圆、点、空集）' : (Math.abs(disc) <= 1e-9 ? '抛物线（或退化为直线）' : '双曲线（或一对相交直线）');
        steps.push({ title: `判别式 B^2 - 4AC = ${MC.fmt(disc)}，曲线类型：${kind}`, latex: `B^2 - 4AC = ${MC.fmt(disc)}` });
        if (Math.abs(B) < 1e-9 && Math.abs(A - C) < 1e-9 && Math.abs(A) > 1e-9) {
            const cx = -D / (2 * A), cy = -E / (2 * A), r2 = cx * cx + cy * cy - G / A;
            if (r2 > 1e-9) {
                steps.push({ title: '配方得圆的标准方程', latex: `(${vx} ${cx >= 0 ? '-' : '+'} ${MC.fmt(Math.abs(cx))})^2 + (${vy} ${cy >= 0 ? '-' : '+'} ${MC.fmt(Math.abs(cy))})^2 = ${MC.fmt(r2)}` });
                resultLatex = `\\text{圆: 圆心 } (${MC.fmt(cx)}, ${MC.fmt(cy)}),\\; \\text{半径 } ${MC.recognize(Math.sqrt(r2))?.latex || MC.fmt(Math.sqrt(r2))}`;
            }
        }
    }
    const br = implicitBranches(F2);
    steps.push({ title: br ? `关于 ${vy} 解出显函数分支并绘图` : '该曲线无法按 y = f(x) 分支绘制', latex: br ? `${vy} = f_{\\pm}(${vx})` : '\\text{(仅给出方程)}' });
    const layers = (br || []).map((f, i) => ({ id: `b${i}`, label: `分支 ${i + 1}`, name: `分支 ${i + 1}`, latex: `${vy} = f_{${i + 1}}(${vx})`, color: i ? '#f97316' : '#38bdf8', visible: true, fn: f }));
    return formatOutput({ resultLatex, steps, plotData: { layers, points: [] } });
}

// ==========================================
// 5. 显函数定义与几何特征分析器 (y = f(x))
// ==========================================

export function solveFunctionDeclaration({ name, expr, conditionExpr }, ce) {
    const { expr: cleanExpr } = unwrapAST(expr);
    const free = [...MC.freeSymbols(cleanExpr)];
    const v = free.includes('x') ? 'x' : (free[0] || 'x');
    const fn = buildMathFunction(cleanExpr, v, ce);
    const exprBox = ce.box(cleanExpr);
    const exprLatex = cleanMathLatex(exprBox.toLatex());
    const steps = [];
    const points = [];

    steps.push({ title: '识别为显函数表达式', latex: `y = f(${v}) = ${exprLatex}` });

    // 定义域
    const scan = MC.scanRoots(fn, -10, 10, 6000);
    if (scan.poles.length || scan.edges.length) {
        steps.push({
            title: '定义域分析：存在间断点或定义域边界',
            latex: `${scan.poles.length ? `\\text{竖直渐近线: } ${scan.poles.map(p => `${v} = ${rootLatex(p)}`).join(', ')}` : ''}${scan.poles.length && scan.edges.length ? ';\\; ' : ''}${scan.edges.length ? `\\text{定义域边界: } ${scan.edges.map(p => `${v} = ${rootLatex(p)}`).join(', ')}` : ''}`
        });
    }

    const y0 = fn(0);
    if (isFinite(y0)) {
        points.push({ layerId: 'f', x: 0, y: y0, label: `Y轴截距 (0, ${rootLatex(y0)})`, name: 'Y轴截距', latex: `\\left(0, ${rootLatex(y0)}\\right)`, style: 'solid', color: '#38bdf8' });
        steps.push({ title: '计算 Y 轴截距', latex: `${v} = 0 \\implies y = ${rootLatex(y0)}` });
    }
    if (scan.roots.length) {
        scan.roots.slice(0, 8).forEach(r => points.push({ layerId: 'f', x: r, y: 0, label: `零点 (${rootLatex(r)}, 0)`, name: 'X轴交点', latex: `\\left(${rootLatex(r)}, 0\\right)`, style: 'solid', color: '#22c55e' }));
        steps.push({ title: '求与 X 轴的交点（f = 0）', latex: scan.roots.slice(0, 8).map(r => `${v} = ${rootLatex(r)}`).join(', \\quad ') });
    }

    let df = null;
    try { df = differentiateNode(cleanExpr, v, ce, null).simplify(); } catch (e) { }
    if (df) {
        steps.push({ title: '求导获取函数变化趋势与驻点条件', latex: `f'(${v}) = ${cleanMathLatex(df.toLatex())}` });
        const dfn = buildMathFunction(df.json, v, ce);
        const crit = MC.scanRoots(dfn, -10, 10, 6000).roots;
        const lines = [];
        crit.slice(0, 8).forEach(r => {
            const ry = fn(r);
            if (!isFinite(ry)) return;
            const h = 1e-3;
            const left = dfn(r - h), right = dfn(r + h);
            const kind = left > 0 && right < 0 ? '极大值' : (left < 0 && right > 0 ? '极小值' : '驻点（非极值）');
            points.push({ layerId: 'f', x: r, y: ry, label: `${kind} (${rootLatex(r)}, ${rootLatex(ry)})`, name: kind, latex: `\\left(${rootLatex(r)}, ${rootLatex(ry)}\\right)`, style: 'solid', color: kind === '极大值' ? '#ef4444' : (kind === '极小值' ? '#eab308' : '#94a3b8') });
            lines.push(`${v} = ${rootLatex(r)}: \\; ${kind}\\; f = ${rootLatex(ry)}`);
        });
        if (lines.length) steps.push({ title: '令 f\'(x) = 0 求驻点，并由导数符号变化判断极值', latex: lines.join(', \\quad ') });
    }

    // 水平渐近线
    const pInf = MC.numericLimit(fn, Infinity), nInf = MC.numericLimit(fn, -Infinity);
    const asym = [];
    if (pInf.kind === 'finite') asym.push(`y = ${rootLatex(pInf.value)} \\; (${v}\\to+\\infty)`);
    if (nInf.kind === 'finite') asym.push(`y = ${rootLatex(nInf.value)} \\; (${v}\\to-\\infty)`);
    if (asym.length) steps.push({ title: '考察无穷远处行为，得水平渐近线', latex: asym.join(', \\quad ') });

    const plotData = {
        layers: [{ id: 'f', label: `f(${v}) = ${exprLatex}`, name: `函数 f(${v})`, latex: `f(${v}) = ${exprLatex}`, color: '#38bdf8', visible: true, fn }],
        points: points.filter(p => isFinite(p.y))
    };
    return formatOutput({ resultLatex: `y = ${exprLatex}`, steps, plotData });
}

// ==========================================
// 6. 常微分方程：一阶线性 / 可分离变量 / 二阶常系数线性 / 数值积分曲线
// ==========================================

function odeIsDep(a, dep) {
    const u = unwrapAST(a).expr;
    return u === dep || (Array.isArray(u) && u.length === 2 && u[0] === dep) || (Array.isArray(u) && u[0] === 'Apply' && u[1] === dep);
}

function odeNorm(node, dep) {
    const n = unwrapAST(node).expr;
    if (typeof n === 'string') return n === dep ? 'Y' : n;
    if (!Array.isArray(n)) return n;
    const [op, ...args] = n;
    if (op === 'Prime' && odeIsDep(args[0], dep)) { const k = typeof args[1] === 'number' ? args[1] : 1; return k === 1 ? 'Yp' : (k === 2 ? 'Ypp' : 'Y3'); }
    if ((op === 'Derivative' || op === 'D') && odeIsDep(args[0], dep)) { const k = typeof args[2] === 'number' ? args[2] : (op === 'Derivative' && typeof args[1] === 'number' ? args[1] : 1); return k === 1 ? 'Yp' : (k === 2 ? 'Ypp' : 'Y3'); }
    if (op === 'Divide' && args[0] === 'dy' && args[1] === 'dx') return 'Yp';
    if (odeIsDep(n, dep)) return 'Y';
    return [op, ...args.map(a => odeNorm(a, dep))];
}

function odeFindDep(node) {
    const n = unwrapAST(node).expr;
    if (!Array.isArray(n)) return null;
    if (['Prime', 'Derivative', 'D'].includes(n[0])) { const a = unwrapAST(n[1]).expr; if (typeof a === 'string') return a; if (Array.isArray(a) && typeof a[0] === 'string') return a[0]; }
    for (const c of n.slice(1)) { const r = odeFindDep(c); if (r) return r; }
    return null;
}

function parseInitialConditions(cond, dep) {
    const out = [];
    const walk = (c) => {
        const n = unwrapAST(c).expr;
        if (!Array.isArray(n)) return;
        if (n[0] === 'Equal') {
            const l = unwrapAST(n[1]).expr;
            if (Array.isArray(l) && (l[0] === dep || l[0] === 'Apply') && !['Prime'].includes(l[0])) {
                const x0 = constValue(l[l.length - 1]), y0 = constValue(n[2]);
                if (x0 !== null && y0 !== null) out.push({ x0, y0, order: 0 });
            } else if (Array.isArray(l) && l[0] === 'Prime') {
                const inner = l[1], x0 = Array.isArray(inner) ? constValue(inner[inner.length - 1]) : null, y0 = constValue(n[2]);
                if (x0 !== null && y0 !== null) out.push({ x0, y0, order: 1 });
            }
        } else n.slice(1).forEach(walk);
    };
    if (cond) walk(cond);
    return out;
}

function makeODECurve(G, x0, y0, lim = 30, h = 0.01) {
    const n = Math.round(lim / h);
    const run = (dir) => {
        const arr = new Array(n + 1); arr[0] = y0;
        let y = y0, dead = false;
        for (let i = 1; i <= n; i++) {
            if (dead) { arr[i] = NaN; continue; }
            const x = x0 + dir * (i - 1) * h, s = dir * h;
            const k1 = G(x, y), k2 = G(x + s / 2, y + s * k1 / 2), k3 = G(x + s / 2, y + s * k2 / 2), k4 = G(x + s, y + s * k3);
            y = y + s * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
            if (!isFinite(y) || Math.abs(y) > 1e6) { dead = true; arr[i] = NaN; } else arr[i] = y;
        }
        return arr;
    };
    const fw = run(1), bw = run(-1);
    return (x) => {
        const t = (x - x0) / h, arr = t >= 0 ? fw : bw, a = Math.abs(t);
        if (a > n) return NaN;
        const i = Math.floor(a), f = a - i;
        const y1 = arr[i], y2 = arr[Math.min(i + 1, n)];
        return y1 + f * (y2 - y1);
    };
}

function makeODE2Curve(G2, x0, y0, v0, lim = 30, h = 0.01) {
    const n = Math.round(lim / h);
    const run = (dir) => {
        const arr = new Array(n + 1); arr[0] = y0;
        let y = y0, v = v0, dead = false;
        for (let i = 1; i <= n; i++) {
            if (dead) { arr[i] = NaN; continue; }
            const x = x0 + dir * (i - 1) * h, s = dir * h;
            const f = (xx, yy, vv) => [vv, G2(xx, yy, vv)];
            const a = f(x, y, v), b = f(x + s / 2, y + s * a[0] / 2, v + s * a[1] / 2), c = f(x + s / 2, y + s * b[0] / 2, v + s * b[1] / 2), d = f(x + s, y + s * c[0], v + s * c[1]);
            y += s * (a[0] + 2 * b[0] + 2 * c[0] + d[0]) / 6; v += s * (a[1] + 2 * b[1] + 2 * c[1] + d[1]) / 6;
            if (!isFinite(y) || Math.abs(y) > 1e6) { dead = true; arr[i] = NaN; } else arr[i] = y;
        }
        return arr;
    };
    const fw = run(1), bw = run(-1);
    return (x) => { const t = (x - x0) / h, arr = t >= 0 ? fw : bw, a = Math.abs(t); if (a > n) return NaN; const i = Math.floor(a), f = a - i; return arr[i] + f * (arr[Math.min(i + 1, n)] - arr[i]); };
}

export function solveODE({ lhs, rhs, conditionExpr }, ce) {
    const dep = odeFindDep(['L', lhs, rhs]) || 'y';
    const whole = JSON.stringify([lhs, rhs]);
    const ind = (!whole.includes('"x"') && whole.includes('"t"')) ? 't' : 'x';
    const steps = [];
    const F = ['Subtract', odeNorm(lhs, dep), odeNorm(rhs, dep)];
    const eqTex = `${cleanMathLatex(ce.box(lhs).toLatex())} = ${cleanMathLatex(ce.box(rhs).toLatex())}`;
    steps.push({ title: '确定待求解常微分方程', latex: eqTex });
    const has = (ast, s) => MC.containsSymbol(ast, s);
    const part = (sym) => differentiateNode(F, sym, ce, null).simplify();
    const sub0 = (ast, names) => names.reduce((a, n) => substituteVariable(a, n, 0), ast);
    const ics = parseInitialConditions(conditionExpr, dep);

    // ===== 二阶 =====
    if (has(F, 'Ypp')) {
        const a2 = part('Ypp'), a1 = part('Yp'), a0 = part('Y');
        const v2 = constValue(a2.json), v1 = constValue(a1.json), v0 = constValue(a0.json);
        const rest = ce.box(sub0(F, ['Ypp', 'Yp', 'Y'])).simplify();
        steps.push({ title: '识别为二阶线性常微分方程', latex: `${cleanMathLatex(a2.toLatex())}\\,y'' + \\left(${cleanMathLatex(a1.toLatex())}\\right)y' + \\left(${cleanMathLatex(a0.toLatex())}\\right)y = ${cleanMathLatex(ce.box(['Negate', rest.json]).simplify().toLatex())}` });
        const restC = constValue(rest.json);
        if (v2 && v1 !== null && v0 !== null && (restC !== null)) {
            const charPoly = [v0, v1, v2];
            steps.push({ title: '常系数线性方程：写出特征方程 a r^2 + b r + c = 0', latex: `${MC.polyLatex(charPoly, 'r')} = 0` });
            const rr = MC.polyRoots(charPoly).roots;
            let homog, desc;
            if (rr.length === 1) {
                const r = rr[0].re;
                homog = ['Multiply', ['Exp', ['Multiply', MC.numAst(r), ind]], ['Add', 'C1', ['Multiply', 'C2', ind]]];
                desc = `\\text{重根 } r = ${MC.fmt(r)} \\Rightarrow y_h = (C_1 + C_2 ${ind}) e^{${MC.fmt(r)}${ind}}`;
            } else if (rr[0].im === 0) {
                homog = ['Add', ['Multiply', 'C1', ['Exp', ['Multiply', MC.numAst(rr[0].re), ind]]], ['Multiply', 'C2', ['Exp', ['Multiply', MC.numAst(rr[1].re), ind]]]];
                desc = `r_1 = ${MC.fmt(rr[0].re)},\\; r_2 = ${MC.fmt(rr[1].re)} \\Rightarrow y_h = C_1 e^{${MC.fmt(rr[0].re)}${ind}} + C_2 e^{${MC.fmt(rr[1].re)}${ind}}`;
            } else {
                const al = rr[0].re, be = Math.abs(rr[0].im);
                const trig = ['Add', ['Multiply', 'C1', ['Cos', ['Multiply', MC.numAst(be), ind]]], ['Multiply', 'C2', ['Sin', ['Multiply', MC.numAst(be), ind]]]];
                homog = Math.abs(al) < 1e-12 ? trig : ['Multiply', ['Exp', ['Multiply', MC.numAst(al), ind]], trig];
                desc = `r = ${MC.fmt(al)} \\pm ${MC.fmt(be)}i \\Rightarrow y_h = e^{${MC.fmt(al)}${ind}}(C_1\\cos ${MC.fmt(be)}${ind} + C_2 \\sin ${MC.fmt(be)}${ind})`;
            }
            steps.push({ title: '按特征根类型写出齐次通解', latex: desc });
            let gen = homog;
            if (Math.abs(restC) > 1e-12) {
                if (Math.abs(v0) < 1e-12) return formatOutput({ resultLatex: '\\text{常数项与 } y \\text{ 系数同时为零的情形暂不支持}', steps, plotData: null });
                const yp = -restC / v0;
                steps.push({ title: '右端为常数，取常数特解', latex: `y_p = ${MC.fmt(yp)}` });
                gen = ['Add', homog, MC.numAst(yp)];
            }
            const genBox = ce.box(gen);
            const gl = cleanMathLatex(genBox.toLatex());
            steps.push({ title: '二阶线性常微分方程的通解', latex: `y(${ind}) = ${gl}` });
            let gfn = null;
            try { gfn = MC.compileAST(gen, [ind, 'C1', 'C2']); } catch (e) { }
            const combos = [[1, 0], [0, 1], [1, 1]];
            const layers = gfn ? combos.map(([c1, c2], i) => ({ id: `c${i}`, label: `C1=${c1}, C2=${c2}`, name: '积分曲线', latex: `y \\; [C_1=${c1},\\, C_2=${c2}]`, color: ['#38bdf8', '#f97316', '#a855f7'][i], dash: i ? [4, 4] : undefined, visible: true, fn: (x) => gfn(x, c1, c2) })) : [];
            return formatOutput({ resultLatex: `y = ${gl}`, steps, plotData: { layers, points: [] } });
        }
        // 变系数/非常数右端：数值积分
        steps.push({ title: '系数或右端非常数：无法符号求解，改用四阶龙格-库塔数值积分', latex: `y'' = f(${ind}, y, y')` });
        const Fn = MC.compileAST(F, [ind, 'Y', 'Yp', 'Ypp']);
        const G2 = (x, y, v) => { const f0 = Fn(x, y, v, 0), f1 = Fn(x, y, v, 1); return -f0 / (f1 - f0); };
        const ini = [[1, 0], [0, 1], [1, 1]];
        const layers = ini.map(([y0, d0], i) => ({ id: `n${i}`, label: `y(0)=${y0}, y'(0)=${d0}`, name: '数值解', latex: `y(0)=${y0},\\, y'(0)=${d0}`, color: ['#38bdf8', '#f97316', '#a855f7'][i], visible: true, fn: makeODE2Curve(G2, 0, y0, d0) }));
        return formatOutput({ resultLatex: '\\text{二阶方程：给出数值积分曲线}', steps, plotData: { layers, points: [] } });
    }

    // ===== 一阶 =====
    if (!has(F, 'Yp')) {
        return formatOutput({ resultLatex: '\\text{未识别出导数项，无法作为微分方程求解}', steps, plotData: null });
    }
    const a = part('Yp');
    if (has(a.json, 'Yp')) return formatOutput({ resultLatex: '\\text{y\' 以非线性形式出现，暂不支持}', steps, plotData: null });
    const b = part('Y');
    const linear = !has(a.json, 'Y') && !has(b.json, 'Y') && !has(b.json, 'Yp');

    if (linear) {
        const c = ce.box(sub0(F, ['Yp', 'Y'])).simplify();
        const tidy = (boxed) => {
            try {
                const R = MC.ratFromAst(boxed.json, ind);
                if (!R) return boxed;
                const red = MC.reduceRat(R);
                const nAst = MC.polyToAst(red.n, ind), dAst = MC.polyToAst(red.d, ind);
                return ce.box(MC.pDeg(red.d) === 0 ? MC.polyToAst(MC.pScale(red.n, 1 / red.d[0]), ind) : ['Divide', nAst, dAst]).simplify();
            } catch (e) { return boxed; }
        };
        const P = tidy(ce.box(['Divide', b.json, a.json]).simplify());
        const Q = tidy(ce.box(['Negate', ['Divide', c.json, a.json]]).simplify());
        steps.push({ title: "整理为一阶线性微分方程标准形式 y' + P(x)y = Q(x)", latex: `y' + \\left(${cleanMathLatex(P.toLatex())}\\right)y = ${cleanMathLatex(Q.toLatex())}` });
        const intP = integrateNode(P.json, ind, ce, null).simplify();
        steps.push({ title: '计算积分因子指数 \\int P(x)\\,dx', latex: `\\int P \\, d${ind} = ${cleanMathLatex(intP.toLatex())}` });
        steps.push({ title: '应用一阶线性常微分方程通解公式', latex: `y = e^{-\\int P dx}\\left(\\int Q\\, e^{\\int P dx}\\, dx + C\\right)` });
        const expP = ce.box(['Exp', intP.json]).simplify();
        const integrand = ce.box(['Multiply', Q.json, expP.json]).simplify();
        _integrationDepth = 0;
        const intQ = integrateNode(integrand.json, ind, ce, null).simplify();
        if (isUnevaluatedIntegral(intQ)) {
            steps.push({ title: '积分 \\int Q e^{\\int P} 无初等表达，通解保留积分形式', latex: `y = e^{-${cleanMathLatex(intP.toLatex())}}\\left(\\int ${cleanMathLatex(integrand.toLatex())} d${ind} + C\\right)` });
        }
        const expNeg = ce.box(['Exp', ['Negate', intP.json]]).simplify();
        const gen = ce.box(['Multiply', expNeg.json, ['Add', intQ.json, 'C']]).simplify();
        const gl = cleanMathLatex(gen.toLatex());
        steps.push({ title: '计算积分并整理，得微分方程通解', latex: `y(${ind}) = ${gl}` });

        let gfn = null;
        try { gfn = MC.compileAST(gen.json, [ind, 'C']); } catch (e) { }
        let resultLatex = `y = ${gl}`;
        const Cvals = [0, 1, -1];
        let specific = null;
        const icY = ics.find(i => i.order === 0);
        if (gfn && icY) {
            const f0 = gfn(icY.x0, 0), f1 = gfn(icY.x0, 1);
            if (isFinite(f0) && isFinite(f1) && Math.abs(f1 - f0) > 1e-12) {
                const Cv = (icY.y0 - f0) / (f1 - f0);
                const spec = ce.box(substituteVariable(gen.json, 'C', MC.numAst(Cv))).simplify();
                steps.push({ title: `代入初始条件 y(${MC.fmt(icY.x0)}) = ${MC.fmt(icY.y0)}，确定常数 C`, latex: `C = ${MC.fmt(Cv)}` });
                resultLatex = `y = ${cleanMathLatex(spec.toLatex())}`;
                steps.push({ title: '满足初始条件的特解', latex: resultLatex });
                specific = Cv;
            }
        }
        const list = specific !== null ? [specific, specific + 1, specific - 1] : Cvals;
        const layers = gfn ? list.map((Cv, i) => ({
            id: `c${i}`, label: `C = ${MC.fmt(Cv)}`, name: i === 0 && specific !== null ? '特解' : '积分曲线', latex: `y(${ind}) \\; [C=${MC.fmt(Cv)}]`,
            color: ['#38bdf8', '#a855f7', '#f97316'][i], dash: i ? [4, 4] : undefined, visible: true, fn: (x) => gfn(x, Cv)
        })) : [];
        return formatOutput({ resultLatex, steps, plotData: { layers, points: [] } });
    }

    // ----- 非线性：尝试可分离变量 -----
    const r = ce.box(sub0(F, ['Yp'])).simplify();
    const G = ce.box(['Negate', ['Divide', r.json, a.json]]).simplify();
    steps.push({ title: "解出 y'，写成 y' = G(x, y)", latex: `y' = ${cleanMathLatex(G.toLatex())}` });

    const Gfn = (() => { try { return MC.compileAST(G.json, [ind, 'Y']); } catch (e) { return null; } })();
    const numericLayers = () => Gfn ? [[0, 0], [0, 1], [0, -1], [0, 2]].map(([x0, y0], i) => ({ id: `n${i}`, label: `y(${x0})=${y0}`, name: '积分曲线', latex: `y(${x0})=${y0}`, color: ['#38bdf8', '#f97316', '#a855f7', '#22c55e'][i], visible: true, fn: makeODECurve(Gfn, x0, y0) })) : [];

    // 数值判定可分离性：G(a,b)·G(c,d) = G(a,d)·G(c,b)，再用代入法构造 h(x)、k(y)
    let separable = false, Hx = null, Ky = null;
    if (Gfn) {
        const pairs = [[1, 1], [2, 1], [1, 2], [0.5, 1.5], [1.5, 0.5], [3, 2]];
        const base = pairs.find(([x0, y0]) => { const g = Gfn(x0, y0); return isFinite(g) && Math.abs(g) > 1e-9; });
        if (base) {
            const [x0, y0] = base;
            const g0 = Gfn(x0, y0);
            const probes = [[0.7, 1.3, 2.1, 0.6], [1.9, 2.4, 0.8, 1.7], [-0.6, 0.9, 1.4, 2.2], [2.5, 1.1, 0.4, 1.6]];
            separable = probes.every(([p, q, r2, t]) => {
                const l = Gfn(p, q) * Gfn(r2, t), rr = Gfn(p, t) * Gfn(r2, q);
                return !isFinite(l) || !isFinite(rr) || Math.abs(l - rr) <= 1e-7 * (1 + Math.abs(l));
            });
            if (separable) {
                Hx = ce.box(substituteVariable(G.json, 'Y', MC.numAst(y0))).simplify();
                Ky = ce.box(['Divide', substituteVariable(G.json, ind, MC.numAst(x0)), MC.numAst(g0)]).simplify();
            }
        }
    }
    if (separable) {
        steps.push({ title: '识别为可分离变量方程：分离变量 dy / k(y) = h(x) dx', latex: `\\frac{dy}{${cleanMathLatex(Ky.toLatex())}} = ${cleanMathLatex(Hx.toLatex())}\\, d${ind}` });
        _integrationDepth = 0;
        const lhsInt = integrateNode(['Divide', 1, Ky.json], 'Y', ce, null).simplify();
        const rhsInt = integrateNode(Hx.json, ind, ce, null).simplify();
        if (!isUnevaluatedIntegral(lhsInt) && !isUnevaluatedIntegral(rhsInt)) {
            steps.push({ title: '两边积分', latex: `${cleanMathLatex(lhsInt.toLatex()).replace(/\bY\b/g, 'y')} = ${cleanMathLatex(rhsInt.toLatex())} + C` });
            // 显式解：k(y) = c·y^n
            let explicit = null;
            const Rk = MC.ratFromAst(Ky.json, 'Y');
            const mono = (p) => p.filter(v => Math.abs(v) > 1e-12).length === 1;
            if (Rk && mono(Rk.n) && mono(Rk.d)) {
                const iN = Rk.n.findIndex(v => Math.abs(v) > 1e-12), iD = Rk.d.findIndex(v => Math.abs(v) > 1e-12);
                const cc = Rk.n[iN] / Rk.d[iD], nn = iN - iD;
                if (nn === 1) explicit = ce.box(['Multiply', 'C', ['Exp', ['Multiply', MC.numAst(cc), rhsInt.json]]]).simplify();
                else if (nn === 0) explicit = ce.box(['Add', ['Multiply', MC.numAst(cc), rhsInt.json], 'C']).simplify();
                else explicit = ce.box(['Power', ['Multiply', MC.numAst((1 - nn) * cc), ['Add', rhsInt.json, 'C']], MC.numAst(1 / (1 - nn))]).simplify();
            }
            if (explicit) {
                const el = cleanMathLatex(explicit.toLatex());
                steps.push({ title: '解出 y（C 为任意常数，已吸收常数因子）', latex: `y = ${el}` });
                let gfn = null; try { gfn = MC.compileAST(explicit.json, [ind, 'C']); } catch (e) { }
                const layers = gfn ? [0.5, 1, -1].map((Cv, i) => ({ id: `c${i}`, label: `C=${Cv}`, name: '积分曲线', latex: `C=${Cv}`, color: ['#38bdf8', '#a855f7', '#f97316'][i], dash: i ? [4, 4] : undefined, visible: true, fn: (x) => gfn(x, Cv) })) : numericLayers();
                return formatOutput({ resultLatex: `y = ${el}`, steps, plotData: { layers, points: [] } });
            }
            const implicit = `${cleanMathLatex(lhsInt.toLatex()).replace(/\bY\b/g, 'y')} = ${cleanMathLatex(rhsInt.toLatex())} + C`;
            steps.push({ title: '得到隐式通解；右侧附数值积分曲线供参考', latex: implicit });
            return formatOutput({ resultLatex: implicit, steps, plotData: { layers: numericLayers(), points: [] } });
        }
    }
    steps.push({ title: '无法分离变量或积分无初等表达，改用四阶龙格-库塔数值积分', latex: `y' = ${cleanMathLatex(G.toLatex())}` });
    return formatOutput({ resultLatex: '\\text{给出数值积分曲线（无符号通解）}', steps, plotData: { layers: numericLayers(), points: [] } });
}
export const solveFirstOrderODE = solveODE;

// ==========================================
// 6.5 求和 / 求积
// ==========================================

export function solveSeries({ kind, body, variable, lower, upper }, ce) {
    const { expr: cleanBody } = unwrapAST(body);
    const v = variable || 'n';
    const L = toNumber(lower, ce), U = toNumber(upper, ce);
    const steps = [];
    const sym = kind === 'Product' ? '\\prod' : '\\sum';
    const bodyLatex = cleanMathLatex(ce.box(cleanBody).toLatex());
    const lowTex = boundLatex(lower, L, ce), upTex = boundLatex(upper, U, ce);
    steps.push({ title: kind === 'Product' ? '确定连乘式' : '确定求和式', latex: `${sym}_{${v}=${lowTex}}^{${upTex}} ${bodyLatex}` });
    let term;
    try { term = MC.compileAST(cleanBody, v); } catch (e) { term = (n) => { try { return ce.box(cleanBody).subs({ [v]: n }).evaluate().valueOf(); } catch (er) { return NaN; } }; }
    const isProd = kind === 'Product';

    if (isFinite(L) && isFinite(U)) {
        const n = Math.round(U - L) + 1;
        if (n > 2e6) return formatOutput({ resultLatex: '\\text{项数过多}', steps, plotData: null });
        const first = [], op = isProd ? ' \\cdot ' : ' + ';
        for (let i = 0; i < Math.min(3, n); i++) first.push(`\\left(${MC.describeNumber(term(L + i)).latex}\\right)`);
        steps.push({ title: `共 ${n} 项，展开前几项`, latex: `${first.join(op)}${n > 3 ? `${op}\\cdots${op}\\left(${MC.describeNumber(term(U)).latex}\\right)` : ''}` });
        let acc = isProd ? 1 : 0;
        for (let i = L; i <= U; i++) acc = isProd ? acc * term(i) : acc + term(i);
        let latex;
        try {
            const exact = ce.box([kind, cleanBody, ['Tuple', v, L, U]]).evaluate();
            const ev = exact.valueOf();
            latex = (typeof ev === 'number' && isFinite(ev) && Math.abs(ev - acc) < 1e-6 * (1 + Math.abs(acc))) ? cleanMathLatex(exact.toLatex()) : null;
        } catch (e) { latex = null; }
        if (!latex) { const d = MC.describeNumber(acc); latex = d.exact ? d.latex : `\\approx ${d.latex}`; }
        steps.push({ title: '逐项累加（乘）得到结果', latex: `${sym}_{${v}=${lowTex}}^{${upTex}} ${bodyLatex} = ${latex}` });
        return formatOutput({ resultLatex: withApprox(latex, acc), steps, plotData: null });
    }

    if (isProd || U !== Infinity || !isFinite(L)) return formatOutput({ resultLatex: '\\text{仅支持有限连乘与 } n \\to +\\infty \\text{ 的无穷级数}', steps, plotData: null });
    const S = (N) => { let s = 0; for (let i = L; i < L + N; i++) s += term(i); return s; };
    const tail = Math.abs(term(L + 100000));
    if (!(tail < 1e-4)) {
        steps.push({ title: '通项不趋于 0，由级数收敛的必要条件，级数发散', latex: `\\lim_{${v}\\to\\infty} a_{${v}} \\ne 0 \\implies \\text{发散}` });
        return formatOutput({ resultLatex: '\\text{级数发散}', steps, plotData: null });
    }
    const N = 4000, s1 = S(N), s2 = S(2 * N), s3 = S(4 * N);
    const d1 = s2 - s1, d2 = s3 - s2;
    if (Math.abs(d1) > 1e-12 && Math.abs(d2 / d1) > 0.6 && Math.abs(d2 / d1) < 1.6 && Math.abs(d2) > 1e-4) {
        steps.push({ title: '部分和 S_N 随 N 持续增大，不收敛', latex: `S_{${N}} = ${MC.fmt(s1)},\\; S_{${2 * N}} = ${MC.fmt(s2)},\\; S_{${4 * N}} = ${MC.fmt(s3)}` });
        return formatOutput({ resultLatex: '\\text{级数发散}', steps, plotData: null });
    }
    let limit = s3;
    const ratio = d1 / d2;
    if (isFinite(ratio) && ratio > 1.5 && ratio < 1e4) limit = s3 + d2 / (ratio - 1);
    steps.push({ title: '部分和序列收敛；对 S_N 做 Richardson 外推估计和', latex: `S_{${N}} = ${MC.fmt(s1)},\\; S_{${2 * N}} = ${MC.fmt(s2)},\\; S_{${4 * N}} = ${MC.fmt(s3)}` });
    const d = MC.describeNumber(limit);
    const latex = d.exact ? d.latex : `\\approx ${d.latex}`;
    steps.push({ title: d.exact ? '识别精确值' : '数值结果', latex: `${sym}_{${v}=${lowTex}}^{\\infty} ${bodyLatex} = ${latex}` });
    return formatOutput({ resultLatex: withApprox(latex, limit), steps, plotData: null });
}

// ==========================================
// 7. 通用代数化简与求值器
// ==========================================

export function solveGeneralAlgebra({ targetExpr, conditionExpr }, ce) {
    const { expr: cleanExpr } = unwrapAST(targetExpr);
    const free = [...MC.freeSymbols(cleanExpr)];
    const v = free.includes('x') ? 'x' : (free[0] || 'x');
    const expr = ce.box(cleanExpr);
    const fn = buildMathFunction(cleanExpr, v, ce);
    const steps = [];

    let evalResult = expr, simpResult = expr;
    try { simpResult = expr.simplify(); } catch (e) { }
    try { evalResult = expr.evaluate(); } catch (e) { evalResult = simpResult; }

    steps.push({ title: '确定待化简/求值的表达式', latex: cleanMathLatex(expr.toLatex()) });

    if (free.length <= 1) {
        const R = MC.ratFromAst(cleanExpr, v);
        if (R) {
            const red = MC.reduceRat(R);
            if (MC.pDeg(red.d) === 0 && MC.pDeg(red.n) >= 2) {
                const P = MC.pScale(red.n, 1 / red.d[0]);
                steps.push({ title: '展开为多项式标准形式', latex: MC.polyLatex(P, v) });
                const fac = MC.factorReal(P);
                steps.push({ title: '在实数域内因式分解', latex: MC.factorLatex(fac, v) });
                const rr = MC.polyRoots(P).roots.filter(r => r.im === 0);
                if (rr.length) steps.push({ title: `令其为 0 的实根`, latex: rr.map(r => `${v} = ${rootLatex(r.re)}`).join(', \\quad ') });
            } else if (MC.pDeg(red.d) >= 1) {
                steps.push({ title: '约去分子分母的公因式', latex: `\\frac{${MC.polyLatex(red.n, v)}}{${MC.polyLatex(red.d, v)}}` });
            }
        }
    }
    if (simpResult.toLatex() !== expr.toLatex()) steps.push({ title: '化简表达式', latex: cleanMathLatex(simpResult.toLatex()) });

    if (free.length === 0) {
        try {
            const val = MC.compileAST(cleanExpr, '__none__')(0);
            if (typeof val === 'number' && isFinite(val)) steps.push({ title: '十进制近似值', latex: `\\approx ${MC.fmt(Number(val.toPrecision(12)))}` });
        } catch (e) { }
    }
    let resTex = cleanMathLatex(evalResult.toLatex());
    if (free.length === 0) { try { resTex = withApprox(resTex, MC.compileAST(cleanExpr, '__none__')(0)); } catch (e) { } }
    steps.push({ title: '最终计算结果', latex: resTex });
    return formatOutput({
        resultLatex: resTex,
        steps,
        plotData: free.length === 1 ? { layers: [{ id: 'f', label: `f(${v})`, name: `f(${v})`, latex: `f(${v}) = ${cleanMathLatex(expr.toLatex())}`, color: '#38bdf8', visible: true, fn }], points: [] } : { layers: [], points: [] }
    });
}
