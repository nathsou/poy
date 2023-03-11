import { Err, Ok, Result } from "../misc/result";
import { pushMap } from "../misc/utils";
import { Subst, Type } from "./type";

export type ExtensionMembers = Map<string, { ty: Type, declared: boolean }>;
export type ExtensionInfo = {
    subject: Type,
    member: string,
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
        pushMap(this.extensions, info.member, info);
    }

    public matchingCandidates(subject: Type, member: string): MatchingExtension[] {
        const candidates: MatchingExtension[] = [];
        const traverse = (scope: ExtensionScope) => {
            for (const ext of scope.extensions.get(member) ?? []) {
                const subst = Type.unifyPure(subject, ext.subject);
                if (subst) {
                    candidates.push({ ext, subst });
                }
            }

            if (scope.parent) {
                traverse(scope.parent);
            }
        };

        traverse(this);

        return candidates;
    }

    public lookup(subject: Type, member: string): Result<ExtensionInfo, string> {
        const candidates = this.matchingCandidates(subject, member);

        if (candidates.length === 0) {
            return Err(`No extension found for ${Type.show(subject)}::${member}`);
        }

        if (candidates.length === 1) {
            return Ok(candidates[0].ext);
        }

        const bySpecificity = candidates.map(({ ext, subst }) => ({
            ext,
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

        return Ok(allBest[0].ext);
    }
}
