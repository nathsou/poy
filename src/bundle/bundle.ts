import { bitterModuleOf } from '../codegen/bitter/decl';
import { jsOfDecl } from '../codegen/js/decl';
import { JSScope } from '../codegen/js/jsScope';
import { Module } from '../resolve/resolve';
import { Decl as JSDecl } from '../ast/js/decl';

export function bundle(modules: Map<string, Module>): string {
    return [...modules.values()]
        .map(module => {
            const bitterModule = bitterModuleOf(module);
            const topLevelScope = new JSScope(false);
            const jsModule = jsOfDecl(bitterModule, topLevelScope);
            return JSDecl.show(jsModule);
        })
        .join('\n');
}
