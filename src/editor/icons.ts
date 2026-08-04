/* RPGAtlas — src/editor/icons.ts
   Original line-art SVG glyphs used by the toolbar, menus, and event editor.
   Verbatim move from the editor monolith (Phase 1 Stage C, Package 3):
   logic unchanged. ICONS is exported so workspace.ts (toolbar/menus) and
   event-editor.ts (the header person glyph, ICONS.event) import it directly —
   the editorHooks.eventIcon slot is dissolved with this extraction.
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */
/* eslint-disable @typescript-eslint/no-explicit-any */

  // ============================ icons (original line art) ============================
  function svgIcon(inner: any) {
    return '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' + inner + "</svg>";
  }
  const layerGlyph = '<path d="M10 2.6 17.4 6.6 10 10.6 2.6 6.6z"/><path d="M2.6 10.4 10 14.4l7.4-4"/>';
  export const ICONS: Record<string, string> = {
    new: svgIcon('<path d="M5 2.5h7l3.5 3.5v11.5H5z"/><path d="M12 2.5V6h3.5"/><path d="M10 9.5v5M7.5 12h5"/>'),
    open: svgIcon('<path d="M2.5 16V4.5h5l2 2h8V9"/><path d="M2.5 16l2.8-7h13.2l-2.8 7z"/>'),
    save: svgIcon('<path d="M3 3h11.5L17 5.5V17H3z"/><path d="M6 3v4.5h7V3"/><rect x="6" y="11" width="8" height="6"/>'),
    cut: svgIcon('<circle cx="5.2" cy="14.8" r="2.3"/><circle cx="14.8" cy="14.8" r="2.3"/><path d="M6.8 13 15 2.5M13.2 13 5 2.5"/>'),
    copy: svgIcon('<rect x="7" y="6" width="10" height="11.5" rx="1.5"/><path d="M4 13.5V4a1.5 1.5 0 0 1 1.5-1.5H13"/>'),
    paste: svgIcon('<rect x="4" y="4.5" width="12" height="13" rx="1.5"/><path d="M7.2 4.5a2.8 2.8 0 0 1 5.6 0"/><rect x="7" y="3.2" width="6" height="2.8" rx="1"/><path d="M7 10.5h6M7 13.5h6"/>'),
    undo: svgIcon('<path d="M4 8.5h8.5a3.8 3.8 0 0 1 0 7.6H8"/><path d="M7 5 3.5 8.5 7 12"/>'),
    redo: svgIcon('<path d="M16 8.5H7.5a3.8 3.8 0 0 0 0 7.6H12"/><path d="M13 5l3.5 3.5L13 12"/>'),
    map: svgIcon('<rect x="3" y="3" width="14" height="14"/><path d="M3 9.7h14M9.7 3v14"/>'),
    event: svgIcon('<circle cx="10" cy="6.3" r="3.1"/><path d="M4.2 17c.5-4 2.9-5.6 5.8-5.6s5.3 1.6 5.8 5.6"/>'),
    pass: svgIcon('<circle cx="6.8" cy="6.8" r="4"/><path d="M11.8 11.8l5.5 5.5M17.3 11.8l-5.5 5.5"/>'),
    pen: svgIcon('<path d="M3.5 16.5l.9-3.6L13.6 3.7l2.7 2.7L7.1 15.6l-3.6.9z"/><path d="M12 5.3l2.7 2.7"/>'),
    erase: svgIcon('<path d="M7.5 15.5 3.6 11.6a1.5 1.5 0 0 1 0-2.1l6-6a1.5 1.5 0 0 1 2.1 0l4.8 4.8a1.5 1.5 0 0 1 0 2.1l-5.1 5.1H7.5z"/><path d="M3.5 17.5h13"/><path d="M7.1 6.9l6 6"/>'),
    rect: svgIcon('<rect x="3.5" y="5" width="13" height="10"/>'),
    circle: svgIcon('<ellipse cx="10" cy="10" rx="6.6" ry="5.2"/>'),
    fill: svgIcon('<path d="M8.2 2.2v2.6"/><path d="M8.2 3.8l6.2 6.2L9 15.4 3.4 9.8z"/><path d="M16.2 12.8s1.7 2.1 1.7 3.3a1.7 1.7 0 1 1-3.4 0c0-1.2 1.7-3.3 1.7-3.3z"/>'),
    shadow: svgIcon('<rect x="3.5" y="3.5" width="13" height="13"/><path d="M16.5 3.5 3.5 16.5"/><path d="M16.5 3.5v13h-13z" fill="currentColor" stroke="none" opacity="0.45"/>'),
    height: svgIcon('<path d="M3 16.5h4v-4h4v-4h4v-5"/><path d="M12.5 6 15 3.5 17.5 6"/>'),
    hd2d: svgIcon('<path d="M2.5 14.5l5-8 4 6 2-3 4 5"/><path d="M2.5 17h15"/>'),
    zoomin: svgIcon('<circle cx="8.8" cy="8.8" r="5.6"/><path d="M13 13l4.3 4.3"/><path d="M6.3 8.8h5M8.8 6.3v5"/>'),
    zoomout: svgIcon('<circle cx="8.8" cy="8.8" r="5.6"/><path d="M13 13l4.3 4.3"/><path d="M6.3 8.8h5"/>'),
    zoom1: svgIcon('<circle cx="8.8" cy="8.8" r="5.6"/><path d="M13 13l4.3 4.3"/><text x="8.8" y="10.9" font-size="5.6" font-weight="bold" text-anchor="middle" fill="currentColor" stroke="none" font-family="monospace">1:1</text>'),
    db: svgIcon('<ellipse cx="10" cy="4.6" rx="6.4" ry="2.4"/><path d="M3.6 4.6v10.8c0 1.3 2.9 2.4 6.4 2.4s6.4-1.1 6.4-2.4V4.6"/><path d="M3.6 10c0 1.3 2.9 2.4 6.4 2.4s6.4-1.1 6.4-2.4"/>'),
    plugins: svgIcon('<path d="M8 3.4a2 2 0 0 1 4 0V5h3.2a.8.8 0 0 1 .8.8V9h-1.6a2 2 0 0 0 0 4H16v3.2a.8.8 0 0 1-.8.8H4.8a.8.8 0 0 1-.8-.8V13h1.6a2 2 0 0 0 0-4H4V5.8a.8.8 0 0 1 .8-.8H8z"/>'),
    audio: svgIcon('<path d="M3 8v4h2.8L10 16V4L5.8 8H3z"/><path d="M12.8 7.2a4 4 0 0 1 0 5.6M15.3 5a7.2 7.2 0 0 1 0 10"/>'),
    search: svgIcon('<rect x="3" y="2.5" width="9.5" height="13" rx="1"/><path d="M5.6 6h4.3M5.6 9h4.3"/><circle cx="13.6" cy="13.6" r="3.4"/><path d="M16 16l2.4 2.4"/>'),
    resources: svgIcon('<rect x="3" y="4" width="14" height="12" rx="1.5"/><circle cx="7.4" cy="8.4" r="1.5"/><path d="M3 13.8l4-4 3 3 3.4-3.4 3.6 3.6"/>'),
    chargen: svgIcon('<circle cx="8" cy="6.5" r="3"/><path d="M2.8 17c.5-3.6 2.6-5.1 5.2-5.1s4.7 1.5 5.2 5.1"/><path d="M15.6 4.6v5M13.1 7.1h5"/>'),
    play: svgIcon('<path d="M5.5 3.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>'),
  };
  [["auto", "A"], ["ground", "1"], ["decor", "2"], ["decor2", "3"], ["over", "4"]].forEach(([ln, glyph]) => {
    ICONS["layer-" + ln] = svgIcon(layerGlyph +
      '<text x="15" y="19" font-size="9" font-weight="bold" text-anchor="middle" fill="currentColor" stroke="none">' + glyph + "</text>");
  });
