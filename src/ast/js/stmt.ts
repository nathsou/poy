import { DataType, constructors, match } from 'itsamatch';
import { Name } from '../../codegen/js/jsScope';
import { Constructors, Impl, Show } from '../../misc/traits';
import { AssignmentOp } from '../../parse/token';
import { Expr } from './expr';

export type Stmt = DataType<{
    Expr: { expr: Expr };
    Const: { name: Name; value: Expr };
    Let: { name: Name; value?: Expr };
    If: { branches: { cond?: Expr; then: Stmt[] }[] };
    Assign: { lhs: Expr; op: AssignmentOp; rhs: Expr };
    Return: { value: Expr };
    Yield: { value: Expr };
    Break: {};
    While: { cond: Expr; body: Stmt[] };
    For: { name: Name; iterator: Expr; body: Stmt[] };
}>;

export const Stmt = {
    ...constructors<Stmt>().get('Const', 'Let', 'If'),
    Expr: (expr: Expr) => ({ variant: 'Expr', expr }) satisfies Stmt,
    Return: (value: Expr) => ({ variant: 'Return', value }) satisfies Stmt,
    Yield: (value: Expr) => ({ variant: 'Yield', value }) satisfies Stmt,
    Break: () => ({ variant: 'Break' }) satisfies Stmt,
    Assign: (lhs: Expr, op: AssignmentOp, rhs: Expr) =>
        ({ variant: 'Assign', lhs, op, rhs }) satisfies Stmt,
    While: (cond: Expr, body: Stmt[]) =>
        ({ variant: 'While', cond, body }) satisfies Stmt,
    For: (name: Name, iterator: Expr, body: Stmt[]) =>
        ({ variant: 'For', name, iterator, body }) satisfies Stmt,
    show,
    showStmts,
} satisfies Impl<Show<Stmt> & Constructors<Stmt>>;

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
                return `${indent}function ${name.mangled}(${value.args
                    .map(arg => arg.name.mangled)
                    .join(', ')}) {\n${showStmts(
                    value.stmts,
                    indentLevel + 1,
                )}\n${indent}}`;
            }
            return `${indent}const ${name.mangled} = ${Expr.show(value)};`;
        },
        Let: ({ name, value }) =>
            `${indent}let ${name.mangled}${
                value ? ` = ${Expr.show(value)}` : ''
            };`,
        If: ({ branches }) => {
            const parts = branches.map(({ cond, then }, index) => {
                const then_ = showStmts(then, indentLevel + 1);

                if (!cond) {
                    return `{\n${then_}\n${indent}}`;
                }

                return `${index === 0 ? indent : ''}if (${Expr.show(
                    cond,
                )}) {\n${then_}\n${indent}}`;
            });

            return parts.join(' else ');
        },
        Assign: ({ lhs, op, rhs }) =>
            `${indent}${Expr.show(lhs)} ${op} ${Expr.show(rhs)};`,
        Return: ({ value }) => `${indent}return ${Expr.show(value)};`,
        Yield: ({ value }) => `${indent}yield ${Expr.show(value)};`,
        Break: () => `${indent}break;`,
        While: ({ cond, body }) => {
            const body_ = showStmts(body, indentLevel + 1);
            return `${indent}while (${Expr.show(
                cond,
            )}) {\n${body_}\n${indent}}`;
        },
        For: ({ name, iterator, body }) => {
            const body_ = showStmts(body, indentLevel + 1);
            return `${indent}for (const ${name.mangled} of ${Expr.show(
                iterator,
            )}) {\n${body_}\n${indent}}`;
        },
    });
}
