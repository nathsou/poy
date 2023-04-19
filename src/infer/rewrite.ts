import { match } from "itsamatch";
import { config } from "../config";
import { Impl, Show } from "../misc/traits";
import { assert, last, panic, zip } from "../misc/utils";
import { TypeEnv } from "./infer";
import { Subst, Type } from "./type";

export type Rule = { lhs: Type, rhs: Type, pub: boolean };
export type TRS = Map<string, Rule[]>;

export const TRS = {
    create: (parent?: TRS): TRS => new Map(parent ?? []),
    add: (trs: TRS, lhs: Type, rhs: Type, pub: boolean): void => {
        assert(lhs.variant === 'Fun');

        if (trs.has(lhs.name)) {
            trs.get(lhs.name)!.push({ lhs, rhs, pub });
        } else {
            trs.set(lhs.name, [{ lhs, rhs, pub }]);
        }
    },
    normalize,
    show,
} satisfies Impl<Show<TRS>>;

function show(trs: TRS): string {
    return [...trs.values()].map((rules) => {
        return rules.map(({ lhs, rhs }) => `${Type.show(lhs)} -> ${Type.show(rhs)}`).join('\n');
    }).join('\n');
}

type StepCounter = { steps: number };

const externals: Record<string, (args: Type[], env: TypeEnv, counter: StepCounter) => Type | null> = {
    '@eq': (args, env, counter) => {
        assert(args.length === 2, '@equ expects exactly two arguments');
        const [lhs, rhs] = args;
        const lhsTy = normalize(env, lhs, counter);
        const rhsTy = normalize(env, rhs, counter);
        return Type.Fun(Type.eq(lhsTy, rhsTy) ? 'True' : 'False', []);
    },
    '@if': (args, env, counter) => {
        assert(args.length === 3, '@if expects exactly three arguments');
        const [cond, then, else_] = args;
        const condTy = normalize(env, cond, counter);

        if (condTy.variant === 'Fun') {
            if (condTy.name === 'True') {
                return then;
            } else if (condTy.name === 'False') {
                return else_;
            }
        }

        return null;
    },
    '@fun': args => {
        assert(args.length >= 2, '@fun expects at least two arguments');
        return null;
    },
    '@app': args => {
        assert(args.length > 0, '@app expects at least one argument');
        const [symb, ...callArgs] = args;
        assert(symb.variant === 'Fun', '@app expects a symbol as first argument');

        if (symb.name === '@fun') {
            const lambdaArgs = symb.args.slice(0, -1);
            const body = last(symb.args);
            const subst: Subst = new Map(zip(lambdaArgs.map(arg => {
                assert(arg.variant === 'Var' && arg.ref.variant === 'Unbound');
                return arg.ref.id;
            }), callArgs));

            return Type.substitute(body, subst);
        }

        return Type.Fun(symb.name, callArgs, symb.path);
    },
    '@thunk': args => {
        assert(args.length === 1, '@thunk expects exactly one argument');
        return null;
    },
    '@symb': args => {
        assert(args.length === 1, '@symb expects exactly one argument');
        assert(args[0].variant === 'Fun', '@symb expects a symbol as first argument');
        return Type.Fun(args[0].name, [], args[0].path);
    },
    '@args': args => {
        assert(args.length === 1, '@args expects exactly one argument');
        assert(args[0].variant === 'Fun', '@args expects a symbol as first argument');
        return Type.utils.list(args[0].args);
    },
    '@let': (args, env, counter) => {
        assert(args.length === 3, '@let expects exactly three arguments');
        const [name, value, body] = args;
        assert(name.variant === 'Var' && name.ref.variant === 'Unbound', '@let expects a variable as first argument');
        const subst = new Map([[name.ref.id, normalize(env, value, counter)]]);
        return Type.substitute(body, subst);
    },
};

function reduce(env: TypeEnv, ty: Type, counter: StepCounter): { term: Type, matched: boolean } {
    counter.steps += 1;

    return match(ty, {
        Var: () => ({ term: ty, matched: false }),
        Fun: ({ name, args, path }) => {
            if (name[0] === '@') {
                const external = externals[name];

                if (external) {
                    const result = external(args, env, counter);
                    return { term: result ?? ty, matched: result != null };
                }

                panic(`Unknown external function '${name}'`);
            }

            const moduleEnv: TypeEnv = path?.env ?? env;
            const newTy = Type.Fun(name, args.map(arg => normalize(env, arg, counter)));
            const rules = moduleEnv.typeRules.get(name) ?? [];

            for (const { lhs, rhs } of rules) {
                const subst = Type.unifyPure(lhs, newTy);

                if (subst) {
                    const substituted = Type.substitute(rhs, subst);
                    const nf = reduce(moduleEnv, substituted, counter);
                    return { term: nf.term, matched: true };
                }
            }

            return { term: newTy, matched: false };
        },
    });
}

export function normalize(
    env: TypeEnv,
    ty: Type,
    counter: StepCounter = { steps: 0 },
): Type {
    let term = ty;

    while (counter.steps < config.maxReductionSteps) {
        const { term: reduced, matched } = reduce(env, term, counter);
        term = reduced;

        if (!matched) {
            return term;
        }
    }

    return panic(`Type '${Type.show(ty)}' did not reach a normal form after ${config.maxReductionSteps} reductions`);
}
