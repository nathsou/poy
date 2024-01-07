import { DataType } from 'itsamatch';
import { Literal } from '../../parse/token';

export type Pattern = DataType<{
    Any: {};
    Variable: { name: string };
    Ctor: { name: string; args: Pattern[]; meta?: string };
}>;

export const Pattern = {
    Any: Object.freeze<Pattern>({ variant: 'Any' }),
    Variable: (name: string): Pattern =>
        ({ variant: 'Variable', name }) as const,
    Ctor: (name: string, args: Pattern[] = [], meta?: string): Pattern =>
        ({ variant: 'Ctor', name, args, meta }) as const,
    Literal: (value: Literal): Pattern => {
        if (value.variant === 'Unit') {
            return Pattern.Ctor('Unit');
        }

        return Pattern.Ctor(`${value.$value}`, [], value.variant);
    },
    Tuple: (args: Pattern[]): Pattern =>
        Pattern.Ctor(`${args.length}`, args, 'Tuple'),
};
