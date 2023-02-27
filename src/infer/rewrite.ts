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
            const newArgs = args.map(arg => reduce(arg, trs));
            const newTy = Type.Fun(name, newArgs.map(arg => arg.term));
            const changed = newArgs.some(arg => arg.changed);

            for (const [lhs, rhs] of rules) {
                const subst: Subst = new Map();
                try {
                    Type.unify(lhs, newTy, subst);
                    const substituted = Type.substitute(rhs, subst);
                    const reduced = reduce(substituted, trs);
                    return { term: reduced.term, changed: true };
                } catch { }
            }

            return { term: newTy, changed };
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
