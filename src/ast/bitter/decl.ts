import { DataType, genConstructors, VariantOf } from 'itsamatch';
import { Type } from '../../infer/type';
import { Decl as SweetDecl, Signature, EnumVariant } from '../sweet/decl';
import { Stmt } from './stmt';
import { Attributes } from '../sweet/attribute';

export type Decl = DataType<{
    Stmt: { stmt: Stmt };
    Type: { lhs: Type; rhs: Type };
    Declare: { sig: Signature; attrs: Attributes };
    Module: { name: string; decls: Decl[] };
    Import: {
        path: string[];
        module: string;
        members?: VariantOf<SweetDecl, 'Import'>['members'];
    };
    Struct: {
        pub: boolean;
        name: string;
        fields: { mut: boolean; name: string; ty: Type }[];
    };
    Extend: { subject: Type; decls: Decl[]; uuid: string };
    Enum: {
        pub: boolean;
        name: string;
        variants: EnumVariant[];
    };
}>;

export type FunctionArgument = {
    name: string;
    ty: Type;
};

export const Decl = {
    ...genConstructors<Decl>([
        'Module',
        'Declare',
        'Import',
        'Struct',
        'Extend',
        'Enum',
    ]),
    Stmt: (stmt: Stmt): Decl => ({ variant: 'Stmt', stmt }),
    Type: (lhs: Type, rhs: Type): Decl => ({ variant: 'Type', lhs, rhs }),
};
