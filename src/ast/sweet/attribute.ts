import { assert, zip } from '../../misc/utils';
import { Literal } from '../../parse/token';

export type Attribute = { name: string; args: Literal[] };

export type Attributes = Partial<{
    as: string;
}>;

export type AttributeName = keyof Attributes;

type ParsedKinds<K extends readonly Literal['variant'][]> = {
    [I in keyof K]: {
        Str: string;
        Num: number;
        Bool: boolean;
        Unit: undefined;
    }[K[I]];
};

function parseArgs<const Ks extends readonly Literal['variant'][]>(
    name: string,
    kinds: Ks,
    args: Literal[],
): ParsedKinds<Ks> {
    assert(
        args.length === kinds.length,
        () =>
            `Expected ${kinds.length} arguments in '${name}' attribute but got ${args.length}`,
    );

    return zip(args, kinds).map(([arg, kind]) => {
        assert(
            arg.variant === kind,
            () =>
                `Expected a ${kind} literal in '${name}' attribute but got a ${arg.variant}`,
        );

        if (arg.variant === 'Unit') {
            return undefined;
        }

        return arg.$value;
    }) as unknown as ParsedKinds<Ks>;
}

export const Attributes = {
    empty: (): Attributes => ({}),
    get: (attributes: Attribute[], name: string): Attribute | undefined => {
        return attributes.find(attribute => attribute.name === name);
    },
    parse: (attributes: Attribute[]): Attributes => {
        const parsed: Attributes = {};

        for (const attribute of attributes) {
            switch (attribute.name) {
                case 'as': {
                    parsed.as = parseArgs('as', ['Str'], attribute.args)[0];
                    break;
                }
                case 'new': {
                    parsed.as =
                        'new ' + parseArgs('new', ['Str'], attribute.args)[0];
                    break;
                }
                default: {
                    throw new Error(`Unknown attribute '${attribute.name}'`);
                }
            }
        }

        return parsed;
    },
    validate: (attributes: Attributes, allowed: AttributeName[]): void => {
        for (const name of Object.keys(attributes)) {
            if (!allowed.includes(name as AttributeName)) {
                throw new Error(
                    `Attribute '${name}' is not allowed in this context`,
                );
            }
        }
    },
};
