import { match, VariantOf } from 'itsamatch';
import { Decl as BitterDecl } from '../../ast/bitter/decl';
import { Stmt as BitterStmt } from '../../ast/bitter/stmt';
import { Expr as BitterExpr } from '../../ast/bitter/expr';
import { EnumVariant, ModuleDecl, Decl as SweetDecl } from '../../ast/sweet/decl';
import { bitterStmtOf } from './stmt';
import { todo } from '../../misc/utils';
import { Type } from '../../infer/type';
import { Literal } from '../../parse/token';
import assert from 'assert';
import { Pattern } from '../../ast/sweet/pattern';

export const bitterModuleOf = (sweet: ModuleDecl): VariantOf<BitterDecl, 'Module'> => {
  return BitterDecl.Module({
    name: sweet.name,
    decls: sweet.decls.flatMap(bitterDeclsOf),
  });
};

export const bitterDeclsOf = (sweet: SweetDecl): BitterDecl[] =>
  match(sweet, {
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
          assert(letStmt.lhs.variant === 'Variable');
          letStmt.lhs.name = `${letStmt.lhs.name}_${uuid}`;

          if (letStmt.value.variant === 'Fun' && !letStmt.static) {
            letStmt.value.args.unshift({
              pat: Pattern.Variable('self'),
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
    Enum: ({ name, variants }) => {
      const mod = BitterDecl.Module({
        name,
        decls: variants.map(variant =>
          match(variant, {
            Empty: ({ name }) =>
              BitterDecl.Stmt(
                BitterStmt.Let({
                  mutable: false,
                  static: true,
                  name,
                  value: BitterExpr.Literal(Literal.Str(name), Type.Str),
                  attrs: {},
                }),
              ),
            Tuple: ({ name, args }) => {
              const variantStr = BitterExpr.Literal(Literal.Str(name), Type.Str);
              return BitterDecl.Stmt(
                BitterStmt.Let({
                  mutable: false,
                  static: true,
                  name,
                  value: BitterExpr.Fun({
                    args: args.map((ty, idx) => ({
                      name: EnumVariant.formatPositionalArg(idx),
                      ty,
                    })),
                    isIterator: false,
                    body:
                      args.length === 0
                        ? variantStr
                        : BitterExpr.Struct({
                            path: [],
                            fields: [
                              {
                                name: EnumVariant.TAG,
                                value: variantStr,
                              },
                              ...args.map((ty, idx) => ({
                                name: EnumVariant.formatPositionalArg(idx),
                                value: BitterExpr.Variable({
                                  name: EnumVariant.formatPositionalArg(idx),
                                  ty,
                                }),
                              })),
                            ],
                            ty: Type.DontCare,
                          }),
                    ty: Type.DontCare,
                  }),
                  attrs: {},
                }),
              );
            },
            _: () => todo(),
          }),
        ),
      });

      return [mod];
    },
    _Many: ({ decls }) => decls.flatMap(bitterDeclsOf),
  });
