// router.js —— 算子路由与参数分发中枢
import {
    solveDerivative,
    solveIntegral,
    solveLimit,
    solveEquation,
    solveEquationSystem,
    solveInequality,
    solveImplicitCurve,
    solveFunctionDeclaration,
    solveGeneralAlgebra,
    solveODE,
    solveSeries
} from './solvers.js';
import { freeSymbols } from './mathcore.js';

function isNothing(val) {
    return val === undefined || val === null || val === 'Nothing' || val === '' ||
        (typeof val === 'object' && val?.name === 'Nothing');
}

const INEQUALITIES = new Set(['Less', 'LessEqual', 'Greater', 'GreaterEqual']);
const isEquation = (n) => Array.isArray(n) && n[0] === 'Equal';

// 递归检测 AST 是否包含导数记号 (y', f'(x), dy/dx, y'' 等)
function hasDifferentialTerms(node) {
    if (!node) return false;
    if (typeof node === 'string') {
        return node === "y'" || node === 'dy' || node.includes('Prime') || node.includes('Derivative');
    }
    if (Array.isArray(node)) {
        const [op, ...args] = node;
        if (op === 'Prime' || op === 'Derivative' || op === 'D') return true;
        if (Array.isArray(op) && (op[0] === 'Prime' || op[0] === 'Derivative')) return true;
        if (op === 'Divide' && args[0] === 'dy' && args[1] === 'dx') return true;
        return hasDifferentialTerms(op) || args.some(hasDifferentialTerms);
    }
    return false;
}

// 安全提取方程中的主未知数
function getEquationVariable(targetAst) {
    const syms = [...freeSymbols(targetAst)];
    if (syms.includes('x')) return 'x';
    return syms[0] || 'x';
}

/**
 * 解析极限趋近点与方向。
 * 兼容 0^+ (Superplus)、0^- (Superminus)、Power(0, +/-) 以及第三个方向参数。
 */
function extractLimitPoint(pointNode, dirNode) {
    let point = pointNode;
    let direction = 'both';
    const dirOf = (d) => {
        if (d === 1 || d === '1' || d === '+' || d === 'Plus' || d === 'Above' || d === 'Right') return '+';
        if (d === -1 || d === '-1' || d === '-' || d === 'Minus' || d === 'Below' || d === 'Left') return '-';
        if (Array.isArray(d) && d[0] === 'Negate') return '-';
        return null;
    };
    if (Array.isArray(pointNode)) {
        if (pointNode[0] === 'Superplus') { point = pointNode[1]; direction = '+'; }
        else if (pointNode[0] === 'Superminus') { point = pointNode[1]; direction = '-'; }
        else if (pointNode[0] === 'Power' && dirOf(pointNode[2])) { point = pointNode[1]; direction = dirOf(pointNode[2]); }
    }
    if (direction === 'both' && dirNode !== undefined && !isNothing(dirNode)) {
        direction = dirOf(dirNode) || 'both';
    }
    return { point, direction };
}

export function routeCalculation(ast, ce) {
    if (!ast) return { resultLatex: "", steps: [] };

    try {
        let targetAst = ast;
        let conditionExpr = null;

        // 容器：方程组 或 (目标, 条件)
        if (Array.isArray(ast) && ['Tuple', 'Sequence', 'List', 'System', 'Delimiter'].includes(ast[0])) {
            const items = ast.slice(1).filter(x => !isNothing(x));
            if (items.length >= 2 && items.every(isEquation) && !items.some(hasDifferentialTerms)) {
                return solveEquationSystem({ equations: items }, ce);
            }
            if (items.length === 1) {
                targetAst = items[0];
            } else {
                targetAst = items[0];
                conditionExpr = items[1] || null;
            }
        }

        if (!Array.isArray(targetAst)) {
            return solveGeneralAlgebra({ targetExpr: targetAst, conditionExpr }, ce);
        }

        const [operator, ...operands] = targetAst;

        switch (operator) {
            case 'D':
            case 'Derivative': {
                const targetExpr = operands[0];
                const variable = typeof operands[1] === 'string' ? operands[1] : 'x';
                const order = typeof operands[2] === 'number' ? operands[2] : (typeof operands[1] === 'number' ? operands[1] : 1);
                return solveDerivative({ targetExpr, variable, order, conditionExpr }, ce);
            }

            case 'Integrate': {
                const targetExpr = operands[0];
                let variable = 'x';
                let lower = null;
                let upper = null;
                let isDefinite = false;

                const boundNode = operands[1];
                if (typeof boundNode === 'string') {
                    variable = boundNode;
                    if (operands.length >= 4 && !isNothing(operands[2]) && !isNothing(operands[3])) {
                        isDefinite = true;
                        lower = operands[2];
                        upper = operands[3];
                    }
                } else if (Array.isArray(boundNode) && (boundNode[0] === 'Limits' || boundNode[0] === 'Tuple')) {
                    variable = boundNode[1] || 'x';
                    const l = boundNode[2];
                    const u = boundNode[3];
                    if (!isNothing(l) && !isNothing(u)) {
                        isDefinite = true;
                        lower = l;
                        upper = u;
                    }
                } else if (operands.length >= 3 && !isNothing(operands[1]) && !isNothing(operands[2])) {
                    isDefinite = true;
                    lower = operands[1];
                    upper = operands[2];
                }

                return solveIntegral({ targetExpr, variable, lower, upper, isDefinite, conditionExpr }, ce);
            }

            case 'Limit': {
                const targetExpr = operands[0];
                const conditionNode = operands[1];
                let variable = 'x';
                let pointNode = 0;
                let dirNode = operands[2];

                if (Array.isArray(conditionNode) && conditionNode[0] === 'Equal') {
                    variable = conditionNode[1] || 'x';
                    pointNode = conditionNode[2] !== undefined ? conditionNode[2] : 0;
                } else if (conditionNode !== undefined) {
                    pointNode = conditionNode;
                    if (typeof operands[2] === 'string' && operands[2].length === 1 && /[a-z]/i.test(operands[2])) { variable = operands[2]; dirNode = operands[3]; }
                }
                const { point, direction } = extractLimitPoint(pointNode, dirNode);
                return solveLimit({ targetExpr, variable, targetValue: point, direction, conditionExpr }, ce);
            }

            case 'Sum':
            case 'Product': {
                const body = operands[0];
                const range = operands[1];
                let variable = 'n', lower = 1, upper = 'PositiveInfinity';
                if (Array.isArray(range) && (range[0] === 'Tuple' || range[0] === 'Limits' || range[0] === 'Triple')) {
                    variable = range[1] || 'n';
                    if (!isNothing(range[2])) lower = range[2];
                    if (!isNothing(range[3])) upper = range[3];
                } else if (typeof range === 'string') {
                    variable = range;
                    if (!isNothing(operands[2])) lower = operands[2];
                    if (!isNothing(operands[3])) upper = operands[3];
                }
                return solveSeries({ kind: operator, body, variable, lower, upper }, ce);
            }

            case 'Less':
            case 'LessEqual':
            case 'Greater':
            case 'GreaterEqual': {
                if (operands.length === 2) return solveInequality({ lhs: operands[0], rhs: operands[1], rel: operator }, ce);
                return solveGeneralAlgebra({ targetExpr: targetAst, conditionExpr }, ce);
            }

            case 'Equal': {
                const [lhs, rhs] = operands;

                // 分支 1：常微分方程 (含 y', y'', f'(x), dy/dx)
                if (hasDifferentialTerms(lhs) || hasDifferentialTerms(rhs)) {
                    return solveODE({ lhs, rhs, conditionExpr }, ce);
                }

                const syms = [...freeSymbols(targetAst)];

                // 分支 2：显函数定义 (如 y = x + 1, f(x) = x^2)，右侧不含因变量
                const isFuncLHS = lhs === 'y' ||
                    (Array.isArray(lhs) && (lhs[0] === 'f' || lhs[0] === 'g' || lhs[0] === 'Apply' || lhs[0] === 'Function'));
                if (isFuncLHS && !freeSymbols(rhs).has('y')) {
                    return solveFunctionDeclaration({ name: lhs, expr: rhs, conditionExpr }, ce);
                }

                // 分支 3：二元方程 → 平面曲线 (如 x^2 + y^2 = 4、x + 2y = 3)
                if (syms.length === 2 && syms.includes('x') && syms.includes('y')) {
                    return solveImplicitCurve({ lhs, rhs, vars: ['x', 'y'] }, ce);
                }

                // 分支 4：没有未知数 (如 2 + 2 = 4)
                if (syms.length === 0) {
                    return solveGeneralAlgebra({ targetExpr: targetAst, conditionExpr }, ce);
                }

                // 分支 5：一元方程求解
                const variable = getEquationVariable(targetAst);
                return solveEquation({ lhs, rhs, variable, conditionExpr }, ce);
            }

            default:
                return solveGeneralAlgebra({ targetExpr: targetAst, conditionExpr }, ce);
        }
    } catch (err) {
        console.error("Calculation router error:", err);
        return {
            resultLatex: `\\text{计算出现异常: } ${String(err.message || '未知错误').replace(/[\\{}_^#%&$~]/g, ' ')}`,
            steps: [
                { title: "推导异常中断", latex: `\\text{错误信息: } ${String(err.message || '格式无法解析').replace(/[\\{}_^#%&$~]/g, ' ')}` }
            ],
            plotData: null
        };
    }
}
