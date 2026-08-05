/* RPGAtlas — tests-unit/editor-menu-registry.test.ts
   Keeps the editor's registered actions and visible menus from drifting apart. */

import { describe, expect, it } from "vitest";
import { VIEW_MENU_ITEMS } from "../src/editor/core/menu-registry";

describe("editor menu registry", () => {
  it("exposes Map Connections from the View menu", () => {
    expect(VIEW_MENU_ITEMS).toContain("connections");
    expect(VIEW_MENU_ITEMS.indexOf("connections")).toBe(VIEW_MENU_ITEMS.indexOf("worldview") + 1);
  });
});
