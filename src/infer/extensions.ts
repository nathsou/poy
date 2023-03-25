import { config } from "../config";
import { Err, Ok, Result } from "../misc/result";
import { pushMap } from "../misc/utils";
import { Subst, Type, TypeVarId } from "./type";

export type ExtensionMembers = Map<string, { ty: Type, declared: boolean }>;
export type ExtensionInfo = {
    subject: Type,
    member: string,
    generics: TypeVarId[],
    ty: Type,
    declared: boolean,
    static: boolean,
    uuid: string
};
export type MatchingExtension = { ext: ExtensionInfo, subst: Subst };

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

    public matchingCandidates(subject: Type, member: string, letLevel: number): MatchingExtension[] {
        const subjectInst = Type.instantiate(subject, letLevel);
        const candidates: MatchingExtension[] = [];
        const traverse = (scope: ExtensionScope): void => {
            for (const ext of scope.extensions.get(member) ?? []) {
                const extSubjectInst = Type.instantiate(ext.subject, letLevel);
                const subst = Type.unifyPure(subjectInst.ty, extSubjectInst.ty);
                if (subst) {
                    candidates.push({ ext, subst: new Map([...subjectInst.subst, ...extSubjectInst.subst, ...subst]) });
                }
            }

            if (scope.parent) {
                traverse(scope.parent);
            }
        };

        traverse(this);

        return candidates;
    }

    public lookup(subject: Type, member: string, letLevel: number): Result<MatchingExtension, string> {
        const candidates = this.matchingCandidates(subject, member, letLevel);

        if (candidates.length === 0) {
            return Err(`No extension found for ${Type.show(subject)}::${member}`);
        }

        if (candidates.length === 1) {
            return Ok(candidates[0]);
        }

        const bySpecificity = candidates.map(({ ext, subst }) => ({
            ext,
            subst,
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
