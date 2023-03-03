import { DataType, genConstructors, match } from "itsamatch";
import { Impl, Show } from "../../misc/traits";
import { Literal } from "../../parse/token";
import { Stmt } from "./stmt";
import { TSType } from "./tsType";

type Typed<T> = { [K in keyof T]: T[K] & { ty: TSType } };

export type Expr = DataType<Typed<{
    Literal: { literal: Literal },
    Variable: { name: string },
    Unary: { op: string, expr: Expr },
    Binary: { lhs: Expr, op: string, rhs: Expr },
    Ternary: { cond: Expr, then: Expr, otherwise: Expr },
    Array: { elems: Expr[] },
    Closure: { args: { name: string, ty: TSType }[], stmts: Stmt[] },
    Call: { fun: Expr, args: Expr[] },
    Paren: { expr: Expr },
    Object: { entries: { key: string, value: Expr }[] },
}>>;

export const Expr = {
    ...genConstructors<Expr>([
        'Literal', 'Unary', 'Binary', 'Ternary',
        'Array', 'Closure', 'Object',
    ]),
    Variable: (name: string, ty: TSType): Expr => ({ variant: 'Variable', name, ty }) as const,
    Paren: (expr: Expr): Expr => ({ variant: 'Paren', expr, ty: expr.ty }) as const,
    Call: (fun: Expr, args: Expr[]): Expr => ({
        variant: 'Call',
        fun,
        args,
        ty: TSType.Ref({ name: 'ReturnType', args: [fun.ty] }),
    }) as const,
    show,
} satisfies Impl<Show<Expr>>;

function show(expr: Expr): string {
    return match(expr, {
        Literal: ({ literal }) => match(literal, {
            Unit: () => 'undefined',
            Bool: q => q ? 'true' : 'false',
            Num: x => x.toString(),
            Str: s => `"${s}"`,
        }),
        Variable: ({ name }) => name,
        Unary: ({ op, expr }) => `${op}${show(expr)}`,
        Binary: ({ lhs, op, rhs }) => `(${show(lhs)} ${op} ${show(rhs)})`,
        Ternary: ({ cond, then, otherwise }) => `(${show(cond)} ? ${show(then)} : ${show(otherwise)})`,
        Array: ({ elems }) => `[${elems.map(show).join(', ')}]`,
        Closure: ({ args, stmts }) => `(${args.map(({ name }) => name).join(', ')}) => {\n${stmts.map(Stmt.show).join('\n')}\n}`,
        Call: ({ fun, args }) => `${show(fun)}(${args.map(show).join(', ')})`,
        Paren: ({ expr }) => `(${show(expr)})`,
        Object: ({ entries }) => {
            const entriesFmt = entries.map(({ key, value }) =>
                value.variant === 'Variable' && value.name === key ?
                    key : `${key}: ${show(value)}`
            );

            return `{ ${entriesFmt.join(', ')} }`;
        },
    });
}
