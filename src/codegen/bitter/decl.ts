import { match, VariantOf } from 'itsamatch';
import { Decl as BitterDecl } from '../../ast/bitter/decl';
import { Decl as SweetDecl, ModuleDecl } from '../../ast/sweet/decl';
import { bitterStmtOf } from './stmt';

export const bitterModuleOf = (sweet: ModuleDecl): VariantOf<BitterDecl, 'Module'> => {
    return BitterDecl.Module({
        name: sweet.name,
        decls: sweet.decls.flatMap(bitterDeclsOf),
    });
};

export const bitterDeclsOf = (sweet: SweetDecl): BitterDecl[] => match(sweet, {
    Stmt: ({ stmt }) => bitterStmtOf(stmt).map(BitterDecl.Stmt),
    Type: ({ lhs, rhs }) => [BitterDecl.Type(lhs, rhs)],
    Declare: ({ name, ty }) => [BitterDecl.Declare({ name, ty })],
    Module: mod => [bitterModuleOf(mod)],
    _Many: ({ decls }) => decls.flatMap(bitterDeclsOf),
});
