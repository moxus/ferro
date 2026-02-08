import { describe, it, expect } from "vitest";
import { Lexer } from "../lexer/lexer";
import { Parser } from "./parser";
import * as AST from "../ast/ast";

describe("Parser", () => {
  it("should parse let statements", () => {
    const input = `
    let x = 5;
    let y = 10;
    let mut z = 838383;
    `;

    const lexer = new Lexer(input);
    const parser = new Parser(lexer);
    const program = parser.ParseProgram();

    if (parser.getErrors().length > 0) {
        console.error(parser.getErrors());
    }
    expect(parser.getErrors().length).toBe(0);
    expect(program.statements.length).toBe(3);

    const tests = ["x", "y", "z"];
    tests.forEach((name, i) => {
        const stmt = program.statements[i];
        expect(stmt).toBeInstanceOf(AST.LetStatement);
        expect((stmt as AST.LetStatement).name.value).toBe(name);
    });
    
    expect((program.statements[2] as AST.LetStatement).mutable).toBe(true);
  });

  it("should parse return statements", () => {
      const input = `
      return 5;
      return 10;
      return 993322;
      `;
      
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();

      expect(parser.getErrors().length).toBe(0);
      expect(program.statements.length).toBe(3);
      
      program.statements.forEach(stmt => {
          expect(stmt).toBeInstanceOf(AST.ReturnStatement);
          expect(stmt.tokenLiteral()).toBe("return");
      });
  });

  it("should parse expressions", () => {
      const input = "5 + 5 * 10;";
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();
      expect(parser.getErrors().length).toBe(0);
      // (5 + (5 * 10))
      // Standard precedence check
  });
  
  it("should parse function literal", () => {
      const input = `fn add(x: int, y: int) { x + y; }`;
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();
      
      expect(parser.getErrors().length).toBe(0);
      const stmt = program.statements[0] as AST.ExpressionStatement;
      const fn = stmt.expression as AST.FunctionLiteral;
      expect(fn.parameters.length).toBe(2);
      expect(fn.name).toBe("add");
  });

  it("should parse cast expressions", () => {
      const input = `42 as i8;`;
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();

      expect(parser.getErrors().length).toBe(0);
      expect(program.statements.length).toBe(1);
      const stmt = program.statements[0] as AST.ExpressionStatement;
      const cast = stmt.expression as AST.CastExpression;
      expect(cast).toBeInstanceOf(AST.CastExpression);
      expect((cast.expression as AST.IntegerLiteral).value).toBe(42);
      expect((cast.targetType as AST.TypeIdentifier).value).toBe("i8");
  });

  it("should parse cast with correct precedence", () => {
      const input = `x + y as i8;`;
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();

      expect(parser.getErrors().length).toBe(0);
      // 'as' binds tighter than '+', so this is x + (y as i8)
      const stmt = program.statements[0] as AST.ExpressionStatement;
      const infix = stmt.expression as AST.InfixExpression;
      expect(infix).toBeInstanceOf(AST.InfixExpression);
      expect(infix.operator).toBe("+");
      expect(infix.right).toBeInstanceOf(AST.CastExpression);
  });

  it("should parse extern with variadic params", () => {
      const input = `extern fn printf(fmt: *i8, ...) -> i32;`;
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();

      if (parser.getErrors().length > 0) {
          console.error(parser.getErrors());
      }
      expect(parser.getErrors().length).toBe(0);
      expect(program.statements.length).toBe(1);

      const stmt = program.statements[0] as AST.ExternStatement;
      expect(stmt).toBeInstanceOf(AST.ExternStatement);
      expect(stmt.name.value).toBe("printf");
      expect(stmt.params.length).toBe(1);
      expect(stmt.variadic).toBe(true);
  });

  it("should parse extern without variadic params", () => {
      const input = `extern fn malloc(size: i32) -> *i8;`;
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();

      expect(parser.getErrors().length).toBe(0);
      const stmt = program.statements[0] as AST.ExternStatement;
      expect(stmt).toBeInstanceOf(AST.ExternStatement);
      expect(stmt.name.value).toBe("malloc");
      expect(stmt.params.length).toBe(1);
      expect(stmt.variadic).toBe(false);
  });

  it("should parse for-range statement", () => {
      const input = `for (i in 0..10) { let x = i; }`;
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();

      if (parser.getErrors().length > 0) {
          console.error(parser.getErrors());
      }
      expect(parser.getErrors().length).toBe(0);
      expect(program.statements.length).toBe(1);

      const stmt = program.statements[0] as AST.ForStatement;
      expect(stmt).toBeInstanceOf(AST.ForStatement);
      expect(stmt.variable.value).toBe("i");
      expect(stmt.iterable).toBeInstanceOf(AST.RangeExpression);

      const range = stmt.iterable as AST.RangeExpression;
      expect(range.start).toBeInstanceOf(AST.IntegerLiteral);
      expect((range.start as AST.IntegerLiteral).value).toBe(0);
      expect(range.end).toBeInstanceOf(AST.IntegerLiteral);
      expect((range.end as AST.IntegerLiteral).value).toBe(10);

      expect(stmt.body.statements.length).toBe(1);
  });

  it("should parse for-range with expressions", () => {
      const input = `for (i in 1..n + 1) { let x = i; }`;
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();

      if (parser.getErrors().length > 0) {
          console.error(parser.getErrors());
      }
      expect(parser.getErrors().length).toBe(0);

      const stmt = program.statements[0] as AST.ForStatement;
      expect(stmt).toBeInstanceOf(AST.ForStatement);
      const range = stmt.iterable as AST.RangeExpression;
      expect((range.start as AST.IntegerLiteral).value).toBe(1);
      expect(range.end).toBeInstanceOf(AST.InfixExpression);
  });

  it("should parse for-in with collection expression", () => {
      const input = `for (x in v) { print(x); }`;
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();

      if (parser.getErrors().length > 0) {
          console.error(parser.getErrors());
      }
      expect(parser.getErrors().length).toBe(0);
      expect(program.statements.length).toBe(1);

      const stmt = program.statements[0] as AST.ForStatement;
      expect(stmt).toBeInstanceOf(AST.ForStatement);
      expect(stmt.variable.value).toBe("x");
      expect(stmt.iterable).toBeInstanceOf(AST.Identifier);
      expect((stmt.iterable as AST.Identifier).value).toBe("v");
      expect(stmt.body.statements.length).toBe(1);
  });

  it("should still parse impl blocks with 'for' keyword", () => {
      const input = `impl Display for MyType { fn show(self: MyType) -> string { "hello"; } }`;
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();

      if (parser.getErrors().length > 0) {
          console.error(parser.getErrors());
      }
      expect(parser.getErrors().length).toBe(0);
      expect(program.statements.length).toBe(1);
      expect(program.statements[0]).toBeInstanceOf(AST.ImplBlock);
  });

  // --- Closure / Lambda Tests ---

  it("should parse standalone closure with typed params", () => {
      const input = `let add = (x: i32, y: i32) -> i32 { x + y };`;
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();

      if (parser.getErrors().length > 0) {
          console.error(parser.getErrors());
      }
      expect(parser.getErrors().length).toBe(0);
      expect(program.statements.length).toBe(1);

      const stmt = program.statements[0] as AST.LetStatement;
      expect(stmt).toBeInstanceOf(AST.LetStatement);
      const closure = stmt.value as AST.ClosureExpression;
      expect(closure).toBeInstanceOf(AST.ClosureExpression);
      expect(closure.parameters.length).toBe(2);
      expect(closure.parameters[0].name.value).toBe("x");
      expect(closure.parameters[0].type).not.toBeNull();
      expect(closure.parameters[1].name.value).toBe("y");
      expect(closure.returnType).not.toBeNull();
      expect((closure.returnType as AST.TypeIdentifier).value).toBe("i32");
  });

  it("should parse zero-param closure", () => {
      const input = `let greet = () -> string { "hello" };`;
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();

      if (parser.getErrors().length > 0) {
          console.error(parser.getErrors());
      }
      expect(parser.getErrors().length).toBe(0);

      const stmt = program.statements[0] as AST.LetStatement;
      const closure = stmt.value as AST.ClosureExpression;
      expect(closure).toBeInstanceOf(AST.ClosureExpression);
      expect(closure.parameters.length).toBe(0);
      expect(closure.returnType).not.toBeNull();
  });

  it("should parse standalone closure without return type", () => {
      const input = `let double = (x: i32) { x * 2 };`;
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();

      if (parser.getErrors().length > 0) {
          console.error(parser.getErrors());
      }
      expect(parser.getErrors().length).toBe(0);

      const stmt = program.statements[0] as AST.LetStatement;
      const closure = stmt.value as AST.ClosureExpression;
      expect(closure).toBeInstanceOf(AST.ClosureExpression);
      expect(closure.parameters.length).toBe(1);
      expect(closure.parameters[0].name.value).toBe("x");
      expect(closure.returnType).toBeNull();
  });

  it("should parse trailing lambda with explicit param", () => {
      const input = `list.map() { x -> x * 2 };`;
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();

      if (parser.getErrors().length > 0) {
          console.error(parser.getErrors());
      }
      expect(parser.getErrors().length).toBe(0);

      const stmt = program.statements[0] as AST.ExpressionStatement;
      const call = stmt.expression as AST.MethodCallExpression;
      expect(call).toBeInstanceOf(AST.MethodCallExpression);
      expect(call.method.value).toBe("map");
      expect(call.arguments.length).toBe(1);

      const lambda = call.arguments[0] as AST.ClosureExpression;
      expect(lambda).toBeInstanceOf(AST.ClosureExpression);
      expect(lambda.parameters.length).toBe(1);
      expect(lambda.parameters[0].name.value).toBe("x");
      expect(lambda.hasImplicitIt).toBe(false);
  });

  it("should parse trailing lambda with implicit it", () => {
      const input = `list.map() { it * 2 };`;
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();

      if (parser.getErrors().length > 0) {
          console.error(parser.getErrors());
      }
      expect(parser.getErrors().length).toBe(0);

      const stmt = program.statements[0] as AST.ExpressionStatement;
      const call = stmt.expression as AST.MethodCallExpression;
      expect(call).toBeInstanceOf(AST.MethodCallExpression);
      expect(call.arguments.length).toBe(1);

      const lambda = call.arguments[0] as AST.ClosureExpression;
      expect(lambda).toBeInstanceOf(AST.ClosureExpression);
      expect(lambda.hasImplicitIt).toBe(true);
      expect(lambda.parameters.length).toBe(1);
      expect(lambda.parameters[0].name.value).toBe("it");
  });

  it("should parse trailing lambda without parens", () => {
      const input = `list.filter { x -> x > 5 };`;
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();

      if (parser.getErrors().length > 0) {
          console.error(parser.getErrors());
      }
      expect(parser.getErrors().length).toBe(0);

      const stmt = program.statements[0] as AST.ExpressionStatement;
      const call = stmt.expression as AST.MethodCallExpression;
      expect(call).toBeInstanceOf(AST.MethodCallExpression);
      expect(call.method.value).toBe("filter");
      expect(call.arguments.length).toBe(1);

      const lambda = call.arguments[0] as AST.ClosureExpression;
      expect(lambda).toBeInstanceOf(AST.ClosureExpression);
      expect(lambda.parameters[0].name.value).toBe("x");
  });

  it("should parse trailing lambda with multiple params", () => {
      const input = `pairs.map { a, b -> a + b };`;
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();

      if (parser.getErrors().length > 0) {
          console.error(parser.getErrors());
      }
      expect(parser.getErrors().length).toBe(0);

      const stmt = program.statements[0] as AST.ExpressionStatement;
      const call = stmt.expression as AST.MethodCallExpression;
      expect(call).toBeInstanceOf(AST.MethodCallExpression);

      const lambda = call.arguments[0] as AST.ClosureExpression;
      expect(lambda).toBeInstanceOf(AST.ClosureExpression);
      expect(lambda.parameters.length).toBe(2);
      expect(lambda.parameters[0].name.value).toBe("a");
      expect(lambda.parameters[1].name.value).toBe("b");
  });

  it("should parse mixed args with trailing lambda", () => {
      const input = `retry(3) { fetch_data() };`;
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();

      if (parser.getErrors().length > 0) {
          console.error(parser.getErrors());
      }
      expect(parser.getErrors().length).toBe(0);

      const stmt = program.statements[0] as AST.ExpressionStatement;
      const call = stmt.expression as AST.CallExpression;
      expect(call).toBeInstanceOf(AST.CallExpression);
      expect(call.arguments.length).toBe(2); // 3 and the lambda
      expect(call.arguments[0]).toBeInstanceOf(AST.IntegerLiteral);
      expect(call.arguments[1]).toBeInstanceOf(AST.ClosureExpression);
  });

  it("should still parse grouped expressions correctly", () => {
      const input = `let x = (5 + 3) * 2;`;
      const lexer = new Lexer(input);
      const parser = new Parser(lexer);
      const program = parser.ParseProgram();

      if (parser.getErrors().length > 0) {
          console.error(parser.getErrors());
      }
      expect(parser.getErrors().length).toBe(0);
      expect(program.statements.length).toBe(1);

      const stmt = program.statements[0] as AST.LetStatement;
      const expr = stmt.value as AST.InfixExpression;
      expect(expr).toBeInstanceOf(AST.InfixExpression);
      expect(expr.operator).toBe("*");
  });
});
