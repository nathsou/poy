import { DataType, genConstructors, match, matchMany } from "itsamatch";
import { Context } from "../misc/context";
import { Eq, Impl, Rewrite, Show } from "../misc/traits";
import { panic } from "../misc/utils";
import { TypeEnv } from "./infer";
import { normalize, TRS } from './rewrite';

export type TypeVar = DataType<{
    Unbound: { id: number, name?: string, level: number },
    Generic: { id: number, name?: string },
    Link: { type: Type },
}>;

export const TypeVar = {
    ...genConstructors<TypeVar>(['Unbound', 'Generic']),
    Link: (type: Type): TypeVar => ({ variant: 'Link', type }),
    eq: (a, b) => matchMany([a, b], {
        'Unbound Unbound': (a, b) => a.id === b.id,
        'Generic Generic': (a, b) => a.id === b.id,
        'Link Link': (a, b) => Type.eq(a.type, b.type),
        _: () => false,
    }),
    show: self => match(self, {
        Unbound: ({ id, name }) => name ?? `?${id}`,
        Generic: ({ id, name }) => name ?? `?${id}`,
        Link: ({ type }) => Type.show(type),
    }),
    linkTo: (self: { ref: TypeVar }, type: Type, subst?: Subst): void => {
        if (self.ref.variant === 'Unbound') {
            if (subst != null) {
                subst.set(self.ref.id, type);
            } else {
                self.ref = TypeVar.Link(type);
            }
        }
    },
    fresh: (level: number, name?: string): TypeVar => TypeVar.Unbound({ id: Context.freshTypeVarId(), name, level }),
} satisfies Impl<Eq<TypeVar> & Show<TypeVar>>;

export type Type = DataType<{
    Var: { ref: TypeVar },
    Fun: { name: string, args: Type[] },
}>;

export const Type = {
    Var: (ref: TypeVar): Type => ({ variant: 'Var', ref }),
    Fun: (name: string, args: Type[]): Type => ({ variant: 'Fun', name, args }),
    Array: (elem: Type): Type => Type.Fun('Array', [elem]),
    Tuple: (elems: Type[]): Type => {
        switch (elems.length) {
            case 0: return Type.Fun('Unit', []);
            case 1: return elems[0];
            default: return Type.Fun('Tuple', [list(elems)]);
        }
    },
    Function: (args: Type[], ret: Type): Type => Type.Fun('Function', [list(args), ret]),
    Bool: Object.freeze<Type>({ variant: 'Fun', name: 'Bool', args: [] }),
    Num: Object.freeze<Type>({ variant: 'Fun', name: 'Num', args: [] }),
    Str: Object.freeze<Type>({ variant: 'Fun', name: 'Str', args: [] }),
    Nil: Object.freeze<Type>({ variant: 'Fun', name: 'Nil', args: [] }),
    Cons: (head: Type, tail: Type): Type => Type.Fun('Cons', [head, tail]),
    Unit: Object.freeze<Type>({ variant: 'Fun', name: 'Tuple', args: [{ variant: 'Fun', name: 'Nil', args: [] }] }),
    show,
    list,
    unlist,
    isList,
    eq,
    unify,
    substitute,
    normalize,
    fresh,
    vars,
    rewrite,
} satisfies Impl<Show<Type> & Eq<Type> & Rewrite<Type>>;

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
    return match(ty, {
        Var: ({ ref }) => TypeVar.show(ref),
        Fun: ({ name, args }) => {
            switch (name) {
                case 'Nil':
                    return '[]';
                case 'Cons':
                    if (isList(args[1])) {
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
}

function rewrite(ty: Type, f: (ty: Type) => Type): Type {
    return f(match(ty, {
        Var: ({ ref }) => Type.Var(ref),
        Fun: ({ name, args }) => Type.Fun(name, args.map(f)),
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

function eq(a: Type, b: Type): boolean {
    return matchMany([a, b], {
        'Var Var': Object.is,
        'Fun Fun': (a, b) =>
            a.name === b.name &&
            a.args.length === b.args.length &&
            a.args.every((arg, i) => eq(arg, b.args[i])),
        _: () => false,
    });
}

export type Subst = Map<number, Type>;

function occursCheckAdjustLevels(id: number, level: number, ty: Type): void {
    const go = (t: Type): void => {
        match(t, {
            Var: v => match(v.ref, {
                Unbound: ({ id: id2, level: level2 }) => {
                    // if (id === id2) {
                    //     panic('Recursive type');
                    // }

                    if (level2 > level) {
                        v.ref = TypeVar.Unbound({ id: id2, level });
                    }
                },
                Generic: () => {
                    panic('Generic type variables should not appear during unification');
                },
                Link: ({ type }) => go(type),
            }),
            Fun: ({ args }) => args.forEach(go),
        });
    };

    go(ty);
}

function unifyVar(v: { ref: TypeVar }, ty: Type, eqs: [Type, Type][], subst?: Subst) {
    match(v.ref, {
        Unbound: ({ id, level }) => {
            // if (ty.variant === 'Var' && ty.ref.variant === 'Unbound' && ty.ref.id === id) {
            //     panic('There should only be one instance of a particular type variable.');
            // }

            occursCheckAdjustLevels(id, level, ty);

            TypeVar.linkTo(v, ty, subst);
        },
        Generic: () => {
            panic('Generic type variables should not appear during unification');
        },
        Link: ({ type }) => {
            eqs.push([type, ty]);
        },
    });
}

function unify(a: Type, b: Type, subst?: Subst): void {
    const eqs: [Type, Type][] = [[a, b]];
    const error = () => panic(`Cannot unify ${show(a)} with ${show(b)}`);

    while (eqs.length > 0) {
        const [s, t] = eqs.pop()!;

        if (s.variant === 'Var') {
            unifyVar(s, t, eqs, subst);
        } else if (t.variant === 'Var') {
            unifyVar(t, s, eqs, subst);
        } else if (s.variant === 'Fun' && t.variant === 'Fun') {
            if (s.name !== t.name || s.args.length !== t.args.length) {
                error();
            }

            for (let i = 0; i < s.args.length; i++) {
                eqs.push([s.args[i], t.args[i]]);
            }
        } else {
            error();
        }
    }
}

function substitute(ty: Type, subst: Subst): Type {
    return match(ty, {
        Var: ({ ref }) => match(ref, {
            Unbound: ({ id }) => subst.get(id) ?? ty,
            Generic: ({ id }) => subst.get(id) ?? ty,
            Link: ({ type }) => substitute(type, subst),
        }),
        Fun: ({ name, args }) => Type.Fun(name, args.map(arg => substitute(arg, subst))),
    });
}

function fresh(level: number, name?: string): Type {
    return Type.Var(TypeVar.fresh(level, name));
}
