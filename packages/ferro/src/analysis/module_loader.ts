import * as fs from "fs";
import * as path from "path";
import { Lexer } from "../lexer/lexer";
import { Parser } from "../parser/parser";
import * as AST from "../ast/ast";
import { Analyzer } from "./analyzer";
import { SymbolTable } from "./symbol_table";
import { Expander } from "../macros/expander";
import { VoidType } from "./types";

export interface CompiledModule {
    path: string;
    program: AST.Program;
    exports: SymbolTable; // Symbols exported by this module
    imports: Map<string, string>; // Map import source string to resolved absolute path
    scope?: SymbolTable; // The scope used for analysis (containing imports + locals)
}

export class ModuleLoader {
    private modules: Map<string, CompiledModule> = new Map();
    private analyzer: Analyzer;

    constructor() {
        this.analyzer = new Analyzer();
    }

    private loading: Set<string> = new Set();

    public load(entryPath: string): CompiledModule {
        const absolutePath = path.resolve(entryPath);

        if (this.modules.has(absolutePath)) {
            return this.modules.get(absolutePath)!;
        }

        if (this.loading.has(absolutePath)) {
            throw new Error(`Cyclic dependency detected: ${absolutePath}`);
        }

        this.loading.add(absolutePath);

        const content = fs.readFileSync(absolutePath, "utf-8");
        const lexer = new Lexer(content);
        const parser = new Parser(lexer);
        const parsedProgram = parser.ParseProgram();

        if (parser.getErrors().length > 0) {
            this.loading.delete(absolutePath);
            throw new Error(`Parse errors in ${entryPath}:\n${parser.getErrors().map(e => e.msg).join("\n")}`);
        }

        // Expand macros before analysis
        const expander = new Expander();
        const program = expander.expand(parsedProgram);

        const module: CompiledModule = {
            path: absolutePath,
            program: program,
            exports: new SymbolTable(),
            imports: new Map()
        };

        const moduleScope = new SymbolTable();
        // Define standard library / built-ins
        moduleScope.define("console", { kind: "primitive", name: "any" }, false, 0);
        moduleScope.define("print", { kind: "function", params: [{ kind: "primitive", name: "any" }], returnType: VoidType }, false, 0);
        moduleScope.define("drop", { kind: "function", params: [{ kind: "primitive", name: "any" }], returnType: VoidType }, false, 0);

        // First pass: Resolve imports and recursively load
        program.statements.forEach(stmt => {
            if (stmt instanceof AST.ImportStatement) {
                const importPath = stmt.source.value;
                const resolvedPath = this.resolvePath(absolutePath, importPath);
                module.imports.set(importPath, resolvedPath);

                console.log(`Loading imported module: ${resolvedPath}`);
                const importedModule = this.load(resolvedPath);

                // Populate local scope with imported symbols
                stmt.specifiers.forEach(spec => {
                    const importedName = spec.name.value;
                    const localName = spec.alias ? spec.alias.value : importedName;

                    const sym = importedModule.exports.resolve(importedName);
                    if (!sym) {
                        throw new Error(`Module '${importPath}' does not export '${importedName}'`);
                    }

                    // Propagate the original source module if known, otherwise use resolvedPath
                    const origin = sym.sourceModule || resolvedPath;
                    moduleScope.define(localName, sym.type, false, stmt.token.line, origin);
                });
            }
        });

        // Run analyzer with the populated scope
        this.analyzer.analyze(program, moduleScope, absolutePath);

        // extract exports from the now-populated scope
        program.statements.forEach(stmt => {
            if (stmt instanceof AST.ExportStatement) {
                let name = "";
                const inner = stmt.statement;

                // Handle different statement types that can be exported
                if (inner instanceof AST.LetStatement) {
                    name = inner.name.value;
                } else if (inner instanceof AST.StructDefinition) {
                    name = inner.name.value;
                } else if (inner instanceof AST.ExpressionStatement) {
                    if (inner.expression instanceof AST.FunctionLiteral) {
                        name = inner.expression.name;
                    }
                } else if (inner instanceof AST.BlockStatement) {
                    // unexpected for export?
                }

                if (name) {
                    const sym = moduleScope.resolve(name);
                    if (sym) {
                        // The symbol might be imported (re-export) or local.
                        // sym.sourceModule should already be correct.
                        module.exports.define(name, sym.type, sym.mutable, sym.definedAtLine, sym.sourceModule || absolutePath);
                    }
                }
            }
        });

        module.scope = moduleScope;

        this.modules.set(absolutePath, module);
        this.loading.delete(absolutePath);

        return module;
    }

    private resolvePath(currentPath: string, importSource: string): string {
        const dir = path.dirname(currentPath);
        // Start simple: strict relative paths "./" or absolute. 
        // Node resolution is complex.
        let resolved = path.join(dir, importSource);
        if (!resolved.endsWith(".fe")) {
            resolved += ".fe";
        }
        return resolved;
    }

    public getModule(path: string) {
        return this.modules.get(path);
    }

    public getAllModules() {
        return this.modules;
    }

    public getAnalyzer() {
        return this.analyzer;
    }
}
