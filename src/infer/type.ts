import { DataType, constructors, match, matchMany } from 'itsamatch';
import { config } from '../config';
import { Context } from '../misc/context';
import { Scope } from '../misc/scope';
import { Constructors, Eq, Impl, Rewrite, Show } from '../misc/traits';
import { Ref, assert, map, panic, sum } from '../misc/utils';
import { ModulePath } from '../resolve/resolve';
import { normalize } from './rewrite';

export type Type = DataType<{
  Var: Ref<TypeVar>;
  Fun: { name: string; args: Type[]; path?: ModulePath };
}>;

export const Type = {
  alpha: () => Type.Var(TypeVar.Generic({ id: 0 })),
  beta: () => Type.Var(TypeVar.Generic({ id: 1 })),
  Var: (ref: TypeVar): Type => ({ variant: 'Var', ref }),
  Fun: (name: string, args: Type[], path?: ModulePath): Type => ({
    variant: 'Fun',
    name,
    args,
    path,
  }),
  Array: (elem: Type): Type => Type.Fun('Array', [elem]),
  Tuple: (elems: Type[] | Type): Type =>
    Array.isArray(elems)
      ? elems.length === 1
        ? elems[0]
        : Type.Fun('Tuple', [list(elems)])
      : Type.Fun('Tuple', [elems]),
  Function: (args: Type[], ret: Type): Type => Type.Fun('Function', [list(args), ret]),
  Bool: Object.freeze<Type>({ variant: 'Fun', name: 'Bool', args: [] }),
  Num: Object.freeze<Type>({ variant: 'Fun', name: 'Num', args: [] }),
  Str: Object.freeze<Type>({ variant: 'Fun', name: 'Str', args: [] }),
  Nil: Object.freeze<Type>({ variant: 'Fun', name: 'Nil', args: [] }),
  Cons: (head: Type, tail: Type): Type => Type.Fun('Cons', [head, tail]),
  Unit: Object.freeze<Type>({
    variant: 'Fun',
    name: 'Tuple',
    args: [{ variant: 'Fun', name: 'Nil', args: [] }],
  }),
  DontCare: Object.freeze<Type>({ variant: 'Fun', name: '<DONT_CARE>', args: [] }),
  Iterator: (elem: Type): Type => Type.Fun('Iterator', [elem]),
  show,
  eq,
  unify,
  unifyPure,
  substitute,
  substituteMany,
  normalize,
  fresh,
  rewrite,
  generalize,
  instantiate,
  specificity,
  occurs,
  utils: {
    isType: (ty: unknown): ty is Type => {
      return (
        ty != null && typeof ty === 'object' &&
        'variant' in ty && (ty.variant === 'Var' || ty.variant === 'Fun')
      );
    },
    params: typeParameters,
    isFunction(ty: Type): ty is Type & {
      variant: 'Fun';
      name: 'Function';
      args: [Type, Type];
    } {
      return (
        ty.variant === 'Fun' && ty.name === 'Function' && ty.args.length === 2 && isList(ty.args[0])
      );
    },
    functionParameters(ty: Type): Type[] {
      assert(Type.utils.isFunction(ty));
      return unlist(ty.args[0]);
    },
    functionReturnType(ty: Type): Type {
      assert(Type.utils.isFunction(ty));
      return ty.args[1];
    },
    list,
    unlist,
    isList,
    unlink,
    isValueType(ty: Type): boolean {
      if (ty.variant === 'Var') return false;

      switch (ty.name) {
        case 'Bool':
          return true;
        case 'Num':
          return true;
        case 'Str':
          return true;
        case 'Nil':
          return true;
      }

      return false;
    },
  },
} satisfies Impl<Show<Type> & Eq<Type> & Rewrite<Type> & Constructors<Type>>;

export type TypeVarId = number;
export type TypeVar = DataType<{
  Unbound: { id: TypeVarId; level: number };
  Generic: { id: TypeVarId };
  Param: { name: string };
  Link: { type: Type };
}>;

export const showTypeVarId = (id: number): string => {
  return String.fromCharCode(97 + (id % 26)) + (id >= 26 ? String(Math.floor(id / 26)) : '');
};

export const TypeVar = {
  ...constructors<TypeVar>().get('Unbound', 'Generic', 'Param'),
  Link: (type: Type): TypeVar => ({ variant: 'Link', type }),
  eq: (a, b) =>
    matchMany([a, b], {
      'Unbound Unbound': (a, b) => a.id === b.id,
      'Generic Generic': (a, b) => a.id === b.id,
      'Link Link': (a, b) => Type.eq(a.type, b.type),
      'Param Param': (a, b) => a.name === b.name,
      _: () => false,
    }),
  show: self =>
    match(self, {
      Unbound: ({ id }) => '!' + showTypeVarId(id),
      Generic: ({ id }) => "'" + showTypeVarId(id),
      Param: ({ name }) => '%' + name,
      Link: ({ type }) => Type.show(type),
    }),
  linkTo: (self: { ref: TypeVar }, type: Type, subst?: Subst): void => {
    if (self.ref.variant === 'Unbound') {
      if (
        !(type.variant === 'Var' && type.ref.variant === 'Unbound' && type.ref.id === self.ref.id)
      ) {
        const deref = unlink(type);

        if (subst != null) {
          Subst.set(subst, self.ref.id, deref);
        } else {
          self.ref = TypeVar.Link(deref);
        }
      }
    }
  },
  fresh: (level: number): TypeVar =>
    TypeVar.Unbound({ id: Context.freshTypeVarId(), level }),
} satisfies Impl<Eq<TypeVar> & Show<TypeVar> & Constructors<TypeVar>>;

function isList(ty: Type): boolean {
  return match(ty, {
    Var: () => false,
    Fun: ({ name, args }) => {
      if (name === 'Nil') {
        return true;
      }

      return name === 'Cons' && isList(args[1]);
    },
  });
}

function show(ty: Type): string {
  const genericTyVars = new Set<string>();

  const show = (ty: Type): string => {
    return match(ty, {
      Var: ({ ref }) => {
        if (ref.variant === 'Generic') {
          genericTyVars.add(showTypeVarId(ref.id));
        }

        return TypeVar.show(ref);
      },
      Fun: ({ name, args }) => {
        switch (name) {
          case 'Nil':
            return '[]';
          case 'Cons':
            if (isList(args[1])) {
              if (args[1].variant === 'Fun' && args[1].name === 'Nil') {
                return `[${show(args[0])}]`;
              }

              return `[${show(args[0])}, ${unlist(args[1]).map(show).join(', ')}]`;
            }

            return `${show(args[0])}::${show(args[1])}`;
          case 'Array':
            return `${show(args[0])}[]`;
          case 'Tuple':
            if (!isList(args[0])) {
              return `Tuple<${show(args[0])}>`;
            }

            return `(${unlist(args[0]).map(show).join(', ')})`;
          case 'Function': {
            const ret = args[1];

            if (!isList(args[0])) {
              return `Function<${show(args[0])}, ${show(ret)}>`;
            }

            const params = unlist(args[0]);

            if (params.length === 1) {
              return `${show(params[0])} -> ${show(ret)}`;
            }

            return `(${params.map(show).join(', ')}) -> ${show(ret)}`;
          }
          default:
            if (args.length === 0) {
              return name;
            }

            return `${name}<${args.map(show).join(', ')}>`;
        }
      },
    });
  };

  let rhs = show(ty);

  if (ty.variant === 'Fun' && ty.path != null && ty.path.subpath.length > 0) {
    rhs = `${ty.path.subpath.join('.')}.${rhs}`;
  }

  if (genericTyVars.size > 0) {
    rhs = `forall ${Array.from(genericTyVars).join(', ')}. ${rhs}`;
  }

  return rhs;
}

function rewrite(ty: Type, f: (ty: Type) => Type): Type {
  return f(
    match(ty, {
      Var: ({ ref }) => Type.Var(ref),
      Fun: ({ name, args, path }) => Type.Fun(name, args.map(f), path),
    }),
  );
}

function typeParameters(ty: Type): Set<string> {
  const params = new Set<string>();

  const aux = (ty: Type): void => {
    match(ty, {
      Var: ({ ref }) => {
        if (ref.variant === 'Param' && ref.name != null && ref.name[0] !== '_') {
          params.add(ref.name);
        }
      },
      Fun: ({ args }) => args.forEach(aux),
    });
  };

  aux(ty);

  return params;
}

function eq(a: Type, b: Type): boolean {
  return matchMany([a, b], {
    'Var Var': (a, b) => TypeVar.eq(a.ref, b.ref),
    'Fun Fun': (a, b) =>
      a.name === b.name &&
      a.args.length === b.args.length &&
      a.args.every((arg, i) => eq(arg, b.args[i])),
    _: () => false,
  });
}

function specificity(ty: Type): number {
  return match(ty, {
    Var: () => 1,
    Fun: ({ args }) => 1000 + sum(map(args, specificity)),
  });
}

export type Subst = Map<number, Type>;

export const Subst = {
  specificity: (subst: Subst): number => {
    let specificity = 0;

    for (const type of subst.values()) {
      specificity += Type.specificity(type);
    }

    return specificity;
  },
  show: (subst: Subst): string => {
    const entries = Array.from(subst.entries()).map(
      ([id, ty]) => `${showTypeVarId(id)}: ${Type.show(ty)}`,
    );

    return '{ ' + entries.join(', ') + ' }';
  },
  set: (subst: Subst, id: number, ty: Type): void => {
    // if (subst.has(id)) {
    //     panic('Duplicate type variable in substitution');
    // }

    if (!occurs(id, ty)) {
      subst.set(id, ty);
    }
  },
  parameterize: (subst: Subst, mapping: Map<TypeVarId, string>): Map<string, Type> => {
    const params = new Map<string, Type>();

    for (const [id, ty] of subst) {
      const name = mapping.get(id);

      if (name != null) {
        params.set(name, ty);
      }
    }

    return params;
  },
};

function occurs(id: number, ty: Type): boolean {
  return match(ty, {
    Var: ({ ref }) =>
      match(ref, {
        Unbound: ({ id: id2 }) => id === id2,
        Generic: ({ id: id2 }) => id === id2,
        Link: ({ type }) => occurs(id, type),
        Param: () => false,
      }),
    Fun: ({ args }) => args.some(arg => occurs(id, arg)),
  });
}

function occursCheckAdjustLevels(id: number, level: number, ty: Type, params?: Scope<Type>): void {
  const go = (t: Type): void => {
    match(t, {
      Var: v =>
        match(v.ref, {
          Unbound: ({ id: id2, level: level2 }) => {
            if (id === id2) {
              panic('Recursive type');
            }

            if (level2 > level) {
              v.ref = TypeVar.Unbound({ id: id2, level });
            }
          },
          Generic: () => {
            panic('Generic type variables should not appear during unification');
          },
          Param: ({ name }) => {
            if (params != null) {
              params.lookup(name).match({
                Some: t => go(t),
                None: () => {
                  if (name[0] !== '_') {
                    panic(`Unknown type parameter '${name}'`);
                  }
                },
              });
            } else {
              panic(`Unknown type parameter '${name}'`);
            }
          },
          Link: ({ type }) => go(type),
        }),
      Fun: ({ args }) => args.forEach(go),
    });
  };

  go(ty);
}

function unifyVar(
  v: { ref: TypeVar },
  ty: Type,
  eqs: [Type, Type][],
  params?: Scope<Type>,
  subst?: Subst,
): void {
  match(v.ref, {
    Unbound: ({ id, level }) => {
      if (ty.variant === 'Var' && ty.ref.variant === 'Unbound' && ty.ref.id === id) {
        panic(
          `There should only be one instance of a particular type variable, but found two instances of '${showTypeVarId(
            id,
          )}'.`,
        );
      }

      occursCheckAdjustLevels(id, level, ty, params);

      TypeVar.linkTo(v, ty, subst);
    },
    Generic: () => {
      panic('Generic type variables should not appear during unification');
    },
    Param: ({ name }) => {
      if (params) {
        params.lookup(name).match({
          Some: t => {
            eqs.push([t, ty]);
          },
          None: () => {
            if (name[0] !== '_') {
              panic(`Unknown type parameter '${name}'`);
            }
          },
        });
      } else {
        panic(`Unresolved type parameter '${name}'`);
      }
    },
    Link: ({ type }) => {
      eqs.push([type, ty]);
    },
  });
}

// returns true if unification succeeded
function unify(a: Type, b: Type, params?: Scope<Type>, subst?: Subst): boolean {
  const eqs: [Type, Type][] = [[a, b]];

  while (eqs.length > 0) {
    const [s, t] = eqs.pop()!.map(unlink);
    if (config.debug.unification) {
      console.log(`unify '${show(s)}' with '${show(t)}'`);
    }

    if (eq(s, t)) {
      continue;
    }

    if (s.variant === 'Var') {
      unifyVar(s, t, eqs, params, subst);
    } else if (t.variant === 'Var') {
      unifyVar(t, s, eqs, params, subst);
    } else if (s.variant === 'Fun' && t.variant === 'Fun') {
      if (s.name !== t.name || s.args.length !== t.args.length) {
        return false;
      }

      for (let i = 0; i < s.args.length; i++) {
        eqs.push([s.args[i], t.args[i]]);
      }
    } else {
      return false;
    }
  }

  return true;
}

function unifyPure(a: Type, b: Type, params?: Scope<Type>): Subst | undefined {
  const subst = new Map<number, Type>();

  if (!unify(a, b, params, subst)) {
    return undefined;
  }

  return subst;
}

function substitute(ty: Type, subst: Subst): Type {
  return match(ty, {
    Var: ({ ref }) =>
      match(ref, {
        Unbound: ({ id }) => {
          const target = subst.get(id);
          if (target != null && !occurs(id, target)) {
            return substitute(target, subst);
          }

          return ty;
        },
        Generic: ({ id }) => {
          const target = subst.get(id);
          if (target != null && !occurs(id, target)) {
            return substitute(target, subst);
          }

          return ty;
        },
        Param: () => ty,
        Link: ({ type }) => substitute(type, subst),
      }),
    Fun: ({ name, args, path }) =>
      Type.Fun(
        name,
        args.map(arg => substitute(arg, subst)),
        path,
      ),
  });
}

function substituteMany(ty: Type, substs: Subst[]): Type {
  return substs.reduce((ty, subst) => substitute(ty, subst), ty);
}

function generalize(ty: Type, level: number): Type {
  return match(ty, {
    Var: ({ ref }) =>
      match(ref, {
        Unbound: ({ id, level: level2 }) => {
          if (level2 > level) {
            return Type.Var(TypeVar.Generic({ id }));
          }

          return ty;
        },
        Generic: () => ty,
        Param: () => ty,
        Link: ({ type }) => generalize(type, level),
      }),
    Fun: ({ name, args, path }) =>
      Type.Fun(
        name,
        args.map(arg => generalize(arg, level)),
        path,
      ),
  });
}

function instantiate(
  ty: Type,
  level: number,
  params: Scope<Type>,
): {
  ty: Type;
  subst: Subst;
  paramsSubst: Map<string, Type>;
} {
  const subst: Subst = new Map();
  const paramsSubst = new Map<string, Type>();

  const aux = (ty: Type): Type => {
    return match(ty, {
      Var: ({ ref }) =>
        match(ref, {
          Unbound: () => ty,
          Generic: ({ id }) => {
            if (subst.has(id)) {
              return subst.get(id)!;
            }

            const freshTy = Type.fresh(level);
            Subst.set(subst, id, freshTy);

            return freshTy;
          },
          Param: ({ name }) => {
            return params.lookup(name).match({
              Some: aux,
              None: () => {
                if (name[0] === '_') {
                  return Type.fresh(level);
                }

                if (!paramsSubst.has(name)) {
                  const freshTy = Type.fresh(level);
                  paramsSubst.set(name, freshTy);
                  return freshTy;
                }

                return paramsSubst.get(name)!;
              },
            });
          },
          Link: ({ type }) => aux(type),
        }),
      Fun: ({ name, args, path }) => Type.Fun(name, args.map(aux), path),
    });
  };

  return { ty: aux(ty), subst, paramsSubst };
}

function fresh(level: number): Type {
  return Type.Var(TypeVar.fresh(level));
}

function list(elems: Type[], tail: Type = Type.Nil): Type {
  return elems.reduceRight((tail, head) => Type.Cons(head, tail), tail);
}

function unlist(ty: Type): Type[] {
  const elems: Type[] = [];

  while (true) {
    if (ty.variant === 'Fun') {
      if (ty.name === 'Nil') {
        return elems;
      }

      if (ty.name === 'Cons') {
        elems.push(ty.args[0]);
        ty = ty.args[1];
        continue;
      }
    }

    panic(`Expected list, got '${show(ty)}'`);
  }
}

function unlink(ty: Type): Type {
  if (ty.variant === 'Var' && ty.ref.variant === 'Link') {
    return unlink(ty.ref.type);
  }

  return ty;
}
