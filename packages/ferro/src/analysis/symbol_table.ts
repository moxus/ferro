import { Type } from "./types";

export interface Symbol {
    name: string;
    type: Type;
    mutable: boolean;
    definedAtLine: number; // For jump-to-definition later
    sourceModule?: string; // Absolute path of the module where this symbol is defined
    unsafe?: boolean;
}

export class SymbolTable {
    private symbols: Map<string, Symbol> = new Map();
    private parent: SymbolTable | null = null;

    constructor(parent: SymbolTable | null = null) {
        this.parent = parent;
    }

    public define(name: string, type: Type, mutable: boolean, line: number, sourceModule?: string, unsafe?: boolean) {
        this.symbols.set(name, { name, type, mutable, definedAtLine: line, sourceModule, unsafe });
    }

    public resolve(name: string): Symbol | undefined {
        const s = this.symbols.get(name);
        if (s) return s;
        if (this.parent) return this.parent.resolve(name);
        return undefined;
    }

    public createChild(): SymbolTable {
        return new SymbolTable(this);
    }
}
