#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { Emitter } from "./codegen/emitter";
import { LLVMEmitter } from "./codegen/llvm_emitter";
import { ModuleLoader } from "./analysis/module_loader";

function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.error("Usage: ferro <file.fe> [--native]");
        process.exit(1);
    }

    const isNative = args.includes("--native");
    // Filter out flags to find filename
    const filename = args.find(arg => !arg.startsWith("--"));

    if (!filename) {
        console.error("No input file specified.");
        process.exit(1);
    }

    try {
        const loader = new ModuleLoader();
        /* 
         * Load entry module and recursively load dependencies.
         * Macro expansion happens during loading.
         * Semantic analysis happens during loading.
         */
        const entryModule = loader.load(filename);

        if (loader.getAnalyzer().diagnostics.length > 0) {
            console.error("Semantic Errors:");
            loader.getAnalyzer().diagnostics.forEach(d => console.error(`${d.message} at line ${d.line}`));
            process.exit(1);
        }

        if (isNative) {
            // Auto-inject the self-hosted runtime for native builds
            const runtimeFsPath = path.join(__dirname, "..", "src", "runtime.fe");
            const runtimeDistPath = path.join(__dirname, "runtime.fe");
            const runtimePath = fs.existsSync(runtimeFsPath) ? runtimeFsPath : runtimeDistPath;

            const modules = loader.getAllModules();
            // Check if runtime is already in the module graph (user explicitly imported it)
            const hasRuntime = Array.from(modules.keys()).some(p => p.endsWith("runtime.fe"));
            if (!hasRuntime && fs.existsSync(runtimePath)) {
                loader.load(runtimePath);
            }

            const allModules = loader.getAllModules();
            const llvmEmitter = new LLVMEmitter();
            const llCode = llvmEmitter.emit(allModules, entryModule.path);

            const llFile = entryModule.path.replace(/\.[^/.]+$/, "") + ".ll";
            fs.writeFileSync(llFile, llCode);
            console.log(`Generated LLVM IR: ${llFile}`);

            const binFile = entryModule.path.replace(/\.[^/.]+$/, "");
            const cmd = `clang -Wno-override-module "${llFile}" -o "${binFile}"`;
            console.log(`Compiling: ${cmd}`);

            exec(cmd, (err, stdout, stderr) => {
                if (err) {
                    console.error("Clang compilation failed:");
                    console.error(stderr);
                    return;
                }
                console.log(`Successfully compiled to native binary: ${binFile}`);
            });

        } else {
            // Transpile to TypeScript
            // We iterate over all loaded modules and transpile each one to a corresponding .ts file
            const modules = loader.getAllModules();
            const emitter = new Emitter();

            modules.forEach((mod) => {
                const output = emitter.emit(mod.program);
                const outFilename = mod.path.replace(/\.[^/.]+$/, "") + ".ts";
                fs.writeFileSync(outFilename, output);
                console.log(`Compiled ${path.basename(mod.path)} to ${path.basename(outFilename)}`);
            });
        }
    } catch (e: any) {
        console.error("Compilation Error:");
        console.error(e.message || e);
        process.exit(1);
    }
}

main();