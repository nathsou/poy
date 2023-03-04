import { match, VariantOf } from "itsamatch";
import { Decl, Signature, ModuleDecl } from "../ast/sweet/decl";
import { Expr, FunctionArgument } from "../ast/sweet/expr";
import { Stmt } from "../ast/sweet/stmt";
import { Type, TypeVar } from "../infer/type";
import { Context } from "../misc/context";
import { Maybe, None, Some } from "../misc/maybe";
import { isUpperCase } from "../misc/strings";
import { assert, last, letIn, panic } from "../misc/utils";
import { BinaryOp, Keyword, Literal, Symbol, Token, UnaryOp } from "./token";

export const parse = (tokens: Token[], newlines: number[]) => {
    let index = 0;
    let letLevel = 0;
    const typeScopes: Map<string, number>[] = [];

    // ------ meta ------

    function isAtEnd(): boolean {
        return index >= tokens.length;
    }

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
            reportError(error);
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
                reportError('Expected identifier');
            },
        });
    }

    function reportError(message: string): never {
        const { loc } = tokens[index];
        const start = loc?.start ?? 0;
        const line = (newlines.findIndex(pos => pos > start) ?? 1) - 1;
        const column = start - newlines[line] ?? 0;
        return panic(`Parse error: ${message} at ${line}:${column}`);
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

    function typeScoped<T>(action: () => T): T {
        typeScopes.push(new Map());
        const ret = action();
        typeScopes.pop();

        return ret;
    }

    function getTypeVarId(name: string): number {
        assert(typeScopes.length > 0, 'empty type scope stack');

        for (let i = typeScopes.length - 1; i >= 0; i--) {
            const scope = typeScopes[i];
            if (scope.has(name)) {
                return scope.get(name)!;
            }
        }

        const id = Context.freshTypeVarId();
        last(typeScopes).set(name, id);
        return id;
    }

    function parens<T>(p: () => T): T {
        consume(Token.Symbol('('));
        const ret = p();
        consume(Token.Symbol(')'));

        return ret;
    }

    // ------ types ------

    function type(): Type {
        return consType();
    }

    function consType(): Type {
        const lhs = funType();

        if (matches(Token.Symbol('::'))) {
            const rhs = type();
            return Type.Cons(lhs, rhs);
        }

        return lhs;
    }

    function funType(): Type {
        const args: Type[] = [];

        if (matches(Token.Symbol('('))) {
            while (!matches(Token.Symbol(')'))) {
                args.push(type());
                consumeIfPresent(Token.Symbol(','));
            }
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
            return Type.utils.list(types);
        }

        return primaryType();
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

        if (token.variant === 'Symbol' && token.$value === '_') {
            next();
            return Type.Var(
                TypeVar.Unbound({
                    id: Context.freshTypeVarId(),
                    level: letLevel,
                }));
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
        const id = getTypeVarId(name);
        return Type.Var(TypeVar.Unbound({ id, level: letLevel, name }));
    }

    function typeAnnotation(): Type | undefined {
        if (matches(Token.Symbol(':'))) {
            return type();
        }
    }

    function typeAnnotationRequired(): Type {
        const ann = typeAnnotation();
        if (ann === undefined) {
            reportError('Expected type annotation');
        }

        return ann;
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

        return funExpr(true);
    }

    function functionArgument(): FunctionArgument {
        const name = identifier();
        const ann = typeAnnotation();
        return { name, ann };
    }

    function funExpr(isArrowFunction: boolean): Expr {
        return attempt<Expr>(() => typeScoped(() => {
            let args: FunctionArgument[];
            let ret: Type | undefined;
            const token = peek();

            if (token.variant === 'Identifier') {
                next();
                args = [{ name: token.$value }];
            } else if (token.variant === 'Symbol' && token.$value === '(') {
                next();
                args = commas(functionArgument);
                consume(Token.Symbol(')'));
                ret = typeAnnotation();
            } else {
                throw 'fail';
            }

            if (isArrowFunction) {
                consume(Token.Symbol('->'));
            }

            const body = expr();
            return Expr.Fun({ args, ret, body });
        })).orDefault(equalityExpr);
    }

    function useInExpr(): Expr {
        return typeScoped(() => {
            letLevel += 1;
            const name = identifier();
            const ann = typeAnnotation();
            consume(Token.Symbol('='));
            const value = expr();
            consume(Token.Keyword('in'));
            const rhs = expr();
            letLevel -= 1;

            return Expr.UseIn({ name, ann, value, rhs });
        });
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
        let lhs = primaryExpr();

        while (matches(Token.Symbol('('))) {
            const args = commas(expr);
            consume(Token.Symbol(')'));

            lhs = Expr.Call({ fun: lhs, args });
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

                if (isUpperCase(name[0])) {
                    return pathExpr(name);
                }

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
                        reportError(`Unexpected symbol '${symb}'`);
                }
            },
            _: () => {
                reportError('Expected expression');
            },
        });
    }

    function path(prefix: string): string[] {
        const parts: string[] = [prefix];

        let token = peek();

        while (matches(Token.Symbol('.'))) {
            token = peek();

            if (token.variant === 'Identifier') {
                next();
                parts.push(token.$value);
            } else {
                reportError('Expected identifier');
            }
        }

        return parts;
    }

    function pathExpr(prefix: string): Expr {
        const parts = path(prefix);
        assert(parts.length > 1);
        return Expr.Path(parts.slice(0, -1), last(parts));
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

                        if (matches(Token.Symbol('{'))) {
                            const stmts: Stmt[] = [];

                            while (!matches(Token.Symbol('}'))) {
                                stmts.push(letStmt(keyword === 'mut'));
                            }

                            consumeIfPresent(Token.Symbol(';'));

                            return Stmt._Many({ stmts });
                        }

                        return letStmt(keyword === 'mut');
                    case 'fun':
                        next();
                        return funStmt();
                    default:
                        return exprStmt();
                }
            },
            _: () => exprStmt(),
        });
    }

    function funStmt(): Stmt {
        const name = identifier();
        const value = funExpr(false);
        consumeIfPresent(Token.Symbol(';'));

        return Stmt.Let({ mutable: false, name, value });
    }

    function letStmt(mutable: boolean): Stmt {
        return typeScoped(() => {
            letLevel += 1;
            const name = identifier();
            const ann = typeAnnotation();
            consume(Token.Symbol('='));
            const value = expr();
            consumeIfPresent(Token.Symbol(';'));
            letLevel -= 1;

            return Stmt.Let({ ann, mutable, name, value });
        });
    }

    function exprStmt(): Stmt {
        const exp = expr();
        consumeIfPresent(Token.Symbol(';'));
        return Stmt.Expr(exp);
    }

    // ------ declarations ------

    const KEYWORD_MAPPING: Partial<Record<Keyword, () => Decl>> = {
        type: typeDecl,
        module: moduleDecl,
        declare: declareDecl,
    };

    function decl(): Decl {
        const token = peek();

        if (token.variant === 'Keyword') {
            const parser = KEYWORD_MAPPING[token.$value];

            if (parser) {
                next();

                if (matches(Token.Symbol('{'))) {
                    return manyDecl(parser);
                }

                return parser();
            }
        }

        return stmtDecl();
    }

    function manyDecl(declParser: () => Decl): Decl {
        const decls: Decl[] = [];
        consumeIfPresent(Token.Symbol('{'));

        while (!matches(Token.Symbol('}'))) {
            decls.push(declParser());
        }

        consumeIfPresent(Token.Symbol(';'));

        return Decl._Many({ decls });
    }

    function stmtDecl(): Decl {
        return Decl.Stmt(stmt());
    }

    function typeDecl(): VariantOf<Decl, 'Type'> {
        return typeScoped(() => {
            const lhs = type();
            consume(Token.Symbol('='));
            const rhs = type();
            consumeIfPresent(Token.Symbol(';'));

            return Decl.Type(lhs, rhs);
        });
    }

    function variableSignature(mutable: boolean): VariantOf<Signature, 'Variable'> {
        return typeScoped(() => {
            letLevel += 1;
            const name = identifier();
            const ty = typeAnnotationRequired();
            consumeIfPresent(Token.Symbol(';'));
            letLevel -= 1;

            return { variant: 'Variable', mutable, name, ty };
        });
    }

    function functionSignature(): VariantOf<Signature, 'Variable'> {
        return typeScoped(() => {
            letLevel += 1;
            const name = identifier();
            consume(Token.Symbol('('));
            const args = commas(functionArgument);
            consume(Token.Symbol(')'));
            const ret = typeAnnotationRequired();
            consumeIfPresent(Token.Symbol(';'));
            letLevel -= 1;

            if (args.some(arg => arg.ann === undefined)) {
                reportError('All arguments in a function signature must have a type annotation');
            }

            const funTy = Type.Function(args.map(arg => arg.ann!), ret);

            return { variant: 'Variable', mutable: false, name, ty: funTy };
        });
    }

    function moduleSignature(): VariantOf<Signature, 'Module'> {
        const name = identifier();
        const sigs: Signature[] = [];
        consume(Token.Symbol('{'));

        while (!matches(Token.Symbol('}'))) {
            sigs.push(...signatures());
        }

        consumeIfPresent(Token.Symbol(';'));

        return { variant: 'Module', name, signatures: sigs };
    }

    function signatures(): Signature[] {
        const SIGNATURE_MAPPING: Partial<Record<Keyword, () => Signature>> = {
            let: () => variableSignature(false),
            mut: () => variableSignature(true),
            fun: functionSignature,
            type: () => letIn(typeDecl(), td => ({ variant: 'Type', lhs: td.lhs, rhs: td.rhs })),
            module: moduleSignature,
        };

        const token = peek();

        if (token.variant === 'Keyword') {
            const parser = SIGNATURE_MAPPING[token.$value];

            if (parser) {
                next();

                if (matches(Token.Symbol('{'))) {
                    const signatures: Signature[] = [];
                    while (!matches(Token.Symbol('}'))) {
                        signatures.push(parser());
                    }

                    return signatures;
                }

                return [parser()];
            }
        }

        reportError('Expected a signature');
    }

    function declareDecl(): Decl {
        const sigs = signatures();

        if (sigs.length === 1) {
            return Decl.Declare(sigs[0]);
        }

        return Decl._Many({ decls: sigs.map(sig => Decl.Declare(sig)) });
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

    function topModule(): ModuleDecl {
        const decls: Decl[] = [];

        while (!isAtEnd()) {
            decls.push(decl());
        }

        return { name: 'top', decls };
    }

    return { expr, stmt, decl, module: moduleDecl, topModule };
};
