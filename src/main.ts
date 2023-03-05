import { bundle } from "./bundle/bundle";
import { createFileSystem } from "./misc/fs";
import { Resolver } from "./resolve/resolve";

async function main() {
    const fs = await createFileSystem();
    const args = process.argv.slice(2);
    const sourceFile = args[0];

    if (sourceFile === undefined) {
        console.error('Usage: poy <source-file>');
        process.exit(1);
    }

    const resolver = new Resolver(fs);
    await resolver.resolve(sourceFile);
    console.log(bundle(resolver.modules));
}

main();
