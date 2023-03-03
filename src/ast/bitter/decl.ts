import { DataType, genConstructors } from 'itsamatch';
import { Type } from '../../infer/type';
import { Stmt } from './stmt';

export type Decl = DataType<{
    Stmt: { stmt: Stmt },
    Type: { lhs: Type, rhs: Type },
    Declare: { name: string, ty: Type },
    Module: { name: string, decls: Decl[] },
}>;

export type FunctionArgument = {
    name: string,
    ty: Type,
};

export const Decl = {
    ...genConstructors<Decl>(['Module', 'Declare']),
    Stmt: (stmt: Stmt): Decl => ({ variant: 'Stmt', stmt }),
    Type: (lhs: Type, rhs: Type): Decl => ({ variant: 'Type', lhs, rhs }),
};
