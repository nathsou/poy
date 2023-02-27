"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b ||= {})
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// node_modules/itsamatch/lib/index.js
var WRAPPED_VALUE_KEY = "$value";
var match = (value, cases, tag = "variant") => {
  if (value[tag] in cases) {
    const handler = cases[value[tag]];
    return handler(WRAPPED_VALUE_KEY in value ? value[WRAPPED_VALUE_KEY] : value);
  }
  if ("_" in cases) {
    return cases["_"](WRAPPED_VALUE_KEY in value ? value[WRAPPED_VALUE_KEY] : value);
  }
  throw new Error(`Unhandled ${tag}: '${value[tag]}'`);
};
var matchMany = (values, cases, tag = "variant") => {
  const key = values.map((v) => v[tag]).join(" ");
  const vals = values.map((v) => WRAPPED_VALUE_KEY in v ? v[WRAPPED_VALUE_KEY] : v);
  if (key in cases) {
    return cases[key](...vals);
  }
  if ("_" in cases) {
    return cases["_"](...vals);
  }
  throw new Error(`Unhandled ${tag}: '${key}'`);
};
var constructorOf = (variant, tag) => {
  return (arg) => {
    if (arg === void 0) {
      return { [tag]: variant };
    }
    if (typeof arg === "object" && arg != null && !Array.isArray(arg)) {
      return Object.assign({ [tag]: variant }, arg);
    }
    return { [tag]: variant, [WRAPPED_VALUE_KEY]: arg };
  };
};
var genConstructors = (variants, tag = "variant") => {
  return variants.reduce((ctors, variant) => {
    ctors[variant] = constructorOf(variant, tag);
    return ctors;
  }, {});
};

// src/ast/sweet/expr.ts
var Expr = __spreadProps(__spreadValues({}, genConstructors([
  "Variable",
  "Unary",
  "Binary",
  "Block",
  "If",
  "Tuple",
  "Array",
  "UseIn",
  "Fun",
  "Call"
])), {
  Literal: (literal) => ({ variant: "Literal", literal })
});

// src/misc/utils.ts
var panic = (msg) => {
  throw new Error(msg);
};
function assert(test, message = "") {
  if (!test) {
    throw new Error(`assertion failed: ${typeof message === "string" ? message : message()}`);
  }
}

// src/misc/maybe.ts
var _Maybe = class {
  constructor(value) {
    this.raw = value;
  }
  static NoneAs() {
    return _Maybe.None;
  }
  static Some(val) {
    return new _Maybe({ type: "some", data: val });
  }
  isSome() {
    return this.raw.type === "some";
  }
  isNone() {
    return this.raw.type === "none";
  }
  map(f) {
    if (this.raw.type === "some") {
      return Some(f(this.raw.data));
    }
    return None;
  }
  do(f) {
    if (this.raw.type === "some") {
      f(this.raw.data);
    }
  }
  mapWithDefault(f, defaultValue) {
    if (this.raw.type === "some") {
      return f(this.raw.data);
    }
    return typeof defaultValue === "function" ? defaultValue() : defaultValue;
  }
  flatMap(f) {
    if (this.raw.type === "some") {
      return f(this.raw.data);
    }
    return None;
  }
  or(other) {
    if (this.raw.type === "some") {
      return this;
    }
    return typeof other === "function" ? other() : other;
  }
  orDefault(defaultValue) {
    if (this.raw.type === "some") {
      return this.raw.data;
    }
    return typeof defaultValue === "function" ? defaultValue() : defaultValue;
  }
  match(actions) {
    if (this.raw.type === "some") {
      return actions.Some(this.raw.data);
    }
    return actions.None();
  }
  unwrap(message) {
    if (this.raw.type === "some") {
      return this.raw.data;
    }
    if (message) {
      return panic(`Maybe.unwrap: ${message}`);
    }
    return panic("Tried to unwrap a None value");
  }
  static from(val) {
    return val === void 0 ? None : Some(val);
  }
  static firstSomeBy(elems, f) {
    for (let i = 0; i < elems.length; i++) {
      const mapped = f(elems[i]);
      if (mapped.isSome()) {
        return mapped.map((data) => [data, i]);
      }
    }
    return None;
  }
  static wrap(value) {
    return value === void 0 ? None : Some(value);
  }
};
var Maybe = _Maybe;
Maybe.None = new _Maybe({ type: "none" });
var { None, NoneAs, Some } = Maybe;

// src/misc/scope.ts
var Scope = class {
  constructor(parent) {
    this.members = /* @__PURE__ */ new Map();
    this.parent = parent;
  }
  declare(name, value) {
    if (this.members.has(name)) {
      panic(`Member ${name} already declared`);
    }
    this.members.set(name, value);
  }
  lookup(name) {
    if (this.members.has(name)) {
      return Some(this.members.get(name));
    }
    if (this.parent != null) {
      return this.parent.lookup(name);
    }
    return None;
  }
  child() {
    return new Scope(this);
  }
  show(showT) {
    return [...this.members.entries()].map(([name, val]) => `${name}: ${showT(val)}`).join("\n");
  }
};

// src/misc/context.ts
var context = {
  typeVarId: 0
};
var Context = {
  reset: () => {
    context.typeVarId = 0;
  },
  freshTypeVarId: () => {
    const id = context.typeVarId;
    context.typeVarId += 1;
    return id;
  }
};

// src/infer/type.ts
var TypeVar = __spreadProps(__spreadValues({}, genConstructors(["Unbound", "Generic"])), {
  Link: (type) => ({ variant: "Link", type }),
  eq: (a, b) => matchMany([a, b], {
    "Unbound Unbound": (a2, b2) => a2.id === b2.id,
    "Generic Generic": (a2, b2) => a2.id === b2.id,
    "Link Link": (a2, b2) => Type.eq(a2.type, b2.type),
    _: () => false
  }),
  show: (self) => match(self, {
    Unbound: ({ id, name }) => name != null ? name : `?${id}`,
    Generic: ({ id, name }) => name != null ? name : `?${id}`,
    Link: ({ type }) => Type.show(type)
  }),
  linkTo: (self, type, subst) => {
    if (self.ref.variant === "Unbound") {
      if (subst != null) {
        subst.set(self.ref.id, type);
      } else {
        self.ref = TypeVar.Link(type);
      }
    }
  },
  fresh: (level, name) => TypeVar.Unbound({ id: Context.freshTypeVarId(), name, level })
});
var Type = {
  Var: (ref) => ({ variant: "Var", ref }),
  Fun: (name, args) => ({ variant: "Fun", name, args }),
  Array: (elem) => Type.Fun("Array", [elem]),
  Tuple: (elems) => {
    switch (elems.length) {
      case 0:
        return Type.Fun("Unit", []);
      case 1:
        return elems[0];
      default:
        return Type.Fun("Tuple", [list(elems)]);
    }
  },
  Function: (args, ret) => Type.Fun("Function", [list(args), ret]),
  Bool: Object.freeze({ variant: "Fun", name: "Bool", args: [] }),
  Num: Object.freeze({ variant: "Fun", name: "Num", args: [] }),
  Str: Object.freeze({ variant: "Fun", name: "Str", args: [] }),
  Nil: Object.freeze({ variant: "Fun", name: "Nil", args: [] }),
  Cons: (head, tail) => Type.Fun("Cons", [head, tail]),
  Unit: Object.freeze({ variant: "Fun", name: "Unit", args: [] }),
  show,
  list,
  unlist,
  isList,
  eq,
  unify,
  substitute,
  normalize,
  fresh,
  vars,
  rewrite
};
function isList(ty) {
  return match(ty, {
    Var: () => false,
    Fun: ({ name }) => name === "Nil" || name === "Cons"
  });
}
function show(ty) {
  return match(ty, {
    Var: ({ ref }) => TypeVar.show(ref),
    Fun: ({ name, args }) => {
      switch (name) {
        case "Nil":
          return "[]";
        case "Cons":
          return `${show(args[0])}::${show(args[1])}`;
        case "Array":
          return `${show(args[0])}[]`;
        case "Tuple":
          if (!isList(args[0])) {
            return `Tuple<${show(args[0])}>`;
          }
          return `(${unlist(args[0]).map(show).join(", ")})`;
        case "Function": {
          const ret = args[1];
          if (!isList(args[0])) {
            return `Function<${show(args[0])}, ${show(ret)}>`;
          }
          const params = unlist(args[0]);
          if (params.length === 1) {
            return `${show(params[0])} -> ${show(ret)}`;
          }
          return `(${params.map(show).join(", ")}) -> ${show(ret)}`;
        }
        default:
          if (args.length === 0) {
            return name;
          }
          return `${name}<${args.map(show).join(", ")}>`;
      }
    }
  });
}
function rewrite(ty, f) {
  return f(match(ty, {
    Var: ({ ref }) => Type.Var(ref),
    Fun: ({ name, args }) => Type.Fun(name, args.map(f))
  }));
}
function vars(ty) {
  const go = (ty2) => {
    match(ty2, {
      Var: ({ ref }) => {
        if (ref.variant === "Unbound" && ref.name != null) {
          vars2.set(ref.name, ref.id);
        }
      },
      Fun: ({ args }) => args.forEach(go)
    });
  };
  const vars2 = /* @__PURE__ */ new Map();
  go(ty);
  return vars2;
}
function list(elems) {
  return elems.reduceRight((tail, head) => Type.Cons(head, tail), Type.Nil);
}
function unlist(ty) {
  const elems = [];
  while (true) {
    if (ty.variant === "Fun") {
      if (ty.name === "Nil") {
        return elems;
      }
      if (ty.name === "Cons") {
        elems.push(ty.args[0]);
        ty = ty.args[1];
        continue;
      }
    }
    panic(`Expected list, got '${show(ty)}'`);
  }
}
function eq(a, b) {
  return matchMany([a, b], {
    "Var Var": Object.is,
    "Fun Fun": (a2, b2) => a2.name === b2.name && a2.args.length === b2.args.length && a2.args.every((arg, i) => eq(arg, b2.args[i])),
    _: () => false
  });
}
function occursCheckAdjustLevels(id, level, ty) {
  const go = (t) => {
    match(t, {
      Var: (v) => match(v.ref, {
        Unbound: ({ id: id2, level: level2 }) => {
          if (id === id2) {
            panic("Recursive type");
          }
          if (level2 > level) {
            v.ref = TypeVar.Unbound({ id: id2, level });
          }
        },
        Generic: () => {
          panic("Generic type variables should not appear during unification");
        },
        Link: ({ type }) => go(type)
      }),
      Fun: ({ args }) => args.forEach(go)
    });
  };
  go(ty);
}
function unifyVar(v, ty, eqs, subst) {
  match(v.ref, {
    Unbound: ({ id, level }) => {
      if (ty.variant === "Var" && ty.ref.variant === "Unbound" && ty.ref.id === id) {
        panic("There should only be one instance of a particular type variable.");
      }
      occursCheckAdjustLevels(id, level, ty);
      TypeVar.linkTo(v, ty, subst);
    },
    Generic: () => {
      panic("Generic type variables should not appear during unification");
    },
    Link: ({ type }) => {
      eqs.push([type, ty]);
    }
  });
}
function unify(a, b, subst) {
  const eqs = [[a, b]];
  const error = () => panic(`Cannot unify ${show(a)} with ${show(b)}`);
  while (eqs.length > 0) {
    const [s, t] = eqs.pop();
    if (s.variant === "Var") {
      unifyVar(s, t, eqs, subst);
    } else if (t.variant === "Var") {
      unifyVar(t, s, eqs, subst);
    } else if (s.variant === "Fun" && t.variant === "Fun") {
      if (s.name !== t.name || s.args.length !== t.args.length) {
        error();
      }
      for (let i = 0; i < s.args.length; i++) {
        eqs.push([s.args[i], t.args[i]]);
      }
    } else {
      error();
    }
  }
}
function substitute(ty, subst) {
  return match(ty, {
    Var: ({ ref }) => match(ref, {
      Unbound: ({ id }) => {
        var _a;
        return (_a = subst.get(id)) != null ? _a : ty;
      },
      Generic: ({ id }) => {
        var _a;
        return (_a = subst.get(id)) != null ? _a : ty;
      },
      Link: ({ type }) => substitute(type, subst)
    }),
    Fun: ({ name, args }) => Type.Fun(name, args.map((arg) => substitute(arg, subst)))
  });
}
function fresh(level, name) {
  return Type.Var(TypeVar.fresh(level, name));
}

// src/infer/rewrite.ts
var TRS = {
  create: (parent) => new Map(parent != null ? parent : []),
  add: (trs, lhs, rhs) => {
    assert(lhs.variant === "Fun");
    if (trs.has(lhs.name)) {
      trs.get(lhs.name).push([lhs, rhs]);
    } else {
      trs.set(lhs.name, [[lhs, rhs]]);
    }
  },
  normalize,
  reduce,
  show: show2
};
function show2(trs) {
  return [...trs.values()].map((rules) => {
    return rules.map(([lhs, rhs]) => `${Type.show(lhs)} -> ${Type.show(rhs)}`).join("\n");
  }).join("\n");
}
function reduce(ty, trs) {
  return match(ty, {
    Var: () => ({ term: ty, changed: false }),
    Fun: ({ name, args }) => {
      var _a;
      const rules = (_a = trs.get(name)) != null ? _a : [];
      for (const [lhs, rhs] of rules) {
        const subst = /* @__PURE__ */ new Map();
        try {
          Type.unify(lhs, ty, subst);
        } catch (e) {
        }
        const reduced = reduce(Type.substitute(rhs, subst), trs);
        return { term: reduced.term, changed: true };
      }
      const newArgs = args.map((arg) => reduce(arg, trs));
      const changed = newArgs.some((arg) => arg.changed);
      const term = Type.Fun(name, newArgs.map((arg) => arg.term));
      return { term, changed };
    }
  });
}
function normalize(trs, ty, maxReductions = 1e4) {
  let term = ty;
  for (let i = 0; i < maxReductions; i++) {
    const { term: reduced, changed } = reduce(term, trs);
    term = reduced;
    if (!changed) {
      return term;
    }
  }
  throw new Error(`Possibly infinite type rewriting for '${Type.show(ty)}'`);
}

// src/infer/infer.ts
var TypeEnv = class {
  constructor(parent) {
    this.letLevel = 0;
    this.variables = new Scope(parent == null ? void 0 : parent.variables);
    this.modules = new Scope(parent == null ? void 0 : parent.modules);
    this.typeRules = TRS.create(parent == null ? void 0 : parent.typeRules);
  }
  child() {
    return new TypeEnv(this);
  }
  inferLet(mutable, name, value) {
    this.letLevel += 1;
    const ty = this.inferExpr(value);
    this.variables.declare(name, { mutable, ty });
    this.letLevel -= 1;
    return ty;
  }
  inferDecl(decl) {
    match(decl, {
      Let: (decl2) => this.inferLet(decl2.mutable, decl2.name, decl2.value),
      Fun: ({ name, args, body }) => {
        this.inferLet(false, name, Expr.Fun({ args, body }));
      },
      Type: ({ lhs, rhs }) => {
        TRS.add(this.typeRules, lhs, rhs);
      },
      Module: ({ name, decls }) => {
        const moduleEnv = this.child();
        this.modules.declare(name, moduleEnv);
        for (const decl2 of decls) {
          moduleEnv.inferDecl(decl2);
        }
      }
    });
  }
  inferStmt(stmt) {
    match(stmt, {
      Expr: ({ expr }) => {
        this.inferExpr(expr);
      },
      Let: ({ mutable, name, value }) => {
        this.inferLet(mutable, name, value);
      }
    });
  }
  inferExpr(expr) {
    if (expr.ty)
      return expr.ty;
    const ty = match(expr, {
      Literal: ({ literal }) => Type[literal.variant],
      Variable: (name) => this.variables.lookup(name).match({
        Some: ({ ty: ty2 }) => ty2,
        None: () => panic(`Variable ${name} not found`)
      }),
      Unary: ({ op, expr: expr2 }) => {
        const exprTy = this.inferExpr(expr2);
        const UNARY_OP_TYPE = {
          "!": Type.Bool,
          "-": Type.Num,
          "+": Type.Num
        };
        Type.unify(exprTy, UNARY_OP_TYPE[op]);
        return exprTy;
      },
      Binary: ({ lhs, op, rhs }) => {
        const lhsTy = this.inferExpr(lhs);
        const rhsTy = this.inferExpr(rhs);
        const BINARY_OP_TYPE = {
          "+": [Type.Num, Type.Num],
          "-": [Type.Num, Type.Num],
          "*": [Type.Num, Type.Num],
          "/": [Type.Num, Type.Num],
          "%": [Type.Num, Type.Num],
          "**": [Type.Num, Type.Num],
          "==": [Type.Var(TypeVar.Generic({ id: 0 })), Type.Var(TypeVar.Generic({ id: 0 }))],
          "!=": [Type.Var(TypeVar.Generic({ id: 0 })), Type.Var(TypeVar.Generic({ id: 0 }))],
          "<": [Type.Num, Type.Num],
          ">": [Type.Num, Type.Num],
          "<=": [Type.Num, Type.Num],
          ">=": [Type.Num, Type.Num],
          "&&": [Type.Bool, Type.Bool],
          "||": [Type.Bool, Type.Bool],
          "&": [Type.Num, Type.Num],
          "|": [Type.Num, Type.Num]
        };
        const [lhsExpected, rhsExpected] = BINARY_OP_TYPE[op];
        Type.unify(lhsTy, lhsExpected);
        Type.unify(rhsTy, rhsExpected);
        return lhsTy;
      },
      Block: ({ stmts, ret }) => {
        const blockEnv = this.child();
        for (const stmt of stmts) {
          blockEnv.inferStmt(stmt);
        }
        if (ret) {
          return blockEnv.inferExpr(ret);
        } else {
          return Type.Unit;
        }
      },
      Array: ({ elems }) => {
        const elemTy = Type.fresh(this.letLevel);
        for (const elem of elems) {
          Type.unify(elemTy, this.inferExpr(elem));
        }
        return Type.Array(elemTy);
      },
      Fun: ({ args, body }) => {
        const funEnv = this.child();
        const argTys = args.map(() => Type.fresh(this.letLevel));
        args.forEach((arg, i) => {
          funEnv.variables.declare(arg, {
            mutable: false,
            ty: argTys[i]
          });
        });
        const bodyTy = funEnv.inferExpr(body);
        return Type.Function(argTys, bodyTy);
      },
      Call: ({ fun, args }) => {
        const funTy = this.inferExpr(fun);
        const argTys = args.map((arg) => this.inferExpr(arg));
        const retTy = Type.fresh(this.letLevel);
        const expectedFunTy = Type.Function(argTys, retTy);
        Type.unify(funTy, expectedFunTy);
        return retTy;
      },
      If: ({ cond, then, otherwise }) => {
        Type.unify(this.inferExpr(cond), Type.Bool);
        const thenTy = this.inferExpr(then);
        const elseTy = this.inferExpr(otherwise);
        Type.unify(thenTy, elseTy);
        return thenTy;
      },
      Tuple: ({ elems }) => {
        const elemTys = elems.map((elem) => this.inferExpr(elem));
        return Type.Tuple(elemTys);
      },
      UseIn: ({ name, value, rhs }) => {
        const rhsEnv = this.child();
        rhsEnv.inferLet(false, name, value);
        return rhsEnv.inferExpr(rhs);
      }
    });
    expr.ty = ty;
    return ty;
  }
  show(indent = 0) {
    return "\n" + [
      "Variables:",
      this.variables.show(({ ty }) => Type.show(ty)),
      "Modules:",
      this.modules.show((env) => env.show(indent + 1))
    ].map((str) => "  ".repeat(indent) + str).join("\n");
  }
};

// src/misc/fs.ts
function createFileSystem() {
  return __async(this, null, function* () {
    var _a, _b;
    if (((_b = (_a = global == null ? void 0 : global.process) == null ? void 0 : _a.versions) == null ? void 0 : _b.node) != null) {
      return import("fs/promises").then(({ readFile }) => ({
        readFile: (path) => readFile(path, "utf8")
      }));
    } else {
      return {
        readFile: () => Promise.reject("Not implemented")
      };
    }
  });
}

// src/parse/token.ts
var Token = __spreadProps(__spreadValues({}, genConstructors(["Identifier", "Symbol", "Keyword", "EOF"])), {
  Literal: (value) => ({ variant: "Literal", value }),
  eq: (a, b) => matchMany([a, b], {
    "Literal Literal": (a2, b2) => Literal.eq(a2.value, b2.value),
    "Identifier Identifier": Object.is,
    "Symbol Symbol": Object.is,
    "Keyword Keyword": Object.is,
    "EOF EOF": () => true,
    _: () => false
  }),
  show: (self) => match(self, {
    Literal: ({ value }) => match(value, {
      Unit: () => "()",
      Bool: (value2) => value2 ? "true" : "false",
      Num: (value2) => value2.toString(),
      Str: (value2) => `"${value2}"`
    }),
    Identifier: (value) => value,
    Symbol: (value) => value,
    Keyword: (value) => value,
    EOF: () => "EOF"
  })
});
var Literal = __spreadProps(__spreadValues({}, genConstructors(["Bool", "Num", "Str"])), {
  Unit: Object.freeze({ variant: "Unit" }),
  eq: (a, b) => matchMany([a, b], {
    "Unit Unit": () => true,
    "Bool Bool": Object.is,
    "Num Num": Object.is,
    "Str Str": Object.is,
    _: () => false
  })
});
var keywords = [
  "module",
  "let",
  "mut",
  "fun",
  "if",
  "else",
  "match",
  "for",
  "while",
  "return",
  "break",
  "type",
  "enum",
  "struct",
  "interface",
  "extend",
  "use",
  "in"
];
var Keyword = {
  values: new Set(keywords),
  is: (value) => Keyword.values.has(value)
};

// src/parse/lex.ts
var lex = (source) => {
  let index = 0;
  let startIndex = 0;
  function peek(lookahead = 0) {
    return source[index + lookahead];
  }
  function next() {
    const c = peek();
    if (c === "\n" && shouldInsertSemicolon()) {
      tokens.push(Token.Symbol(";"));
    }
    index += 1;
    return c;
  }
  function matches(char) {
    const c = peek();
    if (c === char) {
      next();
      return true;
    }
    return false;
  }
  function isDigit(char) {
    return char >= "0" && char <= "9";
  }
  function isAlpha(char) {
    return char >= "a" && char <= "z" || char >= "A" && char <= "Z";
  }
  function isAlphaNumeric(char) {
    return isAlpha(char) || isDigit(char);
  }
  function isWhitespace(char) {
    return char === " " || char === "\r" || char === "	" || char === "\n";
  }
  function parseNum() {
    while (isDigit(peek())) {
      next();
    }
    if (peek() === "." && isDigit(peek(2))) {
      next();
      while (isDigit(peek())) {
        next();
      }
    }
    const num = Number(source.slice(startIndex, index));
    return Token.Literal(Literal.Num(num));
  }
  function isAtEnd() {
    return index >= source.length;
  }
  function parseStr() {
    while (peek() !== '"' && !isAtEnd()) {
      if (peek() === "\\") {
        next();
      }
      next();
    }
    if (isAtEnd()) {
      throw new Error("Unterminated string.");
    }
    next();
    const str = source.slice(startIndex + 1, index - 1);
    return Token.Literal(Literal.Str(str));
  }
  function parseIdentifierOrKeyword() {
    while (isAlphaNumeric(peek())) {
      next();
    }
    const identifier = source.slice(startIndex, index);
    switch (identifier) {
      case "true":
        return Token.Literal(Literal.Bool(true));
      case "false":
        return Token.Literal(Literal.Bool(false));
      default:
        return Keyword.is(identifier) ? Token.Keyword(identifier) : Token.Identifier(identifier);
    }
  }
  function shouldInsertSemicolon() {
    if (tokens.length > 0) {
      return match(tokens[tokens.length - 1], {
        Literal: (lit) => {
          switch (lit.value.variant) {
            case "Bool":
              return true;
            case "Num":
              return true;
            case "Str":
              return true;
            default:
              return false;
          }
        },
        Identifier: () => true,
        Symbol: (symb) => {
          switch (symb) {
            case ")":
              return true;
            case "]":
              return true;
            case "}":
              return true;
            case ">":
              return true;
            default:
              return false;
          }
        },
        Keyword: (kw) => {
          switch (kw) {
            case "return":
              return true;
            case "break":
              return true;
            default:
              return false;
          }
        },
        _: () => false
      });
    }
    return false;
  }
  function skipWhitespaces() {
    while (isWhitespace(peek())) {
      next();
    }
  }
  function iter() {
    skipWhitespaces();
    if (isAtEnd())
      return null;
    startIndex = index;
    const char = next();
    switch (char) {
      case "(":
        return Token.Symbol("(");
      case ")":
        return Token.Symbol(")");
      case "{":
        return Token.Symbol("{");
      case "}":
        return Token.Symbol("}");
      case "[":
        return Token.Symbol("[");
      case "]":
        return Token.Symbol("]");
      case ",":
        return Token.Symbol(",");
      case ";":
        return Token.Symbol(";");
      case "+":
        return Token.Symbol("+");
      case "-":
        return Token.Symbol(matches(">") ? "->" : "-");
      case "*":
        return Token.Symbol(matches("*") ? "**" : "*");
      case "/":
        return Token.Symbol("/");
      case "%":
        return Token.Symbol("%");
      case "**":
        return Token.Symbol("!");
      case "!":
        return Token.Symbol("!");
      case "=":
        return Token.Symbol(matches("=") ? "==" : matches(">") ? "=>" : "=");
      case "<":
        return Token.Symbol(matches("=") ? "<=" : "<");
      case ">":
        return Token.Symbol(matches("=") ? ">=" : ">");
      case "&":
        return Token.Symbol(matches("&") ? "&&" : "&");
      case "|":
        return Token.Symbol(matches("|") ? "||" : "|");
      case ":":
        return Token.Symbol(matches(":") ? "::" : ":");
      case '"':
        return parseStr();
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
  const tokens = [];
  while (true) {
    const token = iter();
    if (token === null)
      return tokens;
    token.loc = { start: startIndex, end: index };
    tokens.push(token);
  }
};

// src/ast/sweet/decl.ts
var Decl = __spreadProps(__spreadValues({}, genConstructors(["Let", "Fun", "Module"])), {
  Type: (lhs, rhs) => {
    const lhsVars = Type.vars(lhs);
    const newRhs = Type.rewrite(rhs, (ty) => {
      if (ty.variant === "Var" && ty.ref.variant === "Unbound" && ty.ref.name != null && lhsVars.has(ty.ref.name)) {
        return Type.Var(TypeVar.Unbound({
          id: lhsVars.get(ty.ref.name),
          name: ty.ref.name,
          level: ty.ref.level
        }));
      }
      return ty;
    });
    return { variant: "Type", lhs, rhs: newRhs };
  }
});

// src/ast/sweet/stmt.ts
var Stmt = __spreadProps(__spreadValues({}, genConstructors(["Let"])), {
  Expr: (expr) => ({ variant: "Expr", expr })
});

// src/misc/strings.ts
function isUpperCase(str) {
  return str.toUpperCase() === str;
}

// src/parse/parse.ts
var parse = (tokens) => {
  let index = 0;
  let letLevel = 0;
  function isAtEnd() {
    return index >= tokens.length;
  }
  function peek(lookahead = 0) {
    if (index + lookahead >= tokens.length) {
      return Token.EOF({});
    }
    return tokens[index + lookahead];
  }
  function check(...tokens2) {
    const t = peek();
    for (const token of tokens2) {
      if (Token.eq(token, t)) {
        return true;
      }
    }
    return false;
  }
  function matches(...tokens2) {
    for (const token of tokens2) {
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
  function consume(token, error = `Expected '${Token.show(token)}'`) {
    if (check(token)) {
      next();
    } else {
      throw new Error(error);
    }
  }
  function consumeIfPresent(token) {
    if (check(token)) {
      next();
    }
  }
  function identifier() {
    return match(peek(), {
      Identifier: (name) => {
        next();
        return name;
      },
      _: () => {
        throw new Error("Expected identifier");
      }
    });
  }
  function sepBy(rule, separator, closingToken = Token.Symbol(")")) {
    let terms = [];
    if (!check(closingToken)) {
      do {
        terms.push(rule());
      } while (matches(separator));
    }
    consumeIfPresent(Token.Symbol(";"));
    return terms;
  }
  function commas(rule) {
    return sepBy(rule, Token.Symbol(","));
  }
  function binaryExpr(p, ops) {
    let lhs = p();
    while (true) {
      const token = peek();
      if (token.variant === "Symbol" && ops.includes(token.$value)) {
        next();
        const rhs = p();
        lhs = Expr.Binary({ lhs, op: token.$value, rhs });
      } else {
        break;
      }
    }
    return lhs;
  }
  function attempt(p) {
    const start = index;
    try {
      return Some(p());
    } catch (e) {
      index = start;
      return None;
    }
  }
  function type() {
    return funType();
  }
  function funType() {
    const args = [];
    if (matches(Token.Symbol("("))) {
      do {
        args.push(type());
      } while (matches(Token.Symbol(",")));
      consume(Token.Symbol(")"));
    } else {
      args.push(arrayType());
    }
    if (matches(Token.Symbol("->"))) {
      const ret = type();
      return Type.Function(args, ret);
    } else {
      return Type.Tuple(args);
    }
  }
  function arrayType() {
    let lhs = typeList();
    while (matches(Token.Symbol("["))) {
      consume(Token.Symbol("]"));
      lhs = Type.Array(lhs);
    }
    return lhs;
  }
  function typeList() {
    if (matches(Token.Symbol("["))) {
      if (matches(Token.Symbol("]"))) {
        return Type.Nil;
      }
      const types = commas(type);
      consume(Token.Symbol("]"));
      return Type.list(types);
    }
    return consType();
  }
  function consType() {
    const lhs = primaryType();
    if (matches(Token.Symbol("::"))) {
      const rhs = type();
      return Type.Cons(lhs, rhs);
    }
    return lhs;
  }
  function primaryType() {
    const token = peek();
    if (token.variant === "Identifier") {
      if (isUpperCase(token.$value[0])) {
        next();
        return constructorType(token.$value);
      } else {
        next();
        return varType(token.$value);
      }
    }
    return panic("Expected type");
  }
  function constructorType(name) {
    const args = [];
    if (matches(Token.Symbol("<"))) {
      do {
        args.push(type());
      } while (matches(Token.Symbol(",")));
      consume(Token.Symbol(">"));
    }
    return Type.Fun(name, args);
  }
  function varType(name) {
    return Type.Var(TypeVar.fresh(letLevel, name));
  }
  function expr() {
    const token = peek();
    if (token.variant === "Keyword") {
      switch (token.$value) {
        case "if":
          next();
          return ifExpr();
        case "use":
          next();
          return useInExpr();
      }
    }
    return funExpr();
  }
  function funExpr() {
    return attempt(() => {
      let args;
      const token = peek();
      if (token.variant === "Identifier") {
        next();
        args = [token.$value];
      } else if (token.variant === "Symbol" && token.$value === "(") {
        next();
        args = commas(identifier);
        consume(Token.Symbol(")"));
      } else {
        throw "fail";
      }
      consume(Token.Symbol("->"));
      const body = expr();
      return Expr.Fun({ args, body });
    }).orDefault(equalityExpr);
  }
  function useInExpr() {
    letLevel += 1;
    const name = identifier();
    consume(Token.Symbol("="));
    const value = expr();
    consume(Token.Keyword("in"));
    const rhs = expr();
    letLevel -= 1;
    return Expr.UseIn({ name, value, rhs });
  }
  function ifExpr() {
    const cond = expr();
    const then = blockExpr();
    consume(Token.Keyword("else"));
    const otherwise = blockExpr();
    return Expr.If({ cond, then, otherwise });
  }
  function equalityExpr() {
    return binaryExpr(comparisonExpr, ["==", "!="]);
  }
  function comparisonExpr() {
    return binaryExpr(additionExpr, ["<", "<=", ">", ">="]);
  }
  function additionExpr() {
    return binaryExpr(multiplicationExpr, ["+", "-"]);
  }
  function multiplicationExpr() {
    return binaryExpr(powExpr, ["*", "/", "%"]);
  }
  function powExpr() {
    return binaryExpr(unaryExpr, ["**"]);
  }
  function unaryExpr() {
    const token = peek();
    if (token.variant === "Symbol" && ["-", "+", "!"].includes(token.$value)) {
      next();
      const expr2 = callExpr();
      return Expr.Unary({ op: token.$value, expr: expr2 });
    }
    return callExpr();
  }
  function callExpr() {
    const lhs = primaryExpr();
    if (matches(Token.Symbol("("))) {
      const args = commas(expr);
      consume(Token.Symbol(")"));
      return Expr.Call({ fun: lhs, args });
    }
    return lhs;
  }
  function primaryExpr() {
    return match(peek(), {
      Literal: ({ value }) => {
        next();
        return Expr.Literal(value);
      },
      Identifier: (name) => {
        next();
        return Expr.Variable(name);
      },
      Symbol: (symb) => {
        switch (symb) {
          case "(":
            return tupleExpr();
          case "{":
            return blockExpr();
          case "[":
            return arrayExpr();
          default:
            throw new Error(`Unexpected symbol '${symb}'`);
        }
      },
      _: () => {
        throw new Error("Expected expression");
      }
    });
  }
  function tupleExpr() {
    consume(Token.Symbol("("));
    const elems = commas(expr);
    consume(Token.Symbol(")"));
    switch (elems.length) {
      case 0:
        return Expr.Literal(Literal.Unit);
      case 1:
        return elems[0];
      default:
        return Expr.Tuple({ elems });
    }
  }
  function arrayExpr() {
    consume(Token.Symbol("["));
    const elems = sepBy(expr, Token.Symbol(","), Token.Symbol("]"));
    consume(Token.Symbol("]"));
    return Expr.Array({ elems });
  }
  function blockExpr() {
    consume(Token.Symbol("{"));
    const stmts = [];
    while (!matches(Token.Symbol("}"))) {
      stmts.push(stmt());
    }
    if (stmts.length > 0) {
      const last = stmts[stmts.length - 1];
      if (last.variant === "Expr") {
        stmts.pop();
        return Expr.Block({ stmts, ret: last.expr });
      }
    }
    return Expr.Block({ stmts });
  }
  function stmt() {
    return match(peek(), {
      Keyword: (keyword) => {
        switch (keyword) {
          case "let":
          case "mut":
            next();
            return letStmt(keyword === "mut");
          default:
            throw new Error(`Unexpected keyword '${keyword}'`);
        }
      },
      _: () => exprStmt()
    });
  }
  function letStmt(mutable) {
    letLevel += 1;
    const name = identifier();
    consume(Token.Symbol("="));
    const value = expr();
    consumeIfPresent(Token.Symbol(";"));
    letLevel -= 1;
    return Stmt.Let({ mutable, name, value });
  }
  function exprStmt() {
    const exp = expr();
    consumeIfPresent(Token.Symbol(";"));
    return Stmt.Expr(exp);
  }
  function decl() {
    const token = peek();
    if (token.variant === "Keyword") {
      switch (token.$value) {
        case "let":
          next();
          return letDecl(false);
        case "mut":
          next();
          return letDecl(true);
        case "fun":
          next();
          return funDecl();
        case "type":
          next();
          return typeDecl();
        case "module":
          next();
          return moduleDecl();
        default:
          break;
      }
    }
    return panic(`Unexpected token '${Token.show(token)}'`);
  }
  function letDecl(mutable) {
    letLevel += 1;
    const name = identifier();
    consume(Token.Symbol("="));
    const value = expr();
    consumeIfPresent(Token.Symbol(";"));
    letLevel -= 1;
    return Decl.Let({ mutable, name, value });
  }
  function funDecl() {
    letLevel += 1;
    const name = identifier();
    consume(Token.Symbol("("));
    const args = commas(identifier);
    consume(Token.Symbol(")"));
    const body = expr();
    consumeIfPresent(Token.Symbol(";"));
    letLevel -= 1;
    return Decl.Fun({ name, args, body });
  }
  function typeDecl() {
    const lhs = type();
    consume(Token.Symbol("="));
    const rhs = type();
    consumeIfPresent(Token.Symbol(";"));
    return Decl.Type(lhs, rhs);
  }
  function moduleDecl() {
    consumeIfPresent(Token.Keyword("module"));
    const name = identifier();
    const decls = [];
    consume(Token.Symbol("{"));
    while (!matches(Token.Symbol("}"))) {
      decls.push(decl());
    }
    consumeIfPresent(Token.Symbol(";"));
    return Decl.Module({ name, decls });
  }
  function topModule() {
    const decls = [];
    while (!isAtEnd()) {
      decls.push(decl());
    }
    return { name: "top", decls };
  }
  return { expr, stmt, decl, module: moduleDecl, topModule };
};

// src/main.ts
function main() {
  return __async(this, null, function* () {
    const fs = yield createFileSystem();
    const source = yield fs.readFile("./examples/lab.poy");
    const tokens = lex(source);
    const topModule = parse(tokens).topModule();
    const env = new TypeEnv();
    for (const decl of topModule.decls) {
      env.inferDecl(decl);
    }
    console.log(env.show());
    console.log(TRS.show(env.typeRules));
    console.log(Type.show(
      TRS.normalize(
        env.typeRules,
        Type.Fun("Query", [])
      )
    ));
  });
}
main();
