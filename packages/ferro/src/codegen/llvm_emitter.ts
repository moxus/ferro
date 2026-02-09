
import * as AST from "../ast/ast";
import { CompiledModule } from "../analysis/module_loader";
import { SymbolTable } from "../analysis/symbol_table";
import { Type } from "../analysis/types";

export class LLVMEmitter {
    private output: string = "";
    private header: string = "";
    private globals: string = "";
    private types: string = "";
    private deferredOutput: string = "";
    private registerCounter: number = 0;
    private labelCounter: number = 0;
    private closureCounter: number = 0;
    private locals: Map<string, string> = new Map();
    private localTypes: Map<string, string> = new Map();
    // Locals stored as raw pointers (struct literals, enum variants) — no load needed
    private localIsPtr: Set<string> = new Set();
    private structs: Map<string, Map<string, number>> = new Map();
    private structFieldTypes: Map<string, Map<string, string>> = new Map(); 
    private functionReturnTypes: Map<string, string> = new Map(); 
    
    // Generics Support
    private genericStructs: Map<string, AST.StructDefinition> = new Map();
    private instantiatedStructs: Set<string> = new Set();

    // Generic Functions Support
    private genericFunctions: Map<string, AST.FunctionLiteral> = new Map();
    private genericFunctionModulePaths: Map<string, string> = new Map();
    private genericFunctionScopes: Map<string, SymbolTable> = new Map();
    private instantiatedFunctions: Set<string> = new Set();
    private currentTypeBindings: Map<string, string> = new Map();

    // Enum Support
    private enumDefs: Map<string, AST.EnumDefinition> = new Map();
    private enumVariantTags: Map<string, Map<string, number>> = new Map();
    private enumVariantFieldTypes: Map<string, Map<string, string[]>> = new Map();
    private enumPayloadSize: Map<string, number> = new Map();

    // Generic Enums Support
    private genericEnums: Map<string, AST.EnumDefinition> = new Map();
    private instantiatedEnums: Set<string> = new Set();

    // Trait/Impl Support
    // traitMethods: TraitName -> list of method names
    private traitMethods: Map<string, string[]> = new Map();
    // implBlocks: key "TraitName_TargetType" -> ImplBlock (non-generic)
    private implBlocks: Map<string, AST.ImplBlock> = new Map();
    // implBlockModulePaths: key "TraitName_TargetType" -> source module path
    private implBlockModulePaths: Map<string, string> = new Map();
    // genericImplBlocks: TraitName -> ImplBlock (generic, with typeParams)
    private genericImplBlocks: Map<string, AST.ImplBlock[]> = new Map();
    // genericImplBlockModulePaths: same key structure -> source module path
    private genericImplModulePaths: Map<string, string[]> = new Map();
    // Set of emitted impl method function names (to avoid duplicates)
    private emittedImplMethods: Set<string> = new Set();

    private currentScope: SymbolTable | undefined;
    private currentModulePath: string = "";
    private moduleIds: Map<string, number> = new Map();
    private stringConstants: Map<string, string> = new Map();
    private declaredExterns: Set<string> = new Set();
    private variadicExterns: Set<string> = new Set();
    private functionParamTypes: Map<string, string[]> = new Map();

    // Track which runtime functions are defined by loaded modules
    private definedFunctions: Set<string> = new Set();
    // Map from mangled name -> canonical (unmangled) name for runtime exports
    private runtimeExports: Map<string, string> = new Map();
    // The LLVM type name for the runtime's String struct (e.g., "%struct.m2_fs_String")
    private runtimeStringType: string = "";

    // Vec/HashMap element type tracking: variable name → LLVM element type
    // Used to know what bitcasts to insert for type-erased runtime calls
    private vecElemTypes: Map<string, string> = new Map();
    // HashMap key/value type tracking: variable name → { keyType, valueType }
    private hashMapTypes: Map<string, { keyType: string, valueType: string }> = new Map();
    // Tracks the output element type of the last emitted Vec.map() call for type propagation
    private lastMapOutputElemType: string = "i32";

    // Track which local variables are mutable (for mutable capture by reference)
    private localMutable: Set<string> = new Set();

    // Reference Counting support
    // Stack of scope frames: each frame tracks RC variable names defined in that scope
    private rcScopeStack: Set<string>[] = [];
    // Variables that have been explicitly drop()ed — skip release at scope exit
    private droppedVars: Set<string> = new Set();
    // Whether we are inside a runtime function (skip RC insertion for runtime internals)
    private insideRuntimeFn: boolean = false;

    private isStringType(t: string): boolean {
        return t === "%String" || (this.runtimeStringType !== "" && t === this.runtimeStringType);
    }

    private getStringType(): string {
        return this.runtimeStringType || "%String";
    }

    private getVecStructType(): string {
        // Find the runtime's fs_Vec struct type
        for (const [name] of this.structs) {
            if (name.endsWith("fs_Vec")) return `%struct.${name}`;
        }
        return "%struct.fs_Vec";
    }

    private getHashMapStructType(): string {
        for (const [name] of this.structs) {
            if (name.endsWith("fs_HashMap")) return `%struct.${name}`;
        }
        return "%struct.fs_HashMap";
    }

    private isVecType(t: string): boolean {
        return t.includes("fs_Vec");
    }

    private isHashMapType(t: string): boolean {
        return t.includes("fs_HashMap");
    }

    // Returns true if the given LLVM type is reference-counted (needs retain/release)
    private isRcType(t: string): boolean {
        return this.isStringType(t);
    }

    // Emit an fs_rc_retain call on a variable's alloca address.
    // This increments the rc field in-place.
    private emitRcRetainAddr(addr: string) {
        if (this.insideRuntimeFn) return;
        const strType = this.getStringType();
        this.output += `  call void @fs_rc_retain(${strType}* ${addr})\n`;
    }

    // Emit an fs_rc_release call. `addr` is the alloca address of the variable.
    private emitRcRelease(addr: string) {
        if (this.insideRuntimeFn) return;
        const strType = this.getStringType();
        this.output += `  call void @fs_rc_release(${strType}* ${addr})\n`;
    }

    // Emit release calls for all RC variables in the current (top) scope frame
    private emitScopeRelease() {
        if (this.insideRuntimeFn) return;
        if (this.rcScopeStack.length === 0) return;
        const frame = this.rcScopeStack[this.rcScopeStack.length - 1];
        for (const varName of frame) {
            if (this.droppedVars.has(varName)) continue;
            const addr = this.locals.get(varName);
            if (addr) {
                this.emitRcRelease(addr);
            }
        }
    }

    // Push a new RC scope frame
    private pushRcScope() {
        this.rcScopeStack.push(new Set());
    }

    // Pop the current RC scope frame (after emitting releases)
    private popRcScope() {
        this.rcScopeStack.pop();
    }

    // Track a variable as RC in the current scope frame
    private trackRcLocal(varName: string) {
        if (this.insideRuntimeFn) return;
        if (this.rcScopeStack.length > 0) {
            this.rcScopeStack[this.rcScopeStack.length - 1].add(varName);
        }
    }

    // Check if an expression produces a "fresh" RC value (rc=1, no retain needed)
    private isFreshRcValue(expr: AST.Expression): boolean {
        // String literals → fs_string_from_literal → fresh
        if (expr instanceof AST.StringLiteral) return true;
        // String concatenation → fs_string_concat → fresh
        if (expr instanceof AST.InfixExpression && expr.operator === "+") {
            const lt = this.getExpressionType(expr.left);
            if (this.isStringType(lt)) return true;
        }
        // Function calls returning string → fresh (callee produced it with rc=1)
        if (expr instanceof AST.CallExpression) {
            const retType = this.getExpressionType(expr);
            if (this.isRcType(retType)) return true;
        }
        return false;
    }

    // Returns true if the compiled modules provide the runtime (no need to link runtime.c)
    public hasSelfHostedRuntime(): boolean {
        return this.runtimeExports.size > 0;
    }

    public emit(modules: Map<string, CompiledModule>, entryPath: string): string {
        this.output = "";
        this.header = "";
        this.globals = "";
        this.types = "";
        this.deferredOutput = "";
        this.registerCounter = 0;
        this.labelCounter = 0;
        this.closureCounter = 0;
        this.locals.clear();
        this.localTypes.clear();
        this.structs.clear();
        this.structFieldTypes.clear();
        this.functionReturnTypes.clear();
        this.genericStructs.clear();
        this.instantiatedStructs.clear();
        this.genericFunctions.clear();
        this.genericFunctionModulePaths.clear();
        this.genericFunctionScopes.clear();
        this.instantiatedFunctions.clear();
        this.currentTypeBindings.clear();
        this.enumDefs.clear();
        this.enumVariantTags.clear();
        this.enumVariantFieldTypes.clear();
        this.enumPayloadSize.clear();
        this.genericEnums.clear();
        this.instantiatedEnums.clear();
        this.moduleIds.clear();
        this.stringConstants.clear();
        this.declaredExterns.clear();
        this.functionParamTypes.clear();
        this.definedFunctions.clear();
        this.runtimeExports.clear();
        this.runtimeStringType = "";
        this.rcScopeStack = [];
        this.droppedVars.clear();
        this.insideRuntimeFn = false;

        let idCounter = 1;
        modules.forEach((_, path) => {
            this.moduleIds.set(path, idCounter++);
        });

        // Pre-scan: collect all function names that will be defined by modules
        // and identify runtime exports (functions matching fs_string_* / fs_print_*)
        const runtimeFnNames = new Set([
            "fs_string_alloc", "fs_string_from_literal", "fs_string_concat",
            "fs_print_string", "fs_print_int",
            "fs_string_eq", "fs_string_cmp", "fs_string_len", "fs_string_index",
            "fs_string_slice", "fs_string_free",
            "fs_rc_retain", "fs_rc_release",
            "fs_vec_new", "fs_vec_push", "fs_vec_get", "fs_vec_set", "fs_vec_pop",
            "fs_vec_len", "fs_vec_free",
            "fs_hash_int", "fs_hash_string",
            "fs_hashmap_new", "fs_hashmap_insert", "fs_hashmap_get",
            "fs_hashmap_contains", "fs_hashmap_remove", "fs_hashmap_len", "fs_hashmap_free",
            "fs_hashmap_iter_next",
            "fs_file_open", "fs_file_close", "fs_file_read", "fs_file_write",
            "fs_file_read_line", "fs_file_write_string", "fs_file_seek", "fs_file_tell",
            "fs_math_abs", "fs_math_min", "fs_math_max", "fs_math_pow", "fs_math_sqrt", "fs_math_clamp",
            "fs_int_to_string", "fs_bool_to_string"
        ]);
        modules.forEach((mod, path) => {
            mod.program.statements.forEach(stmt => {
                const fn = this.extractFunctionLiteral(stmt);
                if (fn?.name) {
                    const mangledName = this.getMangledName(fn.name, path);
                    this.definedFunctions.add(mangledName);
                    // If this module exports a runtime function, track it
                    if (runtimeFnNames.has(fn.name)) {
                        this.runtimeExports.set(mangledName, fn.name);
                    }
                }
            });
        });

        this.emitHeader();

        // Step 1: Emit struct and enum definitions
        modules.forEach((mod, path) => {
            this.currentModulePath = path;
            this.currentScope = mod.scope;
            mod.program.statements.forEach(stmt => {
                if (stmt instanceof AST.StructDefinition) {
                    this.emitStructDefinition(stmt);
                } else if (stmt instanceof AST.EnumDefinition) {
                    this.emitEnumDefinition(stmt);
                } else if (stmt instanceof AST.ExportStatement) {
                    if (stmt.statement instanceof AST.StructDefinition) {
                        this.emitStructDefinition(stmt.statement);
                    } else if (stmt.statement instanceof AST.EnumDefinition) {
                        this.emitEnumDefinition(stmt.statement);
                    }
                }
            });
        });

        // Step 1.25: Register traits and impl blocks
        modules.forEach((mod, path) => {
            this.currentModulePath = path;
            this.currentScope = mod.scope;
            mod.program.statements.forEach(stmt => {
                const s = stmt instanceof AST.ExportStatement ? stmt.statement : stmt;
                if (s instanceof AST.TraitDeclaration) {
                    this.traitMethods.set(s.name.value, s.methods.map(m => m.name));
                } else if (s instanceof AST.ImplBlock) {
                    this.registerImplBlock(s, path);
                }
            });
        });

        // Step 1.5: Emit extern declarations
        modules.forEach((mod, path) => {
            this.currentModulePath = path;
            this.currentScope = mod.scope;
            mod.program.statements.forEach(stmt => {
                if (stmt instanceof AST.ExternStatement) {
                    this.emitExternStatement(stmt);
                }
            });
        });

        // Step 2: Register function return types and parameter types
        modules.forEach((mod, path) => {
            this.currentModulePath = path;
            mod.program.statements.forEach(stmt => {
                const fn = this.extractFunctionLiteral(stmt);
                if (fn?.name) {
                    // Generic functions: store definition for on-demand monomorphization
                    if (fn.typeParams.length > 0) {
                        const mangledName = this.getMangledName(fn.name, path);
                        this.genericFunctions.set(mangledName, fn);
                        this.genericFunctionModulePaths.set(mangledName, path);
                        if (mod.scope) this.genericFunctionScopes.set(mangledName, mod.scope);
                        return;
                    }
                    const mangledName = this.getMangledName(fn.name, path);
                    const retType = fn.returnType ? this.mapType(fn.returnType) : "void";
                    const paramTypes = fn.parameters.map(p => {
                        const t = this.mapType(p.type);
                        // Enum/struct types are passed by pointer (unless already a pointer)
                        if ((t.startsWith("%enum.") || t.startsWith("%struct.")) && !t.endsWith("*")) return `${t}*`;
                        return t;
                    });
                    this.functionReturnTypes.set(mangledName, retType);
                    this.functionParamTypes.set(mangledName, paramTypes);
                    // Also register under canonical name for runtime exports
                    const canonical = this.runtimeExports.get(mangledName);
                    if (canonical) {
                        this.functionReturnTypes.set(canonical, retType);
                        this.functionParamTypes.set(canonical, paramTypes);
                    }
                }
            });
        });

        // Step 3: Emit function bodies (skip generic functions — emitted on demand)
        modules.forEach((mod, path) => {
            this.currentModulePath = path;
            this.currentScope = mod.scope;
            mod.program.statements.forEach(stmt => {
                const fn = this.extractFunctionLiteral(stmt);
                if (fn?.name) {
                    if (fn.typeParams.length > 0) return; // Skip generic functions
                    this.emitFunction(fn);
                }
            });
        });

        // Step 3.5: Emit non-generic impl method bodies
        this.implBlocks.forEach((impl, key) => {
            const modulePath = this.implBlockModulePaths.get(key)!;
            this.currentModulePath = modulePath;
            this.emitImplMethods(impl);
        });

        const entryModule = modules.get(entryPath);
        if (entryModule) {
            this.currentModulePath = entryPath;
            this.currentScope = entryModule.scope;
            this.emitMain(entryModule.program);
        }

        return this.header + this.types + this.output + this.deferredOutput + this.globals;
    }

    private getMangledName(name: string, sourceModule?: string): string {
        if (!sourceModule) return name;
        const id = this.moduleIds.get(sourceModule);
        if (id === undefined) return name;
        return `m${id}_${name}`;
    }

    private extractFunctionLiteral(stmt: AST.Statement): AST.FunctionLiteral | null {
        if (stmt instanceof AST.FunctionLiteral) return stmt;
        if (stmt instanceof AST.ExpressionStatement && stmt.expression instanceof AST.FunctionLiteral) return stmt.expression;
        if (stmt instanceof AST.ExportStatement && stmt.statement instanceof AST.ExpressionStatement && stmt.statement.expression instanceof AST.FunctionLiteral) return stmt.statement.expression;
        return null;
    }

    private mapType(type: Type | AST.Type): string {
        let typeName = "";
        if ('kind' in type) {
            const t = type as Type;
            if (t.kind === "primitive") typeName = t.name;
            else if (t.kind === "pointer") return `${this.mapType(t.elementType)}*`;
            else if (t.kind === "function") return "{ i8*, i8* }";
        } else if (type instanceof AST.FunctionTypeNode) {
            return "{ i8*, i8* }";
        } else if ('value' in type) {
            typeName = (type as any).value;
        } else if (type instanceof AST.PointerType) {
            return `${this.mapType(type.elementType)}*`;
        }

        // Check current generic type bindings (during monomorphized function emission)
        if (typeName && this.currentTypeBindings.has(typeName)) {
            return this.currentTypeBindings.get(typeName)!;
        }

        if (typeName === "int") return "i32";
        if (typeName === "bool") return "i1";
        if (typeName === "string") return this.runtimeStringType || "%String";
        if (typeName === "void") return "void";
        if (typeName === "i8") return "i8";
        if (typeName === "File") return "%File";
        // Vec<T> and HashMap<K,V> map to their runtime struct types
        if (typeName === "Vec") return this.getVecStructType();
        if (typeName === "HashMap") return this.getHashMapStructType();

        const sym = this.currentScope?.resolve(typeName);
        let mangledName = this.getMangledName(typeName, this.currentModulePath);
        if (sym) mangledName = this.getMangledName(sym.name, sym.sourceModule);

        if (this.structs.has(mangledName)) return `%struct.${mangledName}`;
        if (this.enumDefs.has(mangledName)) return `%enum.${mangledName}`;
        // Check generic definition
        if (this.genericStructs.has(mangledName)) {
             // We can't map a generic type without arguments to a concrete LLVM type yet.
             // This happens if user writes `let x: Box` without `<int>`.
             // For now, return fallback or error?
             // But if `typeName` came from AST `TypeIdentifier` without params...
             // Assume i32 fallback for now.
        }

        return "i32"; 
    }

    private mapTypeWithBindings(type: AST.Type | Type, bindings: Map<string, string>): string {
        if (type instanceof AST.TypeIdentifier) {
            if (bindings.has(type.value)) return bindings.get(type.value)!;
            
            if (type.typeParams.length > 0) {
                const args = type.typeParams.map(t => this.mapTypeWithBindings(t, bindings));
                const sym = this.currentScope?.resolve(type.value);
                let innerName = this.getMangledName(type.value, this.currentModulePath);
                if (sym) innerName = this.getMangledName(sym.name, sym.sourceModule);
                
                return `%struct.${this.instantiateStruct(innerName, args)}`;
            }
        }
        
        let typeName = "";
        if (type instanceof AST.TypeIdentifier) typeName = type.value;
        else if ('name' in type && (type as any).kind === 'primitive') typeName = (type as any).name;
        
        if (bindings.has(typeName)) return bindings.get(typeName)!;
        
        if (type instanceof AST.PointerType) {
            return `${this.mapTypeWithBindings(type.elementType, bindings)}*`;
        }
        
        return this.mapType(type);
    }

    private instantiateStruct(genericName: string, typeArgs: string[]): string {
        const def = this.genericStructs.get(genericName);
        if (!def) throw new Error(`Generic struct ${genericName} not found`);

        if (def.typeParams.length !== typeArgs.length) {
            throw new Error(`Generic struct ${genericName} expects ${def.typeParams.length} args, got ${typeArgs.length}`);
        }

        const suffix = typeArgs.map(t => t.replace(/%/g, "").replace(/\*/g, "_ptr").replace(/\./g, "_")).join("_");
        const instanceName = `${genericName}_${suffix}`;

        if (this.instantiatedStructs.has(instanceName)) return instanceName;
        this.instantiatedStructs.add(instanceName);

        const typeBindings = new Map<string, string>();
        def.typeParams.forEach((paramName, i) => {
            typeBindings.set(paramName, typeArgs[i]);
        });

        const fieldMap = new Map<string, number>();
        const fieldTypeMap = new Map<string, string>();
        
        const fieldTypes: string[] = [];
        def.fields.forEach((f, i) => {
            fieldMap.set(f.name.value, i);
            const resolvedType = this.mapTypeWithBindings(f.type, typeBindings);
            fieldTypeMap.set(f.name.value, resolvedType);
            fieldTypes.push(resolvedType);
        });

        this.structs.set(instanceName, fieldMap);
        this.structFieldTypes.set(instanceName, fieldTypeMap);

        const typesStr = fieldTypes.join(", ");
        this.types += `%struct.${instanceName} = type { ${typesStr} }\n\n`;
        
        return instanceName;
    }

    private instantiateFunction(genericName: string, typeArgs: string[]): string {
        const def = this.genericFunctions.get(genericName);
        if (!def) throw new Error(`Generic function ${genericName} not found`);

        if (def.typeParams.length !== typeArgs.length) {
            throw new Error(`Generic function ${genericName} expects ${def.typeParams.length} type args, got ${typeArgs.length}`);
        }

        const suffix = typeArgs.map(t => t.replace(/%/g, "").replace(/\*/g, "_ptr").replace(/\./g, "_")).join("_");
        const instanceName = `${genericName}_${suffix}`;

        if (this.instantiatedFunctions.has(instanceName)) return instanceName;
        this.instantiatedFunctions.add(instanceName);

        // Build type bindings: T -> i32, U -> i1, etc.
        const typeBindings = new Map<string, string>();
        def.typeParams.forEach((paramName, i) => {
            typeBindings.set(paramName, typeArgs[i]);
        });

        // Determine concrete return type and param types
        const retType = def.returnType
            ? this.mapTypeWithBindings(def.returnType, typeBindings)
            : "void";

        const paramTypes = def.parameters.map(p => {
            const t = this.mapTypeWithBindings(p.type, typeBindings);
            if ((t.startsWith("%enum.") || t.startsWith("%struct.")) && !t.endsWith("*")) return `${t}*`;
            return t;
        });
        this.functionReturnTypes.set(instanceName, retType);
        this.functionParamTypes.set(instanceName, paramTypes);

        // Save emitter state
        const oldLocals = new Map(this.locals);
        const oldLocalTypes = new Map(this.localTypes);
        const oldLocalIsPtr = new Set(this.localIsPtr);
        const oldReg = this.registerCounter;
        const oldRcScopeStack = this.rcScopeStack;
        const oldDroppedVars = new Set(this.droppedVars);
        const oldInsideRuntime = this.insideRuntimeFn;
        const oldBindings = new Map(this.currentTypeBindings);
        const oldModulePath = this.currentModulePath;
        const oldScope = this.currentScope;

        this.locals.clear();
        this.localIsPtr.clear();
        this.registerCounter = 0;
        this.rcScopeStack = [];
        this.droppedVars.clear();
        this.insideRuntimeFn = false;
        this.currentTypeBindings = typeBindings;

        // Redirect output to a temporary buffer (so the function isn't emitted inside main)
        const savedOutput = this.output;
        this.output = "";

        // Restore the module context of the generic function definition
        const fnModulePath = this.genericFunctionModulePaths.get(genericName);
        if (fnModulePath) this.currentModulePath = fnModulePath;
        const fnScope = this.genericFunctionScopes.get(genericName);
        if (fnScope) this.currentScope = fnScope;

        // Build parameter list
        const params = def.parameters.map(p => {
            const type = this.mapTypeWithBindings(p.type, typeBindings);
            if ((type.startsWith("%enum.") || type.startsWith("%struct.")) && !type.endsWith("*")) {
                return `${type}* %${p.name.value}`;
            }
            return `${type} %${p.name.value}`;
        }).join(", ");

        this.output += `define ${retType} @${instanceName}(${params}) {\nbb_entry:\n`;
        this.pushRcScope();

        // Set up parameter locals
        def.parameters.forEach(p => {
            const type = this.mapTypeWithBindings(p.type, typeBindings);
            if ((type.startsWith("%enum.") || type.startsWith("%struct.")) && !type.endsWith("*")) {
                this.locals.set(p.name.value, `%${p.name.value}`);
                this.localTypes.set(p.name.value, type);
                this.localIsPtr.add(p.name.value);
                return;
            }
            const addr = this.nextRegister();
            this.output += `  ${addr} = alloca ${type}\n`;
            this.output += `  store ${type} %${p.name.value}, ${type}* ${addr}\n`;
            this.locals.set(p.name.value, addr);
            this.localTypes.set(p.name.value, type);
        });

        // Emit body (same logic as emitFunction for last-stmt-as-return)
        const stmts = def.body.statements;
        for (let i = 0; i < stmts.length - 1; i++) {
            this.emitStatement(stmts[i]);
        }
        const lastStmt = stmts[stmts.length - 1];
        let hasReturn = false;
        if (lastStmt && retType !== "void" && lastStmt instanceof AST.ExpressionStatement && lastStmt.expression) {
            const val = this.emitExpression(lastStmt.expression);
            const expr = lastStmt.expression;
            const isPointerLocal = expr instanceof AST.Identifier && this.localIsPtr.has(expr.value);
            const isReturningRcVar = expr instanceof AST.Identifier && this.isRcType(retType) && !this.isFreshRcValue(expr);
            if (isReturningRcVar) {
                const retAddr = this.locals.get((expr as AST.Identifier).value);
                if (retAddr) this.emitRcRetainAddr(retAddr);
            }
            this.emitScopeRelease();
            if (isPointerLocal) {
                const loadReg = this.nextRegister();
                this.output += `  ${loadReg} = load ${retType}, ${retType}* ${val}\n`;
                this.output += `  ret ${retType} ${loadReg}\n`;
            } else {
                this.output += `  ret ${retType} ${val}\n`;
            }
            hasReturn = true;
        } else if (lastStmt) {
            this.emitStatement(lastStmt);
        }

        if (!hasReturn) {
            this.emitScopeRelease();
            const lastLine = this.output.trimEnd().split("\n").pop()?.trim() || "";
            if (!lastLine.startsWith("ret ")) {
                if (retType === "void") this.output += `  ret void\n`;
                else if (retType === "i32") this.output += `  ret i32 0\n`;
                else if (retType.endsWith("*")) this.output += `  ret ${retType} null\n`;
                else this.output += `  unreachable\n`;
            }
        }

        this.popRcScope();
        this.output += `}\n\n`;

        // Append the generated function to deferred output, restore main output buffer
        this.deferredOutput += this.output;
        this.output = savedOutput;

        // Restore state
        this.locals = oldLocals;
        this.localTypes = oldLocalTypes;
        this.localIsPtr = oldLocalIsPtr;
        this.registerCounter = oldReg;
        this.rcScopeStack = oldRcScopeStack;
        this.droppedVars = oldDroppedVars;
        this.insideRuntimeFn = oldInsideRuntime;
        this.currentTypeBindings = oldBindings;
        this.currentModulePath = oldModulePath;
        this.currentScope = oldScope;

        return instanceName;
    }

    private emitHeader() {
        this.header += `; ModuleID = 'ferro'\n`;
        this.header += `source_filename = "ferro"\n\n`;

        // Only emit %String and runtime declarations if no module defines the runtime functions
        const hasRuntimeModule = this.runtimeExports.size > 0;
        if (!hasRuntimeModule) {
            this.types += `%String = type { i8*, i32, i32 }\n`;
            this.types += `%File = type { i8* }\n\n`;
            this.output += `declare %String @fs_string_alloc(i32)\n`;
            this.output += `declare %String @fs_string_from_literal(i8*, i32)\n`;
            this.output += `declare %String @fs_string_concat(%String*, %String*)\n`;
            this.output += `declare void @fs_print_string(%String*)\n`;
            this.output += `declare void @fs_rc_retain(%String*)\n`;
            this.output += `declare void @fs_rc_release(%String*)\n`;
            this.output += `declare %File @fs_file_open(%String*, %String*)\n`;
            this.output += `declare i32 @fs_file_close(%File*)\n`;
            this.output += `declare i32 @fs_file_read(%File*, i8*, i32, i32)\n`;
            this.output += `declare i32 @fs_file_write(%File*, i8*, i32, i32)\n`;
            this.output += `declare %String @fs_file_read_line(%File*)\n`;
            this.output += `declare i32 @fs_file_write_string(%File*, %String*)\n`;
            this.output += `declare i32 @fs_file_seek(%File*, i64, i32)\n`;
            this.output += `declare i64 @fs_file_tell(%File*)\n`;
            this.output += `declare %String @fs_int_to_string(i32)\n`;
            this.output += `declare %String @fs_bool_to_string(i1)\n`;
            this.output += `declare i32 @printf(i8*, ...)\n`;
            this.output += `declare i8* @malloc(i32)\n`;
            this.output += `declare void @free(i8*)\n`;
            this.declaredExterns.add("printf");
            this.variadicExterns.add("printf");
            this.functionParamTypes.set("printf", ["i8*"]);
            this.functionReturnTypes.set("printf", "i32");
            this.output += `@.str = private unnamed_addr constant [4 x i8] c"%d\\0A\\00"\n\n`;
        } else {
            // In self-hosted mode, find the mangled struct name for fs_String
            // so mapType can resolve "string" to the correct runtime struct type
            for (const [mangledName, canonicalName] of this.runtimeExports) {
                if (canonicalName === "fs_string_alloc") {
                    // Extract module prefix (e.g., "m2" from "m2_fs_string_alloc")
                    const modulePrefix = mangledName.split("_")[0];
                    this.runtimeStringType = `%struct.${modulePrefix}_fs_String`;
                    break;
                }
            }
        }

    }

    private emitStructDefinition(node: AST.StructDefinition) {
        if (node.typeParams.length > 0) {
            const mangledName = this.getMangledName(node.name.value, this.currentModulePath);
            this.genericStructs.set(mangledName, node);
            return;
        }

        const fieldMap = new Map<string, number>();
        const fieldTypeMap = new Map<string, string>();
        node.fields.forEach((f, i) => {
            fieldMap.set(f.name.value, i);
            fieldTypeMap.set(f.name.value, this.mapType(f.type));
        });

        const mangledName = this.getMangledName(node.name.value, this.currentModulePath);
        this.structs.set(mangledName, fieldMap);
        this.structFieldTypes.set(mangledName, fieldTypeMap);

        const types = node.fields.map(f => this.mapType(f.type)).join(", ");
        this.types += `%struct.${mangledName} = type { ${types} }\n\n`;
    }

    private emitEnumDefinition(node: AST.EnumDefinition) {
        const mangledName = this.getMangledName(node.name.value, this.currentModulePath);

        // Generic enums: store definition for on-demand monomorphization
        if (node.typeParams.length > 0) {
            this.genericEnums.set(mangledName, node);
            return;
        }

        this.enumDefs.set(mangledName, node);

        const tagMap = new Map<string, number>();
        const fieldTypeMap = new Map<string, string[]>();
        let maxPayloadSize = 0;

        node.variants.forEach((v, i) => {
            tagMap.set(v.name.value, i);
            const fieldTypes = v.fields.map(f => this.mapType(f));
            fieldTypeMap.set(v.name.value, fieldTypes);

            let variantSize = 0;
            fieldTypes.forEach(ft => {
                variantSize += this.sizeOfLLVMType(ft);
            });
            if (variantSize > maxPayloadSize) maxPayloadSize = variantSize;
        });

        this.enumVariantTags.set(mangledName, tagMap);
        this.enumVariantFieldTypes.set(mangledName, fieldTypeMap);
        this.enumPayloadSize.set(mangledName, maxPayloadSize);

        if (maxPayloadSize > 0) {
            this.types += `%enum.${mangledName} = type { i32, [${maxPayloadSize} x i8] }\n\n`;
        } else {
            this.types += `%enum.${mangledName} = type { i32 }\n\n`;
        }
    }

    private sizeOfLLVMType(t: string): number {
        if (t === "i1") return 1;
        if (t === "i8") return 1;
        if (t === "i32") return 4;
        if (t === "i64") return 8;
        if (t.endsWith("*")) return 8;
        if (t === "%String" || t === this.runtimeStringType) return 16;
        return 8;
    }

    private instantiateEnum(genericName: string, typeArgs: string[]): string {
        const def = this.genericEnums.get(genericName);
        if (!def) throw new Error(`Generic enum ${genericName} not found`);

        const suffix = typeArgs.map(t => t.replace(/%/g, "").replace(/\*/g, "_ptr").replace(/\./g, "_")).join("_");
        const instanceName = `${genericName}_${suffix}`;

        if (this.instantiatedEnums.has(instanceName)) return instanceName;
        this.instantiatedEnums.add(instanceName);

        const typeBindings = new Map<string, string>();
        def.typeParams.forEach((paramName, i) => {
            typeBindings.set(paramName, typeArgs[i]);
        });

        const tagMap = new Map<string, number>();
        const fieldTypeMap = new Map<string, string[]>();
        let maxPayloadSize = 0;

        def.variants.forEach((v, i) => {
            tagMap.set(v.name.value, i);
            const fieldTypes = v.fields.map(f => this.mapTypeWithBindings(f, typeBindings));
            fieldTypeMap.set(v.name.value, fieldTypes);
            let variantSize = 0;
            fieldTypes.forEach(ft => { variantSize += this.sizeOfLLVMType(ft); });
            if (variantSize > maxPayloadSize) maxPayloadSize = variantSize;
        });

        this.enumDefs.set(instanceName, def);
        this.enumVariantTags.set(instanceName, tagMap);
        this.enumVariantFieldTypes.set(instanceName, fieldTypeMap);
        this.enumPayloadSize.set(instanceName, maxPayloadSize);

        if (maxPayloadSize > 0) {
            this.types += `%enum.${instanceName} = type { i32, [${maxPayloadSize} x i8] }\n\n`;
        } else {
            this.types += `%enum.${instanceName} = type { i32 }\n\n`;
        }

        return instanceName;
    }

    private emitStringLiteral(expr: AST.StringLiteral): string {
        const content = expr.value;
        let constName = this.stringConstants.get(content);
        if (!constName) {
            const id = this.stringConstants.size;
            constName = `@.str.lit.${id}`;
            const escaped = this.escapeStringForLLVM(content);
            const len = Buffer.byteLength(content, 'utf8');
            this.globals += `${constName} = private constant [${len} x i8] c"${escaped}"\n`;
            this.stringConstants.set(content, constName);
        }
        const len = Buffer.byteLength(content, 'utf8');
        const reg = this.nextRegister();
        const strType = this.getStringType();
        this.output += `  ${reg} = call ${strType} @fs_string_from_literal(i8* getelementptr inbounds ([${len} x i8], [${len} x i8]* ${constName}, i32 0, i32 0), i32 ${len})\n`;
        return reg;
    }

    /**
     * Emit an interpolated string: f"Hello {name}, age {age}!"
     * Desugars to a chain of fs_string_concat calls.
     * Non-string expressions are converted via fs_int_to_string / fs_bool_to_string.
     */
    private emitInterpolatedString(expr: AST.InterpolatedStringExpression): string {
        const strType = this.getStringType();
        // Convert each part to a string register
        const stringRegs: string[] = [];
        for (const part of expr.parts) {
            if (part instanceof AST.StringLiteral) {
                if (part.value.length === 0) continue; // skip empty literals
                stringRegs.push(this.emitStringLiteral(part));
            } else {
                const exprType = this.getExpressionType(part);
                const val = this.emitExpression(part);
                if (this.isStringType(exprType)) {
                    stringRegs.push(val);
                } else if (exprType === "i32") {
                    const reg = this.nextRegister();
                    this.output += `  ${reg} = call ${strType} @fs_int_to_string(i32 ${val})\n`;
                    stringRegs.push(reg);
                } else if (exprType === "i1") {
                    const reg = this.nextRegister();
                    this.output += `  ${reg} = call ${strType} @fs_bool_to_string(i1 ${val})\n`;
                    stringRegs.push(reg);
                } else {
                    // Fallback: try int
                    const reg = this.nextRegister();
                    this.output += `  ${reg} = call ${strType} @fs_int_to_string(i32 ${val})\n`;
                    stringRegs.push(reg);
                }
            }
        }

        if (stringRegs.length === 0) {
            // Empty f-string: return empty string
            return this.emitStringLiteral(new AST.StringLiteral(expr.token, ""));
        }
        if (stringRegs.length === 1) {
            return stringRegs[0];
        }

        // Chain concat: fold left
        let result = stringRegs[0];
        for (let i = 1; i < stringRegs.length; i++) {
            const leftPtr = this.nextRegister();
            this.output += `  ${leftPtr} = alloca ${strType}\n`;
            this.output += `  store ${strType} ${result}, ${strType}* ${leftPtr}\n`;
            const rightPtr = this.nextRegister();
            this.output += `  ${rightPtr} = alloca ${strType}\n`;
            this.output += `  store ${strType} ${stringRegs[i]}, ${strType}* ${rightPtr}\n`;
            const concatReg = this.nextRegister();
            this.output += `  ${concatReg} = call ${strType} @fs_string_concat(${strType}* ${leftPtr}, ${strType}* ${rightPtr})\n`;
            result = concatReg;
        }
        return result;
    }

    // Emit a raw i8* pointer to a null-terminated string constant (for C interop, e.g. printf format strings)
    private rawStringConstants: Map<string, string> = new Map();
    private emitRawStringPtr(expr: AST.StringLiteral): string {
        const content = expr.value;
        let constName = this.rawStringConstants.get(content);
        if (!constName) {
            const id = this.rawStringConstants.size;
            constName = `@.cstr.${id}`;
            const escaped = this.escapeStringForLLVM(content);
            const len = Buffer.byteLength(content, 'utf8') + 1; // +1 for null terminator
            this.globals += `${constName} = private constant [${len} x i8] c"${escaped}\\00"\n`;
            this.rawStringConstants.set(content, constName);
        }
        const len = Buffer.byteLength(content, 'utf8') + 1;
        return `getelementptr inbounds ([${len} x i8], [${len} x i8]* ${constName}, i32 0, i32 0)`;
    }

    private emitFunction(fn: AST.FunctionLiteral) {
        const oldLocals = new Map(this.locals);
        const oldLocalTypes = new Map(this.localTypes);
        const oldLocalIsPtr = new Set(this.localIsPtr);
        const oldReg = this.registerCounter;
        const oldRcScopeStack = this.rcScopeStack;
        const oldDroppedVars = new Set(this.droppedVars);
        const oldInsideRuntime = this.insideRuntimeFn;
        this.locals.clear();
        this.localIsPtr.clear();
        this.registerCounter = 0;
        this.rcScopeStack = [];
        this.droppedVars.clear();

        let mangledName = this.getMangledName(fn.name, this.currentModulePath);
        // Runtime exports use their canonical (unmangled) name
        const canonicalName = this.runtimeExports.get(mangledName);
        const emitName = canonicalName || mangledName;

        // Skip RC insertion for runtime functions (they manage memory manually)
        this.insideRuntimeFn = !!canonicalName;

        let retType = fn.returnType ? this.mapType(fn.returnType) : "void";
        const params = fn.parameters.map(p => {
            const type = this.mapType(p.type);
            // Pass enum and struct types by pointer (unless already a pointer)
            if ((type.startsWith("%enum.") || type.startsWith("%struct.")) && !type.endsWith("*")) {
                return `${type}* %${p.name.value}`;
            }
            return `${type} %${p.name.value}`;
        }).join(", ");
        this.output += `define ${retType} @${emitName}(${params}) {\nbb_entry:\n`;

        // Push RC scope for function body
        this.pushRcScope();

        fn.parameters.forEach(p => {
            const type = this.mapType(p.type);
            // Enum/struct params passed by-value are converted to by-pointer — use directly
            // But explicit pointer params (ending with *) should go through alloca+store
            if ((type.startsWith("%enum.") || type.startsWith("%struct.")) && !type.endsWith("*")) {
                this.locals.set(p.name.value, `%${p.name.value}`);
                this.localTypes.set(p.name.value, type);
                this.localIsPtr.add(p.name.value);
                return;
            }
            const addr = this.nextRegister();
            this.output += `  ${addr} = alloca ${type}\n`;
            this.output += `  store ${type} %${p.name.value}, ${type}* ${addr}\n`;
            this.locals.set(p.name.value, addr);
            this.localTypes.set(p.name.value, type);
            // Note: RC params are borrowed — caller owns them, we don't track them
        });

        const stmts = fn.body.statements;
        // Emit all but last statement normally
        for (let i = 0; i < stmts.length - 1; i++) {
            this.emitStatement(stmts[i]);
        }
        // For the last statement: if it's an ExpressionStatement in a non-void function,
        // treat it as an implicit return (Rust-style expression return)
        const lastStmt = stmts[stmts.length - 1];
        let hasReturn = false;
        if (lastStmt && retType !== "void" && lastStmt instanceof AST.ExpressionStatement && lastStmt.expression) {
            const val = this.emitExpression(lastStmt.expression);

            // Check if the emitted expression already produced a ret (e.g., return inside unsafe block)
            const lastEmittedLine = this.output.trimEnd().split("\n").pop()?.trim() || "";
            if (lastEmittedLine.startsWith("ret ")) {
                hasReturn = true;
            } else {
                // Pointer-semantic locals need a load to get the struct value for ret
                const expr = lastStmt.expression;
                const isPointerLocal = expr instanceof AST.Identifier && this.localIsPtr.has(expr.value);

                // Release all RC locals before return (but NOT the returned value)
                // If returning an RC variable, retain it before releasing scope (so it survives)
                const isReturningRcVar = expr instanceof AST.Identifier && this.isRcType(retType) && !this.isFreshRcValue(expr);
                if (isReturningRcVar) {
                    // Retain the return value so it survives scope release
                    const retAddr = this.locals.get((expr as AST.Identifier).value);
                    if (retAddr) {
                        this.emitRcRetainAddr(retAddr);
                    }
                }
                this.emitScopeRelease();

                if (isPointerLocal) {
                    const loadReg = this.nextRegister();
                    this.output += `  ${loadReg} = load ${retType}, ${retType}* ${val}\n`;
                    this.output += `  ret ${retType} ${loadReg}\n`;
                } else {
                    this.output += `  ret ${retType} ${val}\n`;
                }
                hasReturn = true;
            }
        } else if (lastStmt) {
            this.emitStatement(lastStmt);
        }

        if (!hasReturn) {
            // Emit RC releases before default return
            this.emitScopeRelease();
            // Only emit default return if the body doesn't already end with a ret
            const lastLine = this.output.trimEnd().split("\n").pop()?.trim() || "";
            if (!lastLine.startsWith("ret ")) {
                if (retType === "i32") this.output += `  ret i32 0\n`;
                else if (retType === "void") this.output += `  ret void\n`;
                else if (retType.endsWith("*")) this.output += `  ret ${retType} null\n`;
                else this.output += `  unreachable\n`;
            }
        }

        this.popRcScope();
        this.output += `}\n\n`;
        this.locals = oldLocals;
        this.localTypes = oldLocalTypes;
        this.localIsPtr = oldLocalIsPtr;
        this.registerCounter = oldReg;
        this.rcScopeStack = oldRcScopeStack;
        this.droppedVars = oldDroppedVars;
        this.insideRuntimeFn = oldInsideRuntime;
    }

    private emitMain(program: AST.Program) {
        this.locals.clear();
        this.localIsPtr.clear();
        this.registerCounter = 0;
        this.droppedVars.clear();
        this.output += `define i32 @main() {\nbb_entry:\n`;
        this.pushRcScope();
        program.statements.forEach(stmt => {
            if (stmt instanceof AST.StructDefinition || stmt instanceof AST.EnumDefinition || stmt instanceof AST.FunctionLiteral || stmt instanceof AST.ImportStatement || stmt instanceof AST.ExternStatement || stmt instanceof AST.TraitDeclaration || stmt instanceof AST.ImplBlock) return;
            if (stmt instanceof AST.ExpressionStatement && stmt.expression instanceof AST.FunctionLiteral) return;
            if (stmt instanceof AST.ExportStatement) {
                if (stmt.statement instanceof AST.LetStatement || stmt.statement instanceof AST.ExpressionStatement) this.emitStatement(stmt.statement);
                return;
            }
            this.emitStatement(stmt);
        });
        this.emitScopeRelease();
        this.popRcScope();
        this.output += `  ret i32 0\n}\n\n`;
    }

    private emitStatement(stmt: AST.Statement) {
        if (stmt instanceof AST.LetStatement) {
            let type = "i32";
            if (stmt.type) type = this.mapType(stmt.type);
            else type = this.getExpressionType(stmt.value!);

            if (stmt.value instanceof AST.StructLiteral) {
                const structAddr = this.emitExpression(stmt.value);
                this.locals.set(stmt.name.value, structAddr);
                this.localTypes.set(stmt.name.value, type);
                this.localIsPtr.add(stmt.name.value);
                return;
            }

            // Enum variant construction returns a pointer (alloca)
            if (stmt.value instanceof AST.StaticCallExpression && type.startsWith("%enum.")) {
                const enumAddr = this.emitExpression(stmt.value);
                this.locals.set(stmt.name.value, enumAddr);
                this.localTypes.set(stmt.name.value, type);
                this.localIsPtr.add(stmt.name.value);
                return;
            }

            // Vec::<T>::new() / HashMap::<K,V>::new() — track element types
            if (stmt.value instanceof AST.StaticCallExpression) {
                const sc = stmt.value as AST.StaticCallExpression;
                if (sc.receiver.value === "Vec" && sc.genericTypeArgs && sc.genericTypeArgs.length > 0) {
                    this.vecElemTypes.set(stmt.name.value, this.mapType(sc.genericTypeArgs[0]));
                } else if (sc.receiver.value === "HashMap" && sc.genericTypeArgs && sc.genericTypeArgs.length >= 2) {
                    this.hashMapTypes.set(stmt.name.value, {
                        keyType: this.mapType(sc.genericTypeArgs[0]),
                        valueType: this.mapType(sc.genericTypeArgs[1])
                    });
                }
            }

            // Track Vec element types from method call results (map, filter, keys, values, collect)
            if (stmt.value instanceof AST.MethodCallExpression) {
                const mc = stmt.value as AST.MethodCallExpression;
                const mName = mc.method.value;

                // Lazy iterator chain: collect() produces a Vec whose element type
                // we can trace from the chain source + map steps
                if (mName === "collect" && this.isIteratorChain(mc)) {
                    const chain = this.analyzeIteratorChain(mc);
                    if (chain) {
                        let et = chain.sourceKind === "vec"
                            ? this.getVecElemType(chain.source)
                            : this.getHashMapKeyValueTypes(chain.source).keyType;
                        for (const step of chain.steps) {
                            if (step.kind === "map" && step.closure instanceof AST.ClosureExpression && step.closure.returnType) {
                                et = this.mapType(step.closure.returnType);
                            }
                        }
                        this.vecElemTypes.set(stmt.name.value, et);
                    }
                } else {
                    const objType = this.getExpressionType(mc.object);
                    if (this.isVecType(objType)) {
                        if (mName === "filter" || mName === "collect") {
                            const srcElemType = this.getVecElemType(mc.object);
                            this.vecElemTypes.set(stmt.name.value, srcElemType);
                        } else if (mName === "map") {
                            // Will be set by emitVecMethodCall during emission
                            // Use a deferred approach: emit first, then read lastMapOutputElemType
                        }
                    } else if (this.isHashMapType(objType)) {
                        const { keyType, valueType } = this.getHashMapKeyValueTypes(mc.object);
                        if (mName === "keys") {
                            this.vecElemTypes.set(stmt.name.value, keyType);
                        } else if (mName === "values") {
                            this.vecElemTypes.set(stmt.name.value, valueType);
                        }
                    }
                }
            }

            const valReg = this.emitExpression(stmt.value!);

            // Post-emission: track map/collect output elem type
            if (stmt.value instanceof AST.MethodCallExpression) {
                const mc = stmt.value as AST.MethodCallExpression;
                if (mc.method.value === "map" && this.isVecType(this.getExpressionType(mc.object))) {
                    this.vecElemTypes.set(stmt.name.value, this.lastMapOutputElemType);
                }
                // Iterator chain collect also sets lastMapOutputElemType
                if (mc.method.value === "collect" && this.isIteratorChain(mc)) {
                    this.vecElemTypes.set(stmt.name.value, this.lastMapOutputElemType);
                }
            }

            const varReg = `%${stmt.name.value}.addr`;
            this.output += `  ${varReg} = alloca ${type}\n`;
            this.output += `  store ${type} ${valReg}, ${type}* ${varReg}\n`;
            this.locals.set(stmt.name.value, varReg);
            this.localTypes.set(stmt.name.value, type);
            if (stmt.mutable) this.localMutable.add(stmt.name.value);

            // RC: track this variable and retain if it's a copy of another RC value
            if (this.isRcType(type)) {
                this.trackRcLocal(stmt.name.value);
                // If RHS is not a fresh allocation, we need to retain (shared heap rc)
                if (stmt.value && !this.isFreshRcValue(stmt.value)) {
                    this.emitRcRetainAddr(varReg);
                }
            }
        } else if (stmt instanceof AST.ExpressionStatement) {
            if (stmt.expression) this.emitExpression(stmt.expression);
        } else if (stmt instanceof AST.ReturnStatement) {
            if (stmt.returnValue) {
                const val = this.emitExpression(stmt.returnValue);
                const type = this.getExpressionType(stmt.returnValue);
                // Pointer-semantic locals need a load to get the struct value for ret
                const isPointerLocal = stmt.returnValue instanceof AST.Identifier && this.localIsPtr.has(stmt.returnValue.value);

                // RC: retain return value if it's a shared reference, then release scope
                if (this.isRcType(type) && !this.isFreshRcValue(stmt.returnValue) && stmt.returnValue instanceof AST.Identifier) {
                    const srcAddr = this.locals.get(stmt.returnValue.value);
                    if (srcAddr) this.emitRcRetainAddr(srcAddr);
                }
                this.emitScopeRelease();

                if (isPointerLocal) {
                    const loadReg = this.nextRegister();
                    this.output += `  ${loadReg} = load ${type}, ${type}* ${val}\n`;
                    this.output += `  ret ${type} ${loadReg}\n`;
                } else {
                    this.output += `  ret ${type} ${val}\n`;
                }
            } else {
                this.emitScopeRelease();
                this.output += `  ret void\n`;
            }
        } else if (stmt instanceof AST.WhileStatement) {
            this.emitWhileStatement(stmt);
        } else if (stmt instanceof AST.ForStatement) {
            this.emitForStatement(stmt);
        } else if (stmt instanceof AST.BlockStatement) {
            stmt.statements.forEach(s => this.emitStatement(s));
        }
    }

    private emitWhileStatement(stmt: AST.WhileStatement) {
        const labelId = this.labelCounter++;
        const condLabel = `while_cond_${labelId}`;
        const bodyLabel = `while_body_${labelId}`;
        const endLabel = `while_end_${labelId}`;
        this.output += `  br label %${condLabel}\n${condLabel}:\n`;
        const condReg = this.emitExpression(stmt.condition);
        this.output += `  br i1 ${condReg}, label %${bodyLabel}, label %${endLabel}\n${bodyLabel}:\n`;
        this.emitStatement(stmt.body);
        this.output += `  br label %${condLabel}\n${endLabel}:\n`;
    }

    private emitForStatement(stmt: AST.ForStatement) {
        if (stmt.iterable instanceof AST.RangeExpression) {
            this.emitRangeForLoop(stmt);
        } else {
            // Check for lazy iterator chain: for (x in vec.iter().filter(...))
            if (this.isIteratorChain(stmt.iterable)) {
                this.emitIteratorForLoop(stmt);
                return;
            }

            // Collection iteration
            const iterableType = this.getExpressionType(stmt.iterable);
            if (this.isVecType(iterableType)) {
                this.emitVecForLoop(stmt);
            } else if (this.isHashMapType(iterableType)) {
                this.emitHashMapForLoop(stmt);
            } else {
                // Try IntoIterator for user-defined types
                if (!this.tryEmitIntoIteratorForLoop(stmt)) {
                    // Unknown collection type - emit nothing (will be caught by analyzer)
                }
            }
        }
    }

    private emitRangeForLoop(stmt: AST.ForStatement) {
        const range = stmt.iterable as AST.RangeExpression;
        const varName = stmt.variable.value;
        const labelId = this.labelCounter++;
        const condLabel = `for_cond_${labelId}`;
        const bodyLabel = `for_body_${labelId}`;
        const endLabel = `for_end_${labelId}`;

        // Evaluate start and end once before the loop
        const startVal = this.emitExpression(range.start);
        const endVal = this.emitExpression(range.end);

        // Allocate loop variable and store start value
        const varAddr = `%${varName}.addr`;
        this.output += `  ${varAddr} = alloca i32\n`;
        this.output += `  store i32 ${startVal}, i32* ${varAddr}\n`;
        this.locals.set(varName, varAddr);
        this.localTypes.set(varName, "i32");

        // Condition: load counter, compare < end
        this.output += `  br label %${condLabel}\n${condLabel}:\n`;
        const curVal = this.nextRegister();
        this.output += `  ${curVal} = load i32, i32* ${varAddr}\n`;
        const cmpReg = this.nextRegister();
        this.output += `  ${cmpReg} = icmp slt i32 ${curVal}, ${endVal}\n`;
        this.output += `  br i1 ${cmpReg}, label %${bodyLabel}, label %${endLabel}\n${bodyLabel}:\n`;

        // Body with RC scope
        this.pushRcScope();
        stmt.body.statements.forEach(s => this.emitStatement(s));
        this.emitScopeRelease();
        this.popRcScope();

        // Increment: i = i + 1
        const loadReg = this.nextRegister();
        this.output += `  ${loadReg} = load i32, i32* ${varAddr}\n`;
        const incReg = this.nextRegister();
        this.output += `  ${incReg} = add i32 ${loadReg}, 1\n`;
        this.output += `  store i32 ${incReg}, i32* ${varAddr}\n`;

        // Branch back to condition
        this.output += `  br label %${condLabel}\n${endLabel}:\n`;
    }

    private emitVecForLoop(stmt: AST.ForStatement) {
        const varName = stmt.variable.value;
        const vecStructType = this.getVecStructType();
        const elemType = this.getVecElemType(stmt.iterable);
        const labelId = this.labelCounter++;
        const condLabel = `forvec_cond_${labelId}`;
        const bodyLabel = `forvec_body_${labelId}`;
        const endLabel = `forvec_end_${labelId}`;

        // Get Vec alloca address
        let selfPtr: string;
        if (stmt.iterable instanceof AST.Identifier) {
            const addr = this.locals.get(stmt.iterable.value);
            if (addr) {
                selfPtr = addr;
            } else {
                selfPtr = this.emitExpression(stmt.iterable);
            }
        } else {
            selfPtr = this.emitExpression(stmt.iterable);
        }

        // Get length once before the loop
        const lenReg = this.nextRegister();
        this.output += `  ${lenReg} = call i32 @fs_vec_len(${vecStructType}* ${selfPtr})\n`;

        // Allocate index counter, init to 0
        const idxAddr = `%__forvec_idx_${labelId}`;
        this.output += `  ${idxAddr} = alloca i32\n`;
        this.output += `  store i32 0, i32* ${idxAddr}\n`;

        // Allocate loop variable
        const varAddr = `%${varName}.addr`;
        this.output += `  ${varAddr} = alloca ${elemType}\n`;
        this.locals.set(varName, varAddr);
        this.localTypes.set(varName, elemType);

        // Condition: idx < len
        this.output += `  br label %${condLabel}\n${condLabel}:\n`;
        const curIdx = this.nextRegister();
        this.output += `  ${curIdx} = load i32, i32* ${idxAddr}\n`;
        const cmpReg = this.nextRegister();
        this.output += `  ${cmpReg} = icmp slt i32 ${curIdx}, ${lenReg}\n`;
        this.output += `  br i1 ${cmpReg}, label %${bodyLabel}, label %${endLabel}\n${bodyLabel}:\n`;

        // Body: get element from Vec, store to loop variable
        this.pushRcScope();
        const rawPtr = this.nextRegister();
        this.output += `  ${rawPtr} = call i8* @fs_vec_get(${vecStructType}* ${selfPtr}, i32 ${curIdx})\n`;
        const castPtr = this.nextRegister();
        this.output += `  ${castPtr} = bitcast i8* ${rawPtr} to ${elemType}*\n`;
        const elemVal = this.nextRegister();
        this.output += `  ${elemVal} = load ${elemType}, ${elemType}* ${castPtr}\n`;
        this.output += `  store ${elemType} ${elemVal}, ${elemType}* ${varAddr}\n`;

        // Emit body statements
        stmt.body.statements.forEach(s => this.emitStatement(s));
        this.emitScopeRelease();
        this.popRcScope();

        // Increment index
        const loadIdx = this.nextRegister();
        this.output += `  ${loadIdx} = load i32, i32* ${idxAddr}\n`;
        const incIdx = this.nextRegister();
        this.output += `  ${incIdx} = add i32 ${loadIdx}, 1\n`;
        this.output += `  store i32 ${incIdx}, i32* ${idxAddr}\n`;

        // Branch back to condition
        this.output += `  br label %${condLabel}\n${endLabel}:\n`;
    }

    private emitHashMapForLoop(stmt: AST.ForStatement) {
        const varName = stmt.variable.value;
        const hmStructType = this.getHashMapStructType();
        const { keyType } = this.getHashMapKeyValueTypes(stmt.iterable);
        const labelId = this.labelCounter++;
        const condLabel = `forhm_cond_${labelId}`;
        const bodyLabel = `forhm_body_${labelId}`;
        const endLabel = `forhm_end_${labelId}`;

        // Get HashMap alloca address
        let selfPtr: string;
        if (stmt.iterable instanceof AST.Identifier) {
            const addr = this.locals.get(stmt.iterable.value);
            if (addr) {
                selfPtr = addr;
            } else {
                selfPtr = this.emitExpression(stmt.iterable);
            }
        } else {
            selfPtr = this.emitExpression(stmt.iterable);
        }

        // Allocate cursor (i32), init to 0
        const cursorAddr = `%__forhm_cursor_${labelId}`;
        this.output += `  ${cursorAddr} = alloca i32\n`;
        this.output += `  store i32 0, i32* ${cursorAddr}\n`;

        // Allocate loop variable
        const varAddr = `%${varName}.addr`;
        this.output += `  ${varAddr} = alloca ${keyType}\n`;
        this.locals.set(varName, varAddr);
        this.localTypes.set(varName, keyType);

        // Condition: call fs_hashmap_iter_next, check for null
        this.output += `  br label %${condLabel}\n${condLabel}:\n`;
        const rawKeyPtr = this.nextRegister();
        this.output += `  ${rawKeyPtr} = call i8* @fs_hashmap_iter_next(${hmStructType}* ${selfPtr}, i32* ${cursorAddr})\n`;
        const isNull = this.nextRegister();
        this.output += `  ${isNull} = icmp eq i8* ${rawKeyPtr}, null\n`;
        this.output += `  br i1 ${isNull}, label %${endLabel}, label %${bodyLabel}\n${bodyLabel}:\n`;

        // Body: bitcast raw key pointer to keyType*, load into loop variable
        this.pushRcScope();
        const castPtr = this.nextRegister();
        this.output += `  ${castPtr} = bitcast i8* ${rawKeyPtr} to ${keyType}*\n`;
        const keyVal = this.nextRegister();
        this.output += `  ${keyVal} = load ${keyType}, ${keyType}* ${castPtr}\n`;
        this.output += `  store ${keyType} ${keyVal}, ${keyType}* ${varAddr}\n`;

        // Emit body statements
        stmt.body.statements.forEach(s => this.emitStatement(s));
        this.emitScopeRelease();
        this.popRcScope();

        // Branch back to condition
        this.output += `  br label %${condLabel}\n${endLabel}:\n`;
    }

    private getExpressionType(expr: AST.Expression): string {
        if (expr instanceof AST.RangeExpression) return "i32";
        if (expr instanceof AST.IntegerLiteral) return "i32";
        if (expr instanceof AST.BooleanLiteral) return "i1";
        if (expr instanceof AST.NullLiteral) return "i8*";
        if (expr instanceof AST.StringLiteral) return this.runtimeStringType || "%String";
        if (expr instanceof AST.InterpolatedStringExpression) return this.runtimeStringType || "%String";
        if (expr instanceof AST.StructLiteral) {
            const sym = this.currentScope?.resolve(expr.name.value);
            let mangledName = this.getMangledName(expr.name.value, this.currentModulePath);
            if (sym) mangledName = this.getMangledName(sym.name, sym.sourceModule);
            
            // Check if generic
            if (expr.typeParams.length > 0) {
                const typeArgs = expr.typeParams.map(t => this.mapType(t)); // Basic map for now (recursive)
                // Actually, mapType uses current context.
                return `%struct.${this.instantiateStruct(mangledName, typeArgs)}`;
            }
            return `%struct.${mangledName}`;
        }
        if (expr instanceof AST.Identifier) {
            const type = this.localTypes.get(expr.value);
            if (type) return type;
            const sym = this.currentScope?.resolve(expr.value);
            if (sym) return this.mapType(sym.type);
            return "i32";
        }
        if (expr instanceof AST.CallExpression) {
            // Generic function call: identity::<int>(42)
            if (expr.function instanceof AST.GenericInstantiationExpression) {
                const genExpr = expr.function;
                if (genExpr.left instanceof AST.Identifier) {
                    const sym = this.currentScope?.resolve(genExpr.left.value);
                    let baseName = this.getMangledName(genExpr.left.value, this.currentModulePath);
                    if (sym) baseName = this.getMangledName(sym.name, sym.sourceModule);
                    const typeArgs = genExpr.typeArgs.map(t => this.mapType(t));
                    const suffix = typeArgs.map(t => t.replace(/%/g, "").replace(/\*/g, "_ptr").replace(/\./g, "_")).join("_");
                    const instanceName = `${baseName}_${suffix}`;
                    if (this.functionReturnTypes.has(instanceName)) {
                        return this.functionReturnTypes.get(instanceName)!;
                    }
                    // Eagerly instantiate to get return type
                    if (this.genericFunctions.has(baseName)) {
                        const name = this.instantiateFunction(baseName, typeArgs);
                        return this.functionReturnTypes.get(name) || "i32";
                    }
                }
            }
            if (expr.function instanceof AST.Identifier) {
                const sym = this.currentScope?.resolve(expr.function.value);
                let funcName = this.getMangledName(expr.function.value, this.currentModulePath);
                if (sym && sym.unsafe) {
                    funcName = sym.name;
                } else if (sym) {
                    funcName = this.getMangledName(sym.name, sym.sourceModule);
                }
                if (this.functionReturnTypes.has(funcName)) {
                    return this.functionReturnTypes.get(funcName)!;
                }
                if (sym && sym.type.kind === "function" && (sym.type as any).returnType) {
                    return this.mapType((sym.type as any).returnType);
                }
            }
            return "i32";
        }
        if (expr instanceof AST.AddressOfExpression) return `${this.getExpressionType(expr.value)}*`;
        if (expr instanceof AST.MemberAccessExpression) return this.getMemberType(expr);
        if (expr instanceof AST.IndexExpression) {
            const leftType = this.getExpressionType(expr.left);
            if (leftType.endsWith("*")) return leftType.slice(0, -1);
            return "i32";
        }
        if (expr instanceof AST.MethodCallExpression) {
            return this.getMethodCallReturnType(expr);
        }
        if (expr instanceof AST.PrefixExpression && expr.operator === "*") {
            const t = this.getExpressionType(expr.right);
            return t.endsWith("*") ? t.slice(0, -1) : "i32";
        }
        if (expr instanceof AST.InfixExpression) {
             if (["==","!=","<",">","<=",">=","&&","||"].includes(expr.operator)) return "i1";
             const lt = this.getExpressionType(expr.left);
             // Pointer arithmetic returns same pointer type
             if ((expr.operator === "+" || expr.operator === "-") && lt.endsWith("*")) return lt;
             return lt;
        }
        if (expr instanceof AST.StaticCallExpression) {
            // Vec::<T>::new() returns the Vec struct type
            if (expr.receiver.value === "Vec" && expr.method.value === "new") return this.getVecStructType();
            // HashMap::<K,V>::new() returns the HashMap struct type
            if (expr.receiver.value === "HashMap" && expr.method.value === "new") return this.getHashMapStructType();
            // Math static calls return i32
            if (expr.receiver.value === "Math") return "i32";

            const sym = this.currentScope?.resolve(expr.receiver.value);
            let enumName = this.getMangledName(expr.receiver.value, this.currentModulePath);
            if (sym) enumName = this.getMangledName(sym.name, sym.sourceModule);
            // Handle generic enum
            if (expr.genericTypeArgs && expr.genericTypeArgs.length > 0 && this.genericEnums.has(enumName)) {
                const typeArgs = expr.genericTypeArgs.map(t => this.mapType(t));
                const instanceName = this.instantiateEnum(enumName, typeArgs);
                return `%enum.${instanceName}`;
            }
            if (this.enumDefs.has(enumName)) return `%enum.${enumName}`;
            // Trait method call: check if receiver is a known trait
            if (this.traitMethods.has(expr.receiver.value)) {
                // Look up the return type from the impl method function
                // We need to know the self type to determine the concrete impl
                if (expr.arguments.length > 0) {
                    const selfType = this.getExpressionType(expr.arguments[0]);
                    let targetTypeName = selfType;
                    if (targetTypeName.startsWith("%struct.")) targetTypeName = targetTypeName.replace("%struct.", "");
                    else if (targetTypeName.startsWith("%enum.")) targetTypeName = targetTypeName.replace("%enum.", "");
                    else if (targetTypeName === "i32") targetTypeName = "int";
                    else if (targetTypeName === "i1") targetTypeName = "bool";
                    const funcName = `${expr.receiver.value}_${targetTypeName}_${expr.method.value}`;
                    const retType = this.functionReturnTypes.get(funcName);
                    if (retType) return retType;
                }
            }
        }
        if (expr instanceof AST.CastExpression) {
            return this.mapType(expr.targetType);
        }
        if (expr instanceof AST.ClosureExpression) {
            return "{ i8*, i8* }";
        }
        return "i32";
    }

    private getMemberType(expr: AST.MemberAccessExpression): string {
        let objType = "";
        if (expr.left instanceof AST.Identifier) {
            objType = this.localTypes.get(expr.left.value) || "";
        } else if (expr.left instanceof AST.PrefixExpression && expr.left.operator === "*") {
            const ptrType = this.getExpressionType(expr.left.right);
            objType = ptrType.endsWith("*") ? ptrType.slice(0, -1) : "";
        }
        if (objType.startsWith("%struct.")) {
            const structName = objType.slice(8);
            const fieldTypeMap = this.structFieldTypes.get(structName);
            if (fieldTypeMap) return fieldTypeMap.get(expr.member.value) || "i32";
        }
        return "i32";
    }

    private emitExpression(expr: AST.Expression): string {
        if (expr instanceof AST.UnsafeExpression) {
            expr.block.statements.forEach(s => this.emitStatement(s));
            return "0";
        }

        if (expr instanceof AST.IfExpression) {
            return this.emitIfExpression(expr);
        }

        if (expr instanceof AST.MatchExpression) return this.emitMatchExpression(expr);
        if (expr instanceof AST.StaticCallExpression) return this.emitStaticCallExpression(expr);

        if (expr instanceof AST.IntegerLiteral) return expr.value.toString();
        if (expr instanceof AST.BooleanLiteral) return expr.value ? "1" : "0";
        if (expr instanceof AST.NullLiteral) return "null";
        if (expr instanceof AST.StringLiteral) return this.emitStringLiteral(expr);
        if (expr instanceof AST.InterpolatedStringExpression) return this.emitInterpolatedString(expr);
        if (expr instanceof AST.StructLiteral) return this.emitStructLiteral(expr);
        if (expr instanceof AST.CastExpression) return this.emitCastExpression(expr);
        if (expr instanceof AST.AddressOfExpression) return this.emitAddressOfExpression(expr);
        if (expr instanceof AST.MemberAccessExpression) return this.emitMemberAccess(expr);
        if (expr instanceof AST.IndexExpression) return this.emitIndexExpression(expr);
        if (expr instanceof AST.MethodCallExpression) return this.emitMethodCallExpression(expr);
        if (expr instanceof AST.ClosureExpression) return this.emitClosureExpression(expr);
        if (expr instanceof AST.CallExpression) return this.emitCallExpression(expr);
        
        if (expr instanceof AST.Identifier) {
            const addr = this.locals.get(expr.value);
            if (addr) {
                const type = this.localTypes.get(expr.value) || "i32";
                // Pointer-semantic locals (struct literals, enum variants) — return ptr directly
                if (this.localIsPtr.has(expr.value)) {
                    return addr;
                }
                const reg = this.nextRegister();
                this.output += `  ${reg} = load ${type}, ${type}* ${addr}\n`;
                return reg;
            }
            throw new Error(`Undefined variable ${expr.value}`);
        }

        if (expr instanceof AST.InfixExpression) {
            if (expr.operator === "=") {
                const right = this.emitExpression(expr.right);
                if (expr.left instanceof AST.PrefixExpression && expr.left.operator === "*") {
                    const ptrReg = this.emitExpression(expr.left.right);
                    const ptrType = this.getExpressionType(expr.left.right);
                    const elemType = ptrType.endsWith("*") ? ptrType.slice(0, -1) : "i32";
                    const rightType = this.getExpressionType(expr.right);
                    let storeVal = right;
                    // Insert trunc/sext if value type doesn't match element type
                    if (rightType !== elemType) {
                        if (rightType === "i32" && elemType === "i8") {
                            const castReg = this.nextRegister();
                            this.output += `  ${castReg} = trunc i32 ${right} to i8\n`;
                            storeVal = castReg;
                        } else if (rightType === "i8" && elemType === "i32") {
                            const castReg = this.nextRegister();
                            this.output += `  ${castReg} = sext i8 ${right} to i32\n`;
                            storeVal = castReg;
                        }
                    }
                    this.output += `  store ${elemType} ${storeVal}, ${ptrType} ${ptrReg}\n`;
                    return right;
                } else if (expr.left instanceof AST.Identifier) {
                    const addr = this.locals.get(expr.left.value);
                    if (addr) {
                        const type = this.localTypes.get(expr.left.value) || "i32";
                        // RC: release old value before overwriting, retain new if shared
                        if (this.isRcType(type)) {
                            this.emitRcRelease(addr);
                        }
                        this.output += `  store ${type} ${right}, ${type}* ${addr}\n`;
                        if (this.isRcType(type) && !this.isFreshRcValue(expr.right)) {
                            this.emitRcRetainAddr(addr);
                        }
                        return right;
                    }
                } else if (expr.left instanceof AST.MemberAccessExpression) {
                    return this.emitMemberStore(expr.left, right, this.getExpressionType(expr.right));
                }
                throw new Error("Invalid assignment");
            }
            
            const leftType = this.getExpressionType(expr.left);
            const rightType = this.getExpressionType(expr.right);
            const left = this.emitExpression(expr.left);
            const right = this.emitExpression(expr.right);

            // String concatenation: String + String calls fs_string_concat
            if (expr.operator === "+" && this.isStringType(leftType)) {
                const strType = this.getStringType();
                const leftPtr = this.nextRegister();
                this.output += `  ${leftPtr} = alloca ${strType}\n`;
                this.output += `  store ${strType} ${left}, ${strType}* ${leftPtr}\n`;
                const rightPtr = this.nextRegister();
                this.output += `  ${rightPtr} = alloca ${strType}\n`;
                this.output += `  store ${strType} ${right}, ${strType}* ${rightPtr}\n`;
                const concatReg = this.nextRegister();
                this.output += `  ${concatReg} = call ${strType} @fs_string_concat(${strType}* ${leftPtr}, ${strType}* ${rightPtr})\n`;
                return concatReg;
            }

            // Pointer arithmetic: ptr + int or ptr - int uses getelementptr
            if ((expr.operator === "+" || expr.operator === "-") && leftType.endsWith("*") && !rightType.endsWith("*")) {
                const reg = this.nextRegister();
                if (expr.operator === "-") {
                    const negReg = this.nextRegister();
                    this.output += `  ${negReg} = sub i32 0, ${right}\n`;
                    const gepReg = this.nextRegister();
                    this.output += `  ${gepReg} = getelementptr ${leftType.slice(0, -1)}, ${leftType} ${left}, i32 ${negReg}\n`;
                    return gepReg;
                } else {
                    this.output += `  ${reg} = getelementptr ${leftType.slice(0, -1)}, ${leftType} ${left}, i32 ${right}\n`;
                }
                return reg;
            }

            // String equality: String == String or String != String calls fs_string_eq
            if ((expr.operator === "==" || expr.operator === "!=") && this.isStringType(leftType)) {
                const strType = this.getStringType();
                const leftPtr = this.nextRegister();
                this.output += `  ${leftPtr} = alloca ${strType}\n`;
                this.output += `  store ${strType} ${left}, ${strType}* ${leftPtr}\n`;
                const rightPtr = this.nextRegister();
                this.output += `  ${rightPtr} = alloca ${strType}\n`;
                this.output += `  store ${strType} ${right}, ${strType}* ${rightPtr}\n`;
                const eqReg = this.nextRegister();
                this.output += `  ${eqReg} = call i1 @fs_string_eq(${strType}* ${leftPtr}, ${strType}* ${rightPtr})\n`;
                if (expr.operator === "!=") {
                    const negReg = this.nextRegister();
                    this.output += `  ${negReg} = xor i1 ${eqReg}, 1\n`;
                    return negReg;
                }
                return eqReg;
            }

            // String ordering: String < > <= >= calls fs_string_cmp
            if (["<", ">", "<=", ">="].includes(expr.operator) && this.isStringType(leftType)) {
                const strType = this.getStringType();
                const leftPtr = this.nextRegister();
                this.output += `  ${leftPtr} = alloca ${strType}\n`;
                this.output += `  store ${strType} ${left}, ${strType}* ${leftPtr}\n`;
                const rightPtr = this.nextRegister();
                this.output += `  ${rightPtr} = alloca ${strType}\n`;
                this.output += `  store ${strType} ${right}, ${strType}* ${rightPtr}\n`;
                const cmpReg = this.nextRegister();
                this.output += `  ${cmpReg} = call i32 @fs_string_cmp(${strType}* ${leftPtr}, ${strType}* ${rightPtr})\n`;
                const cmpOp = expr.operator === "<" ? "slt" : expr.operator === ">" ? "sgt" : expr.operator === "<=" ? "sle" : "sge";
                const resultReg = this.nextRegister();
                this.output += `  ${resultReg} = icmp ${cmpOp} i32 ${cmpReg}, 0\n`;
                return resultReg;
            }

            const reg = this.nextRegister();

            // Comparisons — use the actual operand type
            if (["==", "!=", "<", ">", "<=", ">="].includes(expr.operator)) {
                const cmpType = leftType.endsWith("*") ? leftType : (rightType.endsWith("*") ? rightType : leftType);
                const cmpOp = expr.operator === "==" ? "eq" : expr.operator === "!=" ? "ne" : expr.operator === "<" ? "slt" : expr.operator === ">" ? "sgt" : expr.operator === "<=" ? "sle" : "sge";
                this.output += `  ${reg} = icmp ${cmpOp} ${cmpType} ${left}, ${right}\n`;
                return reg;
            }

            // Logical operators — operate on i1 (bool)
            if (expr.operator === "&&") {
                this.output += `  ${reg} = and i1 ${left}, ${right}\n`;
                return reg;
            }
            if (expr.operator === "||") {
                this.output += `  ${reg} = or i1 ${left}, ${right}\n`;
                return reg;
            }

            // Integer arithmetic
            let op = "";
            switch(expr.operator) {
                case "+": op = "add"; break;
                case "-": op = "sub"; break;
                case "*": op = "mul"; break;
                case "/": op = "sdiv"; break;
            }
            if (op) { this.output += `  ${reg} = ${op} i32 ${left}, ${right}\n`; return reg; }
            return "0";
        }
        
        if (expr instanceof AST.PrefixExpression && expr.operator === "*") {
            const ptrReg = this.emitExpression(expr.right);
            const ptrType = this.getExpressionType(expr.right);
            const elemType = ptrType.endsWith("*") ? ptrType.slice(0, -1) : "i32";
            const reg = this.nextRegister();
            this.output += `  ${reg} = load ${elemType}, ${ptrType} ${ptrReg}\n`;
            return reg;
        }

        if (expr instanceof AST.PrefixExpression && expr.operator === "-") {
            const val = this.emitExpression(expr.right);
            const reg = this.nextRegister();
            this.output += `  ${reg} = sub i32 0, ${val}\n`;
            return reg;
        }
        
        return "0";
    }

    private emitStructLiteral(expr: AST.StructLiteral): string {
        const sym = this.currentScope?.resolve(expr.name.value);
        let structName = expr.name.value;
        if (sym) structName = this.getMangledName(sym.name, sym.sourceModule);
        else structName = this.getMangledName(structName, this.currentModulePath);

        // Handle Generics instantiation
        if (expr.typeParams.length > 0) {
            const typeArgs = expr.typeParams.map(t => this.mapType(t));
            structName = this.instantiateStruct(structName, typeArgs);
        }

        const fieldMap = this.structs.get(structName);
        if (!fieldMap) throw new Error(`Unknown struct ${structName}`);

        const resAddr = this.nextRegister();
        this.output += `  ${resAddr} = alloca %struct.${structName}\n`;

        expr.values.forEach(v => {
            const index = fieldMap.get(v.name.value);
            const valReg = this.emitExpression(v.value);
            const valType = this.getExpressionType(v.value);
            const fieldPtr = this.nextRegister();
            this.output += `  ${fieldPtr} = getelementptr inbounds %struct.${structName}, %struct.${structName}* ${resAddr}, i32 0, i32 ${index}\n`;
            this.output += `  store ${valType} ${valReg}, ${valType}* ${fieldPtr}\n`;
        });
        return resAddr;
    }

    private emitMemberAccess(expr: AST.MemberAccessExpression): string {
        let objAddr: string;
        let objType: string;
        if (expr.left instanceof AST.Identifier) {
            objAddr = this.locals.get(expr.left.value)!;
            objType = this.localTypes.get(expr.left.value)!;
        } else if (expr.left instanceof AST.PrefixExpression && expr.left.operator === "*") {
            objAddr = this.emitExpression(expr.left.right);
            const ptrType = this.getExpressionType(expr.left.right);
            objType = ptrType.slice(0, -1);
        } else {
            throw new Error("Invalid member access");
        }

        const structName = objType.slice(8);
        const fieldMap = this.structs.get(structName);
        const fieldTypeMap = this.structFieldTypes.get(structName);
        const index = fieldMap!.get(expr.member.value);
        const type = fieldTypeMap!.get(expr.member.value);
        
        const fieldPtr = this.nextRegister();
        this.output += `  ${fieldPtr} = getelementptr inbounds ${objType}, ${objType}* ${objAddr}, i32 0, i32 ${index}\n`;
        const reg = this.nextRegister();
        this.output += `  ${reg} = load ${type}, ${type}* ${fieldPtr}\n`;
        return reg;
    }

    private emitMemberStore(expr: AST.MemberAccessExpression, value: string, valueType: string): string {
        let objAddr: string;
        let objType: string;
        if (expr.left instanceof AST.Identifier) {
            objAddr = this.locals.get(expr.left.value)!;
            objType = this.localTypes.get(expr.left.value)!;
        } else if (expr.left instanceof AST.PrefixExpression && expr.left.operator === "*") {
            objAddr = this.emitExpression(expr.left.right);
            const ptrType = this.getExpressionType(expr.left.right);
            objType = ptrType.slice(0, -1);
        } else throw new Error("Invalid member store");

        const structName = objType.slice(8);
        const fieldMap = this.structs.get(structName);
        const fieldTypeMap = this.structFieldTypes.get(structName);
        const index = fieldMap!.get(expr.member.value);
        const type = fieldTypeMap!.get(expr.member.value);

        const fieldPtr = this.nextRegister();
        this.output += `  ${fieldPtr} = getelementptr inbounds ${objType}, ${objType}* ${objAddr}, i32 0, i32 ${index}\n`;
        this.output += `  store ${type} ${value}, ${type}* ${fieldPtr}\n`;
        return value;
    }

    private emitExternStatement(stmt: AST.ExternStatement) {
        const name = stmt.name.value;
        if (this.declaredExterns.has(name)) return;
        const retType = this.mapType(stmt.returnType);
        const paramTypes = stmt.params.map(p => this.mapType(p.type));
        const paramsPart = paramTypes.join(", ");
        const variadicSuffix = stmt.variadic ? (paramTypes.length > 0 ? ", ..." : "...") : "";
        this.output += `declare ${retType} @${name}(${paramsPart}${variadicSuffix})\n`;
        this.declaredExterns.add(name);
        if (stmt.variadic) this.variadicExterns.add(name);
        this.functionParamTypes.set(name, paramTypes);
        this.functionReturnTypes.set(name, retType);
    }

    private emitStaticCallExpression(expr: AST.StaticCallExpression): string {
        const sym = this.currentScope?.resolve(expr.receiver.value);
        let enumName = this.getMangledName(expr.receiver.value, this.currentModulePath);
        if (sym) enumName = this.getMangledName(sym.name, sym.sourceModule);

        // Vec::<T>::new() → call fs_vec_new(elem_size)
        if (expr.receiver.value === "Vec" && expr.method.value === "new" && expr.genericTypeArgs && expr.genericTypeArgs.length > 0) {
            const elemType = this.mapType(expr.genericTypeArgs[0]);
            const elemSize = this.sizeOfLLVMType(elemType);
            const vecStructType = this.getVecStructType();
            const reg = this.nextRegister();
            this.output += `  ${reg} = call ${vecStructType} @fs_vec_new(i32 ${elemSize})\n`;
            return reg;
        }

        // HashMap::<K, V>::new() → call fs_hashmap_new(key_size, value_size)
        if (expr.receiver.value === "HashMap" && expr.method.value === "new" && expr.genericTypeArgs && expr.genericTypeArgs.length >= 2) {
            const keyType = this.mapType(expr.genericTypeArgs[0]);
            const valType = this.mapType(expr.genericTypeArgs[1]);
            const keySize = this.sizeOfLLVMType(keyType);
            const valSize = this.sizeOfLLVMType(valType);
            const hmStructType = this.getHashMapStructType();
            const reg = this.nextRegister();
            this.output += `  ${reg} = call ${hmStructType} @fs_hashmap_new(i32 ${keySize}, i32 ${valSize})\n`;
            return reg;
        }

        // Handle generic enum variant construction: Option::<int>::Some(42)
        if (expr.genericTypeArgs && expr.genericTypeArgs.length > 0 && this.genericEnums.has(enumName)) {
            const typeArgs = expr.genericTypeArgs.map(t => this.mapType(t));
            enumName = this.instantiateEnum(enumName, typeArgs);
        }

        if (this.enumDefs.has(enumName)) {
            return this.emitEnumVariantConstruction(enumName, expr.method.value, expr.arguments);
        }

        // Math static calls: Math::abs(x), Math::min(a, b), etc.
        if (expr.receiver.value === "Math") {
            const methodName = expr.method.value;
            const fnName = `fs_math_${methodName}`;
            const args = expr.arguments.map(a => {
                const val = this.emitExpression(a);
                return `i32 ${val}`;
            });
            const reg = this.nextRegister();
            this.output += `  ${reg} = call i32 @${fnName}(${args.join(", ")})\n`;
            return reg;
        }

        // Trait method dispatch: TraitName::method(self, args...)
        const traitName = expr.receiver.value;
        if (this.traitMethods.has(traitName)) {
            return this.emitTraitMethodCall(traitName, expr.method.value, expr.arguments);
        }

        return "0";
    }

    private emitEnumVariantConstruction(enumName: string, variantName: string, args: AST.Expression[]): string {
        const tagMap = this.enumVariantTags.get(enumName)!;
        const tag = tagMap.get(variantName)!;
        const fieldTypes = this.enumVariantFieldTypes.get(enumName)!.get(variantName)!;
        const payloadSize = this.enumPayloadSize.get(enumName)!;

        // Allocate the enum on the stack
        const enumAddr = this.nextRegister();
        this.output += `  ${enumAddr} = alloca %enum.${enumName}\n`;

        // Store the tag
        const tagPtr = this.nextRegister();
        this.output += `  ${tagPtr} = getelementptr inbounds %enum.${enumName}, %enum.${enumName}* ${enumAddr}, i32 0, i32 0\n`;
        this.output += `  store i32 ${tag}, i32* ${tagPtr}\n`;

        // Store payload fields
        if (fieldTypes.length > 0 && payloadSize > 0) {
            const payloadPtr = this.nextRegister();
            this.output += `  ${payloadPtr} = getelementptr inbounds %enum.${enumName}, %enum.${enumName}* ${enumAddr}, i32 0, i32 1\n`;

            const variantStructType = `{ ${fieldTypes.join(", ")} }`;
            const castedPtr = this.nextRegister();
            this.output += `  ${castedPtr} = bitcast [${payloadSize} x i8]* ${payloadPtr} to ${variantStructType}*\n`;

            args.forEach((arg, i) => {
                const val = this.emitExpression(arg);
                const fieldPtr = this.nextRegister();
                this.output += `  ${fieldPtr} = getelementptr inbounds ${variantStructType}, ${variantStructType}* ${castedPtr}, i32 0, i32 ${i}\n`;
                this.output += `  store ${fieldTypes[i]} ${val}, ${fieldTypes[i]}* ${fieldPtr}\n`;
            });
        }

        return enumAddr;
    }

    private emitMatchExpression(expr: AST.MatchExpression): string {
        const hasEnumPatterns = expr.arms.some(arm => arm.pattern instanceof AST.EnumPattern);

        if (hasEnumPatterns) {
            return this.emitEnumMatch(expr);
        }

        return this.emitSimpleMatch(expr);
    }

    private emitSimpleMatch(expr: AST.MatchExpression): string {
        const val = this.emitExpression(expr.value);
        const endLabel = this.nextLabel("match_end");
        const defaultLabel = this.nextLabel("match_default");

        const cases: { value: string, label: string, arm: AST.MatchArm }[] = [];
        let defaultArm: AST.MatchArm | null = null;

        for (const arm of expr.arms) {
            if (arm.pattern instanceof AST.WildcardPattern) {
                defaultArm = arm;
            } else if (arm.pattern instanceof AST.LiteralPattern) {
                const label = this.nextLabel("match_case");
                const patVal = this.emitExpression(arm.pattern.value);
                cases.push({ value: patVal, label, arm });
            }
        }

        this.output += `  switch i32 ${val}, label %${defaultLabel} [\n`;
        for (const c of cases) {
            this.output += `    i32 ${c.value}, label %${c.label}\n`;
        }
        this.output += `  ]\n`;

        const phiIncoming: { value: string, label: string }[] = [];

        for (const c of cases) {
            this.output += `${c.label}:\n`;
            let armResult = "0";
            if (c.arm.body instanceof AST.ExpressionStatement && c.arm.body.expression) {
                armResult = this.emitExpression(c.arm.body.expression);
            } else {
                this.emitStatement(c.arm.body);
            }
            phiIncoming.push({ value: armResult, label: c.label });
            this.output += `  br label %${endLabel}\n`;
        }

        this.output += `${defaultLabel}:\n`;
        let defaultResult = "0";
        if (defaultArm) {
            if (defaultArm.body instanceof AST.ExpressionStatement && defaultArm.body.expression) {
                defaultResult = this.emitExpression(defaultArm.body.expression);
            } else {
                this.emitStatement(defaultArm.body);
            }
        }
        phiIncoming.push({ value: defaultResult, label: defaultLabel });
        this.output += `  br label %${endLabel}\n`;

        this.output += `${endLabel}:\n`;
        const phiReg = this.nextRegister();
        const phiParts = phiIncoming.map(p => `[ ${p.value}, %${p.label} ]`).join(", ");
        this.output += `  ${phiReg} = phi i32 ${phiParts}\n`;
        return phiReg;
    }

    private emitEnumMatch(expr: AST.MatchExpression): string {
        const enumAddr = this.emitExpression(expr.value);

        // Determine enum type from the matched expression
        const enumTypeName = this.getEnumTypeFromExpression(expr.value);

        // Load the tag
        const tagPtr = this.nextRegister();
        this.output += `  ${tagPtr} = getelementptr inbounds %enum.${enumTypeName}, %enum.${enumTypeName}* ${enumAddr}, i32 0, i32 0\n`;
        const tagVal = this.nextRegister();
        this.output += `  ${tagVal} = load i32, i32* ${tagPtr}\n`;

        const endLabel = this.nextLabel("match_end");
        const defaultLabel = this.nextLabel("match_default");

        const tagMap = this.enumVariantTags.get(enumTypeName)!;
        const fieldTypeMap = this.enumVariantFieldTypes.get(enumTypeName)!;
        const payloadSize = this.enumPayloadSize.get(enumTypeName)!;

        const armBlocks: { tag: number, label: string, arm: AST.MatchArm }[] = [];
        let defaultArm: AST.MatchArm | null = null;

        for (const arm of expr.arms) {
            if (arm.pattern instanceof AST.EnumPattern) {
                const tag = tagMap.get(arm.pattern.variantName.value)!;
                const label = this.nextLabel("match_case");
                armBlocks.push({ tag, label, arm });
            } else if (arm.pattern instanceof AST.WildcardPattern) {
                defaultArm = arm;
            }
        }

        // Emit switch on tag
        this.output += `  switch i32 ${tagVal}, label %${defaultLabel} [\n`;
        for (const ab of armBlocks) {
            this.output += `    i32 ${ab.tag}, label %${ab.label}\n`;
        }
        this.output += `  ]\n`;

        // Emit each arm block, collecting results for PHI node
        const phiIncoming: { value: string, label: string }[] = [];

        for (const ab of armBlocks) {
            this.output += `${ab.label}:\n`;

            if (ab.arm.pattern instanceof AST.EnumPattern) {
                const variantName = ab.arm.pattern.variantName.value;
                const fieldTypes = fieldTypeMap.get(variantName)!;
                const bindings = ab.arm.pattern.bindings;

                if (bindings.length > 0 && payloadSize > 0) {
                    const payloadPtr = this.nextRegister();
                    this.output += `  ${payloadPtr} = getelementptr inbounds %enum.${enumTypeName}, %enum.${enumTypeName}* ${enumAddr}, i32 0, i32 1\n`;

                    const variantStructType = `{ ${fieldTypes.join(", ")} }`;
                    const castedPtr = this.nextRegister();
                    this.output += `  ${castedPtr} = bitcast [${payloadSize} x i8]* ${payloadPtr} to ${variantStructType}*\n`;

                    bindings.forEach((binding, i) => {
                        const fieldPtr = this.nextRegister();
                        this.output += `  ${fieldPtr} = getelementptr inbounds ${variantStructType}, ${variantStructType}* ${castedPtr}, i32 0, i32 ${i}\n`;
                        const val = this.nextRegister();
                        this.output += `  ${val} = load ${fieldTypes[i]}, ${fieldTypes[i]}* ${fieldPtr}\n`;

                        const addr = this.nextRegister();
                        this.output += `  ${addr} = alloca ${fieldTypes[i]}\n`;
                        this.output += `  store ${fieldTypes[i]} ${val}, ${fieldTypes[i]}* ${addr}\n`;
                        this.locals.set(binding.value, addr);
                        this.localTypes.set(binding.value, fieldTypes[i]);
                    });
                }
            }

            // Emit arm body and capture result value
            let armResult = "0";
            if (ab.arm.body instanceof AST.ExpressionStatement && ab.arm.body.expression) {
                armResult = this.emitExpression(ab.arm.body.expression);
            } else {
                this.emitStatement(ab.arm.body);
            }
            phiIncoming.push({ value: armResult, label: ab.label });
            this.output += `  br label %${endLabel}\n`;
        }

        // Default block
        this.output += `${defaultLabel}:\n`;
        let defaultResult = "0";
        if (defaultArm) {
            if (defaultArm.body instanceof AST.ExpressionStatement && defaultArm.body.expression) {
                defaultResult = this.emitExpression(defaultArm.body.expression);
            } else {
                this.emitStatement(defaultArm.body);
            }
        }
        phiIncoming.push({ value: defaultResult, label: defaultLabel });
        this.output += `  br label %${endLabel}\n`;

        this.output += `${endLabel}:\n`;

        // Emit PHI node to merge results from all arms
        const phiReg = this.nextRegister();
        const phiParts = phiIncoming.map(p => `[ ${p.value}, %${p.label} ]`).join(", ");
        this.output += `  ${phiReg} = phi i32 ${phiParts}\n`;
        return phiReg;
    }

    private getEnumTypeFromExpression(expr: AST.Expression): string {
        if (expr instanceof AST.Identifier) {
            const type = this.localTypes.get(expr.value);
            if (type && type.startsWith("%enum.")) {
                return type.slice(6);
            }
        }
        // Fallback: try getExpressionType
        const exprType = this.getExpressionType(expr);
        if (exprType.startsWith("%enum.")) {
            return exprType.slice(6);
        }
        return "";
    }

    private emitCastExpression(expr: AST.CastExpression): string {
        const val = this.emitExpression(expr.expression);
        const srcType = this.getExpressionType(expr.expression);
        const dstType = this.mapType(expr.targetType);

        if (srcType === dstType) return val;

        const reg = this.nextRegister();

        // Integer narrowing (i32 → i8)
        if (srcType === "i32" && dstType === "i8") {
            this.output += `  ${reg} = trunc i32 ${val} to i8\n`;
            return reg;
        }
        // Integer widening signed (i8 → i32)
        if (srcType === "i8" && dstType === "i32") {
            this.output += `  ${reg} = sext i8 ${val} to i32\n`;
            return reg;
        }
        // Bool to int (i1 → i32)
        if (srcType === "i1" && dstType === "i32") {
            this.output += `  ${reg} = zext i1 ${val} to i32\n`;
            return reg;
        }
        // Int to bool (i32 → i1)
        if (srcType === "i32" && dstType === "i1") {
            this.output += `  ${reg} = icmp ne i32 ${val}, 0\n`;
            return reg;
        }
        // Bool to i8 (i1 → i8)
        if (srcType === "i1" && dstType === "i8") {
            this.output += `  ${reg} = zext i1 ${val} to i8\n`;
            return reg;
        }
        // i8 to bool (i8 → i1)
        if (srcType === "i8" && dstType === "i1") {
            this.output += `  ${reg} = icmp ne i8 ${val}, 0\n`;
            return reg;
        }

        // Pointer to pointer (bitcast)
        if (srcType.endsWith("*") && dstType.endsWith("*")) {
            this.output += `  ${reg} = bitcast ${srcType} ${val} to ${dstType}\n`;
            return reg;
        }

        return val;
    }

    private emitAddressOfExpression(expr: AST.AddressOfExpression): string {
        if (expr.value instanceof AST.Identifier) {
            return this.locals.get(expr.value.value)!;
        }
        if (expr.value instanceof AST.MemberAccessExpression) {
            return this.emitMemberAddressAsPtr(expr.value);
        }
        throw new Error("Invalid address of");
    }

    private emitMemberAddressAsPtr(expr: AST.MemberAccessExpression): string {
        // Similar to emitMemberAccess but returns ptr
        let objAddr: string;
        let objType: string;
        if (expr.left instanceof AST.Identifier) {
            objAddr = this.locals.get(expr.left.value)!;
            objType = this.localTypes.get(expr.left.value)!;
        } else {
             // Handle *ptr
             const ptrReg = this.emitExpression((expr.left as AST.PrefixExpression).right);
             const ptrType = this.getExpressionType((expr.left as AST.PrefixExpression).right);
             objType = ptrType.slice(0, -1);
             objAddr = ptrReg;
        }
        const structName = objType.slice(8);
        const fieldMap = this.structs.get(structName);
        const index = fieldMap!.get(expr.member.value);
        const fieldPtr = this.nextRegister();
        this.output += `  ${fieldPtr} = getelementptr inbounds ${objType}, ${objType}* ${objAddr}, i32 0, i32 ${index}\n`;
        return fieldPtr;
    }

    private escapeStringForLLVM(s: string): string {
        let out = "";
        for (let i = 0; i < s.length; i++) {
            const code = s.charCodeAt(i);
            if (code < 32 || code > 126 || code === 34 || code === 92) {
                out += "\\" + code.toString(16).toUpperCase().padStart(2, "0");
            } else {
                out += s[i];
            }
        }
        return out;
    }

        private nextRegister(): string { return `%${this.registerCounter++}`; }

        private nextLabel(prefix: string): string { return `${prefix}${this.labelCounter++}`; }

    

        private emitIfExpression(expr: AST.IfExpression): string {

            const condReg = this.emitExpression(expr.condition);

            const thenLabel = this.nextLabel("then");

            const elseLabel = this.nextLabel("else");

            const endLabel = this.nextLabel("ifend");

    

            this.output += `  br i1 ${condReg}, label %${thenLabel}, label %${elseLabel}\n`;

    

            this.output += `${thenLabel}:\n`;

            expr.consequence.statements.forEach(s => this.emitStatement(s));

            // Only emit branch if the block didn't already terminate (e.g., with ret)
            const thenLastLine = this.output.trimEnd().split("\n").pop()?.trim() || "";
            if (!thenLastLine.startsWith("ret ") && !thenLastLine.startsWith("br ")) {
                this.output += `  br label %${endLabel}\n`;
            }



            this.output += `${elseLabel}:\n`;

            if (expr.alternative) {

                expr.alternative.statements.forEach(s => this.emitStatement(s));

            }

            // Only emit branch if the block didn't already terminate
            const elseLastLine = this.output.trimEnd().split("\n").pop()?.trim() || "";
            if (!elseLastLine.startsWith("ret ") && !elseLastLine.startsWith("br ")) {
                this.output += `  br label %${endLabel}\n`;
            }

    

            this.output += `${endLabel}:\n`;

            return "0";

        }

    

        private emitCallExpression(expr: AST.CallExpression): string {

            // Built-in drop() — eagerly release an RC variable
            if (expr.function instanceof AST.Identifier && expr.function.value === "drop") {
                const argExpr = expr.arguments[0];
                if (argExpr instanceof AST.Identifier) {
                    const addr = this.locals.get(argExpr.value);
                    const type = this.localTypes.get(argExpr.value) || "i32";
                    if (addr && this.isRcType(type)) {
                        this.emitRcRelease(addr);
                        this.droppedVars.add(argExpr.value);
                    }
                }
                const reg = this.nextRegister();
                this.output += `  ${reg} = add i32 0, 0\n`;
                return reg;
            }

            // Check if calling a closure variable (stored as { i8*, i8* })
            if (expr.function instanceof AST.Identifier) {
                const calleeType = this.localTypes.get(expr.function.value);
                if (calleeType === "{ i8*, i8* }") {
                    return this.emitClosureCall(expr);
                }
            }

            if ((expr.function instanceof AST.Identifier && expr.function.value === "print") ||

                (expr.function instanceof AST.Identifier && expr.function.value === "console")) {

                const argExpr = expr.arguments[0];

                const argVal = this.emitExpression(argExpr);

                const type = this.getExpressionType(argExpr);

    

                if (this.isStringType(type)) {

                    const strType = this.getStringType();
                    const ptrReg = this.nextRegister();

                    this.output += `  ${ptrReg} = alloca ${strType}\n`;

                    this.output += `  store ${strType} ${argVal}, ${strType}* ${ptrReg}\n`;

                    this.output += `  call void @fs_print_string(${strType}* ${ptrReg})\n`;

                } else if (this.runtimeExports.size > 0) {

                    // Self-hosted runtime: use fs_print_int
                    this.output += `  call void @fs_print_int(i32 ${argVal})\n`;

                } else {

                    const ignored = this.nextRegister();

                    this.output += `  ${ignored} = call i32 (i8*, ...) @printf(i8* getelementptr inbounds ([4 x i8], [4 x i8]* @.str, i32 0, i32 0), i32 ${argVal})\n`;

                }

                const reg = this.nextRegister();

                this.output += `  ${reg} = add i32 0, 0\n`;

                return reg;

            }

    

            // Generic function call: identity::<int>(42)
            if (expr.function instanceof AST.GenericInstantiationExpression) {
                const genExpr = expr.function;
                if (genExpr.left instanceof AST.Identifier) {
                    const sym = this.currentScope?.resolve(genExpr.left.value);
                    let baseName = this.getMangledName(genExpr.left.value, this.currentModulePath);
                    if (sym) baseName = this.getMangledName(sym.name, sym.sourceModule);

                    const typeArgs = genExpr.typeArgs.map(t => this.mapType(t));
                    const instanceName = this.instantiateFunction(baseName, typeArgs);

                    const retType = this.functionReturnTypes.get(instanceName) || "i32";
                    const expectedParamTypes = this.functionParamTypes.get(instanceName);
                    const args = expr.arguments.map((a, i) => {
                        const t = this.getExpressionType(a);
                        const v = this.emitExpression(a);
                        if ((t.startsWith("%enum.") || t.startsWith("%struct.")) && !t.endsWith("*")) {
                            return `${t}* ${v}`;
                        }
                        const expectedType = expectedParamTypes?.[i];
                        if (expectedType && expectedType !== t) {
                            const castReg = this.nextRegister();
                            if (t === "i32" && expectedType === "i8") {
                                this.output += `  ${castReg} = trunc i32 ${v} to i8\n`;
                                return `i8 ${castReg}`;
                            } else if (t === "i8" && expectedType === "i32") {
                                this.output += `  ${castReg} = sext i8 ${v} to i32\n`;
                                return `i32 ${castReg}`;
                            }
                        }
                        return `${t} ${v}`;
                    }).join(", ");

                    if (retType === "void") {
                        this.output += `  call void @${instanceName}(${args})\n`;
                        return "0";
                    }
                    const reg = this.nextRegister();
                    this.output += `  ${reg} = call ${retType} @${instanceName}(${args})\n`;

                    // Track RC for fresh string return values
                    if (this.isRcType(retType)) {
                        // Fresh return value, rc=1, no retain needed
                    }

                    return reg;
                }
            }

            if (expr.function instanceof AST.Identifier) {

                const sym = this.currentScope?.resolve(expr.function.value);

                let funcName = this.getMangledName(expr.function.value, this.currentModulePath);

                if (sym && sym.unsafe) {

                    funcName = sym.name;

                } else if (sym) {

                    funcName = this.getMangledName(sym.name, sym.sourceModule);

                }

                // Use canonical name for runtime exports
                const canonical = this.runtimeExports.get(funcName);
                if (canonical) funcName = canonical;

    

                let retType = "i32";

                if (this.functionReturnTypes.has(funcName)) {

                    retType = this.functionReturnTypes.get(funcName)!;

                } else if (sym && sym.type.kind === "function" && (sym.type as any).returnType) {

                    retType = this.mapType((sym.type as any).returnType);

                }

    

                const expectedParamTypes = this.functionParamTypes.get(funcName);
                const args = expr.arguments.map((a, i) => {

                    // String literal passed to i8* parameter: emit raw pointer instead of managed String
                    const expectedType = expectedParamTypes?.[i];
                    if (a instanceof AST.StringLiteral && expectedType === "i8*") {
                        return `i8* ${this.emitRawStringPtr(a)}`;
                    }
                    // String literal in variadic position (beyond fixed params): also emit raw pointer
                    if (a instanceof AST.StringLiteral && this.variadicExterns.has(funcName) && expectedParamTypes && i >= expectedParamTypes.length) {
                        return `i8* ${this.emitRawStringPtr(a)}`;
                    }

                    const t = this.getExpressionType(a);

                    const v = this.emitExpression(a);

                    // Enum/struct types are passed by pointer (unless already a pointer)
                    if ((t.startsWith("%enum.") || t.startsWith("%struct.")) && !t.endsWith("*")) {
                        return `${t}* ${v}`;
                    }

                    // Cast argument if type doesn't match expected parameter type
                    if (expectedType && expectedType !== t) {
                        const castReg = this.nextRegister();
                        if (t === "i32" && expectedType === "i8") {
                            this.output += `  ${castReg} = trunc i32 ${v} to i8\n`;
                            return `i8 ${castReg}`;
                        } else if (t === "i8" && expectedType === "i32") {
                            this.output += `  ${castReg} = sext i8 ${v} to i32\n`;
                            return `i32 ${castReg}`;
                        }
                    }

                    return `${t} ${v}`;

                }).join(", ");

    

                // Variadic calls require the full function type signature
                const isVariadic = this.variadicExterns.has(funcName);

                if (retType === "void") {

                    if (isVariadic) {
                        const fixedParams = this.functionParamTypes.get(funcName) || [];
                        const sigParams = fixedParams.length > 0 ? fixedParams.join(", ") + ", ..." : "...";
                        this.output += `  call void (${sigParams}) @${funcName}(${args})\n`;
                    } else {
                        this.output += `  call void @${funcName}(${args})\n`;
                    }

                    return "0";

                } else {

                    const reg = this.nextRegister();

                    if (isVariadic) {
                        const fixedParams = this.functionParamTypes.get(funcName) || [];
                        const sigParams = fixedParams.length > 0 ? fixedParams.join(", ") + ", ..." : "...";
                        this.output += `  ${reg} = call ${retType} (${sigParams}) @${funcName}(${args})\n`;
                    } else {
                        this.output += `  ${reg} = call ${retType} @${funcName}(${args})\n`;
                    }

                    return reg;

                }

            }

            return "0";

        }

    // ---- Closure Support ----

    private emitClosureExpression(expr: AST.ClosureExpression): string {
        const closureId = this.closureCounter++;
        const closureFnName = `__closure_${closureId}`;

        // --- Determine captures with mutability info ---
        const captures: { name: string, llvmType: string, addr: string, isMutable: boolean }[] = [];
        for (const varName of expr.capturedVariables) {
            const llvmType = this.localTypes.get(varName) || "i32";
            const addr = this.locals.get(varName);
            if (addr) {
                const isMutable = this.localMutable.has(varName);
                captures.push({ name: varName, llvmType, addr, isMutable });
            }
        }

        // --- Determine closure parameter LLVM types ---
        // After bidirectional type inference, p.type is patched by the analyzer for
        // untyped trailing-lambda params.  Fall back to i32 only as a last resort.
        const paramLLVMTypes: { name: string, llvmType: string }[] = [];
        for (const p of expr.parameters) {
            if (!p.type) {
                paramLLVMTypes.push({ name: p.name.value, llvmType: "i32" });
                continue;
            }
            const llvmType = this.mapType(p.type);
            paramLLVMTypes.push({ name: p.name.value, llvmType });
        }

        // --- Determine return type ---
        let retType = "void";
        if (expr.returnType) {
            retType = this.mapType(expr.returnType);
        }

        // --- Compute environment struct type ---
        // Mutable captures store a pointer (T*) instead of a value (T) in the env
        let envStructType = "";
        if (captures.length > 0) {
            const fieldTypes = captures.map(c =>
                c.isMutable ? `${c.llvmType}*` : c.llvmType
            ).join(", ");
            envStructType = `{ ${fieldTypes} }`;
        }

        // --- Emit the lifted closure function to deferredOutput ---
        const oldLocals = new Map(this.locals);
        const oldLocalTypes = new Map(this.localTypes);
        const oldLocalIsPtr = new Set(this.localIsPtr);
        const oldLocalMutable = new Set(this.localMutable);
        const oldReg = this.registerCounter;
        const oldRcScopeStack = this.rcScopeStack;
        const oldDroppedVars = new Set(this.droppedVars);
        const oldInsideRuntime = this.insideRuntimeFn;
        const savedOutput = this.output;

        this.locals.clear();
        this.localIsPtr.clear();
        this.localMutable.clear();
        this.registerCounter = 0;
        this.rcScopeStack = [];
        this.droppedVars.clear();
        this.insideRuntimeFn = false;
        this.output = "";

        // Build function signature: retType @__closure_N(i8* %__env, paramTypes...)
        const fnParams: string[] = ["i8* %__env"];
        for (const p of paramLLVMTypes) {
            if ((p.llvmType.startsWith("%enum.") || p.llvmType.startsWith("%struct.")) && !p.llvmType.endsWith("*")) {
                fnParams.push(`${p.llvmType}* %${p.name}`);
            } else {
                fnParams.push(`${p.llvmType} %${p.name}`);
            }
        }

        this.output += `define ${retType} @${closureFnName}(${fnParams.join(", ")}) {\nbb_entry:\n`;
        this.pushRcScope();

        // Unpack environment: bitcast i8* %__env to the concrete env struct pointer
        if (captures.length > 0) {
            const envPtrReg = this.nextRegister();
            this.output += `  ${envPtrReg} = bitcast i8* %__env to ${envStructType}*\n`;

            captures.forEach((cap, i) => {
                const gepReg = this.nextRegister();
                this.output += `  ${gepReg} = getelementptr ${envStructType}, ${envStructType}* ${envPtrReg}, i32 0, i32 ${i}\n`;

                if (cap.isMutable) {
                    // Mutable capture by reference: env stores T*, load the pointer
                    // and use it directly as the variable's address (aliasing outer scope)
                    const ptrReg = this.nextRegister();
                    this.output += `  ${ptrReg} = load ${cap.llvmType}*, ${cap.llvmType}** ${gepReg}\n`;
                    this.locals.set(cap.name, ptrReg);
                    this.localTypes.set(cap.name, cap.llvmType);
                    this.localMutable.add(cap.name);
                } else if ((cap.llvmType.startsWith("%enum.") || cap.llvmType.startsWith("%struct.")) && !cap.llvmType.endsWith("*")) {
                    // Pointer-semantic: use the GEP result directly
                    this.locals.set(cap.name, gepReg);
                    this.localTypes.set(cap.name, cap.llvmType);
                    this.localIsPtr.add(cap.name);
                } else {
                    // Immutable capture by value: load and copy to local alloca
                    const loadReg = this.nextRegister();
                    this.output += `  ${loadReg} = load ${cap.llvmType}, ${cap.llvmType}* ${gepReg}\n`;
                    const addr = this.nextRegister();
                    this.output += `  ${addr} = alloca ${cap.llvmType}\n`;
                    this.output += `  store ${cap.llvmType} ${loadReg}, ${cap.llvmType}* ${addr}\n`;
                    this.locals.set(cap.name, addr);
                    this.localTypes.set(cap.name, cap.llvmType);

                    // Track RC for captured strings
                    if (this.isRcType(cap.llvmType)) {
                        this.trackRcLocal(cap.name);
                    }
                }
            });
        }

        // Set up parameter locals (same pattern as emitFunction)
        for (const p of paramLLVMTypes) {
            if ((p.llvmType.startsWith("%enum.") || p.llvmType.startsWith("%struct.")) && !p.llvmType.endsWith("*")) {
                this.locals.set(p.name, `%${p.name}`);
                this.localTypes.set(p.name, p.llvmType);
                this.localIsPtr.add(p.name);
            } else {
                const addr = this.nextRegister();
                this.output += `  ${addr} = alloca ${p.llvmType}\n`;
                this.output += `  store ${p.llvmType} %${p.name}, ${p.llvmType}* ${addr}\n`;
                this.locals.set(p.name, addr);
                this.localTypes.set(p.name, p.llvmType);
            }
        }

        // Emit body with implicit-return-last-expression pattern
        const stmts = expr.body.statements;
        for (let i = 0; i < stmts.length - 1; i++) {
            this.emitStatement(stmts[i]);
        }
        const lastStmt = stmts[stmts.length - 1];
        let hasReturn = false;
        if (lastStmt && retType !== "void" && lastStmt instanceof AST.ExpressionStatement && lastStmt.expression) {
            const val = this.emitExpression(lastStmt.expression);
            const lastEmittedLine = this.output.trimEnd().split("\n").pop()?.trim() || "";
            if (lastEmittedLine.startsWith("ret ")) {
                hasReturn = true;
            } else {
                const bodyExpr = lastStmt.expression;
                const isReturningRcVar = bodyExpr instanceof AST.Identifier && this.isRcType(retType) && !this.isFreshRcValue(bodyExpr);
                if (isReturningRcVar) {
                    const retAddr = this.locals.get((bodyExpr as AST.Identifier).value);
                    if (retAddr) this.emitRcRetainAddr(retAddr);
                }
                this.emitScopeRelease();
                const isPointerLocal = bodyExpr instanceof AST.Identifier && this.localIsPtr.has(bodyExpr.value);
                if (isPointerLocal) {
                    const loadReg = this.nextRegister();
                    this.output += `  ${loadReg} = load ${retType}, ${retType}* ${val}\n`;
                    this.output += `  ret ${retType} ${loadReg}\n`;
                } else {
                    this.output += `  ret ${retType} ${val}\n`;
                }
                hasReturn = true;
            }
        } else if (lastStmt) {
            this.emitStatement(lastStmt);
        }

        if (!hasReturn) {
            this.emitScopeRelease();
            const lastLine = this.output.trimEnd().split("\n").pop()?.trim() || "";
            if (!lastLine.startsWith("ret ")) {
                if (retType === "i32") this.output += `  ret i32 0\n`;
                else if (retType === "void") this.output += `  ret void\n`;
                else if (retType.endsWith("*")) this.output += `  ret ${retType} null\n`;
                else this.output += `  unreachable\n`;
            }
        }

        this.popRcScope();
        this.output += `}\n\n`;

        // Append lifted function to deferred output
        this.deferredOutput += this.output;
        this.output = savedOutput;

        // Register function info for call sites
        const paramTypesForCalls = paramLLVMTypes.map(p => {
            if ((p.llvmType.startsWith("%enum.") || p.llvmType.startsWith("%struct.")) && !p.llvmType.endsWith("*")) {
                return `${p.llvmType}*`;
            }
            return p.llvmType;
        });
        this.functionReturnTypes.set(closureFnName, retType);
        this.functionParamTypes.set(closureFnName, ["i8*", ...paramTypesForCalls]);

        // Restore emitter state
        this.locals = oldLocals;
        this.localTypes = oldLocalTypes;
        this.localIsPtr = oldLocalIsPtr;
        this.localMutable = oldLocalMutable;
        this.registerCounter = oldReg;
        this.rcScopeStack = oldRcScopeStack;
        this.droppedVars = oldDroppedVars;
        this.insideRuntimeFn = oldInsideRuntime;

        // --- At the call site: construct the fat pointer { i8*, i8* } ---

        // Step A: Heap-allocate and populate environment struct
        let envPtr = "null";
        if (captures.length > 0) {
            // Compute environment struct size and heap-allocate with malloc
            const envSize = this.computeEnvSize(captures);
            const envRaw = this.nextRegister();
            this.output += `  ${envRaw} = call i8* @malloc(i32 ${envSize})\n`;
            const envTyped = this.nextRegister();
            this.output += `  ${envTyped} = bitcast i8* ${envRaw} to ${envStructType}*\n`;

            captures.forEach((cap, i) => {
                const gepReg = this.nextRegister();
                this.output += `  ${gepReg} = getelementptr ${envStructType}, ${envStructType}* ${envTyped}, i32 0, i32 ${i}\n`;

                if (cap.isMutable) {
                    // Mutable capture: store pointer to the outer variable's alloca
                    this.output += `  store ${cap.llvmType}* ${cap.addr}, ${cap.llvmType}** ${gepReg}\n`;
                } else if (this.localIsPtr.has(cap.name)) {
                    // Struct/enum by-pointer: load struct value and store
                    const loadReg = this.nextRegister();
                    this.output += `  ${loadReg} = load ${cap.llvmType}, ${cap.llvmType}* ${cap.addr}\n`;
                    this.output += `  store ${cap.llvmType} ${loadReg}, ${cap.llvmType}* ${gepReg}\n`;
                } else {
                    // Immutable capture: copy value into env
                    const loadReg = this.nextRegister();
                    this.output += `  ${loadReg} = load ${cap.llvmType}, ${cap.llvmType}* ${cap.addr}\n`;
                    this.output += `  store ${cap.llvmType} ${loadReg}, ${cap.llvmType}* ${gepReg}\n`;
                }

                // RC retain for captured strings (immutable only — mutable captures alias)
                if (!cap.isMutable && this.isRcType(cap.llvmType)) {
                    this.emitRcRetainAddr(gepReg);
                }
            });

            envPtr = envRaw;
        }

        // Step B: Bitcast function pointer to i8*
        const fnSigParams = ["i8*", ...paramTypesForCalls];
        const fnType = `${retType} (${fnSigParams.join(", ")})`;
        const fnI8Ptr = this.nextRegister();
        this.output += `  ${fnI8Ptr} = bitcast ${fnType}* @${closureFnName} to i8*\n`;

        // Step C: Construct the fat pointer { i8*, i8* }
        const fatPtr = this.nextRegister();
        this.output += `  ${fatPtr} = alloca { i8*, i8* }\n`;
        const envFieldPtr = this.nextRegister();
        this.output += `  ${envFieldPtr} = getelementptr { i8*, i8* }, { i8*, i8* }* ${fatPtr}, i32 0, i32 0\n`;
        this.output += `  store i8* ${envPtr}, i8** ${envFieldPtr}\n`;
        const fnFieldPtr = this.nextRegister();
        this.output += `  ${fnFieldPtr} = getelementptr { i8*, i8* }, { i8*, i8* }* ${fatPtr}, i32 0, i32 1\n`;
        this.output += `  store i8* ${fnI8Ptr}, i8** ${fnFieldPtr}\n`;

        // Load the fat pointer value
        const fatPtrVal = this.nextRegister();
        this.output += `  ${fatPtrVal} = load { i8*, i8* }, { i8*, i8* }* ${fatPtr}\n`;
        return fatPtrVal;
    }

    /** Compute heap allocation size for a closure environment struct. */
    private computeEnvSize(captures: { name: string, llvmType: string, isMutable: boolean }[]): number {
        let size = 0;
        for (const cap of captures) {
            if (cap.isMutable) {
                size += 8; // pointer size
            } else {
                size += this.sizeOfLLVMType(cap.llvmType);
            }
        }
        // Align to 8 bytes
        return Math.max(size, 8);
    }

    private emitClosureCall(expr: AST.CallExpression): string {
        const calleeName = (expr.function as AST.Identifier).value;
        const closureAddr = this.locals.get(calleeName)!;

        // Load the fat pointer { i8*, i8* }
        const closureVal = this.nextRegister();
        this.output += `  ${closureVal} = load { i8*, i8* }, { i8*, i8* }* ${closureAddr}\n`;

        // Extract env pointer (field 0)
        const envExtract = this.nextRegister();
        this.output += `  ${envExtract} = extractvalue { i8*, i8* } ${closureVal}, 0\n`;

        // Extract function pointer (field 1)
        const fnExtract = this.nextRegister();
        this.output += `  ${fnExtract} = extractvalue { i8*, i8* } ${closureVal}, 1\n`;

        // Emit arguments
        const argVals: { type: string, val: string }[] = [];
        for (const a of expr.arguments) {
            const t = this.getExpressionType(a);
            const v = this.emitExpression(a);
            if ((t.startsWith("%enum.") || t.startsWith("%struct.")) && !t.endsWith("*")) {
                argVals.push({ type: `${t}*`, val: v });
            } else {
                argVals.push({ type: t, val: v });
            }
        }

        // Determine return type from analyzer
        let retType = "i32";
        const sym = this.currentScope?.resolve(calleeName);
        if (sym && sym.type.kind === "function") {
            retType = this.mapType((sym.type as any).returnType);
        }

        // Build function pointer type and bitcast
        const argTypes = argVals.map(a => a.type);
        const fnPtrType = `${retType} (i8*, ${argTypes.join(", ")})`;
        const typedFnPtr = this.nextRegister();
        this.output += `  ${typedFnPtr} = bitcast i8* ${fnExtract} to ${fnPtrType}*\n`;

        // Build argument list: env first, then regular args
        const callArgs = [`i8* ${envExtract}`, ...argVals.map(a => `${a.type} ${a.val}`)].join(", ");

        if (retType === "void") {
            this.output += `  call void ${typedFnPtr}(${callArgs})\n`;
            return "0";
        }
        const resultReg = this.nextRegister();
        this.output += `  ${resultReg} = call ${retType} ${typedFnPtr}(${callArgs})\n`;
        return resultReg;
    }

    // ---- Trait/Impl Support ----

    private registerImplBlock(impl: AST.ImplBlock, modulePath: string) {
        const traitName = impl.traitName.value;
        const targetType = impl.targetType.value;

        if (impl.typeParams.length > 0) {
            // Generic impl: store for on-demand monomorphization
            if (!this.genericImplBlocks.has(traitName)) {
                this.genericImplBlocks.set(traitName, []);
                this.genericImplModulePaths.set(traitName, []);
            }
            this.genericImplBlocks.get(traitName)!.push(impl);
            this.genericImplModulePaths.get(traitName)!.push(modulePath);
        } else {
            // Non-generic impl: register directly
            const key = `${traitName}_${targetType}`;
            this.implBlocks.set(key, impl);
            this.implBlockModulePaths.set(key, modulePath);
        }
    }

    private getImplTargetTypeName(rawName: string): string {
        // Primitive types don't get mangled
        if (rawName === "int" || rawName === "bool" || rawName === "string" || rawName === "void") {
            return rawName;
        }
        // User-defined types get mangled to match struct/enum names
        return this.getMangledName(rawName, this.currentModulePath);
    }

    private emitImplMethods(impl: AST.ImplBlock) {
        const traitName = impl.traitName.value;
        const targetType = this.getImplTargetTypeName(impl.targetType.value);

        for (const method of impl.methods) {
            const funcName = `${traitName}_${targetType}_${method.name}`;
            if (this.emittedImplMethods.has(funcName)) continue;
            this.emittedImplMethods.add(funcName);

            // Register return type and param types
            const retType = method.returnType ? this.mapType(method.returnType) : "void";
            const paramTypes = method.parameters.map(p => {
                const t = this.mapType(p.type);
                if ((t.startsWith("%enum.") || t.startsWith("%struct.")) && !t.endsWith("*")) return `${t}*`;
                return t;
            });
            this.functionReturnTypes.set(funcName, retType);
            this.functionParamTypes.set(funcName, paramTypes);

            // Emit the function using the same logic as emitFunction
            this.emitImplMethodFunction(funcName, method);
        }
    }

    private emitImplMethodFunction(funcName: string, method: AST.FunctionLiteral, typeBindings?: Map<string, string>) {
        const oldLocals = new Map(this.locals);
        const oldLocalTypes = new Map(this.localTypes);
        const oldLocalIsPtr = new Set(this.localIsPtr);
        const oldReg = this.registerCounter;
        const oldRcScopeStack = this.rcScopeStack;
        const oldDroppedVars = new Set(this.droppedVars);
        const oldInsideRuntime = this.insideRuntimeFn;
        const oldBindings = new Map(this.currentTypeBindings);
        this.locals.clear();
        this.localIsPtr.clear();
        this.registerCounter = 0;
        this.rcScopeStack = [];
        this.droppedVars.clear();
        this.insideRuntimeFn = false;
        if (typeBindings) this.currentTypeBindings = typeBindings;

        const mapT = (t: AST.Type | Type) => typeBindings ? this.mapTypeWithBindings(t, typeBindings) : this.mapType(t);

        const retType = method.returnType ? mapT(method.returnType) : "void";
        const params = method.parameters.map(p => {
            const type = mapT(p.type);
            if ((type.startsWith("%enum.") || type.startsWith("%struct.")) && !type.endsWith("*")) {
                return `${type}* %${p.name.value}`;
            }
            return `${type} %${p.name.value}`;
        }).join(", ");

        // Use deferred output to avoid emitting inside main
        const savedOutput = this.output;
        this.output = "";

        this.output += `define ${retType} @${funcName}(${params}) {\nbb_entry:\n`;
        this.pushRcScope();

        method.parameters.forEach(p => {
            const type = mapT(p.type);
            if ((type.startsWith("%enum.") || type.startsWith("%struct.")) && !type.endsWith("*")) {
                this.locals.set(p.name.value, `%${p.name.value}`);
                this.localTypes.set(p.name.value, type);
                this.localIsPtr.add(p.name.value);
                return;
            }
            const addr = this.nextRegister();
            this.output += `  ${addr} = alloca ${type}\n`;
            this.output += `  store ${type} %${p.name.value}, ${type}* ${addr}\n`;
            this.locals.set(p.name.value, addr);
            this.localTypes.set(p.name.value, type);
        });

        const stmts = method.body.statements;
        for (let i = 0; i < stmts.length - 1; i++) {
            this.emitStatement(stmts[i]);
        }
        const lastStmt = stmts[stmts.length - 1];
        let hasReturn = false;
        if (lastStmt && retType !== "void" && lastStmt instanceof AST.ExpressionStatement && lastStmt.expression) {
            const val = this.emitExpression(lastStmt.expression);

            // Check if the emitted expression already produced a ret (e.g., return inside unsafe block)
            const lastEmittedLine = this.output.trimEnd().split("\n").pop()?.trim() || "";
            if (lastEmittedLine.startsWith("ret ")) {
                hasReturn = true;
            } else {
                const expr = lastStmt.expression;
                const isPointerLocal = expr instanceof AST.Identifier && this.localIsPtr.has(expr.value);
                const isReturningRcVar = expr instanceof AST.Identifier && this.isRcType(retType) && !this.isFreshRcValue(expr);
                if (isReturningRcVar) {
                    const retAddr = this.locals.get((expr as AST.Identifier).value);
                    if (retAddr) this.emitRcRetainAddr(retAddr);
                }
                this.emitScopeRelease();
                if (isPointerLocal) {
                    const loadReg = this.nextRegister();
                    this.output += `  ${loadReg} = load ${retType}, ${retType}* ${val}\n`;
                    this.output += `  ret ${retType} ${loadReg}\n`;
                } else {
                    this.output += `  ret ${retType} ${val}\n`;
                }
                hasReturn = true;
            }
        } else if (lastStmt) {
            this.emitStatement(lastStmt);
        }

        if (!hasReturn) {
            this.emitScopeRelease();
            const lastLine = this.output.trimEnd().split("\n").pop()?.trim() || "";
            if (!lastLine.startsWith("ret ")) {
                if (retType === "void") this.output += `  ret void\n`;
                else if (retType === "i32") this.output += `  ret i32 0\n`;
                else if (retType.endsWith("*")) this.output += `  ret ${retType} null\n`;
                else this.output += `  unreachable\n`;
            }
        }

        this.popRcScope();
        this.output += `}\n\n`;

        this.deferredOutput += this.output;
        this.output = savedOutput;

        this.locals = oldLocals;
        this.localTypes = oldLocalTypes;
        this.localIsPtr = oldLocalIsPtr;
        this.registerCounter = oldReg;
        this.rcScopeStack = oldRcScopeStack;
        this.droppedVars = oldDroppedVars;
        this.insideRuntimeFn = oldInsideRuntime;
        this.currentTypeBindings = oldBindings;
    }

    private emitIndexExpression(expr: AST.IndexExpression): string {
        const leftType = this.getExpressionType(expr.left);
        const leftVal = this.emitExpression(expr.left);
        const indexVal = this.emitExpression(expr.index);

        // Raw pointer indexing: ptr[i] → GEP + load
        if (leftType.endsWith("*")) {
            const elemType = leftType.slice(0, -1);
            const gepReg = this.nextRegister();
            this.output += `  ${gepReg} = getelementptr ${elemType}, ${leftType} ${leftVal}, i32 ${indexVal}\n`;
            const loadReg = this.nextRegister();
            this.output += `  ${loadReg} = load ${elemType}, ${elemType}* ${gepReg}\n`;
            return loadReg;
        }

        // Fallback: treat as integer
        return "0";
    }

    private emitMethodCallExpression(expr: AST.MethodCallExpression): string {
        const methodName = expr.method.value;

        // Lazy iterator chain terminal operations
        if (this.isIteratorChain(expr)) {
            if (methodName === "collect") {
                return this.emitIteratorCollect(expr);
            }
            if (methodName === "count") {
                return this.emitIteratorCount(expr);
            }
            if (methodName === "sum") {
                return this.emitIteratorSum(expr);
            }
            if (methodName === "for_each") {
                return this.emitIteratorForEach(expr);
            }
        }

        const selfType = this.getExpressionType(expr.object);

        // Vec method calls: v.push(42), v.get(0), v.set(i, val), v.pop(), v.len()
        if (this.isVecType(selfType)) {
            return this.emitVecMethodCall(expr, selfType);
        }

        // HashMap method calls
        if (this.isHashMapType(selfType)) {
            return this.emitHashMapMethodCall(expr, selfType);
        }

        // General trait-based method dispatch
        let targetTypeName = selfType;
        if (targetTypeName.startsWith("%struct.")) targetTypeName = targetTypeName.replace("%struct.", "");
        else if (targetTypeName.startsWith("%enum.")) targetTypeName = targetTypeName.replace("%enum.", "");
        else if (targetTypeName === "i32") targetTypeName = "int";
        else if (targetTypeName === "i1") targetTypeName = "bool";

        // Search non-generic impl blocks for a method matching target type + method name
        let foundTraitName = "";
        for (const [key, impl] of this.implBlocks) {
            const implTarget = this.getImplTargetTypeName(impl.targetType.value);
            if (implTarget === targetTypeName && impl.methods.some(m => m.name === methodName)) {
                foundTraitName = impl.traitName.value;
                break;
            }
        }

        // Search generic impl blocks
        if (!foundTraitName) {
            for (const [traitName, impls] of this.genericImplBlocks) {
                for (const impl of impls) {
                    if (impl.methods.some(m => m.name === methodName)) {
                        foundTraitName = traitName;
                        break;
                    }
                }
                if (foundTraitName) break;
            }
        }

        if (!foundTraitName) {
            return "0";
        }

        // Delegate to emitTraitMethodCall with self prepended as first arg
        const allArgs: AST.Expression[] = [expr.object, ...expr.arguments];
        return this.emitTraitMethodCall(foundTraitName, methodName, allArgs);
    }

    private getVecVarName(expr: AST.Expression): string {
        if (expr instanceof AST.Identifier) return expr.value;
        return "";
    }

    private getVecElemType(expr: AST.Expression): string {
        const varName = this.getVecVarName(expr);
        return this.vecElemTypes.get(varName) || "i32";
    }

    private getHashMapKeyValueTypes(expr: AST.Expression): { keyType: string, valueType: string } {
        const varName = this.getVecVarName(expr);
        return this.hashMapTypes.get(varName) || { keyType: "i32", valueType: "i32" };
    }

    private emitVecMethodCall(expr: AST.MethodCallExpression, selfType: string): string {
        const vecStructType = this.getVecStructType();
        const elemType = this.getVecElemType(expr.object);
        const methodName = expr.method.value;

        // Get pointer to the Vec struct — we need the alloca address, not the loaded value
        let selfPtr: string;
        if (expr.object instanceof AST.Identifier) {
            const addr = this.locals.get(expr.object.value);
            if (addr) {
                selfPtr = addr;
            } else {
                selfPtr = this.emitExpression(expr.object);
            }
        } else {
            selfPtr = this.emitExpression(expr.object);
        }

        if (methodName === "push") {
            // Alloca temp for the value, store it, pass as *i8
            const val = this.emitExpression(expr.arguments[0]);
            const tmpAddr = this.nextRegister();
            this.output += `  ${tmpAddr} = alloca ${elemType}\n`;
            this.output += `  store ${elemType} ${val}, ${elemType}* ${tmpAddr}\n`;
            const castPtr = this.nextRegister();
            this.output += `  ${castPtr} = bitcast ${elemType}* ${tmpAddr} to i8*\n`;
            this.output += `  call void @fs_vec_push(${vecStructType}* ${selfPtr}, i8* ${castPtr})\n`;
            return "0";
        }

        if (methodName === "get") {
            const index = this.emitExpression(expr.arguments[0]);
            const rawPtr = this.nextRegister();
            this.output += `  ${rawPtr} = call i8* @fs_vec_get(${vecStructType}* ${selfPtr}, i32 ${index})\n`;
            const castPtr = this.nextRegister();
            this.output += `  ${castPtr} = bitcast i8* ${rawPtr} to ${elemType}*\n`;
            const loadReg = this.nextRegister();
            this.output += `  ${loadReg} = load ${elemType}, ${elemType}* ${castPtr}\n`;
            return loadReg;
        }

        if (methodName === "set") {
            const index = this.emitExpression(expr.arguments[0]);
            const val = this.emitExpression(expr.arguments[1]);
            const tmpAddr = this.nextRegister();
            this.output += `  ${tmpAddr} = alloca ${elemType}\n`;
            this.output += `  store ${elemType} ${val}, ${elemType}* ${tmpAddr}\n`;
            const castPtr = this.nextRegister();
            this.output += `  ${castPtr} = bitcast ${elemType}* ${tmpAddr} to i8*\n`;
            this.output += `  call void @fs_vec_set(${vecStructType}* ${selfPtr}, i32 ${index}, i8* ${castPtr})\n`;
            return "0";
        }

        if (methodName === "pop") {
            const rawPtr = this.nextRegister();
            this.output += `  ${rawPtr} = call i8* @fs_vec_pop(${vecStructType}* ${selfPtr})\n`;
            const castPtr = this.nextRegister();
            this.output += `  ${castPtr} = bitcast i8* ${rawPtr} to ${elemType}*\n`;
            const loadReg = this.nextRegister();
            this.output += `  ${loadReg} = load ${elemType}, ${elemType}* ${castPtr}\n`;
            return loadReg;
        }

        if (methodName === "len") {
            const reg = this.nextRegister();
            this.output += `  ${reg} = call i32 @fs_vec_len(${vecStructType}* ${selfPtr})\n`;
            return reg;
        }

        if (methodName === "map") {
            // vec.map(closure) — eager: creates a new Vec with transformed elements
            const closureVal = this.emitExpression(expr.arguments[0]);
            const closureAddr = this.nextRegister();
            this.output += `  ${closureAddr} = alloca { i8*, i8* }\n`;
            this.output += `  store { i8*, i8* } ${closureVal}, { i8*, i8* }* ${closureAddr}\n`;

            // Determine output element type from closure
            let outputElemType = elemType; // default: same as input
            const closureExpr = expr.arguments[0];
            if (closureExpr instanceof AST.ClosureExpression && closureExpr.returnType) {
                outputElemType = this.mapType(closureExpr.returnType);
            }
            this.lastMapOutputElemType = outputElemType;

            const outputElemSize = this.sizeOfLLVMType(outputElemType);

            // Create new result Vec
            const newVecReg = this.nextRegister();
            this.output += `  ${newVecReg} = call ${vecStructType} @fs_vec_new(i32 ${outputElemSize})\n`;
            const newVecAddr = this.nextRegister();
            this.output += `  ${newVecAddr} = alloca ${vecStructType}\n`;
            this.output += `  store ${vecStructType} ${newVecReg}, ${vecStructType}* ${newVecAddr}\n`;

            // Get source length
            const lenReg = this.nextRegister();
            this.output += `  ${lenReg} = call i32 @fs_vec_len(${vecStructType}* ${selfPtr})\n`;

            // Loop: idx from 0 to len
            const labelId = this.labelCounter++;
            const condLabel = `map_cond_${labelId}`;
            const bodyLabel = `map_body_${labelId}`;
            const endLabel = `map_end_${labelId}`;

            const idxAddr = this.nextRegister();
            this.output += `  ${idxAddr} = alloca i32\n`;
            this.output += `  store i32 0, i32* ${idxAddr}\n`;

            this.output += `  br label %${condLabel}\n${condLabel}:\n`;
            const curIdx = this.nextRegister();
            this.output += `  ${curIdx} = load i32, i32* ${idxAddr}\n`;
            const cmp = this.nextRegister();
            this.output += `  ${cmp} = icmp slt i32 ${curIdx}, ${lenReg}\n`;
            this.output += `  br i1 ${cmp}, label %${bodyLabel}, label %${endLabel}\n${bodyLabel}:\n`;

            // Get element from source
            const rawElem = this.nextRegister();
            this.output += `  ${rawElem} = call i8* @fs_vec_get(${vecStructType}* ${selfPtr}, i32 ${curIdx})\n`;
            const castElem = this.nextRegister();
            this.output += `  ${castElem} = bitcast i8* ${rawElem} to ${elemType}*\n`;
            const elemVal = this.nextRegister();
            this.output += `  ${elemVal} = load ${elemType}, ${elemType}* ${castElem}\n`;

            // Call closure: extract env + fn from fat pointer, invoke
            const closureLoad = this.nextRegister();
            this.output += `  ${closureLoad} = load { i8*, i8* }, { i8*, i8* }* ${closureAddr}\n`;
            const envPtr = this.nextRegister();
            this.output += `  ${envPtr} = extractvalue { i8*, i8* } ${closureLoad}, 0\n`;
            const fnPtr = this.nextRegister();
            this.output += `  ${fnPtr} = extractvalue { i8*, i8* } ${closureLoad}, 1\n`;
            const typedFn = this.nextRegister();
            this.output += `  ${typedFn} = bitcast i8* ${fnPtr} to ${outputElemType} (i8*, ${elemType})*\n`;
            const resultVal = this.nextRegister();
            this.output += `  ${resultVal} = call ${outputElemType} ${typedFn}(i8* ${envPtr}, ${elemType} ${elemVal})\n`;

            // Push result into new Vec
            const tmpResult = this.nextRegister();
            this.output += `  ${tmpResult} = alloca ${outputElemType}\n`;
            this.output += `  store ${outputElemType} ${resultVal}, ${outputElemType}* ${tmpResult}\n`;
            const castResult = this.nextRegister();
            this.output += `  ${castResult} = bitcast ${outputElemType}* ${tmpResult} to i8*\n`;
            this.output += `  call void @fs_vec_push(${vecStructType}* ${newVecAddr}, i8* ${castResult})\n`;

            // Increment index
            const loadIdx = this.nextRegister();
            this.output += `  ${loadIdx} = load i32, i32* ${idxAddr}\n`;
            const incIdx = this.nextRegister();
            this.output += `  ${incIdx} = add i32 ${loadIdx}, 1\n`;
            this.output += `  store i32 ${incIdx}, i32* ${idxAddr}\n`;
            this.output += `  br label %${condLabel}\n${endLabel}:\n`;

            // Return the new Vec
            const resultVec = this.nextRegister();
            this.output += `  ${resultVec} = load ${vecStructType}, ${vecStructType}* ${newVecAddr}\n`;
            return resultVec;
        }

        if (methodName === "filter") {
            // vec.filter(closure) — eager: creates a new Vec with elements passing the predicate
            const closureVal = this.emitExpression(expr.arguments[0]);
            const closureAddr = this.nextRegister();
            this.output += `  ${closureAddr} = alloca { i8*, i8* }\n`;
            this.output += `  store { i8*, i8* } ${closureVal}, { i8*, i8* }* ${closureAddr}\n`;

            const elemSize = this.sizeOfLLVMType(elemType);

            // Create new result Vec (same elem type)
            const newVecReg = this.nextRegister();
            this.output += `  ${newVecReg} = call ${vecStructType} @fs_vec_new(i32 ${elemSize})\n`;
            const newVecAddr = this.nextRegister();
            this.output += `  ${newVecAddr} = alloca ${vecStructType}\n`;
            this.output += `  store ${vecStructType} ${newVecReg}, ${vecStructType}* ${newVecAddr}\n`;

            // Get source length
            const lenReg = this.nextRegister();
            this.output += `  ${lenReg} = call i32 @fs_vec_len(${vecStructType}* ${selfPtr})\n`;

            // Index loop
            const labelId = this.labelCounter++;
            const condLabel = `filter_cond_${labelId}`;
            const bodyLabel = `filter_body_${labelId}`;
            const pushLabel = `filter_push_${labelId}`;
            const nextLabel = `filter_next_${labelId}`;
            const endLabel = `filter_end_${labelId}`;

            const idxAddr = this.nextRegister();
            this.output += `  ${idxAddr} = alloca i32\n`;
            this.output += `  store i32 0, i32* ${idxAddr}\n`;

            this.output += `  br label %${condLabel}\n${condLabel}:\n`;
            const curIdx = this.nextRegister();
            this.output += `  ${curIdx} = load i32, i32* ${idxAddr}\n`;
            const cmp = this.nextRegister();
            this.output += `  ${cmp} = icmp slt i32 ${curIdx}, ${lenReg}\n`;
            this.output += `  br i1 ${cmp}, label %${bodyLabel}, label %${endLabel}\n${bodyLabel}:\n`;

            // Get element
            const rawElem = this.nextRegister();
            this.output += `  ${rawElem} = call i8* @fs_vec_get(${vecStructType}* ${selfPtr}, i32 ${curIdx})\n`;
            const castElem = this.nextRegister();
            this.output += `  ${castElem} = bitcast i8* ${rawElem} to ${elemType}*\n`;
            const elemVal = this.nextRegister();
            this.output += `  ${elemVal} = load ${elemType}, ${elemType}* ${castElem}\n`;

            // Call closure predicate
            const closureLoad = this.nextRegister();
            this.output += `  ${closureLoad} = load { i8*, i8* }, { i8*, i8* }* ${closureAddr}\n`;
            const envPtr = this.nextRegister();
            this.output += `  ${envPtr} = extractvalue { i8*, i8* } ${closureLoad}, 0\n`;
            const fnPtr = this.nextRegister();
            this.output += `  ${fnPtr} = extractvalue { i8*, i8* } ${closureLoad}, 1\n`;
            // Filter closure returns i1 (bool)
            const typedFn = this.nextRegister();
            this.output += `  ${typedFn} = bitcast i8* ${fnPtr} to i1 (i8*, ${elemType})*\n`;
            const predResult = this.nextRegister();
            this.output += `  ${predResult} = call i1 ${typedFn}(i8* ${envPtr}, ${elemType} ${elemVal})\n`;

            // Conditional push
            this.output += `  br i1 ${predResult}, label %${pushLabel}, label %${nextLabel}\n${pushLabel}:\n`;

            const tmpElem = this.nextRegister();
            this.output += `  ${tmpElem} = alloca ${elemType}\n`;
            this.output += `  store ${elemType} ${elemVal}, ${elemType}* ${tmpElem}\n`;
            const castTmp = this.nextRegister();
            this.output += `  ${castTmp} = bitcast ${elemType}* ${tmpElem} to i8*\n`;
            this.output += `  call void @fs_vec_push(${vecStructType}* ${newVecAddr}, i8* ${castTmp})\n`;
            this.output += `  br label %${nextLabel}\n${nextLabel}:\n`;

            // Increment + loop
            const loadIdx = this.nextRegister();
            this.output += `  ${loadIdx} = load i32, i32* ${idxAddr}\n`;
            const incIdx = this.nextRegister();
            this.output += `  ${incIdx} = add i32 ${loadIdx}, 1\n`;
            this.output += `  store i32 ${incIdx}, i32* ${idxAddr}\n`;
            this.output += `  br label %${condLabel}\n${endLabel}:\n`;

            // Return new Vec
            const resultVec = this.nextRegister();
            this.output += `  ${resultVec} = load ${vecStructType}, ${vecStructType}* ${newVecAddr}\n`;
            return resultVec;
        }

        if (methodName === "collect") {
            // Eager operations already return Vecs, so collect is identity
            const reg = this.nextRegister();
            this.output += `  ${reg} = load ${vecStructType}, ${vecStructType}* ${selfPtr}\n`;
            return reg;
        }

        return "0";
    }

    private emitHashMapMethodCall(expr: AST.MethodCallExpression, selfType: string): string {
        const hmStructType = this.getHashMapStructType();
        const { keyType, valueType } = this.getHashMapKeyValueTypes(expr.object);
        const methodName = expr.method.value;

        // Get pointer to the HashMap struct — we need the alloca address, not the loaded value
        let selfPtr: string;
        if (expr.object instanceof AST.Identifier) {
            const addr = this.locals.get(expr.object.value);
            if (addr) {
                selfPtr = addr;
            } else {
                selfPtr = this.emitExpression(expr.object);
            }
        } else {
            selfPtr = this.emitExpression(expr.object);
        }

        if (methodName === "insert") {
            // Compute hash, alloca key & value, pass as *i8
            const keyVal = this.emitExpression(expr.arguments[0]);
            const valVal = this.emitExpression(expr.arguments[1]);

            const hashReg = this.emitHashCall(keyVal, keyType);

            const keyTmp = this.nextRegister();
            this.output += `  ${keyTmp} = alloca ${keyType}\n`;
            this.output += `  store ${keyType} ${keyVal}, ${keyType}* ${keyTmp}\n`;
            const keyCast = this.nextRegister();
            this.output += `  ${keyCast} = bitcast ${keyType}* ${keyTmp} to i8*\n`;

            const valTmp = this.nextRegister();
            this.output += `  ${valTmp} = alloca ${valueType}\n`;
            this.output += `  store ${valueType} ${valVal}, ${valueType}* ${valTmp}\n`;
            const valCast = this.nextRegister();
            this.output += `  ${valCast} = bitcast ${valueType}* ${valTmp} to i8*\n`;

            this.output += `  call void @fs_hashmap_insert(${hmStructType}* ${selfPtr}, i32 ${hashReg}, i8* ${keyCast}, i8* ${valCast})\n`;
            return "0";
        }

        if (methodName === "get") {
            const keyVal = this.emitExpression(expr.arguments[0]);
            const hashReg = this.emitHashCall(keyVal, keyType);

            const keyTmp = this.nextRegister();
            this.output += `  ${keyTmp} = alloca ${keyType}\n`;
            this.output += `  store ${keyType} ${keyVal}, ${keyType}* ${keyTmp}\n`;
            const keyCast = this.nextRegister();
            this.output += `  ${keyCast} = bitcast ${keyType}* ${keyTmp} to i8*\n`;

            const rawPtr = this.nextRegister();
            this.output += `  ${rawPtr} = call i8* @fs_hashmap_get(${hmStructType}* ${selfPtr}, i32 ${hashReg}, i8* ${keyCast})\n`;
            const castPtr = this.nextRegister();
            this.output += `  ${castPtr} = bitcast i8* ${rawPtr} to ${valueType}*\n`;
            const loadReg = this.nextRegister();
            this.output += `  ${loadReg} = load ${valueType}, ${valueType}* ${castPtr}\n`;
            return loadReg;
        }

        if (methodName === "contains_key") {
            const keyVal = this.emitExpression(expr.arguments[0]);
            const hashReg = this.emitHashCall(keyVal, keyType);

            const keyTmp = this.nextRegister();
            this.output += `  ${keyTmp} = alloca ${keyType}\n`;
            this.output += `  store ${keyType} ${keyVal}, ${keyType}* ${keyTmp}\n`;
            const keyCast = this.nextRegister();
            this.output += `  ${keyCast} = bitcast ${keyType}* ${keyTmp} to i8*\n`;

            const boolReg = this.nextRegister();
            this.output += `  ${boolReg} = call i1 @fs_hashmap_contains(${hmStructType}* ${selfPtr}, i32 ${hashReg}, i8* ${keyCast})\n`;
            const reg = this.nextRegister();
            this.output += `  ${reg} = zext i1 ${boolReg} to i32\n`;
            return reg;
        }

        if (methodName === "remove") {
            const keyVal = this.emitExpression(expr.arguments[0]);
            const hashReg = this.emitHashCall(keyVal, keyType);

            const keyTmp = this.nextRegister();
            this.output += `  ${keyTmp} = alloca ${keyType}\n`;
            this.output += `  store ${keyType} ${keyVal}, ${keyType}* ${keyTmp}\n`;
            const keyCast = this.nextRegister();
            this.output += `  ${keyCast} = bitcast ${keyType}* ${keyTmp} to i8*\n`;

            this.output += `  call void @fs_hashmap_remove(${hmStructType}* ${selfPtr}, i32 ${hashReg}, i8* ${keyCast})\n`;
            return "0";
        }

        if (methodName === "len") {
            const reg = this.nextRegister();
            this.output += `  ${reg} = call i32 @fs_hashmap_len(${hmStructType}* ${selfPtr})\n`;
            return reg;
        }

        if (methodName === "keys") {
            // Create a new Vec<keyType>, iterate all occupied entries, push keys
            const vecStructType = this.getVecStructType();
            const keySize = this.sizeOfLLVMType(keyType);

            // New Vec for keys
            const newVecReg = this.nextRegister();
            this.output += `  ${newVecReg} = call ${vecStructType} @fs_vec_new(i32 ${keySize})\n`;
            const newVecAddr = this.nextRegister();
            this.output += `  ${newVecAddr} = alloca ${vecStructType}\n`;
            this.output += `  store ${vecStructType} ${newVecReg}, ${vecStructType}* ${newVecAddr}\n`;

            // Cursor
            const labelId = this.labelCounter++;
            const condLabel = `keys_cond_${labelId}`;
            const bodyLabel = `keys_body_${labelId}`;
            const endLabel = `keys_end_${labelId}`;

            const cursorAddr = this.nextRegister();
            this.output += `  ${cursorAddr} = alloca i32\n`;
            this.output += `  store i32 0, i32* ${cursorAddr}\n`;

            // Loop
            this.output += `  br label %${condLabel}\n${condLabel}:\n`;
            const rawKeyPtr = this.nextRegister();
            this.output += `  ${rawKeyPtr} = call i8* @fs_hashmap_iter_next(${hmStructType}* ${selfPtr}, i32* ${cursorAddr})\n`;
            const isNull = this.nextRegister();
            this.output += `  ${isNull} = icmp eq i8* ${rawKeyPtr}, null\n`;
            this.output += `  br i1 ${isNull}, label %${endLabel}, label %${bodyLabel}\n${bodyLabel}:\n`;

            // Push key into Vec
            this.output += `  call void @fs_vec_push(${vecStructType}* ${newVecAddr}, i8* ${rawKeyPtr})\n`;
            this.output += `  br label %${condLabel}\n${endLabel}:\n`;

            // Return Vec
            const resultVec = this.nextRegister();
            this.output += `  ${resultVec} = load ${vecStructType}, ${vecStructType}* ${newVecAddr}\n`;
            return resultVec;
        }

        if (methodName === "values") {
            // Create a new Vec<valueType>, iterate all occupied entries, push values
            const vecStructType = this.getVecStructType();
            const valSize = this.sizeOfLLVMType(valueType);
            const keySize = this.sizeOfLLVMType(keyType);

            // New Vec for values
            const newVecReg = this.nextRegister();
            this.output += `  ${newVecReg} = call ${vecStructType} @fs_vec_new(i32 ${valSize})\n`;
            const newVecAddr = this.nextRegister();
            this.output += `  ${newVecAddr} = alloca ${vecStructType}\n`;
            this.output += `  store ${vecStructType} ${newVecReg}, ${vecStructType}* ${newVecAddr}\n`;

            const labelId = this.labelCounter++;
            const condLabel = `vals_cond_${labelId}`;
            const bodyLabel = `vals_body_${labelId}`;
            const endLabel = `vals_end_${labelId}`;

            const cursorAddr = this.nextRegister();
            this.output += `  ${cursorAddr} = alloca i32\n`;
            this.output += `  store i32 0, i32* ${cursorAddr}\n`;

            this.output += `  br label %${condLabel}\n${condLabel}:\n`;
            const rawKeyPtr = this.nextRegister();
            this.output += `  ${rawKeyPtr} = call i8* @fs_hashmap_iter_next(${hmStructType}* ${selfPtr}, i32* ${cursorAddr})\n`;
            const isNull = this.nextRegister();
            this.output += `  ${isNull} = icmp eq i8* ${rawKeyPtr}, null\n`;
            this.output += `  br i1 ${isNull}, label %${endLabel}, label %${bodyLabel}\n${bodyLabel}:\n`;

            // Advance pointer from key to value: rawKeyPtr + key_size
            const valPtr = this.nextRegister();
            this.output += `  ${valPtr} = getelementptr i8, i8* ${rawKeyPtr}, i32 ${keySize}\n`;
            this.output += `  call void @fs_vec_push(${vecStructType}* ${newVecAddr}, i8* ${valPtr})\n`;
            this.output += `  br label %${condLabel}\n${endLabel}:\n`;

            const resultVec = this.nextRegister();
            this.output += `  ${resultVec} = load ${vecStructType}, ${vecStructType}* ${newVecAddr}\n`;
            return resultVec;
        }

        return "0";
    }

    private emitHashCall(keyVal: string, keyType: string): string {
        if (keyType === "i32") {
            const reg = this.nextRegister();
            this.output += `  ${reg} = call i32 @fs_hash_int(i32 ${keyVal})\n`;
            return reg;
        }
        if (this.isStringType(keyType)) {
            // String key: need to pass pointer to string struct
            const strType = this.getStringType();
            const tmpAddr = this.nextRegister();
            this.output += `  ${tmpAddr} = alloca ${strType}\n`;
            this.output += `  store ${strType} ${keyVal}, ${strType}* ${tmpAddr}\n`;
            const reg = this.nextRegister();
            this.output += `  ${reg} = call i32 @fs_hash_string(${strType}* ${tmpAddr})\n`;
            return reg;
        }
        // Default: use value as hash directly
        return keyVal;
    }

    // ---- Lazy Iterator Chain Support ----

    /** Check if an expression is part of a lazy iterator chain (contains .iter()/.values_iter()/.keys_iter() in the chain) */
    private isIteratorChain(expr: AST.Expression): boolean {
        let current = expr;
        while (current instanceof AST.MethodCallExpression) {
            if (current.method.value === "iter" || current.method.value === "values_iter" || current.method.value === "keys_iter") return true;
            if (["map", "filter", "collect", "count", "sum", "for_each"].includes(current.method.value)) {
                current = current.object;
            } else {
                return false;
            }
        }
        return false;
    }

    /** Walk backward through a method chain to extract iterator steps and source */
    private analyzeIteratorChain(expr: AST.Expression): { source: AST.Expression, sourceKind: "vec" | "hashmap", iterValues: boolean, steps: { kind: "map" | "filter", closure: AST.Expression }[] } | null {
        const steps: { kind: "map" | "filter", closure: AST.Expression }[] = [];
        let current = expr;
        let iterValues = false;

        while (current instanceof AST.MethodCallExpression) {
            const method = current.method.value;
            if (method === "map" || method === "filter") {
                steps.unshift({ kind: method as "map" | "filter", closure: current.arguments[0] });
                current = current.object;
            } else if (method === "iter" || method === "keys_iter") {
                // Check for values().iter() pattern on HashMap
                if (method === "iter" && current.object instanceof AST.MethodCallExpression && current.object.method.value === "values") {
                    const innerObj = current.object.object;
                    const innerType = this.getExpressionType(innerObj);
                    if (this.isHashMapType(innerType)) {
                        iterValues = true;
                        current = innerObj;
                        break;
                    }
                }
                current = current.object;
                break;
            } else if (method === "values_iter") {
                iterValues = true;
                current = current.object;
                break;
            } else if (["collect", "count", "sum", "for_each"].includes(method)) {
                current = current.object;
            } else {
                return null;
            }
        }

        const sourceType = this.getExpressionType(current);
        let sourceKind: "vec" | "hashmap";
        if (this.isVecType(sourceType)) sourceKind = "vec";
        else if (this.isHashMapType(sourceType)) sourceKind = "hashmap";
        else return null;

        return { source: current, sourceKind, iterValues, steps };
    }

    /** Get the source Vec/HashMap alloca pointer from an expression */
    private getCollectionSelfPtr(expr: AST.Expression): string {
        if (expr instanceof AST.Identifier) {
            const addr = this.locals.get(expr.value);
            if (addr) return addr;
        }
        return this.emitExpression(expr);
    }

    /** Emit a fused iterator chain that collects into a new Vec */
    private emitIteratorCollect(expr: AST.MethodCallExpression): string {
        const chain = this.analyzeIteratorChain(expr);
        if (!chain) return "0";

        const vecStructType = this.getVecStructType();
        const selfPtr = this.getCollectionSelfPtr(chain.source);

        // Determine source element type
        let elemType: string;
        if (chain.sourceKind === "vec") {
            elemType = this.getVecElemType(chain.source);
        } else {
            const hmTypes = this.getHashMapKeyValueTypes(chain.source);
            elemType = chain.iterValues ? hmTypes.valueType : hmTypes.keyType;
        }

        // Emit all closures before the loop (they may capture variables)
        const closureAddrs: string[] = [];
        const closureOutputTypes: string[] = [];
        let currentElemType = elemType;

        for (const step of chain.steps) {
            const closureVal = this.emitExpression(step.closure);
            const closureAddr = this.nextRegister();
            this.output += `  ${closureAddr} = alloca { i8*, i8* }\n`;
            this.output += `  store { i8*, i8* } ${closureVal}, { i8*, i8* }* ${closureAddr}\n`;
            closureAddrs.push(closureAddr);

            if (step.kind === "map") {
                // Determine output type from closure return type
                let outputType = currentElemType;
                if (step.closure instanceof AST.ClosureExpression && step.closure.returnType) {
                    outputType = this.mapType(step.closure.returnType);
                }
                closureOutputTypes.push(outputType);
                currentElemType = outputType;
            } else {
                closureOutputTypes.push(currentElemType);
            }
        }

        const finalElemType = currentElemType;
        const finalElemSize = this.sizeOfLLVMType(finalElemType);

        // Create output Vec
        const newVecReg = this.nextRegister();
        this.output += `  ${newVecReg} = call ${vecStructType} @fs_vec_new(i32 ${finalElemSize})\n`;
        const newVecAddr = this.nextRegister();
        this.output += `  ${newVecAddr} = alloca ${vecStructType}\n`;
        this.output += `  store ${vecStructType} ${newVecReg}, ${vecStructType}* ${newVecAddr}\n`;

        // Emit source iteration setup
        const labelId = this.labelCounter++;

        if (chain.sourceKind === "vec") {
            this.emitFusedVecIteratorLoop(selfPtr, vecStructType, elemType, chain.steps, closureAddrs, closureOutputTypes, newVecAddr, finalElemType, labelId, "collect");
        } else {
            const keyOffsetSize = chain.iterValues ? this.sizeOfLLVMType(this.getHashMapKeyValueTypes(chain.source).keyType) : 0;
            this.emitFusedHashMapIteratorLoop(selfPtr, elemType, chain.steps, closureAddrs, closureOutputTypes, newVecAddr, finalElemType, labelId, "collect", undefined, chain.iterValues, keyOffsetSize);
        }

        // Return new Vec
        const resultVec = this.nextRegister();
        this.output += `  ${resultVec} = load ${vecStructType}, ${vecStructType}* ${newVecAddr}\n`;

        // Track element type for downstream
        this.lastMapOutputElemType = finalElemType;

        return resultVec;
    }

    /** Emit a fused iterator chain that counts matching elements */
    private emitIteratorCount(expr: AST.MethodCallExpression): string {
        const chain = this.analyzeIteratorChain(expr);
        if (!chain) return "0";

        const vecStructType = this.getVecStructType();
        const selfPtr = this.getCollectionSelfPtr(chain.source);

        let elemType: string;
        if (chain.sourceKind === "vec") {
            elemType = this.getVecElemType(chain.source);
        } else {
            const hmTypes = this.getHashMapKeyValueTypes(chain.source);
            elemType = chain.iterValues ? hmTypes.valueType : hmTypes.keyType;
        }

        // Emit closures
        const closureAddrs: string[] = [];
        const closureOutputTypes: string[] = [];
        let currentElemType = elemType;

        for (const step of chain.steps) {
            const closureVal = this.emitExpression(step.closure);
            const closureAddr = this.nextRegister();
            this.output += `  ${closureAddr} = alloca { i8*, i8* }\n`;
            this.output += `  store { i8*, i8* } ${closureVal}, { i8*, i8* }* ${closureAddr}\n`;
            closureAddrs.push(closureAddr);
            if (step.kind === "map") {
                let outputType = currentElemType;
                if (step.closure instanceof AST.ClosureExpression && step.closure.returnType) {
                    outputType = this.mapType(step.closure.returnType);
                }
                closureOutputTypes.push(outputType);
                currentElemType = outputType;
            } else {
                closureOutputTypes.push(currentElemType);
            }
        }

        // Counter
        const countAddr = this.nextRegister();
        this.output += `  ${countAddr} = alloca i32\n`;
        this.output += `  store i32 0, i32* ${countAddr}\n`;

        const labelId = this.labelCounter++;
        if (chain.sourceKind === "vec") {
            this.emitFusedVecIteratorLoop(selfPtr, vecStructType, elemType, chain.steps, closureAddrs, closureOutputTypes, countAddr, currentElemType, labelId, "count");
        } else {
            const keyOffsetSize = chain.iterValues ? this.sizeOfLLVMType(this.getHashMapKeyValueTypes(chain.source).keyType) : 0;
            this.emitFusedHashMapIteratorLoop(selfPtr, elemType, chain.steps, closureAddrs, closureOutputTypes, countAddr, currentElemType, labelId, "count", undefined, chain.iterValues, keyOffsetSize);
        }

        const result = this.nextRegister();
        this.output += `  ${result} = load i32, i32* ${countAddr}\n`;
        return result;
    }

    /** Emit a fused iterator chain that sums elements */
    private emitIteratorSum(expr: AST.MethodCallExpression): string {
        const chain = this.analyzeIteratorChain(expr);
        if (!chain) return "0";

        const vecStructType = this.getVecStructType();
        const selfPtr = this.getCollectionSelfPtr(chain.source);

        let elemType: string;
        if (chain.sourceKind === "vec") {
            elemType = this.getVecElemType(chain.source);
        } else {
            const hmTypes = this.getHashMapKeyValueTypes(chain.source);
            elemType = chain.iterValues ? hmTypes.valueType : hmTypes.keyType;
        }

        const closureAddrs: string[] = [];
        const closureOutputTypes: string[] = [];
        let currentElemType = elemType;

        for (const step of chain.steps) {
            const closureVal = this.emitExpression(step.closure);
            const closureAddr = this.nextRegister();
            this.output += `  ${closureAddr} = alloca { i8*, i8* }\n`;
            this.output += `  store { i8*, i8* } ${closureVal}, { i8*, i8* }* ${closureAddr}\n`;
            closureAddrs.push(closureAddr);
            if (step.kind === "map") {
                let outputType = currentElemType;
                if (step.closure instanceof AST.ClosureExpression && step.closure.returnType) {
                    outputType = this.mapType(step.closure.returnType);
                }
                closureOutputTypes.push(outputType);
                currentElemType = outputType;
            } else {
                closureOutputTypes.push(currentElemType);
            }
        }

        // Sum accumulator
        const sumAddr = this.nextRegister();
        this.output += `  ${sumAddr} = alloca i32\n`;
        this.output += `  store i32 0, i32* ${sumAddr}\n`;

        const labelId = this.labelCounter++;
        if (chain.sourceKind === "vec") {
            this.emitFusedVecIteratorLoop(selfPtr, vecStructType, elemType, chain.steps, closureAddrs, closureOutputTypes, sumAddr, currentElemType, labelId, "sum");
        } else {
            const keyOffsetSize = chain.iterValues ? this.sizeOfLLVMType(this.getHashMapKeyValueTypes(chain.source).keyType) : 0;
            this.emitFusedHashMapIteratorLoop(selfPtr, elemType, chain.steps, closureAddrs, closureOutputTypes, sumAddr, currentElemType, labelId, "sum", undefined, chain.iterValues, keyOffsetSize);
        }

        const result = this.nextRegister();
        this.output += `  ${result} = load i32, i32* ${sumAddr}\n`;
        return result;
    }

    /** Emit a fused iterator chain for for_each */
    private emitIteratorForEach(expr: AST.MethodCallExpression): string {
        const chain = this.analyzeIteratorChain(expr.object);
        if (!chain) return "0";

        const vecStructType = this.getVecStructType();
        const selfPtr = this.getCollectionSelfPtr(chain.source);

        let elemType: string;
        if (chain.sourceKind === "vec") {
            elemType = this.getVecElemType(chain.source);
        } else {
            const hmTypes = this.getHashMapKeyValueTypes(chain.source);
            elemType = chain.iterValues ? hmTypes.valueType : hmTypes.keyType;
        }

        const closureAddrs: string[] = [];
        const closureOutputTypes: string[] = [];
        let currentElemType = elemType;

        for (const step of chain.steps) {
            const closureVal = this.emitExpression(step.closure);
            const closureAddr = this.nextRegister();
            this.output += `  ${closureAddr} = alloca { i8*, i8* }\n`;
            this.output += `  store { i8*, i8* } ${closureVal}, { i8*, i8* }* ${closureAddr}\n`;
            closureAddrs.push(closureAddr);
            if (step.kind === "map") {
                let outputType = currentElemType;
                if (step.closure instanceof AST.ClosureExpression && step.closure.returnType) {
                    outputType = this.mapType(step.closure.returnType);
                }
                closureOutputTypes.push(outputType);
                currentElemType = outputType;
            } else {
                closureOutputTypes.push(currentElemType);
            }
        }

        // Emit the for_each closure
        const foreachClosureVal = this.emitExpression(expr.arguments[0]);
        const foreachAddr = this.nextRegister();
        this.output += `  ${foreachAddr} = alloca { i8*, i8* }\n`;
        this.output += `  store { i8*, i8* } ${foreachClosureVal}, { i8*, i8* }* ${foreachAddr}\n`;

        // Add for_each as a final "map" step (void return)
        closureAddrs.push(foreachAddr);
        closureOutputTypes.push("void");
        chain.steps.push({ kind: "map", closure: expr.arguments[0] });

        const labelId = this.labelCounter++;
        if (chain.sourceKind === "vec") {
            this.emitFusedVecIteratorLoop(selfPtr, vecStructType, elemType, chain.steps, closureAddrs, closureOutputTypes, null, currentElemType, labelId, "for_each");
        } else {
            const keyOffsetSize = chain.iterValues ? this.sizeOfLLVMType(this.getHashMapKeyValueTypes(chain.source).keyType) : 0;
            this.emitFusedHashMapIteratorLoop(selfPtr, elemType, chain.steps, closureAddrs, closureOutputTypes, null, currentElemType, labelId, "for_each", undefined, chain.iterValues, keyOffsetSize);
        }

        return "0";
    }

    /** Emit the body of a fused iterator loop over a Vec source */
    private emitFusedVecIteratorLoop(
        selfPtr: string, vecStructType: string, elemType: string,
        steps: { kind: "map" | "filter", closure: AST.Expression }[],
        closureAddrs: string[], closureOutputTypes: string[],
        outputAddr: string | null, finalElemType: string,
        labelId: number, mode: "collect" | "count" | "sum" | "for_each" | "for_body",
        forBodyCallback?: () => void
    ) {
        const condLabel = `iter_cond_${labelId}`;
        const bodyLabel = `iter_body_${labelId}`;
        const endLabel = `iter_end_${labelId}`;

        // Get length
        const lenReg = this.nextRegister();
        this.output += `  ${lenReg} = call i32 @fs_vec_len(${vecStructType}* ${selfPtr})\n`;

        // Index counter
        const idxAddr = this.nextRegister();
        this.output += `  ${idxAddr} = alloca i32\n`;
        this.output += `  store i32 0, i32* ${idxAddr}\n`;

        // Condition
        this.output += `  br label %${condLabel}\n${condLabel}:\n`;
        const curIdx = this.nextRegister();
        this.output += `  ${curIdx} = load i32, i32* ${idxAddr}\n`;
        const cmp = this.nextRegister();
        this.output += `  ${cmp} = icmp slt i32 ${curIdx}, ${lenReg}\n`;
        this.output += `  br i1 ${cmp}, label %${bodyLabel}, label %${endLabel}\n${bodyLabel}:\n`;

        // Get element from Vec
        const rawElem = this.nextRegister();
        this.output += `  ${rawElem} = call i8* @fs_vec_get(${vecStructType}* ${selfPtr}, i32 ${curIdx})\n`;
        const castElem = this.nextRegister();
        this.output += `  ${castElem} = bitcast i8* ${rawElem} to ${elemType}*\n`;
        let currentVal = this.nextRegister();
        this.output += `  ${currentVal} = load ${elemType}, ${elemType}* ${castElem}\n`;
        let currentType = elemType;

        // Apply chain steps
        let nextLabel = `iter_next_${labelId}`;
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const closureAddr = closureAddrs[i];
            const outputType = closureOutputTypes[i];

            if (step.kind === "filter") {
                // Call filter predicate
                const cl = this.nextRegister();
                this.output += `  ${cl} = load { i8*, i8* }, { i8*, i8* }* ${closureAddr}\n`;
                const envP = this.nextRegister();
                this.output += `  ${envP} = extractvalue { i8*, i8* } ${cl}, 0\n`;
                const fnP = this.nextRegister();
                this.output += `  ${fnP} = extractvalue { i8*, i8* } ${cl}, 1\n`;
                const typedFn = this.nextRegister();
                this.output += `  ${typedFn} = bitcast i8* ${fnP} to i1 (i8*, ${currentType})*\n`;
                const predResult = this.nextRegister();
                this.output += `  ${predResult} = call i1 ${typedFn}(i8* ${envP}, ${currentType} ${currentVal})\n`;

                // Branch: if false, skip to next iteration
                const passLabel = `iter_pass_${labelId}_${i}`;
                this.output += `  br i1 ${predResult}, label %${passLabel}, label %${nextLabel}\n${passLabel}:\n`;
            } else if (step.kind === "map") {
                if (outputType === "void") {
                    // for_each: call closure but don't update currentVal
                    const cl = this.nextRegister();
                    this.output += `  ${cl} = load { i8*, i8* }, { i8*, i8* }* ${closureAddr}\n`;
                    const envP = this.nextRegister();
                    this.output += `  ${envP} = extractvalue { i8*, i8* } ${cl}, 0\n`;
                    const fnP = this.nextRegister();
                    this.output += `  ${fnP} = extractvalue { i8*, i8* } ${cl}, 1\n`;
                    const typedFn = this.nextRegister();
                    this.output += `  ${typedFn} = bitcast i8* ${fnP} to void (i8*, ${currentType})*\n`;
                    this.output += `  call void ${typedFn}(i8* ${envP}, ${currentType} ${currentVal})\n`;
                } else {
                    // map: call closure and update currentVal
                    const cl = this.nextRegister();
                    this.output += `  ${cl} = load { i8*, i8* }, { i8*, i8* }* ${closureAddr}\n`;
                    const envP = this.nextRegister();
                    this.output += `  ${envP} = extractvalue { i8*, i8* } ${cl}, 0\n`;
                    const fnP = this.nextRegister();
                    this.output += `  ${fnP} = extractvalue { i8*, i8* } ${cl}, 1\n`;
                    const typedFn = this.nextRegister();
                    this.output += `  ${typedFn} = bitcast i8* ${fnP} to ${outputType} (i8*, ${currentType})*\n`;
                    const result = this.nextRegister();
                    this.output += `  ${result} = call ${outputType} ${typedFn}(i8* ${envP}, ${currentType} ${currentVal})\n`;
                    currentVal = result;
                    currentType = outputType;
                }
            }
        }

        // Terminal operation
        if (mode === "collect" && outputAddr) {
            const tmpResult = this.nextRegister();
            this.output += `  ${tmpResult} = alloca ${finalElemType}\n`;
            this.output += `  store ${finalElemType} ${currentVal}, ${finalElemType}* ${tmpResult}\n`;
            const castResult = this.nextRegister();
            this.output += `  ${castResult} = bitcast ${finalElemType}* ${tmpResult} to i8*\n`;
            this.output += `  call void @fs_vec_push(${this.getVecStructType()}* ${outputAddr}, i8* ${castResult})\n`;
        } else if (mode === "count" && outputAddr) {
            const curCount = this.nextRegister();
            this.output += `  ${curCount} = load i32, i32* ${outputAddr}\n`;
            const newCount = this.nextRegister();
            this.output += `  ${newCount} = add i32 ${curCount}, 1\n`;
            this.output += `  store i32 ${newCount}, i32* ${outputAddr}\n`;
        } else if (mode === "sum" && outputAddr) {
            const curSum = this.nextRegister();
            this.output += `  ${curSum} = load i32, i32* ${outputAddr}\n`;
            const newSum = this.nextRegister();
            this.output += `  ${newSum} = add i32 ${curSum}, ${currentVal}\n`;
            this.output += `  store i32 ${newSum}, i32* ${outputAddr}\n`;
        } else if (mode === "for_body" && forBodyCallback) {
            forBodyCallback();
        }

        // Next iteration
        this.output += `  br label %${nextLabel}\n${nextLabel}:\n`;

        // Increment index
        const loadIdx = this.nextRegister();
        this.output += `  ${loadIdx} = load i32, i32* ${idxAddr}\n`;
        const incIdx = this.nextRegister();
        this.output += `  ${incIdx} = add i32 ${loadIdx}, 1\n`;
        this.output += `  store i32 ${incIdx}, i32* ${idxAddr}\n`;
        this.output += `  br label %${condLabel}\n${endLabel}:\n`;
    }

    /** Emit the body of a fused iterator loop over a HashMap source (key or value iteration) */
    private emitFusedHashMapIteratorLoop(
        selfPtr: string, elemType: string,
        steps: { kind: "map" | "filter", closure: AST.Expression }[],
        closureAddrs: string[], closureOutputTypes: string[],
        outputAddr: string | null, finalElemType: string,
        labelId: number, mode: "collect" | "count" | "sum" | "for_each" | "for_body",
        forBodyCallback?: () => void,
        iterValues: boolean = false,
        keyOffsetSize: number = 0
    ) {
        const hmStructType = this.getHashMapStructType();
        const condLabel = `iter_cond_${labelId}`;
        const bodyLabel = `iter_body_${labelId}`;
        const endLabel = `iter_end_${labelId}`;

        // Cursor
        const cursorAddr = this.nextRegister();
        this.output += `  ${cursorAddr} = alloca i32\n`;
        this.output += `  store i32 0, i32* ${cursorAddr}\n`;

        // Condition: call iter_next
        this.output += `  br label %${condLabel}\n${condLabel}:\n`;
        const rawKeyPtr = this.nextRegister();
        this.output += `  ${rawKeyPtr} = call i8* @fs_hashmap_iter_next(${hmStructType}* ${selfPtr}, i32* ${cursorAddr})\n`;
        const isNull = this.nextRegister();
        this.output += `  ${isNull} = icmp eq i8* ${rawKeyPtr}, null\n`;
        this.output += `  br i1 ${isNull}, label %${endLabel}, label %${bodyLabel}\n${bodyLabel}:\n`;

        // Load key or value depending on iterValues flag
        let elemPtr: string;
        if (iterValues && keyOffsetSize > 0) {
            // Offset from key pointer to value pointer: rawKeyPtr + key_size
            elemPtr = this.nextRegister();
            this.output += `  ${elemPtr} = getelementptr i8, i8* ${rawKeyPtr}, i32 ${keyOffsetSize}\n`;
        } else {
            elemPtr = rawKeyPtr;
        }
        const castElemPtr = this.nextRegister();
        this.output += `  ${castElemPtr} = bitcast i8* ${elemPtr} to ${elemType}*\n`;
        let currentVal = this.nextRegister();
        this.output += `  ${currentVal} = load ${elemType}, ${elemType}* ${castElemPtr}\n`;
        let currentType = elemType;

        // Apply chain steps (same as Vec)
        let nextLabel = `iter_next_${labelId}`;
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const closureAddr = closureAddrs[i];
            const outputType = closureOutputTypes[i];

            if (step.kind === "filter") {
                const cl = this.nextRegister();
                this.output += `  ${cl} = load { i8*, i8* }, { i8*, i8* }* ${closureAddr}\n`;
                const envP = this.nextRegister();
                this.output += `  ${envP} = extractvalue { i8*, i8* } ${cl}, 0\n`;
                const fnP = this.nextRegister();
                this.output += `  ${fnP} = extractvalue { i8*, i8* } ${cl}, 1\n`;
                const typedFn = this.nextRegister();
                this.output += `  ${typedFn} = bitcast i8* ${fnP} to i1 (i8*, ${currentType})*\n`;
                const predResult = this.nextRegister();
                this.output += `  ${predResult} = call i1 ${typedFn}(i8* ${envP}, ${currentType} ${currentVal})\n`;
                const passLabel = `iter_pass_${labelId}_${i}`;
                this.output += `  br i1 ${predResult}, label %${passLabel}, label %${nextLabel}\n${passLabel}:\n`;
            } else if (step.kind === "map") {
                if (outputType === "void") {
                    const cl = this.nextRegister();
                    this.output += `  ${cl} = load { i8*, i8* }, { i8*, i8* }* ${closureAddr}\n`;
                    const envP = this.nextRegister();
                    this.output += `  ${envP} = extractvalue { i8*, i8* } ${cl}, 0\n`;
                    const fnP = this.nextRegister();
                    this.output += `  ${fnP} = extractvalue { i8*, i8* } ${cl}, 1\n`;
                    const typedFn = this.nextRegister();
                    this.output += `  ${typedFn} = bitcast i8* ${fnP} to void (i8*, ${currentType})*\n`;
                    this.output += `  call void ${typedFn}(i8* ${envP}, ${currentType} ${currentVal})\n`;
                } else {
                    const cl = this.nextRegister();
                    this.output += `  ${cl} = load { i8*, i8* }, { i8*, i8* }* ${closureAddr}\n`;
                    const envP = this.nextRegister();
                    this.output += `  ${envP} = extractvalue { i8*, i8* } ${cl}, 0\n`;
                    const fnP = this.nextRegister();
                    this.output += `  ${fnP} = extractvalue { i8*, i8* } ${cl}, 1\n`;
                    const typedFn = this.nextRegister();
                    this.output += `  ${typedFn} = bitcast i8* ${fnP} to ${outputType} (i8*, ${currentType})*\n`;
                    const result = this.nextRegister();
                    this.output += `  ${result} = call ${outputType} ${typedFn}(i8* ${envP}, ${currentType} ${currentVal})\n`;
                    currentVal = result;
                    currentType = outputType;
                }
            }
        }

        // Terminal operation
        if (mode === "collect" && outputAddr) {
            const vecStructType = this.getVecStructType();
            const tmpResult = this.nextRegister();
            this.output += `  ${tmpResult} = alloca ${finalElemType}\n`;
            this.output += `  store ${finalElemType} ${currentVal}, ${finalElemType}* ${tmpResult}\n`;
            const castResult = this.nextRegister();
            this.output += `  ${castResult} = bitcast ${finalElemType}* ${tmpResult} to i8*\n`;
            this.output += `  call void @fs_vec_push(${vecStructType}* ${outputAddr}, i8* ${castResult})\n`;
        } else if (mode === "count" && outputAddr) {
            const curCount = this.nextRegister();
            this.output += `  ${curCount} = load i32, i32* ${outputAddr}\n`;
            const newCount = this.nextRegister();
            this.output += `  ${newCount} = add i32 ${curCount}, 1\n`;
            this.output += `  store i32 ${newCount}, i32* ${outputAddr}\n`;
        } else if (mode === "sum" && outputAddr) {
            const curSum = this.nextRegister();
            this.output += `  ${curSum} = load i32, i32* ${outputAddr}\n`;
            const newSum = this.nextRegister();
            this.output += `  ${newSum} = add i32 ${curSum}, ${currentVal}\n`;
            this.output += `  store i32 ${newSum}, i32* ${outputAddr}\n`;
        } else if (mode === "for_body" && forBodyCallback) {
            forBodyCallback();
        }

        this.output += `  br label %${nextLabel}\n${nextLabel}:\n`;
        this.output += `  br label %${condLabel}\n${endLabel}:\n`;
    }

    /** Emit a fused iterator chain as a for-loop body */
    private emitIteratorForLoop(stmt: AST.ForStatement) {
        const chain = this.analyzeIteratorChain(stmt.iterable);
        if (!chain) return;

        const vecStructType = this.getVecStructType();
        const selfPtr = this.getCollectionSelfPtr(chain.source);
        const varName = stmt.variable.value;

        let elemType: string;
        if (chain.sourceKind === "vec") {
            elemType = this.getVecElemType(chain.source);
        } else {
            const hmTypes = this.getHashMapKeyValueTypes(chain.source);
            elemType = chain.iterValues ? hmTypes.valueType : hmTypes.keyType;
        }

        // Emit closures
        const closureAddrs: string[] = [];
        const closureOutputTypes: string[] = [];
        let currentElemType = elemType;

        for (const step of chain.steps) {
            const closureVal = this.emitExpression(step.closure);
            const closureAddr = this.nextRegister();
            this.output += `  ${closureAddr} = alloca { i8*, i8* }\n`;
            this.output += `  store { i8*, i8* } ${closureVal}, { i8*, i8* }* ${closureAddr}\n`;
            closureAddrs.push(closureAddr);
            if (step.kind === "map") {
                let outputType = currentElemType;
                if (step.closure instanceof AST.ClosureExpression && step.closure.returnType) {
                    outputType = this.mapType(step.closure.returnType);
                }
                closureOutputTypes.push(outputType);
                currentElemType = outputType;
            } else {
                closureOutputTypes.push(currentElemType);
            }
        }

        // Allocate loop variable
        const varAddr = `%${varName}.addr`;
        this.output += `  ${varAddr} = alloca ${currentElemType}\n`;
        this.locals.set(varName, varAddr);
        this.localTypes.set(varName, currentElemType);

        const labelId = this.labelCounter++;

        const forBodyCallback = () => {
            // Store current value to loop variable (currentVal is in scope from the fused loop)
            // We handle this by making the for_body mode store the final value
            this.pushRcScope();
            stmt.body.statements.forEach(s => this.emitStatement(s));
            this.emitScopeRelease();
            this.popRcScope();
        };

        if (chain.sourceKind === "vec") {
            this.emitFusedVecIteratorLoopForBody(selfPtr, vecStructType, elemType, chain.steps, closureAddrs, closureOutputTypes, varAddr, currentElemType, labelId, stmt);
        } else {
            const keyOffsetSize = chain.iterValues ? this.sizeOfLLVMType(this.getHashMapKeyValueTypes(chain.source).keyType) : 0;
            this.emitFusedHashMapIteratorLoopForBody(selfPtr, elemType, chain.steps, closureAddrs, closureOutputTypes, varAddr, currentElemType, labelId, stmt, chain.iterValues, keyOffsetSize);
        }
    }

    /** Specialized fused Vec iterator loop that stores to a variable and executes for-body */
    private emitFusedVecIteratorLoopForBody(
        selfPtr: string, vecStructType: string, elemType: string,
        steps: { kind: "map" | "filter", closure: AST.Expression }[],
        closureAddrs: string[], closureOutputTypes: string[],
        varAddr: string, finalElemType: string,
        labelId: number, stmt: AST.ForStatement
    ) {
        const condLabel = `iter_cond_${labelId}`;
        const bodyLabel = `iter_body_${labelId}`;
        const endLabel = `iter_end_${labelId}`;
        const nextLabel = `iter_next_${labelId}`;

        const lenReg = this.nextRegister();
        this.output += `  ${lenReg} = call i32 @fs_vec_len(${vecStructType}* ${selfPtr})\n`;

        const idxAddr = this.nextRegister();
        this.output += `  ${idxAddr} = alloca i32\n`;
        this.output += `  store i32 0, i32* ${idxAddr}\n`;

        this.output += `  br label %${condLabel}\n${condLabel}:\n`;
        const curIdx = this.nextRegister();
        this.output += `  ${curIdx} = load i32, i32* ${idxAddr}\n`;
        const cmp = this.nextRegister();
        this.output += `  ${cmp} = icmp slt i32 ${curIdx}, ${lenReg}\n`;
        this.output += `  br i1 ${cmp}, label %${bodyLabel}, label %${endLabel}\n${bodyLabel}:\n`;

        const rawElem = this.nextRegister();
        this.output += `  ${rawElem} = call i8* @fs_vec_get(${vecStructType}* ${selfPtr}, i32 ${curIdx})\n`;
        const castElem = this.nextRegister();
        this.output += `  ${castElem} = bitcast i8* ${rawElem} to ${elemType}*\n`;
        let currentVal = this.nextRegister();
        this.output += `  ${currentVal} = load ${elemType}, ${elemType}* ${castElem}\n`;
        let currentType = elemType;

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const closureAddr = closureAddrs[i];
            const outputType = closureOutputTypes[i];

            if (step.kind === "filter") {
                const cl = this.nextRegister();
                this.output += `  ${cl} = load { i8*, i8* }, { i8*, i8* }* ${closureAddr}\n`;
                const envP = this.nextRegister();
                this.output += `  ${envP} = extractvalue { i8*, i8* } ${cl}, 0\n`;
                const fnP = this.nextRegister();
                this.output += `  ${fnP} = extractvalue { i8*, i8* } ${cl}, 1\n`;
                const typedFn = this.nextRegister();
                this.output += `  ${typedFn} = bitcast i8* ${fnP} to i1 (i8*, ${currentType})*\n`;
                const predResult = this.nextRegister();
                this.output += `  ${predResult} = call i1 ${typedFn}(i8* ${envP}, ${currentType} ${currentVal})\n`;
                const passLabel = `iter_pass_${labelId}_${i}`;
                this.output += `  br i1 ${predResult}, label %${passLabel}, label %${nextLabel}\n${passLabel}:\n`;
            } else if (step.kind === "map") {
                const cl = this.nextRegister();
                this.output += `  ${cl} = load { i8*, i8* }, { i8*, i8* }* ${closureAddr}\n`;
                const envP = this.nextRegister();
                this.output += `  ${envP} = extractvalue { i8*, i8* } ${cl}, 0\n`;
                const fnP = this.nextRegister();
                this.output += `  ${fnP} = extractvalue { i8*, i8* } ${cl}, 1\n`;
                const typedFn = this.nextRegister();
                this.output += `  ${typedFn} = bitcast i8* ${fnP} to ${outputType} (i8*, ${currentType})*\n`;
                const result = this.nextRegister();
                this.output += `  ${result} = call ${outputType} ${typedFn}(i8* ${envP}, ${currentType} ${currentVal})\n`;
                currentVal = result;
                currentType = outputType;
            }
        }

        // Store to loop variable and run body
        this.output += `  store ${finalElemType} ${currentVal}, ${finalElemType}* ${varAddr}\n`;
        this.pushRcScope();
        stmt.body.statements.forEach(s => this.emitStatement(s));
        this.emitScopeRelease();
        this.popRcScope();

        this.output += `  br label %${nextLabel}\n${nextLabel}:\n`;
        const loadIdx = this.nextRegister();
        this.output += `  ${loadIdx} = load i32, i32* ${idxAddr}\n`;
        const incIdx = this.nextRegister();
        this.output += `  ${incIdx} = add i32 ${loadIdx}, 1\n`;
        this.output += `  store i32 ${incIdx}, i32* ${idxAddr}\n`;
        this.output += `  br label %${condLabel}\n${endLabel}:\n`;
    }

    /** Specialized fused HashMap iterator loop for for-body */
    private emitFusedHashMapIteratorLoopForBody(
        selfPtr: string, elemType: string,
        steps: { kind: "map" | "filter", closure: AST.Expression }[],
        closureAddrs: string[], closureOutputTypes: string[],
        varAddr: string, finalElemType: string,
        labelId: number, stmt: AST.ForStatement,
        iterValues: boolean = false, keyOffsetSize: number = 0
    ) {
        const hmStructType = this.getHashMapStructType();
        const condLabel = `iter_cond_${labelId}`;
        const bodyLabel = `iter_body_${labelId}`;
        const endLabel = `iter_end_${labelId}`;
        const nextLabel = `iter_next_${labelId}`;

        const cursorAddr = this.nextRegister();
        this.output += `  ${cursorAddr} = alloca i32\n`;
        this.output += `  store i32 0, i32* ${cursorAddr}\n`;

        this.output += `  br label %${condLabel}\n${condLabel}:\n`;
        const rawKeyPtr = this.nextRegister();
        this.output += `  ${rawKeyPtr} = call i8* @fs_hashmap_iter_next(${hmStructType}* ${selfPtr}, i32* ${cursorAddr})\n`;
        const isNull = this.nextRegister();
        this.output += `  ${isNull} = icmp eq i8* ${rawKeyPtr}, null\n`;
        this.output += `  br i1 ${isNull}, label %${endLabel}, label %${bodyLabel}\n${bodyLabel}:\n`;

        // Load key or value depending on iterValues flag
        let elemPtr: string;
        if (iterValues && keyOffsetSize > 0) {
            elemPtr = this.nextRegister();
            this.output += `  ${elemPtr} = getelementptr i8, i8* ${rawKeyPtr}, i32 ${keyOffsetSize}\n`;
        } else {
            elemPtr = rawKeyPtr;
        }
        const castElemPtr = this.nextRegister();
        this.output += `  ${castElemPtr} = bitcast i8* ${elemPtr} to ${elemType}*\n`;
        let currentVal = this.nextRegister();
        this.output += `  ${currentVal} = load ${elemType}, ${elemType}* ${castElemPtr}\n`;
        let currentType = elemType;

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const closureAddr = closureAddrs[i];
            const outputType = closureOutputTypes[i];

            if (step.kind === "filter") {
                const cl = this.nextRegister();
                this.output += `  ${cl} = load { i8*, i8* }, { i8*, i8* }* ${closureAddr}\n`;
                const envP = this.nextRegister();
                this.output += `  ${envP} = extractvalue { i8*, i8* } ${cl}, 0\n`;
                const fnP = this.nextRegister();
                this.output += `  ${fnP} = extractvalue { i8*, i8* } ${cl}, 1\n`;
                const typedFn = this.nextRegister();
                this.output += `  ${typedFn} = bitcast i8* ${fnP} to i1 (i8*, ${currentType})*\n`;
                const predResult = this.nextRegister();
                this.output += `  ${predResult} = call i1 ${typedFn}(i8* ${envP}, ${currentType} ${currentVal})\n`;
                const passLabel = `iter_pass_${labelId}_${i}`;
                this.output += `  br i1 ${predResult}, label %${passLabel}, label %${nextLabel}\n${passLabel}:\n`;
            } else if (step.kind === "map") {
                const cl = this.nextRegister();
                this.output += `  ${cl} = load { i8*, i8* }, { i8*, i8* }* ${closureAddr}\n`;
                const envP = this.nextRegister();
                this.output += `  ${envP} = extractvalue { i8*, i8* } ${cl}, 0\n`;
                const fnP = this.nextRegister();
                this.output += `  ${fnP} = extractvalue { i8*, i8* } ${cl}, 1\n`;
                const typedFn = this.nextRegister();
                this.output += `  ${typedFn} = bitcast i8* ${fnP} to ${outputType} (i8*, ${currentType})*\n`;
                const result = this.nextRegister();
                this.output += `  ${result} = call ${outputType} ${typedFn}(i8* ${envP}, ${currentType} ${currentVal})\n`;
                currentVal = result;
                currentType = outputType;
            }
        }

        this.output += `  store ${finalElemType} ${currentVal}, ${finalElemType}* ${varAddr}\n`;
        this.pushRcScope();
        stmt.body.statements.forEach(s => this.emitStatement(s));
        this.emitScopeRelease();
        this.popRcScope();

        this.output += `  br label %${nextLabel}\n${nextLabel}:\n`;
        this.output += `  br label %${condLabel}\n${endLabel}:\n`;
    }

    // ---- IntoIterator Support ----

    /** Try to emit a for-loop over a custom type using IntoIterator trait dispatch */
    private tryEmitIntoIteratorForLoop(stmt: AST.ForStatement): boolean {
        const iterableType = this.getExpressionType(stmt.iterable);
        if (!iterableType.startsWith("%struct.")) return false;

        const structName = iterableType.replace("%struct.", "");

        // Search impl blocks for one targeting this struct with an into_iter method
        for (const [key, impl] of this.implBlocks) {
            if (impl.traitName.value === "IntoIterator") {
                const implTarget = this.getImplTargetTypeName(impl.targetType.value);
                if (implTarget === structName) {
                    const intoIterMethod = impl.methods.find(m => m.name === "into_iter");
                    if (!intoIterMethod) continue;

                    // Call into_iter to get a Vec
                    const funcName = `IntoIterator_${structName}_into_iter`;
                    const selfExpr = stmt.iterable;
                    const selfVal = this.emitExpression(selfExpr);

                    // The into_iter method takes self by pointer (struct*)
                    const retType = this.functionReturnTypes.get(funcName) || this.getVecStructType();
                    const reg = this.nextRegister();

                    if (iterableType.endsWith("*")) {
                        this.output += `  ${reg} = call ${retType} @${funcName}(${iterableType} ${selfVal})\n`;
                    } else {
                        // Need to pass pointer — alloca, store, then pass
                        const tmpAddr = this.nextRegister();
                        this.output += `  ${tmpAddr} = alloca ${iterableType}\n`;
                        this.output += `  store ${iterableType} ${selfVal}, ${iterableType}* ${tmpAddr}\n`;
                        this.output += `  ${reg} = call ${retType} @${funcName}(${iterableType}* ${tmpAddr})\n`;
                    }

                    // Store the Vec result and iterate it
                    const vecAddr = this.nextRegister();
                    this.output += `  ${vecAddr} = alloca ${retType}\n`;
                    this.output += `  store ${retType} ${reg}, ${retType}* ${vecAddr}\n`;

                    // Try to determine element type from the into_iter return type
                    // For now, default to i32
                    let elemType = "i32";
                    if (intoIterMethod.returnType) {
                        const retTypeStr = intoIterMethod.returnType.toString();
                        // If return type is Vec<int>, Vec<string>, etc., extract element
                        if (retTypeStr.startsWith("Vec<") && retTypeStr.endsWith(">")) {
                            const inner = retTypeStr.slice(4, -1);
                            elemType = this.mapType(new (AST as any).TypeIdentifier({type: 0, literal: inner, line: 0, column: 0}, inner));
                        }
                    }

                    // Emit Vec for-loop using the result
                    const varName = stmt.variable.value;
                    const vecStructType = this.getVecStructType();
                    const labelId = this.labelCounter++;
                    const condLabel = `foriter_cond_${labelId}`;
                    const bodyLabel = `foriter_body_${labelId}`;
                    const endLabel = `foriter_end_${labelId}`;

                    const lenReg2 = this.nextRegister();
                    this.output += `  ${lenReg2} = call i32 @fs_vec_len(${vecStructType}* ${vecAddr})\n`;

                    const idxAddr = this.nextRegister();
                    this.output += `  ${idxAddr} = alloca i32\n`;
                    this.output += `  store i32 0, i32* ${idxAddr}\n`;

                    const varAddr = `%${varName}.addr`;
                    this.output += `  ${varAddr} = alloca ${elemType}\n`;
                    this.locals.set(varName, varAddr);
                    this.localTypes.set(varName, elemType);

                    this.output += `  br label %${condLabel}\n${condLabel}:\n`;
                    const curIdx = this.nextRegister();
                    this.output += `  ${curIdx} = load i32, i32* ${idxAddr}\n`;
                    const cmpReg = this.nextRegister();
                    this.output += `  ${cmpReg} = icmp slt i32 ${curIdx}, ${lenReg2}\n`;
                    this.output += `  br i1 ${cmpReg}, label %${bodyLabel}, label %${endLabel}\n${bodyLabel}:\n`;

                    this.pushRcScope();
                    const rawPtr = this.nextRegister();
                    this.output += `  ${rawPtr} = call i8* @fs_vec_get(${vecStructType}* ${vecAddr}, i32 ${curIdx})\n`;
                    const castPtr = this.nextRegister();
                    this.output += `  ${castPtr} = bitcast i8* ${rawPtr} to ${elemType}*\n`;
                    const elemVal = this.nextRegister();
                    this.output += `  ${elemVal} = load ${elemType}, ${elemType}* ${castPtr}\n`;
                    this.output += `  store ${elemType} ${elemVal}, ${elemType}* ${varAddr}\n`;

                    stmt.body.statements.forEach(s => this.emitStatement(s));
                    this.emitScopeRelease();
                    this.popRcScope();

                    const loadIdx = this.nextRegister();
                    this.output += `  ${loadIdx} = load i32, i32* ${idxAddr}\n`;
                    const incIdx = this.nextRegister();
                    this.output += `  ${incIdx} = add i32 ${loadIdx}, 1\n`;
                    this.output += `  store i32 ${incIdx}, i32* ${idxAddr}\n`;
                    this.output += `  br label %${condLabel}\n${endLabel}:\n`;

                    return true;
                }
            }
        }
        return false;
    }

    private getMethodCallReturnType(expr: AST.MethodCallExpression): string {
        const methodName = expr.method.value;

        // Lazy iterator chain terminal operations
        if (this.isIteratorChain(expr)) {
            if (methodName === "collect") return this.getVecStructType();
            if (methodName === "count" || methodName === "sum") return "i32";
            if (methodName === "for_each") return "void";
            // Intermediate operations (iter, map, filter) don't have a real LLVM type
            // They are consumed by terminals at emit time
            return "i32";
        }

        const selfType = this.getExpressionType(expr.object);

        // Vec methods
        if (this.isVecType(selfType)) {
            const elemType = this.getVecElemType(expr.object);
            if (methodName === "get" || methodName === "pop") return elemType;
            if (methodName === "len") return "i32";
            if (methodName === "map" || methodName === "filter" || methodName === "collect") return this.getVecStructType();
            return "void";
        }

        // HashMap methods
        if (this.isHashMapType(selfType)) {
            const { valueType } = this.getHashMapKeyValueTypes(expr.object);
            if (methodName === "get") return valueType;
            if (methodName === "len") return "i32";
            if (methodName === "contains_key") return "i32";
            if (methodName === "keys" || methodName === "values") return this.getVecStructType();
            if (methodName === "values_iter" || methodName === "keys_iter") return "i32"; // Consumed by chain terminals
            return "void";
        }

        let targetTypeName = selfType;
        if (targetTypeName.startsWith("%struct.")) targetTypeName = targetTypeName.replace("%struct.", "");
        else if (targetTypeName.startsWith("%enum.")) targetTypeName = targetTypeName.replace("%enum.", "");
        else if (targetTypeName === "i32") targetTypeName = "int";
        else if (targetTypeName === "i1") targetTypeName = "bool";

        // Search for the method in impl blocks to find return type
        for (const [key, impl] of this.implBlocks) {
            const implTarget = this.getImplTargetTypeName(impl.targetType.value);
            if (implTarget === targetTypeName) {
                const traitName = impl.traitName.value;
                const funcName = `${traitName}_${targetTypeName}_${methodName}`;
                if (this.functionReturnTypes.has(funcName)) {
                    return this.functionReturnTypes.get(funcName)!;
                }
            }
        }

        // Check generic impl blocks
        for (const [traitName, impls] of this.genericImplBlocks) {
            for (const impl of impls) {
                if (impl.methods.some(m => m.name === methodName)) {
                    const funcName = `${traitName}_${targetTypeName}_${methodName}`;
                    if (this.functionReturnTypes.has(funcName)) {
                        return this.functionReturnTypes.get(funcName)!;
                    }
                }
            }
        }

        return "i32";
    }

    private emitTraitMethodCall(traitName: string, methodName: string, args: AST.Expression[]): string {
        // Determine the concrete type of the first argument (self)
        if (args.length === 0) {
            return "0"; // Trait methods require at least self
        }

        const selfExpr = args[0];
        const selfType = this.getExpressionType(selfExpr);

        // Extract the target type name from the LLVM type (e.g., "%struct.m1_Box" -> "m1_Box", "i32" -> "int")
        let targetTypeName = selfType;
        if (targetTypeName.startsWith("%struct.")) {
            targetTypeName = targetTypeName.replace("%struct.", "");
        } else if (targetTypeName.startsWith("%enum.")) {
            targetTypeName = targetTypeName.replace("%enum.", "");
        } else if (targetTypeName === "i32") {
            targetTypeName = "int";
        } else if (targetTypeName === "i1") {
            targetTypeName = "bool";
        }

        // Look up non-generic impl first
        const key = `${traitName}_${targetTypeName}`;
        let funcName = `${traitName}_${targetTypeName}_${methodName}`;

        if (!this.emittedImplMethods.has(funcName)) {
            // Check for generic impl that could match
            const genericImpls = this.genericImplBlocks.get(traitName);
            if (genericImpls && genericImpls.length > 0) {
                // Try to match: if selfType is a generic struct like Box_i32,
                // and there's impl<T> Trait for Box<T>, we need to instantiate
                this.instantiateGenericImplMethod(traitName, methodName, targetTypeName, selfType);
            }
        }

        // Emit the call
        const retType = this.functionReturnTypes.get(funcName) || "i32";
        const emittedArgs: string[] = [];
        const paramTypes = this.functionParamTypes.get(funcName) || [];

        for (let i = 0; i < args.length; i++) {
            const val = this.emitExpression(args[i]);
            const expectedType = paramTypes[i];
            if (expectedType) {
                emittedArgs.push(`${expectedType} ${val}`);
            } else {
                const argType = this.getExpressionType(args[i]);
                emittedArgs.push(`${argType} ${val}`);
            }
        }

        const callArgs = emittedArgs.join(", ");

        if (retType === "void") {
            this.output += `  call void @${funcName}(${callArgs})\n`;
            return "0";
        }

        const reg = this.nextRegister();
        this.output += `  ${reg} = call ${retType} @${funcName}(${callArgs})\n`;
        return reg;
    }

    private instantiateGenericImplMethod(traitName: string, methodName: string, targetTypeName: string, selfType: string) {
        const genericImpls = this.genericImplBlocks.get(traitName);
        const modulePaths = this.genericImplModulePaths.get(traitName);
        if (!genericImpls || !modulePaths) return;

        for (let i = 0; i < genericImpls.length; i++) {
            const impl = genericImpls[i];
            const modulePath = modulePaths[i];
            const baseTargetType = impl.targetType.value;

            // Check if targetTypeName starts with the base target type
            // e.g., targetTypeName = "m1_Box_i32", baseTargetType = "Box"
            // We need to match by checking if the mangled name starts with the mangled base type
            const mangledBase = this.getMangledName(baseTargetType, modulePath);

            if (targetTypeName === mangledBase || targetTypeName.startsWith(mangledBase + "_")) {
                // Extract the type args from the target type name suffix
                const suffix = targetTypeName.substring(mangledBase.length);
                const typeArgsStr = suffix.startsWith("_") ? suffix.substring(1) : suffix;

                // Build type bindings
                const typeBindings = new Map<string, string>();
                if (impl.typeParams.length === 1 && typeArgsStr.length > 0) {
                    // Map the suffix back to an LLVM type
                    let llvmType = typeArgsStr;
                    if (typeArgsStr === "i32") llvmType = "i32";
                    else if (typeArgsStr === "i1") llvmType = "i1";
                    else if (typeArgsStr === "i8_ptr") llvmType = "i8*";
                    else if (this.structs.has(typeArgsStr)) llvmType = `%struct.${typeArgsStr}`;
                    else if (this.enumDefs.has(typeArgsStr)) llvmType = `%enum.${typeArgsStr}`;
                    typeBindings.set(impl.typeParams[0], llvmType);
                } else if (impl.typeParams.length > 0 && typeArgsStr.length > 0) {
                    // Multi-param: split by underscore (simplified)
                    const parts = typeArgsStr.split("_");
                    impl.typeParams.forEach((p, idx) => {
                        if (idx < parts.length) typeBindings.set(p, parts[idx]);
                    });
                }

                // Find and emit the specific method
                for (const method of impl.methods) {
                    if (method.name !== methodName) continue;

                    const funcName = `${traitName}_${targetTypeName}_${methodName}`;
                    if (this.emittedImplMethods.has(funcName)) return;
                    this.emittedImplMethods.add(funcName);

                    // Register types
                    const mapT = (t: AST.Type | Type) => this.mapTypeWithBindings(t, typeBindings);
                    const retType = method.returnType ? mapT(method.returnType) : "void";
                    const paramTypes = method.parameters.map(p => {
                        const t = mapT(p.type);
                        if ((t.startsWith("%enum.") || t.startsWith("%struct.")) && !t.endsWith("*")) return `${t}*`;
                        return t;
                    });
                    this.functionReturnTypes.set(funcName, retType);
                    this.functionParamTypes.set(funcName, paramTypes);

                    // Save and set module context for the impl definition
                    const oldModulePath = this.currentModulePath;
                    const oldScope = this.currentScope;
                    this.currentModulePath = modulePath;

                    this.emitImplMethodFunction(funcName, method, typeBindings);

                    this.currentModulePath = oldModulePath;
                    this.currentScope = oldScope;
                    return;
                }
            }
        }
    }

}
