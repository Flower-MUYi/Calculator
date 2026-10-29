// grapher.js —— 交互式 2D Canvas 函数图像引擎
// 特性：双层网格 + 箭头坐标轴、带描边的刻度、智能取景（x/y 独立缩放）、曲线入场动画、
//       渐近线 / 区域填充 / 特征点标注、触控与键盘操作、ResizeObserver 自适应

function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function parseMathString(str) {
    if (!str && str !== 0) return { name: '', latex: '' };
    str = String(str).trim();

    // 匹配中文/分类名称前缀，例如：驻点 (1/2, 0), Y轴截距 (0, 1), 积分下限 a=1, 特解 (C = 0)
    const match = str.match(/^([\u4e00-\u9fa5A-Za-z0-9_]+轴?[\u4e00-\u9fa5\w\s]*?)\s*[:：]?\s*([\(（\[].*|L\s*=.*|a\s*=.*|b\s*=.*|f\(.*|F\(.*|y\(.*|C\s*=.*)$/);
    if (match) {
        let name = match[1].trim();
        let latex = match[2].trim();
        let note = '';
        const noteMatch = latex.match(/^(.*?)\s*[:：]\s*([\u4e00-\u9fa5\w\s]+)$/);
        if (noteMatch) {
            latex = noteMatch[1].trim();
            note = noteMatch[2].trim();
        }
        return { name, latex, note };
    }
    return { name: '', latex: str };
}

export function renderMath(latex, options = {}) {
    if (!latex && latex !== 0) return '';
    const formula = String(latex).trim();
    if (!formula) return '';

    if (typeof window !== 'undefined' && window.katex && typeof window.katex.renderToString === 'function') {
        try {
            return window.katex.renderToString(formula, { displayMode: options.displayMode || false, throwOnError: false, strict: false });
        } catch (e) {
            console.warn('KaTeX render warning:', e);
        }
    }

    // KaTeX 暂未加载：动态拉取，完成后广播事件
    if (typeof document !== 'undefined' && !window.__katexLoading && !window.katex) {
        window.__katexLoading = true;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
        document.head.appendChild(link);
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js';
        script.onload = () => window.dispatchEvent(new CustomEvent('katex-loaded'));
        document.head.appendChild(script);
    }
    return `<span class="raw-math">${escapeHtml(formula)}</span>`;
}

// ==========================================
// 纯函数：刻度、数字格式、取景（可单独测试）
// ==========================================

/** 1、2、5 × 10^k 的“好看”刻度间距 */
export function niceStep(raw) {
    if (!(raw > 0) || !isFinite(raw)) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const r = raw / mag;
    return (r > 5 ? 10 : r > 2 ? 5 : r > 1 ? 2 : 1) * mag;
}

/** 刻度数字：按步长决定小数位，负号用真正的减号 */
export function formatTick(v, step) {
    if (Math.abs(v) < step * 1e-6) return '0';
    const abs = Math.abs(v);
    let s;
    if (abs >= 1e6 || abs < 1e-4) s = abs.toExponential(1).replace('e+', '×10^').replace('e-', '×10^-').replace('.0', '');
    else {
        const dec = Math.min(8, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
        s = abs.toFixed(dec);
        if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    }
    return (v < 0 ? '\u2212' : '') + s;
}

export function formatCoord(v) {
    if (!isFinite(v)) return '—';
    const s = Number(v.toFixed(3)).toString();
    return s.startsWith('-') ? '\u2212' + s.slice(1) : s;
}

function quantile(sorted, q) {
    if (!sorted.length) return 0;
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * 智能取景：根据图层、特征点、积分区间决定可视范围，x/y 允许不同缩放；
 * 比例接近 1:1 时强制 1:1（让圆看起来是圆）。
 */
export function computeSmartView(plotData, width, height) {
    const layers = (plotData.layers || []).filter(l => l.visible !== false);
    const fnLayers = layers.filter(l => typeof l.fn === 'function' && l.vline === undefined);
    const points = (plotData.points || []).filter(p => isFinite(p.x) && isFinite(p.y));
    const areas = plotData.areas || [];
    const safe = (f, x) => { try { const v = f(x); return typeof v === 'number' && isFinite(v) && Math.abs(v) < 1e9 ? v : NaN; } catch (e) { return NaN; } };

    if (!fnLayers.length && !points.length && !areas.length) return null;

    // —— x 范围 ——
    const anchors = [];
    areas.forEach(a => { if (isFinite(a.from)) anchors.push(a.from); if (isFinite(a.to)) anchors.push(a.to); });
    points.forEach(p => anchors.push(p.x));
    layers.forEach(l => { if (isFinite(l.vline)) anchors.push(l.vline); });

    let x0, x1;
    if (anchors.length) {
        x0 = Math.min(...anchors); x1 = Math.max(...anchors);
        const pad = Math.max((x1 - x0) * 0.35, 2.5);
        x0 -= pad; x1 += pad;
    } else {
        // 找出函数有定义的区域（例如圆的上下半支只在 |x| ≤ r 内有定义）
        let dMin = Infinity, dMax = -Infinity;
        for (let x = -30; x <= 30; x += 0.1) {
            if (fnLayers.some(l => isFinite(safe(l.fn, x)))) { dMin = Math.min(dMin, x); dMax = Math.max(dMax, x); }
        }
        if (isFinite(dMin) && dMax - dMin < 40) {
            const pad = Math.max((dMax - dMin) * 0.25, 1.2);
            x0 = dMin - pad; x1 = dMax + pad;
        } else { x0 = -8; x1 = 8; }
    }
    if (x1 - x0 < 6) { const c = (x0 + x1) / 2; x0 = c - 3; x1 = c + 3; }
    if (x1 - x0 > 200) { const c = (x0 + x1) / 2; x0 = c - 100; x1 = c + 100; }

    // —— y 范围 ——
    // 有 ≥2 个不同高度的特征点（极值、截距…）时以它们为准，曲线尾部自然出框；
    // 否则取曲线 3%~97% 分位数，避免渐近线把画面撑爆
    const pys = points.map(p => p.y);
    const pSpan = pys.length ? Math.max(...pys) - Math.min(...pys) : 0;
    const yWindow = (a, b) => {
        let lo, hi;
        if (pSpan > 1e-6) {
            lo = Math.min(...pys) - 0.6 * pSpan; hi = Math.max(...pys) + 0.6 * pSpan;
        } else {
            const ys = [];
            fnLayers.forEach(l => {
                for (let i = 0; i <= 260; i++) { const y = safe(l.fn, a + (b - a) * i / 260); if (!isNaN(y)) ys.push(y); }
            });
            pys.forEach(y => ys.push(y));
            if (ys.length < 2) return [-5, 5];
            ys.sort((p, q) => p - q);
            lo = quantile(ys, 0.03); hi = quantile(ys, 0.97);
            pys.forEach(y => { lo = Math.min(lo, y); hi = Math.max(hi, y); });
        }
        const span = hi - lo;
        if (lo > 0 && lo < span * 0.6) lo = 0;
        if (hi < 0 && -hi < span * 0.6) hi = 0;
        let sp = hi - lo;
        if (!(sp > 1e-9)) { lo -= 1; hi += 1; sp = hi - lo; }
        lo -= sp * 0.18; hi += sp * 0.18;
        if (hi - lo < 2) { const c = (lo + hi) / 2; lo = c - 1; hi = c + 1; }
        return [lo, hi];
    };

    let [y0, y1] = yWindow(x0, x1);
    let sx = width / (x1 - x0), sy = height / (y1 - y0);
    // 增长过快（如 e^x）：收窄 x 范围，直到纵横比不再失衡
    for (let it = 0; it < 8 && !anchors.length && sy / sx < 0.2 && (x1 - x0) > 6; it++) {
        const c = (x0 + x1) / 2, half = (x1 - x0) / 2 * 0.78;
        x0 = c - half; x1 = c + half;
        [y0, y1] = yWindow(x0, x1);
        sx = width / (x1 - x0); sy = height / (y1 - y0);
    }
    const ratio = sy / sx;
    if (ratio > 40) sx = sy / 40; else if (ratio < 1 / 40) sy = sx / 40;
    else if (ratio > 0.4 && ratio < 5) { sx = sy = Math.min(sx, sy); }

    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, sx, sy };
}

// ==========================================
// 样式（只注入一次）
// ==========================================

const STYLE_ID = 'grapher-style';
const CSS = `
.gr-wrap { --gr-bg-a: #16213a; --gr-bg-b: #0b1325; position: relative; width: 100%; height: var(--gr-h, 440px); min-height: 320px;
  border-radius: 6px; overflow: hidden; user-select: none; -webkit-user-select: none; touch-action: none;
  background: radial-gradient(120% 90% at 25% 15%, var(--gr-bg-a) 0%, var(--gr-bg-b) 70%);
  border: 1px solid #243049; box-shadow: inset 0 0 0 1px rgba(255,255,255,.025), inset 0 18px 40px rgba(0,0,0,.18);
  font-family: var(--sans, "Hanken Grotesk", "Noto Sans SC", system-ui, sans-serif); color: #e2e8f0; }
.gr-canvas { display: block; width: 100%; height: 100%; cursor: grab; outline: none; }
.gr-canvas.is-grabbing { cursor: grabbing; }
.gr-canvas.is-pointer { cursor: pointer; }
.gr-canvas.is-cross { cursor: crosshair; }
.gr-canvas:focus-visible { box-shadow: inset 0 0 0 2px #4cc2ff; }
.gr-legend { position: absolute; top: 12px; left: 12px; right: 56px; display: flex; flex-wrap: wrap; gap: 6px; z-index: 10; pointer-events: none; }
.gr-chip { pointer-events: auto; display: inline-flex; align-items: center; gap: 8px; max-width: 100%; padding: 4px 10px 4px 8px;
  font: 500 12px/1.3 inherit; color: #e8edf5; background: rgba(12, 20, 38, .72); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  border: 1px solid rgba(148, 163, 184, .22); border-radius: 999px; cursor: pointer; transition: opacity .15s, border-color .15s, background .15s; }
.gr-chip:hover { border-color: rgba(148, 163, 184, .55); background: rgba(18, 28, 50, .85); }
.gr-chip:focus-visible { outline: 2px solid #4cc2ff; outline-offset: 1px; }
.gr-chip[aria-pressed="false"] { opacity: .45; }
.gr-chip[aria-pressed="false"] .gr-chip-text { text-decoration: line-through; text-decoration-color: rgba(148,163,184,.6); }
.gr-chip svg { flex: none; }
.gr-chip-name { font-size: 11px; color: #9fb0c8; }
.gr-chip-text { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.gr-chip .katex { font-size: 1.02em; color: #f4f7fb; }
.gr-tools { position: absolute; right: 12px; bottom: 12px; display: flex; flex-direction: column; z-index: 10;
  background: rgba(12, 20, 38, .72); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  border: 1px solid rgba(148, 163, 184, .22); border-radius: 8px; overflow: hidden; }
.gr-btn { width: 34px; height: 34px; display: grid; place-items: center; padding: 0; color: #aebbd0; background: transparent; border: 0; cursor: pointer; transition: background .15s, color .15s; }
.gr-btn + .gr-btn { border-top: 1px solid rgba(148, 163, 184, .16); }
.gr-btn:hover { background: rgba(76, 194, 255, .14); color: #fff; }
.gr-btn:focus-visible { outline: 2px solid #4cc2ff; outline-offset: -2px; }
.gr-readout { position: absolute; left: 12px; bottom: 10px; z-index: 10; padding: 2px 8px; font: 500 11px/1.5 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  color: #9fb0c8; background: rgba(12, 20, 38, .6); border-radius: 4px; opacity: 0; transition: opacity .15s; pointer-events: none; font-variant-numeric: tabular-nums; }
.gr-readout.on { opacity: 1; }
.gr-readout b { color: #e8edf5; font-weight: 500; }
.gr-empty { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; padding: 24px; color: #7f90ab; font-size: 14px; line-height: 1.7; pointer-events: none; }
.gr-empty[hidden] { display: none; }
.gr-tip { position: absolute; display: none; pointer-events: none; z-index: 30; max-width: 300px; padding: 9px 12px;
  color: #f1f5f9; font-size: 12px; line-height: 1.45; background: rgba(10, 17, 32, .94); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(148, 163, 184, .3); border-radius: 8px; box-shadow: 0 10px 28px rgba(0, 0, 0, .45); }
.gr-tip-head { display: flex; align-items: center; gap: 7px; margin-bottom: 3px; font-weight: 600; font-size: 12px; }
.gr-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.gr-tip-math { padding: 2px 0; font-size: 13px; color: #7fd4ff; }
.gr-tip-note { margin-top: 2px; font-size: 11px; color: #94a3b8; }
.gr-tip-xy { display: flex; gap: 12px; margin-top: 5px; font: 11px ui-monospace, Menlo, Consolas, monospace; color: #94a3b8; font-variant-numeric: tabular-nums; }
.gr-tip-xy b { color: #e2e8f0; font-weight: 500; }
.gr-tip-item + .gr-tip-item { margin-top: 7px; padding-top: 7px; border-top: 1px solid rgba(255, 255, 255, .08); }
@media (max-width: 560px) { .gr-legend { right: 12px; top: 8px; } .gr-chip { font-size: 11px; } }
`;

const PALETTE = ['#4cc2ff', '#ff9b4a', '#b794f6', '#4ade80', '#f472b6', '#facc15'];
const ICONS = {
    plus: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>',
    minus: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 8h10"/></svg>',
    fit: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6V3.5H5M11 3.5h2.5V6M13.5 10v2.5H11M5 12.5H2.5V10"/><circle cx="8" cy="8" r="1.6"/></svg>',
    home: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8 8 3l5.5 5M4 7v6h8V7"/></svg>'
};

const BG = 'rgba(11, 19, 37, 0.9)';

function swatch(color, dash) {
    const d = dash && dash.length ? ` stroke-dasharray="${dash.map(v => Math.max(1.5, v * 0.6)).join(' ')}"` : '';
    return `<svg width="22" height="10" viewBox="0 0 22 10" aria-hidden="true"><path d="M1 5h20" stroke="${color}" stroke-width="2.4" stroke-linecap="round"${d}/></svg>`;
}

function withAlpha(color, a) {
    if (!color) return `rgba(76,194,255,${a})`;
    if (color.startsWith('#') && (color.length === 7)) {
        const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${a})`;
    }
    const m = color.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(',').map(s => s.trim()); return `rgba(${p[0]},${p[1]},${p[2]},${a})`; }
    return color;
}

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// ==========================================
// 主类
// ==========================================

export class InteractiveGrapher {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error(`Container #${containerId} not found`);

        this.view = { cx: 0, cy: 0, sx: 40, sy: 40 };
        this.plotData = { layers: [], points: [], areas: [] };
        this.hoveredPoint = null;
        this.hoveredCurve = null;
        this.detectedIntersections = [];
        this.isDragging = false;
        this.pointers = new Map();
        this.pinch = null;
        this.renderPending = false;
        this.reveal = null;
        this.viewAnim = null;
        this.width = 0; this.height = 0; this.dpr = 1;
        this.reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

        this.injectStyle();
        this.initDOM();
        this.initEvents();

        this.resize();
        if (typeof ResizeObserver === 'function') {
            this.ro = new ResizeObserver(() => this.resize());
            this.ro.observe(this.wrap);
        } else {
            window.addEventListener('resize', () => this.resize());
        }
        window.addEventListener('katex-loaded', () => { this.updateLegend(); this.requestRender(); });
    }

    // ---------- DOM ----------
    injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const st = document.createElement('style');
        st.id = STYLE_ID;
        st.textContent = CSS;
        document.head.appendChild(st);
    }

    initDOM() {
        this.container.innerHTML = `
            <div class="gr-wrap graph-wrapper">
                <canvas id="graph-canvas" class="gr-canvas" tabindex="0" role="img" aria-label="函数图像，可拖动平移，滚轮缩放；方向键平移，加减号缩放，0 键复位"></canvas>
                <div id="graph-legend" class="gr-legend"></div>
                <div class="gr-empty" id="graph-empty">输入公式并点击“开始计算”<br>函数图像会显示在这里</div>
                <div class="gr-readout" id="graph-readout"></div>
                <div class="gr-tools" role="toolbar" aria-label="图像控制">
                    <button class="gr-btn" id="btn-zoom-in" type="button" title="放大" aria-label="放大">${ICONS.plus}</button>
                    <button class="gr-btn" id="btn-zoom-out" type="button" title="缩小" aria-label="缩小">${ICONS.minus}</button>
                    <button class="gr-btn" id="btn-autofit" type="button" title="适应图像" aria-label="适应图像">${ICONS.fit}</button>
                    <button class="gr-btn" id="btn-reset" type="button" title="回到原点（1:1）" aria-label="回到原点">${ICONS.home}</button>
                </div>
                <div id="graph-tooltip" class="gr-tip" role="tooltip"></div>
            </div>`;
        const q = (s) => this.container.querySelector(s);
        this.wrap = q('.gr-wrap');
        this.canvas = q('#graph-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.legendContainer = q('#graph-legend');
        this.tooltip = q('#graph-tooltip');
        this.readout = q('#graph-readout');
        this.emptyEl = q('#graph-empty');
        const cs = getComputedStyle(this.container);
        this.fontFamily = (cs.getPropertyValue('--sans') || '').trim() || '"Hanken Grotesk", "Noto Sans SC", system-ui, sans-serif';
    }

    // ---------- 坐标 ----------
    s2x(sx) { return this.view.cx + (sx - this.width / 2) / this.view.sx; }
    s2y(sy) { return this.view.cy - (sy - this.height / 2) / this.view.sy; }
    x2s(mx) { return this.width / 2 + (mx - this.view.cx) * this.view.sx; }
    y2s(my) { return this.height / 2 - (my - this.view.cy) * this.view.sy; }
    // 兼容旧名称
    screenToMathX(v) { return this.s2x(v); }
    screenToMathY(v) { return this.s2y(v); }
    mathToScreenX(v) { return this.x2s(v); }
    mathToScreenY(v) { return this.y2s(v); }

    // ---------- 渲染调度 ----------
    requestRender() {
        if (this.renderPending) return;
        this.renderPending = true;
        requestAnimationFrame(() => { this.renderPending = false; this.render(); });
    }

    startLoop() {
        if (this.loop) return;
        const step = (now) => {
            let active = false;
            if (this.viewAnim) {
                const a = this.viewAnim;
                const t = Math.min(1, (now - a.t0) / a.dur), e = easeOutCubic(t);
                for (const k of ['cx', 'cy']) this.view[k] = a.from[k] + (a.to[k] - a.from[k]) * e;
                for (const k of ['sx', 'sy']) this.view[k] = Math.exp(Math.log(a.from[k]) + (Math.log(a.to[k]) - Math.log(a.from[k])) * e);
                if (t >= 1) { this.viewAnim = null; this.refreshIntersections(); } else active = true;
            }
            if (this.reveal) {
                if (now - this.reveal.t0 >= this.reveal.dur) this.reveal = null; else active = true;
            }
            this.render(now);
            if (active) this.loop = requestAnimationFrame(step); else this.loop = null;
        };
        this.loop = requestAnimationFrame(step);
    }

    animateTo(target, dur = 420) {
        if (!target) return;
        if (this.reduceMotion || !this.width) { Object.assign(this.view, target); this.requestRender(); return; }
        this.viewAnim = { t0: performance.now(), dur, from: { ...this.view }, to: { ...target } };
        this.startLoop();
    }

    cancelAnim() { this.viewAnim = null; }

    // ---------- 事件 ----------
    initEvents() {
        const c = this.canvas;

        c.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            try { c.setPointerCapture(e.pointerId); } catch (err) { }
            this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            this.cancelAnim();
            this.tooltip.style.display = 'none';
            if (this.pointers.size === 1) {
                this.isDragging = true;
                this.dragStart = { x: e.clientX, y: e.clientY };
                this.viewStart = { cx: this.view.cx, cy: this.view.cy };
                c.classList.add('is-grabbing');
            } else if (this.pointers.size === 2) {
                const [a, b] = [...this.pointers.values()];
                this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, sx: this.view.sx, sy: this.view.sy };
            }
        });

        c.addEventListener('pointermove', (e) => {
            if (!this.pointers.has(e.pointerId)) {
                if (e.pointerType === 'mouse') this.handleHover(e);
                return;
            }
            this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (this.pointers.size >= 2 && this.pinch) {
                const [a, b] = [...this.pointers.values()];
                const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
                const rect = c.getBoundingClientRect();
                const mx = (a.x + b.x) / 2 - rect.left, my = (a.y + b.y) / 2 - rect.top;
                this.setZoomAt(mx, my, this.pinch.sx * dist / this.pinch.dist, this.pinch.sy * dist / this.pinch.dist);
            } else if (this.isDragging) {
                const dx = e.clientX - this.dragStart.x, dy = e.clientY - this.dragStart.y;
                this.view.cx = this.viewStart.cx - dx / this.view.sx;
                this.view.cy = this.viewStart.cy + dy / this.view.sy;
                this.requestRender();
            }
        });

        const end = (e) => {
            this.pointers.delete(e.pointerId);
            if (this.pointers.size < 2) this.pinch = null;
            if (this.pointers.size === 0) {
                this.isDragging = false;
                c.classList.remove('is-grabbing');
                this.requestRender();
                this.refreshIntersections();
            } else if (this.pointers.size === 1) {
                const [p] = [...this.pointers.values()];
                this.dragStart = { x: p.x, y: p.y };
                this.viewStart = { cx: this.view.cx, cy: this.view.cy };
            }
        };
        c.addEventListener('pointerup', end);
        c.addEventListener('pointercancel', end);
        c.addEventListener('pointerleave', () => {
            if (this.isDragging) return;
            this.hoveredPoint = null; this.hoveredCurve = null;
            this.tooltip.style.display = 'none';
            this.readout.classList.remove('on');
            this.requestRender();
        });

        c.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.cancelAnim();
            const rect = c.getBoundingClientRect();
            const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016));
            this.setZoomAt(e.clientX - rect.left, e.clientY - rect.top, this.view.sx * f, this.view.sy * f);
            this.handleHover(e);
        }, { passive: false });

        c.addEventListener('dblclick', () => this.autoFit());

        c.addEventListener('keydown', (e) => {
            const pan = 60;
            const map = {
                ArrowLeft: () => { this.view.cx -= pan / this.view.sx; },
                ArrowRight: () => { this.view.cx += pan / this.view.sx; },
                ArrowUp: () => { this.view.cy += pan / this.view.sy; },
                ArrowDown: () => { this.view.cy -= pan / this.view.sy; },
                '+': () => this.zoom(1.25), '=': () => this.zoom(1.25), '-': () => this.zoom(0.8), '_': () => this.zoom(0.8),
                '0': () => this.resetView()
            };
            if (map[e.key]) { e.preventDefault(); this.cancelAnim(); map[e.key](); this.requestRender(); }
        });

        const q = (s) => this.container.querySelector(s);
        q('#btn-zoom-in').onclick = () => this.zoom(1.3);
        q('#btn-zoom-out').onclick = () => this.zoom(1 / 1.3);
        q('#btn-reset').onclick = () => this.resetView();
        q('#btn-autofit').onclick = () => this.autoFit();
    }

    /** 平移 / 缩放结束后，按新的可视范围重新检测交点 */
    refreshIntersections() {
        clearTimeout(this._ixTimer);
        this._ixTimer = setTimeout(() => { this.detectIntersections(); this.requestRender(); }, 160);
    }

    clampScale(v) { return Math.min(Math.max(v, 0.2), 2e5); }

    setZoomAt(px, py, nsx, nsy) {
        const mx = this.s2x(px), my = this.s2y(py);
        this.view.sx = this.clampScale(nsx);
        this.view.sy = this.clampScale(nsy);
        this.view.cx = mx - (px - this.width / 2) / this.view.sx;
        this.view.cy = my + (py - this.height / 2) / this.view.sy;
        this.requestRender();
        this.refreshIntersections();
    }

    zoom(factor) {
        const to = { cx: this.view.cx, cy: this.view.cy, sx: this.clampScale(this.view.sx * factor), sy: this.clampScale(this.view.sy * factor) };
        this.animateTo(to, 220);
    }

    resetView() { this.animateTo({ cx: 0, cy: 0, sx: 40, sy: 40 }, 380); }

    /** 适应当前图像（智能取景） */
    autoFit(animate = true) {
        const target = computeSmartView(this.plotData, this.width || 600, this.height || 400);
        if (!target) { this.resetView(); return; }
        if (animate) this.animateTo(target); else { Object.assign(this.view, target); this.requestRender(); }
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const first = !this.width;
        this.dpr = Math.min(window.devicePixelRatio || 1, 3);
        this.width = rect.width;
        this.height = rect.height;
        this.canvas.width = Math.round(this.width * this.dpr);
        this.canvas.height = Math.round(this.height * this.dpr);
        if (first && this.pendingFit) { this.pendingFit = false; this.autoFit(false); this.detectIntersections(); }
        this.requestRender();
    }

    // ---------- 数据 ----------
    getVisiblePoints() {
        const stat = (this.plotData.points || []).filter(p => this.isLayerVisible(p.layerId));
        return [...stat, ...(this.detectedIntersections || [])];
    }

    isLayerVisible(layerId) {
        if (!layerId) return true;
        const layer = (this.plotData.layers || []).find(l => l.id === layerId);
        return layer ? layer.visible !== false : true;
    }

    setData(plotData) {
        const data = plotData || { layers: [], points: [], areas: [] };
        data.layers = (data.layers || []).map((l, i) => ({ ...l, color: l.color || PALETTE[i % PALETTE.length] }));
        this.plotData = data;
        this.hoveredPoint = null; this.hoveredCurve = null;
        this.tooltip.style.display = 'none';
        this.updateLegend();
        this.emptyEl.hidden = data.layers.length > 0 || (data.points || []).length > 0;

        if (this.width) this.autoFit(false); else this.pendingFit = true;
        this.detectIntersections();

        if (!this.reduceMotion && data.layers.length) {
            this.reveal = { t0: performance.now(), dur: 650 };
            this.startLoop();
        } else this.requestRender();
    }

    updateLegend() {
        this.legendContainer.innerHTML = '';
        (this.plotData.layers || []).forEach((layer) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'gr-chip graph-legend-item';
            chip.setAttribute('aria-pressed', layer.visible !== false ? 'true' : 'false');

            const parsed = layer.latex ? { name: layer.name, latex: layer.latex } : parseMathString(layer.label);
            let body = '';
            if (parsed.name) body += `<span class="gr-chip-name">${escapeHtml(parsed.name)}</span>`;
            if (parsed.latex) body += `<span class="graph-legend-formula">${renderMath(parsed.latex)}</span>`;
            else if (!parsed.name) body = escapeHtml(layer.label || '');
            chip.innerHTML = `${swatch(layer.color, layer.dash)}<span class="gr-chip-text">${body}</span>`;

            chip.addEventListener('click', () => {
                layer.visible = layer.visible === false;
                chip.setAttribute('aria-pressed', layer.visible !== false ? 'true' : 'false');
                this.detectIntersections();
                this.requestRender();
            });
            this.legendContainer.appendChild(chip);
        });
    }

    detectIntersections() {
        this.detectedIntersections = [];
        const layers = (this.plotData.layers || []).filter(l => l.visible !== false && typeof l.fn === 'function' && l.vline === undefined && !l.guide);
        if (layers.length < 2 || !this.width) return;

        const xMin = this.s2x(0), xMax = this.s2x(this.width);
        const n = 220, step = (xMax - xMin) / n;
        const f = (fn, x) => { try { return fn(x); } catch (e) { return NaN; } };

        for (let i = 0; i < layers.length; i++) {
            for (let j = i + 1; j < layers.length; j++) {
                const f1 = layers[i].fn, f2 = layers[j].fn;
                let prevDiff = f(f1, xMin) - f(f2, xMin);
                for (let k = 1; k <= n; k++) {
                    const x = xMin + k * step;
                    const diff = f(f1, x) - f(f2, x);
                    if (!isNaN(prevDiff) && !isNaN(diff) && prevDiff * diff <= 0 && Math.abs(diff - prevDiff) * this.view.sy < this.height) {
                        let l = x - step, r = x;
                        const dl = f(f1, l) - f(f2, l);
                        for (let t = 0; t < 30; t++) {
                            const mid = (l + r) / 2;
                            const md = f(f1, mid) - f(f2, mid);
                            if (md * dl <= 0) r = mid; else l = mid;
                        }
                        const rx = (l + r) / 2, ry = f(f1, rx);
                        if (isFinite(ry) && Math.abs(ry) < 1e6 && !this.detectedIntersections.some(p => Math.abs(p.x - rx) < step * 0.5 && Math.abs(p.y - ry) < 1e-3)) {
                            const n1 = layers[i].name || layers[i].label, n2 = layers[j].name || layers[j].label;
                            this.detectedIntersections.push({
                                x: rx, y: ry, label: `交点 (${n1} ∩ ${n2})`, name: '曲线交点',
                                latex: `\\left(${formatCoord(rx)}, ${formatCoord(ry)}\\right)`, note: `${n1} ∩ ${n2}`,
                                type: 'intersection', style: 'solid', color: '#facc15'
                            });
                        }
                    }
                    prevDiff = diff;
                }
            }
        }
    }

    // ---------- 悬停与提示 ----------
    placeTip(px, py) {
        const tw = this.tooltip.offsetWidth || 180, th = this.tooltip.offsetHeight || 60;
        let left = px + 16, top = py - th / 2;
        if (left + tw > this.width - 10) left = px - tw - 16;
        left = Math.max(10, left);
        top = Math.min(Math.max(10, top), this.height - th - 10);
        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.top = `${top}px`;
    }

    handleHover(e) {
        if (this.isDragging) return;
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
        const cls = this.canvas.classList;

        this.readout.innerHTML = `x <b>${formatCoord(this.s2x(sx))}</b>　y <b>${formatCoord(this.s2y(sy))}</b>`;
        this.readout.classList.add('on');

        // 1) 吸附特征点
        const near = this.getVisiblePoints().filter(p => Math.hypot(this.x2s(p.x) - sx, this.y2s(p.y) - sy) <= 10);
        if (near.length) {
            this.hoveredPoint = near; this.hoveredCurve = null;
            cls.add('is-pointer'); cls.remove('is-cross');
            const p0 = near[0];
            const items = near.map(p => {
                const parsed = p.latex ? { name: p.name, latex: p.latex, note: p.note } : parseMathString(p.label);
                const note = p.note || parsed.note;
                return `<div class="gr-tip-item">
                    <div class="gr-tip-head"><span class="gr-dot" style="background:${p.color || '#4cc2ff'};box-shadow:0 0 8px ${p.color || '#4cc2ff'}"></span>${escapeHtml(parsed.name || p.name || '特征点')}</div>
                    ${parsed.latex ? `<div class="gr-tip-math">${renderMath(parsed.latex)}</div>` : ''}
                    ${note ? `<div class="gr-tip-note">${escapeHtml(note)}</div>` : ''}</div>`;
            }).join('');
            this.tooltip.innerHTML = `${items}<div class="gr-tip-xy"><span>x <b>${formatCoord(p0.x)}</b></span><span>y <b>${formatCoord(p0.y)}</b></span></div>`;
            this.tooltip.style.display = 'block';
            this.placeTip(this.x2s(p0.x), this.y2s(p0.y));
            this.requestRender();
            return;
        }

        // 2) 吸附曲线
        const mx = this.s2x(sx);
        let best = null, bestD = 11;
        for (const layer of (this.plotData.layers || [])) {
            if (layer.visible === false || typeof layer.fn !== 'function' || layer.vline !== undefined || layer.guide) continue;
            let y; try { y = layer.fn(mx); } catch (err) { continue; }
            if (typeof y !== 'number' || !isFinite(y)) continue;
            const d = Math.abs(this.y2s(y) - sy);
            if (d < bestD) { bestD = d; best = { layer, x: mx, y }; }
        }
        if (best) {
            this.hoveredPoint = null; this.hoveredCurve = best;
            cls.add('is-cross'); cls.remove('is-pointer');
            const layer = best.layer;
            const parsed = layer.latex ? { name: layer.name, latex: layer.latex } : parseMathString(layer.label);
            this.tooltip.innerHTML = `
                <div class="gr-tip-head"><span class="gr-dot" style="background:${layer.color};box-shadow:0 0 8px ${layer.color}"></span>${escapeHtml(parsed.name || '函数曲线')}</div>
                <div class="gr-tip-math">${parsed.latex ? renderMath(parsed.latex) : escapeHtml(layer.label || '')}</div>
                <div class="gr-tip-xy"><span>x <b>${formatCoord(best.x)}</b></span><span>y <b>${formatCoord(best.y)}</b></span></div>`;
            this.tooltip.style.display = 'block';
            this.placeTip(sx, this.y2s(best.y));
        } else {
            this.hoveredPoint = null; this.hoveredCurve = null;
            cls.remove('is-pointer', 'is-cross');
            this.tooltip.style.display = 'none';
        }
        this.requestRender();
    }

    // ---------- 绘制 ----------
    render(now) {
        const ctx = this.ctx;
        if (!this.width) return;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.width, this.height);

        let t = 1;
        if (this.reveal) t = easeOutCubic(Math.min(1, ((now || performance.now()) - this.reveal.t0) / this.reveal.dur));

        this.drawGrid();
        this.drawAreas(t);
        this.drawGuides();
        this.drawLayers(t);
        this.drawPoints(t);
        this.drawPointLabels(t);
    }

    halo(text, x, y) {
        const ctx = this.ctx;
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = BG;
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
    }

    drawGrid() {
        const ctx = this.ctx, W = this.width, H = this.height;
        const xMin = this.s2x(0), xMax = this.s2x(W), yMin = this.s2y(H), yMax = this.s2y(0);
        const stepX = niceStep(70 / this.view.sx), stepY = niceStep(56 / this.view.sy);

        const lines = (minor) => {
            ctx.beginPath();
            const sxs = minor ? stepX / 5 : stepX, sys = minor ? stepY / 5 : stepY;
            if (minor && (sxs * this.view.sx < 11 || sys * this.view.sy < 11)) return false;
            for (let x = Math.floor(xMin / sxs) * sxs; x <= xMax; x += sxs) {
                if (minor && Math.abs(x / stepX - Math.round(x / stepX)) < 1e-6) continue;
                const px = Math.round(this.x2s(x)) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, H);
            }
            for (let y = Math.floor(yMin / sys) * sys; y <= yMax; y += sys) {
                if (minor && Math.abs(y / stepY - Math.round(y / stepY)) < 1e-6) continue;
                const py = Math.round(this.y2s(y)) + 0.5; ctx.moveTo(0, py); ctx.lineTo(W, py);
            }
            return true;
        };
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
        if (lines(true)) ctx.stroke();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
        lines(false); ctx.stroke();

        // 坐标轴
        const ox = this.x2s(0), oy = this.y2s(0);
        const axisColor = 'rgba(214, 224, 238, 0.62)';
        ctx.strokeStyle = axisColor; ctx.fillStyle = axisColor; ctx.lineWidth = 1.4;
        const xAxisVisible = oy >= 0 && oy <= H, yAxisVisible = ox >= 0 && ox <= W;
        ctx.beginPath();
        if (xAxisVisible) { ctx.moveTo(0, oy); ctx.lineTo(W - 2, oy); }
        if (yAxisVisible) { ctx.moveTo(ox, H); ctx.lineTo(ox, 2); }
        ctx.stroke();
        const arrow = (x, y, dx, dy) => {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - dx * 9 - dy * 4, y - dy * 9 + dx * 4);
            ctx.lineTo(x - dx * 9 + dy * 4, y - dy * 9 - dx * 4);
            ctx.closePath(); ctx.fill();
        };
        if (xAxisVisible) arrow(W - 1, oy, 1, 0);
        if (yAxisVisible) arrow(ox, 1, 0, -1);

        // 刻度与数字
        ctx.font = `500 11px ${this.fontFamily}`;
        ctx.fillStyle = '#9fb0c8';
        ctx.strokeStyle = 'rgba(214, 224, 238, 0.55)';
        ctx.lineWidth = 1;
        const labelY = xAxisVisible ? Math.min(oy + 7, H - 16) : (oy < 0 ? 7 : H - 16);
        const above = xAxisVisible && oy + 7 > H - 16;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        const tickPath = new Path2D();
        for (let x = Math.floor(xMin / stepX) * stepX; x <= xMax; x += stepX) {
            const px = this.x2s(x);
            if (px < 14 || px > W - 14) continue;
            if (Math.abs(x) < stepX * 1e-6) continue;
            if (xAxisVisible) { tickPath.moveTo(Math.round(px) + 0.5, oy - 3); tickPath.lineTo(Math.round(px) + 0.5, oy + 3); }
            this.halo(formatTick(x, stepX), px, above ? oy - 20 : labelY);
        }
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        const labelX = yAxisVisible ? Math.max(ox - 8, 34) : (ox < 0 ? 34 : W - 8);
        const leftSide = !(yAxisVisible && ox - 8 < 34);
        for (let y = Math.floor(yMin / stepY) * stepY; y <= yMax; y += stepY) {
            const py = this.y2s(y);
            if (py < 12 || py > H - 12) continue;
            if (Math.abs(y) < stepY * 1e-6) continue;
            if (yAxisVisible) { tickPath.moveTo(ox - 3, Math.round(py) + 0.5); tickPath.lineTo(ox + 3, Math.round(py) + 0.5); }
            if (!leftSide) ctx.textAlign = 'left';
            this.halo(formatTick(y, stepY), leftSide ? labelX : ox + 8, py);
        }
        ctx.strokeStyle = 'rgba(214, 224, 238, 0.55)';
        ctx.lineWidth = 1;
        ctx.stroke(tickPath);

        // 原点 0 与轴名
        if (xAxisVisible && yAxisVisible) {
            ctx.textAlign = 'right'; ctx.textBaseline = 'top';
            this.halo('0', ox - 7, oy + 6);
        }
        ctx.font = `italic 500 13px "Newsreader", Georgia, serif`;
        ctx.fillStyle = '#c3cfe0';
        if (xAxisVisible) { ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; this.halo('x', W - 14, oy - 8); }
        if (yAxisVisible) { ctx.textAlign = 'left'; ctx.textBaseline = 'top'; this.halo('y', ox + 9, 8); }
    }

    drawAreas(t) {
        const areas = this.plotData.areas;
        if (!areas || !areas.length) return;
        const ctx = this.ctx;

        areas.forEach(area => {
            if (area.layerId && !this.isLayerVisible(area.layerId)) return;
            const fromX = Math.max(area.from, this.s2x(0)), toX = Math.min(area.to, this.s2x(this.width));
            if (!(fromX < toX)) return;
            const n = this.isDragging ? 40 : 160, dx = (toX - fromX) / n;
            const top = (x) => { try { const v = area.topFn(x); return isFinite(v) ? v : 0; } catch (e) { return 0; } };
            const bot = (x) => { try { const v = area.bottomFn ? area.bottomFn(x) : 0; return isFinite(v) ? v : 0; } catch (e) { return 0; } };

            ctx.save();
            ctx.globalAlpha = t;
            const base = area.color || 'rgba(76,194,255,0.22)';
            const m = base.match(/rgba?\(([^)]+)\)/);
            const alpha = m && m[1].split(',')[3] ? parseFloat(m[1].split(',')[3]) : 0.25;
            const grad = ctx.createLinearGradient(0, 0, 0, this.height);
            grad.addColorStop(0, withAlpha(base, Math.min(0.5, alpha * 1.5)));
            grad.addColorStop(1, withAlpha(base, alpha * 0.55));
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(this.x2s(fromX), this.y2s(bot(fromX)));
            for (let i = 0; i <= n; i++) { const x = fromX + dx * i; ctx.lineTo(this.x2s(x), this.y2s(top(x))); }
            for (let i = n; i >= 0; i--) { const x = fromX + dx * i; ctx.lineTo(this.x2s(x), this.y2s(bot(x))); }
            ctx.closePath();
            ctx.fill();

            // 积分区间边界：虚线
            ctx.setLineDash([3, 4]);
            ctx.strokeStyle = withAlpha(base, 0.9).replace(/[\d.]+\)$/, '0.55)');
            ctx.lineWidth = 1;
            ctx.beginPath();
            [area.from, area.to].forEach(bx => {
                if (!isFinite(bx) || Math.abs(bx) > 1e4) return;
                const px = Math.round(this.x2s(bx)) + 0.5;
                if (px < 0 || px > this.width) return;
                ctx.moveTo(px, this.y2s(bot(bx))); ctx.lineTo(px, this.y2s(top(bx)));
            });
            ctx.stroke();
            ctx.restore();
        });
    }

    /** 渐近线与参考线（layer.vline = x 值 / layer.hline = y 值） */
    drawGuides() {
        const ctx = this.ctx;
        (this.plotData.layers || []).forEach(layer => {
            if (layer.visible === false) return;
            const hasV = isFinite(layer.vline), hasH = isFinite(layer.hline);
            if (!hasV && !hasH) return;
            ctx.save();
            ctx.setLineDash(layer.dash || [7, 6]);
            ctx.strokeStyle = withAlpha(layer.color, 0.75);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            if (hasV) { const px = Math.round(this.x2s(layer.vline)) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, this.height); }
            if (hasH) { const py = Math.round(this.y2s(layer.hline)) + 0.5; ctx.moveTo(0, py); ctx.lineTo(this.width, py); }
            ctx.stroke();
            ctx.restore();
        });
    }

    drawLayers(t) {
        const layers = this.plotData.layers;
        if (!layers || !layers.length) return;
        const ctx = this.ctx;
        const quick = this.isDragging || !!this.viewAnim || this.pinch;
        const pixelStep = quick ? 4 : 1.25;
        const jump = this.height * 0.85;

        ctx.save();
        if (t < 1) { ctx.beginPath(); ctx.rect(0, 0, this.width * t, this.height); ctx.clip(); }
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';

        layers.forEach(layer => {
            if (layer.visible === false || typeof layer.fn !== 'function' || layer.vline !== undefined) return;
            const path = new Path2D();
            let drawing = false, lastY = 0;
            for (let sx = 0; sx <= this.width + pixelStep; sx += pixelStep) {
                let my; try { my = layer.fn(this.s2x(sx)); } catch (e) { my = NaN; }
                if (typeof my !== 'number' || !isFinite(my)) { drawing = false; continue; }
                const sy = this.y2s(my);
                if (!isFinite(sy) || Math.abs(sy) > 1e5) { drawing = false; continue; }
                if (drawing && Math.abs(sy - lastY) > jump) drawing = false;
                if (!drawing) { path.moveTo(sx, sy); drawing = true; } else path.lineTo(sx, sy);
                lastY = sy;
            }
            const focused = this.hoveredCurve && this.hoveredCurve.layer === layer;
            const width = (layer.lineWidth || 2.4) + (focused ? 0.8 : 0);
            ctx.setLineDash(layer.dash || []);
            if (!quick && !layer.guide) {          // 柔和的外发光
                ctx.strokeStyle = withAlpha(layer.color, focused ? 0.28 : 0.14);
                ctx.lineWidth = width + 6;
                ctx.stroke(path);
            }
            ctx.strokeStyle = layer.color;
            ctx.lineWidth = width;
            ctx.stroke(path);
        });
        ctx.setLineDash([]);
        ctx.restore();
    }

    drawPoints(t) {
        const ctx = this.ctx;
        const pts = this.getVisiblePoints();
        ctx.save();
        ctx.globalAlpha = Math.min(1, t * 1.4);
        pts.forEach(p => {
            const sx = this.x2s(p.x), sy = this.y2s(p.y);
            if (sx < -20 || sx > this.width + 20 || sy < -20 || sy > this.height + 20) return;
            const hovered = this.hoveredPoint && this.hoveredPoint.some(h => Math.hypot(h.x - p.x, h.y - p.y) < 1e-5);
            const r = hovered ? 6.5 : 5;
            const color = p.color || '#4cc2ff';

            ctx.fillStyle = withAlpha(color, hovered ? 0.38 : 0.2);
            ctx.beginPath(); ctx.arc(sx, sy, r + (hovered ? 6 : 4.5), 0, Math.PI * 2); ctx.fill();

            ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
            if (p.style === 'hollow') {
                ctx.fillStyle = '#0b1325'; ctx.fill();
                ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.stroke();
            } else {
                ctx.fillStyle = color; ctx.fill();
                ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 2; ctx.stroke();
            }
        });

        if (this.hoveredCurve && !this.hoveredPoint) {
            const hc = this.hoveredCurve, sx = this.x2s(hc.x), sy = this.y2s(hc.y);
            ctx.fillStyle = withAlpha(hc.layer.color, 0.3);
            ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = hc.layer.color; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.stroke();
        }
        ctx.restore();
    }

    /** 在特征点旁标注坐标；自动避让，点太多时不标注 */
    drawPointLabels(t) {
        if (t < 1 || this.isDragging || this.viewAnim) return;
        const pts = (this.plotData.points || []).filter(p => this.isLayerVisible(p.layerId));
        const shown = pts.map(p => ({ p, sx: this.x2s(p.x), sy: this.y2s(p.y) }))
            .filter(o => o.sx > 8 && o.sx < this.width - 8 && o.sy > 8 && o.sy < this.height - 8);
        if (!shown.length || shown.length > 9) return;

        const ctx = this.ctx;
        ctx.font = `500 11px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
        ctx.textBaseline = 'middle';
        const taken = [];
        shown.forEach(({ p, sx, sy }) => {
            const text = `(${formatCoord(p.x)}, ${formatCoord(p.y)})`;
            const w = ctx.measureText(text).width + 12, h = 18;
            const tries = [[10, -22], [10, 8], [-w - 10, -22], [-w - 10, 8]];
            for (const [dx, dy] of tries) {
                const rect = { x: sx + dx, y: sy + dy, w, h };
                if (rect.x < 4 || rect.x + w > this.width - 4 || rect.y < 4 || rect.y + h > this.height - 4) continue;
                if (taken.some(r => rect.x < r.x + r.w && rect.x + rect.w > r.x && rect.y < r.y + r.h && rect.y + rect.h > r.y)) continue;
                taken.push(rect);
                ctx.fillStyle = 'rgba(11, 19, 37, 0.82)';
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(rect.x, rect.y, w, h, 5); else ctx.rect(rect.x, rect.y, w, h);
                ctx.fill();
                ctx.strokeStyle = withAlpha(p.color || '#4cc2ff', 0.55);
                ctx.lineWidth = 1; ctx.stroke();
                ctx.fillStyle = '#e8edf5'; ctx.textAlign = 'left';
                ctx.fillText(text, rect.x + 6, rect.y + h / 2 + 0.5);
                break;
            }
        });
    }
}
