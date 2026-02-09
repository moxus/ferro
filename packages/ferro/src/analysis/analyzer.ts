import * as AST from "../ast/ast";
import { Token, TokenType } from "../token";
import { SymbolTable } from "./symbol_table";
import { Type, IntType, StringType, BoolType, VoidType, NullType, FileType, UnknownType, typesEqual, typeToString, EnumVariantInfo } from "./types";

export interface Diagnostic {
    message: string;
    line: number;
    col: number;
    file?: string;
}

export class Analyzer {
    public diagnostics: Diagnostic[] = [];
    private scope: SymbolTable = new SymbolTable();
    private currentModulePath: string = "";
    private unsafeContext: boolean = false;
    private genericContext: string[] = [];
    // Trait bound validation: track which traits exist and which types implement them
    private traitDefs: Set<string> = new Set();  // trait names
    private traitImpls: Map<string, Set<string>> = new Map();  // traitName -> Set of target types
    // Track function type constraints for call-site validation
    private functionConstraints: Map<string, Map<string, string[]>> = new Map();  // funcName -> typeConstraints
    // Store impl blocks for IntoIterator lookup
    private implBlockStore: AST.ImplBlock[] = [];

    public analyze(program: AST.Program, initialScope?: SymbolTable, modulePath: string = "") {
        this.currentModulePath = modulePath;
        if (initialScope) {
            this.scope = initialScope;
        } else {
            this.scope = new SymbolTable(); // Reset global scope
            // Define standard library / built-ins
            this.scope.define("console", { kind: "primitive", name: "any" }, false, 0);
            this.scope.define("print", { kind: "function", params: [], returnType: VoidType }, false, 0);
            this.scope.define("drop", { kind: "function", params: [{ kind: "primitive", name: "any" }], returnType: VoidType }, false, 0);
            this.scope.define("File", FileType, false, 0);
        }

        program.statements.forEach(stmt => this.visitStatement(stmt));
    }

    public getScope(): SymbolTable {
        return this.scope;
    }

    private visitStatement(stmt: AST.Statement) {
        if (stmt instanceof AST.LetStatement) {
            this.visitLetStatement(stmt);
        } else if (stmt instanceof AST.ExpressionStatement) {
            if (stmt.expression) this.visitExpression(stmt.expression);
        } else if (stmt instanceof AST.BlockStatement) {
            this.visitBlockStatement(stmt);
        } else if (stmt instanceof AST.ReturnStatement) {
            if (stmt.returnValue) this.visitExpression(stmt.returnValue);
        } else if (stmt instanceof AST.FunctionLiteral) {
            // FunctionLiteral is an Expression in AST, but often used as Statement (fn decl)
            // But my Parser parses top-level fn as ExpressionStatement(FunctionLiteral).
            // Wait, top-level fn?
            // "fn name() {}" -> ExpressionStatement(FunctionLiteral)
            // FunctionLiteral is an Expression.
            // I should handle it in visitExpression.
        } else if (stmt instanceof AST.ExportStatement) {
            this.visitStatement(stmt.statement);
        } else if (stmt instanceof AST.ExternStatement) {
            const retType = this.resolveType(stmt.returnType);
            // Define global unsafe function
            this.scope.define(stmt.name.value, { kind: "function", params: [], returnType: retType }, false, stmt.token.line, this.currentModulePath, true);
        } else if (stmt instanceof AST.StructDefinition) {
            this.visitStructDefinition(stmt);
        } else if (stmt instanceof AST.EnumDefinition) {
            this.visitEnumDefinition(stmt);
        } else if (stmt instanceof AST.TraitDeclaration) {
            this.traitDefs.add(stmt.name.value);
        } else if (stmt instanceof AST.ImplBlock) {
            const traitName = stmt.traitName.value;
            const targetType = stmt.targetType.value;
            if (!this.traitImpls.has(traitName)) {
                this.traitImpls.set(traitName, new Set());
            }
            this.traitImpls.get(traitName)!.add(targetType);
            this.implBlockStore.push(stmt);
        } else if (stmt instanceof AST.ForStatement) {
            this.visitForStatement(stmt);
        }
    }

    private visitForStatement(stmt: AST.ForStatement) {
        let elemType: Type = IntType;

        if (stmt.iterable instanceof AST.RangeExpression) {
            this.visitExpression(stmt.iterable);
        } else {
            // Collection iteration: infer element type
            const iterableType = this.visitExpression(stmt.iterable);
            if (iterableType.kind === "generic_inst" && iterableType.name === "Vec" && iterableType.args.length > 0) {
                elemType = iterableType.args[0];
            } else if (iterableType.kind === "generic_inst" && iterableType.name === "HashMap" && iterableType.args.length >= 1) {
                elemType = iterableType.args[0]; // Key type
            } else if (iterableType.kind === "generic_inst" && iterableType.name === "Iterator" && iterableType.args.length > 0) {
                // Lazy iterator chain: element type from Iterator<T>
                elemType = iterableType.args[0];
            } else if (iterableType.kind === "struct") {
                // User-defined IntoIterator: look for into_iter impl
                const structName = iterableType.name;
                const intoIterImpl = this.findIntoIteratorImpl(structName);
                if (intoIterImpl) {
                    elemType = intoIterImpl;
                } else {
                    elemType = UnknownType;
                }
            } else {
                elemType = UnknownType;
            }
        }

        const prevScope = this.scope;
        this.scope = this.scope.createChild();
        this.scope.define(stmt.variable.value, elemType, false, stmt.token.line, this.currentModulePath);
        stmt.body.statements.forEach(s => this.visitStatement(s));
        this.scope = prevScope;
    }

    /** Look for an IntoIterator impl for the given struct type. Returns the element type if found. */
    private findIntoIteratorImpl(structName: string): Type | null {
        // Check if IntoIterator trait exists and has this struct as a target
        const intoIterImpls = this.traitImpls.get("IntoIterator");
        if (!intoIterImpls || !intoIterImpls.has(structName)) return null;

        // Find the impl block to get the into_iter return type
        for (const impl of this.implBlockStore) {
            if (impl.traitName.value === "IntoIterator" && impl.targetType.value === structName) {
                const intoIterMethod = impl.methods.find(m => m.name === "into_iter");
                if (intoIterMethod && intoIterMethod.returnType) {
                    const retType = this.resolveType(intoIterMethod.returnType);
                    if (retType.kind === "generic_inst" && retType.name === "Vec" && retType.args.length > 0) {
                        return retType.args[0]; // Vec<T> → T
                    }
                }
            }
        }
        return null;
    }

    private visitStructDefinition(stmt: AST.StructDefinition) {
        const prevContext = this.genericContext;
        this.genericContext = [...prevContext, ...stmt.typeParams];

        const fields = stmt.fields.map(f => ({
            name: f.name.value,
            type: this.resolveType(f.type)
        }));

        this.genericContext = prevContext;

        const structType: Type = {
            kind: "struct",
            name: stmt.name.value,
            typeParams: stmt.typeParams,
            fields
        };
        this.scope.define(stmt.name.value, structType, false, stmt.token.line, this.currentModulePath);
    }

    private visitEnumDefinition(stmt: AST.EnumDefinition) {
        const prevContext = this.genericContext;
        this.genericContext = [...prevContext, ...stmt.typeParams];

        const variants: EnumVariantInfo[] = stmt.variants.map((v, i) => ({
            name: v.name.value,
            fields: v.fields.map(f => this.resolveType(f)),
            tag: i,
        }));

        this.genericContext = prevContext;

        const enumType: Type = { kind: "enum", name: stmt.name.value, variants };
        this.scope.define(stmt.name.value, enumType, false, stmt.token.line, this.currentModulePath);
    }

    private visitLetStatement(stmt: AST.LetStatement) {
        let inferredType: Type = UnknownType;
        if (stmt.value) {
            inferredType = this.visitExpression(stmt.value);
        }

        // Check type annotation if present
        if (stmt.type) {
            const declaredType = this.resolveType(stmt.type);
            if (!typesEqual(declaredType, inferredType)) {
                this.error(`Type mismatch: expected ${typeToString(declaredType)}, got ${typeToString(inferredType)}`, stmt.token);
            }
            inferredType = declaredType; // Trust the annotation? Or the value? usually annotation.
        }

        // Define in scope
        this.scope.define(stmt.name.value, inferredType, stmt.mutable, stmt.token.line, this.currentModulePath);
    }

    private visitBlockStatement(block: AST.BlockStatement) {
        const prevScope = this.scope;
        this.scope = this.scope.createChild();

        block.statements.forEach(s => this.visitStatement(s));

        this.scope = prevScope;
    }

    private visitExpression(expr: AST.Expression): Type {
        if (expr instanceof AST.IntegerLiteral) return IntType;
        if (expr instanceof AST.StringLiteral) return StringType;
        if (expr instanceof AST.BooleanLiteral) return BoolType;
        if (expr instanceof AST.NullLiteral) return NullType;

        if (expr instanceof AST.RangeExpression) {
            const startType = this.visitExpression(expr.start);
            const endType = this.visitExpression(expr.end);
            if (!typesEqual(startType, IntType)) {
                this.error("Range start must be an integer", expr.token);
            }
            if (!typesEqual(endType, IntType)) {
                this.error("Range end must be an integer", expr.token);
            }
            return IntType;
        }

        if (expr instanceof AST.Identifier) {
            const symbol = this.scope.resolve(expr.value);
            if (!symbol) {
                this.error(`Variable '${expr.value}' not found`, expr.token);
                return UnknownType;
            }
            return symbol.type;
        }

        if (expr instanceof AST.UnsafeExpression) {
            const prev = this.unsafeContext;
            this.unsafeContext = true;
            this.visitBlockStatement(expr.block);
            this.unsafeContext = prev;
            return VoidType;
        }

        if (expr instanceof AST.PrefixExpression) {
            if (expr.operator === "*") {
                if (!this.unsafeContext) {
                    this.error("Dereference of raw pointer requires unsafe block", expr.token);
                }
                const right = this.visitExpression(expr.right);
                if (right.kind === "pointer") {
                    return right.elementType;
                }
                // If right is not pointer, error?
                // Allow for now or warn.
                return UnknownType;
            }
            // Handle other prefixes ! -
            return this.visitExpression(expr.right);
        }

        if (expr instanceof AST.InfixExpression) {
            const left = this.visitExpression(expr.left);
            const right = this.visitExpression(expr.right);

            if (expr.operator === "=") {
                // Assignment check
                if (expr.left instanceof AST.Identifier) {
                    const sym = this.scope.resolve(expr.left.value);
                    if (sym && !sym.mutable) {
                        this.error(`Cannot assign to immutable variable '${expr.left.value}'`, expr.token);
                    }
                }
                // Check types
                if (!typesEqual(left, right)) {
                    this.error(`Type mismatch in assignment: ${typeToString(left)} = ${typeToString(right)}`, expr.token);
                }
                return left;
            }

            if (["+", "-", "*", "/"].includes(expr.operator)) {
                if (typesEqual(left, IntType) && typesEqual(right, IntType)) return IntType;
                // Allow string concat
                if (expr.operator === "+" && typesEqual(left, StringType)) return StringType;
                // Allow pointer arithmetic: ptr + int or ptr - int
                if ((expr.operator === "+" || expr.operator === "-") && left.kind === "pointer" && typesEqual(right, IntType)) {
                    return left; // Returns same pointer type
                }

                this.error(`Operator '${expr.operator}' not defined for ${typeToString(left)} and ${typeToString(right)}`, expr.token);
                return UnknownType;
            }

            if (["==", "!=", "<", ">", "<=", ">="].includes(expr.operator)) {
                if (!typesEqual(left, right)) {
                    this.error(`Operator '${expr.operator}' not defined for ${typeToString(left)} and ${typeToString(right)}`, expr.token);
                }
                return BoolType;
            }

            if (expr.operator === "&&" || expr.operator === "||") {
                return BoolType;
            }
        }

        if (expr instanceof AST.FunctionLiteral) {
            const prevContext = this.genericContext;
            this.genericContext = [...prevContext, ...expr.typeParams];

            if (expr.name) {
                const retType = expr.returnType ? this.resolveType(expr.returnType) : VoidType;
                const paramTypes = expr.parameters.map(p => this.resolveType(p.type));
                this.scope.define(expr.name, { kind: "function", params: paramTypes, returnType: retType }, false, expr.token.line, this.currentModulePath);
                // Store type constraints for call-site validation
                if (expr.typeConstraints.size > 0) {
                    this.functionConstraints.set(expr.name, expr.typeConstraints);
                }
            }

            const prevScope = this.scope;
            this.scope = this.scope.createChild();

            expr.parameters.forEach(p => {
                const pType = this.resolveType(p.type);
                this.scope.define(p.name.value, pType, false, p.token.line, this.currentModulePath);
            });

            this.visitBlockStatement(expr.body);

            this.scope = prevScope;
            this.genericContext = prevContext;

            return { kind: "function", params: expr.parameters.map(p => this.resolveType(p.type)), returnType: expr.returnType ? this.resolveType(expr.returnType) : VoidType };
        }

        if (expr instanceof AST.CallExpression) {
            // Check function exists
            if (expr.function instanceof AST.Identifier) {
                const sym = this.scope.resolve(expr.function.value);
                if (sym && sym.unsafe && !this.unsafeContext) {
                    this.error(`Call to unsafe function '${expr.function.value}' requires unsafe block`, expr.token);
                }
            }

            // Trait bound validation for generic calls: fn::<Type>(args)
            if (expr.function instanceof AST.GenericInstantiationExpression) {
                const genExpr = expr.function;
                if (genExpr.left instanceof AST.Identifier) {
                    const funcName = genExpr.left.value;
                    const constraints = this.functionConstraints.get(funcName);
                    if (constraints && constraints.size > 0) {
                        this.validateTraitBounds(funcName, genExpr.typeArgs, constraints, expr.token);
                    }
                }
            }

            const fnType = this.visitExpression(expr.function);

            // Visit arguments — with bidirectional inference for closure args
            expr.arguments.forEach((arg, i) => {
                if (arg instanceof AST.ClosureExpression && fnType.kind === "function" && i < fnType.params.length) {
                    const paramType = fnType.params[i];
                    if (paramType.kind === "function") {
                        this.visitClosureExpression(arg, paramType.params, paramType.returnType);
                        return;
                    }
                }
                this.visitExpression(arg);
            });

            if (fnType.kind === "function") {
                return fnType.returnType;
            }
            // If unknown or primitive any, allow it
            if (fnType.kind === "primitive" && fnType.name === "any") return { kind: "primitive", name: "any" };

            // this.error("Not a function", expr.token); // Optional strict check
            return UnknownType;
        }

        if (expr instanceof AST.StaticCallExpression) {
            const receiverSym = this.scope.resolve(expr.receiver.value);
            if (receiverSym && receiverSym.type.kind === "enum") {
                const enumType = receiverSym.type;
                const variant = enumType.variants.find(v => v.name === expr.method.value);
                if (!variant) {
                    this.error(`Enum '${enumType.name}' has no variant '${expr.method.value}'`, expr.token);
                    return UnknownType;
                }
                if (expr.arguments.length !== variant.fields.length) {
                    this.error(
                        `Variant '${enumType.name}::${variant.name}' expects ${variant.fields.length} argument(s), got ${expr.arguments.length}`,
                        expr.token
                    );
                }
                expr.arguments.forEach((arg, i) => {
                    const argType = this.visitExpression(arg);
                    if (i < variant.fields.length && !typesEqual(argType, variant.fields[i])) {
                        this.error(
                            `Argument ${i} of '${enumType.name}::${variant.name}' expected ${typeToString(variant.fields[i])}, got ${typeToString(argType)}`,
                            expr.token
                        );
                    }
                });
                return enumType;
            }

            // Recognize Vec::<T>::new() and HashMap::<K,V>::new() constructors
            const receiverName = expr.receiver.value;
            if (expr.method.value === "new" && expr.genericTypeArgs && expr.genericTypeArgs.length > 0) {
                if (receiverName === "Vec" || receiverName === "HashMap") {
                    return {
                        kind: "generic_inst",
                        name: receiverName,
                        args: expr.genericTypeArgs.map(t => this.resolveType(t))
                    };
                }
            }

            // Math static calls: Math::abs, Math::min, Math::max, etc.
            if (receiverName === "Math") {
                expr.arguments.forEach(a => this.visitExpression(a));
                return IntType;
            }

            return UnknownType;
        }

        if (expr instanceof AST.MatchExpression) {
            const matchedType = this.visitExpression(expr.value);

            for (const arm of expr.arms) {
                const pat = arm.pattern;
                if (pat instanceof AST.EnumPattern) {
                    if (matchedType.kind === "enum") {
                        const variant = matchedType.variants.find(v => v.name === pat.variantName.value);
                        if (!variant) {
                            this.error(`Enum '${matchedType.name}' has no variant '${pat.variantName.value}'`, arm.token);
                        } else if (pat.bindings.length !== variant.fields.length) {
                            this.error(
                                `Pattern for '${matchedType.name}::${variant.name}' binds ${pat.bindings.length} variable(s), but variant has ${variant.fields.length} field(s)`,
                                arm.token
                            );
                        } else {
                            const prevScope = this.scope;
                            this.scope = this.scope.createChild();
                            pat.bindings.forEach((binding, i) => {
                                this.scope.define(binding.value, variant.fields[i], false, arm.token.line, this.currentModulePath);
                            });
                            this.visitStatement(arm.body);
                            this.scope = prevScope;
                            continue;
                        }
                    }
                } else if (pat instanceof AST.LiteralPattern) {
                    this.visitExpression(pat.value);
                }
                // WildcardPattern or fallthrough: just visit body
                this.visitStatement(arm.body);
            }
            return UnknownType;
        }

        if (expr instanceof AST.CastExpression) {
            this.visitExpression(expr.expression);
            return this.resolveType(expr.targetType);
        }

        if (expr instanceof AST.GenericInstantiationExpression) {
            return this.visitExpression(expr.left);
        }

        if (expr instanceof AST.StructLiteral) {
            expr.values.forEach(v => this.visitExpression(v.value));
            const sym = this.scope.resolve(expr.name.value);
            if (sym && sym.type.kind === "struct") {
                if (sym.type.typeParams.length > 0 && expr.typeParams.length > 0) {
                    return { kind: "generic_inst", name: expr.name.value, args: expr.typeParams.map(t => this.resolveType(t)) };
                }
                return sym.type;
            }
            return UnknownType;
        }

        if (expr instanceof AST.MemberAccessExpression) {
            const leftType = this.visitExpression(expr.left);
            if (leftType.kind === "struct") {
                const field = leftType.fields.find(f => f.name === expr.member.value);
                if (field) return field.type;
            }
            return UnknownType;
        }

        if (expr instanceof AST.IndexExpression) {
            this.visitExpression(expr.left);
            const indexType = this.visitExpression(expr.index);
            if (!typesEqual(indexType, IntType)) {
                this.error("Index must be an integer", expr.token);
            }
            return UnknownType;
        }

        if (expr instanceof AST.MethodCallExpression) {
            const receiverType = this.visitExpression(expr.object);
            const methodName = expr.method.value;

            // Vec method return types — with bidirectional closure inference
            if (receiverType.kind === "generic_inst" && receiverType.name === "Vec" && receiverType.args.length > 0) {
                const elemType = receiverType.args[0];

                if (methodName === "map" && expr.arguments.length > 0) {
                    const closureArg = expr.arguments[0];
                    if (closureArg instanceof AST.ClosureExpression) {
                        // Infer closure param from Vec element type; return type inferred from body
                        const closureType = this.visitClosureExpression(closureArg, [elemType]);
                        if (closureType.kind === "function") {
                            return { kind: "generic_inst", name: "Vec", args: [closureType.returnType] };
                        }
                    } else {
                        this.visitExpression(closureArg);
                    }
                    // Visit remaining args normally
                    for (let i = 1; i < expr.arguments.length; i++) this.visitExpression(expr.arguments[i]);
                    return { kind: "generic_inst", name: "Vec", args: [elemType] };
                }

                if (methodName === "filter" && expr.arguments.length > 0) {
                    const closureArg = expr.arguments[0];
                    if (closureArg instanceof AST.ClosureExpression) {
                        // Infer closure param from Vec element type; return type is bool
                        this.visitClosureExpression(closureArg, [elemType], BoolType);
                    } else {
                        this.visitExpression(closureArg);
                    }
                    for (let i = 1; i < expr.arguments.length; i++) this.visitExpression(expr.arguments[i]);
                    return { kind: "generic_inst", name: "Vec", args: [elemType] };
                }

                // Non-closure methods: visit args normally
                expr.arguments.forEach(a => this.visitExpression(a));
                if (methodName === "get" || methodName === "pop") return elemType;
                if (methodName === "len") return IntType;
                if (methodName === "collect") {
                    return { kind: "generic_inst", name: "Vec", args: [elemType] };
                }
                // iter() returns lazy Iterator<T>
                if (methodName === "iter") {
                    return { kind: "generic_inst", name: "Iterator", args: [elemType] };
                }
                return UnknownType;
            }

            // HashMap method return types
            if (receiverType.kind === "generic_inst" && receiverType.name === "HashMap" && receiverType.args.length >= 2) {
                const keyType = receiverType.args[0];
                const valueType = receiverType.args[1];
                expr.arguments.forEach(a => this.visitExpression(a));
                if (methodName === "get") return valueType;
                if (methodName === "len") return IntType;
                if (methodName === "contains_key") return BoolType;
                if (methodName === "keys") return { kind: "generic_inst", name: "Vec", args: [keyType] };
                if (methodName === "values") return { kind: "generic_inst", name: "Vec", args: [valueType] };
                // iter() / keys_iter() returns lazy Iterator over keys
                if (methodName === "iter" || methodName === "keys_iter") {
                    return { kind: "generic_inst", name: "Iterator", args: [keyType] };
                }
                // values_iter() returns lazy Iterator over values
                if (methodName === "values_iter") {
                    return { kind: "generic_inst", name: "Iterator", args: [valueType] };
                }
                return UnknownType;
            }

            // Iterator<T> method return types (lazy iterator chains)
            if (receiverType.kind === "generic_inst" && receiverType.name === "Iterator" && receiverType.args.length > 0) {
                const elemType = receiverType.args[0];

                if (methodName === "map" && expr.arguments.length > 0) {
                    const closureArg = expr.arguments[0];
                    if (closureArg instanceof AST.ClosureExpression) {
                        const closureType = this.visitClosureExpression(closureArg, [elemType]);
                        if (closureType.kind === "function") {
                            return { kind: "generic_inst", name: "Iterator", args: [closureType.returnType] };
                        }
                    } else {
                        this.visitExpression(closureArg);
                    }
                    for (let i = 1; i < expr.arguments.length; i++) this.visitExpression(expr.arguments[i]);
                    return { kind: "generic_inst", name: "Iterator", args: [elemType] };
                }

                if (methodName === "filter" && expr.arguments.length > 0) {
                    const closureArg = expr.arguments[0];
                    if (closureArg instanceof AST.ClosureExpression) {
                        this.visitClosureExpression(closureArg, [elemType], BoolType);
                    } else {
                        this.visitExpression(closureArg);
                    }
                    for (let i = 1; i < expr.arguments.length; i++) this.visitExpression(expr.arguments[i]);
                    return { kind: "generic_inst", name: "Iterator", args: [elemType] };
                }

                expr.arguments.forEach(a => this.visitExpression(a));
                if (methodName === "collect") return { kind: "generic_inst", name: "Vec", args: [elemType] };
                if (methodName === "count" || methodName === "sum") return IntType;
                if (methodName === "for_each") {
                    // Visit closure arg with element type inference
                    if (expr.arguments.length > 0) {
                        const closureArg = expr.arguments[0];
                        if (closureArg instanceof AST.ClosureExpression) {
                            this.visitClosureExpression(closureArg, [elemType]);
                        }
                    }
                    return VoidType;
                }
                return UnknownType;
            }

            // Default: visit args normally
            expr.arguments.forEach(a => this.visitExpression(a));
            return UnknownType;
        }

        if (expr instanceof AST.ClosureExpression) {
            return this.visitClosureExpression(expr);
        }

        if (expr instanceof AST.InterpolatedStringExpression) {
            for (const part of expr.parts) {
                if (part instanceof AST.StringLiteral) continue;
                const t = this.visitExpression(part);
                if (t.kind !== "primitive" || !["int", "string", "bool", "i8", "any", "unknown"].includes(t.name)) {
                    this.error(`Cannot interpolate type ${typeToString(t)} in f-string (expected int, string, or bool)`, expr.token);
                }
            }
            return StringType;
        }

        return UnknownType;
    }

    private visitClosureExpression(expr: AST.ClosureExpression, expectedParamTypes?: Type[], expectedReturnType?: Type): Type {
        // --- Capture analysis: find free variables ---
        const referencedVars = new Set<string>();
        this.collectIdentifiers(expr.body, referencedVars);

        const paramNames = new Set(expr.parameters.map(p => p.name.value));
        const definedInBody = new Set<string>();
        this.collectDefinitions(expr.body, definedInBody);

        const captured: string[] = [];
        for (const name of referencedVars) {
            if (paramNames.has(name)) continue;
            if (definedInBody.has(name)) continue;
            if (this.scope.resolve(name)) {
                captured.push(name);
            }
        }
        expr.capturedVariables = captured;

        // --- Type-check the closure ---
        const prevScope = this.scope;
        this.scope = this.scope.createChild();

        const paramTypes: Type[] = [];
        expr.parameters.forEach((p, i) => {
            let pType: Type;
            if (p.type) {
                // Explicitly typed param — use as-is
                pType = this.resolveType(p.type);
            } else if (expectedParamTypes && i < expectedParamTypes.length && expectedParamTypes[i].kind !== "unknown") {
                // Bidirectional inference: patch the AST node with the expected type
                pType = expectedParamTypes[i];
                p.type = this.typeToASTType(pType, p.token);
            } else {
                pType = UnknownType;
            }
            paramTypes.push(pType);
            this.scope.define(p.name.value, pType, false, p.token.line, this.currentModulePath);
        });

        // Visit the body
        expr.body.statements.forEach(s => this.visitStatement(s));

        // --- Determine return type ---
        let retType: Type;
        if (expr.returnType) {
            retType = this.resolveType(expr.returnType);
        } else if (expectedReturnType && expectedReturnType.kind !== "unknown") {
            // Bidirectional inference: use expected return type and patch AST
            retType = expectedReturnType;
            expr.returnType = this.typeToASTType(retType, expr.token);
        } else {
            // Infer from last expression in the body
            retType = this.inferClosureReturnType(expr);
            if (retType.kind !== "unknown") {
                expr.returnType = this.typeToASTType(retType, expr.token);
            }
        }

        this.scope = prevScope;

        return { kind: "function", params: paramTypes, returnType: retType };
    }

    /** Infer the return type of a closure from its last expression. */
    private inferClosureReturnType(expr: AST.ClosureExpression): Type {
        const stmts = expr.body.statements;
        if (stmts.length === 0) return VoidType;
        const lastStmt = stmts[stmts.length - 1];
        if (lastStmt instanceof AST.ExpressionStatement && lastStmt.expression) {
            return this.visitExpression(lastStmt.expression);
        }
        if (lastStmt instanceof AST.ReturnStatement && lastStmt.returnValue) {
            return this.visitExpression(lastStmt.returnValue);
        }
        return VoidType;
    }

    /** Recursively collect all Identifier references in an AST node. Does NOT recurse into nested ClosureExpressions. */
    private collectIdentifiers(node: AST.Node, result: Set<string>) {
        if (node instanceof AST.Identifier) {
            result.add(node.value);
        } else if (node instanceof AST.BlockStatement) {
            node.statements.forEach(s => this.collectIdentifiers(s, result));
        } else if (node instanceof AST.ExpressionStatement) {
            if (node.expression) this.collectIdentifiers(node.expression, result);
        } else if (node instanceof AST.LetStatement) {
            if (node.value) this.collectIdentifiers(node.value, result);
        } else if (node instanceof AST.ReturnStatement) {
            if (node.returnValue) this.collectIdentifiers(node.returnValue, result);
        } else if (node instanceof AST.InfixExpression) {
            this.collectIdentifiers(node.left, result);
            this.collectIdentifiers(node.right, result);
        } else if (node instanceof AST.PrefixExpression) {
            this.collectIdentifiers(node.right, result);
        } else if (node instanceof AST.CallExpression) {
            this.collectIdentifiers(node.function, result);
            node.arguments.forEach(a => this.collectIdentifiers(a, result));
        } else if (node instanceof AST.IfExpression) {
            this.collectIdentifiers(node.condition, result);
            this.collectIdentifiers(node.consequence, result);
            if (node.alternative) this.collectIdentifiers(node.alternative, result);
        } else if (node instanceof AST.WhileStatement) {
            this.collectIdentifiers(node.condition, result);
            this.collectIdentifiers(node.body, result);
        } else if (node instanceof AST.ForStatement) {
            this.collectIdentifiers(node.iterable, result);
            this.collectIdentifiers(node.body, result);
        } else if (node instanceof AST.MethodCallExpression) {
            this.collectIdentifiers(node.object, result);
            node.arguments.forEach(a => this.collectIdentifiers(a, result));
        } else if (node instanceof AST.MemberAccessExpression) {
            this.collectIdentifiers(node.left, result);
        } else if (node instanceof AST.IndexExpression) {
            this.collectIdentifiers(node.left, result);
            this.collectIdentifiers(node.index, result);
        } else if (node instanceof AST.CastExpression) {
            this.collectIdentifiers(node.expression, result);
        } else if (node instanceof AST.MatchExpression) {
            this.collectIdentifiers(node.value, result);
            node.arms.forEach(arm => this.collectIdentifiers(arm.body, result));
        } else if (node instanceof AST.ArrayLiteral) {
            node.elements.forEach(e => this.collectIdentifiers(e, result));
        } else if (node instanceof AST.StructLiteral) {
            node.values.forEach(v => this.collectIdentifiers(v.value, result));
        } else if (node instanceof AST.AddressOfExpression) {
            this.collectIdentifiers(node.value, result);
        } else if (node instanceof AST.StaticCallExpression) {
            node.arguments.forEach(a => this.collectIdentifiers(a, result));
        } else if (node instanceof AST.UnsafeExpression) {
            this.collectIdentifiers(node.block, result);
        } else if (node instanceof AST.RangeExpression) {
            this.collectIdentifiers(node.start, result);
            this.collectIdentifiers(node.end, result);
        } else if (node instanceof AST.InterpolatedStringExpression) {
            for (const part of node.parts) {
                if (!(part instanceof AST.StringLiteral)) {
                    this.collectIdentifiers(part, result);
                }
            }
        }
        // ClosureExpression: do NOT recurse — nested closures compute their own captures
    }

    /** Collect variable names defined (let/for) at the top level of a block. */
    private collectDefinitions(block: AST.BlockStatement, result: Set<string>) {
        for (const stmt of block.statements) {
            if (stmt instanceof AST.LetStatement) {
                result.add(stmt.name.value);
            } else if (stmt instanceof AST.ForStatement) {
                result.add(stmt.variable.value);
            }
        }
    }

    private resolveType(t: AST.Type): Type {
        const name = t instanceof AST.TypeIdentifier ? t.value : t.toString();
        
        if (name === "int") return IntType;
        if (name === "i8") return { kind: "primitive", name: "i8" }; // Or reuse constant
        if (name === "string") return StringType;
        if (name === "bool") return BoolType;
        if (name === "any") return { kind: "primitive", name: "any" };
        if (t instanceof AST.PointerType) {
            return { kind: "pointer", elementType: this.resolveType(t.elementType) };
        }
        if (t instanceof AST.FunctionTypeNode) {
            return {
                kind: "function",
                params: t.paramTypes.map(p => this.resolveType(p)),
                returnType: this.resolveType(t.returnType),
            };
        }
        
        // Generic Instantiation: Result<T>
        if (t instanceof AST.TypeIdentifier && t.typeParams.length > 0) {
            return {
                kind: "generic_inst",
                name: t.value,
                args: t.typeParams.map(p => this.resolveType(p))
            };
        }
        
        // Check if it's a known enum or struct type
        const sym = this.scope.resolve(name);
        if (sym && sym.type.kind === "enum") return sym.type;
        if (sym && sym.type.kind === "struct") return sym.type;

        // Generic Parameter Check
        if (this.genericContext.includes(name)) {
            return { kind: "generic_param", name };
        }

        return UnknownType;
    }

    /** Convert an analyzer Type back to an AST Type node (for patching untyped closure params). */
    private typeToASTType(t: Type, refToken: Token): AST.Type {
        const synth: Token = { type: TokenType.Identifier, literal: "", line: refToken.line, column: refToken.column };
        if (t.kind === "primitive") {
            synth.literal = t.name;
            return new AST.TypeIdentifier(synth, t.name);
        }
        if (t.kind === "pointer") {
            synth.type = TokenType.Star;
            synth.literal = "*";
            return new AST.PointerType(synth, this.typeToASTType(t.elementType, refToken));
        }
        if (t.kind === "generic_inst") {
            synth.literal = t.name;
            return new AST.TypeIdentifier(synth, t.name, t.args.map(a => this.typeToASTType(a, refToken)));
        }
        if (t.kind === "generic_param") {
            synth.literal = t.name;
            return new AST.TypeIdentifier(synth, t.name);
        }
        if (t.kind === "enum") {
            synth.literal = t.name;
            return new AST.TypeIdentifier(synth, t.name);
        }
        if (t.kind === "struct") {
            synth.literal = t.name;
            return new AST.TypeIdentifier(synth, t.name);
        }
        if (t.kind === "function") {
            const paramTypes = t.params.map(p => this.typeToASTType(p, refToken));
            const returnType = this.typeToASTType(t.returnType, refToken);
            return new AST.FunctionTypeNode(synth, paramTypes, returnType);
        }
        // Fallback: unknown → "any"
        synth.literal = "any";
        return new AST.TypeIdentifier(synth, "any");
    }

    private validateTraitBounds(funcName: string, typeArgs: AST.Type[], constraints: Map<string, string[]>, token: { line: number, column: number }) {
        // Get the function's type param names to map type args to param names
        // We need to look up the function definition to get param names
        // For now, use the constraints map keys in order to match with typeArgs
        const paramNames = Array.from(constraints.keys());

        // Build a lookup: match type param index to constraints
        // The typeArgs correspond to the function's typeParams in order
        // We need the function's full typeParams list to properly index
        // Since constraints only contains params with bounds, we iterate constraints
        for (const [paramName, bounds] of constraints) {
            // Find which index this param is at
            // We look through all typeArgs, matching by the position of paramName
            // in the function's typeParam list — but we only have constraints, not the full list.
            // The simplest approach: iterate all typeArgs and check if the param at that
            // position has bounds.
            //
            // Actually, we need the function's AST node to get the typeParams order.
            // For now, use a simpler heuristic: constraints map keys are ordered by insertion
            // (Map preserves insertion order), and they correspond 1:1 with typeArgs
            // for the common case where all type params have bounds.
            // For the general case, we'd need the full param list.
            const paramIdx = paramNames.indexOf(paramName);
            if (paramIdx >= 0 && paramIdx < typeArgs.length) {
                const typeArg = typeArgs[paramIdx];
                const typeName = typeArg.toString();

                for (const traitName of bounds) {
                    const impls = this.traitImpls.get(traitName);
                    if (!impls || !impls.has(typeName)) {
                        this.error(
                            `Type '${typeName}' does not implement trait '${traitName}' (required by '${funcName}')`,
                            token
                        );
                    }
                }
            }
        }
    }

    private error(msg: string, token: { line: number, column: number }) {
        this.diagnostics.push({ message: msg, line: token.line, col: token.column, file: this.currentModulePath || undefined });
    }
}
