import { DataType, genConstructors } from "itsamatch";
import { Expr } from "./expr";

export type Stmt = DataType<{
    Expr: { expr: Expr },
    Let: { mutable: boolean, name: string, value: Expr },
    Assign: { lhs: Expr, rhs: Expr },
}>;

export const Stmt = {
    ...genConstructors<Stmt>(['Let']),
    Expr: (expr: Expr): Stmt => ({ variant: 'Expr', expr }) as const,
    Assign: (lhs: Expr, rhs: Expr): Stmt => ({ variant: 'Assign', lhs, rhs }) as const,
};
