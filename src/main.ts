import { Decl as JSDecl } from "./ast/js/decl";
import { bitterModuleOf } from "./codegen/bitter/decl";
import { jsOfDecl } from "./codegen/js/decl";
import { JSScope } from "./codegen/js/jsScope";
import { TypeEnv } from "./infer/infer";
import { createFileSystem } from "./misc/fs";
import { assert, indices } from "./misc/utils";
import { lex } from "./parse/lex";
import { parse } from "./parse/parse";

async function main() {
    const fs = await createFileSystem();
    const args = process.argv.slice(2);
    const sourceFile = args[0];

    if (sourceFile === undefined) {
        console.error('Usage: poy <source-file>');
        process.exit(1);
    }

    const source = await fs.readFile(sourceFile);
    const tokens = lex(source);
    const newlines = indices(source.split(''), c => c === '\n');
    const topModule = parse(tokens, newlines).topModule();
    const env = new TypeEnv();

    for (const decl of topModule.decls) {
        env.inferDecl(decl);
    }

    const bitterModule = bitterModuleOf(topModule);
    const topLevelScope = new JSScope(false);
    const jsModule = jsOfDecl(bitterModule, topLevelScope);
    assert(topLevelScope.statements.length === 0);

    // console.log(env.show().split('\n').map(line => `// ${line}`).join('\n'));
    console.log('const print = console.log;');
    console.log(JSDecl.show(jsModule));

    // console.log(TRS.show(env.typeRules));
    // console.log(Type.show(
    //     TRS.normalize(
    //         env.typeRules,
    //         Type.Fun('Query', [])
    //     )
    // ));
}

main();
