import { describe, it, expect } from "vitest";
import { Lexer } from "./lexer";
import { TokenType } from "../token";

describe("Lexer", () => {
  it("should tokenize basic symbols", () => {
    const input = "=+(){},;";
    const lexer = new Lexer(input);

    const tests = [
      { type: TokenType.Equals, literal: "=" },
      { type: TokenType.Plus, literal: "+" },
      { type: TokenType.LPharen, literal: "(" },
      { type: TokenType.RPharen, literal: ")" },
      { type: TokenType.LBrace, literal: "{" },
      { type: TokenType.RBrace, literal: "}" },
      { type: TokenType.Comma, literal: "," },
      { type: TokenType.Semi, literal: ";" },
      { type: TokenType.EOF, literal: "" },
    ];

    tests.forEach((tt) => {
      const tok = lexer.nextToken();
      expect(tok.type).toBe(tt.type);
      expect(tok.literal).toBe(tt.literal);
    });
  });

  it("should tokenize source code", () => {
    const input = `let five = 5;
    let mut ten = 10;
    fn add(x, y) {
      x + y;
    }
    let result = add(five, ten);
    "hello world";
    if (5 < 10) {
        return true;
    } else {
        return false;
    }
    10 == 10;
    10 != 9;
    fn process() -> string {
        return "ok";
    }
    `;

    const lexer = new Lexer(input);

    const expected = [
      { type: TokenType.Let, literal: "let" },
      { type: TokenType.Identifier, literal: "five" },
      { type: TokenType.Equals, literal: "=" },
      { type: TokenType.Number, literal: "5" },
      { type: TokenType.Semi, literal: ";" },

      { type: TokenType.Let, literal: "let" },
      { type: TokenType.Mut, literal: "mut" },
      { type: TokenType.Identifier, literal: "ten" },
      { type: TokenType.Equals, literal: "=" },
      { type: TokenType.Number, literal: "10" },
      { type: TokenType.Semi, literal: ";" },

      { type: TokenType.Fn, literal: "fn" },
      { type: TokenType.Identifier, literal: "add" },
      { type: TokenType.LPharen, literal: "(" },
      { type: TokenType.Identifier, literal: "x" },
      { type: TokenType.Comma, literal: "," },
      { type: TokenType.Identifier, literal: "y" },
      { type: TokenType.RPharen, literal: ")" },
      { type: TokenType.LBrace, literal: "{" },
      { type: TokenType.Identifier, literal: "x" },
      { type: TokenType.Plus, literal: "+" },
      { type: TokenType.Identifier, literal: "y" },
      { type: TokenType.Semi, literal: ";" },
      { type: TokenType.RBrace, literal: "}" },

      { type: TokenType.Let, literal: "let" },
      { type: TokenType.Identifier, literal: "result" },
      { type: TokenType.Equals, literal: "=" },
      { type: TokenType.Identifier, literal: "add" },
      { type: TokenType.LPharen, literal: "(" },
      { type: TokenType.Identifier, literal: "five" },
      { type: TokenType.Comma, literal: "," },
      { type: TokenType.Identifier, literal: "ten" },
      { type: TokenType.RPharen, literal: ")" },
      { type: TokenType.Semi, literal: ";" },
      
      { type: TokenType.String, literal: "hello world" },
      { type: TokenType.Semi, literal: ";" },

      { type: TokenType.If, literal: "if" },
      { type: TokenType.LPharen, literal: "(" },
      { type: TokenType.Number, literal: "5" },
      { type: TokenType.LT, literal: "<" },
      { type: TokenType.Number, literal: "10" },
      { type: TokenType.RPharen, literal: ")" },
      { type: TokenType.LBrace, literal: "{" },
      { type: TokenType.Return, literal: "return" },
      { type: TokenType.True, literal: "true" },
      { type: TokenType.Semi, literal: ";" },
      { type: TokenType.RBrace, literal: "}" },
      { type: TokenType.Else, literal: "else" },
      { type: TokenType.LBrace, literal: "{" },
      { type: TokenType.Return, literal: "return" },
      { type: TokenType.False, literal: "false" },
      { type: TokenType.Semi, literal: ";" },
      { type: TokenType.RBrace, literal: "}" },

      { type: TokenType.Number, literal: "10" },
      { type: TokenType.EqEq, literal: "==" },
      { type: TokenType.Number, literal: "10" },
      { type: TokenType.Semi, literal: ";" },

      { type: TokenType.Number, literal: "10" },
      { type: TokenType.NotEq, literal: "!=" },
      { type: TokenType.Number, literal: "9" },
      { type: TokenType.Semi, literal: ";" },
      
      { type: TokenType.Fn, literal: "fn" },
      { type: TokenType.Identifier, literal: "process" },
      { type: TokenType.LPharen, literal: "(" },
      { type: TokenType.RPharen, literal: ")" },
      { type: TokenType.Arrow, literal: "->" },
      { type: TokenType.Identifier, literal: "string" },
      { type: TokenType.LBrace, literal: "{" },
      { type: TokenType.Return, literal: "return" },
      { type: TokenType.String, literal: "ok" },
      { type: TokenType.Semi, literal: ";" },
      { type: TokenType.RBrace, literal: "}" },
      
      { type: TokenType.EOF, literal: "" },
    ];

    expected.forEach((tt, i) => {
      const tok = lexer.nextToken();
      // console.log(`Token ${i}:`, tok);
      expect(tok.type).toBe(tt.type);
      expect(tok.literal).toBe(tt.literal);
    });
  });

  it("should tokenize DotDot (..) token", () => {
    const input = "0..10";
    const lexer = new Lexer(input);

    const expected = [
      { type: TokenType.Number, literal: "0" },
      { type: TokenType.DotDot, literal: ".." },
      { type: TokenType.Number, literal: "10" },
      { type: TokenType.EOF, literal: "" },
    ];

    expected.forEach((tt) => {
      const tok = lexer.nextToken();
      expect(tok.type).toBe(tt.type);
      expect(tok.literal).toBe(tt.literal);
    });
  });

  it("should still tokenize DotDotDot (...) token", () => {
    const input = "...";
    const lexer = new Lexer(input);

    const tok = lexer.nextToken();
    expect(tok.type).toBe(TokenType.DotDotDot);
    expect(tok.literal).toBe("...");
  });

  it("should tokenize for and in keywords", () => {
    const input = "for (i in 0..10)";
    const lexer = new Lexer(input);

    const expected = [
      { type: TokenType.For, literal: "for" },
      { type: TokenType.LPharen, literal: "(" },
      { type: TokenType.Identifier, literal: "i" },
      { type: TokenType.In, literal: "in" },
      { type: TokenType.Number, literal: "0" },
      { type: TokenType.DotDot, literal: ".." },
      { type: TokenType.Number, literal: "10" },
      { type: TokenType.RPharen, literal: ")" },
      { type: TokenType.EOF, literal: "" },
    ];

    expected.forEach((tt) => {
      const tok = lexer.nextToken();
      expect(tok.type).toBe(tt.type);
      expect(tok.literal).toBe(tt.literal);
    });
  });
});
