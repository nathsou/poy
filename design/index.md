
# Poy design spec
## Principles
- Productive and pragmatic (Fast compile times, automatic memory management, ...)
- Modern (Powerful type inference, ADTs & pattern matching, if expressions, controlled mutability)
- Batteries included (bundler, formatter, package manager, docgen, ...)
- Readable (Compiles to readable files)

## Examples

### Modules
Each poy source file defines a module named after the file name.
Submodules can be defined inside modules.

```poy
module A {
  fun even(n) {
    if n == 0 { true } else { B.odd(n - 1) }
  }
}

module B {
  fun odd(n) {
    if n == 0 { false } else { A.even(n - 1) }
  }
} 
```

-->

```js
const A = (() => {
  const even = n => n == 0 ? true : B.odd(n - 1);
  return { even };
})();

const B = (() => {
  const odd = n => n == 0 ? false : A.even(n - 1);
  return { odd };
})();
```

## Blocks
```poy
let a = {
    let a = 3
    let b = 7
    a * { b * b }
}

// a == 147
```

## Dot syntax
```poy
enum Hobby {
  Unicycling,
  Reading,
  Sleeping,
}

struct Person {
  name: String,
  age: Number,
  mut hobbies: Hobby[],
}

extend Person {
  init(name, age, hobbies = []) {
    Person { name, age, hobbies }
  }
  
  fun isYoung() {
    age < 100
  }

  mut fun addHobby(hobby: Hobby) {
    hobbies.push(hobby)
  }
}

mut nath = Person("Nathan", age: 24)
nath.addHobby(.Unicycling)
```

### Use..in expressions
```poy
use n = 3 in n * 7 // 21

// --> { let n = 3; n * 7 } 
```

### Pattern Matching
```poy
enum Option<T> { Some<T>, None }

// Some<T> <=> T?

extend Option<T> {
  fun flatMap<U>(f: T -> U?): U? {
    match self {
      None => None,
      Some(opt) => f(opt),
    }
  }

  fun map(f: T -> U): U? {
    match self {
      None => None,
      Some(opt) => Some(f(opt)),
    }
  }
}
```

### Data Types
```poy
// arrays
[1, 2, 3]
["a", "b", "c", "d"]

// structs (nominally typed)
Person { name: "K", age: 24, hobbies: [] }

// dictionaries (structurally typed)
let d: { a: Num, b: Bool } = { a: 1, b: true }
let primes: { ...Num: Bool } = { 1: false, 2: true, 3: true, 4: false, 5: true }
// Nice to have: index signature + explicit members
let d2: { a: Num, b: Str, ...Str: Num[] } = { a: 1, b: true, c: [3] }

// tuples

("a", 3, ({}, []))

// Structural equality
[1, 2] == [1, 1 + 1] // true
{ a: 1, b: true } == { b: true, a: 1 } // true
(1, 2, "a") == (1, 2, "a")

// Reference equality
[1, 2] =ref= [1, 2] // false
use a = [1, 2] in a =ref= a // true
```

### Argument labels
```poy
// argument labels are optional
// and can be aliased inside the body of the function

fun buildUnicycle(
  brand: String,
  year: Number,
  model: String,
  color: Color,
  wheelSize (d): String,
) {
  // ...
}

let uni = buildUnicycle(
  color: .Green,
  year: 2017,
  wheelSize: 36,
  model: "Oracle",
  brand: "Nimbus",
)

fun fold<T, U>(elems: T[], f: (U, T) -> U, initial: U) {
  // ...
}

let len = xs -> xs |> fold((n, _) -> n + 1, initial: 0) 
```

### Template literals
```poy
let name = "Nathan"
print("Hello {name}!") // Hello Nathan!
print("Hello \{name\}!") // Hello {name}!
print("3 * 7 = {3 * 7}") // 3 * 7 = 21
```

### Raw JS
```poy
extend Str[] {
  fun join(sep = ", ") {
    raw { @{self}.join(@{sep}) }
  }
}
```

### Monadic chaining
```poy
enum Expr {
  Int(Number),
  Add(Expr, Expr),
  Div(Expr, Expr),
}

extend Expr {
  fun eval(expr): Number? {
    match expr {
      .Int(n) => Some(n),
      .Add(a, b) => {
        let a' = eval(a)?
        let b' = eval(b)?
        a' + b'
      },
      .Div(a, b) => {
          let a' = eval(a)?
          let b' = eval(b)?
          if b' == 0 { None } else { Some(a' / b') }
      }, 
    }
  }
}
```

### Interfaces - Dictionary passing
```poy
interface Show {
  fun show(): String
}

extend Person: Show {
  fun show() {
    "{name} is {age} and enjoys {hobbies.join(", ")}"
  }
}

extend A[]: Show where A: Show {
  fun show() {
    "\"[self.map(x -> x.show()).join(", ")]\""
  }
}

interface Add<Rhs = Self> {
  type Output = Self

  fun add(rhs: Rhs): Output
}

extend Vec2: Add {
  fun add(other) {
    Vec2 {
      x: x + other.x,
      y: y + other.y, 
    }
  }  
}
```

### Array Comprehension
```poy
extend<T> T[] {
  fun map(f) { [f(x) for x in self] }
  fun filter(pred) { [x for x in self if pred(x)] }
  fun flat() { [x for xs in self for x in xs] }
  fun zip(ys) { [(x, y) for x in self, y in ys] }
}

import Iterator [all]

fun isPrime(n) {
  if n < 2 { return false }
  if n == 2 { return true }
  if n % 2 == 0 { return false }

  all(n % i != 0 for i in range(3, Infinity, step: 2) until i * i > n)
}

fun primes(count) {
  mut sieve = [2]

  for n in range(3, Infinity, step: 2) until sieve.length >= count {
    if n % i != 0 for p in sieve until p * p > n {
      sieve.push(n)
    }
  }

  sieve
}
```

### Interoperability with TypeScript (Nice to have)

JS and TS files could be translated to Poy and then imported.