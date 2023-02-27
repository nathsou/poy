import { match } from "itsamatch";
import { Impl, Show } from "../misc/traits";
import { assert } from "../misc/utils";
import { Subst, Type } from "./type";

export type Rule = [lhs: Type, rhs: Type];
export type TRS = Map<string, Rule[]>;

export const TRS = {
    create: (parent?: TRS): TRS => new Map(parent ?? []),
    add: (trs: TRS, lhs: Type, rhs: Type): void => {
        assert(lhs.variant === 'Fun');

        if (trs.has(lhs.name)) {
            trs.get(lhs.name)!.push([lhs, rhs]);
        } else {
            trs.set(lhs.name, [[lhs, rhs]]);
        }
    },
    normalize,
    reduce,
    show,
} satisfies Impl<Show<TRS>>;

function show(trs: TRS): string {
    return [...trs.values()].map((rules) => {
        return rules.map(([lhs, rhs]) => `${Type.show(lhs)} -> ${Type.show(rhs)}`).join('\n');
    }).join('\n');
}

function reduce(ty: Type, trs: TRS): { term: Type, changed: boolean } {
    return match(ty, {
        Var: () => ({ term: ty, changed: false }),
        Fun: ({ name, args }) => {
            const rules = trs.get(name) ?? [];

            for (const [lhs, rhs] of rules) {
                const subst: Subst = new Map();
                try {
                    Type.unify(lhs, ty, subst);
                    const reduced = reduce(Type.substitute(rhs, subst), trs);
                    return { term: reduced.term, changed: true };
                } catch { }
            }

            const newArgs = args.map(arg => reduce(arg, trs));
            const changed = newArgs.some(arg => arg.changed);
            const term = Type.Fun(name, newArgs.map(arg => arg.term));
            return { term, changed };
        },
    });
}

export function normalize(trs: TRS, ty: Type, maxReductions = 10_000): Type {
    let term = ty;

    for (let i = 0; i < maxReductions; i++) {
        const { term: reduced, changed } = reduce(term, trs);
        term = reduced;
        if (!changed) {
            return term;
        }
    }

    throw new Error(`Possibly infinite type rewriting for '${Type.show(ty)}'`);
}
