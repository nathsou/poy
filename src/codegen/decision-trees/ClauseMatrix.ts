import { DataType, VariantOf, genConstructors, match } from 'itsamatch';
import { Pattern } from '../../ast/sweet/pattern';
import { gen, repeat, swapMut } from '../../misc/utils';
import { Maybe, None, Some } from '../../misc/maybe';

// Based on Compiling Pattern Matching to Good Decision Trees
// http://moscova.inria.fr/~maranget/papers/ml05e-maranget.pdf

export type Occurrence = number[];

export type DecisionTree = DataType<{
    Leaf: { action: number },
    Fail: {},
    Switch: {
        occurrence: Occurrence,
        tests: { ctor: string, meta?: string, dt: DecisionTree }[],
    },
}>;

export function showDecisionTree(dt: DecisionTree): string {
    return match(dt, {
        Leaf: ({ action }) => `Leaf(${action})`,
        Fail: () => 'Fail',
        Switch: ({ occurrence, tests }) => {
            const testsStr = tests.map(({ ctor, dt }) => `${ctor} => ${showDecisionTree(dt)}`).join(', ');
            return `Switch(${occurrence}, [${testsStr}])`;
        },
    });
}

export const DecisionTree = {
    ...genConstructors<DecisionTree>(['Leaf', 'Fail', 'Switch']),
};

type ClauseMatrixConstructor = {
    rows: Pattern[][],
    actions: number[],
};

export class ClauseMatrix {
    width: number;
    height: number;
    rows: Pattern[][];
    actions: number[];

    constructor(args: ClauseMatrixConstructor) {
        this.rows = args.rows;
        this.actions = args.actions;
        this.height = args.rows.length;
        this.width = args.rows.length > 0 ? args.rows[0].length : 0;
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

    public heads(column: number): Map<string, { arity: number, meta?: string }> {
        const heads = new Map<string, { arity: number, meta?: string }>();

        for (const row of this.rows) {
            const head = row[column];

            if (head.variant === 'Ctor') {
                heads.set(head.name, { arity: head.args.length, meta: head.meta });
            }
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
            });
        }

        return this.build(defaultRow);
    }

    public compile(
        occurrences: Occurrence[],
        selectColumn: (matrix: ClauseMatrix) => number,
        isSignature: (heads: Map<string, { arity: number, meta?: string }>) => boolean,
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
                ...gen(arity, i => [...occurrences[0], i]),
                ...occurrences.slice(1),
            ];
            const Ak = specialized.compile(subOccurrences, selectColumn, isSignature);
            tests.push({ ctor, meta, dt: Ak });
        }

        if (!isSignature(heads)) {
            const subOccurrences = occurrences.slice(1);
            const Ad = this.defaulted().compile(subOccurrences, selectColumn, isSignature);
            tests.push({ ctor: '_', dt: Ad });
        }

        return DecisionTree.Switch({
            occurrence: occurrences[0],
            tests,
        });
    }
}
