# Ideas

## Type Rewriting

All types could be encoded as:

```rust
enum Type {
    Var(String),
    Fun(String, Type[]),
}

// type aliases are equivalent to rewriting rules
type A<T> = B<T> ~> A<T> -> B<T>
```

with user-defined Type rewriting rules:

```
Unit -> Tuple<Nil>
Pair<a, b> -> Tuple<a::b::Nil>
Triplet<a, b, c> -> Tuple<[a, b, c]> // shorthand for lists

ReturnType<Fun<_, ret>> -> ret
Parameters<Fun<params, _>> -> params

Exclude<Record<(k, v)::tail>, t> -> if Assignable<k, t> then tail else (k, v)::Exclude<tail, t>
Exclude<Record<[]>, _> -> []

enum Option<t> { Some<t>, None } // adds Option#1 into the TRS signature

Uppercase<Char<97>> -> Char<65>
...
Uppercase<StringLiteral<chars>> -> StringLiteral<@Map<chars, Uppercase>>

// if isOdd(n) { 1 } else { 2 } : if IsOdd<N> then 1 else 2

fun map<a, b>(opt: Option<a>, f: a => b) {
    match opt {
        None => None
        Some(v) => Some(f(v))
    }
}

// match expressions can produce type rewriting rules to generate dependent types
Map(_, _, None) -> None
Map(A, B, Some(A)) -> B
Map<A, B, Option<A>> -> Option<B>
```

```
fun zip<A, B>(as: A[], bs: B[]) {
    // use the first expression's type but use the second expression for evaluation
    replace {
        match a, b {
            [], [] => []
            a::as, b::bs => (a, b)::zip(as, bs)
            as, [] => as
            [], bs => bs
        }
    } with {
        mut zipped = []

        for i in range(0, min(as.length, bs.length)) {
            zipped.push((as[i], bs[i]))
        }

        zipped
    }
}

// generates
Zip<[], []> -> []
Zip<A::As, B::Bs> -> (A, B)::Zip<As, Bs>
Zip<As, []> -> As
Zip<[], Bs> -> Bs
Zip<A[], B[]> -> (A, B)[]

// property-testing tests are generated to ensure that zip'<A, B> is compatible with zip<A, B>
test {
    for _ in range(0, N) {
        let as = A[].gen()
        let bs = B[].gen()
        assert(zip'(as, bs) == zip(as, bs))
    }
}

interface Gen<T> {
    static fun gen(): T
}

extend A[]: Gen where A: Gen {
    static fun gen(): A[] {
        let len = Num.randIntBetween(0, 5)
        mut res = []

        for _ in range(0, len) {
            res.push(A[].gen())
        }
    }
} 

// interfaces

Implements<A[], Gen> -> Implements<A, Gen> 
Implements<Show<Tuple<tys>>> -> All<ImplementsShow, tys>
ImplementsShow<t> -> Implements<t, Show>
```