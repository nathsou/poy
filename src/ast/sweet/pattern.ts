import { DataType, genConstructors } from "itsamatch";

export type Pattern = DataType<{
    Any: {},
    Ctor: { name: string, args: Pattern[] },
}>;

export const Pattern = {
    ...genConstructors<Pattern>(['Any', 'Ctor']),
};
