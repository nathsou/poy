import { match, VariantOf } from 'itsamatch';
import { Decl as BitterDecl } from '../../ast/bitter/decl';
import { Decl as SweetDecl, ModuleDecl } from '../../ast/sweet/decl';
import { bitterExprOf } from './expr';

export const bitterModuleOf = (sweet: ModuleDecl): VariantOf<BitterDecl, 'Module'> => {
    return BitterDecl.Module({
        name: sweet.name,
        decls: sweet.decls.flatMap(bitterDeclsOf),
    });
};

export const bitterDeclsOf = (sweet: SweetDecl): BitterDecl[] => match(sweet, {
    Let: ({ mutable, name, value }) => [BitterDecl.Let({
        mutable,
        name,
        value: bitterExprOf(value),
    })],
    Fun: ({ name, args, body }) => [BitterDecl.Fun({
        name,
        args: args.map(arg => ({ name: arg.name, ty: arg.ann! })),
        body: bitterExprOf(body),
    })],
    Type: ({ lhs, rhs }) => [BitterDecl.Type(lhs, rhs)],
    Module: mod => [bitterModuleOf(mod)],
    _Many: ({ decls }) => decls.flatMap(bitterDeclsOf),
});
