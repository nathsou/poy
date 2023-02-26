import { match, VariantOf } from "itsamatch";
import { Decl } from "../ast/sweet/decl";
import { Expr } from "../ast/sweet/expr";
import { Stmt } from "../ast/sweet/stmt";
import { Type, TypeVar } from "../infer/type";
import { Maybe, None, Some } from "../misc/maybe";
import { isUpperCase } from "../misc/strings";
import { panic } from "../misc/utils";
import { BinaryOp, Literal, Symbol, Token, UnaryOp } from "./token";

export const parse = (tokens: Token[]) => {
    let index = 0;
    let letLevel = 0;

    // ------ meta ------

    function peek(lookahead: number = 0): Token {
        if (index + lookahead >= tokens.length) {
            return Token.EOF({});
        }

        return tokens[index + lookahead];
    }

    function check(...tokens: Token[]): boolean {
        const t = peek();

        for (const token of tokens) {
            if (Token.eq(token, t)) {
                return true;
            }
        }

        return false;
    }

    function matches(...tokens: Token[]): boolean {
        for (const token of tokens) {
            if (check(token)) {
                next();
                return true;
            }
        }

        return false;
    }

    function next() {
        index += 1;
    }

    function consume(token: Token, error: string = `Expected '${Token.show(token)}'`) {
        if (check(token)) {
            next();
        } else {
            throw new Error(error);
        }
    }

    function consumeIfPresent(token: Token) {
        if (check(token)) {
            next();
        }
    }

    function identifier(): string {
        return match(peek(), {
            Identifier: name => {
                next();
                return name;
            },
            _: () => {
                throw new Error('Expected identifier');
            },
        });
    }

    // sepBy(rule, sep) -> (<rule> (sep <rule>)*)?
    function sepBy<T>(rule: () => T, separator: Token, closingToken = Token.Symbol(')')): T[] {
        let terms: T[] = [];

        if (!check(closingToken)) {
            do {
                terms.push(rule());
            } while (matches(separator));
        }

        consumeIfPresent(Token.Symbol(';'));

        return terms;
    }

    // commas(rule) -> (<rule> (',' <rule>)* ','?)?
    function commas<T>(rule: () => T): T[] {
        return sepBy(rule, Token.Symbol(','));
    }

    function binaryExpr(p: () => Expr, ops: BinaryOp[]): Expr {
        let lhs = p();

        while (true) {
            const token = peek();
            if (token.variant === 'Symbol' && (ops as Symbol[]).includes(token.$value)) {
                next();
                const rhs = p();
                lhs = Expr.Binary({ lhs, op: token.$value as BinaryOp, rhs });
            } else {
                break;
            }
        }

        return lhs;
    }

    function attempt<T>(p: () => T): Maybe<T> {
        const start = index;

        try {
            return Some(p());
        } catch (e) {
            index = start;
            return None;
        }
    }

    // ------ types ------

    function type(): Type {
        return funType();
    }

    function funType(): Type {
        const args: Type[] = [];

        if (matches(Token.Symbol('('))) {
            do {
                args.push(type());
            } while (matches(Token.Symbol(',')));

            consume(Token.Symbol(')'));
        } else {
            args.push(arrayType());
        }

        if (matches(Token.Symbol('->'))) {
            const ret = type();
            return Type.Function(args, ret);
        } else {
            return Type.Tuple(args);
        }
    }

    function arrayType(): Type {
        let lhs = typeList();

        while (matches(Token.Symbol('['))) {
            consume(Token.Symbol(']'));
            lhs = Type.Array(lhs);
        }

        return lhs;
    }

    function typeList(): Type {
        if (matches(Token.Symbol('['))) {
            if (matches(Token.Symbol(']'))) {
                return Type.Nil;
            }

            const types = commas(type);
            consume(Token.Symbol(']'));
            return Type.list(types);
        }

        return consType();
    }

    function consType(): Type {
        const lhs = primaryType();

        if (matches(Token.Symbol('::'))) {
            const rhs = type();
            return Type.Cons(lhs, rhs);
        }

        return lhs;
    }

    function primaryType(): Type {
        const token = peek();

        if (token.variant === 'Identifier') {
            if (isUpperCase(token.$value[0])) {
                next();
                return constructorType(token.$value);
            } else {
                next();
                return varType(token.$value);
            }
        }

        return panic('Expected type');
    }

    function constructorType(name: string): Type {
        const args: Type[] = [];

        if (matches(Token.Symbol('<'))) {
            do {
                args.push(type());
            } while (matches(Token.Symbol(',')));

            consume(Token.Symbol('>'));
        }

        return Type.Fun(name, args);
    }

    function varType(name: string): Type {
        return Type.Var(TypeVar.fresh(letLevel, name));
    }

    // ------ expressions ------

    function expr(): Expr {
        const token = peek();

        if (token.variant === 'Keyword') {
            switch (token.$value) {
                case 'if':
                    next();
                    return ifExpr();
                case 'use':
                    next();
                    return useInExpr();
            }
        }

        return funExpr();
    }

    function funExpr(): Expr {
        return attempt<Expr>(() => {
            let args: string[];
            const token = peek();

            if (token.variant === 'Identifier') {
                next();
                args = [token.$value];
            } else if (token.variant === 'Symbol' && token.$value === '(') {
                next();
                args = commas(identifier);
                consume(Token.Symbol(')'));
            } else {
                throw 'fail';
            }

            consume(Token.Symbol('->'));
            const body = expr();
            return Expr.Fun({ args, body });
        }).orDefault(equalityExpr);
    }

    function useInExpr(): Expr {
        letLevel += 1;
        const name = identifier();
        consume(Token.Symbol('='));
        const value = expr();
        consume(Token.Keyword('in'));
        const rhs = expr();
        letLevel -= 1;

        return Expr.UseIn({ name, value, rhs });
    }

    function ifExpr(): Expr {
        const cond = expr();
        const then = blockExpr();
        consume(Token.Keyword('else'));
        const otherwise = blockExpr();
        return Expr.If({ cond, then, otherwise });
    }

    function equalityExpr(): Expr {
        return binaryExpr(comparisonExpr, ['==', '!=']);
    }

    function comparisonExpr(): Expr {
        return binaryExpr(additionExpr, ['<', '<=', '>', '>=']);
    }

    function additionExpr(): Expr {
        return binaryExpr(multiplicationExpr, ['+', '-']);
    }

    function multiplicationExpr(): Expr {
        return binaryExpr(powExpr, ['*', '/', '%']);
    }

    function powExpr(): Expr {
        return binaryExpr(unaryExpr, ['**']);
    }

    function unaryExpr(): Expr {
        const token = peek();

        if (token.variant === 'Symbol' && ['-', '+', '!'].includes(token.$value)) {
            next();
            const expr = callExpr();
            return Expr.Unary({ op: token.$value as UnaryOp, expr });
        }

        return callExpr();
    }

    function callExpr(): Expr {
        const lhs = primaryExpr();

        if (matches(Token.Symbol('('))) {
            const args = commas(expr);
            consume(Token.Symbol(')'));

            return Expr.Call({ fun: lhs, args });
        }

        return lhs;
    }

    function primaryExpr(): Expr {
        return match(peek(), {
            Literal: ({ value }) => {
                next();
                return Expr.Literal(value);
            },
            Identifier: name => {
                next();
                return Expr.Variable(name);
            },
            Symbol: symb => {
                switch (symb) {
                    case '(':
                        return tupleExpr();
                    case '{':
                        return blockExpr();
                    case '[':
                        return arrayExpr();
                    default:
                        throw new Error(`Unexpected symbol '${symb}'`);
                }
            },
            _: () => {
                throw new Error('Expected expression');
            },
        });
    }

    function tupleExpr(): Expr {
        consume(Token.Symbol('('));
        const elems = commas(expr);
        consume(Token.Symbol(')'));

        switch (elems.length) {
            case 0:
                return Expr.Literal(Literal.Unit);
            case 1:
                return elems[0];
            default:
                return Expr.Tuple({ elems });
        }
    }

    function arrayExpr(): Expr {
        consume(Token.Symbol('['));
        const elems = sepBy(expr, Token.Symbol(','), Token.Symbol(']'));
        consume(Token.Symbol(']'));

        return Expr.Array({ elems });
    }

    function blockExpr(): Expr {
        consume(Token.Symbol('{'));
        const stmts: Stmt[] = [];

        while (!matches(Token.Symbol('}'))) {
            stmts.push(stmt());
        }

        if (stmts.length > 0) {
            const last = stmts[stmts.length - 1];
            if (last.variant === 'Expr') {
                stmts.pop();
                return Expr.Block({ stmts, ret: last.expr });
            }
        }

        return Expr.Block({ stmts });
    }

    // ------ statements ------

    function stmt(): Stmt {
        return match(peek(), {
            Keyword: keyword => {
                switch (keyword) {
                    case 'let':
                    case 'mut':
                        next();
                        return letStmt(keyword === 'mut');
                    default:
                        throw new Error(`Unexpected keyword '${keyword}'`);
                }
            },
            _: () => exprStmt(),
        });
    }

    function letStmt(mutable: boolean): Stmt {
        letLevel += 1;
        const name = identifier();
        consume(Token.Symbol('='));
        const value = expr();
        consumeIfPresent(Token.Symbol(';'));
        letLevel -= 1;

        return Stmt.Let({ mutable, name, value });
    }

    function exprStmt(): Stmt {
        const exp = expr();
        consumeIfPresent(Token.Symbol(';'));
        return Stmt.Expr(exp);
    }

    // ------ declarations ------

    function decl(): Decl {
        const token = peek();

        if (token.variant === 'Keyword') {
            switch (token.$value) {
                case 'let':
                    next();
                    return letDecl(false);
                case 'mut':
                    next();
                    return letDecl(true);
                case 'fun':
                    next();
                    return funDecl();
                case 'type':
                    next();
                    return typeDecl();
                case 'module':
                    next();
                    return moduleDecl();
                default:
                    break;
            }
        }

        return panic(`Unexpected token '${Token.show(token)}'`);
    }

    function letDecl(mutable: boolean): Decl {
        letLevel += 1;
        const name = identifier();
        consume(Token.Symbol('='));
        const value = expr();
        consumeIfPresent(Token.Symbol(';'));
        letLevel -= 1;

        return Decl.Let({ mutable, name, value });
    }

    function funDecl(): Decl {
        letLevel += 1;
        const name = identifier();
        consume(Token.Symbol('('));
        const args = commas(identifier);
        consume(Token.Symbol(')'));
        const body = expr();
        consumeIfPresent(Token.Symbol(';'));
        letLevel -= 1;

        return Decl.Fun({ name, args, body });
    }

    function typeDecl(): Decl {
        const lhs = type();
        consume(Token.Symbol('='));
        const rhs = type();
        consumeIfPresent(Token.Symbol(';'));
        return Decl.Type({ lhs, rhs });
    }

    function moduleDecl(): VariantOf<Decl, 'Module'> {
        consumeIfPresent(Token.Keyword('module'));
        const name = identifier();
        const decls: Decl[] = [];
        consume(Token.Symbol('{'));

        while (!matches(Token.Symbol('}'))) {
            decls.push(decl());
        }

        consumeIfPresent(Token.Symbol(';'));

        return Decl.Module({ name, decls });
    }

    return { expr, stmt, decl, module: moduleDecl };
};
