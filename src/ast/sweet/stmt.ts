import { DataType, genConstructors } from "itsamatch";
import { Type } from "../../infer/type";
import { Expr } from "./expr";

export type Stmt = DataType<{
    Expr: { expr: Expr },
    Let: { mutable: boolean, name: string, ann?: Type, value: Expr },
    Assign: { lhs: Expr, rhs: Expr },
    _Many: { stmts: Stmt[] },
}>;

export const Stmt = {
    ...genConstructors<Stmt>(['Let', '_Many']),
    Expr: (expr: Expr): Stmt => ({ variant: 'Expr', expr }) as const,
    Assign: (lhs: Expr, rhs: Expr): Stmt => ({ variant: 'Assign', lhs, rhs }) as const,
};
