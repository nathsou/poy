import { DataType, genConstructors } from "itsamatch";
import { Type } from "../../infer/type";
import { AssignmentOp } from "../../parse/token";
import { Expr } from "./expr";

export type Stmt = DataType<{
    Expr: { expr: Expr },
    Let: { pub: boolean, mutable: boolean, name: string, ann?: Type, value: Expr },
    Assign: { lhs: Expr, op: AssignmentOp, rhs: Expr },
    While: { cond: Expr, body: Stmt[] },
    Return: { expr: Expr },
    _Many: { stmts: Stmt[] },
}>;

export const Stmt = {
    ...genConstructors<Stmt>(['Let', '_Many']),
    Expr: (expr: Expr): Stmt => ({ variant: 'Expr', expr }) satisfies Stmt,
    Assign: (lhs: Expr, op: AssignmentOp, rhs: Expr) => ({ variant: 'Assign', lhs, op, rhs }) satisfies Stmt,
    While: (cond: Expr, body: Stmt[]) => ({ variant: 'While', cond, body }) satisfies Stmt,
    Return: (expr: Expr) => ({ variant: 'Return', expr }) satisfies Stmt,
};
