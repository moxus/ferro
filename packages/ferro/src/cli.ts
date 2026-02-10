#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { Emitter } from "./codegen/emitter";
import { LLVMEmitter } from "./codegen/llvm_emitter";
import { ModuleLoader } from "./analysis/module_loader";
import { ParseError, formatError } from "./errors";

const VERSION = "1.0.0";

function printUsage() {
    console.log(`ferro ${VERSION} — a Rust-inspired language for the JS/TS ecosystem

USAGE:
    ferro build <file.fe> [options]

COMMANDS:
    build       Compile a .fe source file
    help        Show this help message
    version     Print version

OPTIONS:
    --native    Compile to a native binary via LLVM (default: transpile to TypeScript)

EXAMPLES:
    ferro build hello.fe
    ferro build hello.fe --native`);
}

function build(args: string[]) {
    const isNative = args.includes("--native");
    const filename = args.find(arg => !arg.startsWith("--"));

    if (!filename) {
        console.error("error: no input file specified\n");
        console.error("Usage: ferro build <file.fe> [--native]");
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
            const modules = loader.getAllModules();
            loader.getAnalyzer().diagnostics.forEach(d => {
                const file = d.file || path.resolve(filename);
                const mod = modules.get(file);
                const source = mod?.source || "";
                console.error(formatError(d.message, file, d.line, d.col, source));
                console.error("");
            });
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
        if (e instanceof ParseError) {
            e.errors.forEach(err => {
                console.error(formatError(err.msg, e.file, err.line, err.col, e.source));
                console.error("");
            });
            process.exit(1);
        }
        console.error(`\x1b[1m\x1b[31merror\x1b[0m\x1b[1m: ${e.message || e}\x1b[0m`);
        process.exit(1);
    }
}

function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
        case "build":
            build(args.slice(1));
            break;
        case "version":
        case "--version":
        case "-v":
            console.log(`ferro ${VERSION}`);
            break;
        case "help":
        case "--help":
        case "-h":
            printUsage();
            break;
        case undefined:
            printUsage();
            break;
        default:
            // If the first arg looks like a file, treat it as an implicit build for backward compat
            if (command.endsWith(".fe")) {
                build(args);
            } else {
                console.error(`error: unknown command '${command}'\n`);
                printUsage();
                process.exit(1);
            }
            break;
    }
}

main();