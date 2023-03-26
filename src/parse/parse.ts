import { match, VariantOf } from "itsamatch";
import { v4 as uuidv4 } from 'uuid';
import { Decl, ModuleDecl, Signature, StructDecl } from "../ast/sweet/decl";
import { Expr, FunctionArgument } from "../ast/sweet/expr";
import { Stmt } from "../ast/sweet/stmt";
import { Type, TypeVar } from "../infer/type";
import { Maybe, None, Some } from "../misc/maybe";
import { isLowerCase, isUpperCase } from "../misc/strings";
import { assert, last, letIn, panic } from "../misc/utils";
import { AssignmentOp, BinaryOp, Keyword, Literal, Symbol, Token, UnaryOp } from "./token";

export const parse = (tokens: Token[], newlines: number[], filePath: string) => {
    let index = 0;
    const modifiers = { pub: false, static: false };

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

    function parens<T>(p: () => T): T {
        consume(Token.Symbol('('));
        const ret = p();
        consume(Token.Symbol(')'));

        return ret;
    }

    function typeParams(): string[] {
        if (matches(Token.Symbol('<'))) {
            const params = commas(() => {
                const name = identifier();
                assert(isLowerCase(name), 'type parameters must be lowercase');
                return name;
            });
            consume(Token.Symbol('>'));
            return params;
        } else {
            return [];
        }
    }

    function typeParamsInst(): Type[] {
        // identifier '<' is ambiguous without lookahead:
        // it could be a less than comparison or a type parameter instantiation
        return attempt(() => {
            consume(Token.Symbol('<'));
            const params = commas(type);
            consume(Token.Symbol('>'));

            return params;
        }).orDefault([]);
    }

    // ------ types ------

    function type(): Type {
        return consType();
    }

    function consType(): Type {
        const lhs = arrayType();

        if (matches(Token.Symbol(':'))) {
            const rhs = type();
            return Type.Cons(lhs, rhs);
        }

        return lhs;
    }

    function arrayType(): Type {
        let lhs = funType();

        while (matches(Token.Symbol('['))) {
            consume(Token.Symbol(']'));
            lhs = Type.Array(lhs);
        }

        return lhs;
    }

    function funType(): Type {
        const args: Type[] = [];
        if (check(Token.Symbol('<'))) {
            typeParams();
        }

        if (matches(Token.Symbol('('))) {
            while (!matches(Token.Symbol(')'))) {
                args.push(type());
                consumeIfPresent(Token.Symbol(','));
            }
        } else {
            args.push(typeList());
        }

        if (matches(Token.Symbol('->'))) {
            const ret = type();
            return Type.Function(args, ret);
        } else {
            return Type.Tuple(args);
        }
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

        if (token.variant === 'Symbol') {
            if (token.$value === '_') {
                next();
                return Type.Var(TypeVar.Param({ name: '_' }));
            } else if (token.$value === '@') {
                next();
                const token = peek();
                if (token.variant === 'Identifier') {
                    next();
                    return constructorType('@' + token.$value);
                } else if (token.variant === 'Keyword' && (
                    token.$value === 'if' ||
                    token.$value === 'let' ||
                    token.$value === 'fun'
                )) {
                    next();
                    return constructorType('@' + token.$value);
                }
            }
        }

        return panic('Expected type');
    }

    function constructorType(name: string): Type {
        const args: Type[] = [];
        const path: string[] = [];

        while (matches(Token.Symbol('.'))) {
            const moduleName = identifier();
            if (!isUpperCase(moduleName[0])) {
                reportError('Expected a module name in Type path');
            }

            path.push(moduleName);
        }

        if (matches(Token.Symbol('<'))) {
            do {
                args.push(type());
            } while (matches(Token.Symbol(',')));

            consume(Token.Symbol('>'));
        }

        if (path.length > 0) {
            const typeName = path.pop()!;
            return Type.Fun(typeName, args, { file: filePath, subpath: [name, ...path] });
        }

        return Type.Fun(name, args);
    }

    function varType(name: string): Type {
        return Type.Var(TypeVar.Param({ name }));
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
        const res = attempt<Expr>(() => {
            let args: FunctionArgument[];
            let ret: Type | undefined;
            const generics = typeParams();
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
            return Expr.Fun({ generics, args, ret, body });
        });

        return res.orDefault(logicalOrExpr);
    }

    function useInExpr(): Expr {
        const name = identifier();
        const ann = typeAnnotation();
        consume(Token.Symbol('='));
        const value = expr();
        consume(Token.Keyword('in'));
        const rhs = expr();

        return Expr.UseIn({ name, ann, value, rhs });
    }

    function ifExpr(): Expr {
        const cond = expr();
        const then = blockExpr();

        if (matches(Token.Keyword('else'))) {
            const otherwise = blockExpr();
            return Expr.If({ cond, then, otherwise });
        }

        return Expr.If({ cond, then });
    }

    function structExpr(path: string[], name: string, typeParams: Type[]): Expr {
        consumeIfPresent(Token.Symbol('{'));
        const fields: { name: string, value: Expr }[] = [];

        while (!matches(Token.Symbol('}'))) {
            const name = identifier();
            consume(Token.Symbol(':'));
            const value = expr();
            fields.push({ name, value });

            consumeIfPresent(Token.Symbol(','));
            consumeIfPresent(Token.Symbol(';'));
        }

        return Expr.Struct({ path, name, typeParams, fields });
    }

    function logicalOrExpr(): Expr {
        return binaryExpr(logicalAndExpr, ['or']);
    }

    function logicalAndExpr(): Expr {
        return binaryExpr(equalityExpr, ['and']);
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
        return binaryExpr(powExpr, ['*', '/', 'mod']);
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
        let lhs = extensionAccessExpr();

        while (true) {
            if (matches(Token.Symbol('.'))) {
                const token = peek();
                let matched = false;

                switch (token.variant) {
                    case 'Identifier':
                        next();
                        const params = typeParamsInst();
                        lhs = Expr.VariableAccess({
                            lhs,
                            field: token.$value,
                            typeParams: params,
                            isCalled: false,
                            isNative: false
                        });
                        matched = true;
                        break;
                    case 'Literal':
                        if (token.value.variant === 'Num') {
                            next();
                            lhs = Expr.TupleAccess({ lhs, index: token.value.$value });
                            matched = true;
                        }
                        break;
                }

                if (!matched) {
                    reportError('Expected identifier or number literal');
                }
            } else if (matches(Token.Symbol('('))) {
                const args = commas(expr);
                consume(Token.Symbol(')'));

                if (lhs.variant === 'VariableAccess') {
                    lhs.isCalled = true;
                }

                lhs = Expr.Call({ fun: lhs, args });
            } else {
                break;
            }
        }

        return lhs;
    }

    function extensionAccessExpr() {
        return attempt<Expr>(() => {
            const subject = type();
            assert(subject.variant === 'Fun');

            if (matches(Token.Symbol('('))) {
                const args = commas(expr);
                consume(Token.Symbol(')'));
                return Expr.Call({
                    fun: Expr.ExtensionAccess({
                        member: 'init',
                        typeParams: [],
                        subject,
                    }),
                    args
                });
            }

            consume(Token.Symbol('::'));
            const member = identifier();
            const params = typeParamsInst();
            return Expr.ExtensionAccess({ member, typeParams: params, subject });
        }).orDefault(primaryExpr);
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
                    return moduleAccessExpr(name);
                }

                const params = typeParamsInst();

                return Expr.Variable({ name, typeParams: params });
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

    function moduleAccessExpr(prefix: string): Expr {
        const parts = path(prefix);
        const components = parts.slice(0, -1);
        const member = last(parts);
        const params = typeParamsInst();

        if (matches(Token.Symbol('{'))) {
            return structExpr(components, member, params);
        }

        return Expr.ModuleAccess({ path: components, member });
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
                    case 'pub': {
                        next();
                        modifiers.pub = true;
                        const ret = stmt();
                        modifiers.pub = false;
                        return ret;
                    }
                    case 'static': {
                        next();
                        modifiers.static = true;
                        const ret = stmt();
                        modifiers.static = false;
                        return ret;
                    }
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
                    case 'while':
                        next();
                        return whileStmt();
                    case 'return':
                        next();
                        return returnStmt();
                    default:
                        return assignmentStmt();
                }
            },
            _: () => assignmentStmt(),
        });
    }

    function funStmt(): Stmt {
        const name = identifier();
        const value = funExpr(false);
        consumeIfPresent(Token.Symbol(';'));

        return Stmt.Let({
            pub: modifiers.pub,
            static: modifiers.static,
            mutable: false,
            name,
            value
        });
    }

    function letStmt(mutable: boolean): Stmt {
        const name = identifier();
        const ann = typeAnnotation();
        consume(Token.Symbol('='));
        const value = expr();
        consumeIfPresent(Token.Symbol(';'));

        return Stmt.Let({
            pub: modifiers.pub,
            static: modifiers.static,
            mutable,
            name,
            ann,
            value
        });
    }

    function statementList(): Stmt[] {
        const stmts: Stmt[] = [];

        consume(Token.Symbol('{'));

        while (!matches(Token.Symbol('}'))) {
            stmts.push(stmt());
        }

        return stmts;
    }

    function whileStmt(): Stmt {
        const cond = expr();
        const body = statementList();
        consumeIfPresent(Token.Symbol(';'));

        return Stmt.While(cond, body);
    }

    function returnStmt(): Stmt {
        const value = expr();
        consumeIfPresent(Token.Symbol(';'));

        return Stmt.Return(value);
    }

    const ASSIGNMENT_OPERATORS = new Set<AssignmentOp>(['=', '+=', '-=', '*=', '/=', 'mod=', '**=', 'or=', 'and=', '&=', '|=']);

    function assignmentStmt(): Stmt {
        const lhs = expr();

        const token = peek();
        if (token.variant === 'Symbol' && (ASSIGNMENT_OPERATORS as Set<string>).has(token.$value)) {
            next();

            const value = expr();
            consumeIfPresent(Token.Symbol(';'));
            return Stmt.Assign(lhs, token.$value as AssignmentOp, value);
        }

        consumeIfPresent(Token.Symbol(';'));

        return Stmt.Expr(lhs);
    }

    // ------ declarations ------

    const KEYWORD_MAPPING: Partial<Record<Keyword, () => Decl>> = {
        type: typeDecl,
        module: moduleDecl,
        declare: declareDecl,
        import: importDecl,
        struct: structDecl,
        extend: extendDecl,
    };

    function decl(): Decl {
        const token = peek();

        if (token.variant === 'Keyword') {
            if (token.$value === 'pub') {
                next();
                modifiers.pub = true;
                return decl();
            }

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
            consumeIfPresent(Token.Symbol(','));
        }

        consumeIfPresent(Token.Symbol(';'));
        consumeIfPresent(Token.Symbol(','));

        return Decl._Many({ decls });
    }

    function stmtDecl(): Decl {
        return Decl.Stmt(stmt());
    }

    function importPath(): string[] {
        const path: string[] = [];
        let continue_ = true;

        while (continue_) {
            match(peek(), {
                Identifier: id => {
                    path.push(id);
                    next();
                },
                Symbol: sym => {
                    if (sym === '.' && matches(Token.Symbol('.'))) {
                        path.push('..');
                        next();
                    } else if (sym === '/') {
                        next();
                    } else if (sym === '{' || sym === ';') {
                        continue_ = false;
                    } else {
                        reportError(`Unexpected symbol in import path: '${sym}'`);
                    }
                },
                _: () => {
                    continue_ = false;
                },
            });
        }

        return path;
    }

    function importDecl(): Decl {
        const path = importPath();

        if (path.length === 0) {
            reportError('Expected import path');
        }

        let members: string[] | undefined;

        if (matches(Token.Symbol('{'))) {
            members = sepBy(identifier, Token.Symbol(','), Token.Symbol('}'));
            consume(Token.Symbol('}'));
        }

        consumeIfPresent(Token.Symbol(';'));

        return Decl.Import({
            path: path.slice(0, -1),
            module: last(path),
            members: members?.map(name => ({ name })),
        });
    }

    function typeDecl(): VariantOf<Decl, 'Type'> {
        const lhs = type();
        consume(Token.Symbol('='));
        const rhs = type();
        consumeIfPresent(Token.Symbol(';'));

        return Decl.Type({ pub: modifiers.pub, lhs, rhs });
    }

    function structDecl(): VariantOf<Decl, 'Struct'> {
        const name = identifier();
        const params = typeParams();
        const fields: StructDecl['fields'] = [];

        consume(Token.Symbol('{'));

        while (!matches(Token.Symbol('}'))) {
            const mut = matches(Token.Keyword('mut'));
            const name = identifier();
            const ty = typeAnnotationRequired();
            fields.push({ mut, name, ty });
            consumeIfPresent(Token.Symbol(','));
        }

        consumeIfPresent(Token.Symbol(';'));

        return Decl.Struct({ pub: modifiers.pub, name, params, fields });
    }

    function extendDecl(): VariantOf<Decl, 'Extend'> {
        const subject = type();
        consume(Token.Symbol('{'));

        const decls: Decl[] = [];

        while (!matches(Token.Symbol('}'))) {
            decls.push(decl());
            consumeIfPresent(Token.Symbol(','));
        }

        consumeIfPresent(Token.Symbol(';'));

        return Decl.Extend({ subject, decls, uuid: uuidv4().replace(/-/g, '_') });
    }

    function variableSignature(mutable: boolean): VariantOf<Signature, 'Variable'> {
        const name = identifier();
        const ty = typeAnnotationRequired();
        consumeIfPresent(Token.Symbol(';'));

        return { variant: 'Variable', static: modifiers.static, mutable, generics: [], name, ty };
    }

    function functionSignature(): VariantOf<Signature, 'Variable'> {
        const name = identifier();
        const generics = typeParams();
        consume(Token.Symbol('('));
        const args = commas(functionArgument);
        consume(Token.Symbol(')'));
        const ret = typeAnnotationRequired();
        consumeIfPresent(Token.Symbol(';'));

        if (args.some(arg => arg.ann === undefined)) {
            reportError('All arguments in a function signature must have a type annotation');
        }

        const funTy = Type.Function(args.map(arg => arg.ann!), ret);

        return { variant: 'Variable', mutable: false, static: modifiers.static, generics, name, ty: funTy };
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
            type: () => letIn(typeDecl(), td => ({
                variant: 'Type',
                pub: modifiers.pub,
                lhs: td.lhs,
                rhs: td.rhs,
            })),
            module: moduleSignature,
        };

        const token = peek();

        if (token.variant === 'Keyword') {
            if (token.$value === 'pub') {
                next();
                modifiers.pub = true;
                return signatures();
            }

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

        return Decl.Module({ pub: modifiers.pub, name, decls });
    }

    function topModule(name: string): ModuleDecl {
        const decls: Decl[] = [];

        while (!isAtEnd()) {
            decls.push(decl());
        }

        return { pub: true, name, decls };
    }

    return { expr, stmt, decl, module: moduleDecl, topModule };
};
