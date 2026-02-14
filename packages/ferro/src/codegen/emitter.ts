
import * as AST from "../ast/ast";

export class Emitter {
    private enumDefinitions: Map<string, AST.EnumDefinition> = new Map();
    private hashMapVars: Set<string> = new Set();
    private structVars: Set<string> = new Set();
    private hasIntoIterator: boolean = false;
    private resultVars: Set<string> = new Set();
    private inherentImplTypes: Set<string> = new Set();
    private optionVars: Set<string> = new Set();
    private optionFunctions: Set<string> = new Set();

    // Type alias store for tracking (TS emits `type X = ...`)
    private typeAliasNames: Set<string> = new Set();

    public emit(node: AST.Node): string {
        if (node instanceof AST.Program) {
            return this.emitProgram(node);
        }
        if (node instanceof AST.TypeAliasStatement) {
            return this.emitTypeAliasStatement(node);
        }
        if (node instanceof AST.ConstStatement) {
            return this.emitConstStatement(node);
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
        if (node instanceof AST.ExternBlockStatement) {
            // Extern blocks are declarations only — no TS output needed
            return "";
        }
        if (node instanceof AST.WhileStatement) {
            return this.emitWhileStatement(node);
        }
        if (node instanceof AST.ForStatement) {
            return this.emitForStatement(node);
        }
        if (node instanceof AST.BreakStatement) {
            return "break;";
        }
        if (node instanceof AST.ContinueStatement) {
            return "continue;";
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
        if (node instanceof AST.FloatLiteral) {
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
        if (node instanceof AST.GroupedExpression) {
            return `(${this.emit(node.expression)})`;
        }
        if (node instanceof AST.PrefixExpression) {
            return `${node.operator}${this.emit(node.right)}`;
        }
        if (node instanceof AST.InfixExpression) {
            if (node.integerDivision) {
                return `Math.floor(${this.emit(node.left)} ${node.operator} ${this.emit(node.right)})`;
            }
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
            // Option<T> methods — dispatch based on tracking
            if (this.isOptionExpr(node.object)) {
                if (method === "unwrap" && node.arguments.length === 0) return `_option_unwrap(${obj})`;
                if (method === "unwrap_or" && node.arguments.length === 1) return `_option_unwrap_or(${obj}, ${this.emit(node.arguments[0])})`;
                if (method === "is_some" && node.arguments.length === 0) return `_option_is_some(${obj})`;
                if (method === "is_none" && node.arguments.length === 0) return `_option_is_none(${obj})`;
                if (method === "map" && node.arguments.length >= 1) return `_option_map(${obj}, ${this.emit(node.arguments[0])})`;
                if (method === "and_then" && node.arguments.length >= 1) return `_option_and_then(${obj}, ${this.emit(node.arguments[0])})`;
                if (method === "or_else" && node.arguments.length >= 1) return `_option_or_else(${obj}, ${this.emit(node.arguments[0])})`;
            }
            // Result<T, E> methods — dispatch to runtime helpers
            if (method === "unwrap" && node.arguments.length === 0) return `_result_unwrap(${obj})`;
            if (method === "unwrap_or" && node.arguments.length === 1) return `_result_unwrap_or(${obj}, ${this.emit(node.arguments[0])})`;
            if (method === "is_ok" && node.arguments.length === 0) return `_result_is_ok(${obj})`;
            if (method === "is_err" && node.arguments.length === 0) return `_result_is_err(${obj})`;
            if (method === "map" && this.isResultMethodContext(node)) {
                return `_result_map(${obj}, ${this.emit(node.arguments[0])})`;
            }
            if (method === "map_err" && node.arguments.length >= 1) return `_result_map_err(${obj}, ${this.emit(node.arguments[0])})`;
            if (method === "and_then" && node.arguments.length >= 1) return `_result_and_then(${obj}, ${this.emit(node.arguments[0])})`;
            if (method === "or_else" && node.arguments.length >= 1) return `_result_or_else(${obj}, ${this.emit(node.arguments[0])})`;
            // HashMap methods — translate Rust-style Map API to JS Map API (must come before generic string/array methods)
            if (node.object instanceof AST.Identifier && this.hashMapVars.has(node.object.value)) {
                if (method === "insert" && node.arguments.length === 2) return `${obj}.set(${this.emit(node.arguments[0])}, ${this.emit(node.arguments[1])})`;
                if (method === "get" && node.arguments.length === 1) return `${obj}.get(${this.emit(node.arguments[0])})`;
                if (method === "contains_key" && node.arguments.length === 1) return `${obj}.has(${this.emit(node.arguments[0])})`;
                if (method === "remove" && node.arguments.length === 1) return `${obj}.delete(${this.emit(node.arguments[0])})`;
                if (method === "len" && node.arguments.length === 0) return `${obj}.size`;
                if (method === "keys" || method === "keys_iter") return `[...${obj}.keys()]`;
                if (method === "values" || method === "values_iter") return `[...${obj}.values()]`;
            }
            // String methods — dispatch to native JS string methods
            if (method === "len" && node.arguments.length === 0) return `${obj}.length`;
            if (method === "contains" && node.arguments.length === 1) return `${obj}.includes(${this.emit(node.arguments[0])})`;
            if (method === "starts_with" && node.arguments.length === 1) return `${obj}.startsWith(${this.emit(node.arguments[0])})`;
            if (method === "ends_with" && node.arguments.length === 1) return `${obj}.endsWith(${this.emit(node.arguments[0])})`;
            if (method === "trim" && node.arguments.length === 0) return `${obj}.trim()`;
            if (method === "to_uppercase" && node.arguments.length === 0) return `${obj}.toUpperCase()`;
            if (method === "to_lowercase" && node.arguments.length === 0) return `${obj}.toLowerCase()`;
            if (method === "replace" && node.arguments.length === 2) return `${obj}.replace(${this.emit(node.arguments[0])}, ${this.emit(node.arguments[1])})`;
            if (method === "split" && node.arguments.length === 1) return `${obj}.split(${this.emit(node.arguments[0])})`;
            if (method === "repeat" && node.arguments.length === 1) return `${obj}.repeat(${this.emit(node.arguments[0])})`;
            if (method === "char_at" && node.arguments.length === 1) return `${obj}.charAt(${this.emit(node.arguments[0])})`;
            if (method === "index_of" && node.arguments.length === 1) return `${obj}.indexOf(${this.emit(node.arguments[0])})`;
            if (method === "is_empty" && node.arguments.length === 0) return `(${obj}.length === 0)`;
            if (method === "slice" && node.arguments.length === 2) return `${obj}.slice(${this.emit(node.arguments[0])}, ${this.emit(node.arguments[1])})`;
            if (method === "substr" && node.arguments.length === 2) return `${obj}.substring(${this.emit(node.arguments[0])}, ${this.emit(node.arguments[1])})`;
            // Weak<T> methods
            if (method === "upgrade" && node.arguments.length === 0) return `_weak_upgrade(${obj})`;
            // Array fixed-size methods
            if (method === "len" && node.arguments.length === 0) return `${obj}.length`;
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
            // Check if receiver is a struct variable with inherent impl methods
            if (node.object instanceof AST.Identifier && this.structVars.has(node.object.value)) {
                for (const typeName of this.inherentImplTypes) {
                    // Dispatch to inherent impl: Type_impl.method(self, args)
                    const args = node.arguments.map(a => this.emit(a)).join(", ");
                    const selfArg = args ? `${obj}, ${args}` : obj;
                    return `${typeName}_impl.${method}(${selfArg})`;
                }
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
            if (this.isOptionExpr(node.left)) {
                return `_try_option(${this.emit(node.left)})`;
            }
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
        if (node instanceof AST.TupleLiteral) {
            return `[${node.elements.map(e => this.emit(e)).join(", ")}]`;
        }
        if (node instanceof AST.TupleIndexExpression) {
            return `${this.emit(node.left)}[${node.index}]`;
        }
        if (node instanceof AST.ArrayRepeatExpression) {
            return `Array(${node.count}).fill(${this.emit(node.value)})`;
        }
        if (node instanceof AST.AwaitExpression) {
            return `await ${this.emit(node.expression)}`;
        }
        if (node instanceof AST.ExternBlockStatement) {
            // Extern blocks don't emit anything in TS backend
            return "";
        }

        return "";
    }

    private emitProgram(program: AST.Program): string {
        const runtime = `
import * as fs from "fs";

// Ferro Runtime
class _File {
  private fd: number;
  private _buf: string = "";
  private _lines: string[] = [];
  private _lineIdx: number = 0;
  private _mode: string;
  constructor(name: string, mode: string) {
    this._mode = mode;
    this.fd = fs.openSync(name, mode);
    if (mode.startsWith("r")) {
      this._buf = fs.readFileSync(name, "utf8");
      this._lines = this._buf.split("\\n");
    }
  }
  read_line(): string {
    if (this._lineIdx >= this._lines.length) return "";
    return this._lines[this._lineIdx++];
  }
  write_string(s: string): number { return fs.writeSync(this.fd, s); }
  close(): number { fs.closeSync(this.fd); return 0; }
  seek(_offset: number, _whence: number): number { return 0; }
  tell(): number { return 0; }
}
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
function _result_unwrap(res: any) {
  if (res && res.ok === true) return res.value;
  throw new Error("called unwrap() on an Err value: " + JSON.stringify(res.error));
}
function _result_unwrap_or(res: any, def: any) {
  if (res && res.ok === true) return res.value;
  return def;
}
function _result_is_ok(res: any) { return !!(res && res.ok === true); }
function _result_is_err(res: any) { return !!(res && res.ok === false); }
function _result_map(res: any, f: any) {
  if (res && res.ok === true) return Ok(f(res.value));
  return res;
}
function _result_map_err(res: any, f: any) {
  if (res && res.ok === false) return Err(f(res.error));
  return res;
}
function _result_and_then(res: any, f: any) {
  if (res && res.ok === true) return f(res.value);
  return res;
}
function _result_or_else(res: any, f: any) {
  if (res && res.ok === false) return f(res.error);
  return res;
}
function _getType(obj: any) {
  if (obj === null || obj === undefined) return "null";
  const type = typeof obj;
  if (type === "object") return obj.constructor.name;
  return type; // "string", "number", etc
}
function Some(value: any) { return { some: true, value }; }
const None = { some: false } as any;
function _option_unwrap(opt: any) {
  if (opt && opt.some === true) return opt.value;
  throw new Error("called unwrap() on a None value");
}
function _option_unwrap_or(opt: any, def: any) {
  if (opt && opt.some === true) return opt.value;
  return def;
}
function _option_is_some(opt: any) { return !!(opt && opt.some === true); }
function _option_is_none(opt: any) { return !(opt && opt.some === true); }
function _option_map(opt: any, f: any) {
  if (opt && opt.some === true) return Some(f(opt.value));
  return None;
}
function _option_and_then(opt: any, f: any) {
  if (opt && opt.some === true) return f(opt.value);
  return None;
}
function _option_or_else(opt: any, f: any) {
  if (opt && opt.some === true) return opt;
  return f();
}
class _OptionNoneError extends Error {}
function _try_option(opt: any) {
  if (opt && opt.some === true) return opt.value;
  throw new _OptionNoneError();
}
function print(...args: any[]) { console.log(...args); }
function _weak_new(value: any) { return new WeakRef(value); }
function _weak_upgrade(ref: any) { const v = ref.deref(); return v !== undefined ? Some(v) : None; }
`;
        return runtime + program.statements.map((stmt) => this.emit(stmt)).join("\n");
    }

    private emitLetStatement(stmt: AST.LetStatement): string {
        const keyword = stmt.mutable ? "let" : "const";
        const value = stmt.value ? this.emit(stmt.value) : "undefined";
        const typeAnn = stmt.type ? `: ${this.mapTSType(stmt.type)}` : "";
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
        // Track Result variables for method dispatch
        if (stmt.value instanceof AST.CallExpression && stmt.value.function instanceof AST.Identifier) {
            const fnName = stmt.value.function.value;
            if (fnName === "Ok" || fnName === "Err") {
                this.resultVars.add(stmt.name.value);
            }
        }
        // Also track when assigned from a function that returns Result (via ? usage, method calls on Results, etc.)
        if (stmt.value instanceof AST.MethodCallExpression) {
            const m = stmt.value.method.value;
            if (["map", "map_err", "and_then", "or_else"].includes(m) &&
                stmt.value.object instanceof AST.Identifier && this.resultVars.has(stmt.value.object.value)) {
                this.resultVars.add(stmt.name.value);
            }
        }
        // Track type annotation with Result
        if (stmt.type && stmt.type instanceof AST.TypeIdentifier && stmt.type.value === "Result") {
            this.resultVars.add(stmt.name.value);
        }
        // Track Option variables
        if (stmt.value && this.isOptionExpr(stmt.value)) {
            this.optionVars.add(stmt.name.value);
        }
        if (stmt.type && stmt.type instanceof AST.TypeIdentifier && stmt.type.value === "Option") {
            this.optionVars.add(stmt.name.value);
        }
        return `${keyword} ${stmt.name.value}${typeAnn} = ${value};`;
    }

    private emitTypeAliasStatement(stmt: AST.TypeAliasStatement): string {
        this.typeAliasNames.add(stmt.name.value);
        const mapped = this.mapTSType(stmt.typeValue);
        return `type ${stmt.name.value} = ${mapped};`;
    }

    private emitConstStatement(stmt: AST.ConstStatement): string {
        const typeAnn = stmt.type ? `: ${this.mapTSType(stmt.type)}` : "";
        const value = this.emit(stmt.value);
        return `const ${stmt.name.value}${typeAnn} = ${value};`;
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
            case "f64": return "number";
            case "bool": return "boolean";
            case "string": return "string";
            default: return fsType;
        }
    }

    private emitImplBlock(impl: AST.ImplBlock): string {
        const targetType = this.mapJSTypeName(impl.targetType.value);
        const typeParamsStr = impl.typeParams.length > 0
            ? `<${impl.typeParams.join(", ")}>`
            : "";

        // Inherent impl: emit as a namespace object with static methods
        if (!impl.traitName) {
            const typeName = impl.targetType.value;
            // Track this so static calls can use it
            if (!this.inherentImplTypes) this.inherentImplTypes = new Set();
            this.inherentImplTypes.add(typeName);

            const methods = impl.methods.map(m => {
                const params = m.parameters.map(p => `${p.name.value}: any`).join(", ");
                const body = this.emitBlockStatement(m.body, true);
                return `  ${m.name}${typeParamsStr}(${params}) ${body}`;
            }).join(",\n");

            return `const ${typeName}_impl = {\n${methods}\n};`;
        }

        const traitName = impl.traitName.value;
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
                lines.push(`  ${v.name.value}: "${v.name.value.toLowerCase()}",`);
            } else {
                const params = v.fields.map((_, i) => `_${i}`).join(", ");
                lines.push(`  ${v.name.value}: (${params}) => ({ tag: "${v.name.value.toLowerCase()}", ${params} }),`);
            }
        });
        lines.push(`};`);

        return lines.join("\n");
    }

    private mapTSType(type: AST.Type): string {
        if (type instanceof AST.TypeIdentifier) {
            const name = type.value;
            const mapped = name === "int" ? "number"
                : name === "f64" ? "number"
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
        if (type instanceof AST.TupleType) {
            return `[${type.elements.map(t => this.mapTSType(t)).join(", ")}]`;
        }
        if (type instanceof AST.ArrayType) {
            return `${this.mapTSType(type.elementType)}[]`;
        }
        if (type instanceof AST.WeakType) {
            return `WeakRef<${this.mapTSType(type.innerType)}>`;
        }
        if (type instanceof AST.PointerType) {
            return "any";
        }
        const name = type.toString();
        if (name === "int") return "number";
        if (name === "f64") return "number";
        if (name === "string") return "string";
        if (name === "bool") return "boolean";
        return "any";
    }

    private emitCastExpression(node: AST.CastExpression): string {
        const inner = this.emit(node.expression);
        const targetName = node.targetType instanceof AST.TypeIdentifier ? node.targetType.value : node.targetType.toString();
        if (targetName === "bool") return `(!!(${inner}))`;
        if (targetName === "int" || targetName === "i8") return `((${inner}) | 0)`;
        if (targetName === "f64") return `(+(${inner}))`;
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
        // Track if this function returns Option<T>
        if (fn.returnType instanceof AST.TypeIdentifier && fn.returnType.value === "Option") {
            this.optionFunctions.add(fn.name);
        }

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
  if (e instanceof _OptionNoneError) return None;
  throw e;
}`;
        }

        const asyncPrefix = (fn as any).isAsync ? "async " : "";
        return `${asyncPrefix}function ${fn.name}${typeParams}(${params}) {\n${body}\n}`;
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

        // File static methods
        if (receiverName === "File") {
            const methodName = expr.method.value;
            if (methodName === "open") {
                const args = expr.arguments.map(a => this.emit(a)).join(", ");
                return `new _File(${args})`;
            }
            if (methodName === "read_to_string") {
                const filename = this.emit(expr.arguments[0]);
                return `fs.readFileSync(${filename}, "utf8")`;
            }
            if (methodName === "write_to_string") {
                const filename = this.emit(expr.arguments[0]);
                const contents = this.emit(expr.arguments[1]);
                return `(() => { fs.writeFileSync(${filename}, ${contents}); return (${contents}).length; })()`;
            }
        }

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

        // Option::Some(v) → Some(v), Option::None → None
        if (receiverName === "Option") {
            const methodName = expr.method.value;
            if (methodName === "Some" && expr.arguments.length === 1) {
                return `Some(${this.emit(expr.arguments[0])})`;
            }
            if (methodName === "None") {
                return `None`;
            }
        }

        // Weak::new(val) → _weak_new(val)
        if (receiverName === "Weak") {
            const methodName = expr.method.value;
            if (methodName === "new" && expr.arguments.length === 1) {
                return `_weak_new(${this.emit(expr.arguments[0])})`;
            }
            if (methodName === "downgrade" && expr.arguments.length === 1) {
                return `_weak_new(${this.emit(expr.arguments[0])})`;
            }
        }

        // Inherent impl static calls: Type::method(args) → Type_impl.method(args)
        if (this.inherentImplTypes.has(receiverName)) {
            const methodName = expr.method.value;
            const args = expr.arguments.map(a => this.emit(a)).join(", ");
            return `${receiverName}_impl.${methodName}(${args})`;
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
        // Check if this is an Option match (Option::Some / Option::None patterns)
        const isOptionMatch = expr.arms.some(arm =>
            arm.pattern instanceof AST.EnumPattern && arm.pattern.enumName.value === "Option"
        );

        if (isOptionMatch) {
            return this.emitOptionMatch(value, expr);
        }

        // Check if this is a Result match (Result::Ok / Result::Err patterns)
        const isResultMatch = expr.arms.some(arm =>
            arm.pattern instanceof AST.EnumPattern && arm.pattern.enumName.value === "Result"
        );

        if (isResultMatch) {
            return this.emitResultMatch(value, expr);
        }

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

                return `case "${variantName.toLowerCase()}": { ${bindings}\n${body} }`;
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

        return `(() => { const __match_val = ${value}; switch(typeof __match_val === "object" ? __match_val.tag : __match_val) {
${arms}
} })()`;
    }

    private emitOptionMatch(value: string, expr: AST.MatchExpression): string {
        const arms = expr.arms.map(arm => {
            if (arm.pattern instanceof AST.EnumPattern) {
                const variantName = arm.pattern.variantName.value;
                let binding = "";
                if (variantName === "Some" && arm.pattern.bindings.length > 0) {
                    binding = `const ${arm.pattern.bindings[0].value} = __match_val.value;`;
                }

                let body = "";
                if (arm.body instanceof AST.BlockStatement) {
                    body = this.emitBlockStatement(arm.body, true);
                } else if (arm.body instanceof AST.ExpressionStatement && arm.body.expression) {
                    body = `return ${this.emit(arm.body.expression)};`;
                }

                const caseVal = variantName === "Some" ? "true" : "false";
                return `case ${caseVal}: { ${binding}\n${body} }`;
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

        return `(() => { const __match_val = ${value}; switch(__match_val.some) {
${arms}
} })()`;
    }

    private emitResultMatch(value: string, expr: AST.MatchExpression): string {
        const arms = expr.arms.map(arm => {
            if (arm.pattern instanceof AST.EnumPattern) {
                const variantName = arm.pattern.variantName.value;
                let binding = "";
                if (variantName === "Ok" && arm.pattern.bindings.length > 0) {
                    binding = `const ${arm.pattern.bindings[0].value} = __match_val.value;`;
                } else if (variantName === "Err" && arm.pattern.bindings.length > 0) {
                    binding = `const ${arm.pattern.bindings[0].value} = __match_val.error;`;
                }

                let body = "";
                if (arm.body instanceof AST.BlockStatement) {
                    body = this.emitBlockStatement(arm.body, true);
                } else if (arm.body instanceof AST.ExpressionStatement && arm.body.expression) {
                    body = `return ${this.emit(arm.body.expression)};`;
                }

                const caseVal = variantName === "Ok" ? "true" : "false";
                return `case ${caseVal}: { ${binding}\n${body} }`;
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

        return `(() => { const __match_val = ${value}; switch(__match_val.ok) {
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

    private isOptionExpr(node: AST.Expression): boolean {
        if (node instanceof AST.Identifier && this.optionVars.has(node.value)) return true;
        if (node instanceof AST.Identifier && node.value === "None") return true;
        if (node instanceof AST.CallExpression && node.function instanceof AST.Identifier) {
            if (node.function.value === "Some") return true;
            if (this.optionFunctions.has(node.function.value)) return true;
        }
        if (node instanceof AST.StaticCallExpression && node.receiver.value === "Option") return true;
        if (node instanceof AST.MethodCallExpression) {
            const m = node.method.value;
            if (["map", "and_then", "or_else"].includes(m)) return this.isOptionExpr(node.object);
        }
        // QuestionExpression on an Option produces the inner value, not an Option
        return false;
    }

    private isResultMethodContext(node: AST.MethodCallExpression): boolean {
        // Check if the receiver is a known Result variable
        if (node.object instanceof AST.Identifier && this.resultVars.has(node.object.value)) return true;
        // Check if the receiver is a direct Ok() or Err() call
        if (node.object instanceof AST.CallExpression && node.object.function instanceof AST.Identifier) {
            const fn = node.object.function.value;
            if (fn === "Ok" || fn === "Err") return true;
        }
        // Check if receiver is chained Result method
        if (node.object instanceof AST.MethodCallExpression) {
            const m = node.object.method.value;
            if (["map", "map_err", "and_then", "or_else"].includes(m)) {
                return this.isResultMethodContext(node.object);
            }
        }
        return false;
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
        if (node instanceof AST.GroupedExpression) {
            return this.hasQuestionMark(node.expression);
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