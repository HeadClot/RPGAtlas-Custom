/* RPGAtlas — src/editor/map-editor/sample-map-data.ts
   The sample-map library: a dozen hand-crafted starter maps the user can drop
   into any project from the Maps panel (🗺 button). Each map is drawn as ASCII
   art — one character per tile — so the layouts stay readable and diffable.
   This module is dependency-free on purpose: tile references are key names
   resolved through the caller-supplied `T` table (Assets.T in the editor,
   a stub in tests-unit/sample-maps.test.ts, which validates every layout).
   Copyright (C) 2026 RPGAtlas contributors — GPL-3.0-or-later (see LICENSE). */

import type { GameMap, MapEvent } from "../../shared/schema";

/** One legend entry: which tile keys a layout character paints.
 *  `g` = ground layer, `d` = decor layer; either may be omitted. */
export interface SampleTileRef { g?: string; d?: string }

export interface SampleMapDef {
  key: string;    // stable identifier (tests, future references)
  name: string;   // default map name (project content — not translated)
  desc: string;   // one-line, beginner-friendly blurb shown on the card
  music: string;  // built-in theme: town / field / cave / title
  base: string;   // ground tile key painted under "." and under bare decor
  rows: string[]; // the map, one string per row, all the same length
  legend?: Record<string, SampleTileRef>; // per-map additions/overrides
}

/** Characters shared by every sample layout. Lowercase tends to be ground
 *  terrain, uppercase decor; "." is always the map's base ground tile.
 *  Per-map legends may override any of these (e.g. swamp lilies) and use the
 *  digits 1–9 for local combos like "tree on grass" or "house on dirt". */
export const SHARED_LEGEND: Record<string, SampleTileRef> = {
  // ground terrain
  ",": { g: "flowers" }, ";": { g: "tallgrass" }, ":": { g: "dirt" },
  "s": { g: "sand" }, "p": { g: "path" }, "w": { g: "water" },
  "W": { g: "deepwater" }, "n": { g: "snow" }, "i": { g: "ice" },
  "q": { g: "swamp" }, "v": { g: "cavefloor" }, "k": { g: "crystalfloor" },
  "l": { g: "lava" }, "u": { g: "stonefloor" }, "x": { g: "woodfloor" },
  "e": { g: "carpet" }, "z": { g: "checkered" }, "j": { g: "brickfloor" },
  "S": { g: "stairs" }, "_": { g: "bridge" },
  // nature decor
  "t": { d: "tree" }, "P": { d: "pine" }, "T": { d: "snowtree" },
  "b": { d: "bush" }, "r": { d: "rock" }, "f": { d: "fence" },
  "C": { d: "cliff" }, "c": { d: "cactus" }, "d": { d: "deadtree" },
  "M": { d: "mushroom" }, "K": { d: "crystals" }, "L": { d: "lava_rock" },
  "y": { g: "water", d: "waterlily" }, "V": { d: "cavewall" },
  "@": { d: "cobweb" },
  // walls & buildings
  "h": { d: "wall_wood" }, "H": { d: "wall_brick" }, "U": { d: "wall_stone" },
  "R": { g: "dirt", d: "roof_red" }, "B": { g: "dirt", d: "roof_blue" },
  "D": { d: "door" }, "0": { d: "window" },
  // furniture & props
  "a": { d: "chair" }, "A": { d: "table" }, "E": { d: "bed" },
  "F": { d: "shelf" }, "G": { d: "counter" }, "o": { d: "pot" },
  "N": { d: "barrel" }, "X": { d: "crate" }, "%": { d: "bookshelf" },
  "!": { d: "torch" }, "I": { d: "pillar" }, "&": { d: "statue" },
  "*": { d: "flowerpot" }, "Q": { d: "chest" },
};

export const SAMPLE_MAPS: SampleMapDef[] = [
  {
    key: "cottage", name: "Cozy Cottage", music: "town", base: "woodfloor",
    desc: "A snug one-room home — bed, bookshelves, and a table with room to decorate.",
    rows: [
      "hhhh0hh0hhhhhh",
      "hE*xxxxxxx%%Fh",
      "hExxaAAaxxxxFh",
      "hxxxaAAaxxxxxh",
      "hxxxxeexxxxoNh",
      "hxxxxeexxxxoNh",
      "h%xxxxxxxxxxxh",
      "hxxxxxxxxxxxxh",
      "hhhhhhDhhhhhhh",
    ],
  },
  {
    key: "village", name: "Village Square", music: "town", base: "grass",
    desc: "A friendly town square: two houses, a plaza with statues, a pond, and a market corner.",
    legend: {
      "1": { g: "dirt", d: "roof_red" }, "2": { g: "dirt", d: "wall_wood" },
      "3": { g: "dirt", d: "roof_blue" }, "4": { g: "dirt", d: "wall_brick" },
      "5": { g: "dirt", d: "door" }, "6": { g: "dirt", d: "window" },
    },
    rows: [
      "tttttttttttttttttttttt",
      "t,,.11111....33333...t",
      "t...22222....44444..;t",
      "t...26252....46454..,t",
      "t......p........p....t",
      "t......p........p....t",
      "t......pppppppppp....t",
      "t........pp&&pp......t",
      "t........pppppp..f*f.t",
      "t........pppppp......t",
      "t.wwww...........;;;.t",
      "t.wWWw....X.NX...;;;.t",
      "t.wwww.....XN....b...t",
      "t,....b.....,....,,..t",
      "tttttttttt..tttttttttt",
    ],
  },
  {
    key: "cove", name: "Sunny Cove", music: "field", base: "sand",
    desc: "A warm beach with a wooden dock reaching out over the waves.",
    legend: { "1": { g: "grass" }, "2": { g: "grass", d: "tree" } },
    rows: [
      "22221111111111222222",
      "21111111111111111112",
      "111;;11111111;;;1111",
      "....................",
      "...r........b....r..",
      "....................",
      "......r.............",
      "........__..........",
      "wwwwwwww__wwwwwwwwww",
      "wwwwwwww__wwwwwwwwww",
      "wwwwwwww__wwwwwwwwww",
      "wwwwwwwwwwwwwwwwwWWW",
      "wwwwwwwwwwwwwwWWWWWW",
      "WWWWWWWWWWWWWWWWWWWW",
    ],
  },
  {
    key: "forest", name: "Deep Forest Clearing", music: "field", base: "grass",
    desc: "A hidden clearing deep in the woods, with a spring and a winding trail south.",
    rows: [
      "tttttttttttttttttt",
      "tttttt;;;;;;tttttt",
      "ttt;;;,..,;;;;tttt",
      "tt;;..M....;;;;ttt",
      "tt;....ww....;;.tt",
      "tt.....www....;.tt",
      "ttb.....w.....,.tt",
      "tt....,....M....tt",
      "tt.M.....p......tt",
      "ttt;....pp...;;ttt",
      "ttt;;...p..;;;tttt",
      "tttt;;..p..;;ttttt",
      "ttttt;..p..;tttttt",
      "ttttttttpttttttttt",
    ],
  },
  {
    key: "oasis", name: "Desert Oasis", music: "field", base: "sand",
    desc: "A sparkling pool ringed with green — the only water for miles of dunes.",
    legend: { "1": { g: "grass" }, "2": { g: "grass", d: "tree" } },
    rows: [
      "..r......c.....d..",
      "......c.......r...",
      "..c.....121......c",
      ".....11111111.....",
      "..d..111ww111...c.",
      "....111wWWw111....",
      "..c.111wWWw111..r.",
      "....111wwww111....",
      ".r...1121211....d.",
      "......11111.......",
      "...c.....1....c...",
      ".d.....r......r...",
      "....c.......d.....",
    ],
  },
  {
    key: "outpost", name: "Snowy Outpost", music: "town", base: "snow",
    desc: "A lonely cabin in the snow, with a frozen pond and torch-lit door.",
    legend: {
      "1": { g: "dirt", d: "roof_blue" }, "2": { g: "dirt", d: "wall_stone" },
      "5": { g: "dirt", d: "door" }, "6": { g: "dirt", d: "window" },
    },
    rows: [
      "TTT..T....T...TTTT",
      "TT......11111....T",
      "T.......22222.T..T",
      "T..r....26252....T",
      "TT........!p!....T",
      "T....ii....p.....T",
      "T...iiii...p...T.T",
      "T...iiii...p.r...T",
      "T....ii....p.....T",
      "T..........p..T..T",
      "T.fff......p.....T",
      "TT.........p....TT",
      "TTTTTTTTTTT.TTTTTT",
    ],
  },
  {
    key: "crystal", name: "Crystal Cavern", music: "cave", base: "cavefloor",
    desc: "A glittering cave of crystal veins and glowing mushrooms, with stairs leading deeper.",
    rows: [
      "VVVVVVVVVVVVVVVVVV",
      "VV..kk......MVVVVV",
      "V..kkkk..........V",
      "V.kkKkk....VV..M.V",
      "V..kkk....VVVV...V",
      "V...k......VV..K.V",
      "V.M......!.......V",
      "V....KK......kk..V",
      "VV....K.....kkk..V",
      "VVV.........kKk..V",
      "VV...M........k..V",
      "V.............S..V",
      "VVVVVVVVVVVVVVVVVV",
    ],
  },
  {
    key: "lava", name: "Lava Depths", music: "cave", base: "cavefloor",
    desc: "A scorching cavern split by a river of lava — one narrow bridge crosses it.",
    rows: [
      "VVVVVVVVVVVVVVVVVV",
      "V.......lll....L.V",
      "V..r....lll......V",
      "V.......lll..M...V",
      "V....L..llll.....V",
      "V.......llll.....V",
      "V.......___......V",
      "V.......lll......V",
      "V..L....lll...r..V",
      "V.......llll.....V",
      "V.M.....llll..L..V",
      "V.......llll.....V",
      "VVVVVVVVllllVVVVVV",
    ],
  },
  {
    key: "swamp", name: "Murky Swamp", music: "field", base: "dirt",
    desc: "Misty pools, dead trees, and lily pads — perfect for a spooky side quest.",
    legend: { "y": { g: "swamp", d: "waterlily" } },
    rows: [
      "d.;;.....d....;;.d",
      ".;qqq;.....;;..d..",
      ".qqqqq....qqq.....",
      ".qyqqq...qqyqq...d",
      "..qqq....qqqqq;...",
      ".d.q;.....qqq..;;.",
      "......;;...@..d...",
      "..;;.....qqq......",
      ".;qq;...qqyqq..;;.",
      ".qqqq...qqqqq..d..",
      ".qyqq....qqq......",
      "..qq.;;......;;...",
      "d....;;..d......;d",
    ],
  },
  {
    key: "castle", name: "Castle Great Hall", music: "title", base: "stonefloor",
    desc: "A grand throne-room hall with a long carpet, pillars, statues, and torchlight.",
    rows: [
      "UUUUUUUUUUUUUUUUU",
      "U!zzzz&eee&zzzz!U",
      "U.zzzz.eee.zzzz.U",
      "U.I....eee....I.U",
      "U......eee......U",
      "U.I....eee....I.U",
      "U%.....eee.....%U",
      "U.I....eee....I.U",
      "U......eee......U",
      "U.I....eee....I.U",
      "U.Q....eee....Q.U",
      "U!.....eee.....!U",
      "UUUUUUUeDeUUUUUUU",
    ],
  },
  {
    key: "shop", name: "General Store", music: "town", base: "woodfloor",
    desc: "A little shop interior — counter, stocked shelves, and crates in the corner.",
    rows: [
      "hhhh0hhhh0hhhh",
      "hFFFFxxxxFFFFh",
      "hxxxxxxxxxxxxh",
      "hxGGGGGxxxxxNh",
      "hxxxxxxxxxxxNh",
      "hxxxxxxxxxXXXh",
      "hFxxxxxxxxxXXh",
      "hFxxxxxxxxxxoh",
      "hxxxxxxxxxxxxh",
      "hhhhhDhhhhhhhh",
    ],
  },
  {
    key: "pass", name: "Mountain Pass", music: "field", base: "dirt",
    desc: "A switchback trail climbing between cliff terraces, with stairs at each ledge.",
    legend: { "1": { g: "grass" } },
    rows: [
      "CCCCCCCCCSCCCCCCCC",
      "CP11.....p....11PC",
      "C11......p.....r1C",
      "CCCCCCC..S..CCCCCC",
      "C....r...p.......C",
      "C........p...1...C",
      "C..1..ppppp..r...C",
      "C..;..p......1;..C",
      "CCCCC.S..CCCCCCCCC",
      "C.r...p.......P..C",
      "C.....p....r.....C",
      "C.P...p......1;..C",
      "C..1..p...P......C",
      "CCCCCCpCCCCCCCCCCC",
    ],
  },
];

/** Builds a full map object (same shape DataDefaults.newMap produces) from a
 *  sample definition. `T` maps tile key names to tile ids (Assets.T). */
export function buildSampleMap(def: SampleMapDef, id: number, T: Record<string, number>, tilesetId: number): GameMap {
  const height = def.rows.length;
  const width = def.rows[0].length;
  const n = width * height;
  const tile = (key: string): number => {
    const v = T[key];
    if (v == null) throw new Error(`Sample map "${def.key}": unknown tile key "${key}"`);
    return v;
  };
  const legend: Record<string, SampleTileRef> = { ...SHARED_LEGEND, ...(def.legend || {}) };
  const ground = new Array(n).fill(tile(def.base));
  const decor = new Array(n).fill(0);
  for (let y = 0; y < height; y++) {
    const row = def.rows[y];
    if (row.length !== width) throw new Error(`Sample map "${def.key}": row ${y} is ${row.length} wide, expected ${width}`);
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      if (ch === ".") continue;
      const ref = legend[ch];
      if (!ref) throw new Error(`Sample map "${def.key}": no legend entry for "${ch}" (row ${y}, col ${x})`);
      const i = y * width + x;
      if (ref.g) ground[i] = tile(ref.g);
      if (ref.d) decor[i] = tile(ref.d);
    }
  }
  return {
    id, name: def.name, width, height,
    tilesetId,
    music: def.music,
    encounters: { troops: [] as number[], rate: 0 },
    layers: {
      ground, decor,
      decor2: new Array(n).fill(0),
      over: new Array(n).fill(0),
    },
    shadows: new Array(n).fill(0),
    passOv: new Array(n).fill(0),
    heights: new Array(n).fill(0),
    regions: new Array(n).fill(0),
    events: [] as MapEvent[],
  };
}
