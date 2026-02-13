export interface ExecutionResult {
  output: string;
  error: string | null;
}

export function execute(code: string, timeoutMs: number = 5000): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const workerCode = `
      self.onmessage = function(e) {
        const output = [];

        console.log = function(...args) {
          output.push(args.map(function(a) {
            if (a === null) return 'null';
            if (a === undefined) return 'undefined';
            if (typeof a === 'object') return JSON.stringify(a);
            return String(a);
          }).join(' '));
        };
        console.error = console.log;
        console.warn = console.log;

        try {
          var fn = new Function(e.data);
          fn();
          self.postMessage({ output: output.join('\\n'), error: null });
        } catch (err) {
          self.postMessage({
            output: output.join('\\n'),
            error: err.message || String(err)
          });
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);

    const timer = setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ output: '', error: 'Execution timed out (possible infinite loop)' });
    }, timeoutMs);

    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(e.data);
    };

    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ output: '', error: e.message || 'Unknown execution error' });
    };

    worker.postMessage(code);
  });
}
