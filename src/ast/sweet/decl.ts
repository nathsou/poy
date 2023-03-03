import { DataType, genConstructors } from 'itsamatch';
import { Type } from '../../infer/type';
import { Stmt } from './stmt';

export type Decl = DataType<{
    Stmt: { stmt: Stmt },
    Type: TypeDecl,
    Module: ModuleDecl,
    Declare: { name: string, ty: Type },
    _Many: { decls: Decl[] },
}>;

export const Decl = {
    ...genConstructors<Decl>(['Module', 'Declare', '_Many']),
    Stmt: (stmt: Stmt): Decl => ({ variant: 'Stmt', stmt }),
    Type: (lhs: Type, rhs: Type): Decl => ({ variant: 'Type', lhs, rhs }),
};

export type TypeDecl = {
    lhs: Type,
    rhs: Type,
};

export type ModuleDecl = {
    name: string,
    decls: Decl[],
};
