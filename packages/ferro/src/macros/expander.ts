import * as AST from "../ast/ast";
import { Lexer } from "../lexer/lexer";
import { Parser } from "../parser/parser";
import { Emitter } from "../codegen/emitter";

export class Expander {
    private macros: Map<string, AST.MacroDefinition> = new Map();

    public expand(program: AST.Program): AST.Program {
        // 1. Collect Macros and remove them from AST
        const newStmts: AST.Statement[] = [];
        for (const stmt of program.statements) {
            if (stmt instanceof AST.MacroDefinition) {
                this.macros.set(stmt.name.value, stmt);
            } else {
                newStmts.push(stmt);
            }
        }
        program.statements = newStmts;

        // 2. Expand Macro Calls recursively
        this.expandNode(program);

        return program;
    }

    private expandNode(node: AST.Node): void {
        if (node instanceof AST.Program || node instanceof AST.BlockStatement) {
             const container = node as { statements: AST.Statement[] };
             console.log("Expanding container with " + container.statements.length + " statements");
             for (let i = 0; i < container.statements.length; i++) {
                 const stmt = container.statements[i];
                 console.log("Statement:", stmt.constructor.name);
                 if (stmt instanceof AST.ExpressionStatement && stmt.expression instanceof AST.MacroCallExpression) {
                     console.log("Found Macro Call");
                     const expanded = this.runMacro(stmt.expression);
                     if (expanded instanceof AST.BlockStatement) {
                         // Replace macro call with expanded block
                         container.statements[i] = expanded;
                     }
                 } else {
                     this.expandNode(stmt);
                 }
             }
        }
        else if (node instanceof AST.ExpressionStatement) {
            if (node.expression) this.expandNode(node.expression);
        }
        else if (node instanceof AST.FunctionLiteral) {
            this.expandNode(node.body);
        }
    }

    private runMacro(call: AST.MacroCallExpression): AST.BlockStatement {
        const macroDef = this.macros.get(call.name.value);
        if (!macroDef) {
            throw new Error(`Macro ${call.name.value} not found`);
        }

        const argsMap = new Map<string, AST.Expression>();
        macroDef.parameters.forEach((param, i) => {
            if (i < call.arguments.length) {
                argsMap.set(param.value, call.arguments[i]);
            }
        });

        const jsCode = this.transpileMacroBody(macroDef.body);

        // Context variables (arguments)
        // We pass them as strings (source code of the arg)
        const argNames = Array.from(argsMap.keys());
        const argValues = Array.from(argsMap.values()).map(v => v.toString());
        
        // Construct the function
        const macroFunction = new Function(...argNames, jsCode);

        // Run
        let resultSource: string = "";
        try {
            resultSource = macroFunction(...argValues);
            console.log("Macro Result:", resultSource);
        } catch (e) {
            throw new Error(`Error expanding macro ${call.name.value}: ${e}`);
        }

        // Parse Result
        const lexer = new Lexer(resultSource);
        const parser = new Parser(lexer);
        const program = parser.ParseProgram();
        
        const block = new AST.BlockStatement(call.token);
        block.statements = program.statements;
        return block;
    }

    private transpileMacroBody(body: AST.BlockStatement): string {
        const emitter = new MacroEmitter();
        // Manually emit statements to ensure return
        const stmts = body.statements.map((stmt, i) => {
            let code = emitter.emit(stmt);
            if (i === body.statements.length - 1) {
                // If it's an expression statement, strip semicolon and add return
                if (code.endsWith(";")) code = code.slice(0, -1);
                return `return ${code};`;
            }
            return code;
        }).join("\n");
        return stmts;
    }
}

class MacroEmitter extends Emitter {
    
    public emit(node: AST.Node): string {
        if (node instanceof AST.QuoteExpression) {
             return this.emitQuote(node);
        }
        if (node instanceof AST.UnquoteExpression) {
            return "${" + node.expression.toString() + "}";
        }
        return super.emit(node);
    }
    
    private emitQuote(expr: AST.QuoteExpression): string {
        const innerSource = this.emitInner(expr.node);
        return "`" + innerSource + "`";
    }

    private emitInner(node: AST.Node): string {
        if (node instanceof AST.UnquoteExpression) {
             return "${" + node.expression.toString() + "}";
        }
        if (node instanceof AST.BlockStatement) {
             return node.statements.map(s => this.emitInner(s)).join("\n");
        }
        if (node instanceof AST.LetStatement) {
            const mut = node.mutable ? "mut " : "";
            const val = node.value ? this.emitInner(node.value) : "";
            return `let ${mut}${node.name.toString()} = ${val};`;
        }
        if (node instanceof AST.ReturnStatement) {
            const val = node.returnValue ? this.emitInner(node.returnValue) : "";
            return `return ${val};`;
        }
        if (node instanceof AST.ExpressionStatement) {
            return node.expression ? this.emitInner(node.expression) + ";" : "";
        }
        if (node instanceof AST.CallExpression) {
             const args = node.arguments.map(a => this.emitInner(a)).join(", ");
             return `${this.emitInner(node.function)}(${args})`;
        }
        // Fallback to toString() for simple literals/identifiers
        return node.toString(); 
    }
}