// EllipsisLM test runner.
// =====================================================================
// HOW IT WORKS
//
//   index.html is the only source of truth — there is no build step and
//   nothing gets split into modules. To test code that lives inside the
//   inline <script>, this runner:
//
//     1. Reads index.html as plain text.
//     2. Extracts the `const UTILITY = { ... };` block via line markers
//        (start: `        const UTILITY = {`, end: next `        };`).
//     3. Evals that block in a fresh Node `vm` sandbox and pulls out
//        the resulting UTILITY object.
//     4. Runs assertions against UTILITY's methods.
//
//   UTILITY's helpers are pure JS (no DOM, no fetch, no localStorage),
//   so the vm sandbox needs no stubs.
//
// HOW TO RUN
//
//   npm test          (or: node test.js)
//
//   Zero dependencies. Uses Node's built-in `node:test` and `node:assert`.
//
// HOW TO ADD A TEST
//
//   Find the section comment for the helper you're testing (e.g.
//   `── parseSearchQuery ──`) and add a `test('description', () => {...})`
//   alongside the existing ones. Use `deepEq(actual, expected)` for arrays
//   and objects (it strips the vm-sandbox prototype before comparing);
//   use `assert.equal` / `assert.ok` for primitives.
//
//   Discipline: when fixing a bug, write a failing red test first, then
//   the source fix that turns it green. See `.agents/rules/instructions.md`.
//
// WHAT'S NOT TESTED HERE
//
//   - DOM-bound helpers (escapeHTML, safeImageSet, ...)        — need a DOM stub.
//   - Blob / FileReader helpers (base64ToBlob, ...)            — Node lacks these natively.
//   - localStorage / IndexedDB code (DBService, StateManager)  — needs storage stubs.
//   - Provider HTTP code (callOpenRouter, ...)                 — needs fetch mocks.
//   - End-to-end Architect runs                                — would need a headless browser.
//
//   These were skipped intentionally. Adding them later doesn't require
//   redoing this layer — just add a sibling test file or extend this one.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

// Values built inside the vm sandbox have prototypes from a different realm,
// so node:assert/strict's prototype check fails on otherwise-identical objects.
// Round-trip through JSON to compare by structure only.
function deepEq(actual, expected, msg) {
    assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected, msg);
}

const HTML_PATH = path.join(__dirname, 'index.html');
const HTML = fs.readFileSync(HTML_PATH, 'utf8');

// Extract a top-level service block declared as `        const NAME = {` and
// closed by the next line that is exactly `        };` (8-space indent). Every
// service in this file (UTILITY, APIService, StateManager, etc.) follows that
// convention, so the cheap line-anchored close is reliable.
function extractBlock(name) {
    // index.html ships with CRLF line endings; split on either to keep the
    // anchored markers exact.
    const lines = HTML.split(/\r?\n/);
    const start = lines.findIndex(l => l === `        const ${name} = {`);
    if (start === -1) throw new Error(`extractBlock: could not find 'const ${name} = {'`);
    const end = lines.indexOf('        };', start + 1);
    if (end === -1) throw new Error(`extractBlock: could not find close '        };' after ${name}`);
    return lines.slice(start, end + 1).join('\n');
}

function loadUtility() {
    const block = extractBlock('UTILITY');
    // The block declares `const UTILITY = {...};`. Append the bare identifier so
    // vm.runInNewContext returns it as the completion value.
    return vm.runInNewContext(block + '\nUTILITY', {});
}

const UTILITY = loadUtility();

// ─── toStringArray ────────────────────────────────────────────────────────

test('toStringArray: nullish input returns empty array', () => {
    deepEq(UTILITY.toStringArray(null), []);
    deepEq(UTILITY.toStringArray(undefined), []);
});

test('toStringArray: comma string splits and trims', () => {
    deepEq(UTILITY.toStringArray('warrior, dwarf , gruff'), ['warrior', 'dwarf', 'gruff']);
});

test('toStringArray: array of mixed values is cleaned', () => {
    deepEq(UTILITY.toStringArray(['  a', 'b', '', null, 'c ']), ['a', 'b', 'c']);
});

test('toStringArray: bare scalar wraps to single-element array', () => {
    deepEq(UTILITY.toStringArray('solo'), ['solo']);
    deepEq(UTILITY.toStringArray(42), ['42']);
});

test('toStringArray: object input returns empty array (defensive)', () => {
    deepEq(UTILITY.toStringArray({ tags: 'no' }), []);
});

// ─── normalizeStoryShape ──────────────────────────────────────────────────

test('normalizeStoryShape: coerces story.tags string into array', () => {
    const story = { tags: 'fantasy, dwarf' };
    UTILITY.normalizeStoryShape(story);
    deepEq(story.tags, ['fantasy', 'dwarf']);
});

test('normalizeStoryShape: coerces nested character.tags string into array', () => {
    const story = { characters: [{ name: 'Thorne', tags: 'jolly, dwarven' }] };
    UTILITY.normalizeStoryShape(story);
    deepEq(story.characters[0].tags, ['jolly', 'dwarven']);
});

test('normalizeStoryShape: missing array fields default to []', () => {
    const story = {};
    UTILITY.normalizeStoryShape(story);
    for (const k of ['tags', 'characters', 'scenarios', 'static_entries', 'dynamic_entries', 'narratives']) {
        assert.ok(Array.isArray(story[k]), `expected ${k} to be an array`);
    }
});

test('normalizeStoryShape: tolerates null / non-object input without throwing', () => {
    assert.doesNotThrow(() => UTILITY.normalizeStoryShape(null));
    assert.doesNotThrow(() => UTILITY.normalizeStoryShape(undefined));
    assert.doesNotThrow(() => UTILITY.normalizeStoryShape('not a story'));
});

test('normalizeStoryShape: ensures per-character extra_portraits and dynamic_knowledge are arrays', () => {
    const story = { characters: [{ name: 'X' }] };
    UTILITY.normalizeStoryShape(story);
    assert.ok(Array.isArray(story.characters[0].extra_portraits));
    assert.ok(Array.isArray(story.characters[0].dynamic_knowledge));
});

test('normalizeStoryShape: populates default visual settings when missing', () => {
    const story = {
        scenarios: [{ id: 'sc1', name: 'Start' }]
    };
    UTILITY.normalizeStoryShape(story);
    assert.equal(story.font, "'Inter', sans-serif");
    assert.equal(story.chatTextColor, '#cdc6b6');
    assert.equal(story.bubbleOpacity, 0.35);
    assert.equal(story.scenarios[0].prompts.font, "'Inter', sans-serif");
    assert.equal(story.scenarios[0].prompts.bubbleOpacity, 0.35);
});

// ─── extractStructuredHeadings (the case-mismatch bug) ────────────────────

test('extractStructuredHeadings: result is exposed under both original case and lowercase', () => {
    const sample = `### Model Instructions
Speak softly.

### Tags
warrior, dwarf

### Color Hex
#71717a`;
    const r = UTILITY.extractStructuredHeadings(sample, ['Model Instructions', 'Tags', 'Color Hex']);
    assert.equal(r['Model Instructions'], 'Speak softly.');
    assert.equal(r['model instructions'], 'Speak softly.');
    assert.equal(r['Tags'], 'warrior, dwarf');
    assert.equal(r['tags'], 'warrior, dwarf');
    assert.equal(r['Color Hex'], '#71717a');
});

test('extractStructuredHeadings: missing heading returns empty string', () => {
    const r = UTILITY.extractStructuredHeadings('### Tags\na, b', ['Tags', 'Color Hex']);
    assert.equal(r['Color Hex'], '');
    assert.equal(r['color hex'], '');
});

test('extractStructuredHeadings: empty / null input returns empty object', () => {
    deepEq(UTILITY.extractStructuredHeadings('', ['Foo']), {});
    deepEq(UTILITY.extractStructuredHeadings(null, ['Foo']), {});
});

test('extractStructuredHeadings: tolerates bracket-style markup [KEY]', () => {
    // analyzeTurn / character skeleton prompts ask the LLM for `[KEY]` headers
    // rather than `### KEY`. The regex's optional-bracket prefix has to handle both.
    const sample = `[Emotion]
happy

[Location]
The market square

[Stats]
Health|+5`;
    const r = UTILITY.extractStructuredHeadings(sample, ['Emotion', 'Location', 'Stats']);
    assert.equal(r['Emotion'], 'happy');
    assert.equal(r['Location'], 'The market square');
    assert.equal(r['Stats'], 'Health|+5');
    assert.equal(r['emotion'], 'happy', 'lowercase alias must be populated');
});

// ─── extractDelimitedList ─────────────────────────────────────────────────

test('extractDelimitedList: null/empty input returns empty array', () => {
    deepEq(UTILITY.extractDelimitedList(null), []);
    deepEq(UTILITY.extractDelimitedList(''), []);
});

test('extractDelimitedList: parses pipe-delimited rows by keys', () => {
    const text = `- Thorne | Innkeeper | jovial dwarf
- Mira | User | curious traveler`;
    const r = UTILITY.extractDelimitedList(text, '|', ['name', 'role', 'archetype']);
    assert.equal(r.length, 2);
    assert.equal(r[0].name, 'Thorne');
    assert.equal(r[0].role, 'Innkeeper');
    assert.equal(r[0].archetype, 'jovial dwarf');
    assert.equal(r[1].name, 'Mira');
});

test('extractDelimitedList: missing trailing fields default to empty string', () => {
    const r = UTILITY.extractDelimitedList('- Solo', '|', ['name', 'role', 'archetype']);
    assert.equal(r[0].name, 'Solo');
    assert.equal(r[0].role, '');
    assert.equal(r[0].archetype, '');
});

test('extractDelimitedList: bare list (no delimiter) returns trimmed strings', () => {
    const r = UTILITY.extractDelimitedList('- Locations\n- Factions\n- History');
    deepEq(r, ['Locations', 'Factions', 'History']);
});

test('extractDelimitedList: parses unbulleted pipe rows (LLM-followed prompt format)', () => {
    // Several prompts (auto-knowledge, archivist, stat tracker, relationship matrix)
    // ask the LLM for "Title | Content" rows with no bullet markers.
    const text = `Old Mill | A creaking watermill on the edge of town.
Red Guard | The captain's elite unit.`;
    const r = UTILITY.extractDelimitedList(text, '|', ['title', 'content']);
    assert.equal(r.length, 2);
    assert.equal(r[0].title, 'Old Mill');
    assert.equal(r[0].content, 'A creaking watermill on the edge of town.');
    assert.equal(r[1].title, 'Red Guard');
});

test('extractDelimitedList: skips intro/prose lines that lack the delimiter', () => {
    // Intro chatter from the LLM should be filtered when a delimiter is required.
    const text = `Sure! Here are the entries:
Old Mill | A creaking watermill.
Red Guard | The captain's elite unit.`;
    const r = UTILITY.extractDelimitedList(text, '|', ['title', 'content']);
    assert.equal(r.length, 2);
    assert.equal(r[0].title, 'Old Mill');
});

test('extractDelimitedList: comma-separated single line in bare-list mode', () => {
    // The in-story scenario prompt asks the LLM for "comma-separated list of topics"
    // on a single line. Without bullet markers, the old gate dropped everything.
    const r = UTILITY.extractDelimitedList('The Old Mill, The Red Guard, The Great Fire');
    deepEq(r, ['The Old Mill', 'The Red Guard', 'The Great Fire']);
});

test('extractDelimitedList: strips Key: prefixes from each delimited part (production roster format)', () => {
    // The Concept Roster prompt asks the LLM for: `- Name: X | Role: Y | Archetype: Z`.
    // Each delimited part starts with a `Key:` label that the helper must strip.
    const text = `- Name: Thorne | Role: User | Archetype: The Protagonist (a brave dwarf)
- Name: Mira | Role: PrimaryAI | Archetype: The Companion`;
    const r = UTILITY.extractDelimitedList(text, '|', ['name', 'role', 'archetype']);
    assert.equal(r.length, 2);
    assert.equal(r[0].name, 'Thorne');
    assert.equal(r[0].role, 'User');
    assert.equal(r[0].archetype, 'The Protagonist (a brave dwarf)');
    assert.equal(r[1].name, 'Mira');
    assert.equal(r[1].role, 'PrimaryAI');
});

test('extractDelimitedList: stat-row format (name|delta) parses cleanly', () => {
    // analyzeTurn prompt explicitly asks for `<stat_name>|<delta>` rows.
    const r = UTILITY.extractDelimitedList('Health|-5\nMorale|+10', '|', ['name', 'delta']);
    assert.equal(r.length, 2);
    assert.equal(r[0].name, 'Health');
    assert.equal(r[0].delta, '-5');
    assert.equal(r[1].name, 'Morale');
    assert.equal(r[1].delta, '+10');
});

// ─── extractAndParseJSON ──────────────────────────────────────────────────

test('extractAndParseJSON: null/empty input returns null', () => {
    assert.equal(UTILITY.extractAndParseJSON(null), null);
    assert.equal(UTILITY.extractAndParseJSON(''), null);
});

test('extractAndParseJSON: strips ```json fences', () => {
    const r = UTILITY.extractAndParseJSON('```json\n{"name":"x"}\n```');
    deepEq(r, { name: 'x' });
});

test('extractAndParseJSON: recovers from trailing prose', () => {
    const r = UTILITY.extractAndParseJSON('Sure thing! {"ok": true} (let me know if you need more)');
    deepEq(r, { ok: true });
});

test('extractAndParseJSON: tolerates trailing commas', () => {
    const r = UTILITY.extractAndParseJSON('{"a": 1, "b": 2,}');
    deepEq(r, { a: 1, b: 2 });
});

// ─── stripThinking ────────────────────────────────────────────────────────

test('stripThinking: removes <think>...</think> blocks', () => {
    const r = UTILITY.stripThinking('hello <think>internal monologue</think> world');
    assert.equal(r, 'hello  world');
});

test('stripThinking: removes [REASONING]...[/REASONING] blocks', () => {
    const r = UTILITY.stripThinking('foo [REASONING]secret[/REASONING] bar');
    assert.equal(r, 'foo  bar');
});

test('stripThinking: passes through non-strings unchanged', () => {
    assert.equal(UTILITY.stripThinking(null), null);
    assert.equal(UTILITY.stripThinking(undefined), undefined);
});

// ─── hex color math ───────────────────────────────────────────────────────

test('hexToRgba: converts 7-char hex with alpha', () => {
    assert.equal(UTILITY.hexToRgba('#ff8000', 0.5), 'rgba(255,128,0,0.5)');
});

test('hexToRgba: converts 4-char shorthand hex', () => {
    assert.equal(UTILITY.hexToRgba('#abc', 1), 'rgba(170,187,204,1)');
});

test('darkenHex: darkening by 0% returns the same color', () => {
    assert.equal(UTILITY.darkenHex('#808080', 0), '#808080');
});

test('darkenHex: darkening clamps at black for large percentages', () => {
    assert.equal(UTILITY.darkenHex('#000000', 50), '#000000');
});

test('darkenHex: 50% reduces channel values toward zero', () => {
    // 0xff − round(2.55 × 50) = 255 − 127 = 128 = 0x80.
    // (2.55 × 50 is 127.4999… in IEEE-754, not 127.5, so Math.round rounds down.)
    assert.equal(UTILITY.darkenHex('#ffffff', 50), '#808080');
});

// ─── compileTriggerRegex ──────────────────────────────────────────────────

test('compileTriggerRegex: empty keyword returns never-match regex', () => {
    const r = UTILITY.compileTriggerRegex('');
    assert.equal(r.test('anything at all'), false);
});

test('compileTriggerRegex: matches whole word case-insensitively', () => {
    const r = UTILITY.compileTriggerRegex('dragon');
    assert.equal(r.test('A Dragon roars.'), true);
    assert.equal(r.test('DRAGONFRUIT is healthy'), false, 'must not mid-word match');
});

test('compileTriggerRegex: escapes regex specials in the keyword', () => {
    const r = UTILITY.compileTriggerRegex('a.b');
    assert.equal(r.test('a.b'), true);
    assert.equal(r.test('axb'), false, 'literal . must not match arbitrary char');
});

// ─── parseLoreTrigger ─────────────────────────────────────────────────────

test('parseLoreTrigger: empty string returns no groups, zero chance', () => {
    deepEq(UTILITY.parseLoreTrigger(''), { groups: [], chance: 0, chanceOperator: 'OR' });
    deepEq(UTILITY.parseLoreTrigger(null), { groups: [], chance: 0, chanceOperator: 'OR' });
});

test('parseLoreTrigger: comma-separated keywords become OR groups', () => {
    const r = UTILITY.parseLoreTrigger('dragon, sword');
    assert.equal(r.groups.length, 2);
    assert.equal(r.groups[0].type, 'OR');
    deepEq(r.groups[0].keywords, ['dragon']);
    deepEq(r.groups[1].keywords, ['sword']);
});

test('parseLoreTrigger: AND keyword becomes AND group with multiple keywords', () => {
    const r = UTILITY.parseLoreTrigger('dragon AND fire');
    assert.equal(r.groups[0].type, 'AND');
    deepEq(r.groups[0].keywords, ['dragon', 'fire']);
});

test('parseLoreTrigger: XOR with two keywords becomes XOR group', () => {
    const r = UTILITY.parseLoreTrigger('day XOR night');
    assert.equal(r.groups[0].type, 'XOR');
    deepEq(r.groups[0].keywords, ['day', 'night']);
});

test('parseLoreTrigger: extracts standalone chance percentage', () => {
    const r = UTILITY.parseLoreTrigger('dragon, 30%');
    assert.equal(r.chance, 30);
    assert.equal(r.chanceOperator, 'OR');
    // Chance percent is consumed from the trigger string, so the only group is `dragon`.
    assert.equal(r.groups.length, 1);
    deepEq(r.groups[0].keywords, ['dragon']);
});

test('parseLoreTrigger: AND-prefixed chance switches operator', () => {
    const r = UTILITY.parseLoreTrigger('dragon, AND 50%');
    assert.equal(r.chance, 50);
    assert.equal(r.chanceOperator, 'AND');
});

test('parseLoreTrigger: AND/XOR operators are case-insensitive', () => {
    const lower = UTILITY.parseLoreTrigger('dragon and fire');
    assert.equal(lower.groups[0].type, 'AND');
    deepEq(lower.groups[0].keywords, ['dragon', 'fire']);

    const mixed = UTILITY.parseLoreTrigger('day Xor night');
    assert.equal(mixed.groups[0].type, 'XOR');
    deepEq(mixed.groups[0].keywords, ['day', 'night']);
});

test('parseLoreTrigger: chance-prefix `and` is recognized in any case', () => {
    // The chance regex carries the /i flag; lowercase `and 50%` must still flip
    // chanceOperator from default OR to AND. Locks in the case-insensitive contract.
    const r = UTILITY.parseLoreTrigger('dragon, and 50%');
    assert.equal(r.chance, 50);
    assert.equal(r.chanceOperator, 'AND');
});

// ─── testLoreEntries (deterministic with chance=0) ────────────────────────

test('testLoreEntries: triggers entry whose keyword appears in content', () => {
    const entries = [
        { id: 'e1', triggers: 'dragon', content: 'lore about dragons' },
        { id: 'e2', triggers: 'sword', content: 'lore about swords' }
    ];
    const r = UTILITY.testLoreEntries('A red dragon swoops in.', entries);
    assert.equal(r && r.id, 'e1');
});

test('testLoreEntries: returns null when nothing matches and chance is 0', () => {
    const entries = [{ id: 'e1', triggers: 'unicorn', content: '...' }];
    assert.equal(UTILITY.testLoreEntries('A dragon swoops in.', entries), null);
});

test('testLoreEntries: AND group requires all keywords present', () => {
    const entries = [{ id: 'e1', triggers: 'dragon AND fire', content: '...' }];
    assert.equal(UTILITY.testLoreEntries('the dragon roars', entries), null, 'only one of the AND keywords');
    const r = UTILITY.testLoreEntries('the dragon breathes fire', entries);
    assert.equal(r && r.id, 'e1');
});

test('testLoreEntries: triggers GM-style rule mapping with probability and keyword expressions', () => {
    const rule1 = { id: 'r1', triggers: 'stolen, 100%' };
    const r1 = UTILITY.testLoreEntries('I have stolen the key.', [rule1]);
    assert.equal(r1 && r1.id, 'r1');

    const rule2 = { id: 'r2', triggers: '100%' };
    const r2 = UTILITY.testLoreEntries('Any message', [rule2]);
    assert.equal(r2 && r2.id, 'r2');
});

// ─── createDefaultMapGrid ─────────────────────────────────────────────────

test('createDefaultMapGrid: returns an 8x8 grid with empty content', () => {
    const grid = UTILITY.createDefaultMapGrid();
    assert.equal(grid.length, 64);
    assert.equal(grid[0].coords.x, 0);
    assert.equal(grid[0].coords.y, 0);
    assert.equal(grid[63].coords.x, 7);
    assert.equal(grid[63].coords.y, 7);
    assert.equal(grid[0].name, '');
    assert.ok(Array.isArray(grid[0].local_static_entries));
});

// ─── findPath ─────────────────────────────────────────────────────────────

test('findPath: same start and end returns single-cell path', () => {
    const grid = UTILITY.createDefaultMapGrid();
    const path = UTILITY.findPath(grid, { x: 2, y: 2 }, { x: 2, y: 2 });
    assert.equal(path.length, 1);
    assert.equal(path[0].x, 2);
    assert.equal(path[0].y, 2);
});

test('findPath: orthogonal adjacent cells produce length-2 path', () => {
    const grid = UTILITY.createDefaultMapGrid();
    const path = UTILITY.findPath(grid, { x: 0, y: 0 }, { x: 0, y: 1 });
    assert.equal(path.length, 2);
    deepEq(path[0], { x: 0, y: 0 });
    deepEq(path[1], { x: 0, y: 1 });
});

test('findPath: returns Manhattan-distance + 1 length on open grid', () => {
    const grid = UTILITY.createDefaultMapGrid();
    const path = UTILITY.findPath(grid, { x: 0, y: 0 }, { x: 3, y: 4 });
    // Manhattan distance is 7 steps, path includes start cell -> 8 nodes.
    assert.equal(path.length, 8);
});

test('findPath: returns empty array when start coords missing from grid', () => {
    const grid = UTILITY.createDefaultMapGrid();
    deepEq(UTILITY.findPath(grid, { x: 99, y: 99 }, { x: 0, y: 0 }), []);
});

// ─── weightedChoice ───────────────────────────────────────────────────────

test('weightedChoice: empty input returns null', () => {
    assert.equal(UTILITY.weightedChoice([], []), null);
});

test('weightedChoice: mismatched lengths returns null', () => {
    assert.equal(UTILITY.weightedChoice(['a', 'b'], [1]), null);
});

test('weightedChoice: single-element list always returns that element', () => {
    assert.equal(UTILITY.weightedChoice(['only'], [1]), 'only');
});

test('weightedChoice: zero total weight still returns one of the items', () => {
    const out = UTILITY.weightedChoice(['a', 'b', 'c'], [0, 0, 0]);
    assert.ok(['a', 'b', 'c'].includes(out));
});

// ─── parseSearchQuery ─────────────────────────────────────────────────────

test('parseSearchQuery: empty query reports isEmpty=true', () => {
    deepEq(UTILITY.parseSearchQuery(''), { isEmpty: true });
    deepEq(UTILITY.parseSearchQuery('   '), { isEmpty: true });
    deepEq(UTILITY.parseSearchQuery(null), { isEmpty: true });
});

test('parseSearchQuery: regex form /pattern/flags', () => {
    const r = UTILITY.parseSearchQuery('/dragon.*fire/i');
    assert.equal(r.isRegex, true);
    assert.ok(r.regex.test('dragon breathes fire'));
});

test('parseSearchQuery: invalid regex falls back to text-token parsing', () => {
    const r = UTILITY.parseSearchQuery('/[unclosed/');
    assert.equal(r.isRegex, false);
    assert.ok(Array.isArray(r.tokens));
});

test('parseSearchQuery: tokenizes negation, phrases, and field prefixes', () => {
    const r = UTILITY.parseSearchQuery('dragon -boring "fire breath" tag:adventure');
    assert.equal(r.isRegex, false);
    deepEq(r.tokens, [
        { text: 'dragon',     isNegative: false, isPhrase: false, field: null  },
        { text: 'boring',     isNegative: true,  isPhrase: false, field: null  },
        { text: 'fire breath', isNegative: false, isPhrase: true, field: null  },
        { text: 'adventure',  isNegative: false, isPhrase: false, field: 'tag' }
    ]);
});

// ─── matchStory ───────────────────────────────────────────────────────────

test('matchStory: empty query matches every story', () => {
    const story = { id: '1', name: 'Test', search_index: 'whatever' };
    assert.equal(UTILITY.matchStory(story, { isEmpty: true }), true);
});

test('matchStory: regex query tests against search_index then name', () => {
    const story = { id: '1', name: 'Dragon Tale', search_index: '' };
    const q = UTILITY.parseSearchQuery('/dragon/i');
    assert.equal(UTILITY.matchStory(story, q), true);
});

test('matchStory: regex with global flag must work on every story (no lastIndex carryover)', () => {
    // /pattern/g sets lastIndex on RegExp.prototype.test; reusing the same
    // regex across stories without resetting causes stateful false negatives.
    const stories = [
        { id: '1', name: 'A', search_index: 'dragon' },
        { id: '2', name: 'B', search_index: 'dragon' },
        { id: '3', name: 'C', search_index: 'dragon' }
    ];
    const q = UTILITY.parseSearchQuery('/dragon/g');
    for (const s of stories) {
        assert.equal(UTILITY.matchStory(s, q), true, `story ${s.id} should match`);
    }
});

test('matchStory: positive token must appear in search_index', () => {
    const story = { id: '1', name: 'Tale', search_index: 'a story about a dragon' };
    const q = UTILITY.parseSearchQuery('dragon');
    assert.equal(UTILITY.matchStory(story, q), true);
    const q2 = UTILITY.parseSearchQuery('elephant');
    assert.equal(UTILITY.matchStory(story, q2), false);
});

test('matchStory: negative token excludes stories containing it', () => {
    const story = { id: '1', name: 'Tale', search_index: 'boring dragon story' };
    const q = UTILITY.parseSearchQuery('-boring');
    assert.equal(UTILITY.matchStory(story, q), false);
});

test('matchStory: tag: field matches story tags and character tags', () => {
    const story = {
        id: '1',
        name: 'Tale',
        tags: ['epic'],
        characters: [{ tags: ['mage'] }],
        search_index: ''
    };
    assert.equal(UTILITY.matchStory(story, UTILITY.parseSearchQuery('tag:epic')), true);
    assert.equal(UTILITY.matchStory(story, UTILITY.parseSearchQuery('tag:mage')), true);
    assert.equal(UTILITY.matchStory(story, UTILITY.parseSearchQuery('tag:noir')), false);
});

test('matchStory: character: field matches character names', () => {
    const story = { id: '1', name: 'X', characters: [{ name: 'Thorne' }, { name: 'Mira' }], search_index: '' };
    assert.equal(UTILITY.matchStory(story, UTILITY.parseSearchQuery('char:thorne')), true);
    assert.equal(UTILITY.matchStory(story, UTILITY.parseSearchQuery('char:zog')), false);
});

// ─── estimateTokens ───────────────────────────────────────────────────────

test('estimateTokens: returns 0 for empty or null input', () => {
    assert.equal(UTILITY.estimateTokens(''), 0);
    assert.equal(UTILITY.estimateTokens(null), 0);
    assert.equal(UTILITY.estimateTokens(undefined), 0);
});

test('estimateTokens: approximates word tokens correctly', () => {
    assert.equal(UTILITY.estimateTokens('hello world test'), 4);
    assert.equal(UTILITY.estimateTokens('a'), 2);
});

// ─── truncateShortDescription ─────────────────────────────────────────────

test('truncateShortDescription: returns empty string for null / empty input', () => {
    assert.equal(UTILITY.truncateShortDescription(''), '');
    assert.equal(UTILITY.truncateShortDescription(null), '');
    assert.equal(UTILITY.truncateShortDescription(undefined), '');
});

test('truncateShortDescription: extracts first sentence when short enough', () => {
    const result = UTILITY.truncateShortDescription('A brave hero. Also a poet.');
    assert.equal(result, 'A brave hero.');
});

test('truncateShortDescription: works with exclamation and question marks', () => {
    const excl = UTILITY.truncateShortDescription('What a twist! More story here.');
    assert.equal(excl, 'What a twist!');
    const quest = UTILITY.truncateShortDescription('Who goes there? Nobody knows.');
    assert.equal(quest, 'Who goes there?');
});

test('truncateShortDescription: handles period-less descriptions without bloating (key bug regression)', () => {
    // This is the exact scenario that caused the bloat bug: a long description
    // with no periods means .split('.')[0] returns the entire string.
    const longNoPeriods = 'A mysterious wandering adventurer\nDrawn to the crossroads by ancient power\nSeeking the fragments of a shattered crown across Aethermoor';
    const result = UTILITY.truncateShortDescription(longNoPeriods);
    // Must be bounded — old code returned the full ~130-char string as-is (plus a trailing ".")
    assert.ok(result.length <= 165, `Expected <= 165 chars, got ${result.length}: "${result}"`);
});

test('truncateShortDescription: hard-truncates with ellipsis when no sentence boundary found before maxLen', () => {
    // 200 chars of text with no punctuation
    const noPunct = 'abcdefghij '.repeat(20).trim(); // 209 chars
    const result = UTILITY.truncateShortDescription(noPunct, 160);
    assert.ok(result.endsWith('...'), `Expected ellipsis, got: "${result}"`);
    assert.ok(result.length <= 164, `Expected <= 164 chars, got ${result.length}`);
});

test('truncateShortDescription: text shorter than maxLen is returned as-is when no sentence boundary', () => {
    const short = 'A witty rogue without punctuation';
    const result = UTILITY.truncateShortDescription(short);
    assert.equal(result, short);
});

test('truncateShortDescription: first sentence over maxLen falls back to hard truncation', () => {
    // A single very long sentence (>160 chars) ending in a period
    const longSentence = 'A ' + 'very '.repeat(40) + 'long sentence.'; // ~202 chars + period
    const result = UTILITY.truncateShortDescription(longSentence, 160);
    // Cannot end with just the long sentence - must be truncated
    assert.ok(result.length <= 164, `Expected <= 164 chars, got ${result.length}`);
    assert.ok(result.endsWith('...'), `Expected ellipsis, got: "${result}"`);
});

// ─── sanitizeEvolvedPersona ──────────────────────────────────────────────────

test('sanitizeEvolvedPersona: returns null for nullish/empty/too short/no change input', () => {
    assert.equal(UTILITY.sanitizeEvolvedPersona(null), null);
    assert.equal(UTILITY.sanitizeEvolvedPersona(undefined), null);
    assert.equal(UTILITY.sanitizeEvolvedPersona(''), null);
    assert.equal(UTILITY.sanitizeEvolvedPersona('  '), null);
    assert.equal(UTILITY.sanitizeEvolvedPersona('Short'), null); // too short
    assert.equal(UTILITY.sanitizeEvolvedPersona('No major changes.'), null);
    assert.equal(UTILITY.sanitizeEvolvedPersona('Original persona unchanged.'), null);
    assert.equal(UTILITY.sanitizeEvolvedPersona('No changes detected.'), null);
    assert.equal(UTILITY.sanitizeEvolvedPersona('null'), null);
});

test('sanitizeEvolvedPersona: returns clean persona unmodified when no preambles exist', () => {
    const validPersona = 'Pac is a middle-aged man with brown hair and brown eyes. He is kind, smart, and has a witty sense of humor.';
    assert.equal(UTILITY.sanitizeEvolvedPersona(validPersona), validPersona);
});

test('sanitizeEvolvedPersona: strips intro preambles and ends with colon', () => {
    const rawInput = 'Here is the updated persona:\nPac is a middle-aged man with brown hair. He is smart.';
    const expected = 'Pac is a middle-aged man with brown hair. He is smart.';
    assert.equal(UTILITY.sanitizeEvolvedPersona(rawInput), expected);
});

test('sanitizeEvolvedPersona: strips outro postambles', () => {
    const rawInput = 'Pac is a middle-aged man with brown hair. He is smart.\nHope this updated persona helps let me know!';
    const expected = 'Pac is a middle-aged man with brown hair. He is smart.';
    assert.equal(UTILITY.sanitizeEvolvedPersona(rawInput), expected);
});

test('sanitizeEvolvedPersona: discards persona if length exceeds 2000 characters', () => {
    const longPersona = 'Pac is a dad. '.repeat(200); // 2800 characters
    assert.equal(UTILITY.sanitizeEvolvedPersona(longPersona), null);
});

test('sanitizeEvolvedPersona: discards persona if it contains multiple dialogue transcript lines', () => {
    const transcriptPersona = 'Pac: "Hello there."\nUser: "Hi, Pac."\nPac is a middle-aged man with brown hair.';
    assert.equal(UTILITY.sanitizeEvolvedPersona(transcriptPersona, ['Pac']), null);
});

// ─── parseLorebook & exportLorebook ──────────────────────────────────────────

test('parseLorebook: nullish/invalid input returns empty entries', () => {
    deepEq(UTILITY.parseLorebook(null), { static_entries: [], dynamic_entries: [] });
    deepEq(UTILITY.parseLorebook(''), { static_entries: [], dynamic_entries: [] });
    deepEq(UTILITY.parseLorebook('invalid json'), { static_entries: [], dynamic_entries: [] });
    deepEq(UTILITY.parseLorebook('{}'), { static_entries: [], dynamic_entries: [] });
});

test('parseLorebook: parses flat array of entries', () => {
    const json = JSON.stringify([
        { comment: "Static 1", content: "Static content", constant: true, order: 10 },
        { comment: "Dynamic 1", content: "Dynamic content", constant: false, key: ["dwarf", "gimli"], order: 5 }
    ]);
    const res = UTILITY.parseLorebook(json);
    assert.equal(res.static_entries.length, 1);
    assert.equal(res.dynamic_entries.length, 1);
    
    // Dynamic 1 has lower order (5) than Static 1 (10)
    // Wait, let's verify if they are processed in order.
    assert.equal(res.dynamic_entries[0].title, "Dynamic 1");
    assert.equal(res.dynamic_entries[0].triggers, "dwarf, gimli");
    deepEq(res.dynamic_entries[0].content_fields, ["Dynamic content"]);
    
    assert.equal(res.static_entries[0].title, "Static 1");
    assert.equal(res.static_entries[0].content, "Static content");
});

test('parseLorebook: parses SillyTavern schema and maps probability', () => {
    const json = JSON.stringify({
        entries: {
            "0": { comment: "Elves", content: "Elf lore", constant: false, keys: "elf, legolas", probability: 50, order: 1 },
            "1": { comment: "Dwarves", content: "Dwarf lore", constant: false, key: ["dwarf"], chance: 25, order: 2 },
            "2": { comment: "World", content: "World lore", constant: true, order: 0 }
        }
    });
    const res = UTILITY.parseLorebook(json);
    assert.equal(res.static_entries.length, 1);
    assert.equal(res.dynamic_entries.length, 2);

    assert.equal(res.static_entries[0].title, "World");
    assert.equal(res.static_entries[0].content, "World lore");

    // Dynamic entries are sorted by order: Elves (1) then Dwarves (2)
    assert.equal(res.dynamic_entries[0].title, "Elves");
    assert.equal(res.dynamic_entries[0].triggers, "elf, legolas, AND 50%");
    
    assert.equal(res.dynamic_entries[1].title, "Dwarves");
    assert.equal(res.dynamic_entries[1].triggers, "dwarf, AND 25%");
});

test('parseLorebook: parses Chub.ai character_book schema', () => {
    const json = JSON.stringify({
        character_book: {
            entries: [
                { displayName: "Gimli", content: "A dwarf warrior", constant: false, key: "gimli", order: 1 }
            ]
        }
    });
    const res = UTILITY.parseLorebook(json);
    assert.equal(res.dynamic_entries.length, 1);
    assert.equal(res.dynamic_entries[0].title, "Gimli");
    assert.equal(res.dynamic_entries[0].triggers, "gimli");
    deepEq(res.dynamic_entries[0].content_fields, ["A dwarf warrior"]);
});

test('exportLorebook: exports static and dynamic entries to SillyTavern format', () => {
    const statics = [
        { title: "Static Lore", content: "Always active info" }
    ];
    const dynamics = [
        { title: "Dynamic Lore", triggers: "dwarf, AND 75%", content_fields: ["Triggered info"] }
    ];

    const jsonStr = UTILITY.exportLorebook(statics, dynamics);
    const parsed = JSON.parse(jsonStr);

    assert.ok(parsed.entries);
    const entries = Object.values(parsed.entries);
    assert.equal(entries.length, 2);

    // Static Entry
    const stEntry = entries.find(e => e.constant === true);
    assert.ok(stEntry);
    assert.equal(stEntry.comment, "Static Lore");
    assert.equal(stEntry.content, "Always active info");
    assert.equal(stEntry.probability, 100);

    // Dynamic Entry
    const dyEntry = entries.find(e => e.constant === false);
    assert.ok(dyEntry);
    assert.equal(dyEntry.comment, "Dynamic Lore");
    assert.equal(dyEntry.content, "Triggered info");
    assert.deepEqual(dyEntry.key, ["dwarf"]);
    assert.equal(dyEntry.probability, 75);
});

// ─── tokenizeHtml ───────────────────────────────────────────────────────────

test('tokenizeHtml: correctly splits tags, entities, and characters', () => {
    const html = 'Hello <b>world!</b> &amp; standard';
    const tokens = UTILITY.tokenizeHtml(html);
    const expected = [
        { type: 'text', value: 'H' },
        { type: 'text', value: 'e' },
        { type: 'text', value: 'l' },
        { type: 'text', value: 'l' },
        { type: 'text', value: 'o' },
        { type: 'text', value: ' ' },
        { type: 'tag', value: '<b>' },
        { type: 'text', value: 'w' },
        { type: 'text', value: 'o' },
        { type: 'text', value: 'r' },
        { type: 'text', value: 'l' },
        { type: 'text', value: 'd' },
        { type: 'text', value: '!' },
        { type: 'tag', value: '</b>' },
        { type: 'text', value: ' ' },
        { type: 'entity', value: '&amp;' },
        { type: 'text', value: ' ' },
        { type: 'text', value: 's' },
        { type: 'text', value: 't' },
        { type: 'text', value: 'a' },
        { type: 'text', value: 'n' },
        { type: 'text', value: 'd' },
        { type: 'text', value: 'a' },
        { type: 'text', value: 'r' },
        { type: 'text', value: 'd' }
    ];
    deepEq(tokens, expected);
});

test('tokenizeHtml: handles empty/nullish input', () => {
    deepEq(UTILITY.tokenizeHtml(null), []);
    deepEq(UTILITY.tokenizeHtml(''), []);
});

test('tokenizeHtml: handles malformed tags and entities', () => {
    deepEq(UTILITY.tokenizeHtml('<b text'), [{ type: 'text', value: '<' }, { type: 'text', value: 'b' }, { type: 'text', value: ' ' }, { type: 'text', value: 't' }, { type: 'text', value: 'e' }, { type: 'text', value: 'x' }, { type: 'text', value: 't' }]);
    deepEq(UTILITY.tokenizeHtml('&amp text'), [{ type: 'text', value: '&' }, { type: 'text', value: 'a' }, { type: 'text', value: 'm' }, { type: 'text', value: 'p' }, { type: 'text', value: ' ' }, { type: 'text', value: 't' }, { type: 'text', value: 'e' }, { type: 'text', value: 'x' }, { type: 'text', value: 't' }]);
});

// ─── parseStateUpdateString & parseAndStripStateIndicators ───────────────────

test('parseStateUpdateString: parses resource changes', () => {
    deepEq(UTILITY.parseStateUpdateString('+Rusted Key'), { type: 'resource', name: 'Rusted Key', change: 1 });
    deepEq(UTILITY.parseStateUpdateString('+10 Gold'), { type: 'resource', name: 'Gold', change: 10 });
    deepEq(UTILITY.parseStateUpdateString('-5 Iron Ore'), { type: 'resource', name: 'Iron Ore', change: -5 });
    deepEq(UTILITY.parseStateUpdateString('-Silver'), { type: 'resource', name: 'Silver', change: -1 });
});

test('parseStateUpdateString: parses quest actions', () => {
    deepEq(UTILITY.parseStateUpdateString('Quest Complete: Escape the Dungeon'), { type: 'quest', title: 'Escape the Dungeon', status: 'completed', objective: '', isUpdate: false });
    deepEq(UTILITY.parseStateUpdateString('Quest Update: Escape the Dungeon (Objective: Find exit)'), { type: 'quest', title: 'Escape the Dungeon', status: 'active', objective: 'Find exit', isUpdate: true });
    deepEq(UTILITY.parseStateUpdateString('Quest fail: Escape the Dungeon'), { type: 'quest', title: 'Escape the Dungeon', status: 'failed', objective: '', isUpdate: false });
    deepEq(UTILITY.parseStateUpdateString('Quest start: Escape the Dungeon (assigned: Marcus)'), { type: 'quest', title: 'Escape the Dungeon', status: 'active', objective: '', characterName: 'Marcus', isUpdate: false });
    deepEq(UTILITY.parseStateUpdateString('Quest Update: Escape the Dungeon (assigned: Marcus) (Objective: Find exit)'), { type: 'quest', title: 'Escape the Dungeon', status: 'active', objective: 'Find exit', characterName: 'Marcus', isUpdate: true });
});

test('parseStateUpdateString: parses relationship changes', () => {
    deepEq(UTILITY.parseStateUpdateString('Relationship: Alice +5'), { type: 'relationship', charName: 'Alice', track: 'Affection', changeVal: 5, isRelative: true });
    deepEq(UTILITY.parseStateUpdateString('Relationship: Alice Affection +10%'), { type: 'relationship', charName: 'Alice', track: 'Affection', changeVal: 10, isRelative: true });
    deepEq(UTILITY.parseStateUpdateString('Relationship: Alice attraction 75'), { type: 'relationship', charName: 'Alice', track: 'attraction', changeVal: 75, isRelative: false });
});

test('parseAndStripStateIndicators: strips tags and returns clean text and changes', () => {
    const text = 'You found a key! [STATE: +Rusted Key] Good job.';
    const result = UTILITY.parseAndStripStateIndicators(text);
    assert.equal(result.cleanedText, 'You found a key!  Good job.');
    assert.equal(result.changes.length, 1);
    deepEq(result.changes[0], { type: 'resource', name: 'Rusted Key', change: 1 });
});

// ─── parseGMEvaluationsXML ───────────────────────────────────────────────────

test('parseGMEvaluationsXML: parses valid rule evaluations and proposals from XML', () => {
    const xml = `
    <evaluation>
        <rule_id>rule-123</rule_id>
        <rule_name>Weight Limit Check</rule_name>
        <status>triggered</status>
        <description>The character is carrying too many heavy metal bars, exceeding the 50kg limit.</description>
        <consequence>The character becomes encumbered, slowing their movement speed.</consequence>
        <proposals>
            <resource name="Gold" delta="-10" />
            <character_stat character_name="Pac" stat="speed" value="slow" />
            <relationship character_a="Pac" character_b="Gimli" delta="-5" />
            <narration>Pac groans under the heavy load as the gold slips from his pack.</narration>
        </proposals>
    </evaluation>
    `;
    const res = UTILITY.parseGMEvaluationsXML(xml);
    assert.equal(res.length, 1);
    assert.equal(res[0].rule_id, 'rule-123');
    assert.equal(res[0].rule_name, 'Weight Limit Check');
    assert.equal(res[0].status, 'triggered');
    assert.equal(res[0].description, 'The character is carrying too many heavy metal bars, exceeding the 50kg limit.');
    assert.equal(res[0].consequence, 'The character becomes encumbered, slowing their movement speed.');
    
    const prop = res[0].proposals;
    assert.ok(prop);
    deepEq(prop.resources, [{ name: 'Gold', delta: -10 }]);
    deepEq(prop.character_stats, [{ character_name: 'Pac', stat: 'speed', value: 'slow' }]);
    deepEq(prop.relationships, [{ character_a: 'Pac', character_b: 'Gimli', delta: -5 }]);
    assert.equal(prop.narration, 'Pac groans under the heavy load as the gold slips from his pack.');
});

test('parseGMEvaluationsXML: returns empty array for null/empty/invalid input', () => {
    deepEq(UTILITY.parseGMEvaluationsXML(null), []);
    deepEq(UTILITY.parseGMEvaluationsXML(''), []);
    deepEq(UTILITY.parseGMEvaluationsXML('not xml at all'), []);
});

test('parseInventoryLine: parses various formats', () => {
    deepEq(UTILITY.parseInventoryLine('Gold|10'), { name: 'Gold', delta: 10 });
    deepEq(UTILITY.parseInventoryLine('-1 Key'), { name: 'Key', delta: -1 });
    deepEq(UTILITY.parseInventoryLine('+Potion of Healing'), { name: 'Potion of Healing', delta: 1 });
    deepEq(UTILITY.parseInventoryLine('Iron Sword -1'), { name: 'Iron Sword', delta: -1 });
    assert.equal(UTILITY.parseInventoryLine('none'), null);
});

test('parseQuestLine: parses various formats', () => {
    deepEq(UTILITY.parseQuestLine('start|Find Thorne|Go to the inn'), { action: 'start', title: 'Find Thorne', objective: 'Go to the inn' });
    deepEq(UTILITY.parseQuestLine('complete|Find Thorne'), { action: 'complete', title: 'Find Thorne', objective: '' });
    deepEq(UTILITY.parseQuestLine('update: Escape the Dungeon (Objective: Find the cell key)'), { action: 'update', title: 'Escape the Dungeon', objective: 'Find the cell key' });
    deepEq(UTILITY.parseQuestLine('complete: Escape the Dungeon'), { action: 'complete', title: 'Escape the Dungeon', objective: '' });
    // Assigned character parsing formats
    deepEq(UTILITY.parseQuestLine('start|Marcus|Find Thorne|Go to the inn'), { action: 'start', characterName: 'Marcus', title: 'Find Thorne', objective: 'Go to the inn' });
    deepEq(UTILITY.parseQuestLine('complete|Marcus|Find Thorne'), { action: 'complete', characterName: 'Marcus', title: 'Find Thorne', objective: '' });
    deepEq(UTILITY.parseQuestLine('start: Escape the Dungeon (assigned: Marcus)'), { action: 'start', characterName: 'Marcus', title: 'Escape the Dungeon', objective: '' });
    deepEq(UTILITY.parseQuestLine('update: Escape the Dungeon (assigned: Marcus) (Objective: Find exit)'), { action: 'update', characterName: 'Marcus', title: 'Escape the Dungeon', objective: 'Find exit' });
});

test('parseRelationshipLine: parses various formats', () => {
    deepEq(UTILITY.parseRelationshipLine('Thorne|Affection|+5'), { charName: 'Thorne', track: 'Affection', changeVal: 5 });
    deepEq(UTILITY.parseRelationshipLine('Thorne standing +10%'), { charName: 'Thorne', track: 'standing', changeVal: 10 });
    deepEq(UTILITY.parseRelationshipLine('Thorne: +5'), { charName: 'Thorne', track: 'Affection', changeVal: 5 });
});

test('parseStatLine: parses various formats', () => {
    deepEq(UTILITY.parseStatLine('Thorne|Health|-5'), { charName: 'Thorne', name: 'Health', delta: -5 });
    deepEq(UTILITY.parseStatLine('Thorne: Health -5'), { charName: 'Thorne', name: 'Health', delta: -5 });
    deepEq(UTILITY.parseStatLine('Health -5'), { charName: '', name: 'Health', delta: -5 });
});

// ─── getEntryCategory & cleanFactContent ─────────────────────────────────────

test('getEntryCategory: classifies titles correctly', () => {
    assert.equal(UTILITY.getEntryCategory('[Event] Arrival in Town'), 'event');
    assert.equal(UTILITY.getEntryCategory('Character: Alistair'), 'character');
    assert.equal(UTILITY.getEntryCategory('Item: Healing Potion'), 'item');
    assert.equal(UTILITY.getEntryCategory('World: Whispering Woods'), 'world');
    assert.equal(UTILITY.getEntryCategory('Relationship: Alistair & Elara'), 'relationship');
    assert.equal(UTILITY.getEntryCategory('The Whispering Woods (World)'), 'world');
    assert.equal(UTILITY.getEntryCategory('Alistair\'s Sword'), 'other');
});

test('cleanFactContent: strips category prefixes and trailing annotations', () => {
    assert.equal(UTILITY.cleanFactContent('Character: Pac is a wizard.'), 'Pac is a wizard.');
    assert.equal(UTILITY.cleanFactContent('Event details: Arrival in town.'), 'Arrival in town.');
    assert.equal(UTILITY.cleanFactContent('He is nice. (Character Details)'), 'He is nice.');
    assert.equal(UTILITY.cleanFactContent('She is happy (Relationship Update)'), 'She is happy');
    assert.equal(UTILITY.cleanFactContent('- Pac is a wizard. -'), 'Pac is a wizard.');
});

// ─── migrateGameState ────────────────────────────────────────────────────────
test('migrateGameState: handles nullish/empty/invalid input gracefully', () => {
    const emptyGs = UTILITY.migrateGameState(null);
    deepEq(emptyGs.resources, []);
    deepEq(emptyGs.relationships, []);
    deepEq(emptyGs.journal, []);

    const emptyObj = UTILITY.migrateGameState({});
    deepEq(emptyObj.resources, []);
    deepEq(emptyObj.relationships, []);
    deepEq(emptyObj.journal, []);
});

test('migrateGameState: migrates legacy simple string resources and journal entries', () => {
    const legacyGs = {
        resources: ['Rusted Key', 'Gold Coin'],
        journal: ['Escape the dungeon', 'Find Thorne'],
        relationships: []
    };
    const migrated = UTILITY.migrateGameState(legacyGs);
    assert.equal(migrated.resources.length, 2);
    assert.equal(migrated.resources[0].name, 'Rusted Key');
    assert.equal(migrated.resources[0].value, 1);
    assert.equal(migrated.resources[0].type, 'Misc');
    assert.equal(migrated.resources[0].rarity, 'Common');

    assert.equal(migrated.journal.length, 2);
    assert.equal(migrated.journal[0].title, 'Escape the dungeon');
    assert.equal(migrated.journal[0].objective, 'Escape the dungeon');
    assert.equal(migrated.journal[0].status, 'active');
});

test('migrateGameState: migrates/retains existing rich fields, setting default values', () => {
    const rawGs = {
        resources: [
            { name: 'Excalibur', value: 1, description: 'Legendary sword', type: 'Weapon', rarity: 'Legendary' }
        ],
        journal: [
            { title: 'Slay the Dragon', status: 'completed', objective: 'Strike down the beast', objectives: [{ text: 'Locate lair', status: 'completed' }] }
        ],
        relationships: [
            { characterName: 'Gimli', value: 75, track: 'Trust', stance: 'Loyal companion' }
        ]
    };
    const migrated = UTILITY.migrateGameState(rawGs);
    
    // Check Excalibur
    assert.equal(migrated.resources[0].name, 'Excalibur');
    assert.equal(migrated.resources[0].rarity, 'Legendary');
    assert.ok(migrated.resources[0].id);

    // Check Slay the Dragon
    assert.equal(migrated.journal[0].status, 'completed');
    assert.equal(migrated.journal[0].objectives[0].text, 'Locate lair');

    // Check Gimli
    assert.equal(migrated.relationships[0].characterName, 'Gimli');
    assert.equal(migrated.relationships[0].track, 'Trust');
    assert.equal(migrated.relationships[0].stance, 'Loyal companion');
    deepEq(migrated.relationships[0].history, []);
});

test('getDefaultSystemPrompts: includes prompt_adjacent_locations_gen default value', () => {
    const prompts = UTILITY.getDefaultSystemPrompts();
    assert.ok(prompts.prompt_adjacent_locations_gen);
    assert.ok(prompts.prompt_adjacent_locations_gen.includes('{target_coords}'));
    assert.ok(prompts.prompt_adjacent_locations_gen.includes('{surrounding_locations}'));
});

// ─── parseJournalExtractions ──────────────────────────────────────────

test('parseJournalExtractions: empty/null input returns empty array', () => {
    deepEq(UTILITY.parseJournalExtractions(''), []);
    deepEq(UTILITY.parseJournalExtractions(null), []);
});

test('parseJournalExtractions: parses plot and reflection lines correctly', () => {
    const text = `
    [PLOT] The group entered the ancient ruins.
    [REFLECTION: Arthur] Arthur felt a deep sense of dread.
    [PLOT] They discovered a glowing magical artifact.
    [REFLECTION: Merlin] Merlin was fascinated by the artifact's ancient runes.
    [INVALID] Some invalid line that should be ignored.
    `;
    const expected = [
        { type: 'plot', content: 'The group entered the ancient ruins.' },
        { type: 'reflection', character_name: 'Arthur', content: 'Arthur felt a deep sense of dread.' },
        { type: 'plot', content: 'They discovered a glowing magical artifact.' },
        { type: 'reflection', character_name: 'Merlin', content: "Merlin was fascinated by the artifact's ancient runes." }
    ];
    deepEq(UTILITY.parseJournalExtractions(text), expected);
});

test('index.html lookbehind assertions check: ensures no (?<= or (?<! exist in index.html', () => {
    const htmlText = fs.readFileSync(HTML_PATH, 'utf8');
    const lookbehindRegex = /\(\?<=|\(\?<!/g;
    const matches = [];
    let match;
    while ((match = lookbehindRegex.exec(htmlText)) !== null) {
        const charIndex = match.index;
        const linesBefore = htmlText.substring(0, charIndex).split('\n');
        const lineNum = linesBefore.length;
        const lineContent = htmlText.split('\n')[lineNum - 1].trim();
        matches.push(`Line ${lineNum}: ${lineContent}`);
    }
    assert.deepEqual(matches, [], `Found lookbehind assertions in index.html:\n${matches.join('\n')}`);
});

// ─── AutoBackup Helpers ──────────────────────────────────────────────────

test('buildBackupPayload: builds structured payload from arrays', () => {
    const stories = [{ id: 's1', title: 'Test Story' }];
    const nars = [{ id: 'n1', title: 'Test Narrative' }];
    const folders = [{ id: 'f1', name: 'Test Folder' }];
    const payload = UTILITY.buildBackupPayload(stories, nars, folders, '2.0');

    assert.equal(payload.version, '2.0');
    assert.equal(payload.storiesCount, 1);
    assert.equal(payload.narrativesCount, 1);
    assert.equal(payload.foldersCount, 1);
    assert.ok(payload.timestamp);
});

test('validateBackupData: validates structure and detects empty state', () => {
    const invalid = UTILITY.validateBackupData(null);
    assert.equal(invalid.valid, false);

    const empty = UTILITY.validateBackupData({ stories: [], narratives: [] });
    assert.equal(empty.valid, false);

    const valid = UTILITY.validateBackupData({ stories: [{ id: 's1' }], narratives: [] });
    assert.equal(valid.valid, true);
    assert.equal(valid.storiesCount, 1);
});

test('sanitizeBackupForLocalStorage: strips image properties and prunes large chat histories', () => {
    const payload = {
        stories: [{ id: 's1', characterImages: { a: 'blob' } }],
        narratives: [{ id: 'n1', chat_history: Array(100).fill({ role: 'user', content: 'hello' }) }]
    };
    const sanitized = UTILITY.sanitizeBackupForLocalStorage(payload, 500);
    assert.ok(sanitized);
    assert.equal(sanitized.stories[0].characterImages, undefined);
    assert.ok(sanitized.narratives[0].chat_history.length <= 50);
});

test('isBackupNewerOrRicher: compares backup vs current state correctly', () => {
    const backup = {
        timestamp: new Date().toISOString(),
        stories: [{ id: 's1' }],
        narratives: [{ id: 'n1' }]
    };
    // Primary DB is empty
    assert.equal(UTILITY.isBackupNewerOrRicher(backup, [], []), true);
    // Primary DB has same count (intact, backup not needed)
    assert.equal(UTILITY.isBackupNewerOrRicher(backup, [{ id: 's1' }], [{ id: 'n1' }]), false);
    // Primary DB has more data
    assert.equal(UTILITY.isBackupNewerOrRicher(backup, [{ id: 's1' }, { id: 's2' }], [{ id: 'n1' }, { id: 'n2' }]), false);
});






