export interface Puzzle {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  starterCode: string;
  expectedOutput: string;
  hints: string[];
}

export const categories = [
  'Basics',
  'Control Flow',
  'Data Structures',
  'Advanced',
  'Algorithms',
];

export const puzzles: Puzzle[] = [
  // ── Basics ──────────────────────────────────────────
  {
    id: 'hello_world',
    title: 'Hello, World!',
    description:
      'Welcome to Ferro! Your first task is simple: use the `print()` function to display the text **Hello, World!** to the console.\n\n' +
      'In Ferro, `print()` works just like you would expect — pass it a string and it outputs to the console.',
    category: 'Basics',
    difficulty: 'easy',
    starterCode: '// Your first Ferro program!\n// Use print() to display "Hello, World!"\n\n',
    expectedOutput: 'Hello, World!',
    hints: [
      'Use print("...") to output text',
      'The exact text should be: Hello, World!',
      'Solution: print("Hello, World!");',
    ],
  },
  {
    id: 'variables',
    title: 'Variables',
    description:
      'In Ferro, variables are declared with `let` and are **immutable by default**.\n\n' +
      'Declare two variables:\n' +
      '- `language` with value `"Ferro"`\n' +
      '- `version` with value `1`\n\n' +
      'Then print both values.',
    category: 'Basics',
    difficulty: 'easy',
    starterCode:
      '// Declare variables and print them\n' +
      '// Hint: let name = value;\n\n',
    expectedOutput: 'Ferro\n1',
    hints: [
      'Use let to declare variables: let x = 42;',
      'Strings use double quotes: "Ferro"',
      'Print each variable on its own line with print()',
    ],
  },
  {
    id: 'mutability',
    title: 'Mutability',
    description:
      'Variables in Ferro are immutable by default. To make a variable mutable, use `let mut`.\n\n' +
      'Create a mutable variable `count` starting at `0`, then increment it three times and print the final value.',
    category: 'Basics',
    difficulty: 'easy',
    starterCode:
      '// Create a mutable variable and modify it\n' +
      'let mut count = 0;\n\n' +
      '// Increment count three times\n' +
      '// Hint: count = count + 1;\n\n\n' +
      'print(count);\n',
    expectedOutput: '3',
    hints: [
      'Use let mut to create a mutable variable',
      'Reassign with: count = count + 1;',
      'Do this three times before the print statement',
    ],
  },
  {
    id: 'functions',
    title: 'Functions',
    description:
      'Functions in Ferro are declared with `fn`. Parameters require type annotations, and you specify the return type with `->`.\n\n' +
      'The **last expression** in a function body is implicitly returned (no `return` keyword needed).\n\n' +
      '```\nfn add(a: int, b: int) -> int {\n    a + b\n}\n```\n\n' +
      'Define a function `double` that takes an `int` and returns it multiplied by 2.',
    category: 'Basics',
    difficulty: 'easy',
    starterCode:
      '// Define a function that doubles a number\n' +
      '// fn name(param: type) -> return_type { body }\n\n\n' +
      'print(double(5));\n' +
      'print(double(21));\n',
    expectedOutput: '10\n42',
    hints: [
      'Function syntax: fn double(n: int) -> int { ... }',
      'The last expression is returned automatically',
      'Multiply with: n * 2',
    ],
  },
  {
    id: 'string_interpolation',
    title: 'String Interpolation',
    description:
      'Ferro supports **f-strings** for embedding expressions inside strings. Prefix a string with `f` and use `{expr}` to interpolate values.\n\n' +
      '```\nlet name = "World";\nprint(f"Hello, {name}!");\n```\n\n' +
      'Create variables for `item` (value `"iron"`) and `temp` (value `1538`), then use an f-string to print the message shown in the expected output.',
    category: 'Basics',
    difficulty: 'easy',
    starterCode:
      'let item = "iron";\n' +
      'let temp = 1538;\n\n' +
      '// Use an f-string to print: The melting point of iron is 1538 degrees\n',
    expectedOutput: 'The melting point of iron is 1538 degrees',
    hints: [
      'F-strings start with f"..."',
      'Embed variables with {variable_name}',
      'print(f"The melting point of {item} is {temp} degrees");',
    ],
  },

  // ── Control Flow ────────────────────────────────────
  {
    id: 'if_else',
    title: 'If / Else',
    description:
      'Ferro uses `if`/`else` for conditional branching. Conditions are wrapped in parentheses.\n\n' +
      '```\nif (x > 0) {\n    print("positive");\n} else {\n    print("non-positive");\n}\n```\n\n' +
      'Write a function `abs` that returns the absolute value of an integer.',
    category: 'Control Flow',
    difficulty: 'easy',
    starterCode:
      '// Return the absolute value of n\n' +
      'fn abs(n: int) -> int {\n' +
      '    // Your code here\n' +
      '    n\n' +
      '}\n\n' +
      'print(abs(42));\n' +
      'print(abs(-15));\n' +
      'print(abs(0));\n',
    expectedOutput: '42\n15\n0',
    hints: [
      'Check if n < 0 using an if expression',
      'If negative, return -n (negate it)',
      'if (n < 0) { -n } else { n }',
    ],
  },
  {
    id: 'match_basics',
    title: 'Match Expressions',
    description:
      'The `match` expression is Ferro\'s pattern matching construct. It compares a value against patterns and executes the matching branch.\n\n' +
      '```\nmatch value {\n    1 => "one",\n    2 => "two",\n    _ => "other"\n}\n```\n\n' +
      'The `_` pattern is a wildcard that matches anything. Write a function `to_medal` that converts placement numbers to medal names.',
    category: 'Control Flow',
    difficulty: 'easy',
    starterCode:
      'fn to_medal(place: int) -> string {\n' +
      '    // Use match to return "gold", "silver", "bronze", or "none"\n' +
      '    match place {\n' +
      '        _ => "none"\n' +
      '    }\n' +
      '}\n\n' +
      'print(to_medal(1));\n' +
      'print(to_medal(2));\n' +
      'print(to_medal(3));\n' +
      'print(to_medal(4));\n',
    expectedOutput: 'gold\nsilver\nbronze\nnone',
    hints: [
      'Add cases before the wildcard: 1 => "gold",',
      'Match patterns are checked top-to-bottom',
      '1 => "gold", 2 => "silver", 3 => "bronze", _ => "none"',
    ],
  },
  {
    id: 'for_loops',
    title: 'For Loops',
    description:
      'Ferro\'s `for` loop iterates over ranges using `start..end` syntax (end is exclusive).\n\n' +
      '```\nfor (i in 0..5) {\n    print(i);\n}\n```\n\n' +
      'Use a for loop to print the **squares** of numbers 1 through 5.',
    category: 'Control Flow',
    difficulty: 'easy',
    starterCode:
      '// Print the squares of 1, 2, 3, 4, 5\n' +
      'for (i in 1..6) {\n' +
      '    print(i);\n' +
      '}\n',
    expectedOutput: '1\n4\n9\n16\n25',
    hints: [
      'The range 1..6 gives you 1, 2, 3, 4, 5',
      'A square is i * i',
      'Change print(i) to print(i * i)',
    ],
  },
  {
    id: 'while_loops',
    title: 'While Loops',
    description:
      'Use `while` loops when you need to repeat code until a condition changes.\n\n' +
      'Compute the **factorial** of 6 (which is 6 * 5 * 4 * 3 * 2 * 1 = 720) using a while loop.',
    category: 'Control Flow',
    difficulty: 'medium',
    starterCode:
      'let mut result = 1;\n' +
      'let mut n = 6;\n\n' +
      '// Use a while loop to compute 6!\n' +
      '// Multiply result by n, then decrement n\n\n\n' +
      'print(result);\n',
    expectedOutput: '720',
    hints: [
      'Loop while n > 0 (or n > 1)',
      'Inside the loop: result = result * n; then n = n - 1;',
      'while (n > 0) { result = result * n; n = n - 1; }',
    ],
  },

  // ── Data Structures ─────────────────────────────────
  {
    id: 'vectors',
    title: 'Vectors',
    description:
      'Vectors (`Vec`) are growable arrays. Create one with `Vec::new()` and add elements with `.push()`.\n\n' +
      '```\nlet mut v = Vec::new();\nv.push(1);\nv.push(2);\n```\n\n' +
      'Create a vector with the values 10, 20, 30 and print each element using a for loop.',
    category: 'Data Structures',
    difficulty: 'easy',
    starterCode:
      'let mut numbers = Vec::new();\n\n' +
      '// Push 10, 20, 30 into the vector\n\n\n' +
      '// Print each element\n' +
      'for (n in numbers) {\n' +
      '    print(n);\n' +
      '}\n',
    expectedOutput: '10\n20\n30',
    hints: [
      'Use numbers.push(10); to add elements',
      'Push each value separately: push(10), push(20), push(30)',
      'The for loop is already written for you!',
    ],
  },
  {
    id: 'structs',
    title: 'Structs',
    description:
      'Structs let you define custom data types with named fields.\n\n' +
      '```\nstruct Point {\n    x: int,\n    y: int\n}\n\nlet p = Point { x: 10, y: 20 };\nprint(p.x);\n```\n\n' +
      'Define a `Rectangle` struct with `width` and `height` fields (both `int`), then write a function `area` that computes width * height.',
    category: 'Data Structures',
    difficulty: 'medium',
    starterCode:
      '// Define a Rectangle struct with width and height\n\n\n' +
      '// Define a function that calculates the area\n' +
      'fn area(r: Rectangle) -> int {\n' +
      '    0\n' +
      '}\n\n' +
      'let r = Rectangle { width: 8, height: 5 };\n' +
      'print(area(r));\n',
    expectedOutput: '40',
    hints: [
      'struct Rectangle { width: int, height: int }',
      'Access fields with: r.width and r.height',
      'Return r.width * r.height from the area function',
    ],
  },
  {
    id: 'enums',
    title: 'Enums',
    description:
      'Enums define types with multiple variants. Variants can optionally carry data.\n\n' +
      '```\nenum Shape {\n    Circle(int),\n    Square(int)\n}\n```\n\n' +
      'Create a `Direction` enum with variants `North`, `South`, `East`, `West`. Then write a function that returns the opposite direction as a string.',
    category: 'Data Structures',
    difficulty: 'medium',
    starterCode:
      'enum Direction {\n' +
      '    North,\n' +
      '    South,\n' +
      '    East,\n' +
      '    West\n' +
      '}\n\n' +
      'fn opposite(d: Direction) -> string {\n' +
      '    // Use match with Direction::North etc.\n' +
      '    match d {\n' +
      '        _ => "unknown"\n' +
      '    }\n' +
      '}\n\n' +
      'print(opposite(Direction::North));\n' +
      'print(opposite(Direction::East));\n',
    expectedOutput: 'south\nwest',
    hints: [
      'Match on enum variants: Direction::North => "south"',
      'Each direction has an opposite',
      'Direction::North => "south", Direction::South => "north", Direction::East => "west", Direction::West => "east"',
    ],
  },

  // ── Advanced ────────────────────────────────────────
  {
    id: 'closures',
    title: 'Closures',
    description:
      'Closures are anonymous functions passed as trailing blocks. Use them with higher-order functions like `.map()` and `.filter()`.\n\n' +
      '```\nlet nums = [1, 2, 3];\nlet doubled = nums.map { it * 2 };\n```\n\n' +
      'The implicit parameter `it` refers to each element. Note the syntax: `.map { ... }` with **no parentheses**.\n\n' +
      'Use `.map` with a closure to **triple** each value, then print the results.',
    category: 'Advanced',
    difficulty: 'medium',
    starterCode:
      'let numbers = [2, 4, 6, 8];\n\n' +
      '// Use .map with a trailing closure to triple each number\n' +
      'let tripled = numbers.map { it };\n\n' +
      'for (n in tripled) {\n' +
      '    print(n);\n' +
      '}\n',
    expectedOutput: '6\n12\n18\n24',
    hints: [
      'Inside the closure, `it` is the current element',
      'To triple: { it * 3 }',
      'Change { it } to { it * 3 }',
    ],
  },
  {
    id: 'power',
    title: 'Power Function',
    description:
      'Write a function `power` that computes `base` raised to `exp` using a while loop.\n\n' +
      'For example: `power(2, 10)` = 1024, `power(3, 4)` = 81.\n\n' +
      'Strategy: start with `result = 1` and multiply by `base` exactly `exp` times.',
    category: 'Advanced',
    difficulty: 'medium',
    starterCode:
      'fn power(base: int, exp: int) -> int {\n' +
      '    let mut result = 1;\n' +
      '    // Use a while loop to multiply result by base, exp times\n\n' +
      '    result\n' +
      '}\n\n' +
      'print(power(2, 10));\n' +
      'print(power(3, 4));\n' +
      'print(power(5, 3));\n',
    expectedOutput: '1024\n81\n125',
    hints: [
      'Use a counter variable: let mut i = 0;',
      'Loop while i < exp, multiply result by base each time',
      'let mut i = 0; while (i < exp) { result = result * base; i = i + 1; }',
    ],
  },
  {
    id: 'recursion',
    title: 'Recursion',
    description:
      'Ferro supports recursive functions. Write a function `fibonacci` that computes the nth Fibonacci number.\n\n' +
      'The sequence starts: 0, 1, 1, 2, 3, 5, 8, 13, 21, 34...\n\n' +
      '- `fib(0)` = 0\n' +
      '- `fib(1)` = 1\n' +
      '- `fib(n)` = `fib(n-1)` + `fib(n-2)`',
    category: 'Advanced',
    difficulty: 'medium',
    starterCode:
      'fn fib(n: int) -> int {\n' +
      '    // Base cases and recursive case\n' +
      '    0\n' +
      '}\n\n' +
      'print(fib(0));\n' +
      'print(fib(1));\n' +
      'print(fib(6));\n' +
      'print(fib(10));\n',
    expectedOutput: '0\n1\n8\n55',
    hints: [
      'Base cases: if n is 0 return 0, if n is 1 return 1',
      'Recursive case: fib(n - 1) + fib(n - 2)',
      'Use if/else: if (n <= 1) { n } else { fib(n - 1) + fib(n - 2) }',
    ],
  },

  // ── Algorithms ────────────────────────────────────
  {
    id: 'two_sum',
    title: 'Two Sum',
    description:
      'Given a vector of integers `nums` and an integer `target`, find **two indices** such that the numbers at those indices add up to `target`.\n\n' +
      'Return a `Vec<int>` containing the two indices.\n\n' +
      '**Example:**\n```\nnums = [2, 7, 11, 15], target = 9\n→ [0, 1]  (because 2 + 7 = 9)\n```\n\n' +
      'Each input has exactly one solution. You may not use the same element twice.',
    category: 'Algorithms',
    difficulty: 'easy',
    starterCode:
      'fn two_sum(nums: Vec<int>, target: int) -> Vec<int> {\n' +
      '    // Find two indices where the values sum to target\n' +
      '    let mut result = Vec::new();\n' +
      '    result\n' +
      '}\n\n' +
      'for (n in two_sum([2, 7, 11, 15], 9)) { print(n); }\n' +
      'for (n in two_sum([3, 2, 4], 6)) { print(n); }\n' +
      'for (n in two_sum([1, 5, 3, 7, 2, 6], 10)) { print(n); }\n',
    expectedOutput: '0\n1\n1\n2\n2\n3',
    hints: [
      'Try a brute-force approach: check every pair of indices',
      'Use nested for loops: for i in 0..len, for j in (i+1)..len',
      'for (i in 0..nums.len()) {\n    for (j in (i + 1)..nums.len()) {\n        if (nums[i] + nums[j] == target) {\n            result.push(i);\n            result.push(j);\n        }\n    }\n}',
    ],
  },
  {
    id: 'reverse_array',
    title: 'Reverse Array',
    description:
      'Write a function that takes a `Vec<int>` and returns a **new vector** with the elements in reverse order.\n\n' +
      '**Example:**\n```\nreverse([1, 2, 3, 4, 5]) → [5, 4, 3, 2, 1]\n```\n\n' +
      'Do not modify the original vector — build and return a new one.',
    category: 'Algorithms',
    difficulty: 'easy',
    starterCode:
      'fn reverse(v: Vec<int>) -> Vec<int> {\n' +
      '    // Return a new vector with elements in reverse order\n' +
      '    let mut result = Vec::new();\n' +
      '    result\n' +
      '}\n\n' +
      'let a = reverse([1, 2, 3, 4, 5]);\n' +
      'for (n in a) { print(n); }\n\n' +
      'let b = reverse([10, 20, 30]);\n' +
      'for (n in b) { print(n); }\n',
    expectedOutput: '5\n4\n3\n2\n1\n30\n20\n10',
    hints: [
      'Iterate from the last index down to 0 using a while loop',
      'Start with i = v.len() - 1 and decrement until i < 0',
      'let mut i = v.len() - 1;\nwhile (i >= 0) {\n    result.push(v[i]);\n    i = i - 1;\n}',
    ],
  },
  {
    id: 'running_sum',
    title: 'Running Sum',
    description:
      'Given a vector of integers, return a new vector where each element is the **running sum** (prefix sum) up to that index.\n\n' +
      '**Example:**\n```\nrunning_sum([1, 2, 3, 4]) → [1, 3, 6, 10]\n```\n\n' +
      '`result[i] = nums[0] + nums[1] + ... + nums[i]`',
    category: 'Algorithms',
    difficulty: 'easy',
    starterCode:
      'fn running_sum(nums: Vec<int>) -> Vec<int> {\n' +
      '    // Build a prefix sum array\n' +
      '    let mut result = Vec::new();\n' +
      '    result\n' +
      '}\n\n' +
      'let a = running_sum([1, 2, 3, 4]);\n' +
      'for (n in a) { print(n); }\n\n' +
      'let b = running_sum([3, 1, 4, 1, 5]);\n' +
      'for (n in b) { print(n); }\n',
    expectedOutput: '1\n3\n6\n10\n3\n4\n8\n9\n14',
    hints: [
      'Keep a running total as you iterate through the input',
      'Use a mutable variable to accumulate the sum and push it each iteration',
      'let mut total = 0;\nfor (n in nums) {\n    total = total + n;\n    result.push(total);\n}',
    ],
  },
  {
    id: 'best_time_stock',
    title: 'Best Time to Buy and Sell Stock',
    description:
      'You are given a vector `prices` where `prices[i]` is the price of a stock on day `i`.\n\n' +
      'Find the **maximum profit** you can achieve by buying on one day and selling on a later day. If no profit is possible, return `0`.\n\n' +
      '**Example:**\n```\nprices = [7, 1, 5, 3, 6, 4] → 5\n(buy at price 1, sell at price 6)\n```',
    category: 'Algorithms',
    difficulty: 'easy',
    starterCode:
      'fn max_profit(prices: Vec<int>) -> int {\n' +
      '    // Track the minimum price seen so far and the best profit\n' +
      '    0\n' +
      '}\n\n' +
      'print(max_profit([7, 1, 5, 3, 6, 4]));\n' +
      'print(max_profit([7, 6, 4, 3, 1]));\n' +
      'print(max_profit([2, 4, 1, 7]));\n',
    expectedOutput: '5\n0\n6',
    hints: [
      'Track the minimum price seen so far as you scan left to right',
      'At each step, compute profit = current_price - min_price, and update the best',
      'let mut min_price = prices[0];\nlet mut best = 0;\nfor (i in 1..prices.len()) {\n    let profit = prices[i] - min_price;\n    if (profit > best) { best = profit; }\n    if (prices[i] < min_price) { min_price = prices[i]; }\n}\nbest',
    ],
  },
  {
    id: 'merge_sorted',
    title: 'Merge Sorted Arrays',
    description:
      'Given two **sorted** vectors `a` and `b`, merge them into a single sorted vector.\n\n' +
      '**Example:**\n```\nmerge([1, 3, 5], [2, 4, 6]) → [1, 2, 3, 4, 5, 6]\n```\n\n' +
      'Use the **two-pointer technique**: compare the front elements of each array and take the smaller one.',
    category: 'Algorithms',
    difficulty: 'medium',
    starterCode:
      'fn merge(a: Vec<int>, b: Vec<int>) -> Vec<int> {\n' +
      '    // Merge two sorted arrays into one sorted array\n' +
      '    let mut result = Vec::new();\n' +
      '    result\n' +
      '}\n\n' +
      'let m1 = merge([1, 3, 5], [2, 4, 6]);\n' +
      'for (n in m1) { print(n); }\n\n' +
      'let m2 = merge([1, 2, 8], [3, 5, 7, 9]);\n' +
      'for (n in m2) { print(n); }\n',
    expectedOutput: '1\n2\n3\n4\n5\n6\n1\n2\n3\n5\n7\n8\n9',
    hints: [
      'Use two index variables (i for a, j for b) and compare a[i] vs b[j]',
      'Push the smaller value and advance that pointer. Handle remaining elements after one array is exhausted.',
      'let mut i = 0;\nlet mut j = 0;\nwhile (i < a.len()) {\n    if (j < b.len()) {\n        if (a[i] <= b[j]) { result.push(a[i]); i = i + 1; }\n        else { result.push(b[j]); j = j + 1; }\n    } else { result.push(a[i]); i = i + 1; }\n}\nwhile (j < b.len()) { result.push(b[j]); j = j + 1; }',
    ],
  },
  {
    id: 'binary_search',
    title: 'Binary Search',
    description:
      'Implement **binary search** on a sorted vector. Return the index of `target` if found, or `-1` if not present.\n\n' +
      '**Example:**\n```\nsearch([-1, 0, 3, 5, 9, 12], 9) → 4\nsearch([-1, 0, 3, 5, 9, 12], 2) → -1\n```\n\n' +
      'Binary search works by repeatedly halving the search range. Use `Math::floor()` for integer division.',
    category: 'Algorithms',
    difficulty: 'medium',
    starterCode:
      'fn search(nums: Vec<int>, target: int) -> int {\n' +
      '    // Binary search: return index of target or -1\n' +
      '    -1\n' +
      '}\n\n' +
      'print(search([-1, 0, 3, 5, 9, 12], 9));\n' +
      'print(search([-1, 0, 3, 5, 9, 12], 2));\n' +
      'print(search([1, 3, 5, 7, 9], 1));\n',
    expectedOutput: '4\n-1\n0',
    hints: [
      'Maintain low and high pointers. Compute mid by halving their sum (use a temp variable for the sum)',
      'Compare nums[mid] to target: if equal, found it. If less, search right. If greater, search left.',
      'let mut low = 0;\nlet mut high = nums.len() - 1;\nlet mut result = -1;\nwhile (low <= high) {\n    let sum = low + high;\n    let mid = Math::floor(sum / 2);\n    if (nums[mid] == target) {\n        result = mid;\n        low = high + 1;\n    } else {\n        if (nums[mid] < target) { low = mid + 1; }\n        else { high = mid - 1; }\n    }\n}\nresult',
    ],
  },
  {
    id: 'climbing_stairs',
    title: 'Climbing Stairs',
    description:
      'You are climbing a staircase with `n` steps. Each time you can climb **1 or 2 steps**. How many distinct ways can you reach the top?\n\n' +
      '**Example:**\n```\nclimb(2) → 2   (1+1 or 2)\nclimb(4) → 5   (1111, 112, 121, 211, 22)\n```\n\n' +
      'This is a classic dynamic programming problem. The answer follows: `ways(n) = ways(n-1) + ways(n-2)`.',
    category: 'Algorithms',
    difficulty: 'medium',
    starterCode:
      'fn climb(n: int) -> int {\n' +
      '    // How many distinct ways to climb n stairs?\n' +
      '    0\n' +
      '}\n\n' +
      'print(climb(2));\n' +
      'print(climb(4));\n' +
      'print(climb(6));\n' +
      'print(climb(10));\n',
    expectedOutput: '2\n5\n13\n89',
    hints: [
      'Base cases: climb(1) = 1, climb(2) = 2. For n > 2, use bottom-up DP.',
      'Keep two variables (a, b) representing ways(i-2) and ways(i-1), update them in a loop.',
      'if (n <= 2) { n } else {\n    let mut a = 1;\n    let mut b = 2;\n    for (i in 3..(n + 1)) {\n        let temp = a + b;\n        a = b;\n        b = temp;\n    }\n    b\n}',
    ],
  },
  {
    id: 'max_subarray',
    title: 'Maximum Subarray',
    description:
      'Given a vector of integers, find the contiguous subarray with the **largest sum** and return that sum.\n\n' +
      '**Example:**\n```\nmax_sub([-2, 1, -3, 4, -1, 2, 1, -5, 4]) → 6\n(subarray [4, -1, 2, 1] has sum 6)\n```\n\n' +
      'Use **Kadane\'s algorithm**: track the current subarray sum and reset when it would be better to start fresh.',
    category: 'Algorithms',
    difficulty: 'medium',
    starterCode:
      'fn max_sub(nums: Vec<int>) -> int {\n' +
      '    // Find the maximum subarray sum\n' +
      '    0\n' +
      '}\n\n' +
      'print(max_sub([-2, 1, -3, 4, -1, 2, 1, -5, 4]));\n' +
      'print(max_sub([1]));\n' +
      'print(max_sub([5, 4, -1, 7, 8]));\n',
    expectedOutput: '6\n1\n23',
    hints: [
      'Initialize max_sum and current_sum to the first element',
      'For each element: current = max(element, current + element). Update max_sum if current is larger.',
      'let mut max_sum = nums[0];\nlet mut current = nums[0];\nfor (i in 1..nums.len()) {\n    if (current + nums[i] > nums[i]) {\n        current = current + nums[i];\n    } else { current = nums[i]; }\n    if (current > max_sum) { max_sum = current; }\n}\nmax_sum',
    ],
  },
];
