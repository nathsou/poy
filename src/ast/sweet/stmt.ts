import { DataType, genConstructors } from "itsamatch";
import { Type } from "../../infer/type";
import { Expr } from "./expr";

export type Stmt = DataType<{
    Expr: { expr: Expr },
    Let: { mutable: boolean, ann?: Type, name: string, value: Expr },
    _Many: { stmts: Stmt[] },
}>;

export const Stmt = {
    ...genConstructors<Stmt>(['Let', '_Many']),
    Expr: (expr: Expr): Stmt => ({ variant: 'Expr', expr }) as const,
};
