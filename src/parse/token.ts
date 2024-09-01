import { DataType, constructors, match, matchMany } from 'itsamatch';
import { Constructors, Eq, Impl, Show } from '../misc/traits';

export type Token = DataType<{
  Literal: { value: Literal };
  Identifier: string;
  Symbol: Symbol;
  Keyword: Keyword;
  StringInterpolation: { parts: StringInterpolationPart[] };
  EOF: {};
}> & { loc?: { start: number; end: number } };

export type StringInterpolationPart = DataType<{
  Str: { value: string };
  Expr: { tokens: Token[] };
}>;

export const Token = {
  ...constructors<Token>().get('Identifier', 'Symbol', 'Keyword', 'StringInterpolation', 'EOF'),
  Literal: (value: Literal) => ({ variant: 'Literal', value }) as const,
  eq: (a, b) =>
    matchMany([a, b], {
      'Literal Literal': (a, b) => Literal.eq(a.value, b.value),
      'Identifier Identifier': Object.is,
      'Symbol Symbol': Object.is,
      'Keyword Keyword': Object.is,
      'EOF EOF': () => true,
      _: () => false,
    }),
  show: self =>
    match(self, {
      Literal: ({ value }) =>
        match(value, {
          Unit: () => '()',
          Bool: value => (value ? 'true' : 'false'),
          Num: value => value.toString(),
          Str: value => `"${value}"`,
        }),
      Identifier: value => value,
      Symbol: value => value,
      Keyword: value => value,
      StringInterpolation: ({ parts }) => {
        let result = '"';

        for (const part of parts) {
          if (part.variant === 'Str') {
            result += part.value;
          } else {
            result += '(';
            for (const token of part.tokens) {
              result += Token.show(token);
            }

            result += ')';
          }
        }

        result += '"';

        return result;
      },
      EOF: () => 'EOF',
    }),
} satisfies Impl<Eq<Token> & Show<Token> & Constructors<Token>>;

export type Literal = DataType<{
  Unit: {};
  Bool: boolean;
  Num: number;
  Str: string;
}>;

export const Literal = {
  ...constructors<Literal>().get('Bool', 'Num', 'Str'),
  Unit: Object.freeze<Literal>({ variant: 'Unit' }),
  eq: (a, b) =>
    matchMany([a, b], {
      'Unit Unit': () => true,
      'Bool Bool': Object.is,
      'Num Num': Object.is,
      'Str Str': Object.is,
      _: () => false,
    }),
} satisfies Impl<Eq<Literal> & Constructors<Literal>>;

export type UnaryOp = '+' | '-' | '!' | '?';
export type AssignmentOp =
  | '='
  | '+='
  | '-='
  | '*='
  | '/='
  | 'mod='
  | '**='
  | 'or='
  | 'and='
  | '&='
  | '|=';

export type BinaryOp =
  | '+'
  | '-'
  | '*'
  | '/'
  | 'mod'
  | '**'
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'and'
  | 'or'
  | '&'
  | '|'
  | '++';

export type Punctuation =
  | '('
  | ')'
  | '{'
  | '}'
  | '['
  | ']'
  | ','
  | ';'
  | ':'
  | '->'
  | '=>'
  | '::'
  | '_'
  | '.'
  | '@'
  | '#';

export type Symbol = UnaryOp | BinaryOp | AssignmentOp | Punctuation;

const keywords = [
  'module',
  'let',
  'mut',
  'fun',
  'if',
  'else',
  'match',
  'for',
  'while',
  'return',
  'break',
  'type',
  'enum',
  'struct',
  'interface',
  'extend',
  'use',
  'in',
  'declare',
  'import',
  'pub',
  'static',
  'or',
  'and',
  'yield',
] as const;

export type Keyword = (typeof keywords)[number];

export const Keyword = {
  values: new Set<string>(keywords),
  is: (value: string): value is Keyword => Keyword.values.has(value),
};
