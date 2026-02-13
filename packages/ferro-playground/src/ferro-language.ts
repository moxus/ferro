// Monaco language definition for Ferro
// Adapted from the TextMate grammar in ferro-vscode

export const FERRO_LANGUAGE_ID = 'ferro';

export const FERRO_LANGUAGE_CONFIG = {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/'] as [string, string],
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ] as [string, string][],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string'] },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
};

export const FERRO_MONARCH_TOKENIZER = {
  keywords: [
    'fn', 'let', 'mut', 'return', 'if', 'else', 'match', 'while', 'for',
    'in', 'break', 'continue', 'struct', 'enum', 'trait', 'impl', 'macro',
    'quote', 'import', 'export', 'from', 'as', 'extern', 'unsafe', 'const',
    'type', 'async', 'await', 'pub', 'weak',
  ],

  typeKeywords: [
    'int', 'string', 'bool', 'f64', 'i8', 'void', 'Self',
    'Vec', 'HashMap', 'Option', 'Result', 'Weak', 'Promise',
  ],

  constants: ['true', 'false', 'null', 'None'],

  operators: [
    '=>', '->', '::', '==', '!=', '<=', '>=', '&&', '||',
    '..', '...', '=', '<', '>', '+', '-', '*', '/', '!', '?', '&',
  ],

  symbols: /[=><!~?:&|+\-*/^%]+/,

  tokenizer: {
    root: [
      // Comments
      [/\/\/.*$/, 'comment'],
      [/\/\*/, 'comment', '@comment'],

      // f-strings
      [/f"/, 'string', '@fstring'],

      // Strings
      [/"([^"\\]|\\.)*$/, 'string.invalid'],
      [/"/, 'string', '@string'],

      // Macro calls (name!)
      [/[a-zA-Z_]\w*(?=!)/, 'entity.name.function.macro'],
      [/!(?=[({])/, 'keyword.operator.macro'],

      // Macro unquote ($name)
      [/\$[a-zA-Z_]\w*/, 'variable.other.macro'],

      // Numbers
      [/\d+\.\d+/, 'number.float'],
      [/\d+/, 'number'],

      // Identifiers and keywords
      [/[a-zA-Z_]\w*/, {
        cases: {
          '@keywords': 'keyword',
          '@typeKeywords': 'type',
          '@constants': 'constant',
          '@default': 'identifier',
        }
      }],

      // Operators
      [/[{}()[\]]/, '@brackets'],
      [/@symbols/, {
        cases: {
          '@operators': 'operator',
          '@default': '',
        }
      }],

      // Delimiters
      [/[;,.]/, 'delimiter'],
    ],

    comment: [
      [/[^/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[/*]/, 'comment'],
    ],

    string: [
      [/[^\\"]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"/, 'string', '@pop'],
    ],

    fstring: [
      [/\{/, 'string.interpolation', '@fstringExpr'],
      [/[^"\\{]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"/, 'string', '@pop'],
    ],

    fstringExpr: [
      [/\}/, 'string.interpolation', '@pop'],
      [/[^}]+/, 'identifier'],
    ],
  },
};

// Keyword completions for the editor
export const FERRO_COMPLETIONS = [
  { label: 'fn', detail: 'Function declaration', insertText: 'fn ${1:name}(${2:params}) {\n\t$0\n}' },
  { label: 'let', detail: 'Immutable variable', insertText: 'let ${1:name} = ${0};' },
  { label: 'let mut', detail: 'Mutable variable', insertText: 'let mut ${1:name} = ${0};' },
  { label: 'if', detail: 'If expression', insertText: 'if (${1:condition}) {\n\t$0\n}' },
  { label: 'if else', detail: 'If-else expression', insertText: 'if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}' },
  { label: 'match', detail: 'Match expression', insertText: 'match ${1:value} {\n\t${2:pattern} => ${0},\n}' },
  { label: 'for', detail: 'For loop', insertText: 'for (${1:i} in ${2:0}..${3:10}) {\n\t$0\n}' },
  { label: 'while', detail: 'While loop', insertText: 'while (${1:condition}) {\n\t$0\n}' },
  { label: 'struct', detail: 'Struct definition', insertText: 'struct ${1:Name} {\n\t${2:field}: ${3:type}\n}' },
  { label: 'enum', detail: 'Enum definition', insertText: 'enum ${1:Name} {\n\t${2:Variant}\n}' },
  { label: 'trait', detail: 'Trait definition', insertText: 'trait ${1:Name} {\n\tfn ${2:method}(self: Self)${0};\n}' },
  { label: 'impl', detail: 'Implementation block', insertText: 'impl ${1:Type} {\n\t$0\n}' },
  { label: 'return', detail: 'Return statement', insertText: 'return ${0};' },
  { label: 'print', detail: 'Print to console', insertText: 'print(${0});' },
  { label: 'Vec::new', detail: 'Create new vector', insertText: 'Vec::new()' },
  { label: 'HashMap::new', detail: 'Create new hash map', insertText: 'HashMap::new()' },
  { label: 'Ok', detail: 'Result success', insertText: 'Ok(${0})' },
  { label: 'Err', detail: 'Result error', insertText: 'Err(${0})' },
  { label: 'Some', detail: 'Option with value', insertText: 'Some(${0})' },
];
