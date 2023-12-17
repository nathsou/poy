import { Pattern } from "./ast/sweet/pattern";
import { bundle } from "./bundle/bundle";
import { ClauseMatrix, showDecisionTree } from "./codegen/decision-trees/ClauseMatrix";
import { createFileSystem, type FileSystem } from "./misc/fs";
import { panic } from "./misc/utils";
import { Resolver } from "./resolve/resolve";

async function compile(sourceFile: string, fs: FileSystem): Promise<string> {
    const resolver = new Resolver(fs);
    await resolver.resolve(sourceFile);
    return bundle(resolver.modules);
}

async function main() {
    // const { Any, Ctor } = Pattern;

    // const cm = new ClauseMatrix({
    //     rows: [
    //         [Any(), Ctor({ name: 'Cons', args: [Any(), Any()] })],
    //         [Ctor({ name: 'Nil', args: [] }), Any()],
    //     ],
    //     actions: [[0], [1]],
    // });

    // const dt = cm.compile([[0], [1]], new Set(['Cons', 'Nil']), m => {
    //     for (let i = 0; i < m.width; i++) {
    //         const col = m.getColumn(i);
    //         if (col.some(p => p.variant !== 'Any')) {
    //             return i;
    //         }
    //     }

    //     return panic('no column found');
    // });

    // console.log(showDecisionTree(dt));
    
    const fs = await createFileSystem();
    const args = process.argv.slice(2);
    const sourceFile = args[0];
    const outFile = args[1];

    if (sourceFile === undefined) {
        console.error('Usage: poy <source-file> [output-file]');
        process.exit(1);
    }

    const output = await compile(sourceFile, fs);

    if (outFile === undefined) {
        console.log(output);
    } else {
        await fs.writeFile(outFile, output);
    }
}

main();
