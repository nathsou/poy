import { match } from "itsamatch";
import { config } from "../config";
import { Impl, Show } from "../misc/traits";
import { assert } from "../misc/utils";
import { Type } from "./type";

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
    show,
} satisfies Impl<Show<TRS>>;

function show(trs: TRS): string {
    return [...trs.values()].map((rules) => {
        return rules.map(([lhs, rhs]) => `${Type.show(lhs)} -> ${Type.show(rhs)}`).join('\n');
    }).join('\n');
}

type StepCounter = { steps: number };

function reduce(ty: Type, trs: TRS, counter: StepCounter): { term: Type, matched: boolean } {
    counter.steps += 1;

    return match(ty, {
        Var: () => ({ term: ty, matched: false }),
        Fun: ({ name, args }) => {
            const rules = trs.get(name) ?? [];
            const newTy = Type.Fun(name, args.map(arg => normalize(trs, arg, counter)));

            for (const [lhs, rhs] of rules) {
                const subst = Type.unifyPure(lhs, newTy);

                if (subst) {
                    const substituted = Type.substitute(rhs, subst);
                    const reduced = reduce(substituted, trs, counter);
                    return { term: reduced.term, matched: true };
                }
            }

            return { term: newTy, matched: false };
        },
    });
}

export function normalize(
    trs: TRS,
    ty: Type,
    counter: StepCounter = { steps: 0 },
): Type {
    let term = ty;

    while (counter.steps < config.maxReductionSteps) {
        const { term: reduced, matched } = reduce(term, trs, counter);
        term = reduced;

        if (!matched) {
            return term;
        }
    }


    throw new Error(`Type '${Type.show(ty)}' did not reach a normal form after ${config.maxReductionSteps} reductions`);
}
