import { bundle } from './bundle/bundle';
import { createFileSystem, type FileSystem } from './misc/fs';
import { Resolver } from './resolve/resolve';

async function compile(sourceFile: string, fs: FileSystem): Promise<string> {
    const resolver = new Resolver(fs);
    await resolver.resolve(sourceFile);
    return bundle(resolver.modules);
}

async function main() {
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
