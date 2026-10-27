// normalize.js —— 计算步骤与计算结果的统一规范化层
//
// 约定（所有求解器的输出都会经过这里，保证风格一致）：
//   1. LaTeX 可移植：不含 MathLive/CE 专用宏，复制到别处也能直接渲染
//   2. 数字整洁：长浮点数统一为 7 位有效数字，科学计数法写成 a \times 10^{n}
//   3. 冗余清理：1·、·1、+0、x^{1}、+ - 叠号、多余空格与悬挂的分隔符
//   4. 标题统一：无“步骤 N：”前缀、无 emoji、无结尾标点、中文标点、行内公式用 $...$ 包裹
//   5. 步骤干净：丢弃空步骤与连续重复步骤；结果必定出现在某一步中（否则补一步“最终结果”）
//   6. 幂等：对同一输入重复规范化，结果不变；任何异常都回退为原文，绝不抛错

const MACROS = [
    [/\\exponentialE(?![a-zA-Z])/g, '\\mathrm{e}'],
    [/\\imaginaryI(?![a-zA-Z])/g, '\\mathrm{i}'],
    [/\\imaginaryJ(?![a-zA-Z])/g, '\\mathrm{j}'],
    [/\\differentialD(?![a-zA-Z])/g, '\\mathrm{d}'],
    [/\\mleft(?![a-zA-Z])/g, '\\left'],
    [/\\mright(?![a-zA-Z])/g, '\\right'],
    [/\\operatorname\*/g, '\\operatorname'],
    [/\\Nothing(?![a-zA-Z])/g, '\\varnothing']
];

const UNICODE_MAP = {
    '−': '-', '–': '-', '—': '-', '×': '\\times ', '·': '\\cdot ', '≈': '\\approx ',
    '≤': '\\le ', '≥': '\\ge ', '≠': '\\ne ', '∞': '\\infty ', 'π': '\\pi ', '∈': '\\in ',
    '∪': '\\cup ', '∩': '\\cap ', 'Δ': '\\Delta ', '′': "'"
};

function roundLongDecimals(s) {
    return s.replace(/(?<![\w.])(\d+\.\d{7,})(?!\d)/g, (m) => {
        const r = Number(Number(m).toPrecision(7));
        const out = r.toString();
        return out.includes('e') ? Number(m).toFixed(6).replace(/\.?0+$/, '') : out;
    });
}

function fixScientific(s) {
    return s.replace(/(?<![\\a-zA-Z{])(\d+(?:\.\d+)?)e([+-]?)0*(\d+)(?!\d)/g,
        (m, mant, sign, exp) => `${mant} \\times 10^{${sign === '-' ? '-' : ''}${exp}}`);
}

// 二元 + / - 两侧补空格；\text{...} 内部不动；\to、\pm、\cdot 等之后的 - 视为一元负号
const AFTER_OPERATOR_CMD = '(?<!\\\\(?:quad|qquad|to|pm|mp|cdot|times|le|ge|leq|geq|ne|neq|approx|in))';
const BINARY_OP = new RegExp(`(?<=[0-9a-zA-Z}\\)\\]])${AFTER_OPERATOR_CMD}([+-])(?=\\S)`, 'g');

function spaceOperators(s) {
    return s.split(/(\\text\{[^{}]*\})/).map((seg, i) => {
        if (i % 2 === 1) return seg;
        // 紧跟在 \text{...} 之后的片段：补一个 } 作为上下文，使开头的 + / - 仍被识别为二元运算
        return i === 0 ? seg.replace(BINARY_OP, ' $1 ') : ('}' + seg).replace(BINARY_OP, ' $1 ').slice(1);
    }).join('');
}

/** 规范化一段 LaTeX（幂等） */
export function normalizeLatex(input) {
    if (typeof input !== 'string') return String(input ?? '');
    try {
        let s = input;

        for (const [re, rep] of MACROS) s = s.replace(re, rep);
        s = s.replace(/[−–—×·≈≤≥≠∞π∈∪∩Δ′]/g, (c) => UNICODE_MAP[c] ?? c);

        s = roundLongDecimals(s);
        s = fixScientific(s);

        // 冗余因子：... \cdot 1、1 \cdot ...、x^{1}（不碰 \int_{0}^{1} 这类上下限）
        s = s.replace(/\s*\\cdot\s*1(?![0-9.\w])/g, '');
        s = s.replace(/(?<![0-9.\w}])1\s*\\cdot\s*/g, '');
        s = s.replace(/(?<![\\a-zA-Z])([a-zA-Z])\^\{1\}(?![0-9])/g, '$1');
        // 数字/下标/上标 后的 \cdot 接字母、括号、函数名 → 隐式乘法（不碰 \frac：3\frac{1}{2} 会被读成带分数）
        s = s.replace(/(?<=(?<![_^a-zA-Z.])\d|\})\s*\\cdot\s*(?=[a-zA-Z(]|\\(?!frac|dfrac|tfrac|cdot|times|text))/g, '');
        // 冗余项：+ 0、- 0
        s = s.replace(/(?<=[\w}\)])\s*[+-]\s*0(?![0-9.\w\\])/g, '');

        // 符号叠加
        s = s.replace(/\s*\+\s*-\s*/g, ' - ')
            .replace(/\s*-\s*-\s*/g, ' + ')
            .replace(/\s*\+\s*\+\s*/g, ' + ');

        s = spaceOperators(s);

        // \text{中文标签:} → \text{中文标签：}\;
        s = s.replace(/\\text\{([^{}]*[\u4e00-\u9fff][^{}]*?)\s*:\s*\}\s*/g, '\\text{$1：}\\; ');

        // 绝对值对数、重复积分常数
        s = s.replace(/\\ln\s*\|([^|]*)\|/g, '\\ln\\left|$1\\right|');
        s = s.replace(/(?:\+\s*C\s*){2,}/g, '+ C');

        // 空白与悬挂分隔符
        s = s.replace(/[ \t]{2,}/g, ' ')
            .replace(/\s+([,)\]}])/g, '$1')
            .replace(/\(\s+/g, '(')
            .replace(/(?:\s*(?:\\quad|\\qquad|\\;|\\,|,))+\s*$/, '')
            .trim();

        return s;
    } catch (e) {
        return String(input);
    }
}

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu;
const WARN_RE = /^\s*(?:⚠️?|❗|‼️?|🚨)\s*/u;
const CJK = '\\u4e00-\\u9fff';

function fixCjkPunct(text) {
    return text
        .replace(new RegExp(`(?<=[${CJK}）」])\\s*:\\s*`, 'g'), '：')
        .replace(new RegExp(`(?<=[${CJK}）」])\\s*,\\s*`, 'g'), '，')
        .replace(new RegExp(`(?<=[${CJK}）」])\\s*;\\s*`, 'g'), '；')
        .replace(new RegExp(`\\s*([：，；])\\s*(?=[${CJK}A-Za-z\\\\$])`, 'g'), '$1');
}

const MATH_SPAN = /(?<![A-Za-z])(?:[A-Za-z]{1,2}\s*=\s*)?(?:\\[a-zA-Z]+|[A-Za-z0-9]\^\{|[A-Za-z]_\{)[\x20-\x7E]*/g;

/** 规范化标题，返回 { title, type }；type 为 'warn' 表示警示类步骤 */
export function normalizeTitle(raw) {
    try {
        let t = String(raw ?? '').trim();
        let type = null;

        t = t.replace(/^\s*步骤\s*\d+\s*[:：.、]\s*/, '');
        if (WARN_RE.test(t)) {
            t = t.replace(WARN_RE, '');
            type = 'warn';
            if (!/^【/.test(t)) t = `【注意】${t}`;
        }
        t = t.replace(EMOJI_RE, '').trim();

        if (!t.includes('$')) {
            // 先把整段中文文本与公式分开：公式片段包进 $...$
            t = t.replace(MATH_SPAN, (m) => {
                const trimmed = m.replace(/\s+$/, '');
                return `$${trimmed}$${m.slice(trimmed.length)}`;
            });
        } else if ((t.match(/\$/g) || []).length % 2 === 1) {
            t = t.replace(/\$/g, '');
        }

        // 只对文本段（$ 之外）做标点规范
        t = t.split('$').map((seg, i) => (i % 2 === 0 ? fixCjkPunct(seg) : seg)).join('$');
        t = t.replace(/[ \t]{2,}/g, ' ').replace(/[。.；;，,、\s]+$/, '').trim();

        return { title: t, type };
    } catch (e) {
        return { title: String(raw ?? ''), type: null };
    }
}

const compact = (s) => String(s || '').replace(/\s+/g, '');

/**
 * 规范化步骤列表：
 *   - 每步 title/latex 规范化；latex 为空的步骤丢弃
 *   - 连续且 title+latex 完全相同的步骤只保留一个
 *   - 若结果没有出现在任何一步中，补一步“最终结果”
 */
export function normalizeSteps(steps, resultLatex) {
    const out = [];
    for (const s of Array.isArray(steps) ? steps : []) {
        if (!s) continue;
        const latex = normalizeLatex(s.latex || '');
        if (!latex) continue;
        const { title, type } = normalizeTitle(s.title || '');
        const prev = out[out.length - 1];
        if (prev && prev.title === title && prev.latex === latex) continue;
        const step = { title, latex };
        if (type || s.type) step.type = type || s.type;
        out.push(step);
    }
    const res = compact(resultLatex);
    const last = out[out.length - 1];
    if (res && last && last.type !== 'warn' && !out.some(s => compact(s.latex).includes(res))) {
        out.push({ title: '最终结果', latex: resultLatex });
    }
    return out;
}

/** 规范化最终结果 */
export function normalizeResult(resultLatex) {
    return normalizeLatex(resultLatex || '');
}
