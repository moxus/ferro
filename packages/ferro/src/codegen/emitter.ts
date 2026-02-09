
import * as AST from "../ast/ast";

export class Emitter {
    private enumDefinitions: Map<string, AST.EnumDefinition> = new Map();
    private hashMapVars: Set<string> = new Set();
    private structVars: Set<string> = new Set();
    private hasIntoIterator: boolean = false;

    public emit(node: AST.Node): string {
        if (node instanceof AST.Program) {
            return this.emitProgram(node);
        }
        if (node instanceof AST.LetStatement) {
            return this.emitLetStatement(node);
        }
        if (node instanceof AST.ReturnStatement) {
            return this.emitReturnStatement(node);
        }
        if (node instanceof AST.TraitDeclaration) {
            return this.emitTraitDeclaration(node);
        }
        if (node instanceof AST.ImplBlock) {
            return this.emitImplBlock(node);
        }
        if (node instanceof AST.StructDefinition) {
            return this.emitStructDefinition(node);
        }
        if (node instanceof AST.EnumDefinition) {
            return this.emitEnumDefinition(node);
        }
        if (node instanceof AST.ImportStatement) {
            return this.emitImportStatement(node);
        }
        if (node instanceof AST.ExportStatement) {
            return this.emitExportStatement(node);
        }
        if (node instanceof AST.WhileStatement) {
            return this.emitWhileStatement(node);
        }
        if (node instanceof AST.ForStatement) {
            return this.emitForStatement(node);
        }
        if (node instanceof AST.ExpressionStatement) {
            return this.emitExpressionStatement(node);
        }
        if (node instanceof AST.BlockStatement) {
            return this.emitBlockStatement(node);
        }
        if (node instanceof AST.IntegerLiteral) {
            return node.value.toString();
        }
        if (node instanceof AST.BooleanLiteral) {
            return node.value.toString();
        }
        if (node instanceof AST.StringLiteral) {
            return `"${node.value}"`;
        }
        if (node instanceof AST.Identifier) {
            return node.value;
        }
        if (node instanceof AST.PrefixExpression) {
            return `${node.operator}${this.emit(node.right)}`;
        }
        if (node instanceof AST.InfixExpression) {
            return `${this.emit(node.left)} ${node.operator} ${this.emit(node.right)}`;
        }
        if (node instanceof AST.IfExpression) {
            return this.emitIfExpression(node);
        }
        if (node instanceof AST.FunctionLiteral) {
            return this.emitFunctionLiteral(node);
        }
        if (node instanceof AST.CallExpression) {
            return this.emitCallExpression(node);
        }
        if (node instanceof AST.StaticCallExpression) {
            return this.emitStaticCallExpression(node);
        }
        if (node instanceof AST.MemberAccessExpression) {
            return this.emitMemberAccessExpression(node);
        }
        if (node instanceof AST.ArrayLiteral) {
            return `[${node.elements.map(e => this.emit(e)).join(", ")}]`;
        }
        if (node instanceof AST.IndexExpression) {
            return `${this.emit(node.left)}[${this.emit(node.index)}]`;
        }
        if (node instanceof AST.MethodCallExpression) {
            const obj = this.emit(node.object);
            const method = node.method.value;
            // collect() is identity for TS arrays (map/filter already return arrays eagerly)
            if (method === "collect") return obj;
            // iter() is identity for TS arrays (JS arrays are already iterable)
            if (method === "iter") return obj;
            // count() → .length
            if (method === "count") return `${obj}.length`;
            // sum() → .reduce((a, b) => a + b, 0)
            if (method === "sum") return `${obj}.reduce((a: number, b: number) => a + b, 0)`;
            // for_each(f) → .forEach(f)
            if (method === "for_each") {
                const args = node.arguments.map(a => this.emit(a)).join(", ");
                return `${obj}.forEach(${args})`;
            }
            // HashMap keys()/values() return iterators in JS, need to spread into arrays
            if (node.object instanceof AST.Identifier && this.hashMapVars.has(node.object.value)) {
                if (method === "keys") return `[...${obj}.keys()]`;
                if (method === "values") return `[...${obj}.values()]`;
            }
            const args = node.arguments.map(a => this.emit(a)).join(", ");
            return `${obj}.${method}(${args})`;
        }
        if (node instanceof AST.MatchExpression) {
            return this.emitMatchExpression(node);
        }
        if (node instanceof AST.StructLiteral) {
            return this.emitStructLiteral(node);
        }
        if (node instanceof AST.QuestionExpression) {
            return `_try(${this.emit(node.left)})`;
        }
        if (node instanceof AST.CastExpression) {
            return this.emitCastExpression(node);
        }
        if (node instanceof AST.InterpolatedStringExpression) {
            return this.emitInterpolatedString(node);
        }
        if (node instanceof AST.GenericInstantiationExpression) {
            return this.emit(node.left);
        }
        if (node instanceof AST.ClosureExpression) {
            return this.emitClosureExpression(node);
        }

        return "";
    }

    private emitProgram(program: AST.Program): string {
        const runtime = `
// Ferro Runtime
class _ResultError extends Error {
  public error: any;
  constructor(error: any) { super(); this.error = error; }
}
function _try(res: any) {
  if (res && res.ok === true) return res.value;
  if (res && res.ok === false) throw new _ResultError(res.error);
  return res;
}
function Ok(value: any) { return { ok: true, value }; }
function Err(error: any) { return { ok: false, error }; }
function _getType(obj: any) {
  if (obj === null || obj === undefined) return "null";
  const type = typeof obj;
  if (type === "object") return obj.constructor.name;
  return type; // "string", "number", etc
}
`;
        return runtime + program.statements.map((stmt) => this.emit(stmt)).join("\n");
    }

    private emitLetStatement(stmt: AST.LetStatement): string {
        const keyword = stmt.mutable ? "let" : "const";
        const value = stmt.value ? this.emit(stmt.value) : "undefined";
        const typeAnn = stmt.type ? `: ${stmt.type.toString()}` : "";
        // Track HashMap variables for iteration semantics
        if (stmt.value instanceof AST.StaticCallExpression) {
            const sc = stmt.value as AST.StaticCallExpression;
            if (sc.receiver.value === "HashMap" && sc.method.value === "new") {
                this.hashMapVars.add(stmt.name.value);
            }
        }
        // Track struct variables for IntoIterator dispatch
        if (stmt.value instanceof AST.StructLiteral) {
            this.structVars.add(stmt.name.value);
        }
        return `${keyword} ${stmt.name.value}${typeAnn} = ${value};`;
    }

    private emitReturnStatement(stmt: AST.ReturnStatement): string {
        const value = stmt.returnValue ? this.emit(stmt.returnValue) : "";
        return `return ${value};`;
    }

    private emitTraitDeclaration(trait: AST.TraitDeclaration): string {
        if (trait.name.value === "IntoIterator") this.hasIntoIterator = true;
        const methods = trait.methods.map(m => `  ${m.name}: new Map()`).join(",\n");
        return `const ${trait.name.value} = {\n${methods}\n};`;
    }

    private mapJSTypeName(fsType: string): string {
        // Map Ferro type names to JS runtime type names for _getType dispatch
        switch (fsType) {
            case "int": return "number";
            case "bool": return "boolean";
            case "string": return "string";
            default: return fsType;
        }
    }

    private emitImplBlock(impl: AST.ImplBlock): string {
        const traitName = impl.traitName.value;
        const targetType = this.mapJSTypeName(impl.targetType.value);
        const typeParamsStr = impl.typeParams.length > 0
            ? `<${impl.typeParams.join(", ")}>`
            : "";

        const methods = impl.methods.map(m => {
            const params = m.parameters.map(p => `${p.name.value}: any`).join(", ");
            const body = this.emitBlockStatement(m.body, true);
            if (impl.typeParams.length > 0) {
                // Generic impl: register with base type name, wrap in generic function
                return `${traitName}.${m.name}.set("${targetType}", function${typeParamsStr}(${params}) ${body});`;
            }
            return `${traitName}.${m.name}.set("${targetType}", function(${params}) ${body});`;
        }).join("\n");

        return methods;
    }

    private emitStructDefinition(node: AST.StructDefinition): string {
        const typeParams = node.typeParams.length > 0
            ? `<${node.typeParams.join(", ")}>`
            : "";
        const fields = node.fields.map(f => `  ${f.name.value}: ${this.mapTSType(f.type)};`).join("\n");
        return `interface ${node.name.value}${typeParams} {\n${fields}\n}`;
    }

    private emitStructLiteral(node: AST.StructLiteral): string {
        const values = node.values.map(v => `${v.name.value}: ${this.emit(v.value)}`).join(", ");
        return `{ ${values} }`;
    }

    private emitEnumDefinition(node: AST.EnumDefinition): string {
        const enumName = node.name.value;
        this.enumDefinitions.set(enumName, node);

        const lines: string[] = [];

        // Emit constructor object with factory functions
        lines.push(`const ${enumName} = {`);
        node.variants.forEach(v => {
            if (v.fields.length === 0) {
                lines.push(`  ${v.name.value}: { tag: "${v.name.value}" },`);
            } else {
                const params = v.fields.map((_, i) => `_${i}`).join(", ");
                lines.push(`  ${v.name.value}: (${params}) => ({ tag: "${v.name.value}", ${params} }),`);
            }
        });
        lines.push(`};`);

        return lines.join("\n");
    }

    private mapTSType(type: AST.Type): string {
        if (type instanceof AST.TypeIdentifier) {
            const name = type.value;
            const mapped = name === "int" ? "number"
                : name === "string" ? "string"
                : name === "bool" ? "boolean"
                : name === "void" ? "void"
                : name; // Preserve generic param names like T, U
            if (type.typeParams.length > 0) {
                const args = type.typeParams.map(t => this.mapTSType(t)).join(", ");
                return `${mapped}<${args}>`;
            }
            return mapped;
        }
        if (type instanceof AST.PointerType) {
            return "any";
        }
        const name = type.toString();
        if (name === "int") return "number";
        if (name === "string") return "string";
        if (name === "bool") return "boolean";
        return "any";
    }

    private emitCastExpression(node: AST.CastExpression): string {
        const inner = this.emit(node.expression);
        const targetName = node.targetType instanceof AST.TypeIdentifier ? node.targetType.value : node.targetType.toString();
        if (targetName === "bool") return `(!!(${inner}))`;
        if (targetName === "int" || targetName === "i8") return `((${inner}) | 0)`;
        return inner;
    }

    private emitImportStatement(node: AST.ImportStatement): string {
        const specs = node.specifiers.map(s => {
            if (s.alias) return `${s.name.value} as ${s.alias.value}`;
            return s.name.value;
        }).join(", ");
        return `import { ${specs} } from ${node.source.toString()};`;
    }

    private emitExportStatement(node: AST.ExportStatement): string {
        const inner = this.emit(node.statement);
        return `export ${inner}`;
    }

    private emitExpressionStatement(stmt: AST.ExpressionStatement): string {
        if (stmt.expression instanceof AST.IfExpression) {
            return this.emitIfStatement(stmt.expression);
        }
        if (stmt.expression) {
            return `${this.emit(stmt.expression)};`;
        }
        return "";
    }

    private emitIfStatement(expr: AST.IfExpression): string {
        let out = `if (${this.emit(expr.condition)}) ${this.emitBlockStatement(expr.consequence)}`;
        if (expr.alternative) {
            out += ` else ${this.emitBlockStatement(expr.alternative)}`;
        }
        return out;
    }

    private emitWhileStatement(stmt: AST.WhileStatement): string {
        return `while (${this.emit(stmt.condition)}) ${this.emitBlockStatement(stmt.body)}`;
    }

    private emitForStatement(stmt: AST.ForStatement): string {
        if (stmt.iterable instanceof AST.RangeExpression) {
            const varName = stmt.variable.value;
            const start = this.emit(stmt.iterable.start);
            const end = this.emit(stmt.iterable.end);
            const body = this.emitBlockStatement(stmt.body);
            return `for (let ${varName} = ${start}; ${varName} < ${end}; ${varName}++) ${body}`;
        }
        // Collection iteration
        const varName = stmt.variable.value;
        const collection = this.emit(stmt.iterable);
        const body = this.emitBlockStatement(stmt.body);
        // HashMap iteration: JS Map for...of yields [key, value], so use .keys()
        if (stmt.iterable instanceof AST.Identifier && this.hashMapVars.has(stmt.iterable.value)) {
            return `for (const ${varName} of ${collection}.keys()) ${body}`;
        }
        // IntoIterator: if iterable is a struct variable with IntoIterator trait, use dispatch
        if (this.hasIntoIterator && stmt.iterable instanceof AST.Identifier && this.structVars.has(stmt.iterable.value)) {
            return `for (const ${varName} of IntoIterator.into_iter.get(_getType(${collection}))(${collection})) ${body}`;
        }
        return `for (const ${varName} of ${collection}) ${body}`;
    }

    private emitBlockStatement(block: AST.BlockStatement, forceReturn: boolean = false): string {
        const stmts = block.statements.map((stmt, index) => {
            if (forceReturn && index === block.statements.length - 1 && stmt instanceof AST.ExpressionStatement) {
                if (stmt.expression) {
                    return `return ${this.emit(stmt.expression)};`;
                }
            }
            return this.emit(stmt);
        });
        return `{\n${stmts.join("\n")}\n}`;
    }

    private emitIfExpression(expr: AST.IfExpression): string {
        let out = `(() => {\nif (${this.emit(expr.condition)}) `;
        out += this.emitBlockStatement(expr.consequence, true);
        if (expr.alternative) {
            out += ` else ${this.emitBlockStatement(expr.alternative, true)}`;
        }
        out += `\n})()`;
        return out;
    }

    private emitFunctionLiteral(fn: AST.FunctionLiteral): string {
        const typeParams = fn.typeParams.length > 0
            ? `<${fn.typeParams.join(", ")}>`
            : "";
        const params = fn.parameters.map(p => `${p.name.value}: ${this.mapTSType(p.type)}`).join(", ");

        const bodyStmts = fn.body.statements.map((stmt, i) => {
            if (i === fn.body.statements.length - 1 && stmt instanceof AST.ExpressionStatement) {
                if (stmt.expression) {
                    return `return ${this.emit(stmt.expression)};`;
                }
            }
            return this.emit(stmt);
        }).join("\n");

        let body = bodyStmts;

        if (this.hasQuestionMark(fn.body)) {
            body = `try {
${bodyStmts}
} catch (e) {
  if (e instanceof _ResultError) return { ok: false, error: e.error };
  throw e;
}`;
        }

        return `function ${fn.name}${typeParams}(${params}) {\n${body}\n}`;
    }

    private emitCallExpression(expr: AST.CallExpression): string {
        const args = expr.arguments.map(a => this.emit(a)).join(", ");
        if (expr.function instanceof AST.GenericInstantiationExpression) {
            const typeArgs = expr.function.typeArgs.map(t => this.mapTSType(t)).join(", ");
            return `${this.emit(expr.function.left)}<${typeArgs}>(${args})`;
        }
        return `${this.emit(expr.function)}(${args})`;
    }

    private emitStaticCallExpression(expr: AST.StaticCallExpression): string {
        const receiverName = expr.receiver.value;

        // Vec::new() → []
        if (receiverName === "Vec" && expr.method.value === "new") return "[]";
        // HashMap::new() → new Map()
        if (receiverName === "HashMap" && expr.method.value === "new") return "new Map()";

        // Math static calls → JavaScript Math.*
        if (receiverName === "Math") {
            const methodName = expr.method.value;
            const args = expr.arguments.map(a => this.emit(a)).join(", ");
            if (methodName === "pow") return `Math.pow(${args})`;
            if (methodName === "sqrt") return `Math.floor(Math.sqrt(${args}))`;
            if (methodName === "clamp") {
                const [x, lo, hi] = expr.arguments.map(a => this.emit(a));
                return `Math.min(Math.max(${x}, ${lo}), ${hi})`;
            }
            return `Math.${methodName}(${args})`;
        }

        // Enum variant construction
        if (this.enumDefinitions.has(receiverName)) {
            const variantName = expr.method.value;
            if (expr.arguments.length === 0) {
                return `${receiverName}.${variantName}`;
            }
            const args = expr.arguments.map(a => this.emit(a)).join(", ");
            return `${receiverName}.${variantName}(${args})`;
        }

        // Trait dispatch
        const traitName = receiverName;
        const methodName = expr.method.value;
        const args = expr.arguments.map(a => this.emit(a));

        const self = args[0];

        return `${traitName}.${methodName}.get(_getType(${self}))(${args.join(", ")})`;
    }

    private emitMemberAccessExpression(expr: AST.MemberAccessExpression): string {
        return `${this.emit(expr.left)}.${expr.member.value}`;
    }

    private emitMatchExpression(expr: AST.MatchExpression): string {
        const value = this.emit(expr.value);

        // Detect enum patterns
        const hasEnumPatterns = expr.arms.some(arm => arm.pattern instanceof AST.EnumPattern);

        if (hasEnumPatterns) {
            return this.emitEnumMatch(value, expr);
        }

        // Simple literal match (existing behavior, updated for Pattern types)
        const arms = expr.arms.map(arm => {
            let pattern = "";
            if (arm.pattern instanceof AST.LiteralPattern) {
                pattern = this.emit(arm.pattern.value);
            } else if (arm.pattern instanceof AST.WildcardPattern) {
                pattern = "_";
            }
            let body = "";
            if (arm.body instanceof AST.BlockStatement) {
                body = this.emitBlockStatement(arm.body, true);
            } else if (arm.body instanceof AST.ExpressionStatement) {
                if (arm.body.expression) {
                    body = `return ${this.emit(arm.body.expression)};`;
                }
            }

            const caseLabel = pattern === "_" ? "default" : `case ${pattern}`;
            return `${caseLabel}: ${body}`;
        }).join("\n");

        return `(() => { switch(${value}) {
${arms}
} })()`;
    }

    private emitEnumMatch(value: string, expr: AST.MatchExpression): string {
        const arms = expr.arms.map(arm => {
            if (arm.pattern instanceof AST.EnumPattern) {
                const variantName = arm.pattern.variantName.value;
                const bindings = arm.pattern.bindings.map((b, i) => {
                    return `const ${b.value} = __match_val._${i};`;
                }).join("\n");

                let body = "";
                if (arm.body instanceof AST.BlockStatement) {
                    body = this.emitBlockStatement(arm.body, true);
                } else if (arm.body instanceof AST.ExpressionStatement && arm.body.expression) {
                    body = `return ${this.emit(arm.body.expression)};`;
                }

                return `case "${variantName}": { ${bindings}\n${body} }`;
            } else if (arm.pattern instanceof AST.WildcardPattern) {
                let body = "";
                if (arm.body instanceof AST.BlockStatement) {
                    body = this.emitBlockStatement(arm.body, true);
                } else if (arm.body instanceof AST.ExpressionStatement && arm.body.expression) {
                    body = `return ${this.emit(arm.body.expression)};`;
                }
                return `default: { ${body} }`;
            }
            return "";
        }).join("\n");

        return `(() => { const __match_val = ${value}; switch(__match_val.tag) {
${arms}
} })()`;
    }

    private emitInterpolatedString(node: AST.InterpolatedStringExpression): string {
        // Emit as JS template literal: `literal${expr}literal${expr}literal`
        let result = "`";
        for (const part of node.parts) {
            if (part instanceof AST.StringLiteral) {
                // Escape backticks in the literal text
                result += part.value.replace(/`/g, "\\`").replace(/\$/g, "\\$");
            } else {
                result += `\${${this.emit(part)}}`;
            }
        }
        result += "`";
        return result;
    }

    private emitClosureExpression(node: AST.ClosureExpression): string {
        const params = node.parameters.map(p => {
            if (p.type) {
                return `${p.name.value}: ${this.mapTSType(p.type)}`;
            }
            return p.name.value;
        }).join(", ");

        const retType = node.returnType ? `: ${this.mapTSType(node.returnType)}` : "";

        // For single-expression bodies, emit as concise arrow function
        if (node.body.statements.length === 1) {
            const stmt = node.body.statements[0];
            if (stmt instanceof AST.ExpressionStatement && stmt.expression) {
                return `(${params})${retType} => ${this.emit(stmt.expression)}`;
            }
        }

        // Multi-statement body: emit as arrow function with block
        const bodyStmts = node.body.statements.map((stmt, i) => {
            // Implicit return for last expression statement
            if (i === node.body.statements.length - 1 && stmt instanceof AST.ExpressionStatement) {
                if (stmt.expression) {
                    return `return ${this.emit(stmt.expression)};`;
                }
            }
            return this.emit(stmt);
        }).join("\n");

        return `(${params})${retType} => {\n${bodyStmts}\n}`;
    }

    private hasQuestionMark(node: AST.Node): boolean {
        if (node instanceof AST.QuestionExpression) return true;

        if (node instanceof AST.BlockStatement) {
            return node.statements.some(s => this.hasQuestionMark(s));
        }
        if (node instanceof AST.ExpressionStatement) {
            return node.expression ? this.hasQuestionMark(node.expression) : false;
        }
        if (node instanceof AST.LetStatement) {
            return node.value ? this.hasQuestionMark(node.value) : false;
        }
        if (node instanceof AST.ReturnStatement) {
            return node.returnValue ? this.hasQuestionMark(node.returnValue) : false;
        }
        if (node instanceof AST.InfixExpression) {
            return this.hasQuestionMark(node.left) || this.hasQuestionMark(node.right);
        }
        if (node instanceof AST.PrefixExpression) {
            return this.hasQuestionMark(node.right);
        }
        if (node instanceof AST.IfExpression) {
            return this.hasQuestionMark(node.condition) ||
                this.hasQuestionMark(node.consequence) ||
                (node.alternative ? this.hasQuestionMark(node.alternative) : false);
        }
        if (node instanceof AST.CallExpression) {
            return this.hasQuestionMark(node.function) ||
                node.arguments.some(a => this.hasQuestionMark(a));
        }
        if (node instanceof AST.InterpolatedStringExpression) {
            return node.parts.some(p => !(p instanceof AST.StringLiteral) && this.hasQuestionMark(p));
        }
        if (node instanceof AST.FunctionLiteral) {
            return false;
        }

        return false;
    }
}