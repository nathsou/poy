import { match } from 'itsamatch';
import { Decl as BitterDecl } from '../../ast/bitter/decl';
import { Decl as JSDecl } from '../../ast/js/decl';
import { Stmt as JSStmt } from '../../ast/js/stmt';
import { TSType } from '../../ast/js/tsType';
import { assert } from '../../misc/utils';
import { jsExprOf } from './expr';

export function jsOfDecl(decl: BitterDecl): JSDecl {
    const aux = (decl: BitterDecl): JSDecl[] => {
        return match(decl, {
            Let: ({ mutable, name, value }) => [JSDecl.Let({ const_: !mutable, name, value: jsExprOf(value) })],
            Fun: ({ name, args, body }) => [JSDecl.Fun({
                name,
                args: args.map(arg => ({ name: arg.name, ty: TSType.from(arg.ty) })),
                stmts: [JSStmt.Return(jsExprOf(body))],
            })],
            Module: ({ name, decls }) => [JSDecl.Module({ name, decls: decls.flatMap(aux) })],
            Type: () => [],
        });
    };

    const decls = aux(decl);
    assert(decls.length === 1);
    return decls[0];
}
