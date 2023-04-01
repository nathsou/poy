import { DataType, genConstructors, VariantOf } from 'itsamatch';
import { Type } from '../../infer/type';
import { Decl as SweetDecl, Signature } from '../sweet/decl';
import { Stmt } from './stmt';

export type Decl = DataType<{
    Stmt: { stmt: Stmt },
    Type: { lhs: Type, rhs: Type },
    Declare: { sig: Signature },
    Module: { name: string, decls: Decl[] },
    Import: {
        path: string[],
        module: string,
        members?: VariantOf<SweetDecl, 'Import'>['members'],
    },
    Struct: {
        pub: boolean,
        name: string,
        fields: { mut: boolean, name: string, ty: Type }[],
    },
    Extend: { subject: Type, decls: Decl[], uuid: string },
}>;

export type FunctionArgument = {
    name: string,
    ty: Type,
};

export const Decl = {
    ...genConstructors<Decl>(['Module', 'Declare', 'Import', 'Struct', 'Extend']),
    Stmt: (stmt: Stmt): Decl => ({ variant: 'Stmt', stmt }),
    Type: (lhs: Type, rhs: Type): Decl => ({ variant: 'Type', lhs, rhs }),
};
