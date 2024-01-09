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
  variableOccurrences: (pat: Pattern): Map<string, Occurrence> => {
    const vars = new Map<string, Occurrence>();

    const setVar = (name: string, occ: Occurrence) => {
      if (vars.has(name)) {
        panic(`Variable ${name} is bound multiple times in the same pattern`);
      }

      vars.set(name, occ);
    };

    const visit = (pat: Pattern, occ: Occurrence) => {
      match(pat, {
        Any: () => {},
        Variable: ({ name }) => setVar(name, occ),
        Ctor: ({ args }) => {
          args.forEach((arg, idx) => visit(arg, [...occ, OccurrenceComponent.Index(idx)]));
        },
        Variant: ({ args }) => {
          args.forEach((arg, idx) => visit(arg, [...occ, OccurrenceComponent.Field(`_${idx}`)]));
        },
        Struct: ({ fields }) => {
          fields.forEach(({ name, rhs }) => {
            const subOcc = [...occ, OccurrenceComponent.Field(name)];

            if (rhs) {
              visit(rhs, subOcc);
            } else {
              setVar(name, subOcc);
            }
          });
        },
      });
    };

    visit(pat, []);

    return vars;
  },
} satisfies Impl<Constructors<Pattern>>;
