import { match, VariantOf } from 'itsamatch';
import { Decl as BitterDecl } from '../../ast/bitter/decl';
import { ModuleDecl, Decl as SweetDecl } from '../../ast/sweet/decl';
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
    Declare: ({ sig, attrs }) => [BitterDecl.Declare({ sig, attrs })],
    Module: mod => [bitterModuleOf(mod)],
    Import: ({ path, module, members }) => [BitterDecl.Import({ path, module, members })],
    Struct: ({ pub, name, fields }) => [BitterDecl.Struct({ pub, name, fields })],
    Extend: ({ subject, decls, uuid }) => {
        const filteredDecls: BitterDecl[] = [];

        for (const decl of decls) {
            if (decl.variant === 'Stmt' && decl.stmt.variant === 'Let') {
                const letStmt = { ...decl.stmt };
                letStmt.name = `${letStmt.name}_${uuid}`;

                if (letStmt.value.variant === 'Fun' && !letStmt.static) {
                    letStmt.value.args.unshift({
                        name: 'self',
                        ann: subject,
                    });
                }

                filteredDecls.push(...bitterDeclsOf(SweetDecl.Stmt(letStmt)));
            } else if (decl.variant === 'Declare') {
                filteredDecls.push(...bitterDeclsOf(decl));
            } else if (decl.variant === '_Many') {
                for (const subDecl of decl.decls) {
                    filteredDecls.push(...bitterDeclsOf(subDecl));
                }
            }
        }

        return [BitterDecl.Extend({ subject, uuid, decls: filteredDecls })];
    },
    _Many: ({ decls }) => decls.flatMap(bitterDeclsOf),
});
