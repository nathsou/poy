import { TypeEnv } from "./infer/infer";
import { createFileSystem } from "./misc/fs";
import { lex } from "./parse/lex";
import { parse } from "./parse/parse";

async function main() {
    const fs = await createFileSystem();
    const source = await fs.readFile('./examples/lab.poy');
    const tokens = lex(source);
    const topModule = parse(tokens).module();
    const env = new TypeEnv();

    env.inferDecl(topModule);

    // console.log(topModule);
    // console.log(env.modules.lookup('Lab').unwrap());

    console.log(env.show());
}

main();
