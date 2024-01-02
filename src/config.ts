
export const config = {
    maxReductionSteps: 1_000_000_000,
    maxUnificationSteps: 100,
    requireExplicitTypeParameters: false,
    debug: {
        unification: false,
        ignoreTypeParamName: true,
        extensionType: true,
    },
};
