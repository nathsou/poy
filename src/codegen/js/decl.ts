import { match } from 'itsamatch';
import { Decl as BitterDecl } from '../../ast/bitter/decl';
import { Stmt as JSStmt } from '../../ast/js/stmt';
import { Expr as JSExpr } from '../../ast/js/expr';
import { array, assert, panic } from '../../misc/utils';
import { JSScope, Name } from './jsScope';
import { jsStmtOf } from './stmt';

export function jsOfDecl(decl: BitterDecl, scope: JSScope): JSStmt[] {
  const aux = (decl: BitterDecl): JSStmt[] => {
    return match(decl, {
      Module: ({ name: topModuleName, decls }) => {
        const moduleToStmts = (
          moduleName: string,
          decls: BitterDecl[],
          moduleScope: JSScope,
          isTopLevel: boolean,
        ): JSStmt[] => {
          if (isTopLevel) {
            JSScope.topLevelModules.set(moduleName, moduleScope);
          }

          for (const decl of decls) {
            match(decl, {
              Stmt: ({ stmt }) => {
                moduleScope.add(jsStmtOf(stmt, moduleScope));
              },
              Module: ({ pub, name, decls }) => {
                const subModuleName = moduleScope.declare(name);
                const stmts = moduleToStmts(name, decls, moduleScope.realChild(), false);
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
              Type: () => { },
              Struct: () => { },
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
                    moduleScope.declare(name, true, attrs.as);
                  },
                  Module: ({ name }) => {
                    moduleScope.declare(name, true, attrs.as);
                  },
                  Type: () => { },
                });
              },
              Import: ({ pub, module }) => {
                const fullpath = ['.', `${module}.mjs`].join('/');
                const importedScope = JSScope.topLevelModules.get(module);
                assert(importedScope != null, `Module ${module} not found`);
                const usedMembers = array<Name>();

                moduleScope.imports.push({
                  pub,
                  module,
                  members: new Set(), // import all
                  scope: importedScope,
                  usedMembers,
                });
                
                moduleScope.add(
                  JSStmt.Import({
                    exported: pub,
                    path: fullpath,
                    members: usedMembers,
                  }),
                );
              },
              Enum: () => { },
            });
          }

          return moduleScope.statements;
        };

        return moduleToStmts(topModuleName, decls, scope.realChild(), true);
      },
      _: () => panic('Declaration outside of a module'),
    });
  };

  return aux(decl);
}
