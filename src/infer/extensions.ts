import { config } from "../config";
import { Err, Ok, Result } from "../misc/result";
import { pushMap, zip } from "../misc/utils";
import { TypeEnv } from "./infer";
import { Subst, Type } from "./type";

export type ExtensionMembers = Map<string, { ty: Type, declared: boolean }>;
export type ExtensionInfo = {
    subject: Type,
    member: string,
    generics: string[],
    ty: Type,
    declared: boolean,
    static: boolean,
    uuid: string,
};
export type MatchingExtension = { ext: ExtensionInfo, subst: Subst, params: Map<string, Type> };

export class ExtensionScope {
    private extensions: Map<string, ExtensionInfo[]>;
    private parent?: ExtensionScope;

    constructor(parent?: ExtensionScope) {
        this.extensions = new Map();
        this.parent = parent;
    }

    public declare(info: ExtensionInfo) {
        if (config.debug.extensionType) {
            console.log(`// extension ${Type.show(info.subject)}::${info.member}: ${Type.show(info.ty)}`);
        }
        pushMap(this.extensions, info.member, info);
    }

    public matchingCandidates(subject: Type, member: string, env: TypeEnv): MatchingExtension[] {
        const subjectInst = Type.instantiate(subject, env.letLevel, env.generics);
        const candidates: MatchingExtension[] = [];
        const traverse = (scope: ExtensionScope): void => {
            for (const ext of scope.extensions.get(member) ?? []) {
                const params = env.generics.child();
                const extParams = Type.namedParams(ext.subject);
                const allParams = [...new Set([...extParams, ...ext.generics])];
                const sdsds = zip(allParams, allParams.map(name => Type.fresh(env.letLevel, name)));
                params.declareMany(sdsds);
                const subst = Type.unifyPure(subjectInst.ty, ext.subject, params);
                if (subst) {
                    params.substitute(subst);
                    const mapping = new Map([...sdsds, ...Subst.parameterize(subst, params.reversed).entries()]);
                    candidates.push({ ext, subst: new Map([...subjectInst.subst, ...subst]), params: mapping });
                }
            }

            if (scope.parent) {
                traverse(scope.parent);
            }
        };

        traverse(this);

        return candidates;
    }

    public lookup(subject: Type, member: string, env: TypeEnv): Result<MatchingExtension, string> {
        const candidates = this.matchingCandidates(subject, member, env);

        if (candidates.length === 0) {
            return Err(`No extension found for ${Type.show(subject)}::${member}`);
        }

        if (candidates.length === 1) {
            return Ok(candidates[0]);
        }

        const bySpecificity = candidates.map(({ ext, subst, params }) => ({
            ext,
            subst,
            params,
            specificity: Subst.specificity(subst),
        }));

        const minSpecificity = Math.min(...bySpecificity.map(({ specificity }) => specificity));
        const allBest = bySpecificity.filter(({ specificity }) => specificity === minSpecificity);

        if (allBest.length > 1) {
            const fmt = allBest
                .map(({ ext }) => Type.show(ext.subject))
                .join('\n');

            return Err(`Ambiguous extension for ${Type.show(subject)}::${member}, candidates:\n${fmt}`);
        }

        return Ok(allBest[0]);
    }
}
