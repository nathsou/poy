import { Stmt as JSStmt } from './ast/js/stmt';
import { bitterModuleOf } from './codegen/bitter/decl';
import { jsOfDecl } from './codegen/js/decl';
import { JSScope } from './codegen/js/jsScope';
import { createFileSystem, type FileSystem } from './misc/fs';
import { array } from './misc/utils';
import { Module, Resolver } from './resolve/resolve';

async function compile(
  sourceFile: string,
  fs: FileSystem,
): Promise<{ module: Module; code: string }[]> {
  const resolver = new Resolver(fs);
  await resolver.resolve(sourceFile);
  const modules = array<{ module: Module; code: string }>();

  for (const module of resolver.modules.values()) {
    const bitterModule = bitterModuleOf(module);
    const topLevelScope = new JSScope(false);
    const jsModule = jsOfDecl(bitterModule, topLevelScope);
    const code = JSStmt.showStmts(jsModule);
    modules.push({ module, code });
  }

  return modules;
}

async function main() {
  const fs = await createFileSystem();
  const args = process.argv.slice(2);
  const sourceFile = args[0];
  const outFile = args[1];

  if (sourceFile === undefined || outFile === undefined) {
    console.error(`Usage: poy <source-file> <output-directory>`);
    process.exit(1);
  }

  const output = await compile(sourceFile, fs);

  for (const { module, code } of output) {
    const filePath = fs.join(outFile, module.name + '.mjs');
    await fs.writeFile(filePath, code);
  }
}

main();
