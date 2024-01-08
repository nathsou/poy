# Pipeline

Read -> `String` ->
Lex -> `Token[]` ->
Parse -> `Module` ->
Resolve -> `Module[]` ->
Type -> `TypedModule[]` ->
Lower I -> `LoweredModule[]` ->
Optimize I -> `LoweredModule[]` ->
Codegen -> `JSModule[]` ->
Bundle -> `JSFile[]`

## Stages

### Lex

Recognize tokens from the raw source code, provide precise position info and insert semicolons automatically.

#### Semicolon insertion

A semicolon is inserted when a newline `\n` character is encountered and the previsous character usually finishes a statement / expression / declaration:

- identifier | literal (Num, Bool, Str, ...)
- `)` | `]` | `}`
- `return` | `break`

### Parse

Poy structures are recognized from the token stream.

### Resolve

Imports are resolved.

Modes:

1. Bundle: Modules are concatenated into a single file
2. ESM: Top-level modules each have their own .mjs file

### Type

Algorithm W is run to determine the most general type of every member.

### Lower I

The original AST is rewritten to a simpler representation:

- Identifiers are uniqued
- Pattern matching is translated to switch expressions
- Interface method calls are replaced with dictionary passing calls
- Array / dict comprehensions are rewritten to blocks with nested for loops

### Optimize I

Lowered modules are analyzed and optimized:

- Dead call elimination
- Function call inlining
- Constant folding
- `Option` type elimination

### Codegen

- Blocks are linearized
- Modules are converted to raw JavaScript, optionally with .d.ts definition files.

### Bundle

JS Modules are bundled together if necessary.
