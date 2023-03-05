import { bitterModuleOf } from "../codegen/bitter/decl";
import { jsOfDecl } from "../codegen/js/decl";
import { JSScope } from "../codegen/js/jsScope";
import { Module } from "../resolve/resolve";
import { Decl as JSDecl } from '../ast/js/decl';

export function bundle(modules: Map<string, Module>): string {
    const loweredModules: string[] = [];

    for (const module of modules.values()) {
        const bitterModule = bitterModuleOf(module);
        const topLevelScope = new JSScope(false);
        const jsModule = jsOfDecl(bitterModule, topLevelScope);
        const lowered = JSDecl.show(jsModule);
        loweredModules.push(lowered);
    }

    return [
        'const print = console.log;',
        ...loweredModules,
    ].join('\n');
}
