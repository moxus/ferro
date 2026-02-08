
import { describe, it, expect } from "vitest";
import { ModuleLoader } from "./module_loader";
import * as path from "path";
import * as fs from "fs";

// Create test dir relative to this file
// If __dirname is not available, we can just use process.cwd() / "packages/ferro/tests/modules"
const testDir = path.join(process.cwd(), "tests/modules");

describe("ModuleLoader", () => {
    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
    }

    it("should load a simple module with imports", () => {
        const mathPath = path.join(testDir, "math.fe");
        fs.writeFileSync(mathPath, `
            export fn add(a: int, b: int) -> int {
                a + b
            }
        `);

        // Ensure file is written
        expect(fs.existsSync(mathPath)).toBe(true);

        const mainPath = path.join(testDir, "main.fe");
        fs.writeFileSync(mainPath, `
            import { add } from "./math"
            let res = add(10, 20);
            export let final = res;
        `);

        const loader = new ModuleLoader();
        const mainModule = loader.load(mainPath);

        expect(mainModule).toBeDefined();
        // Check "final" export
        const finalSym = mainModule.exports.resolve("final");
        expect(finalSym).toBeDefined();
        expect(finalSym?.type).toEqual({ kind: "primitive", name: "int" });
    });

    it("should detect cyclic dependencies", () => {
        const aPath = path.join(testDir, "a.fe");
        const bPath = path.join(testDir, "b.fe");

        fs.writeFileSync(aPath, `import { b } from "./b"`);
        fs.writeFileSync(bPath, `import { a } from "./a"`);

        const loader = new ModuleLoader();
        expect(() => loader.load(aPath)).toThrow(/Cyclic dependency/);
    });
});
