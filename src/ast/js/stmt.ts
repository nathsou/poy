import { DataType, genConstructors, match } from "itsamatch";
import { Name } from "../../codegen/js/jsScope";
import { Impl, Show } from "../../misc/traits";
import { AssignmentOp } from "../../parse/token";
import { Expr } from "./expr";

export type Stmt = DataType<{
    Expr: { expr: Expr },
    Const: { name: Name, value: Expr },
    Let: { name: Name, value?: Expr },
    If: { cond: Expr, then: Stmt[], otherwise?: Stmt[] },
    Assign: { lhs: Expr, op: AssignmentOp, rhs: Expr },
    Return: { value: Expr },
    While: { cond: Expr, body: Stmt[] },
}>;

export const Stmt = {
    ...genConstructors<Stmt>(['Const', 'Let', 'If']),
    Expr: (expr: Expr) => ({ variant: 'Expr', expr }) satisfies Stmt,
    Return: (value: Expr) => ({ variant: 'Return', value }) satisfies Stmt,
    Assign: (lhs: Expr, op: AssignmentOp, rhs: Expr) => ({ variant: 'Assign', lhs, op, rhs }) satisfies Stmt,
    While: (cond: Expr, body: Stmt[]) => ({ variant: 'While', cond, body }) satisfies Stmt,
    show,
    showStmts,
} satisfies Impl<Show<Stmt>>;

function showStmts(stmts: Stmt[], indentLevel: number = 0): string {
    return stmts
        .map(stmt => show(stmt, indentLevel))
        .filter(line => line.length > 0)
        .join('\n');
}

function show(stmt: Stmt, indentLevel: number = 0): string {
    const indent = '  '.repeat(indentLevel);
    return match(stmt, {
        Expr: ({ expr }) => {
            if (expr.variant === 'Literal' && expr.literal.variant === 'Unit') {
                return '';
            }
            return `${indent}${Expr.show(expr)};`;
        },
        Const: ({ name, value }) => {
            if (value.variant === 'Closure') {
                return `${indent}function ${name.mangled}(${value.args.map(arg => arg.name.mangled).join(', ')}) {\n${showStmts(value.stmts, indentLevel + 1)}\n${indent}}`;
            }
            return `${indent}const ${name.mangled} = ${Expr.show(value)};`;
        },
        Let: ({ name, value }) => `${indent}let ${name.mangled}${value ? ` = ${Expr.show(value)}` : ''};`,
        If: ({ cond, then, otherwise }) => {
            const then_ = showStmts(then, indentLevel + 1);
            if (!otherwise) {
                return `${indent}if (${Expr.show(cond)}) {\n${then_}\n${indent}}`;
            }
            const otherwise_ = showStmts(otherwise, indentLevel + 1);
            return `${indent}if (${Expr.show(cond)}) {\n${then_}\n${indent}} else {\n${otherwise_}\n${indent}}`;
        },
        Assign: ({ lhs, op, rhs }) => `${indent}${Expr.show(lhs)} ${op} ${Expr.show(rhs)};`,
        Return: ({ value }) => `${indent}return ${Expr.show(value)};`,
        While: ({ cond, body }) => {
            const body_ = showStmts(body, indentLevel + 1);
            return `${indent}while (${Expr.show(cond)}) {\n${body_}\n${indent}}`;
        },
    });
}
