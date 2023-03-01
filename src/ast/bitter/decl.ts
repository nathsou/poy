import { DataType, genConstructors } from 'itsamatch';
import { Type } from '../../infer/type';
import { Expr } from './expr';

export type Decl = DataType<{
    Let: {
        mutable: boolean,
        name: string,
        value: Expr,
    },
    Fun: {
        name: string,
        args: FunctionArgument[],
        body: Expr,
    },
    Type: { lhs: Type, rhs: Type },
    Module: { name: string, decls: Decl[] },
}>;

export type FunctionArgument = {
    name: string,
    ty: Type,
};

export const Decl = {
    ...genConstructors<Decl>(['Let', 'Fun', 'Module']),
    Type: (lhs: Type, rhs: Type): Decl => ({ variant: 'Type', lhs, rhs }),
};
