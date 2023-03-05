import { ModuleDecl } from "../ast/sweet/decl";
import { TypeEnv } from "../infer/infer";
import { FileSystem } from "../misc/fs";
import { camelCase } from "../misc/strings";
import { indices, last } from "../misc/utils";
import { lex } from "../parse/lex";
import { parse } from "../parse/parse";

export type Module = ModuleDecl & {
    env: TypeEnv,
};

export class Resolver {
    public modules: Map<string, Module>;
    public fs: FileSystem;

    constructor(fs: FileSystem) {
        this.fs = fs;
        this.modules = new Map();
    }

    async resolve(path: string): Promise<Module> {
        const absolutePath = this.fs.absolutePath(path);

        if (this.modules.has(absolutePath)) {
            return this.modules.get(absolutePath)!;
        }

        const source = await this.fs.readFile(absolutePath);
        const tokens = lex(source);
        const newlines = indices(source.split(''), c => c === '\n');
        const moduleName = camelCase(last(absolutePath.split('/')).split('.')[0]);
        const topModule = parse(tokens, newlines).topModule(moduleName);
        const env = new TypeEnv(this, absolutePath);

        for (const decl of topModule.decls) {
            await env.inferDecl(decl);
        }

        const module: Module = { ...topModule, env };
        this.modules.set(absolutePath, module);

        return module;
    }
}
