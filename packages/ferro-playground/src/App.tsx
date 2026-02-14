import { useState, useCallback, useRef, useEffect } from 'react';
import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import { puzzles, categories, type Puzzle } from './puzzles';
import { compile, getDiagnostics, type DiagnosticInfo } from './compiler';
import { execute } from './executor';
import {
  FERRO_LANGUAGE_ID,
  FERRO_LANGUAGE_CONFIG,
  FERRO_MONARCH_TOKENIZER,
  FERRO_COMPLETIONS,
} from './ferro-language';

type MonacoInstance = Parameters<BeforeMount>[0];
type EditorInstance = Parameters<OnMount>[0];

function App() {
  const [selectedId, setSelectedId] = useState(() => {
    const saved = localStorage.getItem('ferro-selected');
    if (saved && puzzles.find(p => p.id === saved)) return saved;
    return puzzles[0].id;
  });

  const [codes, setCodes] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('ferro-codes');
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return {};
  });

  const [completed, setCompleted] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('ferro-completed');
      if (saved) return new Set(JSON.parse(saved));
    } catch { /* ignore */ }
    return new Set();
  });

  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [testResult, setTestResult] = useState<'pass' | 'fail' | null>(null);
  const [hintIndex, setHintIndex] = useState(-1);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const monacoRef = useRef<MonacoInstance | null>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const diagnosticTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const puzzle = puzzles.find(p => p.id === selectedId)!;
  const code = codes[selectedId] ?? puzzle.starterCode;

  // Save state to localStorage
  const saveState = useCallback((newCodes: Record<string, string>, newCompleted: Set<string>) => {
    localStorage.setItem('ferro-codes', JSON.stringify(newCodes));
    localStorage.setItem('ferro-completed', JSON.stringify([...newCompleted]));
  }, []);

  const handleCodeChange = useCallback((value: string | undefined) => {
    const newCode = value ?? '';
    setCodes(prev => {
      const next = { ...prev, [selectedId]: newCode };
      localStorage.setItem('ferro-codes', JSON.stringify(next));
      return next;
    });

    // Debounced diagnostics
    clearTimeout(diagnosticTimerRef.current);
    diagnosticTimerRef.current = setTimeout(() => {
      updateDiagnostics(newCode);
    }, 500);
  }, [selectedId]);

  const updateDiagnostics = useCallback((source: string) => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (!monaco || !editor) return;

    const model = editor.getModel();
    if (!model) return;

    const diags = getDiagnostics(source);
    const markers = diags.map((d: DiagnosticInfo) => ({
      severity: monaco.MarkerSeverity.Error,
      message: d.message,
      startLineNumber: d.line,
      startColumn: d.col,
      endLineNumber: d.line,
      endColumn: d.col + 5,
    }));

    monaco.editor.setModelMarkers(model, 'ferro', markers);
  }, []);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setOutput('');
    setError(null);
    setTestResult(null);

    const result = compile(code);

    if (!result.code) {
      const errorMsg = result.diagnostics.map(d => `Line ${d.line}: ${d.message}`).join('\n');
      setError(errorMsg || 'Compilation failed');
      setRunning(false);
      return;
    }

    const execResult = await execute(result.code);

    if (execResult.error) {
      setOutput(execResult.output);
      setError(execResult.error);
      setTestResult('fail');
    } else {
      setOutput(execResult.output);
      const expected = puzzle.expectedOutput.trim();
      const actual = execResult.output.trim();

      if (expected === actual) {
        setTestResult('pass');
        setCompleted(prev => {
          const next = new Set(prev);
          next.add(selectedId);
          saveState(codes, next);
          return next;
        });
      } else {
        setTestResult('fail');
      }
    }

    setRunning(false);
  }, [code, puzzle, selectedId, codes, saveState]);

  const handleReset = useCallback(() => {
    setCodes(prev => {
      const next = { ...prev };
      delete next[selectedId];
      localStorage.setItem('ferro-codes', JSON.stringify(next));
      return next;
    });
    setOutput('');
    setError(null);
    setTestResult(null);
    setHintIndex(-1);
  }, [selectedId]);

  const handleSelectPuzzle = useCallback((id: string) => {
    setSelectedId(id);
    localStorage.setItem('ferro-selected', id);
    setOutput('');
    setError(null);
    setTestResult(null);
    setHintIndex(-1);
    setSidebarOpen(false);
  }, []);

  const handleShowHint = useCallback(() => {
    setHintIndex(prev => Math.min(prev + 1, puzzle.hints.length - 1));
  }, [puzzle]);

  // Register Ferro language before Monaco mounts
  const handleEditorWillMount: BeforeMount = useCallback((monaco) => {
    monacoRef.current = monaco;

    monaco.languages.register({ id: FERRO_LANGUAGE_ID });

    monaco.languages.setLanguageConfiguration(FERRO_LANGUAGE_ID, FERRO_LANGUAGE_CONFIG as any);

    monaco.languages.setMonarchTokensProvider(FERRO_LANGUAGE_ID, FERRO_MONARCH_TOKENIZER as any);

    // Completions
    monaco.languages.registerCompletionItemProvider(FERRO_LANGUAGE_ID, {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions = FERRO_COMPLETIONS.map((c, i) => ({
          label: c.label,
          kind: c.label.includes('::') ? monaco.languages.CompletionItemKind.Function : monaco.languages.CompletionItemKind.Keyword,
          insertText: c.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: c.detail,
          range,
          sortText: String(i).padStart(3, '0'),
        }));

        return { suggestions };
      },
    });

    // Custom dark theme
    monaco.editor.defineTheme('ferro-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'c586c0' },
        { token: 'type', foreground: '4ec9b0' },
        { token: 'constant', foreground: '569cd6' },
        { token: 'string', foreground: 'ce9178' },
        { token: 'string.escape', foreground: 'd7ba7d' },
        { token: 'string.interpolation', foreground: 'f97316' },
        { token: 'number', foreground: 'b5cea8' },
        { token: 'number.float', foreground: 'b5cea8' },
        { token: 'comment', foreground: '6a9955' },
        { token: 'operator', foreground: 'd4d4d4' },
        { token: 'delimiter', foreground: 'd4d4d4' },
        { token: 'entity.name.function.macro', foreground: 'dcdcaa' },
        { token: 'keyword.operator.macro', foreground: 'f97316' },
        { token: 'variable.other.macro', foreground: '9cdcfe' },
        { token: 'identifier', foreground: '9cdcfe' },
      ],
      colors: {
        'editor.background': '#0d1117',
        'editor.foreground': '#e6edf3',
        'editor.lineHighlightBackground': '#161b2280',
        'editorLineNumber.foreground': '#3d444d',
        'editorLineNumber.activeForeground': '#8b949e',
        'editor.selectionBackground': '#264f78',
        'editor.inactiveSelectionBackground': '#264f7840',
        'editorCursor.foreground': '#f97316',
        'editorIndentGuide.background': '#21262d',
        'editorIndentGuide.activeBackground': '#30363d',
      },
    });
  }, []);

  const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Initial diagnostics
    updateDiagnostics(code);

    // Keyboard shortcut: Ctrl/Cmd + Enter to run
    editor.addAction({
      id: 'ferro-run',
      label: 'Run Code',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => { handleRun(); },
    });
  }, [code, handleRun, updateDiagnostics]);

  // Update editor when puzzle changes
  useEffect(() => {
    if (editorRef.current) {
      const currentCode = codes[selectedId] ?? puzzle.starterCode;
      updateDiagnostics(currentCode);
    }
  }, [selectedId, codes, puzzle.starterCode, updateDiagnostics]);

  const completedCount = completed.size;
  const totalCount = puzzles.length;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="logo">
          <button
            className="hamburger"
            onClick={() => setSidebarOpen(prev => !prev)}
            aria-label="Toggle navigation"
          >
            <span /><span /><span />
          </button>
          <span className="logo-icon">Fe</span>
          Ferro Puzzles
        </div>
        <div className="header-right">
          <div className="header-stats">
            <strong>{completedCount}</strong> / {totalCount} completed
          </div>
          <a
            className="github-link"
            href="https://github.com/moxus/ferro"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Ferro on GitHub"
            title="View on GitHub"
          >
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
          </a>
        </div>
      </header>

      <div className="main">
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          {categories.map(cat => {
            const catPuzzles = puzzles.filter(p => p.category === cat);
            return (
              <div className="category" key={cat}>
                <div className="category-title">{cat}</div>
                {catPuzzles.map(p => (
                  <div
                    key={p.id}
                    className={`puzzle-item ${p.id === selectedId ? 'active' : ''} ${completed.has(p.id) ? 'completed' : ''}`}
                    onClick={() => handleSelectPuzzle(p.id)}
                  >
                    <span className="puzzle-check">
                      {completed.has(p.id) ? '\u2713' : '\u25CB'}
                    </span>
                    {p.title}
                    <span className={`puzzle-difficulty ${p.difficulty}`}>
                      {p.difficulty}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </nav>

        {/* Main Content */}
        <div className="content">
          {/* Puzzle Description */}
          <div className="puzzle-header">
            <h2 className="puzzle-title">{puzzle.title}</h2>
            <div
              className="puzzle-description"
              dangerouslySetInnerHTML={{ __html: renderDescription(puzzle.description) }}
            />
          </div>

          {/* Editor & Output */}
          <div className="editor-area">
            <div className="editor-container">
              <Editor
                height="100%"
                language={FERRO_LANGUAGE_ID}
                theme="ferro-dark"
                value={code}
                onChange={handleCodeChange}
                beforeMount={handleEditorWillMount}
                onMount={handleEditorDidMount}
                options={{
                  fontSize: 14,
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  padding: { top: 12 },
                  lineNumbers: 'on',
                  renderLineHighlight: 'line',
                  bracketPairColorization: { enabled: true },
                  automaticLayout: true,
                  tabSize: 4,
                  insertSpaces: true,
                  wordWrap: 'on',
                  suggestOnTriggerCharacters: true,
                  quickSuggestions: true,
                }}
              />
            </div>

            {/* Actions */}
            <div className="actions">
              <button
                className="btn btn-run"
                onClick={handleRun}
                disabled={running}
              >
                {running ? <><span className="spinner" /> Running...</> : 'Run'}
              </button>
              <button className="btn btn-secondary" onClick={handleReset}>
                Reset
              </button>
              {puzzle.hints.length > 0 && (
                <button className="btn btn-hint" onClick={handleShowHint}>
                  Hint {hintIndex >= 0 ? `(${hintIndex + 1}/${puzzle.hints.length})` : ''}
                </button>
              )}

              <div className="actions-right">
                {testResult === 'pass' && (
                  <span className="status-badge pass">All tests passed</span>
                )}
                {testResult === 'fail' && (
                  <span className="status-badge fail">Output mismatch</span>
                )}
              </div>
            </div>

            {/* Hints */}
            {hintIndex >= 0 && (
              <div className="hint-box" style={{ margin: '0 16px 0' }}>
                {puzzle.hints[hintIndex]}
              </div>
            )}

            {/* Output */}
            <div className="output-panel">
              <div className="output-header">Output</div>
              <div className={`output-content ${output || error ? 'has-output' : ''}`}>
                {!output && !error && (
                  <span style={{ color: 'var(--text-muted)' }}>
                    Click "Run" or press Ctrl+Enter to execute your code
                  </span>
                )}
                {output && (
                  <div>{output}</div>
                )}
                {error && (
                  <div className="error-text">{error}</div>
                )}
                {testResult === 'pass' && (
                  <div className="success-text" style={{ marginTop: '8px' }}>
                    Correct! Your output matches the expected result.
                  </div>
                )}
                {testResult === 'fail' && !error && (
                  <div className="error-text" style={{ marginTop: '8px' }}>
                    Expected output:{'\n'}{puzzle.expectedOutput}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple markdown-like renderer for puzzle descriptions
function renderDescription(text: string): string {
  return text
    // Code blocks (```)
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Line breaks
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

export default App;
