import { DataType, genConstructors, VariantOf } from 'itsamatch';
import { Type } from '../../infer/type';
import { Stmt } from './stmt';

export type Decl = DataType<{
    Stmt: { stmt: Stmt },
    Type: TypeDecl,
    Module: ModuleDecl,
    Declare: { sig: Signature },
    _Many: { decls: Decl[] },
}>;

export const Decl = {
    ...genConstructors<Decl>(['Module', '_Many']),
    Stmt: (stmt: Stmt) => ({ variant: 'Stmt', stmt }) satisfies Decl,
    Type: (lhs: Type, rhs: Type) => ({ variant: 'Type', lhs, rhs }) satisfies Decl,
    Declare: (sig: Signature) => ({ variant: 'Declare', sig }) satisfies Decl,
};

export type TypeDecl = {
    lhs: Type,
    rhs: Type,
};

export type ModuleDecl = {
    name: string,
    decls: Decl[],
};

export type Signature = DataType<{
    Variable: { mutable: boolean, name: string, ty: Type },
    Module: { name: string, signatures: Signature[] },
    Type: TypeDecl,
}>;
