import { match } from 'itsamatch';
import { Decl as BitterDecl } from '../../ast/bitter/decl';
import { Stmt as JSStmt } from '../../ast/js/stmt';
import { Expr as JSExpr } from '../../ast/js/expr';
import { array, panic } from '../../misc/utils';
import { JSScope, Name } from './jsScope';
import { jsStmtOf } from './stmt';

export function jsOfDecl(decl: BitterDecl, scope: JSScope): JSStmt[] {
  const aux = (decl: BitterDecl): JSStmt[] => {
    return match(decl, {
      Module: ({ decls }) => {
        const moduleToStmts = (
          decls: BitterDecl[],
          moduleScope: JSScope,
          isTopLevel: boolean,
        ): JSStmt[] => {
          for (const decl of decls) {
            match(decl, {
              Stmt: ({ stmt }) => {
                moduleScope.add(jsStmtOf(stmt, moduleScope));
              },
              Module: ({ pub, name, decls }) => {
                const subModuleName = moduleScope.declare(name);

                const stmts = moduleToStmts(decls, moduleScope.realChild(), false);

                moduleScope.add(...stmts);

                const entries = array<{ key: string; value: JSExpr }>();

                for (const stmt of stmts) {
                  if ((stmt.variant === 'Let' || stmt.variant === 'Const') && stmt.value) {
                    entries.push({
                      key: stmt.name.name,
                      value: JSExpr.Variable(stmt.name),
                    });
                  }
                }

                const moduleObj = JSStmt.Const({
                  name: subModuleName,
                  value: JSExpr.Object({ entries }),
                  exported: pub,
                });

                moduleScope.add(moduleObj);
              },
              Type: () => {},
              Struct: () => {},
              Extend: ({ decls }) => {
                for (const decl of decls) {
                  if (decl.variant === 'Stmt') {
                    const stmt = decl.stmt;
                    moduleScope.add(jsStmtOf(stmt, moduleScope));
                  }
                }
              },
              Declare: ({ sig, attrs }) => {
                match(sig, {
                  Variable: ({ name }) => {
                    moduleScope.declare(name, attrs.as);
                  },
                  Module: ({ name }) => {
                    moduleScope.declare(name, attrs.as);
                  },
                  Type: () => {},
                });
              },
              Import: ({ module, members, path }) => {
                const fullpath = ['.', ...path, `${module}.mjs`].join('/');

                if (members) {
                  const importedMembers = array<Name>();

                  for (const { name, native, kind } of members) {
                    if (kind === 'value' || kind === 'module') {
                      const memberName = moduleScope.declare(name);
                      if (!native) {
                        importedMembers.push(memberName);
                      }
                    }
                  }

                  if (importedMembers.length > 0) {
                    moduleScope.add(
                      JSStmt.Import({
                        path: fullpath,
                        members: importedMembers,
                      }),
                    );
                  }
                }
              },
              Enum: () => {},
            });
          }

          return moduleScope.statements;
        };

        return moduleToStmts(decls, scope.realChild(), true);
      },
      _: () => panic('Declaration outside of a module'),
    });
  };

  return aux(decl);
}
