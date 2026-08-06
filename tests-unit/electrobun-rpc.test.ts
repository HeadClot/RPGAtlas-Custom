import { describe, expect, it } from "vitest";
import { DESKTOP_REQUEST_NAMES, type DesktopRequests } from "../src/shared/electrobun-rpc";

describe("Electrobun RPC contract", () => {
  it("enumerates every native request exactly once", () => {
    const names = [...DESKTOP_REQUEST_NAMES];
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("project_create");
    expect(names).toContain("project_asset_write_inplace");
    expect(names).toContain("library_scan_import");
    expect(names).toContain("take_launch_path");
    const typeOnlyCheck: keyof DesktopRequests = names[0];
    expect(typeOnlyCheck).toBe("save_project");
  });
});
