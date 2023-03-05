import { DataType, genConstructors } from "itsamatch";
import { AssignmentOp } from "../../parse/token";
import { Expr } from "./expr";

export type Stmt = DataType<{
    Expr: { expr: Expr },
    Let: { mutable: boolean, name: string, value: Expr },
    Assign: { lhs: Expr, op: AssignmentOp, rhs: Expr },
    While: { cond: Expr, body: Stmt[] },
}>;

export const Stmt = {
    ...genConstructors<Stmt>(['Let']),
    Expr: (expr: Expr) => ({ variant: 'Expr', expr }) satisfies Stmt,
    Assign: (lhs: Expr, op: AssignmentOp, rhs: Expr) => ({ variant: 'Assign', lhs, op, rhs }) satisfies Stmt,
    While: (cond: Expr, body: Stmt[]) => ({ variant: 'While', cond, body }) satisfies Stmt,
};
