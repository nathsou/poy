import { DataType, VariantOf, constructors, match } from 'itsamatch';
import { Pattern } from '../../ast/sweet/pattern';
import { Maybe, None, Some } from '../../misc/maybe';
import { assert, count, gen, last, panic, repeat, swapMut } from '../../misc/utils';
import { EnumDecl, EnumVariant } from '../../ast/sweet/decl';
import { Constructors, Impl, Show } from '../../misc/traits';
import { Expr } from '../../ast/sweet/expr';
import { Type } from '../../infer/type';
import { Stmt } from '../../ast/sweet/stmt';
import { Literal } from '../../parse/token';

// Based on Compiling Pattern Matching to Good Decision Trees
// http://moscova.inria.fr/~maranget/papers/ml05e-maranget.pdf

export type Occurrence = OccurrenceComponent[];

export const Occurrence = {
  toExpr: (occ: Occurrence, subject: Expr): Expr => {
    if (occ.length === 0) return subject;

    const [head, ...tail] = occ;

    return Occurrence.toExpr(
      tail,
      match(head, {
        Variable: name =>
          Expr.Variable({
            name,
            typeParams: [],
            ty: Type.DontCare,
          }),
        Index: index =>
          Expr.TupleAccess({
            lhs: subject,
            index,
            ty: Type.DontCare,
          }),
        Field: field =>
          Expr.FieldAccess({
            lhs: subject,
            field,
            isCalled: false,
            isNative: false,
            typeParams: [],
            ty: Type.DontCare,
          }),
      }),
    );
  },
};

export type OccurrenceComponent = DataType<{
  Variable: string;
  Index: number;
  Field: string;
}>;

export const OccurrenceComponent = constructors<OccurrenceComponent>().get(
  'Variable',
  'Index',
  'Field',
);

export type DecisionTree = DataType<{
  Leaf: { action: number };
  Fail: {};
  Switch: {
    occurrence: Occurrence;
    tests: { ctor: string; meta?: CtorMetadata; dt: DecisionTree }[];
  };
}>;

export type CtorMetadata = DataType<{
  Ctor: { kind?: string };
  Variant: { enumDecl: EnumDecl };
}>;

export const CtorMetadata = constructors<CtorMetadata>().get('Ctor', 'Variant');

export const DecisionTree = {
  ...constructors<DecisionTree>().get('Leaf', 'Fail', 'Switch'),
  totalTestsCount(dt: DecisionTree): number {
    return match(dt, {
      Leaf: () => 0,
      Fail: () => 0,
      Switch: ({ tests }) =>
        count(tests, t => t.ctor !== '_') +
        tests.reduce((acc, { dt }) => acc + DecisionTree.totalTestsCount(dt), 0),
    });
  },
  getPatternTest: (lhs: Expr, ctor: string, meta: CtorMetadata | undefined): Expr | null => {
    if (meta) {
      return match(meta, {
        Ctor: ({ kind }) => {
          switch (kind) {
            case 'Unit':
              return Expr.Binary({
                op: '==',
                lhs,
                rhs: {
                  ...Expr.Literal(Literal.Unit),
                  ty: Type.Unit,
                },
                ty: Type.Unit,
              });
            case 'Bool':
              if (ctor === 'true') {
                return lhs;
              } else {
                return Expr.Unary({
                  op: '!',
                  expr: lhs,
                  ty: Type.Bool,
                });
              }
            case 'Num':
              return Expr.Binary({
                op: '==',
                lhs,
                rhs: {
                  ...Expr.Literal(Literal.Num(Number(ctor))),
                  ty: Type.Num,
                },
                ty: Type.Num,
              });
            case 'Str':
              return Expr.Binary({
                op: '==',
                lhs,
                rhs: {
                  ...Expr.Literal(Literal.Str(ctor)),
                  ty: Type.Str,
                },
                ty: Type.Str,
              });
            case 'Tuple':
              // the type checker ensures that the type of the lhs is a tuple of the same length
              return null;
          }

          return panic(`Unknown ctor: ${kind}(${ctor})`);
        },
        Variant: ({ enumDecl }) => {
          const variant = enumDecl.variants.find(v => v.name === ctor);
          assert(variant != null);
          const argCount = EnumVariant.countArguments(variant);

          return Expr.Binary({
            op: '==',
            lhs:
              argCount === 0
                ? lhs
                : Expr.FieldAccess({
                    lhs,
                    field: EnumVariant.TAG,
                    isCalled: false,
                    isNative: false,
                    typeParams: [],
                    ty: Type.Str,
                  }),
            rhs: {
              ...Expr.Literal(Literal.Str(ctor)),
              ty: Type.Str,
            },
            ty: Type.Bool,
          });
        },
      });
    }

    return null;
  },
  toExpr: (
    subject: Expr,
    dt: DecisionTree,
    cases: VariantOf<Expr, 'Match'>['cases'],
    retTy: Type,
  ): Expr => {
    return match(dt, {
      Leaf: ({ action }) => {
        const { pattern, body } = cases[action];
        const { vars, shared } = Pattern.variableOccurrences(
          pattern,
          subject.variant === 'Variable'
            ? {
                name: subject.name,
                alreadyDeclared: true,
              }
            : undefined,
        );

        if (vars.size === 0) {
          return body;
        }

        const bindings = [...shared.entries()].map(([name, occ]) => ({
          name,
          value: Occurrence.toExpr(occ, subject),
        }));

        return Expr.Block({
          stmts: bindings.map(({ name, value }) =>
            Stmt.Let({
              lhs: Pattern.Variable(name),
              value,
              attrs: {},
              mutable: false,
              static: false,
              pub: false,
            }),
          ),
          ty: retTy,
          ret: body,
        });
      },
      Switch: ({ occurrence, tests }) => {
        if (tests.length === 0) {
          return DecisionTree.toExpr(subject, DecisionTree.Fail(), cases, retTy);
        }

        const [head, ...tail] = tests;

        if (head.ctor === '_') {
          return DecisionTree.toExpr(subject, head.dt, cases, retTy);
        }

        const lhs = Occurrence.toExpr(occurrence, subject);
        const cond = DecisionTree.getPatternTest(lhs, head.ctor, head.meta);

        if (cond == null) {
          return DecisionTree.toExpr(subject, head.dt, cases, retTy);
        } else {
          return Expr.If({
            cond,
            then: DecisionTree.toExpr(subject, head.dt, cases, retTy),
            otherwise:
              tail.length > 0
                ? DecisionTree.toExpr(
                    subject,
                    DecisionTree.Switch({
                      occurrence,
                      tests: tail,
                    }),
                    cases,
                    retTy,
                  )
                : undefined,
            ty: retTy,
          });
        }
      },
      Fail: () => ({
        ...Expr.Literal(Literal.Str('Match fail')),
        ty: Type.Str,
      }),
    });
  },
  show: (dt: DecisionTree): string => {
    return match(dt, {
      Leaf: ({ action }) => `Leaf(${action})`,
      Fail: () => 'Fail',
      Switch: ({ occurrence, tests }) => {
        const testsStr = tests
          .map(({ ctor, dt }) => `${ctor} => ${DecisionTree.show(dt)}`)
          .join(', ');
        return `Switch(${occurrence}, [${testsStr}])`;
      },
    });
  },
} satisfies Impl<Constructors<DecisionTree> & Show<DecisionTree>>;

type ClauseMatrixConstructor = {
  rows: Pattern[][];
  actions: number[];
};

export class ClauseMatrix {
  width: number;
  height: number;
  rows: Pattern[][];
  actions: number[];

  constructor({ rows, actions }: ClauseMatrixConstructor) {
    this.rows = rows;
    this.actions = actions;
    this.height = rows.length;
    this.width = rows.length > 0 ? rows[0].length : 0;
  }

  public getColumn(index: number): Pattern[] {
    return this.rows.map(row => row[index]);
  }

  public swap(i: number, j: number): void {
    this.rows.forEach(row => {
      swapMut(row, i, j);
    });

    swapMut(this.actions, i, j);
  }

  public heads(column: number): Map<string, { arity: number; meta?: CtorMetadata }> {
    const heads = new Map<string, { arity: number; meta?: CtorMetadata }>();

    for (const row of this.rows) {
      const head = row[column];
      match(head, {
        Ctor: ({ args, meta, name }) => {
          heads.set(name, {
            arity: args.length,
            meta: CtorMetadata.Ctor({ kind: meta }),
          });
        },
        Variant: ({ enumName, variantName, args, resolvedEnum }) => {
          assert(resolvedEnum != null, `unresolved enum ${enumName}`);
          heads.set(variantName, {
            arity: args.length,
            meta: CtorMetadata.Variant({ enumDecl: resolvedEnum }),
          });
        },
        _: () => {},
      });
    }

    return heads;
  }

  private build(transformRow: (row: Pattern[]) => Maybe<Pattern[]>): ClauseMatrix {
    const rows = this.rows.map(transformRow);
    const actions = Maybe.keepSome(rows.map((row, i) => row.map(() => this.actions[i])));

    return new ClauseMatrix({
      rows: Maybe.keepSome(rows),
      actions,
    });
  }

  private specialized(ctor: string, arity: number): ClauseMatrix {
    function specializeRow(row: Pattern[]): Maybe<Pattern[]> {
      const [p, ...ps] = row;
      switch (p.variant) {
        case 'Any':
        case 'Variable':
          return Some([...repeat(Pattern.Any, arity), ...ps]);
        case 'Ctor':
          if (p.name === ctor) {
            return Some([...p.args, ...ps]);
          }

          return None;
        case 'Variant':
          if (p.variantName === ctor) {
            return Some([...p.args, ...ps]);
          }

          return None;
        case 'Struct':
          return Some([...repeat(Pattern.Any, arity), ...ps]);
      }
    }

    return this.build(specializeRow);
  }

  private defaulted(): ClauseMatrix {
    function defaultRow(row: Pattern[]): Maybe<Pattern[]> {
      const [p, ...ps] = row;
      return match(p, {
        Any: () => Some(ps),
        Variable: () => Some(ps),
        Ctor: () => None,
        Variant: () => None,
        Struct: () => Some(ps),
      });
    }

    return this.build(defaultRow);
  }

  public compile(
    occurrences: Occurrence[],
    selectColumn: (matrix: ClauseMatrix) => number,
    isSignature: (heads: Map<string, { arity: number; meta?: CtorMetadata }>) => boolean,
  ): DecisionTree {
    if (this.height === 0) {
      return DecisionTree.Fail();
    }

    if (this.rows[0].every(p => p.variant === 'Any')) {
      return DecisionTree.Leaf({ action: this.actions[0] });
    }

    const colIndex = selectColumn(this);
    this.swap(0, colIndex);
    swapMut(occurrences, 0, colIndex);
    const heads = this.heads(0);
    const tests: VariantOf<DecisionTree, 'Switch'>['tests'] = [];

    for (const [ctor, { arity, meta }] of heads) {
      const specialized = this.specialized(ctor, arity);
      const subOccurrences = [
        ...gen(arity, i => [...occurrences[0], OccurrenceComponent.Index(i)]),
        ...occurrences.slice(1),
      ];
      const Ak = specialized.compile(subOccurrences, selectColumn, isSignature);

      tests.push({ ctor, meta, dt: Ak });
    }

    if (!isSignature(heads)) {
      const subOccurrences = occurrences.slice(1);
      const Ad = this.defaulted().compile(subOccurrences, selectColumn, isSignature);

      tests.push({ ctor: '_', dt: Ad });
    } else if (tests.length > 1) {
      // if all cases are handled (i.e. it's a signature)
      // then the last test does not need to be checked
      last(tests).ctor = '_';
    }

    return DecisionTree.Switch({
      occurrence: occurrences[0],
      tests,
    });
  }
}
