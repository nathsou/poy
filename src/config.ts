export const config = {
  maxReductionSteps: 1_000_000_000,
  requireExplicitTypeParameters: false,
  enforceExhaustiveMatch: true,
  debug: {
    unification: false,
    ignoreTypeParamName: true,
    extensionType: false,
  },
};
