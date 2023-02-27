import { DataType, genConstructors } from 'itsamatch';
import { Type, TypeVar } from '../../infer/type';
import { Expr } from './expr';

export type Decl = DataType<{
    Let: LetDecl,
    Fun: FunDecl,
    Type: TypeDecl,
    Module: ModuleDecl,
}>;

export const Decl = {
    ...genConstructors<Decl>(['Let', 'Fun', 'Module']),
    Type: (lhs: Type, rhs: Type): Decl => {
        const lhsVars = Type.vars(lhs);
        // Rewrite the RHS to use the same type variable ids as the LHS.
        const newRhs = Type.rewrite(rhs, ty => {
            if (
                ty.variant === 'Var' &&
                ty.ref.variant === 'Unbound' &&
                ty.ref.name != null &&
                lhsVars.has(ty.ref.name)
            ) {
                return Type.Var(TypeVar.Unbound({
                    id: lhsVars.get(ty.ref.name)!,
                    name: ty.ref.name,
                    level: ty.ref.level,
                }));
            }

            return ty;
        });

        return { variant: 'Type', lhs, rhs: newRhs };
    },
};

export type LetDecl = {
    mutable: boolean,
    name: string,
    value: Expr,
};

export type FunDecl = {
    name: string,
    args: string[],
    body: Expr,
};

export type TypeDecl = {
    lhs: Type,
    rhs: Type,
};

export type ModuleDecl = {
    name: string,
    decls: Decl[],
};
