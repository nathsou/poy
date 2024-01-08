import { DataType, constructors, match } from 'itsamatch';
import { Literal } from '../../parse/token';
import { EnumDecl } from './decl';
import { Constructors, Impl } from '../../misc/traits';
import { Occurrence, OccurrenceComponent } from '../../codegen/decision-trees/ClauseMatrix';
import { panic } from '../../misc/utils';

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
  variableOccurrences: (pat: Pattern): Map<string, Occurrence> => {
    const vars = new Map<string, Occurrence>();

    const visit = (pat: Pattern, occ: Occurrence) => {
      match(pat, {
        Any: () => {},
        Variable: ({ name }) => {
          if (vars.has(name)) {
            panic(`Variable ${name} is bound multiple times in the same pattern`);
          }

          vars.set(name, occ);
        },
        Ctor: ({ args }) => {
          args.forEach((arg, idx) => visit(arg, [...occ, OccurrenceComponent.Index(idx)]));
        },
        Variant: ({ args }) => {
          args.forEach((arg, idx) => visit(arg, [...occ, OccurrenceComponent.Field(`_${idx}`)]));
        },
      });
    };

    visit(pat, []);

    return vars;
  },
} satisfies Impl<Constructors<Pattern>>;
