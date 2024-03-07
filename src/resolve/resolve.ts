import { Decl } from '../ast/sweet/decl';
import { TypeEnv } from '../infer/infer';
import { FileSystem } from '../misc/fs';
import { camelCase } from '../misc/strings';
import { last, panic } from '../misc/utils';
import { lex } from '../parse/lex';
import { parse } from '../parse/parse';

export type Module = {
  pub: boolean;
  name: string;
  params: string[];
  env: TypeEnv;
  decls: Decl[];
};

export type FilePath = string;
export type ModulePath = { file: FilePath; subpath: string[]; env?: TypeEnv };

export class Resolver {
  public modules = new Map<FilePath, Module>();
  private beingResolved: Set<FilePath> = new Set();
  public fs: FileSystem;

  constructor(fs: FileSystem) {
    this.fs = fs;
  }

  async resolve(file: FilePath, subpath?: string[]): Promise<Module> {
    const absolutePath = this.fs.absolutePath(file);
    if (this.beingResolved.has(absolutePath)) {
      panic(`Circular module imports:\n${[...this.beingResolved, absolutePath].join(' ->\n')}`);
    }

    this.beingResolved.add(absolutePath);
    let mod: Module;

    if (this.modules.has(absolutePath)) {
      mod = this.modules.get(absolutePath)!;
    } else {
      const source = await this.fs.readFile(absolutePath);
      const moduleName = camelCase(last(this.fs.normalize(absolutePath).split('/')).split('.')[0]);
      const tokens = lex(source, moduleName);
      const topModule = parse(tokens, source, moduleName).topModule({ pub: false });
      const env = new TypeEnv(this, absolutePath, moduleName);
      const stdPath = await this.fs.resolveStd();

      if (!absolutePath.includes(stdPath)) {
        // implicitly import the Foundation module
        topModule.decls.unshift(
          Decl.Import({
            pub: false,
            path: [],
            resolvedPath: this.fs.join(stdPath, 'Foundation.poy'),
            members: [],
            module: 'Foundation',
          }),
        );
      }

      for (const decl of topModule.decls) {
        await env.inferDecl(decl);
      }

      mod = { ...topModule, env };
      this.modules.set(absolutePath, mod);
    }

    this.beingResolved.delete(absolutePath);

    if (subpath) {
      for (const part of subpath) {
        mod = mod.env.modules.lookup(part).unwrap();
      }
    }

    return mod;
  }
}
