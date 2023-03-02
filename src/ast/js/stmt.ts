import { DataType, genConstructors, match } from "itsamatch";
import { Impl, Show } from "../../misc/traits";
import { Expr } from "./expr";

export type Stmt = DataType<{
    Expr: { expr: Expr },
    Let: { const_: boolean, name: string, value: Expr },
    Return: { value: Expr },
}>;

export const Stmt = {
    ...genConstructors<Stmt>(['Let']),
    Expr: (expr: Expr): Stmt => ({ variant: 'Expr', expr }) as const,
    Return: (value: Expr): Stmt => ({ variant: 'Return', value }) as const,
    show,
} satisfies Impl<Show<Stmt>>;

function show(stmt: Stmt): string {
    return match(stmt, {
        Expr: ({ expr }) => `${Expr.show(expr)};`,
        Let: ({ const_, name, value }) => `${const_ ? 'const' : 'let'} ${name} = ${Expr.show(value)};`,
        Return: ({ value }) => `return ${Expr.show(value)};`,
    });
}
