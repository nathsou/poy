import { DataType, VariantOf, constructors, match } from 'itsamatch';
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
  variableOccurrences: (
    pat: Pattern,
    placeholderVar: { name: string; alreadyDeclared: boolean } = {
      name: '$',
      alreadyDeclared: false,
    },
  ) => {
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
  variables: (pat: Pattern): Set<string> => {
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
  /**
   * returns true if the pattern is always matched, for all valid type instances.
   * for instance (a, b, _, { c }) always matches
   * instances of the type (Num, Str, Bool, { c: Num, d: Str })
   */
  isAlwaysMatched: (pat: Pattern): boolean =>
    match(pat, {
      Any: () => true,
      Variable: () => true,
      Ctor: ({ args, meta }) => meta === 'Tuple' && args.every(Pattern.isAlwaysMatched),
      Variant: () => false,
      Struct: ({ fields }) => fields.every(({ rhs }) => !rhs || Pattern.isAlwaysMatched(rhs)),
    }),
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
