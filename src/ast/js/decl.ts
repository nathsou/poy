import { DataType, genConstructors, match } from "itsamatch";
import { Impl, Show } from "../../misc/traits";
import { Expr } from "./expr";
import { Stmt } from "./stmt";
import { TSType } from "./tsType";

export type Decl = DataType<{
    Let: {
        const_: boolean,
        name: string,
        value: Expr,
    },
    Fun: {
        name: string,
        args: { name: string, ty: TSType }[],
        stmts: Stmt[],
    },
    Module: { name: string, decls: Decl[] },
}>;

export const Decl = {
    ...genConstructors<Decl>(['Let', 'Fun', 'Module']),
    show,
} satisfies Impl<Show<Decl>>;

function show(decl: Decl): string {
    return match(decl, {
        Let: ({ const_, name, value }) => `${const_ ? 'const' : 'let'} ${name} = ${Expr.show(value)};`,
        Fun: ({ name, args, stmts }) => `function ${name}(${args.map(arg => arg.name).join(', ')}) {\n${stmts.map(Stmt.show).join('\n')}\n}`,
        Module: ({ name, decls }) => {
            const members: string[] = [];

            for (const decl of decls) {
                match(decl, {
                    Let: ({ name }) => members.push(name),
                    Fun: ({ name }) => members.push(name),
                    Module: ({ name }) => members.push(name),
                });
            }

            return `const ${name} = (() => {\n${decls.map(show).join('\n')}\nreturn { ${members.join(', ')} };\n})();`
        },
    });
}
