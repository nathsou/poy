import { match } from "itsamatch";
import { Subst, Type } from "./type";

export type Rule = [lhs: Type, rhs: Type];
export type TRS = Map<string, Rule[]>;

function reduce(ty: Type, trs: TRS): { term: Type, changed: boolean } {
    return match(ty, {
        Var: () => ({ term: ty, changed: false }),
        Fun: ({ name, args }) => {
            const rules = trs.get(name) ?? [];

            for (const [lhs, rhs] of rules) {
                const subst: Subst = new Map();
                try {
                    Type.unify(lhs, ty, subst);
                } catch { }

                const reduced = reduce(Type.substitute(rhs, subst), trs);
                return { term: reduced.term, changed: true };
            }

            const newArgs = args.map(arg => reduce(arg, trs));
            const changed = newArgs.some(arg => arg.changed);
            const term = Type.Fun(name, newArgs.map(arg => arg.term));
            return { term, changed };
        },
    });
}

export function normalize(ty: Type, trs: TRS, maxReductions = 10_000): Type {
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
