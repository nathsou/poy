import { match, VariantOf } from 'itsamatch';
import { Decl, EnumDecl, EnumVariant, StructDecl } from '../ast/sweet/decl';
import { Expr } from '../ast/sweet/expr';
import { Pattern } from '../ast/sweet/pattern';
import { Stmt } from '../ast/sweet/stmt';
import { Err, Ok, Result } from '../misc/result';
import { Scope } from '../misc/scope';
import { setDifference, uniq } from '../misc/sets';
import { array, assert, block, gen, last, mapObject, panic, proj, todo, zip } from '../misc/utils';
import { AssignmentOp, BinaryOp, UnaryOp } from '../parse/token';
import { Module, Resolver } from '../resolve/resolve';
import { ExtensionScope } from './extensions';
import { TRS } from './rewrite';
import { Subst, Type, TypeVar } from './type';

type VarInfo = {
  pub?: boolean;
  mut?: boolean;
  generics?: string[];
  ty: Type;
  native?: boolean;
};

type ModuleInfo = Module & { local: boolean; native?: boolean };

export class TypeEnv {
  public variables: Scope<VarInfo>;
  public modules: Scope<ModuleInfo>;
  public structs: Scope<StructDecl>;
  public enums: Scope<EnumDecl>;
  public generics: Scope<Type>;
  public types: TRS;
  private extensions: ExtensionScope;
  public letLevel: number;
  private functionStack: { ty: Type; isIterator: boolean }[];
  private resolver: Resolver;
  private modulePath: string;
  private moduleName: string;

  constructor(resolver: Resolver, modulePath: string, moduleName: string, parent?: TypeEnv) {
    this.resolver = resolver;
    this.variables = new Scope(parent?.variables);
    this.modules = new Scope(parent?.modules);
    this.structs = new Scope(parent?.structs);
    this.enums = new Scope(parent?.enums);
    this.generics = new Scope(parent?.generics, true);
    this.types = TRS.create(parent?.types);
    this.extensions = new ExtensionScope(this, parent?.extensions);
    this.letLevel = parent?.letLevel ?? 0;
    this.functionStack = [...(parent?.functionStack ?? [])];
    this.modulePath = modulePath;
    this.moduleName = moduleName;
  }

  public child(): TypeEnv {
    return new TypeEnv(this.resolver, this.modulePath, this.modulePath, this);
  }

  public freshType(): Type {
    return Type.fresh(this.letLevel);
  }

  public normalize(ty: Type): Type {
    return TRS.normalize(this, ty);
  }

  private unify(s: Type, t: Type, message?: string): void {
    const normalizedS = this.normalize(s);
    const normalizedT = this.normalize(t);
    const unifiable = Type.unify(normalizedS, normalizedT, this.generics);

    if (!unifiable) {
      panic(message ?? `Cannot unify '${Type.show(s)}' with '${Type.show(t)}'`);
    }
  }

  private unifyPure(s: Type, t: Type): Subst | undefined {
    return Type.unifyPure(this.normalize(s), this.normalize(t), this.generics);
  }

  public declareGenerics(generics: Iterable<string>): void {
    for (const name of generics) {
      this.generics.declare(name, this.freshType());
    }
  }

  private inferLet(
    pub: boolean,
    mut: boolean,
    lhs: Pattern,
    ann: Type | undefined,
    value: Expr,
  ): Type {
    this.validateDestructuringPattern(lhs);
    this.letLevel += 1;

    let ty: Type;
    const rhsEnv = this.child();

    if (value.variant === 'Fun') {
      const recTy = ann ?? rhsEnv.freshType();

      if (lhs.variant === 'Variable') {
        rhsEnv.variables.declare(lhs.name, {
          pub,
          mut,
          generics: value.generics,
          ty: recTy,
        });
      }

      const funTy = rhsEnv.inferFun(value);
      const funTyInst = Type.instantiate(funTy, rhsEnv.letLevel, rhsEnv.generics).ty;
      rhsEnv.unify(funTyInst, recTy);
      ty = funTy;
    } else {
      ty = rhsEnv.inferExpr(value);
    }

    if (ann) {
      rhsEnv.unify(ann, ty);
    }

    this.letLevel -= 1;

    const { vars, ty: patternTy } = rhsEnv.inferPattern(lhs, ty);
    this.unify(ty, patternTy);

    for (const [name, ty] of vars) {
      // TODO: handle mutable subpatterns?
      const isMut = mut;
      const genTy = isMut ? ty : Type.generalize(ty, this.letLevel);
      this.variables.declare(name, { pub, mut, ty: genTy });
    }

    // https://en.wikipedia.org/wiki/Value_restriction
    return mut ? ty : Type.generalize(ty, this.letLevel);
  }

  /**
   * Declares the given generics in this environment and returns parameterized
   * instances of the type(s) returned by `computeType`.
   */
  parameterize<T extends Type | Type[] | Record<string, Type>>(
    generics: string[],
    computeType: () => T,
  ): T {
    const insts = generics.map(() => this.freshType());
    const genericInsts = zip(generics, insts);
    this.generics.declareMany(genericInsts);
    const ret = computeType();

    // create reverse mapping
    const reverseMapping: Subst = new Map();

    for (const [name, ty] of genericInsts) {
      const deref = Type.utils.unlink(ty);
      if (deref.variant === 'Var' && deref.ref.variant === 'Unbound') {
        reverseMapping.set(deref.ref.id, Type.Var(TypeVar.Param({ name })));
      }
    }

    if (Array.isArray(ret)) {
      return ret.map(ty => Type.substitute(ty, reverseMapping)) as T;
    }

    if (Type.utils.isType(ret)) {
      return Type.substitute(ret, reverseMapping) as T;
    }

    return mapObject<Type, Type>(ret, ty => Type.substitute(ty, reverseMapping)) as T;
  }

  private inferFun(fun: VariantOf<Expr, 'Fun'>): Type {
    const { generics, args, body, ret } = fun;

    return this.parameterize(generics, () => {
      const argTys = args.map(arg => arg.ann ?? this.freshType());
      const returnTy = this.resolveType(ret ?? this.freshType());
      const retTyInfo = { ty: returnTy, isIterator: false };

      this.functionStack.push(retTyInfo); {
        args.forEach(({ pat }, i) => {
          this.validateDestructuringPattern(pat);
          const { vars, ty } = this.inferPattern(pat, argTys[i]);

          for (const [varName, varTy] of vars) {
            this.variables.declare(varName, {
              pub: false,
              mut: false,
              ty: varTy,
            });
          }

          args[i].ann = ty;
        });

        const bodyTy = this.inferExpr(body);

        if (!retTyInfo.isIterator) {
          this.unify(bodyTy, retTyInfo.ty);
        }

      } this.functionStack.pop();

      const retTy = retTyInfo.isIterator ? Type.Iterator(retTyInfo.ty) : retTyInfo.ty;
      const funTy = Type.Function(argTys, retTy);
      fun.isIterator = retTyInfo.isIterator;
      fun.ty = funTy;

      return funTy;
    });
  }

  public async inferDecl(decl: Decl): Promise<void> {
    await match(decl, {
      Stmt: ({ stmt }) => {
        this.inferStmt(stmt);
      },
      Type: ({ pub, lhs, rhs }) => {
        const typeEnv = this.child();

        typeEnv.declareGenerics(Type.utils.params(lhs));

        for (const param of Type.utils.params(lhs)) {
          typeEnv.generics.declare(param, typeEnv.freshType());
        }

        TRS.add(this.types, typeEnv.resolveType(lhs), typeEnv.resolveType(rhs), pub);
      },
      Struct: struct => {
        for (const field of struct.fields) {
          field.ty = Type.generalize(field.ty, this.letLevel);
        }

        this.structs.declare(struct.name, struct);
      },
      Declare: ({ sig }) =>
        match(sig, {
          Variable: ({ mut, name, ty }) => {
            const normalizedTy = this.normalize(ty);
            const genTy = mut ? normalizedTy : Type.generalize(normalizedTy, this.letLevel);
            this.variables.declare(name, {
              pub: true,
              mut,
              native: true,
              ty: genTy,
            });
          },
          Module: ({ name, signatures }) => {
            const moduleEnv = this.child();
            const decls = signatures.map(sig => Decl.Declare(sig, {}));
            this.modules.declare(name, {
              pub: true,
              local: true,
              native: true,
              name,
              params: [],
              env: moduleEnv,
              decls,
            });

            for (const decl of decls) {
              moduleEnv.inferDecl(decl);
            }
          },
          Type: ({ pub, lhs, rhs }) => {
            TRS.add(this.types, this.normalize(lhs), this.normalize(rhs), pub);
          },
        }),
      Module: ({ pub, name, params, decls }) => {
        const moduleEnv = this.child();
        this.modules.declare(name, {
          pub,
          local: true,
          name,
          params,
          env: moduleEnv,
          decls,
        });

        moduleEnv.declareGenerics(params);

        for (const decl of decls) {
          moduleEnv.inferDecl(decl);
        }
      },
      Import: async ({ path, module, members }) => {
        const moduleDir = this.resolver.fs.directoryName(this.modulePath);
        const fullPath = this.resolver.fs.join(moduleDir, ...path, `${module}.poy`);
        const mod = await this.resolver.resolve(fullPath);

        this.modules.declare(module, { ...mod, local: false });

        for (const member of members) {
          const name = member.name;
          mod.env.variables.lookup(name).match({
            Some: ({ pub, mut, native, ty }) => {
              member.kind = 'value';
              member.native = !!native;

              if (pub) {
                this.variables.declare(name, {
                  pub,
                  mut,
                  ty,
                });
              } else {
                panic(`Cannot import private variable '${name}' from module '${module}'`);
              }
            },
            None: () => {
              mod.env.modules.lookup(name).match({
                Some: module => {
                  member.kind = 'module';
                  member.native = !!module.native;

                  if (module.pub) {
                    this.modules.declare(name, {
                      ...module,
                      local: false,
                    });
                  } else {
                    panic(`Cannot import private module '${name}' from module '${module.name}'`);
                  }

                  mod.env.enums.lookup(name).do(enumDecl => {
                    this.enums.declare(name, enumDecl);
                  });
                },
                None: () => {
                  mod.env.types.rules.lookup(name).match({
                    Some: rules => {
                      member.kind = 'type';

                      const somePubRules = rules.some(rule => rule.pub);
                      const somePrivateRules = rules.some(rule => !rule.pub);
                      if (somePubRules && somePrivateRules) {
                        panic(
                          `Cannot import partially public type '${name}' from module '${module}'`,
                        );
                      }

                      if (somePrivateRules) {
                        panic(`Cannot import private type '${name}' from module '${module}'`);
                      }

                      const import_ = this.types.imports.find(imp => imp.mod === mod);

                      if (import_) {
                        import_.importedRules.add(member.name);
                      } else {
                        this.types.imports.push({
                          mod,
                          importedRules: new Set([member.name]),
                        });
                      }
                    },
                    None: () => {
                      mod.env.structs.lookup(name).match({
                        Some: struct => {
                          member.kind = 'type';

                          if (struct.pub) {
                            this.structs.declare(name, struct);
                          } else {
                            panic(`Cannot import private struct '${name}' from module '${module}'`);
                          }
                        },
                        None: () => {
                          panic(`Cannot find member '${name}' in module '${module}'`);
                        },
                      });
                    },
                  });
                },
              });
            },
          });
        }

        // import all extensions
        for (const [, extensions] of mod.env.extensions) {
          for (const extension of extensions) {
            this.extensions.declare(extension);
            members.push({
              kind: 'value',
              name: `${extension.member}_${extension.uuid}`,
              native: false,
            });
          }
        }
      },
      Extend: ({ params: globalParams, subject, decls, uuid }) => {
        const declareSelf = (env: TypeEnv): void => {
          TRS.add(env.types, Type.Fun('Self', []), subject, false);
          env.variables.declare('self', {
            pub: false,
            mut: false,
            ty: subject,
          });
        };
        
        const extend = (decl: Decl): void => {
          const extEnv = this.child();
          
          if (
            decl.variant === 'Stmt' &&
            decl.stmt.variant === 'Let' &&
            decl.stmt.lhs.variant === 'Variable'
            ) {
              const { pub, mutable, static: isStatic, lhs, ann, value, attrs } = decl.stmt;
              const generics: string[] = [];
              
              const { extensionTy, subjectTy } = extEnv.parameterize(globalParams, () => {
                declareSelf(extEnv);
                const subjectInst = Type.instantiate(subject, extEnv.letLevel, extEnv.generics).ty;

              if (value.variant === 'Fun') {
                generics.push(...value.generics);

                // support recursive calls
                extEnv.extensions.declare({
                  subject: subjectInst,
                  member: lhs.name,
                  attrs,
                  generics,
                  ty: ann ?? extEnv.freshType(),
                  isDeclared: false,
                  isStatic,
                  uuid,
                });
              }

              const ty = extEnv.inferLet(pub, mutable, lhs, ann, value);

              return { extensionTy: ty, subjectTy: subjectInst };
            });

            const genTy = mutable ?
              extensionTy :
              Type.generalize(extensionTy, this.letLevel);

            this.extensions.declare({
              subject: extEnv.normalize(subjectTy),
              member: lhs.name,
              attrs,
              generics,
              ty: extEnv.normalize(genTy),
              isDeclared: false,
              isStatic: isStatic,
              uuid,
            });
          } else if (decl.variant === 'Declare' && decl.sig.variant === 'Variable') {
            const { mut, name, ty, static: isStatic } = decl.sig;
            const genTy = mut ? ty : Type.generalize(ty, this.letLevel);

            this.extensions.declare({
              subject: Type.generalize(subject, this.letLevel),
              member: name,
              attrs: decl.attrs,
              generics: uniq([...globalParams, ...decl.sig.params]),
              ty: genTy,
              isDeclared: true,
              isStatic: isStatic,
              uuid,
            });
          } else if (decl.variant === '_Many') {
            decl.decls.forEach(extend);
          } else {
            panic(`Cannot extend a type with a '${decl.variant}' declaration`);
          }
        };

        decls.forEach(extend);
      },
      Enum: ({ pub, name, params, variants }) => {
        const enumEnv = this.child();
        this.enums.declare(name, { pub, name, params, variants });
        const variantTy = Type.Fun(name, params.map(name => Type.Var(TypeVar.Param({ name }))));

        for (const variant of variants) {
          match(variant, {
            Empty: () => {
              enumEnv.variables.declare(variant.name, {
                pub: true,
                mut: false,
                ty: variantTy,
              });
            },
            Tuple: ({ args }) => {
              enumEnv.variables.declare(variant.name, {
                pub: true,
                mut: false,
                ty: Type.Function(args, variantTy),
              });
            },
            Struct: () => todo('Enum struct variants'),
          });
        }

        this.modules.declare(name, {
          pub,
          name,
          env: enumEnv,
          params,
          local: true,
          decls: [],
        });
      },
      _Many: ({ decls }) => {
        for (const decl of decls) {
          this.inferDecl(decl);
        }
      },
    });
  }

  public inferStmt(stmt: Stmt): void {
    match(stmt, {
      Expr: ({ expr }) => {
        this.inferExpr(expr);
      },
      Let: ({ pub, mutable, lhs, ann, value }) => {
        const generics: string[] = [];

        if (value.variant === 'Fun') {
          generics.push(...value.generics);
        }

        this.inferLet(pub, mutable, lhs, ann, value);
      },
      Assign: ({ lhs, op, rhs }) => {
        const alpha = Type.alpha();
        const ASSIGNMENT_OP_TYPE: Record<AssignmentOp, [Type, Type]> = {
          '=': [alpha, alpha],
          '+=': [Type.Num, Type.Num],
          '-=': [Type.Num, Type.Num],
          '*=': [Type.Num, Type.Num],
          '/=': [Type.Num, Type.Num],
          'mod=': [Type.Num, Type.Num],
          '**=': [Type.Num, Type.Num],
          'or=': [Type.Num, Type.Num],
          'and=': [Type.Num, Type.Num],
          '|=': [Type.Num, Type.Num],
          '&=': [Type.Num, Type.Num],
        };

        const [expectedLhsTy, expectedRhsTy] = ASSIGNMENT_OP_TYPE[op].map(ty =>
          Type.instantiate(ty, this.letLevel, this.generics),
        );

        const lhsTy = this.inferExpr(lhs);
        const rhsTy = this.inferExpr(rhs);

        this.unify(lhsTy, expectedLhsTy.ty);
        this.unify(rhsTy, expectedRhsTy.ty);

        this.unify(lhsTy, rhsTy);

        const isLhsMutable = Expr.isMutable(lhs, this);

        if (!isLhsMutable) {
          panic('Left-hand side of assignment is immutable');
        }
      },
      While: ({ cond, body }) => {
        this.unify(this.inferExpr(cond), Type.Bool);
        const bodyEnv = this.child();

        for (const stmt of body) {
          bodyEnv.inferStmt(stmt);
        }
      },
      For: ({ name, iterator, body }) => {
        const iterTy = this.inferExpr(iterator.ref);
        const elemTy = this.freshType();

        // if `iterator` is not an iterator, try to call iter() on it
        if (this.unifyPure(iterTy, Type.Iterator(elemTy)) == null) {
          iterator.ref = Expr.Call({
            fun: Expr.FieldAccess({
              lhs: iterator.ref,
              field: 'iter',
              isCalled: true,
              isNative: false,
              typeParams: [],
            }),
            args: [],
          });

          return this.inferStmt({
            variant: 'For',
            name,
            iterator,
            body,
          });
        }

        this.unify(iterTy, Type.Iterator(elemTy));

        const bodyEnv = this.child();
        bodyEnv.variables.declare(name, {
          pub: false,
          mut: false,
          ty: elemTy,
        });

        for (const stmt of body) {
          bodyEnv.inferStmt(stmt);
        }
      },
      Return: ({ expr }) => {
        if (this.functionStack.length === 0) {
          panic('Return statement used outside of a function body');
        }

        const funReturnTy = last(this.functionStack).ty;
        const exprTy = this.inferExpr(expr);
        this.unify(funReturnTy, exprTy);
      },
      Yield: ({ expr }) => {
        if (this.functionStack.length === 0) {
          panic('Yield statement used outside of a function body');
        }

        const funRet = last(this.functionStack);
        funRet.isIterator = true;
        const exprTy = this.inferExpr(expr);
        this.unify(funRet.ty, exprTy);
      },
      Break: () => { },
      _Many: ({ stmts }) => {
        for (const stmt of stmts) {
          this.inferStmt(stmt);
        }
      },
    });
  }

  private validateTypeParameters(
    kind: string,
    name: string,
    generics: string[] | undefined,
    typeParams: Type[],
  ): Type[] {
    if (typeParams.length > 0 && generics == null) {
      panic(`${kind} '${name}' expects no type parameters, but ${typeParams.length} were given.`);
    }

    if (generics != null && typeParams.length > 0 && typeParams.length !== generics.length) {
      panic(
        `${kind} '${name}' expects ${generics.length} type parameters, but ${typeParams.length} were given.`,
      );
    }

    if (generics != null && typeParams.length === generics.length) {
      return typeParams.map(ty => this.resolveType(ty));
    }

    if (generics != null) {
      return generics.map(() => this.freshType());
    }

    return [];
  }

  private validateDestructuringPattern(pattern: Pattern) {
    if (!Pattern.isIrrefutable(pattern)) {
      panic(`Pattern '${Pattern.show(pattern)}' can fail to match.`);
    }
  }

  public inferExpr(expr: Expr): Type {
    if (expr.ty) return expr.ty;

    const ty = match(expr, {
      Literal: ({ literal }) => Type[literal.variant],
      Variable: ({ name, typeParams }) =>
        this.variables.lookup(name).match({
          Some: ({ ty, generics }) => {
            let typeParamScope = this.generics;

            if (generics != null && generics.length > 0) {
              const params = this.validateTypeParameters('Variable', name, generics, typeParams);
              typeParamScope = this.generics.child();
              typeParamScope.declareMany(zip(generics, params));
            }

            return Type.instantiate(ty, this.letLevel, typeParamScope).ty;
          },
          None: () => panic(`Variable '${name}' not found`),
        }),
      Unary: ({ op, expr }) => {
        const exprTy = this.inferExpr(expr);
        this.unify(exprTy, UNARY_OP_TYPE[op]);

        return exprTy;
      },
      Binary: ({ lhs, op, rhs }) => {
        const lhsTy = this.inferExpr(lhs);
        const rhsTy = this.inferExpr(rhs);
        const [arg1, arg2, ret] = BINARY_OP_TYPE[op];
        const funTy = Type.instantiate(
          Type.Function([arg1, arg2], ret),
          this.letLevel,
          this.generics,
        ).ty;

        this.unify(funTy, Type.Function([lhsTy, rhsTy], ret));

        return ret;
      },
      Block: ({ stmts, ret }) => {
        const blockEnv = this.child();

        for (const stmt of stmts) {
          blockEnv.inferStmt(stmt);
        }

        if (ret) {
          return blockEnv.inferExpr(ret);
        } else {
          return Type.Unit;
        }
      },
      Array: ({ elems }) => {
        const elemTy = this.freshType();

        for (const elem of elems) {
          this.unify(elemTy, this.inferExpr(elem));
        }

        return Type.Array(elemTy);
      },
      Fun: fun => {
        const funEnv = this.child();
        const genFunTy = funEnv.inferFun(fun);
        return Type.instantiate(genFunTy, this.letLevel, this.generics).ty;
      },
      Call: ({ fun, args }) => {
        const funTy = this.inferExpr(fun);
        const argTys = args.map(arg => this.inferExpr(arg));
        const retTy = this.freshType();
        const expectedFunTy = Type.Function(argTys, retTy);
        this.unify(funTy, expectedFunTy);

        return retTy;
      },
      If: ({ cond, then_, else_ }) => {
        this.unify(this.inferExpr(cond), Type.Bool);
        const thenTy = this.inferExpr(then_);

        if (else_) {
          const elseTy = this.inferExpr(else_);
          this.unify(thenTy, elseTy);
        } else {
          this.unify(thenTy, Type.Unit);
        }

        return thenTy;
      },
      Tuple: ({ elems }) => {
        const elemTys = elems.map(elem => this.inferExpr(elem));
        return Type.Tuple(elemTys);
      },
      UseIn: ({ lhs, ann, value, rhs }) => {
        const rhsEnv = this.child();
        rhsEnv.inferLet(false, false, lhs, ann, value);
        return rhsEnv.inferExpr(rhs);
      },
      Match: ({ subject, cases }) => {
        const subjectTy = this.inferExpr(subject);
        const retTy = this.freshType();

        for (const { pattern, body } of cases) {
          const caseEnv = this.child();
          const patternTy = caseEnv.inferPattern(pattern, subjectTy);
          for (const [name, ty] of patternTy.vars) {
            caseEnv.variables.declare(name, {
              pub: false,
              mut: false,
              ty,
            });
          }

          this.unify(subjectTy, patternTy.ty);
          const caseTy = caseEnv.inferExpr(body);
          this.unify(caseTy, retTy);
        }

        return retTy;
      },
      ModuleAccess: moduleAccessExpr => {
        const { path, member } = moduleAccessExpr;
        let mod: ModuleInfo = {
          pub: true,
          local: true,
          name: this.moduleName,
          params: [],
          env: this,
          decls: [],
        };

        path.forEach((name, index) => {
          mod = mod.env.modules
            .lookup(name)
            .unwrap(() => `Module '${path.slice(0, index + 1).join('.')}' not found`);

          if (!mod.local && !mod.pub) {
            panic(`Module '${path.slice(0, index + 1).join('.')}' is private`);
          }
        });

        const { pub, ty } = mod.env.variables
          .lookup(member)
          .unwrap(() => `Member '${path.join('.')}.${member}' not found`);

        if (!mod.local && !pub) {
          panic(`Member '${path.join('.')}.${member}' is private`);
        }

        return Type.instantiate(ty, this.letLevel, this.generics).ty;
      },
      Struct: ({ name, typeParams, fields }) => {
        const decl = this.structs.lookup(name).unwrap(`Struct '${name}' not found`);
        const fieldTys = new Map(fields.map(({ name, value }) => [name, this.inferExpr(value)]));
        const expectedFields = new Set(decl.fields.map(proj('name')));
        const actualFields = new Set(fieldTys.keys());

        const missingFields = setDifference(expectedFields, actualFields);
        if (missingFields.size > 0) {
          panic(
            `Missing field(s) in '${name}' struct expression: ${[...missingFields].join(', ')}`,
          );
        }

        const extraFields = setDifference(actualFields, expectedFields);
        if (extraFields.size > 0) {
          panic(`Extra field(s) in '${name}' struct expression: ${[...extraFields].join(', ')}`);
        }

        const structParamsScope = this.generics.child();
        const params = this.validateTypeParameters('Struct', name, decl.params, typeParams);
        structParamsScope.declareMany(zip(decl.params, params));

        const structName = name;
        for (const { mut, name, ty } of decl.fields) {
          this.unify(
            fieldTys.get(name)!,
            Type.instantiate(ty, this.letLevel, structParamsScope).ty,
          );
          const value = fields.find(({ name: fieldName }) => fieldName === name)!.value;
          if (mut && !Type.utils.isValueType(ty) && !Expr.isMutable(value, this)) {
            panic(
              `Cannot use an immutable value in place of the mutable field '${name}' of struct '${structName}'`,
            );
          }
        }

        return Type.Fun(name, params);
      },
      FieldAccess: dotExpr => {
        const { lhs, field, typeParams, isCalled } = dotExpr;
        const lhsTy = this.inferExpr(lhs);

        if (lhsTy.variant === 'Fun' && this.structs.has(lhsTy.name)) {
          const structDecl = this.structs.lookup(lhsTy.name).unwrap(`Struct '${lhsTy.name}' not found`);
          const fieldInfo = structDecl.fields.find(({ name }) => name === field);
          const params = this.validateTypeParameters(
            'Struct',
            lhsTy.name,
            structDecl.params,
            typeParams,
          );

          this.generics.declareMany(zip(structDecl.params, params));

          if (fieldInfo) {
            return Type.instantiate(fieldInfo.ty, this.letLevel, this.generics).ty;
          }
        }

        return this.extensions.lookup(lhsTy, field).match({
          Ok: ({
            ext: { ty: memberTy, isDeclared: isNative, uuid, subject, attrs },
            subst,
            params,
          }) => {
            dotExpr.extensionUuid = uuid;
            dotExpr.isNative = isNative;

            if (isNative && !isCalled && Type.utils.isFunction(memberTy)) {
              return panic(
                `Declared member '${field}' from extension of '${Type.show(lhsTy)}' must be called`,
              );
            }

            if (attrs.as != null) {
              dotExpr.field = attrs.as;
            }

            const typeParamScope = this.generics.child();
            typeParamScope.declareMany(params.entries());
            const subjectInst = Type.instantiate(
              Type.substitute(subject, subst),
              this.letLevel,
              typeParamScope,
            );

            const extInst = Type.instantiate(
              Type.substituteMany(memberTy, [subjectInst.subst, subst]),
              this.letLevel,
              typeParamScope,
            ).ty;

            this.unify(lhsTy, subjectInst.ty);

            return extInst;
          },
          Error: panic,
        });
      },
      ExtensionAccess: extensionAccessExpr => {
        const { subject, typeParams, member } = extensionAccessExpr;
        extensionAccessExpr.subject = this.resolveType(subject);
        const subjectInst = Type.instantiate(subject, this.letLevel, this.generics);
        const ext = this.extensions.lookup(subjectInst.ty, member);

        return ext.match({
          Ok: ({ ext: { ty, uuid, isDeclared: declared, isStatic: isStatic, generics }, subst, params }) => {
            if (declared) {
              return panic(
                `Cannot access a declared extension member with an extension access expression: '${Type.show(
                  subject,
                )}::${member}'`,
              );
            }

            const typeParamScope = this.generics.child();

            for (const [name, ty] of params) {
              typeParamScope.declare(name, Type.substitute(ty, subst));
            }
            
            typeParamScope.declareMany(zip(generics, typeParams));
            const instTy = Type.instantiate(ty, this.letLevel, typeParamScope).ty;
            extensionAccessExpr.extensionUuid = uuid;

            if (!isStatic && Type.utils.isFunction(instTy)) {
              // prepend 'self' to the methods's type
              const selfTy = Type.substitute(subjectInst.ty, subst);
              const params = [selfTy, ...Type.utils.functionParameters(instTy)];
              const ret = Type.utils.functionReturnType(instTy);
              return Type.Fun('Function', [Type.utils.list(params), ret]);
            }

            return instTy;
          },
          Error: panic,
        });
      },
      TupleAccess: ({ lhs, index }) => {
        const lhsTy = this.inferExpr(lhs);
        const elems = gen(index + 1, () => this.freshType());
        const tail = this.freshType();
        const expectedLhsTy = Type.Tuple(Type.utils.list(elems, tail));
        this.unify(lhsTy, expectedLhsTy);
        return elems[index];
      },
      VariantShorthand: expr => {
        const { variantName, args } = expr;
        return this.lookupEnumByVariantName(variantName).match({
          Ok: ({ decl }) => {
            expr.resolvedEnum = decl;

            const ctor = Expr.ModuleAccess({
              path: [decl.name],
              member: variantName,
            });

            if (args.length === 0) {
              return this.inferExpr(ctor);
            }

            return this.inferExpr(Expr.Call({ fun: ctor, args }));
          },
          Error: panic,
        });
      },
      StringInterpolation: ({ parts }) => {
        for (const part of parts) {
          if (part.variant === 'Expr') {
            const exprTy = this.inferExpr(part.expr);
            this.unify(
              exprTy,
              Type.Str,
              'Each component of a string interpolation must be a string',
            );
          }
        }

        return Type.Str;
      },
    });

    expr.ty = ty;
    return ty;
  }

  private lookupEnumByVariantName(
    variantName: string,
  ): Result<{ name: string; decl: EnumDecl }, string> {
    const candidates = array<{
      name: string;
      decl: EnumDecl;
    }>();

    for (const [name, decl] of this.enums) {
      if (decl.variants.some(v => v.name === variantName)) {
        candidates.push({ name, decl });
      }
    }

    if (candidates.length === 0) {
      return Err(`No enum with variant '${variantName}' found`);
    }

    if (candidates.length > 1) {
      return Err(
        `Ambiguous enum variant '${variantName}': ${candidates.map(({ name }) => name).join(', ')}`,
      );
    }

    return Ok(candidates[0]);
  }

  public inferPattern(
    pattern: Pattern,
    subjectTy: Type,
  ): {
    ty: Type;
    vars: Map<string, Type>;
  } {
    const vars = new Map<string, Type>();

    const aux = (pat: Pattern, ty: Type): Type => {
      switch (pat.variant) {
        case 'Any':
          return ty;
        case 'Variable': {
          vars.set(pat.name, ty);
          return ty;
        }
        case 'Ctor': {
          if (pat.meta !== undefined) {
            switch (pat.meta) {
              case 'Bool':
                return Type.Bool;
              case 'Num':
                return Type.Num;
              case 'Str':
                return Type.Str;
              case 'Unit':
                return Type.Unit;
              case 'Tuple': {
                assert(
                  ty.variant === 'Fun' && ty.name === 'Tuple',
                  'Tuple pattern must be used with a tuple type',
                );
                const elems = Type.utils.unlist(ty.args[0]);
                return Type.Tuple(pat.args.map((arg, idx) => aux(arg, elems[idx])));
              }
              default:
                return panic(`Unknown meta type: '${pat.meta}'`);
            }
          } else {
            assert(
              ty.variant === 'Fun' && ty.name === pat.name,
              'Ctor pattern must be used with a ctor type',
            );
            return Type.Fun(
              pat.name,
              pat.args.map((arg, idx) => aux(arg, ty.args[idx])),
            );
          }
        }
        case 'Variant': {
          const enumName = block(() => {
            if (pat.enumName != null) {
              return pat.enumName;
            }

            if (ty.variant === 'Fun' && this.enums.has(ty.name)) {
              return ty.name;
            }

            return this.lookupEnumByVariantName(pat.variantName).unwrap().name;
          });

          const decl = this.enums.lookup(enumName).unwrap(`Enum '${enumName}' not found`);
          pat.enumName = enumName;
          pat.resolvedEnum = decl;

          const variant = decl.variants.find(v => v.name === pat.variantName);
          const paramsInst = decl.params.map(() => this.freshType());
          const generics = this.generics.child();
          generics.declareMany(zip(decl.params, paramsInst));
          this.unify(ty, Type.Fun(decl.name, paramsInst));

          if (variant == null) {
            return panic(`Enum '${enumName}' has no variant '${pat.variantName}'`);
          }

          for (const [arg, { ty: argTy }] of zip(pat.args, EnumVariant.arguments(variant))) {
            const argInstTy = Type.instantiate(argTy, this.letLevel, generics).ty;
            aux(arg, argInstTy);
          }

          return ty;
        }
        case 'Struct': {
          assert(ty.variant === 'Fun', 'Struct pattern must be used with a struct type');
          const decl = this.structs.lookup(ty.name).unwrap(`Struct '${ty.name}' not found`);

          for (const field of pat.fields) {
            const fieldInfo = decl.fields.find(f => f.name === field.name);
            if (fieldInfo == null) {
              panic(`Struct '${ty.name}' has no field '${field.name}'`);
            } else {
              if (field.rhs) {
                aux(field.rhs, fieldInfo.ty);
              } else {
                vars.set(field.name, fieldInfo.ty);
              }
            }
          }

          return ty;
        }
      }
    };

    return { ty: aux(pattern, subjectTy), vars };
  }

  public show(indent = 0): string {
    return (
      '\n' +
      [
        'Variables:',
        this.variables.show(({ ty }) => Type.show(ty)),
        'Modules:',
        this.modules.show(({ env }) => env.show(indent + 1)),
      ]
        .map(str => '  '.repeat(indent) + str)
        .join('\n')
    );
  }

  public resolveModuleEnv(file: string, subpath?: string[]): TypeEnv {
    let env = file === this.modulePath ? this : this.resolver.modules.get(file)!.env;

    if (subpath) {
      subpath.forEach(name => {
        env = env.modules.lookup(name).unwrap(`Module ${name} not found`).env;
      });
    }

    return env;
  }

  public resolveType(ty: Type): Type {
    return Type.rewrite(ty, t =>
      match(t, {
        Var: v => {
          if (v.ref.variant === 'Param') {
            if (v.ref.name[0] === '_') {
              return Type.fresh(this.letLevel);
            }

            return this.resolveType(
              this.generics
                .lookup(v.ref.name)
                .unwrap(`Type parameter '${v.ref.name}' not found (resolveType)`),
            );
          }

          return v;
        },
        Fun: ({ name, args }) => {
          return Type.Fun(
            name,
            args.map(arg => this.resolveType(arg)),
          );
        },
      }),
    );
  }
}

const UNARY_OP_TYPE: Record<UnaryOp, Type> = {
  '!': Type.Bool,
  '-': Type.Num,
  '+': Type.Num,
};

const BINARY_OP_TYPE: Record<BinaryOp, [Type, Type, Type]> = {
  '+': [Type.Num, Type.Num, Type.Num],
  '-': [Type.Num, Type.Num, Type.Num],
  '*': [Type.Num, Type.Num, Type.Num],
  '/': [Type.Num, Type.Num, Type.Num],
  mod: [Type.Num, Type.Num, Type.Num],
  '**': [Type.Num, Type.Num, Type.Num],
  '==': [Type.alpha(), Type.alpha(), Type.Bool],
  '!=': [Type.alpha(), Type.alpha(), Type.Bool],
  '<': [Type.Num, Type.Num, Type.Bool],
  '>': [Type.Num, Type.Num, Type.Bool],
  '<=': [Type.Num, Type.Num, Type.Bool],
  '>=': [Type.Num, Type.Num, Type.Bool],
  and: [Type.Bool, Type.Bool, Type.Bool],
  or: [Type.Bool, Type.Bool, Type.Bool],
  '&': [Type.Num, Type.Num, Type.Num],
  '|': [Type.Num, Type.Num, Type.Num],
  '++': [Type.Str, Type.Str, Type.Str],
};
