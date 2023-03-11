import { DataType, genConstructors } from 'itsamatch';
import { Type } from '../../infer/type';
import { Stmt } from './stmt';

export type ImportMemberKind = 'value' | 'module' | 'type';

export type Decl = DataType<{
    Stmt: { stmt: Stmt },
    Type: TypeDecl,
    Module: ModuleDecl,
    Declare: { sig: Signature },
    Import: {
        path: string[],
        module: string,
        members?: { name: string, kind?: ImportMemberKind }[],
    },
    Struct: StructDecl,
    Extend: ExtendDecl,
    _Many: { decls: Decl[] },
}>;

export const Decl = {
    ...genConstructors<Decl>(['Module', 'Import', 'Type', 'Struct', 'Extend', '_Many']),
    Stmt: (stmt: Stmt) => ({ variant: 'Stmt', stmt }) satisfies Decl,
    Declare: (sig: Signature) => ({ variant: 'Declare', sig }) satisfies Decl,
};

export type TypeDecl = {
    pub: boolean,
    lhs: Type,
    rhs: Type,
};

export type ModuleDecl = {
    pub: boolean,
    name: string,
    decls: Decl[],
};

export type Signature = DataType<{
    Variable: { mutable: boolean, name: string, ty: Type },
    Module: { name: string, signatures: Signature[] },
    Type: TypeDecl,
}>;

export type StructDecl = {
    pub: boolean,
    name: string,
    fields: { mut: boolean, name: string, ty: Type }[],
};

export type ExtendDecl = {
    subject: Type,
    decls: Decl[],
    uuid: string,
};
