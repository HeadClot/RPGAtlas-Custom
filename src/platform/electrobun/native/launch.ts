import { posix, win32 } from "node:path";

function isWindowsAbsolutePath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

/** Extract a project path from a desktop argv list. Flags belong to the host. */
export function projectArgFromArgs(args: string[], cwd: string): string | null {
  for (const arg of args.slice(1)) {
    if (!arg || arg.startsWith("-")) continue;
    if (isWindowsAbsolutePath(arg) || arg.startsWith("/")) return arg;
    return (isWindowsAbsolutePath(cwd) ? win32 : posix).resolve(cwd, arg);
  }
  return null;
}
