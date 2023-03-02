import { Decl as JSDecl } from "./ast/js/decl";
import { bitterModuleOf } from "./codegen/bitter/decl";
import { jsOfDecl } from "./codegen/js/decl";
import { TypeEnv } from "./infer/infer";
import { createFileSystem } from "./misc/fs";
import { lex } from "./parse/lex";
import { parse } from "./parse/parse";

async function main() {
    const fs = await createFileSystem();
    const source = await fs.readFile('./examples/lab.poy');
    const tokens = lex(source);
    const topModule = parse(tokens).topModule();
    const env = new TypeEnv();

    for (const decl of topModule.decls) {
        env.inferDecl(decl);
    }

    const bitterModule = bitterModuleOf(topModule);
    const jsModule = jsOfDecl(bitterModule);

    console.log(JSDecl.show(jsModule));

    // console.log(env.show());
    // console.log(TRS.show(env.typeRules));
    // console.log(Type.show(
    //     TRS.normalize(
    //         env.typeRules,
    //         Type.Fun('Query', [])
    //     )
    // ));
}

main();
