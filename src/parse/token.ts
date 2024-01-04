import { DataType, genConstructors, match, matchMany } from 'itsamatch';
import { Eq, Impl, Show } from '../misc/traits';

export type Token = DataType<{
    Literal: { value: Literal },
    Identifier: string,
    Symbol: Symbol,
    Keyword: Keyword,
    EOF: {},
}> & { loc?: { start: number, end: number } };

export const Token = {
    ...genConstructors<Token>(['Identifier', 'Symbol', 'Keyword', 'EOF']),
    Literal: (value: Literal) => ({ variant: 'Literal', value }) as const,
    eq: (a, b) => matchMany([a, b], {
        'Literal Literal': (a, b) => Literal.eq(a.value, b.value),
        'Identifier Identifier': Object.is,
        'Symbol Symbol': Object.is,
        'Keyword Keyword': Object.is,
        'EOF EOF': () => true,
        _: () => false,
    }),
    show: self => match(self, {
        Literal: ({ value }) => match(value, {
            Unit: () => '()',
            Bool: value => value ? 'true' : 'false',
            Num: value => value.toString(),
            Str: value => `"${value}"`,
        }),
        Identifier: value => value,
        Symbol: value => value,
        Keyword: value => value,
        EOF: () => 'EOF',
    }),
} satisfies Impl<Eq<Token> & Show<Token>>;

export type Literal = DataType<{
    Unit: {},
    Bool: boolean,
    Num: number,
    Str: string,
}>;

export const Literal = {
    ...genConstructors<Literal>(['Bool', 'Num', 'Str']),
    Unit: Object.freeze<Literal>({ variant: 'Unit' }),
    eq: (a, b) => matchMany([a, b], {
        'Unit Unit': () => true,
        'Bool Bool': Object.is,
        'Num Num': Object.is,
        'Str Str': Object.is,
        _: () => false,
    }),
} satisfies Impl<Eq<Literal>>;

export type UnaryOp = '+' | '-' | '!';
export type AssignmentOp = '=' | '+=' | '-=' | '*=' | '/=' | 'mod=' | '**=' | 'or=' | 'and=' | '&=' | '|=';
export type BinaryOp = '+' | '-' | '*' | '/' | 'mod' | '**' | '==' | '!=' | '<' | '<=' | '>' | '>=' | 'and' | 'or' | '&' | '|';
export type Punctuation = '(' | ')' | '{' | '}' | '[' | ']' | ',' | ';' | ':' | '->' | '=>' | '::' | '_' | '.' | '@' | '#';
export type Symbol = UnaryOp | BinaryOp | AssignmentOp | Punctuation;

const keywords = [
    'module', 'let', 'mut', 'fun', 'if', 'else', 'match', 'for', 'while',
    'return', 'break', 'type', 'enum', 'struct', 'interface', 'extend', 'use', 'in',
    'declare', 'import', 'pub', 'static', 'or', 'and', 'yield', 'test'
] as const;

export type Keyword = typeof keywords[number];

export const Keyword = {
    values: new Set<string>(keywords),
    is: (value: string): value is Keyword => Keyword.values.has(value),
};
