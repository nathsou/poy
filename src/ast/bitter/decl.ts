import { DataType, VariantOf, constructors } from 'itsamatch';
import { Type } from '../../infer/type';
import { Constructors, Impl } from '../../misc/traits';
import { Attributes } from '../sweet/attribute';
import { EnumVariant, Signature, Decl as SweetDecl } from '../sweet/decl';
import { Stmt } from './stmt';

export type Decl = DataType<{
  Stmt: { stmt: Stmt };
  Type: { lhs: Type; rhs: Type };
  Declare: { sig: Signature; attrs: Attributes };
  Module: { pub: boolean, name: string; decls: Decl[] };
  Import: {
    pub: boolean;
    path: string[];
    module: string;
    members?: VariantOf<SweetDecl, 'Import'>['members'];
  };
  Struct: {
    pub: boolean;
    name: string;
    fields: { mut: boolean; name: string; ty: Type }[];
  };
  Extend: { subject: Type; decls: Decl[]; suffix: string };
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
  ...constructors<Decl>().get('Module', 'Declare', 'Import', 'Struct', 'Extend', 'Enum'),
  Stmt: (stmt: Stmt) => ({ variant: 'Stmt', stmt }),
  Type: (lhs: Type, rhs: Type) => ({ variant: 'Type', lhs, rhs }),
} satisfies Impl<Constructors<Decl>>;
