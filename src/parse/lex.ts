import { match } from "itsamatch";
import { Keyword, Literal, Token } from "./token";

type Char = string;

export const lex = (source: string): Token[] => {
    let index = 0;
    let startIndex = 0;

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
        return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
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

        if (peek() === '.' && isDigit(peek(2))) {
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
        while (peek() !== '"' && !isAtEnd()) {
            if (peek() === '\\') {
                next();
            }

            next();
        }

        if (isAtEnd()) {
            throw new Error('Unterminated string.');
        }

        next();

        const str = source.slice(startIndex + 1, index - 1);
        return Token.Literal(Literal.Str(str));
    }

    function parseIdentifierOrKeyword(): Token {
        while (isAlphaNumeric(peek())) {
            next();
        }

        const identifier = source.slice(startIndex, index);

        switch (identifier) {
            case 'true': return Token.Literal(Literal.Bool(true));
            case 'false': return Token.Literal(Literal.Bool(false));
            default:
                return Keyword.is(identifier) ? Token.Keyword(identifier) : Token.Identifier(identifier);
        }
    }

    function shouldInsertSemicolon(): boolean {
        if (tokens.length > 0) {
            return match(tokens[tokens.length - 1], {
                Literal: lit => {
                    switch (lit.value.variant) {
                        case 'Bool': return true;
                        case 'Num': return true;
                        case 'Str': return true;
                        default: return false;
                    }
                },
                Identifier: () => true,
                Symbol: symb => {
                    switch (symb) {
                        case ')': return true;
                        case ']': return true;
                        case '}': return true;
                        case '>': return true;
                        default: return false;
                    }
                },
                Keyword: kw => {
                    switch (kw) {
                        case 'return': return true;
                        case 'break': return true;
                        default: return false;
                    }
                },
                _: () => false,
            })
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
            case '(': return Token.Symbol('(');
            case ')': return Token.Symbol(')');
            case '{': return Token.Symbol('{');
            case '}': return Token.Symbol('}');
            case '[': return Token.Symbol('[');
            case ']': return Token.Symbol(']');
            case ',': return Token.Symbol(',');
            case ';': return Token.Symbol(';');
            case '+': return Token.Symbol('+');
            case '-': return Token.Symbol(matches('>') ? '->' : '-');
            case '*': return Token.Symbol(matches('*') ? '**' : '*');
            case '/': {
                if (matches('/')) {
                    while (peek() !== '\n' && !isAtEnd()) {
                        next();
                    }

                    return iter();
                } else {
                    return Token.Symbol('/');
                }
            }
            case '%': return Token.Symbol('%');
            case '**': return Token.Symbol('!');
            case '!': return Token.Symbol('!');
            case '=': return Token.Symbol(matches('=') ? '==' : matches('>') ? '=>' : '=');
            case '<': return Token.Symbol(matches('=') ? '<=' : '<');
            case '>': return Token.Symbol(matches('=') ? '>=' : '>');
            case '&': return Token.Symbol(matches('&') ? '&&' : '&');
            case '|': return Token.Symbol(matches('|') ? '||' : '|');
            case ':': return Token.Symbol(matches(':') ? '::' : ':');
            case '_': return Token.Symbol('_');
            case '.': return Token.Symbol('.');
            case '"': return parseStr();
            default:
                if (isDigit(char)) {
                    return parseNum();
                }

                if (isAlpha(char)) {
                    return parseIdentifierOrKeyword();
                }

                throw new Error(`Unexpected character: '${char}'`);
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
