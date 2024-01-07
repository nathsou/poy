import { DataType, genConstructors, match } from 'itsamatch';
import { Type } from '../../infer/type';
import { Stmt } from './stmt';
import { Attributes } from './attribute';

export type ImportMemberKind = 'value' | 'module' | 'type';

export type Decl = DataType<{
    Stmt: { stmt: Stmt };
    Type: TypeDecl;
    Module: ModuleDecl;
    Declare: { sig: Signature; attrs: Attributes };
    Import: {
        path: string[];
        module: string;
        members: { name: string; native: boolean; kind?: ImportMemberKind }[];
    };
    Struct: StructDecl;
    Extend: ExtendDecl;
    Enum: EnumDecl;
    _Many: { decls: Decl[] };
}>;

export const Decl = {
    ...genConstructors<Decl>([
        'Module',
        'Import',
        'Type',
        'Struct',
        'Extend',
        'Enum',
        '_Many',
    ]),
    Stmt: (stmt: Stmt) => ({ variant: 'Stmt', stmt }) satisfies Decl,
    Declare: (sig: Signature, attrs: Attributes = {}) =>
        ({ variant: 'Declare', sig, attrs }) satisfies Decl,
};

export type TypeDecl = {
    pub: boolean;
    lhs: Type;
    rhs: Type;
};

export type ModuleDecl = {
    pub: boolean;
    name: string;
    params: string[];
    decls: Decl[];
};

export type Signature = DataType<{
    Variable: {
        static: boolean;
        mut: boolean;
        params: string[];
        name: string;
        ty: Type;
    };
    Module: { name: string; signatures: Signature[] };
    Type: TypeDecl;
}>;

export const Signature = genConstructors<Signature>([
    'Variable',
    'Module',
    'Type',
]);

export type StructDecl = {
    pub: boolean;
    name: string;
    params: string[];
    fields: { mut: boolean; name: string; ty: Type }[];
};

export type ExtendDecl = {
    params: string[];
    subject: Type;
    decls: Decl[];
    uuid: string;
};

export type EnumVariant = DataType<{
    Empty: { name: string };
    Tuple: { name: string; args: Type[] };
    Struct: { name: string; fields: { name: string; ty: Type }[] };
}>;

export const EnumVariant = genConstructors<EnumVariant>([
    'Empty',
    'Tuple',
    'Struct',
]);

export type EnumDecl = {
    pub: boolean;
    name: string;
    params: string[];
    variants: EnumVariant[];
};
