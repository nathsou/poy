import { DataType, genConstructors, match } from "itsamatch";
import { Type, TypeVar } from "../../infer/type";
import { From, Impl, Show } from "../../misc/traits";

export type TSType = DataType<{
    Any: {},
    Void: {},
    Never: {},
    Null: {},
    Undefined: {},
    Boolean: {},
    Number: {},
    String: {},
    Variable: { name: string },
    Array: { element: TSType },
    Spread: { ty: TSType },
    Tuple: { elements: TSType[] },
    Union: { types: TSType[] },
    Intersection: { types: TSType[] },
    Function: { args: TSType[], ret: TSType },
    Record: { fields: { [key: string]: TSType } },
    Literal: { value: string },
    Ref: { name: string, args: TSType[] },
}>;

export const TSType = {
    ...genConstructors<TSType>([
        'Any', 'Void', 'Never', 'Null', 'Undefined', 'Boolean', 'Number',
        'String', 'Variable', 'Array', 'Tuple', 'Union', 'Intersection',
        'Function', 'Record', 'Literal', 'Ref',
    ]),
    show,
    from,
} satisfies Impl<Show<TSType> & From<Type, TSType>>;

function show(ty: TSType): string {
    return match(ty, {
        Any: () => 'any',
        Void: () => 'void',
        Never: () => 'never',
        Null: () => 'null',
        Undefined: () => 'undefined',
        Boolean: () => 'boolean',
        Number: () => 'number',
        String: () => 'string',
        Variable: ({ name }) => name,
        Array: ({ element }) => `Array<${show(element)}>`,
        Spread: ({ ty }) => `...${show(ty)}`,
        Tuple: ({ elements }) => `[${elements.map(show).join(', ')}]`,
        Union: ({ types }) => types.map(show).join(' | '),
        Intersection: ({ types }) => types.map(show).join(' & '),
        Function: ({ args, ret }) => `(${args.map(show).join(', ')}) => ${show(ret)}`,
        Record: ({ fields }) => `{ ${Object.entries(fields).map(([key, value]) => `${key}: ${show(value)}`).join(', ')} }`,
        Literal: ({ value }) => value,
        Ref: ({ name, args }) => `${name}${args.length > 0 ? `<${args.map(show).join(', ')}>` : ''}`,
    });
}

function from(ty: Type): TSType {
    return match(ty, {
        Fun: ({ name, args }) => {
            switch (name) {
                case 'Unit': return TSType.Void();
                case 'Bool': return TSType.Boolean();
                case 'Num': return TSType.Number();
                case 'Str': return TSType.String();
                case 'Nil': return TSType.Tuple({ elements: [] });
                case 'Cons': return TSType.Tuple({ elements: [from(args[0]), TSType.Spread({ ty: from(args[1]) })] });
                case 'Array': return TSType.Array({ element: from(args[0]) });
                case 'Tuple': return TSType.Tuple({ elements: args.map(from) });
                case 'Function': return TSType.Function({
                    args: Type.utils.unlist(args[0]).map(from),
                    ret: from(args[1]),
                });
                default:
                    return TSType.Ref({ name, args: args.map(from) });
            }
        },
        Var: ({ ref }) => TSType.Variable({ name: TypeVar.show(ref).toUpperCase() }),
    });
}
