import { DataType, VariantOf, constructors, match, matchMany } from 'itsamatch';
import { Occurrence, OccurrenceComponent } from '../../codegen/decision-trees/ClauseMatrix';
import { Constructors, Impl, Show } from '../../misc/traits';
import { panic } from '../../misc/utils';
import { Literal } from '../../parse/token';
import { EnumDecl, EnumVariant } from './decl';

export type Pattern = DataType<{
  Any: {};
  Variable: { name: string };
  Ctor: { name: string; args: Pattern[]; meta?: string };
  Variant: {
    enumName?: string;
    variantName: string;
    args: Pattern[];
    resolvedEnum?: EnumDecl;
  };
  Struct: { fields: { name: string; rhs?: Pattern }[] };
}>;

export const Pattern = {
  ...constructors<Pattern>().get('Variant'),
  Any: Object.freeze({ variant: 'Any' }),
  Variable: (name: string) => ({ variant: 'Variable', name }),
  Ctor: (name: string, args: Pattern[] = [], meta?: string) => ({
    variant: 'Ctor',
    name,
    args,
    meta,
  }),
  Literal: (value: Literal) => {
    if (value.variant === 'Unit') {
      return Pattern.Ctor('Unit');
    }

    return Pattern.Ctor(`${value.$value}`, [], value.variant);
  },
  Tuple: (args: Pattern[]): Pattern => Pattern.Ctor(`${args.length}`, args, 'Tuple'),
  Struct: (fields: { name: string; rhs?: Pattern }[]): Pattern => ({ variant: 'Struct', fields }),
  variableOccurrences(
    pat: Pattern,
    placeholderVar: { name: string; alreadyDeclared: boolean } = {
      name: '$',
      alreadyDeclared: false,
    },
  ) {
    const vars = new Map<string, Occurrence>();
    const shared = new Map<string, Occurrence>();

    const setVar = (name: string, occ: Occurrence) => {
      if (vars.has(name)) {
        panic(`Variable ${name} is bound multiple times in the same pattern`);
      }

      vars.set(name, occ);
    };

    const visit = (pat: Pattern, occ: Occurrence, parent: string) => {
      match(pat, {
        Any: () => {},
        Variable: ({ name }) => {
          setVar(name, occ);
          shared.set(name, shared.get(parent) ?? occ);
          shared.delete(parent);
        },
        Ctor: ({ args }) => {
          args.forEach((arg, idx) => {
            const comp = OccurrenceComponent.Index(idx);
            const sharedName = `${parent}_${idx}`;
            shared.set(sharedName, [OccurrenceComponent.Variable(parent), comp]);
            visit(arg, [...occ, comp], sharedName);
          });
        },
        Variant: ({ args }) => {
          args.forEach((arg, idx) => {
            const comp = OccurrenceComponent.Field(EnumVariant.formatPositionalArg(idx));
            const sharedName = `${parent}_${idx}`;
            shared.set(sharedName, [OccurrenceComponent.Variable(parent), comp]);
            visit(arg, [...occ, comp], sharedName);
          });
        },
        Struct: ({ fields }) => {
          fields.forEach(({ name, rhs }) => {
            const comp = OccurrenceComponent.Field(name);
            const subOcc = [...occ, comp];
            const sharedName = `${parent}_${name}`;

            if (rhs) {
              shared.set(sharedName, [OccurrenceComponent.Variable(parent), comp]);
              visit(rhs, subOcc, sharedName);
            } else {
              shared.set(name, [OccurrenceComponent.Variable(parent), comp]);
            }
          });
        },
      });
    };

    if (pat.variant === 'Variable') {
      shared.set(pat.name, []);
    } else {
      if (!placeholderVar.alreadyDeclared) {
        shared.set(placeholderVar.name, []);
      }

      visit(pat, [], placeholderVar.name);
    }

    return { vars, shared };
  },
  variables(pat: Pattern): Set<string> {
    const vars = new Set<string>();

    const visit = (pat: Pattern) => {
      match(pat, {
        Any: () => {},
        Variable: ({ name }) => vars.add(name),
        Ctor: ({ args }) => args.forEach(visit),
        Variant: ({ args }) => args.forEach(visit),
        Struct: ({ fields }) =>
          fields.forEach(({ name, rhs }) => (rhs ? visit(rhs) : vars.add(name))),
      });
    };

    visit(pat);

    return vars;
  },
  isVariable: (pat: Pattern): pat is VariantOf<Pattern, 'Variable'> => pat.variant === 'Variable',
  isAnyOrVariable: (pat: Pattern): pat is VariantOf<Pattern, 'Any' | 'Variable'> => {
    return pat.variant === 'Any' || pat.variant === 'Variable';
  },
  /**
   * returns true if the pattern is always matched, for all valid type instances.
   * for instance (a, b, _, { c }) always matches
   * instances of the type (Num, Str, Bool, { c: Num, d: Str })
   */
  isIrrefutable(pat: Pattern): boolean {
    return match(pat, {
      Any: () => true,
      Variable: () => true,
      Ctor: ({ args, meta }) => meta === 'Tuple' && args.every(Pattern.isIrrefutable),
      Variant: () => false,
      Struct: ({ fields }) => fields.every(({ rhs }) => !rhs || Pattern.isIrrefutable(rhs)),
    });
  },
  isMoreGeneral(pat1: Pattern, pat2: Pattern): boolean {
    if (Pattern.isAnyOrVariable(pat1)) return true;
    if (Pattern.isAnyOrVariable(pat2)) return false;

    return matchMany([pat1, pat2], {
      'Ctor Ctor': ({ args: args1, meta: meta1 }, { args: args2, meta: meta2 }) => {
        if (meta1 !== meta2) return false;
        if (args1.length !== args2.length) return false;

        return args1.every((arg1, idx) => Pattern.isMoreGeneral(arg1, args2[idx]));
      },
      'Struct Struct': ({ fields: fields1 }, { fields: fields2 }) => {
        if (fields1.length !== fields2.length) return false;

        return fields1.every(({ name: name1, rhs: rhs1 }) => {
          const field2 = fields2.find(({ name: name2 }) => name1 === name2);
          if (!field2) return false;
          if (!rhs1) return true;

          return Pattern.isMoreGeneral(rhs1, field2.rhs!);
        });
      },
      'Variant Variant': (
        { variantName: variantName1, args: args1 },
        { variantName: variantName2, args: args2 },
      ) => {
        if (variantName1 !== variantName2) return false;
        if (args1.length !== args2.length) return false;

        return args1.every((arg1, idx) => Pattern.isMoreGeneral(arg1, args2[idx]));
      },
      _: () => panic('isMoreGeneral: Non-any patterns must be of the same variant'),
    });
  },
  // see "The Definition of Standard ML", Milner et al. 1990, 4.11, item 2:
  // In a match of the form pat_1 => exp_1 | ··· | pat_n => exp_n
  // the pattern sequence pat_1 ,..., pat_n
  // should be irredundant; that is, each pat j must
  // match some value (of the right type) which is not matched by pat_i
  // for any i < j.
  isRedundant(index: number, patterns: Pattern[]): boolean {
    const pat = patterns[index];

    for (let i = 0; i < index; i += 1) {
      if (Pattern.isMoreGeneral(patterns[i], pat)) {
        return true;
      }
    }

    return false;
  },
  show: (pat: Pattern): string =>
    match(pat, {
      Any: () => '_',
      Variable: ({ name }) => name,
      Ctor: ({ name, args, meta }) => {
        const lhsName = meta === 'Tuple' ? '' : name;

        if (args.length === 0) {
          return lhsName;
        }

        return `${lhsName}(${args.map(Pattern.show).join(', ')})`;
      },
      Variant: ({ enumName, variantName, args }) =>
        `${enumName ?? ''}.${variantName}(${args.map(Pattern.show).join(', ')})`,
      Struct: ({ fields }) =>
        `{ ${fields
          .map(({ name, rhs }) => (rhs ? `${name}: ${Pattern.show(rhs)}` : name))
          .join(', ')} }`,
    }),
} satisfies Impl<Constructors<Pattern> & Show<Pattern>>;
