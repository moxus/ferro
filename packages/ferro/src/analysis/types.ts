export interface EnumVariantInfo {
    name: string;
    fields: Type[];
    tag: number;
}

export type Type =
    | { kind: "primitive", name: "int" | "f64" | "string" | "bool" | "void" | "any" | "i8" | "null" | "File" }
    | { kind: "pointer", elementType: Type }
    | { kind: "function", params: Type[], returnType: Type }
    | { kind: "result", ok: Type, err: Type }
    | { kind: "generic_inst", name: string, args: Type[] } // Box<int>
    | { kind: "generic_param", name: string } // T
    | { kind: "enum", name: string, variants: EnumVariantInfo[] }
    | { kind: "struct", name: string, typeParams: string[], fields: { name: string, type: Type }[] }
    | { kind: "unknown" }; // For compilation errors or placeholders

export const IntType: Type = { kind: "primitive", name: "int" };
export const F64Type: Type = { kind: "primitive", name: "f64" };
export const StringType: Type = { kind: "primitive", name: "string" };
export const BoolType: Type = { kind: "primitive", name: "bool" };
export const VoidType: Type = { kind: "primitive", name: "void" };
export const AnyType: Type = { kind: "primitive", name: "any" };
export const I8Type: Type = { kind: "primitive", name: "i8" };
export const NullType: Type = { kind: "primitive", name: "null" };
export const FileType: Type = { kind: "primitive", name: "File" };
export const UnknownType: Type = { kind: "unknown" };

export function typesEqual(a: Type, b: Type): boolean {
    if (a.kind === "unknown" || b.kind === "unknown") return true; // Be permissive
    if (a.kind === "primitive" && a.name === "any") return true;
    if (b.kind === "primitive" && b.name === "any") return true;
    // Generic params are compatible with any type (resolved at monomorphization time)
    if (a.kind === "generic_param" || b.kind === "generic_param") return true;
    // null is compatible with any pointer type
    if (a.kind === "primitive" && a.name === "null" && b.kind === "pointer") return true;
    if (b.kind === "primitive" && b.name === "null" && a.kind === "pointer") return true;

    if (a.kind !== b.kind) return false;

    if (a.kind === "primitive" && b.kind === "primitive") {
        return a.name === b.name;
    }
    if (a.kind === "pointer" && b.kind === "pointer") {
        return typesEqual(a.elementType, b.elementType);
    }
    if (a.kind === "enum" && b.kind === "enum") {
        return a.name === b.name;
    }
    if (a.kind === "struct" && b.kind === "struct") {
        return a.name === b.name;
    }
    if (a.kind === "generic_inst" && b.kind === "generic_inst") {
        return a.name === b.name && a.args.length === b.args.length &&
            a.args.every((arg, i) => typesEqual(arg, b.args[i]));
    }
    // TODO: Function and Result comparison
    return false;
}

export function typeToString(t: Type): string {
    if (t.kind === "primitive") return t.name;
    if (t.kind === "pointer") return `*${typeToString(t.elementType)}`;
    if (t.kind === "generic_param") return t.name;
    if (t.kind === "generic_inst") return `${t.name}<${t.args.map(typeToString).join(", ")}>`;
    if (t.kind === "enum") return t.name;
    if (t.kind === "struct") {
        if (t.typeParams.length > 0) return `${t.name}<${t.typeParams.join(", ")}>`;
        return t.name;
    }
    if (t.kind === "unknown") return "?";
    return "complex";
}
