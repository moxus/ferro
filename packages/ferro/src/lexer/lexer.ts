import { Token, TokenType, lookupIdent } from "../token";

export class Lexer {
  private input: string;
  private position: number = 0; // current position in input (points to current char)
  private readPosition: number = 0; // current reading position in input (after current char)
  private ch: string | null = null; // current char under examination
  private line: number = 1;
  private column: number = 0;

  constructor(input: string) {
    this.input = input;
    this.readChar();
  }

  public nextToken(): Token {
    this.skipWhitespace();

    let tok: Token;
    const line = this.line;
    const col = this.column;

    if (this.ch === null) {
      return { type: TokenType.EOF, literal: "", line, column: col };
    }

    switch (this.ch) {
      case "=":
        if (this.peekChar() === "=") {
          const ch = this.ch;
          this.readChar();
          tok = { type: TokenType.EqEq, literal: ch + this.ch, line, column: col };
        } else if (this.peekChar() === ">") {
          const ch = this.ch;
          this.readChar();
          tok = { type: TokenType.FatArrow, literal: ch + this.ch, line, column: col };
        } else {
          tok = { type: TokenType.Equals, literal: this.ch, line, column: col };
        }
        break;
      case "!":
        if (this.peekChar() === "=") {
          const ch = this.ch;
          this.readChar();
          tok = { type: TokenType.NotEq, literal: ch + this.ch, line, column: col };
        } else {
          tok = { type: TokenType.Bang, literal: this.ch, line, column: col };
        }
        break;
      case ";":
        tok = { type: TokenType.Semi, literal: this.ch, line, column: col };
        break;
      case ":":
        if (this.peekChar() === ":") {
          const ch = this.ch;
          this.readChar();
          tok = { type: TokenType.DoubleColon, literal: ch + this.ch, line, column: col };
        } else {
          tok = { type: TokenType.Colon, literal: this.ch, line, column: col };
        }
        break;
      case ".":
        if (this.peekChar() === "." && this.readPosition + 1 < this.input.length && this.input[this.readPosition + 1] === ".") {
          this.readChar();
          this.readChar();
          tok = { type: TokenType.DotDotDot, literal: "...", line, column: col };
        } else if (this.peekChar() === ".") {
          const ch = this.ch;
          this.readChar();
          tok = { type: TokenType.DotDot, literal: ch + this.ch, line, column: col };
        } else {
          tok = { type: TokenType.Dot, literal: this.ch, line, column: col };
        }
        break;
      case ",":
        tok = { type: TokenType.Comma, literal: this.ch, line, column: col };
        break;
      case "(":
        tok = { type: TokenType.LPharen, literal: this.ch, line, column: col };
        break;
      case ")":
        tok = { type: TokenType.RPharen, literal: this.ch, line, column: col };
        break;
      case "{":
        tok = { type: TokenType.LBrace, literal: this.ch, line, column: col };
        break;
      case "}":
        tok = { type: TokenType.RBrace, literal: this.ch, line, column: col };
        break;
      case "[":
        tok = { type: TokenType.LBracket, literal: this.ch, line, column: col };
        break;
      case "]":
        tok = { type: TokenType.RBracket, literal: this.ch, line, column: col };
        break;
      case "+":
        tok = { type: TokenType.Plus, literal: this.ch, line, column: col };
        break;
      case "-":
        if (this.peekChar() === ">") {
          const ch = this.ch;
          this.readChar();
          tok = { type: TokenType.Arrow, literal: ch + this.ch, line, column: col };
        } else {
          tok = { type: TokenType.Minus, literal: this.ch, line, column: col };
        }
        break;
      case "*":
        tok = { type: TokenType.Star, literal: this.ch, line, column: col };
        break;
      case "/":
        if (this.peekChar() === "/") {
          this.readChar();
          this.readChar();
          // Cast to bypass TS analysis that thinks this.ch is still "/"
          while ((this.ch as any) !== "\n" && this.ch !== null) {
            this.readChar();
          }
          return this.nextToken();
        } else {
          tok = { type: TokenType.Slash, literal: this.ch, line, column: col };
        }
        break;
      case "<":
        if (this.peekChar() === "=") {
          const ch = this.ch;
          this.readChar();
          tok = { type: TokenType.LtEq, literal: ch + this.ch, line, column: col };
        } else {
          tok = { type: TokenType.LT, literal: this.ch, line, column: col };
        }
        break;
      case ">":
        if (this.peekChar() === "=") {
          const ch = this.ch;
          this.readChar();
          tok = { type: TokenType.GtEq, literal: ch + this.ch, line, column: col };
        } else {
          tok = { type: TokenType.GT, literal: this.ch, line, column: col };
        }
        break;
      case "?":
        tok = { type: TokenType.Question, literal: this.ch, line, column: col };
        break;
      case "$":
        tok = { type: TokenType.Dollar, literal: this.ch, line, column: col };
        break;
      case "&":
        if (this.peekChar() === "&") {
          this.readChar();
          tok = { type: TokenType.AmpAmp, literal: "&&", line, column: col };
        } else {
          tok = { type: TokenType.Ampersand, literal: this.ch, line, column: col };
        }
        break;
      case "|":
        if (this.peekChar() === "|") {
          this.readChar();
          tok = { type: TokenType.PipePipe, literal: "||", line, column: col };
        } else {
          tok = { type: TokenType.Illegal, literal: this.ch, line, column: col };
        }
        break;
      case '"':
        tok = { type: TokenType.String, literal: this.readString(), line, column: col };
        // readString advances position, so we return immediately
        return tok;
      default:
        if (this.isLetter(this.ch)) {
          const literal = this.readIdentifier();
          // f-string: f"..."
          if (literal === "f" && this.ch === '"') {
            const fstrContent = this.readFString();
            return { type: TokenType.FString, literal: fstrContent, line, column: col };
          }
          const type = lookupIdent(literal);
          return { type, literal, line, column: col };
        } else if (this.isDigit(this.ch)) {
          const numStr = this.readNumber();
          const tokType = numStr.includes('.') ? TokenType.Float : TokenType.Number;
          return { type: tokType, literal: numStr, line, column: col };
        } else {
          tok = { type: TokenType.Illegal, literal: this.ch, line, column: col };
        }
    }

    this.readChar();
    return tok;
  }

  private readChar() {
    if (this.readPosition >= this.input.length) {
      this.ch = null;
    } else {
      this.ch = this.input[this.readPosition];
    }
    this.position = this.readPosition;
    this.readPosition += 1;
    this.column += 1;
  }

  private peekChar(): string | null {
    if (this.readPosition >= this.input.length) {
      return null;
    } else {
      return this.input[this.readPosition];
    }
  }

  private readIdentifier(): string {
    const position = this.position;
    while (this.ch !== null && (this.isLetter(this.ch) || this.isDigit(this.ch))) {
      this.readChar();
    }
    return this.input.slice(position, this.position);
  }

  private readNumber(): string {
    const position = this.position;
    while (this.ch !== null && this.isDigit(this.ch)) {
      this.readChar();
    }
    // Check for fractional part: '.' followed by a digit (not '..' range operator)
    if (this.ch === '.' && this.peekChar() !== null && this.isDigit(this.peekChar()!)) {
      this.readChar(); // consume '.'
      while (this.ch !== null && this.isDigit(this.ch)) {
        this.readChar();
      }
    }
    return this.input.slice(position, this.position);
  }

  private readString(): string {
    const position = this.position + 1;
    while (true) {
      this.readChar();
      if (this.ch === '"' || this.ch === null) {
        break;
      }
    }
    const str = this.input.slice(position, this.position);
    this.readChar(); // Consume the closing quote
    return str;
  }

  private readFString(): string {
    // curToken is '"' (the opening quote after 'f')
    this.readChar(); // consume opening "
    let result = "";
    while (this.ch !== null) {
      if (this.ch === '"') {
        this.readChar(); // consume closing "
        break;
      }
      if (this.ch === '{') {
        result += '{';
        this.readChar();
        let depth = 1;
        while (this.ch !== null && depth > 0) {
          const c = this.ch as string;
          if (c === '{') depth++;
          if (c === '}') depth--;
          if (depth > 0) {
            result += this.ch;
            this.readChar();
          }
        }
        if ((this.ch as string) === '}') {
          result += '}';
          this.readChar();
        }
      } else {
        result += this.ch;
        this.readChar();
      }
    }
    return result;
  }

  private skipWhitespace() {
    while (this.ch === " " || this.ch === "\t" || this.ch === "\n" || this.ch === "\r") {
      if (this.ch === "\n") {
        this.line += 1;
        this.column = 0;
      }
      this.readChar();
    }
  }

  private isLetter(ch: string): boolean {
    return ("a" <= ch && ch <= "z") || ("A" <= ch && ch <= "Z") || ch === "_";
  }

  private isDigit(ch: string): boolean {
    return "0" <= ch && ch <= "9";
  }

  public saveState(): { position: number, readPosition: number, ch: string | null, line: number, column: number } {
    return { position: this.position, readPosition: this.readPosition, ch: this.ch, line: this.line, column: this.column };
  }

  public restoreState(state: { position: number, readPosition: number, ch: string | null, line: number, column: number }) {
    this.position = state.position;
    this.readPosition = state.readPosition;
    this.ch = state.ch;
    this.line = state.line;
    this.column = state.column;
  }
}