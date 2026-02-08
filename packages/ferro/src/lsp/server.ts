import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentSyncKind,
  InitializeResult
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Lexer } from '../lexer/lexer';
import { Parser } from '../parser/parser';
import * as AST from '../ast/ast';
import { Analyzer } from '../analysis/analyzer';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams) => {
  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Tell the client that this server supports code completion.
      completionProvider: {
        resolveProvider: true
      },
      // Hover support
      hoverProvider: true
    }
  };
  return result;
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
  validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const text = textDocument.getText();
  const lexer = new Lexer(text);
  const parser = new Parser(lexer);
  const program = parser.ParseProgram();
  const errors = parser.getErrors();

  const diagnostics: Diagnostic[] = [];

  // Syntax Errors
  if (errors.length > 0) {
      errors.forEach(err => {
          const diagnostic: Diagnostic = {
              severity: DiagnosticSeverity.Error,
              range: {
                  start: { line: err.line - 1, character: err.col }, 
                  end: { line: err.line - 1, character: err.col + 5 } 
              },
              message: err.msg,
              source: 'ferro-syntax'
          };
          diagnostics.push(diagnostic);
      });
  } else {
      // Run Semantic Analysis only if syntax is valid
      const analyzer = new Analyzer();
      analyzer.analyze(program);
      
      analyzer.diagnostics.forEach(err => {
          const diagnostic: Diagnostic = {
              severity: DiagnosticSeverity.Error,
              range: {
                  start: { line: err.line - 1, character: err.col },
                  end: { line: err.line - 1, character: err.col + 5 }
              },
              message: err.message,
              source: 'ferro-typecheck'
          };
          diagnostics.push(diagnostic);
      });
  }

  // Send the computed diagnostics to VSCode.
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onCompletion(
  (_textDocumentPosition: any): CompletionItem[] => {
    return [
      { label: 'fn', kind: CompletionItemKind.Keyword, data: 1 },
      { label: 'let', kind: CompletionItemKind.Keyword, data: 2 },
      { label: 'match', kind: CompletionItemKind.Keyword, data: 3 },
      { label: 'if', kind: CompletionItemKind.Keyword, data: 4 },
      { label: 'else', kind: CompletionItemKind.Keyword, data: 5 },
      { label: 'return', kind: CompletionItemKind.Keyword, data: 6 },
      { label: 'macro', kind: CompletionItemKind.Keyword, data: 7 },
      { label: 'quote', kind: CompletionItemKind.Keyword, data: 8 },
      { label: 'while', kind: CompletionItemKind.Keyword, data: 9 }
    ];
  }
);

connection.onCompletionResolve(
  (item: CompletionItem): CompletionItem => {
    if (item.data === 1) {
      item.detail = 'Function declaration';
      item.documentation = 'Declares a new function.';
    } else if (item.data === 2) {
      item.detail = 'Variable declaration';
      item.documentation = 'Declares a new variable (immutable by default).';
    } else if (item.data === 7) {
      item.detail = 'Macro definition';
      item.documentation = 'Defines a compile-time macro using quote!.';
    }
    return item;
  }
);

connection.onHover((params) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;

    const text = doc.getText();
    const lexer = new Lexer(text);
    const parser = new Parser(lexer);
    const program = parser.ParseProgram();

    const line = params.position.line + 1;
    const col = params.position.character;
    
    const node = findNodeAt(program, line, col);
    
    if (node) {
        if (node instanceof AST.MacroDefinition) {
            return { contents: { kind: 'markdown', value: `**Macro** \`${node.name.value}\`` } };
        }
        if (node instanceof AST.MacroCallExpression) {
            return { contents: { kind: 'markdown', value: `**Macro Call** \`${node.name.value}!\`` } };
        }
        if (node instanceof AST.Identifier) {
             return { contents: { kind: 'markdown', value: `**Variable/Identifier** \`${node.value}\`` } };
        }
    }
    return null;
});

function findNodeAt(node: AST.Node, line: number, col: number): AST.Node | null {
    if (node instanceof AST.Identifier) {
        if (isInside(node.token, line, col)) return node;
    }
    
    if (node instanceof AST.MacroCallExpression) {
        if (isInside(node.token, line, col)) return node;
        for (const arg of node.arguments) {
            const res = findNodeAt(arg, line, col);
            if (res) return res;
        }
    }
    
    if (node instanceof AST.MacroDefinition) {
        if (isInside(node.token, line, col)) return node;
        if (isInside(node.name.token, line, col)) return node;
        const res = findNodeAt(node.body, line, col);
        if (res) return res;
    }
    
    if (node instanceof AST.Program || node instanceof AST.BlockStatement) {
        const container = node as { statements: AST.Statement[] };
        for (const stmt of container.statements) {
            const res = findNodeAt(stmt, line, col);
            if (res) return res;
        }
    }
    
    if (node instanceof AST.ExpressionStatement) {
        if (node.expression) return findNodeAt(node.expression, line, col);
    }
    
    if (node instanceof AST.LetStatement) {
        if (isInside(node.name.token, line, col)) return node.name;
        if (node.value) return findNodeAt(node.value, line, col);
    }
    
    if (node instanceof AST.FunctionLiteral) {
        for (const p of node.parameters) {
             if (isInside(p.name.token, line, col)) return p.name;
        }
        return findNodeAt(node.body, line, col);
    }
    
    if (node instanceof AST.CallExpression) {
        const res = findNodeAt(node.function, line, col);
        if (res) return res;
        for (const arg of node.arguments) {
            const res2 = findNodeAt(arg, line, col);
            if (res2) return res2;
        }
    }

    return null;
}

function isInside(token: any, line: number, col: number): boolean {
    if (token.line !== line) return false;
    const len = token.literal.length;
    return col >= token.column && col < token.column + len;
}

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();