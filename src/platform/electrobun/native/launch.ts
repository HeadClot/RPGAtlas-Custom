import { resolve } from "node:path";

/** Extract a project path from a desktop argv list. Flags belong to the host. */
export function projectArgFromArgs(args: string[], cwd: string): string | null {
  for (const arg of args.slice(1)) {
    if (!arg || arg.startsWith("-")) continue;
    return /^[A-Za-z]:[\\/]/.test(arg) || arg.startsWith("/") ? arg : resolve(cwd, arg);
  }
  return null;
}
