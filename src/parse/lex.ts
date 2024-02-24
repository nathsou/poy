import { match } from 'itsamatch';
import { Keyword, Literal, StringInterpolationPart, Token } from './token';
import { Backtick, countCharacterOccurrences } from '../misc/strings';
import { panic } from '../misc/utils';

type Char = string;

export const lex = (source: string, moduleName: string): Token[] => {
  let index = 0;
  let startIndex = 0;

  function raise(message: string): never {
    const line = countCharacterOccurrences(source, '\n', startIndex) + 1;
    return panic(`${message} at line ${line} in module '${moduleName}'`);
  }

  function peek(lookahead = 0): Char {
    return source[index + lookahead];
  }

  function next(): Char {
    const c = peek();

    if (c === '\n' && shouldInsertSemicolon()) {
      tokens.push(Token.Symbol(';'));
    }

    index += 1;

    return c;
  }

  function matches(char: Char): boolean {
    const c = peek();

    if (c === char) {
      next();
      return true;
    }

    return false;
  }

  function isDigit(char: Char): boolean {
    return char >= '0' && char <= '9';
  }

  function isAlpha(char: Char): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_';
  }

  function isAlphaNumeric(char: Char): boolean {
    return isAlpha(char) || isDigit(char);
  }

  function isWhitespace(char: Char): boolean {
    return char === ' ' || char === '\r' || char === '\t' || char === '\n';
  }

  function parseNum(): Token {
    while (isDigit(peek())) {
      next();
    }

    if (peek() === '.' && isDigit(peek(1))) {
      next();

      while (isDigit(peek())) {
        next();
      }
    }

    const num = Number(source.slice(startIndex, index));
    return Token.Literal(Literal.Num(num));
  }

  function isAtEnd(): boolean {
    return index >= source.length;
  }

  function parseStr(): Token {
    const parts: StringInterpolationPart[] = [];
    let lastIndex = index;

    const addPart = (part: StringInterpolationPart) => {
      if (
        (part.variant === 'Expr' && part.tokens.length > 0) ||
        (part.variant === 'Str' && part.value.length > 0)
      ) {
        parts.push(part);
      }
    };

    while (peek() !== '"' && !isAtEnd()) {
      if (peek() === '\\') {
        if (peek(1) === '(') {
          addPart({ variant: 'Str', value: source.slice(lastIndex, index) });
          next();
          next();
          let depth = 1;
          let start = index;

          while (!isAtEnd()) {
            const c = peek();
            if (c === '(') {
              depth += 1;
            } else if (c === ')') {
              depth -= 1;

              if (depth === 0) {
                const value = source.slice(start, index);
                const tokens = lex(value, moduleName);
                addPart({ variant: 'Expr', tokens });
                next();
                lastIndex = index;
                break;
              }
            }

            next();
          }
        } else {
          // escape character
          next();
          next();
        }
      } else {
        next();
      }
    }

    if (isAtEnd()) {
      raise('Unterminated string');
    }

    addPart({ variant: 'Str', value: source.slice(lastIndex, index) });

    next();

    if (parts.length === 1 && parts[0].variant === 'Str') {
      return Token.Literal(Literal.Str(parts[0].value));
    }

    return Token.StringInterpolation({ parts });
  }

  function parseIdentifierOrKeyword(): Token {
    while (isAlphaNumeric(peek())) {
      next();
    }

    const identifier = source.slice(startIndex, index);

    switch (identifier) {
      case 'true':
        return Token.Literal(Literal.Bool(true));
      case 'false':
        return Token.Literal(Literal.Bool(false));
      case 'and':
        return Token.Symbol(matches('=') ? 'and=' : 'and');
      case 'or':
        return Token.Symbol(matches('=') ? 'or=' : 'or');
      case 'mod':
        return Token.Symbol(matches('=') ? 'mod=' : 'mod');
      default:
        return Keyword.is(identifier) ? Token.Keyword(identifier) : Token.Identifier(identifier);
    }
  }

  function parseBacktickIdentifier(): Token {
    while (peek() !== '`' && !isAtEnd()) {
      next();
    }

    if (isAtEnd()) {
      raise('Unterminated backtick identifier');
    }

    next();

    const identifier = source.slice(startIndex + 1, index - 1);
    return Token.Identifier(Backtick.encode(identifier));
  }

  function shouldInsertSemicolon(): boolean {
    if (tokens.length > 0) {
      return match(tokens[tokens.length - 1], {
        Literal: lit => {
          switch (lit.value.variant) {
            case 'Bool':
              return true;
            case 'Num':
              return true;
            case 'Str':
              return true;
            default:
              return false;
          }
        },
        Identifier: () => true,
        Symbol: symb => {
          switch (symb) {
            case ')':
              return true;
            case ']':
              return true;
            case '}':
              return true;
            case '>':
              return true;
            default:
              return false;
          }
        },
        Keyword: kw => {
          switch (kw) {
            case 'return':
              return true;
            case 'yield':
              return true;
            case 'break':
              return true;
            default:
              return false;
          }
        },
        _: () => false,
      });
    }

    return false;
  }

  function skipWhitespaces() {
    while (isWhitespace(peek())) {
      next();
    }
  }

  function iter(): Token | null {
    skipWhitespaces();
    if (isAtEnd()) return null;
    startIndex = index;

    const char = next();

    switch (char) {
      case '(':
        return Token.Symbol('(');
      case ')':
        return Token.Symbol(')');
      case '{':
        return Token.Symbol('{');
      case '}':
        return Token.Symbol('}');
      case '[':
        return Token.Symbol('[');
      case ']':
        return Token.Symbol(']');
      case ',':
        return Token.Symbol(',');
      case ';':
        return Token.Symbol(';');
      case '+':
        return Token.Symbol(matches('=') ? '+=' : matches('+') ? '++' : '+');
      case '-':
        return Token.Symbol(matches('>') ? '->' : matches('=') ? '-=' : '-');
      case '*':
        return Token.Symbol(
          matches('*') ? (matches('=') ? '**=' : '**') : matches('=') ? '*=' : '*',
        );
      case '/': {
        if (matches('/')) {
          while (peek() !== '\n' && !isAtEnd()) {
            next();
          }

          return iter();
        } else {
          return Token.Symbol(matches('=') ? '/=' : '/');
        }
      }
      case '!':
        return Token.Symbol(matches('=') ? '!=' : '!');
      case '=':
        return Token.Symbol(matches('=') ? '==' : matches('>') ? '=>' : '=');
      case '<':
        return Token.Symbol(matches('=') ? '<=' : '<');
      case '>':
        return Token.Symbol(matches('=') ? '>=' : '>');
      case '&':
        return Token.Symbol(matches('=') ? '&=' : '&');
      case '|':
        return Token.Symbol(matches('=') ? '|=' : '|');
      case ':':
        return Token.Symbol(matches(':') ? '::' : ':');
      case '_':
        return Token.Symbol('_');
      case '.':
        return Token.Symbol('.');
      case '@':
        return Token.Symbol('@');
      case '#':
        return Token.Symbol('#');
      case '"':
        return parseStr();
      case '`':
        return parseBacktickIdentifier();
      default:
        if (isDigit(char)) {
          return parseNum();
        }

        if (isAlpha(char)) {
          return parseIdentifierOrKeyword();
        }

        raise(`Unexpected character: '${char}'`);
    }
  }

  const tokens: Token[] = [];

  while (true) {
    const token = iter();
    if (token === null) return tokens;
    token.loc = { start: startIndex, end: index };
    tokens.push(token);
  }
};
