import { Lexer } from "../lexer/lexer";
import { Token, TokenType } from "../token";
import * as AST from "../ast/ast";

enum Precedence {
  LOWEST = 1,
  ASSIGN,      // =
  LOGICAL_OR,  // ||
  LOGICAL_AND, // &&
  EQUALS,      // ==
  LESSGREATER, // > or <
  SUM,         // +
  PRODUCT,     // *
  CAST,        // as
  PREFIX,      // -X or !X
  CALL,        // myFunction(X) or X::Y or X.Y
  QUESTION,    // ?
}

const PRECEDENCES: Record<string, Precedence> = {
  [TokenType.DoubleColon]: Precedence.CALL,
  [TokenType.Dot]: Precedence.CALL,
  [TokenType.LBracket]: Precedence.CALL,
  [TokenType.LBrace]: Precedence.CALL,
  [TokenType.Bang]: Precedence.CALL,
  [TokenType.Question]: Precedence.QUESTION,
  [TokenType.Equals]: Precedence.ASSIGN,
  [TokenType.PipePipe]: Precedence.LOGICAL_OR,
  [TokenType.AmpAmp]: Precedence.LOGICAL_AND,
  [TokenType.EqEq]: Precedence.EQUALS,
  [TokenType.NotEq]: Precedence.EQUALS,
  [TokenType.LT]: Precedence.LESSGREATER,
  [TokenType.GT]: Precedence.LESSGREATER,
  [TokenType.LtEq]: Precedence.LESSGREATER,
  [TokenType.GtEq]: Precedence.LESSGREATER,
  [TokenType.As]: Precedence.CAST,
  [TokenType.Plus]: Precedence.SUM,
  [TokenType.Minus]: Precedence.SUM,
  [TokenType.Slash]: Precedence.PRODUCT,
  [TokenType.Star]: Precedence.PRODUCT,
  [TokenType.LPharen]: Precedence.CALL,
};

type PrefixParseFn = () => AST.Expression | null;
type InfixParseFn = (left: AST.Expression) => AST.Expression | null;

export class Parser {
  private lexer: Lexer;
  private curToken!: Token;
  private peekToken!: Token;
  private peekAheadToken!: Token; // 3rd token lookahead for closure detection
  private errors: { msg: string, line: number, col: number }[] = [];

  private prefixParseFns: Record<string, PrefixParseFn> = {};
  private infixParseFns: Record<string, InfixParseFn> = {};

  constructor(lexer: Lexer) {
    this.lexer = lexer;
    // Read three tokens to set curToken, peekToken, and peekAheadToken
    this.nextToken();
    this.nextToken();
    this.nextToken();

    this.registerPrefix(TokenType.Identifier, this.parseIdentifier.bind(this));
    this.registerPrefix(TokenType.Number, this.parseIntegerLiteral.bind(this));
    this.registerPrefix(TokenType.String, this.parseStringLiteral.bind(this));
    this.registerPrefix(TokenType.True, this.parseBoolean.bind(this));
    this.registerPrefix(TokenType.False, this.parseBoolean.bind(this));
    this.registerPrefix(TokenType.Null, this.parseNull.bind(this));
    this.registerPrefix(TokenType.NotEq, this.parsePrefixExpression.bind(this)); // Using ! for NotEq token if ! is mapped there, wait.
    // In lexer I mapped ! to Illegal unless !=. But I should map ! to Bang.
    // Wait, my lexer doesn't have Bang (!). It has NotEq (!=).
    // I should add Bang (!) support.
    this.registerPrefix(TokenType.Minus, this.parsePrefixExpression.bind(this));
    this.registerPrefix(TokenType.Star, this.parsePrefixExpression.bind(this)); // Dereference
    this.registerPrefix(TokenType.LPharen, this.parseGroupedExpression.bind(this));
    this.registerPrefix(TokenType.If, this.parseIfExpression.bind(this));
    this.registerPrefix(TokenType.Match, this.parseMatchExpression.bind(this));
    this.registerPrefix(TokenType.Fn, this.parseFunctionLiteral.bind(this));
    this.registerPrefix(TokenType.Quote, this.parseQuoteExpression.bind(this));
    this.registerPrefix(TokenType.Dollar, this.parseUnquoteExpression.bind(this));
    this.registerPrefix(TokenType.LBrace, this.parseBlockExpression.bind(this));
    this.registerPrefix(TokenType.LBracket, this.parseArrayLiteral.bind(this));
    this.registerPrefix(TokenType.Unsafe, this.parseUnsafeExpression.bind(this));
    this.registerPrefix(TokenType.Ampersand, this.parseAddressOfExpression.bind(this));

    this.registerInfix(TokenType.Plus, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.Minus, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.Slash, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.Star, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.Equals, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.EqEq, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.Question, this.parseQuestionExpression.bind(this));
    this.registerInfix(TokenType.NotEq, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.LT, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.GT, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.LtEq, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.GtEq, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.AmpAmp, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.PipePipe, this.parseInfixExpression.bind(this));
    this.registerInfix(TokenType.LPharen, this.parseCallExpression.bind(this));
    this.registerInfix(TokenType.DoubleColon, this.parseStaticCall.bind(this));
    this.registerInfix(TokenType.Dot, this.parseMemberAccess.bind(this));
    this.registerInfix(TokenType.LBrace, this.parseStructLiteral.bind(this));
    this.registerInfix(TokenType.LBracket, this.parseIndexExpression.bind(this));
    this.registerInfix(TokenType.Bang, this.parseMacroCall.bind(this));
    this.registerInfix(TokenType.As, this.parseCastExpression.bind(this));
  }

  public nextToken() {
    this.curToken = this.peekToken;
    this.peekToken = this.peekAheadToken;
    this.peekAheadToken = this.lexer.nextToken();
  }

  public ParseProgram(): AST.Program {
    const program = new AST.Program();

    while (this.curToken.type !== TokenType.EOF) {
      const stmt = this.parseStatement();
      if (stmt !== null) {
        program.statements.push(stmt);
      }
      this.nextToken();
    }
    return program;
  }

  public getErrors(): { msg: string, line: number, col: number }[] {
    return this.errors;
  }

  private parseStatement(): AST.Statement | null {
    switch (this.curToken.type) {
      case TokenType.Let:
        return this.parseLetStatement();
      case TokenType.Return:
        return this.parseReturnStatement();
      case TokenType.Trait:
        return this.parseTraitDeclaration();
      case TokenType.Impl:
        return this.parseImplBlock();
      case TokenType.Macro:
        return this.parseMacroDefinition();
      case TokenType.While:
        return this.parseWhileStatement();
      case TokenType.For:
        return this.parseForStatement();
      case TokenType.Struct:
        return this.parseStructDefinition();
      case TokenType.Enum:
        return this.parseEnumDefinition();
      case TokenType.Import:
        return this.parseImportStatement();
      case TokenType.Export:
        return this.parseExportStatement();
      case TokenType.Extern:
        return this.parseExternStatement();
      default:
        return this.parseExpressionStatement();
    }
  }

  private parseWhileStatement(): AST.WhileStatement | null {
    const token = this.curToken;
    if (!this.expectPeek(TokenType.LPharen)) return null;
    this.nextToken();
    const condition = this.parseExpression(Precedence.LOWEST);
    if (!this.expectPeek(TokenType.RPharen)) return null;
    if (!this.expectPeek(TokenType.LBrace)) return null;
    const body = this.parseBlockStatement();
    return new AST.WhileStatement(token, condition!, body);
  }

  private parseForStatement(): AST.ForStatement | null {
    const token = this.curToken; // 'for'
    if (!this.expectPeek(TokenType.LPharen)) return null;
    if (!this.expectPeek(TokenType.Identifier)) return null;
    const variable = new AST.Identifier(this.curToken, this.curToken.literal);
    if (!this.expectPeek(TokenType.In)) return null;
    this.nextToken(); // advance past 'in' to start expression
    const expr = this.parseExpression(Precedence.LOWEST);
    if (!expr) return null;

    let iterable: AST.Expression;
    if (this.peekTokenIs(TokenType.DotDot)) {
      // Range syntax: start..end
      this.nextToken(); // consume ..
      this.nextToken(); // advance past '..' to end expression
      const end = this.parseExpression(Precedence.LOWEST);
      if (!end) return null;
      iterable = new AST.RangeExpression(this.curToken, expr, end);
    } else {
      // Collection iteration: for (x in collection)
      iterable = expr;
    }

    if (!this.expectPeek(TokenType.RPharen)) return null;
    if (!this.expectPeek(TokenType.LBrace)) return null;
    const body = this.parseBlockStatement();
    return new AST.ForStatement(token, variable, iterable, body);
  }

  private parseUnsafeExpression(): AST.Expression | null {
    const token = this.curToken;
    if (!this.expectPeek(TokenType.LBrace)) return null;
    const block = this.parseBlockStatement();
    return new AST.UnsafeExpression(token, block);
  }

  private parseAddressOfExpression(): AST.Expression | null {
      const token = this.curToken; // &
      this.nextToken();
      const value = this.parseExpression(Precedence.PREFIX);
      if (!value) return null;
      return new AST.AddressOfExpression(token, value);
  }

  private parseExternStatement(): AST.ExternStatement | null {
    const token = this.curToken;
    if (!this.expectPeek(TokenType.Fn)) return null;
    if (!this.expectPeek(TokenType.Identifier)) return null;
    const name = new AST.Identifier(this.curToken, this.curToken.literal);

    if (!this.expectPeek(TokenType.LPharen)) return null;

    // Parse extern parameters with optional trailing ...
    const params: AST.Parameter[] = [];
    let variadic = false;

    if (!this.peekTokenIs(TokenType.RPharen)) {
      // Check for leading ... (no fixed params)
      if (this.peekTokenIs(TokenType.DotDotDot)) {
        this.nextToken();
        variadic = true;
      } else {
        this.nextToken();
        const firstParam = this.parseParameter();
        if (firstParam) params.push(firstParam);

        while (this.peekTokenIs(TokenType.Comma)) {
          this.nextToken(); // consume comma
          // Check for ... after comma
          if (this.peekTokenIs(TokenType.DotDotDot)) {
            this.nextToken();
            variadic = true;
            break;
          }
          this.nextToken();
          const param = this.parseParameter();
          if (param) params.push(param);
        }
      }
    }

    if (!this.expectPeek(TokenType.RPharen)) return null;

    let returnType: AST.Type = new AST.TypeIdentifier({ type: TokenType.Identifier, literal: "void", line: 0, column: 0 }, "void");

    if (this.peekTokenIs(TokenType.Arrow)) {
      this.nextToken(); // consume )
      this.nextToken(); // consume arrow, curToken becomes type start
      returnType = this.parseType();
    }

    if (!this.expectPeek(TokenType.Semi)) return null;

    return new AST.ExternStatement(token, name, params, returnType, variadic);
  }

  private parseStructDefinition(): AST.StructDefinition | null {
    const token = this.curToken;
    if (!this.expectPeek(TokenType.Identifier)) return null;
    const name = new AST.Identifier(this.curToken, this.curToken.literal);

    const { typeParams, typeConstraints } = this.parseTypeParamsWithBounds();

    if (!this.expectPeek(TokenType.LBrace)) return null;
    this.nextToken(); // consume {

    const fields: AST.Parameter[] = [];
    while (!this.curTokenIs(TokenType.RBrace) && !this.curTokenIs(TokenType.EOF)) {
      const field = this.parseParameter();
      if (field) fields.push(field);

      if (this.peekTokenIs(TokenType.Comma)) {
        this.nextToken();
      }
      this.nextToken();
    }

    const sd = new AST.StructDefinition(token, name, fields, typeParams);
    sd.typeConstraints = typeConstraints;
    return sd;
  }

  private parseEnumDefinition(): AST.EnumDefinition | null {
    const token = this.curToken; // 'enum'
    if (!this.expectPeek(TokenType.Identifier)) return null;
    const name = new AST.Identifier(this.curToken, this.curToken.literal);

    // Parse optional type params <T, U> with optional bounds
    const { typeParams, typeConstraints } = this.parseTypeParamsWithBounds();

    if (!this.expectPeek(TokenType.LBrace)) return null;
    this.nextToken(); // consume {

    const variants: AST.EnumVariant[] = [];
    while (!this.curTokenIs(TokenType.RBrace) && !this.curTokenIs(TokenType.EOF)) {
      const variantToken = this.curToken;
      const variantName = new AST.Identifier(this.curToken, this.curToken.literal);

      const fields: AST.Type[] = [];
      if (this.peekTokenIs(TokenType.LPharen)) {
        this.nextToken(); // move to (
        this.nextToken(); // consume (, move to first type

        while (!this.curTokenIs(TokenType.RPharen) && !this.curTokenIs(TokenType.EOF)) {
          fields.push(this.parseType());
          if (this.peekTokenIs(TokenType.Comma)) {
            this.nextToken();
            this.nextToken();
          } else {
            this.nextToken(); // move past type to )
          }
        }
        // curToken is now )
      }

      variants.push(new AST.EnumVariant(variantToken, variantName, fields));

      if (this.peekTokenIs(TokenType.Comma)) {
        this.nextToken();
      }
      this.nextToken(); // move to next variant or }
    }

    const ed = new AST.EnumDefinition(token, name, variants, typeParams);
    ed.typeConstraints = typeConstraints;
    return ed;
  }

  private parseStructLiteral(left: AST.Expression): AST.Expression | null {
    let name: AST.Identifier;
    let typeParams: AST.Type[] = [];

    if (left instanceof AST.Identifier) {
        name = left;
    } else if (left instanceof AST.GenericInstantiationExpression && left.left instanceof AST.Identifier) {
        name = left.left;
        typeParams = left.typeArgs;
    } else if (left instanceof AST.MemberAccessExpression || left instanceof AST.CallExpression || left instanceof AST.MethodCallExpression) {
        // Trailing lambda with no parens: expr { ... }
        // e.g. list.map { it * 2 }
        const lambda = this.parseTrailingLambda();
        if (!lambda) return null;

        if (left instanceof AST.MemberAccessExpression) {
          // Convert to method call with the lambda as the only argument
          return new AST.MethodCallExpression(this.curToken, left.left, left.member, [lambda]);
        }

        // For CallExpression or MethodCallExpression, append lambda as additional arg
        if (left instanceof AST.CallExpression) {
          left.arguments.push(lambda);
          return left;
        }
        if (left instanceof AST.MethodCallExpression) {
          left.arguments.push(lambda);
          return left;
        }

        return null;
    } else {
        return null;
    }

    const token = this.curToken;
    this.nextToken();

    const values: { name: AST.Identifier, value: AST.Expression }[] = [];

    while (!this.curTokenIs(TokenType.RBrace) && !this.curTokenIs(TokenType.EOF)) {
      const fieldName = new AST.Identifier(this.curToken, this.curToken.literal);

      if (!this.expectPeek(TokenType.Colon)) return null;
      this.nextToken();

      const val = this.parseExpression(Precedence.LOWEST);
      if (val) values.push({ name: fieldName, value: val });

      if (this.peekTokenIs(TokenType.Comma)) {
        this.nextToken();
      }
      this.nextToken();
    }

    return new AST.StructLiteral(name.token, name, values, typeParams);
  }

  private parseTraitDeclaration(): AST.TraitDeclaration | null {
    const token = this.curToken;
    if (!this.expectPeek(TokenType.Identifier)) return null;
    const name = new AST.Identifier(this.curToken, this.curToken.literal);

    if (!this.expectPeek(TokenType.LBrace)) return null;

    const trait = new AST.TraitDeclaration(token, name);
    this.nextToken();

    while (!this.curTokenIs(TokenType.RBrace) && !this.curTokenIs(TokenType.EOF)) {
      if (this.curTokenIs(TokenType.Fn)) {
        // Parse signature manually or adjust parseFunctionLiteral
        const method = this.parseFunctionSignature();
        if (this.peekTokenIs(TokenType.Semi)) {
          this.nextToken(); // consume ;
        } else if (this.peekTokenIs(TokenType.LBrace)) {
          this.nextToken();
          method.body = this.parseBlockStatement();
        }
        trait.methods.push(method);
      }
      this.nextToken();
    }
    return trait;
  }

  private parseFunctionSignature(): AST.FunctionLiteral {
    const token = this.curToken;
    let name = "";
    if (this.peekTokenIs(TokenType.Identifier)) {
      this.nextToken();
      name = this.curToken.literal;
    }

    const { typeParams, typeConstraints } = this.parseTypeParamsWithBounds();

    this.expectPeek(TokenType.LPharen);
    const params = this.parseFunctionParameters();
    const fn = new AST.FunctionLiteral(token, new AST.BlockStatement(token));
    fn.parameters = params;
    fn.name = name;
    fn.typeParams = typeParams;
    fn.typeConstraints = typeConstraints;
    if (this.peekTokenIs(TokenType.Arrow)) {
      this.nextToken();
      this.nextToken();
      fn.returnType = this.parseType();
    }
    return fn;
  }

  private parseImplBlock(): AST.ImplBlock | null {
    const token = this.curToken;

    // Parse optional type params with bounds: impl<T: Trait> ...
    const { typeParams, typeConstraints } = this.parseTypeParamsWithBounds();

    if (!this.expectPeek(TokenType.Identifier)) return null;
    const traitName = new AST.Identifier(this.curToken, this.curToken.literal);

    // impl Trait for Type
    if (!this.expectPeek(TokenType.For)) {
      return null;
    }

    if (!this.expectPeek(TokenType.Identifier)) return null;
    const targetType = new AST.Identifier(this.curToken, this.curToken.literal);

    // Parse optional target type args: ... for Box<T>
    const targetTypeArgs: string[] = [];
    if (this.peekTokenIs(TokenType.LT)) {
        this.nextToken(); // <
        this.nextToken(); // T
        while (!this.curTokenIs(TokenType.GT) && !this.curTokenIs(TokenType.EOF)) {
            targetTypeArgs.push(this.curToken.literal);
            if (this.peekTokenIs(TokenType.Comma)) {
                this.nextToken();
                this.nextToken();
            } else {
                this.nextToken();
            }
        }
        // curToken is now GT (>)
    }

    if (!this.expectPeek(TokenType.LBrace)) return null;

    const impl = new AST.ImplBlock(token, traitName, targetType);
    impl.typeParams = typeParams;
    impl.typeConstraints = typeConstraints;
    impl.targetTypeArgs = targetTypeArgs;
    this.nextToken();

    while (!this.curTokenIs(TokenType.RBrace) && !this.curTokenIs(TokenType.EOF)) {
      if (this.curTokenIs(TokenType.Fn)) {
        const method = this.parseFunctionLiteral() as AST.FunctionLiteral;
        if (method) impl.methods.push(method);
      }
      this.nextToken();
    }
    return impl;
  }

  private parseLetStatement(): AST.LetStatement | null {
    const token = this.curToken;
    let mutable = false;

    if (this.peekTokenIs(TokenType.Mut)) {
      this.nextToken();
      mutable = true;
    }

    if (!this.expectPeek(TokenType.Identifier)) {
      return null;
    }

    const name = new AST.Identifier(this.curToken, this.curToken.literal);
    let type: AST.Type | null = null;

    // Optional Type Annotation: let x: int = ...
    if (this.peekTokenIs(TokenType.Colon)) {
      this.nextToken(); // consume identifier (wait, curToken was ident, nextToken makes curToken Colon)
      this.nextToken(); // consume Colon, make curToken Type
      type = this.parseType();
    }

    if (!this.expectPeek(TokenType.Equals)) {
      return null;
    }

    this.nextToken();
    const value = this.parseExpression(Precedence.LOWEST);

    if (this.peekTokenIs(TokenType.Semi)) {
      this.nextToken();
    }

    const stmt = new AST.LetStatement(token, name, value, mutable);
    stmt.type = type;
    return stmt;
  }

  private parseReturnStatement(): AST.ReturnStatement | null {
    const token = this.curToken;
    this.nextToken();

    const returnValue = this.parseExpression(Precedence.LOWEST);

    if (this.peekTokenIs(TokenType.Semi)) {
      this.nextToken();
    }

    return new AST.ReturnStatement(token, returnValue);
  }

  private parseExpressionStatement(): AST.ExpressionStatement {
    const token = this.curToken;
    const expression = this.parseExpression(Precedence.LOWEST);

    if (this.peekTokenIs(TokenType.Semi)) {
      this.nextToken();
    }

    return new AST.ExpressionStatement(token, expression);
  }

  private parseExpression(precedence: number): AST.Expression | null {
    const prefix = this.prefixParseFns[this.curToken.type];
    if (!prefix) {
      this.noPrefixParseFnError(this.curToken.type);
      return null;
    }

    let leftExp = prefix();

    while (!this.peekTokenIs(TokenType.Semi) && precedence < this.peekPrecedence()) {
      const infix = this.infixParseFns[this.peekToken.type];
      if (!infix) {
        return leftExp;
      }
      this.nextToken();
      if (leftExp) {
        leftExp = infix(leftExp);
      }
    }

    return leftExp;
  }

  private parseIdentifier(): AST.Expression {
    return new AST.Identifier(this.curToken, this.curToken.literal);
  }

  private parseIntegerLiteral(): AST.Expression | null {
    const value = parseInt(this.curToken.literal, 10);
    if (isNaN(value)) {
      this.errors.push({ msg: `could not parse ${this.curToken.literal} as integer`, line: this.curToken.line, col: this.curToken.column });
      return null;
    }
    return new AST.IntegerLiteral(this.curToken, value);
  }

  private parseStringLiteral(): AST.Expression {
    return new AST.StringLiteral(this.curToken, this.curToken.literal);
  }

  private parseBoolean(): AST.Expression {
    return new AST.BooleanLiteral(this.curToken, this.curTokenIs(TokenType.True));
  }

  private parseNull(): AST.Expression {
    return new AST.NullLiteral(this.curToken);
  }

  private parsePrefixExpression(): AST.Expression {
    const token = this.curToken;
    const operator = this.curToken.literal;
    this.nextToken();
    const right = this.parseExpression(Precedence.PREFIX);
    // TODO: Handle null right
    return new AST.PrefixExpression(token, operator, right!);
  }

  private parseInfixExpression(left: AST.Expression): AST.Expression {
    const token = this.curToken;
    const operator = this.curToken.literal;
    const precedence = this.curPrecedence();
    this.nextToken();
    const right = this.parseExpression(precedence);
    return new AST.InfixExpression(token, left, operator, right!);
  }

  private parseQuestionExpression(left: AST.Expression): AST.Expression {
    const token = this.curToken;
    // It's a postfix operator, so we don't parse a right side.
    // But we just consumed the token? No, registerInfix is called when curToken is the operator.
    // We assume parseExpression loop consumes it?
    // parseExpression loop:
    // infix = infixParseFns[peekToken.type];
    // nextToken(); // curToken becomes operator
    // leftExp = infix(leftExp);

    // So yes, curToken is "?".
    return new AST.QuestionExpression(token, left);
  }

  private parseCastExpression(left: AST.Expression): AST.Expression | null {
    const token = this.curToken; // 'as' token
    this.nextToken(); // advance past 'as' to the target type
    const targetType = this.parseType();
    return new AST.CastExpression(token, left, targetType);
  }

  private parseGroupedExpression(): AST.Expression | null {
    const openToken = this.curToken; // the ( token

    // Check for zero-param closure: () -> Type { ... } or () { ... }
    if (this.peekTokenIs(TokenType.RPharen)) {
      // Could be () -> { ... } or just ()
      if (this.peekAheadTokenIs(TokenType.Arrow) || this.peekAheadTokenIs(TokenType.LBrace)) {
        this.nextToken(); // consume ), curToken = )
        return this.parseStandaloneClosure(openToken, []);
      }
      // Just empty parens
      this.nextToken(); // consume )
      return null;
    }

    // Detect standalone closure: (ident: Type, ...) -> ... { ... }
    // Unambiguous: (Identifier Colon ...) is never a valid grouped expression.
    if (this.peekTokenIs(TokenType.Identifier) && this.peekAheadTokenIs(TokenType.Colon)) {
      return this.parseClosureWithTypedParams(openToken);
    }

    // Regular grouped expression: (expr)
    this.nextToken();
    const exp = this.parseExpression(Precedence.LOWEST);
    if (!this.expectPeek(TokenType.RPharen)) {
      return null;
    }
    return exp;
  }

  /**
   * Parse a standalone closure with typed params: (x: i32, y: i32) -> i32 { ... }
   * curToken is ( when called.
   */
  private parseClosureWithTypedParams(openToken: Token): AST.Expression | null {
    const params: AST.ClosureParam[] = [];

    this.nextToken(); // move past ( to first param name

    // First param: ident : Type
    const firstToken = this.curToken;
    const firstName = new AST.Identifier(this.curToken, this.curToken.literal);
    this.nextToken(); // consume ident, move to :
    this.nextToken(); // consume :, move to type
    const firstType = this.parseType();
    params.push(new AST.ClosureParam(firstToken, firstName, firstType));

    // More params
    while (this.peekTokenIs(TokenType.Comma)) {
      this.nextToken(); // consume comma
      this.nextToken(); // move to next param name

      if (!this.curTokenIs(TokenType.Identifier)) return null;
      const paramToken = this.curToken;
      const paramName = new AST.Identifier(this.curToken, this.curToken.literal);

      if (!this.peekTokenIs(TokenType.Colon)) return null;
      this.nextToken(); // consume ident, move to :
      this.nextToken(); // consume :, move to type
      const paramType = this.parseType();
      params.push(new AST.ClosureParam(paramToken, paramName, paramType));
    }

    if (!this.expectPeek(TokenType.RPharen)) return null;

    return this.parseStandaloneClosure(openToken, params);
  }

  /**
   * Parse the rest of a standalone closure after params have been parsed.
   * curToken is ) after the param list.
   * Handles optional -> ReturnType and then { body }.
   */
  private parseStandaloneClosure(openToken: Token, params: AST.ClosureParam[]): AST.Expression | null {
    let returnType: AST.Type | null = null;

    // Optional return type: -> Type
    if (this.peekTokenIs(TokenType.Arrow)) {
      this.nextToken(); // move to ->
      this.nextToken(); // consume ->, move to type
      returnType = this.parseType();
    }

    if (!this.expectPeek(TokenType.LBrace)) return null;
    const body = this.parseBlockStatement();

    return new AST.ClosureExpression(openToken, params, body, returnType);
  }

  /**
   * Parse a trailing lambda: { params -> body } or { body } (implicit `it`).
   * curToken is { when called.
   *
   * Detection:
   *   { ident -> ... }          single param  (peek=Ident, peekAhead=Arrow)
   *   { ident, ... -> ... }     multi param   (peek=Ident, peekAhead=Comma)
   *   { ... }                   implicit `it` (everything else)
   */
  private parseTrailingLambda(): AST.ClosureExpression | null {
    const token = this.curToken; // the { token

    // Detect explicit params: { x -> ... } or { x, y -> ... }
    if (this.peekTokenIs(TokenType.Identifier) &&
        (this.peekAheadTokenIs(TokenType.Arrow) || this.peekAheadTokenIs(TokenType.Comma))) {
      return this.parseTrailingLambdaWithParams(token);
    }

    // Implicit `it` parameter — parse body directly
    const body = this.parseBlockStatement(); // consumes { ... }, curToken ends at }

    const itToken: Token = { type: TokenType.Identifier, literal: "it", line: token.line, column: token.column };
    const itParam = new AST.ClosureParam(itToken, new AST.Identifier(itToken, "it"), null);

    return new AST.ClosureExpression(token, [itParam], body, null, true);
  }

  /**
   * Parse trailing lambda with explicit params: { x -> body } or { x, y -> body }
   * curToken is { when called.
   */
  private parseTrailingLambdaWithParams(openToken: Token): AST.ClosureExpression | null {
    const params: AST.ClosureParam[] = [];

    this.nextToken(); // move past { to first param name

    // First param
    const firstToken = this.curToken;
    const firstName = new AST.Identifier(this.curToken, this.curToken.literal);
    params.push(new AST.ClosureParam(firstToken, firstName, null));

    // More params separated by commas
    while (this.peekTokenIs(TokenType.Comma)) {
      this.nextToken(); // consume comma
      if (!this.expectPeek(TokenType.Identifier)) return null;
      const pt = this.curToken;
      const pn = new AST.Identifier(this.curToken, this.curToken.literal);
      params.push(new AST.ClosureParam(pt, pn, null));
    }

    if (!this.expectPeek(TokenType.Arrow)) return null;

    // Parse body statements until }
    const body = new AST.BlockStatement(openToken);
    this.nextToken(); // move past -> to first statement

    while (!this.curTokenIs(TokenType.RBrace) && !this.curTokenIs(TokenType.EOF)) {
      const stmt = this.parseStatement();
      if (stmt) body.statements.push(stmt);
      this.nextToken();
    }
    // curToken is now }

    return new AST.ClosureExpression(openToken, params, body, null, false);
  }

  private parseIfExpression(): AST.Expression | null {
    const token = this.curToken;
    if (!this.expectPeek(TokenType.LPharen)) {
      // In Rust, if doesn't need parens, but let's stick to requiring them or not? 
      // User draft showed `if 5 < 10 {`. No parens!
      // My lexer tests used parens: `if (5 < 10)`.
      // I will enforce parens for now to simplify, or allow optional.
      // Let's assume standard Rust: NO parens required, but allowed.
      // But looking at my parser code: `expectPeek(TokenType.LPharen)` enforcing it.
      // Let's allow it to be optional later. For now, enforce it based on Lexer test.
      return null;
    }
    this.nextToken(); // consume (
    const condition = this.parseExpression(Precedence.LOWEST);

    if (!this.expectPeek(TokenType.RPharen)) {
      return null;
    }

    if (!this.expectPeek(TokenType.LBrace)) {
      return null;
    }

    const consequence = this.parseBlockStatement();

    let alternative: AST.BlockStatement | null = null;
    if (this.peekTokenIs(TokenType.Else)) {
      this.nextToken();
      if (!this.expectPeek(TokenType.LBrace)) {
        return null;
      }
      alternative = this.parseBlockStatement();
    }

    return new AST.IfExpression(token, condition!, consequence, alternative);
  }

  private parseMatchExpression(): AST.Expression | null {
    const token = this.curToken;

    this.nextToken(); // consume 'match'
    // Use CALL precedence to prevent { from being consumed as a struct literal
    const value = this.parseExpression(Precedence.CALL);

    if (!this.expectPeek(TokenType.LBrace)) {
      return null;
    }

    const matchExpr = new AST.MatchExpression(token, value!);

    this.nextToken(); // consume {

    while (!this.curTokenIs(TokenType.RBrace) && !this.curTokenIs(TokenType.EOF)) {
      // Parse arm: pattern => body,
      const armToken = this.curToken;
      const pattern = this.parsePattern();
      if (!pattern) return null;

      if (!this.expectPeek(TokenType.FatArrow)) {
        return null;
      }

      this.nextToken(); // consume =>

      let body: AST.Statement;
      if (this.curTokenIs(TokenType.LBrace)) {
        body = this.parseBlockStatement();
        if (this.peekTokenIs(TokenType.Comma)) {
          this.nextToken();
        }
      } else {
        const expr = this.parseExpression(Precedence.LOWEST);
        body = new AST.ExpressionStatement(this.curToken, expr);
        if (this.peekTokenIs(TokenType.Comma)) {
          this.nextToken();
        }
      }

      matchExpr.arms.push(new AST.MatchArm(armToken, pattern, body));

      this.nextToken(); // move to next start of pattern or }
    }

    return matchExpr;
  }

  private parsePattern(): AST.Pattern | null {
    // Wildcard: _
    if (this.curTokenIs(TokenType.Identifier) && this.curToken.literal === "_") {
      return new AST.WildcardPattern(this.curToken);
    }

    // Enum pattern: Ident::Ident or Ident::Ident(bindings)
    if (this.curTokenIs(TokenType.Identifier) && this.peekTokenIs(TokenType.DoubleColon)) {
      const enumToken = this.curToken;
      const enumName = new AST.Identifier(this.curToken, this.curToken.literal);
      this.nextToken(); // move to ::
      this.nextToken(); // consume ::, move to variant name

      if (!this.curTokenIs(TokenType.Identifier)) return null;
      const variantName = new AST.Identifier(this.curToken, this.curToken.literal);

      const bindings: AST.Identifier[] = [];
      if (this.peekTokenIs(TokenType.LPharen)) {
        this.nextToken(); // move to (
        this.nextToken(); // consume (, move to first binding

        while (!this.curTokenIs(TokenType.RPharen) && !this.curTokenIs(TokenType.EOF)) {
          bindings.push(new AST.Identifier(this.curToken, this.curToken.literal));
          if (this.peekTokenIs(TokenType.Comma)) {
            this.nextToken();
            this.nextToken();
          } else {
            this.nextToken();
          }
        }
        // curToken is )
      }

      return new AST.EnumPattern(enumToken, enumName, variantName, bindings);
    }

    // Literal pattern (int, string, bool, identifier)
    const expr = this.parseExpression(Precedence.LOWEST);
    if (!expr) return null;
    return new AST.LiteralPattern(this.curToken, expr);
  }

  private parseBlockStatement(): AST.BlockStatement {
    const block = new AST.BlockStatement(this.curToken);
    this.nextToken();

    while (!this.curTokenIs(TokenType.RBrace) && !this.curTokenIs(TokenType.EOF)) {
      const stmt = this.parseStatement();
      if (stmt !== null) {
        block.statements.push(stmt);
      }
      this.nextToken();
    }
    return block;
  }


  private parseFunctionLiteral(): AST.Expression | null {
    const fn = this.parseFunctionSignature();
    if (!this.expectPeek(TokenType.LBrace)) {
      return null;
    }
    fn.body = this.parseBlockStatement();
    return fn;
  }

  private parseFunctionParameters(): AST.Parameter[] {
    const params: AST.Parameter[] = [];

    if (this.peekTokenIs(TokenType.RPharen)) {
      this.nextToken();
      return params;
    }

    this.nextToken();

    // Parse first param: ident : type
    const firstParam = this.parseParameter();
    if (firstParam) params.push(firstParam);

    while (this.peekTokenIs(TokenType.Comma)) {
      this.nextToken();
      this.nextToken();
      const param = this.parseParameter();
      if (param) params.push(param);
    }

    if (!this.expectPeek(TokenType.RPharen)) {
      return [];
    }

    return params;
  }

  private parseParameter(): AST.Parameter | null {
    const token = this.curToken;
    const ident = new AST.Identifier(token, token.literal);

    if (!this.expectPeek(TokenType.Colon)) {
      return null;
    }

    this.nextToken();
    const type = this.parseType();

    return new AST.Parameter(token, ident, type);
  }

  /**
   * Parse type parameters with optional trait bounds: <T, U: Summary, V: Eq + Ord>
   * Returns { typeParams: string[], typeConstraints: Map<string, string[]> }
   * Assumes curToken is right before < (will peek for LT).
   */
  private parseTypeParamsWithBounds(): { typeParams: string[], typeConstraints: Map<string, string[]> } {
    const typeParams: string[] = [];
    const typeConstraints = new Map<string, string[]>();

    if (this.peekTokenIs(TokenType.LT)) {
        this.nextToken(); // consume <
        this.nextToken(); // move to first type param name (e.g., T)
        while (!this.curTokenIs(TokenType.GT) && !this.curTokenIs(TokenType.EOF)) {
            const paramName = this.curToken.literal;
            typeParams.push(paramName);

            // Check for trait bound: T: TraitName or T: Trait1 + Trait2
            if (this.peekTokenIs(TokenType.Colon)) {
                this.nextToken(); // consume :
                this.nextToken(); // move to first bound name
                const bounds: string[] = [];
                bounds.push(this.curToken.literal);
                // Handle multiple bounds with + separator
                while (this.peekTokenIs(TokenType.Plus)) {
                    this.nextToken(); // consume +
                    this.nextToken(); // move to next bound name
                    bounds.push(this.curToken.literal);
                }
                typeConstraints.set(paramName, bounds);
            }

            if (this.peekTokenIs(TokenType.Comma)) {
                this.nextToken(); // consume ,
                this.nextToken(); // move to next type param
            } else {
                this.nextToken(); // move to > (or EOF)
            }
        }
        // curToken is now GT (>)
    }

    return { typeParams, typeConstraints };
  }

  private parseType(): AST.Type {
    const token = this.curToken;
    if (token.type === TokenType.Star) {
      this.nextToken(); // consume *
      const elementType = this.parseType();
      return new AST.PointerType(token, elementType);
    }

    // Function type: (paramType, ...) -> returnType
    if (token.type === TokenType.LPharen) {
      const paramTypes: AST.Type[] = [];

      this.nextToken(); // consume (

      // Parse parameter types (may be empty)
      if (!this.curTokenIs(TokenType.RPharen)) {
        paramTypes.push(this.parseType());
        while (this.peekTokenIs(TokenType.Comma)) {
          this.nextToken(); // consume comma
          this.nextToken(); // move to next type
          paramTypes.push(this.parseType());
        }
        if (!this.expectPeek(TokenType.RPharen)) {
          return new AST.TypeIdentifier(token, "unknown");
        }
      }
      // curToken is now )

      if (!this.expectPeek(TokenType.Arrow)) {
        return new AST.TypeIdentifier(token, "unknown");
      }
      // curToken is now ->

      this.nextToken(); // move to return type
      const returnType = this.parseType();
      return new AST.FunctionTypeNode(token, paramTypes, returnType);
    }

    // For now, simple type identifiers like `int`, `string`, `Result<T>`
    // parsing generics is harder. MVP: just identifiers.
    const t = new AST.TypeIdentifier(token, token.literal);
    
    if (this.peekTokenIs(TokenType.LT)) {
        this.nextToken(); // consume <
        this.nextToken(); // move to first type param
        
        while (!this.curTokenIs(TokenType.GT) && !this.curTokenIs(TokenType.EOF)) {
            t.typeParams.push(this.parseType());
            
            if (this.peekTokenIs(TokenType.Comma)) {
                this.nextToken();
                this.nextToken();
            } else {
                // Advance past the type param (to GT or whatever comes next)
                this.nextToken();
            }
        }
    }
    
    return t;
  }

  private parseCallExpression(func: AST.Expression): AST.Expression {
    const token = this.curToken;
    const args = this.parseCallArguments();

    // Check for trailing lambda: foo(args) { ... }
    if (this.peekTokenIs(TokenType.LBrace)) {
      this.nextToken(); // move to {
      const lambda = this.parseTrailingLambda();
      if (lambda) args.push(lambda);
    }

    // Method call detection: v.push(42) → MethodCallExpression
    if (func instanceof AST.MemberAccessExpression) {
      return new AST.MethodCallExpression(token, func.left, func.member, args);
    }

    return new AST.CallExpression(token, func, args);
  }

  private parseCallArguments(): AST.Expression[] {
    const args: AST.Expression[] = [];
    if (this.peekTokenIs(TokenType.RPharen)) {
      this.nextToken();
      return args;
    }

    this.nextToken();
    const first = this.parseExpression(Precedence.LOWEST);
    if (first) args.push(first);

    while (this.peekTokenIs(TokenType.Comma)) {
      this.nextToken();
      this.nextToken();
      const arg = this.parseExpression(Precedence.LOWEST);
      if (arg) args.push(arg);
    }

    if (!this.expectPeek(TokenType.RPharen)) {
      return [];
    }
    return args;
  }

  private parseStaticCall(left: AST.Expression): AST.Expression | null {
    const token = this.curToken; // ::
    
    // Check for < (Generics)
    if (this.peekTokenIs(TokenType.LT)) {
        this.nextToken(); // consume ::
        this.nextToken(); // consume <
        
        const typeArgs: AST.Type[] = [];
        while (!this.curTokenIs(TokenType.GT) && !this.curTokenIs(TokenType.EOF)) {
            typeArgs.push(this.parseType());
            if (this.peekTokenIs(TokenType.Comma)) {
                this.nextToken();
                this.nextToken();
            } else {
                this.nextToken();
            }
        }
        
        return new AST.GenericInstantiationExpression(token, left, typeArgs);
    }

    // Handle generic enum variant: Option::<int>::Some(42)
    // left is GenericInstantiationExpression, extract the receiver Identifier
    let receiver: AST.Identifier;
    let genericTypeArgs: AST.Type[] | undefined;
    if (left instanceof AST.GenericInstantiationExpression && left.left instanceof AST.Identifier) {
        receiver = left.left;
        genericTypeArgs = left.typeArgs;
    } else if (left instanceof AST.Identifier) {
        receiver = left;
    } else {
        return null;
    }

    if (!this.expectPeek(TokenType.Identifier)) return null;
    const method = new AST.Identifier(this.curToken, this.curToken.literal);

    // Parentheses are optional (for unit enum variants like Color::Red)
    if (this.peekTokenIs(TokenType.LPharen)) {
      this.nextToken(); // consume to (
      const args = this.parseCallArguments();
      return new AST.StaticCallExpression(token, receiver, method, args, genericTypeArgs);
    }

    // No parentheses — unit variant or zero-arg static access
    return new AST.StaticCallExpression(token, receiver, method, [], genericTypeArgs);
  }

  private parseMemberAccess(left: AST.Expression): AST.Expression | null {
    const token = this.curToken;
    if (!this.expectPeek(TokenType.Identifier)) return null;
    const member = new AST.Identifier(this.curToken, this.curToken.literal);
    return new AST.MemberAccessExpression(token, left, member);
  }

  private parseIndexExpression(left: AST.Expression): AST.Expression | null {
    const token = this.curToken; // [
    this.nextToken();
    const index = this.parseExpression(Precedence.LOWEST);
    if (!index) return null;
    if (!this.expectPeek(TokenType.RBracket)) return null;
    return new AST.IndexExpression(token, left, index);
  }

  private parseMacroDefinition(): AST.MacroDefinition | null {
    const token = this.curToken;
    // macro name(args) { ... }
    if (!this.expectPeek(TokenType.Identifier)) return null;
    const name = new AST.Identifier(this.curToken, this.curToken.literal);

    if (!this.expectPeek(TokenType.LPharen)) return null;

    const params: AST.Identifier[] = [];
    if (!this.peekTokenIs(TokenType.RPharen)) {
      this.nextToken();
      params.push(new AST.Identifier(this.curToken, this.curToken.literal));
      while (this.peekTokenIs(TokenType.Comma)) {
        this.nextToken();
        this.nextToken();
        params.push(new AST.Identifier(this.curToken, this.curToken.literal));
      }
    }

    if (!this.expectPeek(TokenType.RPharen)) return null;

    if (!this.expectPeek(TokenType.LBrace)) return null;

    const body = this.parseBlockStatement();

    return new AST.MacroDefinition(token, name, params, body);
  }

  private parseMacroCall(left: AST.Expression): AST.Expression | null {
    // left is the Identifier (name)
    // curToken is Bang (!)

    if (!(left instanceof AST.Identifier)) {
      return null;
    }

    if (!this.expectPeek(TokenType.LPharen)) return null;

    const args = this.parseCallArguments(); // Reuse function call arg parsing

    return new AST.MacroCallExpression(left.token, left, args);
  }

  private parseQuoteExpression(): AST.Expression | null {
    const token = this.curToken;
    // quote! { ... }
    if (!this.expectPeek(TokenType.Bang)) return null;
    if (!this.expectPeek(TokenType.LBrace)) return null;

    const node = this.parseBlockStatement();

    return new AST.QuoteExpression(token, node);
  }

  private parseUnquoteExpression(): AST.Expression | null {
    const token = this.curToken; // $
    this.nextToken();
    // Parse the variable name or expression to unquote
    const expr = this.parseExpression(Precedence.PREFIX);
    return new AST.UnquoteExpression(token, expr!);
  }

  private parseBlockExpression(): AST.Expression | null {
    return this.parseBlockStatement() as unknown as AST.Expression;
  }

  private parseArrayLiteral(): AST.Expression | null {
    const token = this.curToken;
    const elements: AST.Expression[] = [];

    if (this.peekTokenIs(TokenType.RBracket)) {
      this.nextToken();
      return new AST.ArrayLiteral(token, elements);
    }

    this.nextToken();
    const first = this.parseExpression(Precedence.LOWEST);
    if (first) elements.push(first);

    while (this.peekTokenIs(TokenType.Comma)) {
      this.nextToken();
      this.nextToken();
      const el = this.parseExpression(Precedence.LOWEST);
      if (el) elements.push(el);
    }

    if (!this.expectPeek(TokenType.RBracket)) return null;

    return new AST.ArrayLiteral(token, elements);
  }

  private parseImportStatement(): AST.ImportStatement | null {
    const token = this.curToken;
    if (!this.expectPeek(TokenType.LBrace)) {
      return null;
    }
    this.nextToken(); // consume {

    const specifiers: AST.ImportSpecifier[] = [];

    while (!this.curTokenIs(TokenType.RBrace) && !this.curTokenIs(TokenType.EOF)) {
      const specToken = this.curToken;
      const name = new AST.Identifier(specToken, specToken.literal);
      let alias: AST.Identifier | null = null;

      if (this.peekTokenIs(TokenType.As)) {
        this.nextToken(); // consume name
        this.nextToken(); // consume 'as'
        alias = new AST.Identifier(this.curToken, this.curToken.literal);
      }

      specifiers.push(new AST.ImportSpecifier(specToken, name, alias));

      if (this.peekTokenIs(TokenType.Comma)) {
        this.nextToken();
      }
      this.nextToken();
    }

    if (!this.expectPeek(TokenType.From)) {
      return null;
    }

    if (!this.expectPeek(TokenType.String)) {
      return null;
    }

    const source = new AST.StringLiteral(this.curToken, this.curToken.literal);

    if (this.peekTokenIs(TokenType.Semi)) {
      this.nextToken();
    }

    return new AST.ImportStatement(token, specifiers, source);
  }

  private parseExportStatement(): AST.ExportStatement | null {
    const token = this.curToken;
    this.nextToken(); // consume export
    const stmt = this.parseStatement();
    if (!stmt) return null;
    return new AST.ExportStatement(token, stmt);
  }

  private registerPrefix(tokenType: TokenType, fn: PrefixParseFn) {
    this.prefixParseFns[tokenType] = fn;
  }

  private registerInfix(tokenType: TokenType, fn: InfixParseFn) {
    this.infixParseFns[tokenType] = fn;
  }

  private curTokenIs(t: TokenType): boolean {
    return this.curToken.type === t;
  }

  private peekTokenIs(t: TokenType): boolean {
    return this.peekToken.type === t;
  }

  private peekAheadTokenIs(t: TokenType): boolean {
    return this.peekAheadToken.type === t;
  }

  private expectPeek(t: TokenType): boolean {
    if (this.peekTokenIs(t)) {
      this.nextToken();
      return true;
    } else {
      this.peekError(t);
      return false;
    }
  }

  private peekPrecedence(): number {
    return PRECEDENCES[this.peekToken.type] || Precedence.LOWEST;
  }

  private curPrecedence(): number {
    return PRECEDENCES[this.curToken.type] || Precedence.LOWEST;
  }

  private peekError(t: TokenType) {
    const msg = `expected next token to be ${t}, got ${this.peekToken.type} instead`;
    this.errors.push({ msg, line: this.peekToken.line, col: this.peekToken.column });
  }

  private noPrefixParseFnError(t: TokenType) {
    const msg = `no prefix parse function for ${t} found`;
    this.errors.push({ msg, line: this.curToken.line, col: this.curToken.column });
  }
}
