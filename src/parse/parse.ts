import { match, VariantOf } from 'itsamatch';
import { Attribute, Attributes } from '../ast/sweet/attribute';
import { Decl, EnumVariant, ModuleDecl, Signature, StructDecl } from '../ast/sweet/decl';
import { Expr, FunctionArgument, StringInterpolationPart } from '../ast/sweet/expr';
import { Pattern } from '../ast/sweet/pattern';
import { Stmt } from '../ast/sweet/stmt';
import { Type, TypeVar } from '../infer/type';
import { Maybe, None, Some } from '../misc/maybe';
import { Backtick, BacktickConsts, countCharacterOccurrences, isLowerCase, isUpperCase } from '../misc/strings';
import { array, assert, block, last, panic } from '../misc/utils';
import { AssignmentOp, BinaryOp, Keyword, Literal, Symbol, Token, UnaryOp } from './token';

export const parse = (tokens: Token[], source: string, moduleName: string) => {
  let index = 0;
  const attribs = {
    ref: Attributes.empty(),
    copy: (): Attributes => ({ ...attribs.ref }),
  };

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
      raise(error);
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
        raise('Expected identifier');
      },
    });
  }

  function literal(): Literal {
    return match(peek(), {
      Literal: ({ value }) => {
        next();
        return value;
      },
      _: () => {
        raise('Expected literal');
      },
    });
  }

  function raise(message: string): never {
    const loc = tokens[index]?.loc;
    const start = loc?.start ?? 0;
    const line = countCharacterOccurrences(source, '\n', start) + 1;
    return panic(`Parse error: ${message} at line ${line} in module '${moduleName}'`);
  }

  // sepBy(rule, sep) -> (<rule> (sep <rule>)*)?
  function sepBy<T>(rule: () => T, separator: Token, closingToken = Token.Symbol(')')): T[] {
    let terms: T[] = [];

    do {
      if (check(closingToken)) {
        break;
      }

      terms.push(rule());
    } while (matches(separator));

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
    } catch {
      index = start;
      return None;
    }
  }

  function brackets<T>(p: () => T): T {
    consume(Token.Symbol('['));
    const ret = p();
    consume(Token.Symbol(']'));

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

  function attribute(): Attribute {
    const name = identifier();
    const args = [];

    if (matches(Token.Symbol('('))) {
      args.push(...commas(literal));
      consume(Token.Symbol(')'));
    }

    return { name, args };
  }

  function attributes(): Attributes {
    const attrs = Attributes.parse(
      block(() => {
        if (matches(Token.Symbol('#'))) {
          if (check(Token.Symbol('['))) {
            return brackets(() => commas(attribute));
          } else {
            return [attribute()];
          }
        }

        return [];
      }),
    );

    consumeIfPresent(Token.Symbol(';'));

    return attrs;
  }

  function consumeSeparatorIfPresent() {
    if (check(Token.Symbol(',')) || check(Token.Symbol(';'))) {
      next();
    }
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
        } else if (
          token.variant === 'Keyword' &&
          (token.$value === 'if' || token.$value === 'let' || token.$value === 'fun')
        ) {
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
        raise('Expected a module name in Type path');
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
      return Type.Fun(typeName, args);
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
      raise('Expected type annotation');
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
        case 'match':
          next();
          return matchExpr();
      }
    }

    return funExpr({ isArrowFunction: true, isMutableExtension: false });
  }

  function functionArgument(): FunctionArgument {
    const pat = pattern();
    const ann = typeAnnotation();
    return { pat, ann };
  }

  type FunExprParams = {
    isArrowFunction: boolean;
    isMutableExtension: boolean;
  };

  function funExpr({ isArrowFunction, isMutableExtension }: FunExprParams): Expr {
    return attempt<Expr>(() => {
      let args: FunctionArgument[];
      let ret: Type | undefined;
      const generics = typeParams();
      const token = peek();

      if (isArrowFunction && token.variant === 'Identifier') {
        next();
        args = [{ pat: Pattern.Variable(token.$value) }];
      } else if (token.variant === 'Symbol' && token.$value === '(') {
        next();
        args = commas(functionArgument);
        consume(Token.Symbol(')'));
        ret = typeAnnotation();
      } else {
        raise('Expected function arguments');
      }

      if (isArrowFunction) {
        consume(Token.Symbol('->'));
      }

      const body = expr();
      return Expr.Fun({ mut: isMutableExtension, generics, args, ret, body, isIterator: false });
    }).orDefault(logicalOrExpr);
  }

  function useInExpr(): Expr {
    const lhs = pattern();
    const ann = typeAnnotation();
    consume(Token.Symbol('='));
    const value = expr();
    consume(Token.Keyword('in'));
    const rhs = expr();

    return Expr.UseIn({ lhs, ann, value, rhs });
  }

  function ifExpr(): Expr {
    const cond = expr();
    const then_ = blockExpr();

    if (matches(Token.Keyword('else'))) {
      if (matches(Token.Keyword('if'))) {
        return Expr.If({ cond, then_, else_: ifExpr() });
      } else {
        return Expr.If({ cond, then_, else_: blockExpr() });
      }
    }

    return Expr.If({ cond, then_ });
  }

  function matchExpr(): Expr {
    const subject = expr();
    consume(Token.Symbol('{'));
    const cases: { pattern: Pattern; body: Expr }[] = [];

    while (!matches(Token.Symbol('}'))) {
      const pat = pattern();
      consume(Token.Symbol('=>'));
      const body = expr();
      cases.push({ pattern: pat, body });
      consumeSeparatorIfPresent();
    }

    return Expr.Match({ subject, cases });
  }

  function structExpr(path: string[], name: string, typeParams: Type[]): Expr {
    consumeIfPresent(Token.Symbol('{'));
    const fields: { name: string; value: Expr }[] = [];

    while (!matches(Token.Symbol('}'))) {
      const name = identifier();
      if (matches(Token.Symbol(':'))) {
        const value = expr();
        fields.push({ name, value });
      } else {
        fields.push({ name, value: Expr.Variable({ name, typeParams: [] }) });
      }

      consumeSeparatorIfPresent();
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
    return binaryExpr(multiplicationExpr, ['+', '-', '++']);
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

    const expr = elementAccessExpr();

    if (matches(Token.Symbol('?'))) {
      return Expr.Unary({ op: '?', expr });
    }

    return expr;
  }

  function elementAccessExpr(): Expr {
    let lhs = callExpr();

    while (matches(Token.Symbol('['))) {
      const key = expr();
      consume(Token.Symbol(']'));
      lhs = Expr.Call({
        fun: Expr.FieldAccess({
          lhs,
          field: BacktickConsts.ELEMENT_ACCESS,
          typeParams: [],
          isCalled: true,
          isNative: false,
        }),
        args: [key],
      });
    }

    return lhs;
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
            lhs = Expr.FieldAccess({
              lhs,
              field: token.$value,
              typeParams: params,
              isCalled: false,
              isNative: false,
            });
            matched = true;
            break;
          case 'Literal':
            if (token.value.variant === 'Num') {
              next();
              lhs = Expr.TupleAccess({
                lhs,
                index: token.value.$value,
              });
              matched = true;
            }
            break;
        }

        if (!matched) {
          raise('Expected identifier or number literal');
        }
      } else if (matches(Token.Symbol('('))) {
        const args = commas(expr);
        consume(Token.Symbol(')'));

        if (lhs.variant === 'FieldAccess') {
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
      assert(
        subject.variant === 'Fun' ||
          (subject.variant === 'Var' &&
            subject.ref.variant === 'Param' &&
            subject.ref.name === '_'),
      );

      if (matches(Token.Symbol('('))) {
        const args = commas(expr);
        consume(Token.Symbol(')'));
        return Expr.Call({
          fun: Expr.ExtensionAccess({
            member: 'init',
            typeParams: [],
            subject,
          }),
          args,
        });
      }

      consume(Token.Symbol('::'));
      const member = identifier();
      const params = typeParamsInst();
      return Expr.ExtensionAccess({
        member,
        typeParams: params,
        subject,
      });
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
          case '.':
            return variantShorthandExpr();
          default:
            raise(`Unexpected symbol '${symb}'`);
        }
      },
      StringInterpolation: ({ parts }) => {
        next();
        return Expr.StringInterpolation({
          parts: parts.map(part =>
            match(part, {
              Expr: ({ tokens }) =>
                StringInterpolationPart.Expr(parse(tokens, '<internal>', moduleName).expr()),
              Str: ({ value }) => StringInterpolationPart.Str(value),
            }),
          ),
        });
      },
      _: () => raise('Expected expression'),
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
        raise('Expected identifier');
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

  function variantShorthandExpr(): Expr {
    consume(Token.Symbol('.'));
    const variantName = identifier();
    const args = array<Expr>();

    if (matches(Token.Symbol('('))) {
      args.push(...commas(expr));
      consume(Token.Symbol(')'));
    }

    return Expr.VariantShorthand({ variantName, args });
  }

  // patterns

  function pattern(): Pattern {
    return match(peek(), {
      Identifier: name => {
        next();
        if (name[0].toUpperCase() === name[0]) {
          if (matches(Token.Symbol('.'))) {
            const variant = identifier();
            let args = array<Pattern>();

            if (matches(Token.Symbol('('))) {
              args = commas(pattern);
              consume(Token.Symbol(')'));
            } else {
              args = [];
            }

            return Pattern.Variant({
              enumName: name,
              variantName: variant,
              args,
            });
          }

          return Pattern.Ctor(name, []);
        } else {
          return Pattern.Variable(name);
        }
      },
      Literal: ({ value }) => {
        next();
        return Pattern.Literal(value);
      },
      Symbol: symb => {
        switch (symb) {
          case '_':
            next();
            return Pattern.Any;
          case '(':
            return tuplePattern();
          case '{':
            return structPattern();
          case '.': {
            next();
            const variant = identifier();
            let args = array<Pattern>();

            if (matches(Token.Symbol('('))) {
              args = commas(pattern);
              consume(Token.Symbol(')'));
            } else {
              args = [];
            }

            return Pattern.Variant({
              variantName: variant,
              args,
            });
          }
          default:
            raise(`Unexpected symbol in pattern '${symb}'`);
        }
      },
      _: () => {
        raise('Expected pattern');
      },
    });
  }

  function tuplePattern(): Pattern {
    consume(Token.Symbol('('));
    const elems = commas(pattern);
    consume(Token.Symbol(')'));

    return Pattern.Tuple(elems);
  }

  function structPattern(): Pattern {
    consume(Token.Symbol('{'));
    const fields: { name: string; rhs?: Pattern }[] = [];

    while (!matches(Token.Symbol('}'))) {
      const name = identifier();
      let rhs: Pattern | undefined;

      if (matches(Token.Symbol(':'))) {
        rhs = pattern();
      }

      fields.push({ name, rhs });
      consumeSeparatorIfPresent();
    }

    return Pattern.Struct(fields);
  }

  // ------ statements ------

  type StmtModifiers = {
    pub: boolean;
    mut: boolean;
    static: boolean;
  };

  function stmt(modifiers: StmtModifiers = { pub: false, mut: false, static: false }): Stmt {
    attribs.ref = attributes();

    return match(peek(), {
      Keyword: keyword => {
        switch (keyword) {
          case 'pub': {
            next();
            return stmt({ ...modifiers, pub: true });
          }
          case 'static': {
            next();
            return stmt({ ...modifiers, static: true });
          }
          case 'mut':
            next();
            if (matches(Token.Keyword('fun'))) {
              return funStmt({ ...modifiers, mut: true });
            }
            // fallthrough
          case 'let':
            const isMutable = keyword === 'mut';
            if (!isMutable) {
              next();
            }

            if (matches(Token.Symbol('{'))) {
              const stmts: Stmt[] = [];

              while (!matches(Token.Symbol('}'))) {
                stmts.push(letStmt({ ...modifiers, mut: isMutable }));
              }

              consumeIfPresent(Token.Symbol(';'));

              return Stmt._Many({ stmts });
            }

            return letStmt({ ...modifiers, mut: isMutable });
          case 'fun':
            next();
            return funStmt(modifiers);
          case 'while':
            next();
            return whileStmt();
          case 'for':
            next();
            return forStmt();
          case 'return':
            next();
            return returnStmt();
          case 'yield':
            next();
            return yieldStmt();
          case 'break':
            next();
            return breakStmt();
          default:
            return assignmentStmt();
        }
      },
      _: () => assignmentStmt(),
    });
  }

  function funStmt(modifiers: StmtModifiers): Stmt {
    const attrs = attribs.copy();
    const name = identifier();
    const value = funExpr({ isArrowFunction: false, isMutableExtension: modifiers.mut });
    consumeIfPresent(Token.Symbol(';'));

    return Stmt.Let({
      pub: modifiers.pub,
      static: modifiers.static,
      mutable: modifiers.mut,
      lhs: Pattern.Variable(name),
      value,
      attrs,
    });
  }

  function letStmt(modifiers: StmtModifiers): Stmt {
    const attrs = attribs.copy();
    const lhs = pattern();
    const ann = typeAnnotation();
    consume(Token.Symbol('='));
    const value = expr();
    consumeIfPresent(Token.Symbol(';'));

    return Stmt.Let({
      pub: modifiers.pub,
      static: modifiers.static,
      mutable: modifiers.mut,
      lhs,
      ann,
      value,
      attrs,
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

  function forStmt(): Stmt {
    const name = identifier();
    consume(Token.Keyword('in'));
    const iterator = expr();
    const body = statementList();
    consumeIfPresent(Token.Symbol(';'));

    return Stmt.For(name, iterator, body);
  }

  function returnStmt(): Stmt {
    const value = expr();
    consumeIfPresent(Token.Symbol(';'));

    return Stmt.Return(value);
  }

  function yieldStmt(): Stmt {
    const value = expr();
    consumeIfPresent(Token.Symbol(';'));

    return Stmt.Yield(value);
  }

  function breakStmt(): Stmt {
    consumeIfPresent(Token.Symbol(';'));

    return Stmt.Break();
  }

  const ASSIGNMENT_OPERATORS = new Set<AssignmentOp>([
    '=',
    '+=',
    '-=',
    '*=',
    '/=',
    'mod=',
    '**=',
    'or=',
    'and=',
    '&=',
    '|=',
  ]);

  function assignmentStmt(): Stmt {
    const lhs = expr();

    // lhs.`[]`(key) = val ~> lhs.`[]=`(key, val)
    if (
      lhs.variant === 'Call' &&
      lhs.fun.variant === 'FieldAccess' &&
      lhs.fun.field === BacktickConsts.ELEMENT_ACCESS &&
      matches(Token.Symbol('='))
    ) {
      const value = expr();
      consumeIfPresent(Token.Symbol(';'));

      return Stmt.Expr(Expr.Call({
        fun: Expr.FieldAccess({
          lhs: lhs.fun.lhs,
          field: BacktickConsts.ELEMENT_ASSIGN,
          typeParams: [],
          isCalled: true,
          isNative: false,
        }),
        args: [lhs.args[0], value],
      }));
    }

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

  type DeclModifiers = {
    pub: boolean;
  };

  const DECL_KEYWORD_MAPPING: Partial<Record<Keyword, (modifiers: DeclModifiers) => Decl>> = {
    type: typeDecl,
    module: moduleDecl,
    declare: declareDecl,
    import: importDecl,
    struct: structDecl,
    extend: extendDecl,
    enum: enumDecl,
  };

  function decl(modifiers: DeclModifiers): Decl {
    attribs.ref = attributes();
    const token = peek();

    if (token.variant === 'Keyword') {
      if (token.$value === 'pub') {
        next();
        return decl({ ...modifiers, pub: true });
      }

      const parser = DECL_KEYWORD_MAPPING[token.$value];

      if (parser) {
        next();

        if (matches(Token.Symbol('{'))) {
          return manyDecl(() => parser(modifiers));
        }

        const res = parser(modifiers);
        consumeSeparatorIfPresent();
        return res;
      }
    }

    return stmtDecl(modifiers);
  }

  function manyDecl(declParser: () => Decl): Decl {
    const decls: Decl[] = [];
    consumeIfPresent(Token.Symbol('{'));

    while (!matches(Token.Symbol('}'))) {
      decls.push(declParser());
      consumeSeparatorIfPresent();
    }

    consumeSeparatorIfPresent();

    return Decl._Many({ decls });
  }

  function stmtDecl({ pub }: DeclModifiers): Decl {
    return Decl.Stmt(stmt({ pub, mut: false, static: false }));
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
            raise(`Unexpected symbol in import path: '${sym}'`);
          }
        },
        _: () => {
          continue_ = false;
        },
      });
    }

    return path;
  }

  function importDecl(modifiers: DeclModifiers): Decl {
    const path = importPath();

    if (path.length === 0) {
      raise('Expected import path');
    }

    let members: string[] | undefined;

    if (matches(Token.Symbol('{'))) {
      members = sepBy(identifier, Token.Symbol(','), Token.Symbol('}'));
      consume(Token.Symbol('}'));
    }

    consumeIfPresent(Token.Symbol(';'));

    return Decl.Import({
      pub: modifiers.pub,
      path: path.slice(0, -1),
      module: last(path),
      members: members?.map(name => ({ name, native: false })) ?? [],
    });
  }

  function typeDecl(modifiers: DeclModifiers): VariantOf<Decl, 'Type'> {
    const lhs = type();
    consume(Token.Symbol('='));
    const rhs = type();
    consumeIfPresent(Token.Symbol(';'));

    return Decl.Type({ pub: modifiers.pub, lhs, rhs });
  }

  function structDecl(modifiers: DeclModifiers): VariantOf<Decl, 'Struct'> {
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

  function extendDecl(modifiers: DeclModifiers): VariantOf<Decl, 'Extend'> {
    const params = typeParams();
    const subject = type();
    const decls = array<Decl>();

    consume(Token.Symbol('{'));

    while (!matches(Token.Symbol('}'))) {
      decls.push(decl(modifiers));
      consumeIfPresent(Token.Symbol(','));
    }

    consumeIfPresent(Token.Symbol(';'));

    return Decl.Extend({
      params,
      subject,
      decls,
      suffix: (subject.variant === 'Var' ? '$' : '') + Type.showFlat(subject),
    });
  }

  function enumDecl(modifiers: DeclModifiers): VariantOf<Decl, 'Enum'> {
    const name = identifier();
    const params = typeParams();
    const variants = array<EnumVariant>();

    consume(Token.Symbol('{'));

    while (!matches(Token.Symbol('}'))) {
      const variantName = identifier();

      if (matches(Token.Symbol('{'))) {
        const fields = commas(() => {
          const name = identifier();
          const ty = typeAnnotationRequired();
          return { name, ty };
        });

        consume(Token.Symbol('}'));
        variants.push(EnumVariant.Struct({ name: variantName, fields }));
      } else if (matches(Token.Symbol('('))) {
        const args = commas(type);
        consume(Token.Symbol(')'));
        variants.push(EnumVariant.Tuple({ name: variantName, args }));
      } else {
        variants.push(EnumVariant.Empty({ name: variantName }));
      }

      consumeSeparatorIfPresent();
    }

    return Decl.Enum({ pub: modifiers.pub, name, params, variants });
  }

  type SignatureModifiers = {
    pub: boolean;
    mut: boolean;
    static: boolean;
  };

  function variableSignature(modifiers: SignatureModifiers): VariantOf<Signature, 'Variable'> {
    const name = identifier();
    const ty = typeAnnotationRequired();
    consumeIfPresent(Token.Symbol(';'));

    return Signature.Variable({
      isMutExtension: false,
      static: modifiers.static,
      mut: modifiers.mut,
      params: [],
      name,
      ty,
    });
  }

  function typeSignature(): VariantOf<Signature, 'Type'> {
    const name = identifier();
    const params = typeParams();
    consumeIfPresent(Token.Symbol(';'));

    return Signature.Type({ name, params });
  }

  function functionSignature(modifiers: SignatureModifiers): VariantOf<Signature, 'Variable'> {
    const name = identifier();
    const params = typeParams();
    consume(Token.Symbol('('));
    const args = commas(functionArgument);
    consume(Token.Symbol(')'));
    const ret = typeAnnotationRequired();
    consumeIfPresent(Token.Symbol(';'));

    if (args.some(arg => arg.ann === undefined)) {
      raise('All arguments in a function signature must have a type annotation');
    }

    const funTy = Type.Function(
      args.map(arg => arg.ann!),
      ret,
    );

    return Signature.Variable({
      isMutExtension: modifiers.mut,
      static: modifiers.static,
      mut: false,
      params,
      name,
      ty: funTy,
    });
  }

  function moduleSignature(modifiers: SignatureModifiers): VariantOf<Signature, 'Module'> {
    const name = identifier();
    const sigs: Signature[] = [];
    consume(Token.Symbol('{'));

    while (!matches(Token.Symbol('}'))) {
      sigs.push(...signatures(modifiers));
    }

    consumeIfPresent(Token.Symbol(';'));

    return Signature.Module({ name, signatures: sigs });
  }

  function signatures(modifiers: SignatureModifiers): Signature[] {
    const SIGNATURE_MAPPING: Partial<Record<Keyword, () => Signature>> = {
      let: () => variableSignature({ ...modifiers, mut: false }),
      mut: () => {
        const token = peek();
        if (token.variant === 'Keyword' && token.$value === 'fun') {
          next();
          return functionSignature({ ...modifiers, mut: true });
        }

        return variableSignature({ ...modifiers, mut: true });
      },
      fun: () => functionSignature(modifiers),
      type: () => typeSignature(),
      module: () => moduleSignature(modifiers),
    };

    const token = peek();

    if (token.variant === 'Keyword') {
      if (token.$value === 'pub') {
        next();
        modifiers.pub = true;
        return signatures(modifiers);
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

    raise('Expected a signature');
  }

  function declareDecl(): Decl {
    const attrs = attribs.copy();
    const sigs = signatures({ pub: false, mut: false, static: false });

    if (sigs.length === 1) {
      return Decl.Declare(sigs[0], attrs);
    }

    return Decl._Many({ decls: sigs.map(sig => Decl.Declare(sig, attrs)) });
  }

  function moduleDecl(modifiers: DeclModifiers): VariantOf<Decl, 'Module'> {
    consumeIfPresent(Token.Keyword('module'));
    const name = identifier();
    const params = typeParams();
    const decls: Decl[] = [];
    consume(Token.Symbol('{'));

    while (!matches(Token.Symbol('}'))) {
      decls.push(decl(modifiers));
    }

    consumeIfPresent(Token.Symbol(';'));

    return Decl.Module({ pub: modifiers.pub, name, params, decls });
  }

  function topModule(modifiers: DeclModifiers): ModuleDecl {
    const decls: Decl[] = [];

    while (!isAtEnd()) {
      decls.push(decl(modifiers));
    }

    return { pub: true, name: moduleName, params: [], decls };
  }

  return { expr, stmt, decl, module: moduleDecl, topModule };
};
