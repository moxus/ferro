import { Token } from "../token";

export interface Node {
  tokenLiteral(): string;
  toString(): string;
}

export interface Statement extends Node {
  statementNode(): void;
}

export interface Expression extends Node {
  expressionNode(): void;
}

export class Program implements Node {
  statements: Statement[] = [];

  tokenLiteral(): string {
    if (this.statements.length > 0) {
      return this.statements[0].tokenLiteral();
    } else {
      return "";
    }
  }

  toString(): string {
    return this.statements.map((s) => s.toString()).join("");
  }
}

export class Identifier implements Expression {
  token: Token;
  value: string;

  constructor(token: Token, value: string) {
    this.token = token;
    this.value = value;
  }

  expressionNode() { }
  tokenLiteral(): string {
    return this.token.literal;
  }
  toString(): string {
    return this.value;
  }
}

export class LetStatement implements Statement {
  token: Token;
  name: Identifier;
  value: Expression | null;
  mutable: boolean;
  type: Type | null = null;

  constructor(token: Token, name: Identifier, value: Expression | null, mutable: boolean = false) {
    this.token = token;
    this.name = name;
    this.value = value;
    this.mutable = mutable;
  }

  statementNode() { }
  tokenLiteral(): string {
    return this.token.literal;
  }
  toString(): string {
    const mutStr = this.mutable ? " mut" : "";
    let out = `${this.token.literal}${mutStr} ${this.name.toString()} = `;
    if (this.value) {
      out += this.value.toString();
    }
    out += ";";
    return out;
  }
}

export class ReturnStatement implements Statement {
  token: Token;
  returnValue: Expression | null;

  constructor(token: Token, returnValue: Expression | null) {
    this.token = token;
    this.returnValue = returnValue;
  }

  statementNode() { }
  tokenLiteral(): string {
    return this.token.literal;
  }
  toString(): string {
    let out = `${this.token.literal} `;
    if (this.returnValue) {
      out += this.returnValue.toString();
    }
    out += ";";
    return out;
  }
}

export class ExpressionStatement implements Statement {
  token: Token;
  expression: Expression | null;

  constructor(token: Token, expression: Expression | null) {
    this.token = token;
    this.expression = expression;
  }

  statementNode() { }
  tokenLiteral(): string {
    return this.token.literal;
  }
  toString(): string {
    if (this.expression) {
      return this.expression.toString();
    }
    return "";
  }
}

export class IntegerLiteral implements Expression {
  token: Token;
  value: number;

  constructor(token: Token, value: number) {
    this.token = token;
    this.value = value;
  }

  expressionNode() { }
  tokenLiteral(): string {
    return this.token.literal;
  }
  toString(): string {
    return this.token.literal;
  }
}

export class FloatLiteral implements Expression {
  token: Token;
  value: number;

  constructor(token: Token, value: number) {
    this.token = token;
    this.value = value;
  }

  expressionNode() { }
  tokenLiteral(): string {
    return this.token.literal;
  }
  toString(): string {
    return this.token.literal;
  }
}

export class StringLiteral implements Expression {
  token: Token;
  value: string;

  constructor(token: Token, value: string) {
    this.token = token;
    this.value = value;
  }

  expressionNode() { }
  tokenLiteral(): string {
    return this.token.literal;
  }
  toString(): string {
    return `"${this.token.literal}"`;
  }
}

export class BooleanLiteral implements Expression {
  token: Token;
  value: boolean;

  constructor(token: Token, value: boolean) {
    this.token = token;
    this.value = value;
  }

  expressionNode() { }
  tokenLiteral(): string {
    return this.token.literal;
  }
  toString(): string {
    return this.token.literal;
  }
}

export class NullLiteral implements Expression {
  token: Token;

  constructor(token: Token) {
    this.token = token;
  }

  expressionNode() { }
  tokenLiteral(): string { return "null"; }
  toString(): string { return "null"; }
}

export class PrefixExpression implements Expression {
  token: Token; // The prefix token, e.g. ! or -
  operator: string;
  right: Expression;

  constructor(token: Token, operator: string, right: Expression) {
    this.token = token;
    this.operator = operator;
    this.right = right;
  }

  expressionNode() { }
  tokenLiteral(): string {
    return this.token.literal;
  }
  toString(): string {
    return `(${this.operator}${this.right.toString()})`;
  }
}

export class InfixExpression implements Expression {
  token: Token; // The operator token, e.g. +
  left: Expression;
  operator: string;
  right: Expression;

  constructor(token: Token, left: Expression, operator: string, right: Expression) {
    this.token = token;
    this.left = left;
    this.operator = operator;
    this.right = right;
  }

  expressionNode() { }
  tokenLiteral(): string {
    return this.token.literal;
  }
  toString(): string {
    return `(${this.left.toString()} ${this.operator} ${this.right.toString()})`;
  }
}

export class BlockStatement implements Statement, Expression {
  token: Token; // {
  statements: Statement[] = [];

  constructor(token: Token) {
    this.token = token;
  }

  statementNode() { }
  expressionNode() { }
  tokenLiteral(): string {
    return this.token.literal;
  }
  toString(): string {
    let out = "";
    this.statements.forEach((s) => {
      out += s.toString();
    });
    return out;
  }
}

export class IfExpression implements Expression {
  token: Token;
  condition: Expression;
  consequence: BlockStatement;
  alternative: BlockStatement | null;

  constructor(token: Token, condition: Expression, consequence: BlockStatement, alternative: BlockStatement | null = null) {
    this.token = token;
    this.condition = condition;
    this.consequence = consequence;
    this.alternative = alternative;
  }

  expressionNode() { }
  tokenLiteral(): string {
    return this.token.literal;
  }
  toString(): string {
    let out = `if ${this.condition.toString()} { ${this.consequence.toString()} }`;
    if (this.alternative) {
      out += ` else { ${this.alternative.toString()} }`;
    }
    return out;
  }
}

export class WhileStatement implements Statement {
  token: Token; // while
  condition: Expression;
  body: BlockStatement;

  constructor(token: Token, condition: Expression, body: BlockStatement) {
    this.token = token;
    this.condition = condition;
    this.body = body;
  }

  statementNode() { }
  tokenLiteral(): string { return this.token.literal; }
  toString(): string {
    return `while ${this.condition.toString()} { ${this.body.toString()} }`;
  }
}

export class RangeExpression implements Expression {
  token: Token; // ..
  start: Expression;
  end: Expression;

  constructor(token: Token, start: Expression, end: Expression) {
    this.token = token;
    this.start = start;
    this.end = end;
  }

  expressionNode() { }
  tokenLiteral(): string { return this.token.literal; }
  toString(): string { return `${this.start.toString()}..${this.end.toString()}`; }
}

export class ForStatement implements Statement {
  token: Token; // for
  variable: Identifier;
  iterable: Expression;
  body: BlockStatement;

  constructor(token: Token, variable: Identifier, iterable: Expression, body: BlockStatement) {
    this.token = token;
    this.variable = variable;
    this.iterable = iterable;
    this.body = body;
  }

  statementNode() { }
  tokenLiteral(): string { return this.token.literal; }
  toString(): string {
    return `for (${this.variable.toString()} in ${this.iterable.toString()}) { ${this.body.toString()} }`;
  }
}

export class GenericInstantiationExpression implements Expression {
    token: Token; // ::
    left: Expression; // Box
    typeArgs: Type[]; // [int]

    constructor(token: Token, left: Expression, typeArgs: Type[]) {
        this.token = token;
        this.left = left;
        this.typeArgs = typeArgs;
    }

    expressionNode() {}
    tokenLiteral(): string { return this.token.literal; }
    toString(): string { return `${this.left.toString()}::<${this.typeArgs.map(t => t.toString()).join(", ")}>`; }
}

export class StructDefinition implements Statement {

    token: Token; // struct

    name: Identifier;

    typeParams: string[] = []; // <T, U>

    typeConstraints: Map<string, string[]> = new Map(); // T: Trait1 + Trait2

    fields: Parameter[]; // reusing Parameter {name, type}



    constructor(token: Token, name: Identifier, fields: Parameter[], typeParams: string[] = []) {

        this.token = token;

        this.name = name;

        this.fields = fields;

        this.typeParams = typeParams;

    }



    statementNode() {}

    tokenLiteral(): string { return this.token.literal; }

    toString(): string { 

        const params = this.typeParams.length > 0 ? `<${this.typeParams.join(", ")}>` : "";

        return `struct ${this.name.toString()}${params} { ... }`; 

    }

}



export class StructLiteral implements Expression {



    token: Token; // Identifier of the struct name



    name: Identifier;



    typeParams: Type[] = []; // Box<int>



    values: { name: Identifier, value: Expression }[];







    constructor(token: Token, name: Identifier, values: { name: Identifier, value: Expression }[], typeParams: Type[] = []) {



        this.token = token;



        this.name = name;



        this.values = values;



        this.typeParams = typeParams;



    }







    expressionNode() {}



    tokenLiteral(): string { return this.token.literal; }



    toString(): string { 



        const params = this.typeParams.length > 0 ? `<${this.typeParams.map(t => t.toString()).join(", ")}>` : "";



        return `${this.name.toString()}${params} { ... }`; 



    }



}




export interface Type extends Node {
  typeNode(): void;
}

export class TypeIdentifier implements Type {

  token: Token;

  value: string;

  typeParams: Type[] = []; // Box<int>



  constructor(token: Token, value: string, typeParams: Type[] = []) {

    this.token = token;

    this.value = value;

    this.typeParams = typeParams;

  }



  typeNode() {}

  tokenLiteral(): string { return this.token.literal; }

  toString(): string { 

      if (this.typeParams.length > 0) {

          return `${this.value}<${this.typeParams.map(t => t.toString()).join(", ")}>`;

      }

      return this.value; 

  }

}



export class Parameter implements Node {
  token: Token;
  name: Identifier;
  type: Type;

  constructor(token: Token, name: Identifier, type: Type) {
    this.token = token;
    this.name = name;
    this.type = type;
  }

  tokenLiteral(): string { return this.token.literal; }
  toString(): string { return `${this.name.toString()}: ${this.type.toString()}`; }
}

export class FunctionLiteral implements Expression {

  token: Token; // fn

  parameters: Parameter[] = [];

  body: BlockStatement;

  name: string = ""; // Optional name for the function

  returnType: Type | null = null;

  typeParams: string[] = []; // <T>

  typeConstraints: Map<string, string[]> = new Map(); // T: Trait1 + Trait2

  constructor(token: Token, body: BlockStatement) {

    this.token = token;

    this.body = body;

  }



  expressionNode() {}

  tokenLiteral(): string {

    return this.token.literal;

  }

  toString(): string {

    const params = this.parameters.map((p) => p.toString()).join(", ");

    const ret = this.returnType ? ` -> ${this.returnType.toString()}` : "";

    const tParams = this.typeParams.length > 0 ? `<${this.typeParams.join(", ")}>` : "";

    return `${this.token.literal} ${this.name}${tParams}(${params})${ret} { ${this.body.toString()} }`;

  }

}



export class CallExpression implements Expression {
  token: Token; // The '(' token
  function: Expression; // Identifier or FunctionLiteral
  arguments: Expression[];

  constructor(token: Token, fn: Expression, args: Expression[]) {
    this.token = token;
    this.function = fn;
    this.arguments = args;
  }

  expressionNode() { }
  tokenLiteral(): string {
    return this.token.literal;
  }
  toString(): string {
    const args = this.arguments.map((a) => a.toString()).join(", ");
    return `${this.function.toString()}(${args})`;
  }
}

export class StaticCallExpression implements Expression {
  token: Token; // ::
  receiver: Identifier;
  method: Identifier;
  arguments: Expression[];
  genericTypeArgs: Type[] = [];

  constructor(token: Token, receiver: Identifier, method: Identifier, args: Expression[], genericTypeArgs: Type[] = []) {
    this.token = token;
    this.receiver = receiver;
    this.method = method;
    this.arguments = args;
    this.genericTypeArgs = genericTypeArgs;
  }

  expressionNode() { }
  tokenLiteral(): string { return this.token.literal; }
  toString(): string {
    return `${this.receiver.toString()}::${this.method.toString()}(...)`;
  }
}

export class MemberAccessExpression implements Expression {
  token: Token; // .
  left: Expression;
  member: Identifier;

  constructor(token: Token, left: Expression, member: Identifier) {
    this.token = token;
    this.left = left;
    this.member = member;
  }

  expressionNode() { }
  tokenLiteral(): string { return this.token.literal; }
  toString(): string { return `${this.left.toString()}.${this.member.toString()}`; }
}

export class ArrayLiteral implements Expression {
  token: Token; // [
  elements: Expression[];

  constructor(token: Token, elements: Expression[]) {
    this.token = token;
    this.elements = elements;
  }

  expressionNode() { }
  tokenLiteral(): string { return this.token.literal; }
  toString(): string {
    return `[${this.elements.map(e => e.toString()).join(", ")}]`;
  }
}

export class IndexExpression implements Expression {
  token: Token; // [
  left: Expression;
  index: Expression;

  constructor(token: Token, left: Expression, index: Expression) {
    this.token = token;
    this.left = left;
    this.index = index;
  }

  expressionNode() { }
  tokenLiteral(): string { return this.token.literal; }
  toString(): string { return `${this.left.toString()}[${this.index.toString()}]`; }
}

export class MethodCallExpression implements Expression {
  token: Token; // the ( token
  object: Expression;
  method: Identifier;
  arguments: Expression[];

  constructor(token: Token, object: Expression, method: Identifier, args: Expression[]) {
    this.token = token;
    this.object = object;
    this.method = method;
    this.arguments = args;
  }

  expressionNode() { }
  tokenLiteral(): string { return this.token.literal; }
  toString(): string {
    const args = this.arguments.map(a => a.toString()).join(", ");
    return `${this.object.toString()}.${this.method.toString()}(${args})`;
  }
}

export class MacroDefinition implements Statement {
  token: Token; // macro
  name: Identifier;
  parameters: Identifier[]; // Macros usually just take identifiers (names of AST nodes)
  body: BlockStatement;

  constructor(token: Token, name: Identifier, parameters: Identifier[], body: BlockStatement) {
    this.token = token;
    this.name = name;
    this.parameters = parameters;
    this.body = body;
  }

  statementNode() { }
  tokenLiteral(): string { return this.token.literal; }
  toString(): string { return `macro ${this.name.toString()}(...) { ... }`; }
}

export class MacroCallExpression implements Expression, Statement {
  // Can be both? It's parsed as Expression. If top level, ExprStmt.
  token: Token; // The name of the macro
  name: Identifier;
  arguments: Expression[]; // The AST nodes passed to the macro

  constructor(token: Token, name: Identifier, args: Expression[]) {
    this.token = token;
    this.name = name;
    this.arguments = args;
  }

  expressionNode() { }
  statementNode() { }
  tokenLiteral(): string { return this.token.literal; }
  toString(): string { return `${this.name.toString()}!(...)`; }
}

export class QuoteExpression implements Expression {
  token: Token; // quote
  node: Node; // The AST inside the quote

  constructor(token: Token, node: Node) {
    this.token = token;
    this.node = node;
  }

  expressionNode() { }
  tokenLiteral(): string { return this.token.literal; }
  toString(): string { return `quote! { ${this.node.toString()} }`; }
}

export class UnquoteExpression implements Expression {
  // This represents $name inside a quote
  token: Token; // $
  expression: Expression; // The expression to evaluate and inject

  constructor(token: Token, expression: Expression) {
    this.token = token;
    this.expression = expression;
  }

  expressionNode() { }
  tokenLiteral(): string { return this.token.literal; }
  toString(): string { return `$${this.expression.toString()}`; }
}

export class QuestionExpression implements Expression {
  token: Token; // ?
  left: Expression;

  constructor(token: Token, left: Expression) {
    this.token = token;
    this.left = left;
  }

    expressionNode() {}

    tokenLiteral(): string { return this.token.literal; }

    toString(): string { return `${this.left.toString()}?`; }

  }

  

  export class AddressOfExpression implements Expression {

      token: Token; // &

      value: Expression;

  

      constructor(token: Token, value: Expression) {

          this.token = token;

          this.value = value;

      }

  

      expressionNode() {}

      tokenLiteral(): string { return this.token.literal; }

      toString(): string { return `&${this.value.toString()}`; }

  }

  export class CastExpression implements Expression {
      token: Token;       // the 'as' token
      expression: Expression;
      targetType: Type;

      constructor(token: Token, expression: Expression, targetType: Type) {
          this.token = token;
          this.expression = expression;
          this.targetType = targetType;
      }

      expressionNode() {}
      tokenLiteral(): string { return this.token.literal; }
      toString(): string { return `(${this.expression.toString()} as ${this.targetType.toString()})`; }
  }

  

  export class TraitDeclaration implements Statement {

  
  token: Token; // trait
  name: Identifier;
  methods: FunctionLiteral[] = [];

  constructor(token: Token, name: Identifier) {
    this.token = token;
    this.name = name;
  }

  statementNode() { }
  tokenLiteral(): string { return this.token.literal; }
  toString(): string { return `trait ${this.name.toString()} { ... }`; }
}

export class ImplBlock implements Statement {
  token: Token; // impl
  traitName: Identifier;
  targetType: Identifier;
  typeParams: string[] = [];
  typeConstraints: Map<string, string[]> = new Map(); // T: Trait1 + Trait2
  targetTypeArgs: string[] = [];  // e.g. impl<T> Trait for Box<T> → targetTypeArgs = ["T"]
  methods: FunctionLiteral[] = [];

  constructor(token: Token, traitName: Identifier, targetType: Identifier) {
    this.token = token;
    this.traitName = traitName;
    this.targetType = targetType;
  }

  statementNode() { }
  tokenLiteral(): string { return this.token.literal; }
  toString(): string {
    const tp = this.typeParams.length > 0 ? `<${this.typeParams.join(", ")}>` : "";
    const ta = this.targetTypeArgs.length > 0 ? `<${this.targetTypeArgs.join(", ")}>` : "";
    return `impl${tp} ${this.traitName.toString()} for ${this.targetType.toString()}${ta} { ... }`;
  }
}

export class MatchExpression implements Expression {

  token: Token; // match
  value: Expression;
  arms: MatchArm[] = [];

  constructor(token: Token, value: Expression) {
    this.token = token;
    this.value = value;
  }

  expressionNode() { }
  tokenLiteral(): string { return this.token.literal; }
  toString(): string {
    return `match ${this.value.toString()} { ... }`;
  }
}

export class MatchArm implements Node {
  token: Token;
  pattern: Pattern;
  body: Statement;

  constructor(token: Token, pattern: Pattern, body: Statement) {
    this.token = token;
    this.pattern = pattern;
    this.body = body;
  }

  tokenLiteral(): string { return this.token.literal; }
  toString(): string { return `${this.pattern.toString()} => ${this.body.toString()}`; }
}

export class ImportSpecifier implements Node {
  token: Token;
  name: Identifier;
  alias: Identifier | null;

  constructor(token: Token, name: Identifier, alias: Identifier | null = null) {
    this.token = token;
    this.name = name;
    this.alias = alias;
  }

  tokenLiteral(): string {
    return this.token.literal;
  }

  toString(): string {
    if (this.alias) {
      return `${this.name.toString()} as ${this.alias.toString()}`;
    }
    return this.name.toString();
  }
}

export class ImportStatement implements Statement {
  token: Token; // 'import'
  specifiers: ImportSpecifier[];
  source: StringLiteral;

  constructor(token: Token, specifiers: ImportSpecifier[], source: StringLiteral) {
    this.token = token;
    this.specifiers = specifiers;
    this.source = source;
  }

  statementNode() { }

  tokenLiteral(): string {
    return this.token.literal;
  }

  toString(): string {
    const specs = this.specifiers.map(s => s.toString()).join(", ");
    return `import { ${specs} } from ${this.source.toString()};`;
  }
}

export class ExportStatement implements Statement {
  token: Token; // 'export'
  statement: Statement;

  constructor(token: Token, statement: Statement) {
    this.token = token;
    this.statement = statement;
  }

  statementNode() { }

  tokenLiteral(): string {
    return this.token.literal;
  }

  toString(): string {
    return `export ${this.statement.toString()}`;
  }
}

export class ExternStatement implements Statement {
  token: Token; // extern
  name: Identifier;
  params: Parameter[];
  returnType: Type;
  variadic: boolean;

  constructor(token: Token, name: Identifier, params: Parameter[], returnType: Type, variadic: boolean = false) {
    this.token = token;
    this.name = name;
    this.params = params;
    this.returnType = returnType;
    this.variadic = variadic;
  }

  statementNode() { }

  tokenLiteral(): string {
    return this.token.literal;
  }

  toString(): string {
    const params = this.params.map(p => p.toString()).join(", ");
    const variadicSuffix = this.variadic ? (params.length > 0 ? ", ..." : "...") : "";
    return `extern fn ${this.name.toString()}(${params}${variadicSuffix}) -> ${this.returnType.toString()};`;
  }
}

export class UnsafeExpression implements Expression {
  token: Token; // unsafe
  block: BlockStatement;

  constructor(token: Token, block: BlockStatement) {
    this.token = token;
    this.block = block;
  }

  expressionNode() { }

  tokenLiteral(): string {
    return this.token.literal;
  }

  toString(): string {
    return `unsafe ${this.block.toString()}`;
  }
}

export class PointerType implements Type {
  token: Token; // *
  elementType: Type;

  constructor(token: Token, elementType: Type) {
    this.token = token;
    this.elementType = elementType;
  }

  typeNode() { }

  tokenLiteral(): string {
    return this.token.literal;
  }

  toString(): string {
    return `*${this.elementType.toString()}`;
  }
}

// --- Enum & ADT Nodes ---

export class EnumVariant implements Node {
  token: Token;
  name: Identifier;
  fields: Type[];

  constructor(token: Token, name: Identifier, fields: Type[]) {
    this.token = token;
    this.name = name;
    this.fields = fields;
  }

  tokenLiteral(): string { return this.token.literal; }
  toString(): string {
    if (this.fields.length > 0) {
      return `${this.name.toString()}(${this.fields.map(f => f.toString()).join(", ")})`;
    }
    return this.name.toString();
  }
}

export class EnumDefinition implements Statement {
  token: Token;
  name: Identifier;
  variants: EnumVariant[];
  typeParams: string[] = [];
  typeConstraints: Map<string, string[]> = new Map(); // T: Trait1 + Trait2

  constructor(token: Token, name: Identifier, variants: EnumVariant[], typeParams: string[] = []) {
    this.token = token;
    this.name = name;
    this.variants = variants;
    this.typeParams = typeParams;
  }

  statementNode() {}
  tokenLiteral(): string { return this.token.literal; }
  toString(): string {
    const tp = this.typeParams.length > 0 ? `<${this.typeParams.join(", ")}>` : "";
    return `enum ${this.name.toString()}${tp} { ${this.variants.map(v => v.toString()).join(", ")} }`;
  }
}

// --- Pattern Nodes (for match arms) ---

export interface Pattern extends Node {
  patternNode(): void;
}

export class LiteralPattern implements Pattern {
  token: Token;
  value: Expression;

  constructor(token: Token, value: Expression) {
    this.token = token;
    this.value = value;
  }

  patternNode() {}
  tokenLiteral(): string { return this.token.literal; }
  toString(): string { return this.value.toString(); }
}

export class EnumPattern implements Pattern {
  token: Token;
  enumName: Identifier;
  variantName: Identifier;
  bindings: Identifier[];

  constructor(token: Token, enumName: Identifier, variantName: Identifier, bindings: Identifier[]) {
    this.token = token;
    this.enumName = enumName;
    this.variantName = variantName;
    this.bindings = bindings;
  }

  patternNode() {}
  tokenLiteral(): string { return this.token.literal; }
  toString(): string {
    if (this.bindings.length > 0) {
      return `${this.enumName.toString()}::${this.variantName.toString()}(${this.bindings.map(b => b.toString()).join(", ")})`;
    }
    return `${this.enumName.toString()}::${this.variantName.toString()}`;
  }
}

export class WildcardPattern implements Pattern {
  token: Token;

  constructor(token: Token) {
    this.token = token;
  }

  patternNode() {}
  tokenLiteral(): string { return "_"; }
  toString(): string { return "_"; }
}

// --- Closure / Lambda Nodes ---

/**
 * ClosureExpression represents anonymous functions / lambdas.
 *
 * Standalone syntax:  (x: i32, y: i32) -> i32 { x + y }
 * Trailing lambda:    list.map { x -> x * 2 }
 * Implicit 'it':      list.map { it * 2 }
 * Zero params:        () -> string { "hello" }
 */
export class ClosureExpression implements Expression {
  token: Token; // ( or { token
  parameters: ClosureParam[];
  body: BlockStatement;
  returnType: Type | null;
  hasImplicitIt: boolean; // true when trailing lambda uses implicit `it`
  // Populated by the analyzer during capture analysis — names of outer-scope variables used in the body
  capturedVariables: string[] = [];

  constructor(
    token: Token,
    parameters: ClosureParam[],
    body: BlockStatement,
    returnType: Type | null = null,
    hasImplicitIt: boolean = false,
  ) {
    this.token = token;
    this.parameters = parameters;
    this.body = body;
    this.returnType = returnType;
    this.hasImplicitIt = hasImplicitIt;
  }

  expressionNode() {}
  tokenLiteral(): string { return this.token.literal; }
  toString(): string {
    const params = this.parameters.map(p => p.toString()).join(", ");
    const ret = this.returnType ? ` -> ${this.returnType.toString()}` : "";
    return `(${params})${ret} { ${this.body.toString()} }`;
  }
}

/**
 * ClosureParam — a closure parameter, optionally typed.
 * In standalone closures: (x: i32) — typed
 * In trailing lambdas:    { x -> ... } — untyped (inferred)
 */
export class ClosureParam implements Node {
  token: Token;
  name: Identifier;
  type: Type | null; // null for untyped trailing lambda params

  constructor(token: Token, name: Identifier, type: Type | null = null) {
    this.token = token;
    this.name = name;
    this.type = type;
  }

  tokenLiteral(): string { return this.token.literal; }
  toString(): string {
    if (this.type) {
      return `${this.name.toString()}: ${this.type.toString()}`;
    }
    return this.name.toString();
  }
}

/**
 * InterpolatedStringExpression — f"Hello {name}, age {age}"
 * Stores alternating literal parts and expression parts.
 * parts[0] is always a string literal (may be empty "").
 * parts[1] is the first expression, parts[2] the next literal, etc.
 */
export class InterpolatedStringExpression implements Expression {
  token: Token;
  parts: (StringLiteral | Expression)[]; // alternating: literal, expr, literal, expr, ..., literal

  constructor(token: Token, parts: (StringLiteral | Expression)[]) {
    this.token = token;
    this.parts = parts;
  }

  expressionNode() {}
  tokenLiteral(): string { return this.token.literal; }
  toString(): string {
    return `f"${this.parts.map(p => p instanceof StringLiteral ? p.value : `{${p.toString()}}`).join("")}"`;
  }
}

/**
 * FunctionTypeNode — represents a function type in type position.
 * Syntax: (i32, i32) -> i32
 */
export class FunctionTypeNode implements Type {
  token: Token;
  paramTypes: Type[];
  returnType: Type;

  constructor(token: Token, paramTypes: Type[], returnType: Type) {
    this.token = token;
    this.paramTypes = paramTypes;
    this.returnType = returnType;
  }

  typeNode() {}
  tokenLiteral(): string { return this.token.literal; }
  toString(): string {
    const params = this.paramTypes.map(t => t.toString()).join(", ");
    return `(${params}) -> ${this.returnType.toString()}`;
  }
}
