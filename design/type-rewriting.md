# Ideas

## Type Rewriting

All types could be encoded as:

```rust
enum Type {
    Var(Str),
    Fun(Str, Type[]),
}
```

Type declarations form a Term Rewriting System (TRS).

### Type aliases

```
Path = Str
```

### Type parameter extraction

```
ReturnType<Function<_, ret>> = ret
Parameters<Function<params, _>> = params

ElementType<a[]> = a
Elements<Tuple<elems>> = elems
```

### Computations

```
Reverse<lst> = Reverse'<lst, []>
Reverse'<[], acc> = acc
Reverse'<h:tl, acc> = Reverse'<tl, acc>

Length<[]> = Zero
Length<_:tl> = S<Length<tl>>
```

### Mappings

```
HTMLElement<Div> = HTMLDivElement
HTMLElement<Anchor> = HTMLAnchorElement
HTMLElement<Canvas> = HTMLCanvasElement
...
```

### Predicates

```
IsEmpty<[]> = True
IsEmpty<_:_> = False

IsNumberLike<a> = Member<a, [Num, BigInt]>

fun isPrime<a>(n: a) where IsNumberLike<a>: a
```

### Usual data types

Arrays

```
a[] <=> Array<a>
```

Lists

```
[] <=> Nil
head:tail <=> Cons<head, tail>
[a, b, c] <=> a::b::c::[] <=> Cons<a, Cons<b, Cons<c, Nil>>>
```

Tuples

```
Unit <=> Tuple<[]>
(a, b) <=> Tuple<[a, b]>
(a, b, c) <=> Tuple<[a, b, c]>
```

Functions

```
Num -> Bool <=> Function<[Num], Bool>
(Str, Num, Num) -> Str <=> Function<[Str, Num, Num], Str>
() -> () <=> Function<[], Unit>
```

```
Structs
Structs are nominally typed, struct declarations introduce new types.

```

enum Option<a> { Some<a>, None }

```

Literals
Precise value-dependent literal types could be infered from let declarations:

```

let n = 3 // Num<3> <=> Num<Type.Fun("3", [])>
let str = "hello" // Str<"hello"> <=> Str<Type.Fun("hello", [])>
let q = true // Bool<T>
let cities = ["Strasbourg", "Colmar"] // Str[]<["Strasbourg", "Colmar"]>

```

Records
Records might require specific unification rules to support fields in different orders.
```

Person = { name: Str, age: Num, city: Str } <=> Record<[("name", Str), ("age", Num), ("city", Str)]>

```

Unions
Unions can be represented by predicates but specific unification rules could be added
to make them nicer to work with.

```

Bool | Num | Str <=> Union<[Bool, Num, Str]>

```

```
