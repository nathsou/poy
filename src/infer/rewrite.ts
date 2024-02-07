import { match } from 'itsamatch';
import { config } from '../config';
import { Impl, Show } from '../misc/traits';
import { assert, last, panic, pushMap, zip } from '../misc/utils';
import { TypeEnv } from './infer';
import { Subst, Type } from './type';
import { Scope } from '../misc/scope';
import { Maybe } from '../misc/maybe';
import { Module } from '../resolve/resolve';

export type Rule = { pub: boolean; lhs: Type; rhs: Type };
export type TRS = {
  imports: { mod: Module, importedRules: Set<string> }[],
  rules: Scope<Rule[]>;
};

export const TRS = {
  create: (parent?: TRS): TRS => ({
    imports: [],
    rules: new Scope(parent?.rules),
  }),
  add: ({ rules }: TRS, lhs: Type, rhs: Type, pub: boolean): void => {
    assert(lhs.variant === 'Fun');
    pushMap(rules.members, lhs.name, { lhs, rhs, pub });
  },
  lookup: (trs: TRS, name: string): Maybe<Rule[]> => {
    return trs.rules.lookup(name).or(() => {
      return Maybe
        .firstBy(trs.imports, ({ mod }) => TRS.lookup(mod.env.types, name))
        .map(([rules, index]) => {
          const { mod, importedRules } = trs.imports[index];

          if (!importedRules.has(name)) {
            panic(`Type '${name}' from '${mod.name}' has not been imported.`);
          }

          return rules;
        });
    });
  },
  normalize,
  show,
} satisfies Impl<Show<TRS>>;

function show(trs: TRS): string {
  return [...trs.rules.members.values()]
    .map(rules => {
      return rules.map(({ lhs, rhs }) => `${Type.show(lhs)} -> ${Type.show(rhs)}`).join('\n');
    })
    .join('\n');
}

type StepCounter = { steps: number };

const externals: Record<
  string,
  (args: Type[], env: TypeEnv, counter: StepCounter) => Type | null
> = {
  '@eq': (args, env, counter) => {
    assert(args.length === 2, '@eq expects exactly two arguments');
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
      const subst: Subst = new Map(
        zip(
          lambdaArgs.map(arg => {
            assert(arg.variant === 'Var' && arg.ref.variant === 'Unbound');
            return arg.ref.id;
          }),
          callArgs,
        ),
      );

      return Type.substitute(body, subst);
    }

    return Type.Fun(symb.name, callArgs);
  },
  '@thunk': args => {
    assert(args.length === 1, '@thunk expects exactly one argument');
    return null;
  },
  '@symb': args => {
    assert(args.length === 1, '@symb expects exactly one argument');
    assert(args[0].variant === 'Fun', '@symb expects a symbol as first argument');
    return Type.Fun(args[0].name, []);
  },
  '@args': args => {
    assert(args.length === 1, '@args expects exactly one argument');
    assert(args[0].variant === 'Fun', '@args expects a symbol as first argument');
    return Type.utils.list(args[0].args);
  },
  '@let': (args, env, counter) => {
    assert(args.length === 3, '@let expects exactly three arguments');
    const [name, value, body] = args;
    assert(
      name.variant === 'Var' && name.ref.variant === 'Unbound',
      '@let expects a variable as first argument',
    );
    const subst = new Map([[name.ref.id, normalize(env, value, counter)]]);
    return Type.substitute(body, subst);
  },
  '@typeOf': (args, env) => {
    assert(args.length === 1, '@typeOf expects exactly one argument');
    assert(
      args[0].variant === 'Var' && args[0].ref.variant === 'Param',
      '@typeOf expects a variable as argument',
    );

    const name = args[0].ref.name;

    return env.variables.lookup(name).match({
      Some: ({ ty }) => ty,
      None: () => panic(`Variable '${name}' not found`),
    });
  },
};

function reduce(env: TypeEnv, ty: Type, counter: StepCounter): { term: Type; matched: boolean } {
  counter.steps += 1;

  return match(ty, {
    Var: () => ({ term: ty, matched: false }),
    Fun: ({ name, args }) => {
      if (name[0] === '@') {
        const external = externals[name];

        if (external) {
          const result = external(args, env, counter);
          return { term: result ?? ty, matched: result != null };
        }

        panic(`Unknown external function '${name}'`);
      }

      const newTy = Type.Fun(
        name,
        args.map(arg => normalize(env, arg, counter)),
      );

      const rules = TRS.lookup(env.types, name);

      if (rules.isSome()) {
        for (const { lhs, rhs } of rules.unwrap()) {
          const subst = Type.unifyPure(lhs, newTy);

          if (subst) {
            const substituted = Type.substitute(rhs, subst);
            const nf = reduce(env, substituted, counter);
            return { term: nf.term, matched: true };
          }
        }
      }

      return { term: newTy, matched: false };
    },
  });
}

export function normalize(env: TypeEnv, ty: Type, counter: StepCounter = { steps: 0 }): Type {
  let term = ty;

  while (counter.steps < config.maxReductionSteps) {
    const { term: reduced, matched } = reduce(env, term, counter);
    term = reduced;

    if (!matched) {
      return term;
    }
  }

  return panic(
    `Type '${Type.show(ty)}' did not reach a normal form after ${config.maxReductionSteps} reductions`,
  );
}
