import { DataType, genConstructors, match } from "itsamatch";
import { Name } from "../../codegen/js/jsScope";
import { Impl, Show } from "../../misc/traits";
import { Expr } from "./expr";

export type Stmt = DataType<{
    Expr: { expr: Expr },
    Const: { name: Name, value: Expr },
    Let: { name: Name, value?: Expr },
    If: { cond: Expr, then: Stmt[], otherwise: Stmt[] },
    Assign: { lhs: Expr, rhs: Expr },
    Return: { value: Expr },
}>;

export const Stmt = {
    ...genConstructors<Stmt>(['Const', 'Let', 'If']),
    Expr: (expr: Expr): Stmt => ({ variant: 'Expr', expr }) as const,
    Return: (value: Expr): Stmt => ({ variant: 'Return', value }) as const,
    Assign: (lhs: Expr, rhs: Expr): Stmt => ({ variant: 'Assign', lhs, rhs }) as const,
    show,
} satisfies Impl<Show<Stmt>>;

function show(stmt: Stmt): string {
    return match(stmt, {
        Expr: ({ expr }) => `${Expr.show(expr)};`,
        Const: ({ name, value }) => {
            if (value.variant === 'Closure') {
                return `function ${name.mangled}(${value.args.map(arg => arg.name.mangled).join(', ')}) {\n${value.stmts.map(Stmt.show).join('\n')}\n}`;
            }

            return `const ${name.mangled} = ${Expr.show(value)};`;
        },
        Let: ({ name, value }) => `let ${name.mangled}${value ? ` = ${Expr.show(value)}` : ''};`,
        If: ({ cond, then, otherwise }) => {
            const then_ = then.map(Stmt.show).join('\n');
            const otherwise_ = otherwise.map(Stmt.show).join('\n');
            return `if (${Expr.show(cond)}) {\n${then_}\n} else {\n${otherwise_}\n}`;
        },
        Assign: ({ lhs, rhs }) => `${Expr.show(lhs)} = ${Expr.show(rhs)};`,
        Return: ({ value }) => `return ${Expr.show(value)};`,
    });
}
