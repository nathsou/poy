# Roadmap

## Pinciples

- Design a language that I would enjoy using.
- Features are split into small sub-tasks, each task should be rewarding on its own.
- Be pragmatic, add complex features only when absolutely necessary.
- Favor code simplicity and readability over performance.
- Take time to appreciate the progress made in between tasks to remain motivated.
- Alternate between long / tedious tasks and short / fun ones.

## Stage 1 - Must have features

### 1. Modules

- [x] Primitive expressions (literals, arithmetic)
- [x] Compound expressions (tuples, arrays, blocks, closures, function calls)
- [x] Functions, let declarations, while loops
- [x] Modules (Support nested modules and imports)

### 2. Structs

- [x] Struct definitions
- [x] Struct instantiation
- [x] Member access

### 3. Extensions

- [x] Resolve matching extensions for method calls
- [x] Support static functions and initializers

### 4. Generics

- [x] Generic functions
- [x] Generic Structs

### 5. Iterators

- [x] Support yield expressions
- [x] Automatically call `iter` on iterables

### 6. Attributes

- [x] Support alias attributes: `declare #[alias("Symbol.iterator")] fun iter(): Iterator<a>`
- [x] Support `new` attributes: `#[new("Map")]`
- [ ] Support declared initializers

### 7. Mutability

- [x] Require `mut` keyword for any reassignable function argument / variable / struct member
- [x] Prevent reassignment of immutable variables / arguments / struct members

ideally (this would require a more advanced type system, where mutability is attached to types directly) {
Rules:

- An immutable value cannot be mutated.
- A sub-member of a mutable value can only be mutated if
  the reference to the value is mutable and the sub-member is mutable.

  Values become mutable when bound to a mutable variable
  Immutable variables cannot be used where an mutable value is expected, but
  mutable variables can be used when an immutable value is expected.

Example:

```poy
let a = [1, 2, 3]
mut b = [a] // Num[][]
b[0][0] = 7 // error

mut a = [1, 2, 3]
mut b = [a] // mut Num[][]
b[0][0] = 7 // ok

mut a = [1, 2, 3]
let b = [4, 5, 6]
mut c = [a, b] // mut Num[] is not compatible with Num[]
```

}

### 8. Enums and Pattern Matching

- [x] Enum declarations
- [x] Destructuring in let declarations, use expressions and function arguments
- [x] Rewrite match expressions to decision trees
- [x] Resolve enums with the shorthand `.member` syntax instead of `Struct.member`
- [x] Optimize decision trees
- [ ] Support multiple subjects (without using a tuple): match xs, ys { a, b => ... }
- [ ] Support or patterns: match x { p1a | p1b => exp1 }

### 9. String template literals

### 10. Checkpoint I

- [ ] Implicitely import the foundations
- [ ] Improve error messages
- [ ] Make type parameters uppercase
- [ ] Identify improvement areas and clean up:
  1. Refactor generics (look at OCaml)
  2. Refactor and simplify type rewriting
  3. Remove all uses of Math.random (uuid)
- [ ] Optimize pattern matching (+ eliminate `Option` type overhead)
- [ ] Improve emitted JS readability
- [ ] Create an interactive web playground
- [ ] Create a test runner for `test { ... }` blocks

## Stage 2 - Nice to have features

At this point, Poy should be as expressive as OCaml and perfectly usable as is.
Inclusion of the following features is not guaranteed as it may overcomplexify the code.

### 11. Dictionaries

- [ ] Structural typing
- [ ] Support index signature type definitions: { ...String: Num }

### 12. Array Comprehension

- [ ] Find a clean way to build and represent array / dict comprehensions.

### 13. Traits (aka interfaces / protocols)

- [ ] Decide between monomorphization and dictionary passing.
- [ ] Extend the type system to support trait contexts.
- [ ] Rewrite interface calls.
- [ ] Define standard traits (Show, Eq, ...)

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
