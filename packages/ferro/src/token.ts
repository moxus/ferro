export enum TokenType {
  // Keywords
  Let = "LET",
  Mut = "MUT",
  Fn = "FN",
  Return = "RETURN",
  If = "IF",
  Else = "ELSE",
  Match = "MATCH",
  While = "WHILE",
  For = "FOR",
  In = "IN",
  Break = "BREAK",
  Continue = "CONTINUE",
  Struct = "STRUCT",
  Enum = "ENUM",
  Trait = "TRAIT",
  Impl = "IMPL",
  Macro = "MACRO",
  Quote = "QUOTE",
  True = "TRUE",
  False = "FALSE",
  Null = "NULL",

  // Modules
  Import = "IMPORT",
  Export = "EXPORT",
  From = "FROM",
  As = "AS",
  Pub = "PUB",
  Extern = "EXTERN",
  Unsafe = "UNSAFE",
  Const = "CONST",
  TypeKeyword = "TYPE",
  Async = "ASYNC",
  Await = "AWAIT",
  Weak = "WEAK",

  // Literals
  Identifier = "IDENTIFIER",
  Number = "NUMBER",
  Float = "FLOAT",
  String = "STRING",
  FString = "FSTRING", // f"...{expr}..."

  // Symbols
  LPharen = "LPHAREN", // (
  RPharen = "RPHAREN", // )
  LBrace = "LBRACE",   // {
  RBrace = "RBRACE",   // }
  LBracket = "LBRACKET", // [
  RBracket = "RBRACKET", // ]
  Arrow = "ARROW",     // ->
  FatArrow = "FATARROW", // =>
  Equals = "EQUALS",   // =
  Colon = "COLON",     // :
  DoubleColon = "DOUBLECOLON", // ::
  Dot = "DOT",         // .
  Semi = "SEMI",       // ;
  Comma = "COMMA",     // ,
  Plus = "PLUS",       // +
  Minus = "MINUS",     // -
  Star = "STAR",       // *
  Slash = "SLASH",     // /
  Percent = "PERCENT", // %
  EqEq = "EQEQ",       // ==
  NotEq = "NOTEQ",     // !=
  LT = "LT",           // <
  GT = "GT",           // >
  LtEq = "LTEQ",       // <=
  GtEq = "GTEQ",       // >=
  Question = "QUESTION", // ?
  Dollar = "DOLLAR",   // $
  Bang = "BANG",       // !
  Ampersand = "AMPERSAND", // &
  AmpAmp = "AMPAMP",       // &&
  PipePipe = "PIPEPIPE",   // ||
  DotDot = "DOTDOT",       // ..
  DotDotDot = "DOTDOTDOT", // ...

  EOF = "EOF",
  Illegal = "ILLEGAL",
}

export interface Token {
  type: TokenType;
  literal: string;
  line: number;
  column: number;
}

export const Keywords: Record<string, TokenType> = {
  let: TokenType.Let,
  mut: TokenType.Mut,
  fn: TokenType.Fn,
  return: TokenType.Return,
  if: TokenType.If,
  else: TokenType.Else,
  match: TokenType.Match,
  while: TokenType.While,
  for: TokenType.For,
  in: TokenType.In,
  break: TokenType.Break,
  continue: TokenType.Continue,
  struct: TokenType.Struct,
  enum: TokenType.Enum,
  trait: TokenType.Trait,
  impl: TokenType.Impl,
  macro: TokenType.Macro,
  quote: TokenType.Quote,
  true: TokenType.True,
  false: TokenType.False,
  null: TokenType.Null,
  import: TokenType.Import,
  export: TokenType.Export,
  from: TokenType.From,
  as: TokenType.As,
  pub: TokenType.Pub,
  extern: TokenType.Extern,
  unsafe: TokenType.Unsafe,
  const: TokenType.Const,
  type: TokenType.TypeKeyword,
  async: TokenType.Async,
  await: TokenType.Await,
  weak: TokenType.Weak,
};

export function lookupIdent(ident: string): TokenType {
  return Keywords[ident] || TokenType.Identifier;
}
