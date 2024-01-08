const context = {
  typeVarId: 0,
};

export const Context = {
  reset: (): void => {
    context.typeVarId = 0;
  },
  freshTypeVarId: (): number => {
    const id = context.typeVarId;
    context.typeVarId += 1;
    return id;
  },
};
