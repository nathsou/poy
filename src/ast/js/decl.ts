import { DataType, match } from 'itsamatch';
import { Impl, Show } from '../../misc/traits';
import { Stmt } from './stmt';

export type Decl = DataType<{
    Stmt: { stmt: Stmt };
}>;

export const Decl = {
    Stmt: (stmt: Stmt): Decl => ({ variant: 'Stmt', stmt }) as const,
    show,
} satisfies Impl<Show<Decl>>;

function show(decl: Decl): string {
    return match(decl, {
        Stmt: ({ stmt }) => Stmt.show(stmt),
    });
}
