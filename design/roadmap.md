
# Roadmap

## Pinciples
- Design a language that I would enjoy using.
- Features are split in small sub-tasks, each task should be rewarding on its own.
- Be pragmatic, add complex features only when absolutely necessary.
- Favor code simplicity and readability over performance.
- Take time to appreciate the progress made in between features to remain motivated.
- Alternate between long / tedious features and short / fun ones.

## Stage 1 - Must have features

### 1. Modules
- [x] Primitive expressions (literals, arithmetic) 
- [ ] Compound expressions (tuples, arrays, blocks, closures, function calls)
- [ ] Function and let declarations
- [ ] Modules (Support nested modules and imports)

### 2. Structs & Type Aliases
- [ ] Struct definitions
- [ ] Struct instantiation
- [ ] Member access
- [ ] Type aliases

### 3. Extensions
- [ ] Resolve matching extensions for method calls
- [ ] Support static functions and initializers

### 4. Mutability
- [ ] Require `mut` keyword for any mutable function argument / variable / struct member 
- [ ] Prevent mutation of immutable structures and nested elements

Rules:
- An immutable value cannot be mutated.
- A sub-member of a mutable value can only be mutated if
  the reference to the value is mutable and the sub-member is mutable.

Example:
```poy
let d1 = { a: 1, b: 2 }
mut d2 = { c: 3, d: 4 }
mut a = [d1, d2]

a[0].a += 1 // error
a[1].d += 1 // ok
```

### 5. Generics
- [ ] Support generic functions

### 6. Enums and Pattern Matching
- [ ] Enum declarations
- [ ] Destructuring in let declarations, use expressions and function arguments
- [ ] Rewrite match expressions to decision trees
- [ ] Resolve enums with the shorthand `.Member` syntax instead of `Struct.Member`

### 8. String template literals

### 9. Iterators

### 10. Checkpoint I
- [ ] Improve error messages
- [ ] Identify improvement areas and clean up
- [ ] Optimize pattern matching (+ eliminate `Option` type overhead)
- [ ] Improve emitted JS readability
- [ ] Create an interactive web playground

## Stage 2 - Nice to have features
At this point, Poy should be as expressive as OCaml and perfectly usable as is.
Inclusion of the following features is not guaranteed as it may overcomplexify the code.

### 11. Dictionaries
- [ ] Structural typing
- [ ] Support index signature type definitions: { ...String: Num }

### 12. Array Comprehension
- [ ] Find a clean way to build and represent array / dict comprehensions.

### 13. Interfaces (aka traits / protocols)
- [ ] Decide between monomorphization and dictionary passing.
- [ ] Extend the type system to support interface contexts.
- [ ] Rewrite interface calls.
- [ ] Define standard interfaces (Show, Eq, ...)

### 14. Argument labels

### 15. Checkpoint II
- [ ] Clean up
- [ ] Optimize dictionary type inference
- [ ] Optimize interfaces
- [ ] Syntax highlighting (vscode or treesiter)

## Self-hosting
Now would be a good time to rewrite the compiler in Poy itself as the language should be stable and mature enough. TypeScript -> Poy conversion could optionally be implemented before the rewrite to make the process more iterative.

## Stage 3 - Tooling
- [ ] Parser with recovery
- [ ] LSP
- [ ] Formatter
- [ ] Bundler
- [ ] Package manager