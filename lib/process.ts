import { spawn } from "node:child_process";

export function childEnvironment(): NodeJS.ProcessEnv {
  // Repository adapters must never inherit integration credentials.
  return { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, HOME: process.env.HOME, LANG: "C.UTF-8", PYTHONHASHSEED: "0", PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1", PYTHONPATH: process.cwd() };
}
export async function execute(command: string, args: string[], options: { cwd?: string; timeout?: number; maxOutput?: number } = {}) {
  return new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd || process.cwd(), env: childEnvironment(), stdio: ["ignore", "pipe", "pipe"], detached: true });
    let stdout = "", stderr = "", done = false;
    const kill = () => { try { if (child.pid) process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } };
    const timer = setTimeout(() => { kill(); finish(new Error(`Execution exceeded ${options.timeout || 90000}ms timeout.`)); }, options.timeout || 90000);
    function finish(error?: Error, code?: number) { if (done) return; done = true; clearTimeout(timer); if (error) reject(error); else resolve({ stdout, stderr, code: code ?? -1 }); }
    child.on("error", error => finish(error));
    child.stdout.on("data", data => { stdout += data.toString(); if (stdout.length > (options.maxOutput || 15_000_000)) { kill(); finish(new Error("Execution output exceeded the safety limit.")); } });
    child.stderr.on("data", data => { stderr += data.toString(); if (stderr.length > (options.maxOutput || 15_000_000)) { kill(); finish(new Error("Execution error output exceeded the safety limit.")); } });
    child.on("close", code => finish(undefined, code ?? -1));
  });
}
export async function checked(command: string, args: string[], cwd?: string) { const r = await execute(command, args, { cwd }); if (r.code !== 0) throw new Error(r.stderr.slice(-1000) || `${command} exited ${r.code}`); return r.stdout.trim(); }
