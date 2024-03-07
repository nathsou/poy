import { DataType, VariantOf, constructors, match } from 'itsamatch';
import { EnumDecl, EnumVariant } from '../../ast/sweet/decl';
import { Expr } from '../../ast/sweet/expr';
import { Pattern } from '../../ast/sweet/pattern';
import { Stmt } from '../../ast/sweet/stmt';
import { config } from '../../config';
import { Type } from '../../infer/type';
import { Maybe, None, Some } from '../../misc/maybe';
import { setIntersectionMut } from '../../misc/sets';
import { Constructors, Impl, Show } from '../../misc/traits';
import {
  array,
  assert,
  block,
  count,
  first,
  gen,
  indices,
  last,
  map,
  panic,
  proj,
  range,
  repeat,
  sum,
  swapMut,
  todo,
} from '../../misc/utils';
import { Literal } from '../../parse/token';

// Based on Compiling Pattern Matching to Good Decision Trees
// http://moscova.inria.fr/~maranget/papers/ml05e-maranget.pdf

export type Occurrence = OccurrenceComponent[];

export const Occurrence = {
  show: (occ: Occurrence): string => {
    if (occ.length === 0) return '';
    return occ.map(OccurrenceComponent.show).join('');
  },
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
} satisfies Impl<Show<Occurrence>>;

export type OccurrenceComponent = DataType<{
  Variable: string;
  Index: number;
  Field: string;
}>;

export const OccurrenceComponent = {
  ...constructors<OccurrenceComponent>().get('Variable', 'Index', 'Field'),
  show: (occ: OccurrenceComponent): string =>
    match(occ, {
      Variable: name => name,
      Index: index => `[${index}]`,
      Field: field => `.${field}`,
    }),
} satisfies Impl<Constructors<OccurrenceComponent> & Show<OccurrenceComponent>>;

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
            then_: DecisionTree.toExpr(subject, head.dt, cases, retTy),
            else_:
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
        return `Switch(${Occurrence.show(occurrence)}, [${testsStr}])`;
      },
    });
  },
} satisfies Impl<Constructors<DecisionTree> & Show<DecisionTree>>;

type ClauseMatrixConstructor = {
  rows: Pattern[][];
  actions: number[];
};

type SignatureCheckFn = (heads: Map<string, { arity: number; meta?: CtorMetadata }>) => boolean;

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
  }

  public heads(columnIndex: number): Map<string, { arity: number; meta?: CtorMetadata }> {
    const heads = new Map<string, { arity: number; meta?: CtorMetadata }>();

    for (const row of this.rows) {
      const head = row[columnIndex];
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

  // P/ω
  public withoutColumn(columnIndex: number): ClauseMatrix {
    return new ClauseMatrix({
      rows: this.rows.map(row => row.filter((_, i) => i !== columnIndex)),
      actions: this.actions,
    });
  }

  public isRowUseless(rowIndex: number): boolean {
    for (let col = 0; col < this.width; col += 1) {
      if (!Pattern.isRedundant(rowIndex, this.getColumn(col))) {
        return false;
      }
    }

    return true;
  }

  // Compiling Pattern Matching to Good Decision Trees, section 7.1, proposition 2
  public isPatternNeeded(row: number, col: number): boolean {
    if (!Pattern.isAnyOrVariable(this.rows[row][col])) return true;
    return this.withoutColumn(col).isRowUseless(row);
  }

  public compile(
    occurrences: Occurrence[],
    isSignature: SignatureCheckFn,
    selectColumn: (matrix: ClauseMatrix) => number = pbaHeuristic,
  ): DecisionTree {
    if (this.height === 0) {
      if (config.enforceExhaustiveMatch) {
        panic('Non-exhaustive match expression.');
      }

      return DecisionTree.Fail();
    }

    if (this.rows[0].every(p => Pattern.isAnyOrVariable(p))) {
      return DecisionTree.Leaf({ action: this.actions[0] });
    }

    const columnIndex = selectColumn(this);
    this.swap(0, columnIndex);
    swapMut(occurrences, 0, columnIndex);
    const heads = this.heads(0);
    const tests: VariantOf<DecisionTree, 'Switch'>['tests'] = [];

    for (const [ctor, { arity, meta }] of heads) {
      const specialized = this.specialized(ctor, arity);
      const subOccurrences = [
        ...gen(arity, i => [
          ...occurrences[0],
          block(() => {
            if (meta == null) {
              return OccurrenceComponent.Index(i);
            }

            return match(meta, {
              Ctor: () => OccurrenceComponent.Index(i),
              Variant: ({ enumDecl }) => {
                const variant = enumDecl.variants.find(v => v.name === ctor);
                assert(variant != null);
                return match(variant, {
                  Empty: () => panic('Cannot destructure empty variant'),
                  Tuple: () => OccurrenceComponent.Field(EnumVariant.formatPositionalArg(i)),
                  Struct: () => todo('Struct variants not supported yet'),
                });
              },
            });
          }),
        ]),
        ...occurrences.slice(1),
      ];
      const Ak = specialized.compile(subOccurrences, isSignature, selectColumn);

      tests.push({ ctor, meta, dt: Ak });
    }

    if (!isSignature(heads)) {
      const subOccurrences = occurrences.slice(1);
      const Ad = this.defaulted().compile(subOccurrences, isSignature, selectColumn);

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

// returns the selected columns indices
type ColumnSelectionHeuristic = (matrix: ClauseMatrix) => number[];

function heuristicFromScoreFn(
  scoreFn: (matrix: ClauseMatrix, columnIndex: number) => number,
): ColumnSelectionHeuristic {
  return matrix => {
    const scores = array<number>();
    let maxScore = -Infinity;

    for (let i = 0; i < matrix.width; i += 1) {
      const score = scoreFn(matrix, i);
      maxScore = Math.max(maxScore, score);
      scores.push(score);
    }

    return indices(scores, score => score === maxScore);
  };
}

const heuristics = {
  // p
  neededPrefix: heuristicFromScoreFn((matrix, col) => {
    const allNeeded = (upToRow: number): boolean => {
      for (let row = 0; row <= upToRow; row += 1) {
        if (!matrix.isPatternNeeded(row, col)) return false;
      }

      return true;
    };

    for (let row = matrix.height - 1; row >= 0; row -= 1) {
      if (allNeeded(row)) return row;
    }

    return 0;
  }),
  // b
  smallBranchingFactor: heuristicFromScoreFn((matrix, col) => {
    // matrix.heads(col) is required to be a signature
    return -matrix.heads(col).size;
  }),
  // a
  arity: heuristicFromScoreFn((matrix, col) => {
    return -sum(map(matrix.heads(col).values(), proj('arity')));
  }),
} satisfies Record<string, ColumnSelectionHeuristic>;

function combineHeuristics(heuristics: ColumnSelectionHeuristic[]) {
  return (matrix: ClauseMatrix): number => {
    const selected = new Set(range(0, matrix.width));

    for (const heuristic of heuristics) {
      if (selected.size === 1) break;
      setIntersectionMut(selected, heuristic(matrix));
    }

    // return the first suitable column
    return first(selected);
  };
}

const pbaHeuristic = combineHeuristics([
  heuristics.neededPrefix, // p
  heuristics.smallBranchingFactor, // b
  heuristics.arity, // a
]);
