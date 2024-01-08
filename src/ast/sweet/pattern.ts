import { DataType, constructors } from 'itsamatch';
import { Literal } from '../../parse/token';
import { EnumDecl } from './decl';
import { Constructors, Impl } from '../../misc/traits';

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
    Tuple: (args: Pattern[]): Pattern =>
        Pattern.Ctor(`${args.length}`, args, 'Tuple'),
} satisfies Impl<Constructors<Pattern>>;
