import { DataType, genConstructors, match, matchMany } from "itsamatch";
import { config } from "../config";
import { Context } from "../misc/context";
import { Scope, TypeParamScope } from "../misc/scope";
import { Eq, Impl, Rewrite, Show } from "../misc/traits";
import { array, assert, panic } from "../misc/utils";
import { ModulePath } from "../resolve/resolve";
import { normalize } from './rewrite';

export type Type = DataType<{
    Var: { ref: TypeVar },
    Fun: { name: string, args: Type[], path?: ModulePath },
}>;

export const Type = {
    Var: (ref: TypeVar): Type => ({ variant: 'Var', ref }),
    Fun: (name: string, args: Type[], path?: ModulePath): Type => ({ variant: 'Fun', name, args, path }),
    Array: (elem: Type): Type => Type.Fun('Array', [elem]),
    Tuple: (elems: Type[]): Type => elems.length === 1 ? elems[0] : Type.Fun('Tuple', [list(elems)]),
    Function: (args: Type[], ret: Type): Type => Type.Fun('Function', [list(args), ret]),
    Bool: Object.freeze<Type>({ variant: 'Fun', name: 'Bool', args: [] }),
    Num: Object.freeze<Type>({ variant: 'Fun', name: 'Num', args: [] }),
    Str: Object.freeze<Type>({ variant: 'Fun', name: 'Str', args: [] }),
    Nil: Object.freeze<Type>({ variant: 'Fun', name: 'Nil', args: [] }),
    Cons: (head: Type, tail: Type): Type => Type.Fun('Cons', [head, tail]),
    Unit: Object.freeze<Type>({ variant: 'Fun', name: 'Tuple', args: [{ variant: 'Fun', name: 'Nil', args: [] }] }),
    show,
    eq,
    unify,
    unifyPure,
    substitute,
    substituteMany,
    normalize,
    fresh,
    vars,
    namedParams,
    rewrite,
    generalize,
    instantiate,
    parameterize,
    specificity,
    occurs,
    utils: {
        vars,
        isFunction(ty: Type): ty is Type & { variant: 'Fun', name: 'Function', args: [Type, Type] } {
            return ty.variant === 'Fun' && ty.name === 'Function' && ty.args.length === 2 && isList(ty.args[0]);
        },
        parameters(ty: Type): Type[] {
            assert(Type.utils.isFunction(ty));
            return unlist(ty.args[0]);
        },
        returnType(ty: Type): Type {
            assert(Type.utils.isFunction(ty));
            return ty.args[1];
        },
        list,
        unlist,
        isList,
        unlink,
    },
} satisfies Impl<Show<Type> & Eq<Type> & Rewrite<Type>>;

export type TypeVarId = number;
export type TypeVar = DataType<{
    Unbound: { id: number, name?: string, level: number },
    Generic: { id: number, name?: string },
    Param: { name: string },
    Link: { type: Type },
}>;

export const showTypeVarId = (id: number): string => {
    return String.fromCharCode(97 + (id % 26)) + (id >= 26 ? String(Math.floor(id / 26)) : '');
};

export const TypeVar = {
    ...genConstructors<TypeVar>(['Unbound', 'Generic', 'Param']),
    Link: (type: Type): TypeVar => ({ variant: 'Link', type }),
    eq: (a, b) => matchMany([a, b], {
        'Unbound Unbound': (a, b) => a.id === b.id,
        'Generic Generic': (a, b) => a.id === b.id,
        'Link Link': (a, b) => Type.eq(a.type, b.type),
        'Param Param': (a, b) => a.name === b.name,
        _: () => false,
    }),
    show: (self, ignoreName = config.debug.ignoreTypeParamName) => match(self, {
        Unbound: ({ id, name }) => ignoreName ? showTypeVarId(id) : name ?? showTypeVarId(id),
        Generic: ({ id, name }) => ignoreName ? showTypeVarId(id) : name ?? showTypeVarId(id),
        Param: ({ name }) => "'" + name,
        Link: ({ type }) => Type.show(type),
    }),
    context: {
        substitutions: array<Subst>(),
        push: (): Subst => {
            const subst = new Map<number, Type>();
            TypeVar.context.substitutions.push(subst);
            return subst;
        },
        pop: (): Subst => {
            assert(TypeVar.context.substitutions.length > 0, 'Substitution context stack is empty');
            return TypeVar.context.substitutions.pop()!;
        },
    },
    recordSubstitutions: <T>(cb: (subst: Subst) => T): T => {
        const subst = TypeVar.context.push();
        const ret = cb(subst);
        TypeVar.context.pop();
        return ret;
    },
    linkTo: (self: { ref: TypeVar }, type: Type, subst?: Subst): void => {
        if (self.ref.variant === 'Unbound') {
            if (!(type.variant === 'Var' && type.ref.variant === 'Unbound' && type.ref.id === self.ref.id)) {
                for (const sig of TypeVar.context.substitutions) {
                    Subst.set(sig, self.ref.id, type);
                }

                const deref = unlink(type);

                if (subst != null) {
                    Subst.set(subst, self.ref.id, deref);
                } else {
                    self.ref = TypeVar.Link(deref);
                }
            }
        }
    },
    fresh: (level: number, name?: string): TypeVar => TypeVar.Unbound({ id: Context.freshTypeVarId(), name, level }),
} satisfies Impl<Eq<TypeVar> & Show<TypeVar>>;

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

function show(ty: Type, ignoreName = config.debug.ignoreTypeParamName): string {
    const genericTyVars = new Set<string>();

    const show = (ty: Type): string => {
        return match(ty, {
            Var: ({ ref }) => {
                if (ref.variant === 'Generic') {
                    genericTyVars.add(ignoreName ? showTypeVarId(ref.id) : ref.name ?? showTypeVarId(ref.id));
                }

                return TypeVar.show(ref, ignoreName);
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
    return f(match(ty, {
        Var: ({ ref }) => Type.Var(ref),
        Fun: ({ name, args, path }) => Type.Fun(name, args.map(f), path),
    }));
}

function vars(ty: Type): Map<string, number> {
    const go = (ty: Type): void => {
        match(ty, {
            Var: ({ ref }) => {
                if (ref.variant === 'Unbound' && ref.name != null) {
                    vars.set(ref.name, ref.id);
                }
            },
            Fun: ({ args }) => args.forEach(go),
        });
    };

    const vars = new Map<string, number>();
    go(ty);

    return vars;
}

function namedParams(ty: Type): Set<string> {
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
        Fun: ({ args }) => 1000 + args.reduce((acc, arg) => acc + specificity(arg), 0),
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
        const entries = Array.from(subst.entries()).map(([id, ty]) => `${showTypeVarId(id)}: ${Type.show(ty)}`);

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
        Var: ({ ref }) => match(ref, {
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
            Var: v => match(v.ref, {
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

function unifyVar(v: { ref: TypeVar }, ty: Type, eqs: [Type, Type][], params?: Scope<Type>, subst?: Subst): void {
    match(v.ref, {
        Unbound: ({ id, level }) => {
            if (ty.variant === 'Var' && ty.ref.variant === 'Unbound' && ty.ref.id === id) {
                panic(`There should only be one instance of a particular type variable, but found two instances of '${showTypeVarId(id)}'.`);
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
                    }
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
        const [s, t] = eqs.pop()!;
        if (config.debug.unification) {
            console.log(`unify '${show(s)}' with '${show(t)}'`);
        }

        if (eq(s, t)) { continue; }

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
        Var: ({ ref }) => match(ref, {
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
        Fun: ({ name, args, path }) => Type.Fun(name, args.map(arg => substitute(arg, subst)), path),
    });
}

function substituteMany(ty: Type, substs: Subst[]): Type {
    return substs.reduce((ty, subst) => substitute(ty, subst), ty);
}

function parameterize(ty: Type, params: TypeParamScope): Type {
    return match(ty, {
        Var: ({ ref }) => match(ref, {
            Unbound: ({ id }) => {
                return params.lookupParam(id).match({
                    Some: name => Type.Var(TypeVar.Param({ name })),
                    None: () => ty,
                });
            },
            Generic: ({ id }) => {
                return params.lookupParam(id).match({
                    Some: name => Type.Var(TypeVar.Param({ name })),
                    None: () => ty,
                });
            },
            Param: () => ty,
            Link: ({ type }) => parameterize(type, params),
        }),
        Fun: ({ name, args, path }) => Type.Fun(name, args.map(arg => parameterize(arg, params)), path),
    });
}

function generalize(ty: Type, level: number): Type {
    return match(ty, {
        Var: ({ ref }) => match(ref, {
            Unbound: ({ id, level: level2, name }) => {
                if (level2 > level) {
                    return Type.Var(TypeVar.Generic({ id, name }));
                }

                return ty;
            },
            Generic: () => ty,
            Param: () => ty,
            Link: ({ type }) => generalize(type, level),
        }),
        Fun: ({ name, args, path }) => Type.Fun(name, args.map(arg => generalize(arg, level)), path),
    });
}

function instantiate(ty: Type, level: number, params: Scope<Type>): { ty: Type, subst: Subst } {
    const subst: Subst = new Map();

    const aux = (ty: Type): Type => {
        return match(ty, {
            Var: ({ ref }) => match(ref, {
                Unbound: () => ty,
                Generic: ({ id, name }) => {
                    if (subst.has(id)) {
                        return subst.get(id)!;
                    }

                    const freshTy = Type.fresh(level, name);
                    Subst.set(subst, id, freshTy);

                    return freshTy;
                },
                Param: ({ name }) => {
                    const res = params.lookup(name);

                    return res.match({
                        Some: aux,
                        None: () => {
                            if (name[0] === '_') {
                                return Type.fresh(level);
                            }

                            return panic(`Unknown type parameter '${name}'`);
                        },
                    });
                },
                Link: ({ type }) => aux(type),
            }),
            Fun: ({ name, args, path }) => Type.Fun(name, args.map(aux), path),
        });
    };

    return { ty: aux(ty), subst };
}

function fresh(level: number, name?: string): Type {
    return Type.Var(TypeVar.fresh(level, name));
}

function list(elems: Type[]): Type {
    return elems.reduceRight((tail, head) => Type.Cons(head, tail), Type.Nil);
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
