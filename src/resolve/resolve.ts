import { ModuleDecl } from "../ast/sweet/decl";
import { TypeEnv } from "../infer/infer";
import { FileSystem } from "../misc/fs";
import { camelCase } from "../misc/strings";
import { indices, last, panic } from "../misc/utils";
import { lex } from "../parse/lex";
import { parse } from "../parse/parse";

export type Module = ModuleDecl & {
    env: TypeEnv,
};

export class Resolver {
    public modules = new Map<string, Module>();
    private beingResolved: Set<string> = new Set();
    public fs: FileSystem;

    constructor(fs: FileSystem) {
        this.fs = fs;
    }

    async resolve(path: string): Promise<Module> {
        const absolutePath = this.fs.absolutePath(path);
        if (this.beingResolved.has(absolutePath)) {
            panic(`Circular module imports:\n${[...this.beingResolved, absolutePath].join(' ->\n')}`);
        }

        this.beingResolved.add(absolutePath);
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
        this.beingResolved.delete(absolutePath);
        this.modules.set(absolutePath, module);

        return module;
    }
}
