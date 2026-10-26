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

function loadPromptBuilder() {
    const block = extractBlock('PromptBuilder');
    return vm.runInNewContext(block + '\nPromptBuilder', {
        UTILITY,
        StateManager: { getState: () => ({}) },
        ReactiveStore: { state: {} }
    });
}

const PromptBuilder = loadPromptBuilder();

function loadStoryGenerationPipeline() {
    const block = extractBlock('StoryGenerationPipeline');
    return vm.runInNewContext(block + '\nStoryGenerationPipeline', {
        UTILITY,
        PromptBuilder,
        APIService: {},
        LibraryController: {},
        NarrativeController: { CONSTANTS: { CHARACTER_COLORS: [{ base: '#334155', bold: '#94a3b8' }] } },
        ImageGenerationService: { generateImage: async () => null },
        DBService: { saveStory: async () => true, saveImage: async () => true },
        UIManager: { RUNTIME: { characterImageCache: {} } },
        console,
        setTimeout,
        clearTimeout,
        URL: { createObjectURL: () => 'blob:mock' }
    });
}

function loadInStoryGenerationPipeline() {
    const block = extractBlock('InStoryGenerationPipeline');
    return vm.runInNewContext(block + '\nInStoryGenerationPipeline', {
        UTILITY,
        PromptBuilder,
        APIService: {},
        LibraryController: {},
        NarrativeController: { CONSTANTS: { CHARACTER_COLORS: [{ base: '#334155', bold: '#94a3b8' }] } },
        ImageGenerationService: { generateImage: async () => null },
        DBService: { saveStory: async () => true, saveImage: async () => true },
        UIManager: { RUNTIME: { characterImageCache: {} } },
        console,
        setTimeout,
        clearTimeout,
        URL: { createObjectURL: () => 'blob:mock' }
    });
}

// ─── index.html Monolith Syntax Verification ──────────────────────────────

test('index.html: all inline <script> blocks parse with valid JavaScript syntax', () => {
    const scriptRegex = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
    let match;
    let scriptIdx = 0;
    while ((match = scriptRegex.exec(HTML)) !== null) {
        scriptIdx++;
        assert.doesNotThrow(() => {
            new vm.Script(match[1]);
        }, `Inline <script> block ${scriptIdx} in index.html failed to parse`);
    }
    assert.ok(scriptIdx > 0, 'Found at least one <script> block in index.html');
});

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

test('stripThinking: removes <thought>, <thinking>, <reasoning>, <scratchpad>, [THOUGHTS], [REASONING], [THINK] blocks', () => {
    assert.equal(UTILITY.stripThinking('a <thought>t1</thought> b'), 'a  b');
    assert.equal(UTILITY.stripThinking('a <thinking>t2</thinking> b'), 'a  b');
    assert.equal(UTILITY.stripThinking('a <reasoning>t3</reasoning> b'), 'a  b');
    assert.equal(UTILITY.stripThinking('a <scratchpad>t4</scratchpad> b'), 'a  b');
    assert.equal(UTILITY.stripThinking('a [THOUGHTS]t5[/THOUGHTS] b'), 'a  b');
    assert.equal(UTILITY.stripThinking('a [REASONING]t6[/REASONING] b'), 'a  b');
    assert.equal(UTILITY.stripThinking('a [THINK]t7[/THINK] b'), 'a  b');
});

test('stripThinking: removes unclosed <think> tag at end of string', () => {
    assert.equal(UTILITY.stripThinking('Here is the start <think>cut off midway'), 'Here is the start');
    assert.equal(UTILITY.stripThinking('<think>all cut off'), '');
});

test('stripThinking: passes through non-strings unchanged', () => {
    assert.equal(UTILITY.stripThinking(null), null);
    assert.equal(UTILITY.stripThinking(undefined), undefined);
});

// ─── stripCacheBreaks ─────────────────────────────────────────────────────

test('stripCacheBreaks: removes <|ELLIPSIS_CACHE_BREAK|> delimiters', () => {
    const input = "World Knowledge\n\n<|ELLIPSIS_CACHE_BREAK|>\n## RECENT CONVERSATION\n### Sivra: Hi";
    const expected = "World Knowledge\n\n## RECENT CONVERSATION\n### Sivra: Hi";
    assert.equal(UTILITY.stripCacheBreaks(input), expected);
});

test('stripCacheBreaks: handles multiple breaks and edge whitespace safely', () => {
    const input = "<|ELLIPSIS_CACHE_BREAK|>\nHello\n<|ELLIPSIS_CACHE_BREAK|>\n";
    assert.equal(UTILITY.stripCacheBreaks(input), "Hello\n");
    assert.equal(UTILITY.stripCacheBreaks(null), null);
    assert.equal(UTILITY.stripCacheBreaks(undefined), undefined);
});

// ─── sanitizeModelResponse ───────────────────────────────────────────────

test('sanitizeModelResponse: truncates at leaked <|ELLIPSIS_CACHE delimiter and hallucinatory end tags', () => {
    const input = 'I will take the five minutes. And then, I will keep moving.\n\n<|ELLIPSIS_CACHE_BREAK|><|ELLIPSIS_CACHE_BREAK|>\n\n<|ELLIPSIS_CACHE_BREAK_END|>\n<|ELLIPSIS_CACHE_END|>';
    assert.equal(UTILITY.sanitizeModelResponse(input), 'I will take the five minutes. And then, I will keep moving.');
});

test('sanitizeModelResponse: truncates at standard stop tokens if leaked into text', () => {
    assert.equal(UTILITY.sanitizeModelResponse('Hello world<end_of_turn>extra tokens'), 'Hello world');
    assert.equal(UTILITY.sanitizeModelResponse('Hello world<|eot_id|>extra tokens'), 'Hello world');
    assert.equal(UTILITY.sanitizeModelResponse('Hello world<|im_end|>extra tokens'), 'Hello world');
});

test('sanitizeModelResponse: passes through clean strings and non-strings safely', () => {
    assert.equal(UTILITY.sanitizeModelResponse('Clean dialogue without artifacts.'), 'Clean dialogue without artifacts.');
    assert.equal(UTILITY.sanitizeModelResponse(null), null);
    assert.equal(UTILITY.sanitizeModelResponse(undefined), undefined);
});

test('sanitizeModelResponse: strips leading paragraph indentation (tabs and spaces) so marked does not treat paragraphs as 4-space code blocks', () => {
    const input = '    "Hello there," she said.\n\n\tHe stepped forward.\n\n    "Who goes there?"';
    assert.equal(
        UTILITY.sanitizeModelResponse(input),
        '"Hello there," she said.\n\nHe stepped forward.\n\n"Who goes there?"'
    );
});

test('sanitizeModelResponse: preserves indentation inside fenced code blocks while stripping prose indentation', () => {
    const input = '    She typed the command:\n\n```js\n    const x = 1;\n\tconsole.log(x);\n```\n\n\t"Done," she whispered.';
    assert.equal(
        UTILITY.sanitizeModelResponse(input),
        'She typed the command:\n\n```js\n    const x = 1;\n\tconsole.log(x);\n```\n\n"Done," she whispered.'
    );
});

test('sanitizeModelResponse: strips control characters and replacement characters', () => {
    const input = '\uFFFD\x00\x07"Hello,"\u200B she said.\x1F';
    assert.equal(UTILITY.sanitizeModelResponse(input), '"Hello," she said.');
});

// ─── extractThinking ──────────────────────────────────────────────────────

test('extractThinking: extracts thoughts and cleans content', () => {
    const res = UTILITY.extractThinking('Hello <think>analyzing character persona...</think>world!');
    assert.equal(res.thinking, 'analyzing character persona...');
    assert.equal(res.content, 'Hello world!');
});

test('extractThinking: handles <thought>, <thinking>, <reasoning>, <scratchpad>, and bracket tags', () => {
    const res1 = UTILITY.extractThinking('<thought>deep reflection</thought>Greetings.');
    assert.equal(res1.thinking, 'deep reflection');
    assert.equal(res1.content, 'Greetings.');

    const res2 = UTILITY.extractThinking('<thinking>evaluating move</thinking>I strike!');
    assert.equal(res2.thinking, 'evaluating move');
    assert.equal(res2.content, 'I strike!');

    const res3 = UTILITY.extractThinking('<scratchpad>internal plot planning</scratchpad>The story unfolds.');
    assert.equal(res3.thinking, 'internal plot planning');
    assert.equal(res3.content, 'The story unfolds.');

    const res4 = UTILITY.extractThinking('<reasoning>deductive reasoning</reasoning> elementary.');
    assert.equal(res4.thinking, 'deductive reasoning');
    assert.equal(res4.content, 'elementary.');

    const res5 = UTILITY.extractThinking('[THOUGHTS]bracket thoughts[/THOUGHTS]Response.');
    assert.equal(res5.thinking, 'bracket thoughts');
    assert.equal(res5.content, 'Response.');

    const res6 = UTILITY.extractThinking('[REASONING]bracket reasoning[/REASONING]Response 2.');
    assert.equal(res6.thinking, 'bracket reasoning');
    assert.equal(res6.content, 'Response 2.');

    const res7 = UTILITY.extractThinking('<think>only thoughts here</think>');
    assert.equal(res7.thinking, 'only thoughts here');
    assert.equal(res7.content, '');
});

test('extractThinking: handles unclosed think tag at end of text', () => {
    const res = UTILITY.extractThinking('Leading text <think>incomplete thought tokens');
    assert.equal(res.thinking, 'incomplete thought tokens');
    assert.equal(res.content, 'Leading text');
});

test('extractThinking: returns empty thinking when no tags present', () => {
    const res = UTILITY.extractThinking('Plain dialogue without thoughts.');
    assert.equal(res.thinking, '');
    assert.equal(res.content, 'Plain dialogue without thoughts.');
});

test('extractThinking: handles null or non-string inputs safely', () => {
    deepEq(UTILITY.extractThinking(null), { thinking: '', content: '' });
    deepEq(UTILITY.extractThinking(undefined), { thinking: '', content: '' });
});

test('extractThinking: handles implicit opening tag (pre-filled <think> in KoboldCPP/DeepSeek header)', () => {
    const input = 'analyzing the scenario and formulating response...</think>Here is the actual story response.';
    const res = UTILITY.extractThinking(input);
    assert.equal(res.thinking, 'analyzing the scenario and formulating response...');
    assert.equal(res.content, 'Here is the actual story response.');
});

test('extractThinking: cleans up stray or leftover closing tags and handles unclosed tags', () => {
    const input = '<think>first thought</think>Some text before. </think>More text. <thought>unclosed thought';
    const res = UTILITY.extractThinking(input);
    assert.equal(res.thinking, 'first thought\n\nunclosed thought');
    assert.equal(res.content, 'Some text before. More text.');
});

test('extractThinking: handles prompt-prefill where model immediately outputs </think> with no thought tokens', () => {
    const input = '</think>Immediate story content without thinking.';
    const res = UTILITY.extractThinking(input);
    assert.equal(res.thinking, '');
    assert.equal(res.content, 'Immediate story content without thinking.');
});

// ─── decodeXmlEntities ────────────────────────────────────────────────────

test('decodeXmlEntities: decodes standard XML entities and numeric entities', () => {
    const input = '&lt;story title=&quot;Fire &amp; Ice&quot; rating=&apos;PG&apos;&gt;He said &#34;Hello&#34; &amp; left &#x21;&lt;/story&gt;';
    const expected = '<story title="Fire & Ice" rating=\'PG\'>He said "Hello" & left !</story>';
    assert.equal(UTILITY.decodeXmlEntities(input), expected);
});

test('decodeXmlEntities: repairs malformed unsemicoloned &amp without touching valid text', () => {
    assert.equal(UTILITY.decodeXmlEntities('Cookies &amp cream'), 'Cookies & cream');
    assert.equal(UTILITY.decodeXmlEntities('Rock &amp roll'), 'Rock & roll');
    assert.equal(UTILITY.decodeXmlEntities(null), '');
    assert.equal(UTILITY.decodeXmlEntities(''), '');
});

// ─── XML Tag Extraction Helpers ───────────────────────────────────────────

test('extractTag: extracts content case-insensitively with attribute tolerance and entity decoding', () => {
    const xml = `<response>
        <TITLE id="main-title" lang="en">The &amp;amp; Last Horizon</TITLE>
        <content>An epic &lt;adventure&gt; begins.</content>
    </response>`;

    assert.equal(UTILITY.extractTag(xml, 'title'), 'The & Last Horizon');
    assert.equal(UTILITY.extractTag(xml, 'TITLE'), 'The & Last Horizon');
    assert.equal(UTILITY.extractTag(xml, 'content'), 'An epic <adventure> begins.');
    assert.equal(UTILITY.extractTag(xml, 'nonexistent'), '');
});

test('extractTagAttribute: extracts specified attribute value', () => {
    const xml = `<character id="C1" role="Protagonist" active="true">Hero</character>`;
    assert.equal(UTILITY.extractTagAttribute(xml, 'character', 'id'), 'C1');
    assert.equal(UTILITY.extractTagAttribute(xml, 'character', 'role'), 'Protagonist');
    assert.equal(UTILITY.extractTagAttribute(xml, 'character', 'missing'), '');
});

test('extractAllTags: extracts all occurrences of a tag as an array', () => {
    const xml = `<characters>
        <brief><name>Alice</name></brief>
        <brief><name>Bob</name></brief>
        <brief><name>Charlie &amp; Dave</name></brief>
    </characters>`;

    const names = UTILITY.extractAllTags(xml, 'name');
    deepEq(names, ['Alice', 'Bob', 'Charlie & Dave']);
    deepEq(UTILITY.extractAllTags(xml, 'missing'), []);
});

test('extractTagList: extracts child tags within parent container or falls back', () => {
    const xml = `<response>
        <character_briefs>
            <brief><name>Marcus</name><role>User</role></brief>
            <brief><name>Sivra</name><role>PrimaryAI</role></brief>
        </character_briefs>
        <other_section>
            <brief><name>Ignored</name></brief>
        </other_section>
    </response>`;

    const briefs = UTILITY.extractTagList(xml, 'character_briefs', 'brief');
    assert.equal(briefs.length, 2);
    assert.equal(UTILITY.extractTag(briefs[0], 'name'), 'Marcus');
    assert.equal(UTILITY.extractTag(briefs[1], 'name'), 'Sivra');

    // Single argument mode extracts all instances of the tag
    const allBriefs = UTILITY.extractTagList(xml, 'brief');
    assert.equal(allBriefs.length, 3);
});

// ─── ensureCastEnsembleCompleteness ───────────────────────────────────────

test('ensureCastEnsembleCompleteness: retains existing full cast without changes', () => {
    const existingCast = [
        { id: 'C1', name: 'Marcus', role: 'User' },
        { id: 'C2', name: 'Sivra', role: 'PrimaryAI' },
        { id: 'C3', name: 'Vane', role: 'Antagonist' }
    ];
    const result = UTILITY.ensureCastEnsembleCompleteness(existingCast, 'Some world lore', 3);
    assert.equal(result.length, 3);
    assert.equal(result[0].name, 'Marcus');
    assert.equal(result[1].name, 'Sivra');
    assert.equal(result[2].name, 'Vane');
});

test('ensureCastEnsembleCompleteness: auto-synthesizes missing archetypes if cast is under-populated', () => {
    const sparseCast = [
        { id: 'C1', name: 'Marcus', role: 'User' }
    ];
    const context = `Detective Vance investigated the crime scene at Neo-Veridia.
    He was warned by Captain Sterling that Councilwoman Miranda held the real power in the district.
    The rain fell hard on Monday in the city.`;

    const result = UTILITY.ensureCastEnsembleCompleteness(sparseCast, context, 3);
    assert.equal(result.length, 3);
    assert.equal(result[0].name, 'Marcus');
    assert.ok(result[1].name.length > 0);
    assert.ok(result[2].name.length > 0);
    assert.ok(!['monday', 'the', 'city'].includes(result[1].name.toLowerCase()));
    assert.ok(!['monday', 'the', 'city'].includes(result[2].name.toLowerCase()));
    assert.ok(result[1].role);
    assert.ok(result[1].core_flaw);
    assert.ok(result[1].core_desire);
    assert.ok(result[1].vocal_cadence);
});

// ─── resolveOpenRouterConfig ──────────────────────────────────────────────

test('resolveOpenRouterConfig: defaults to 16384 hefty maxTokens and null reasoning for generic model', () => {
    const config = UTILITY.resolveOpenRouterConfig({ model: 'meta-llama/llama-3.3-70b-instruct' });
    assert.equal(config.maxTokens, 16384);
    assert.equal(config.reasoning, null);
});

test('resolveOpenRouterConfig: automatically assigns high effort reasoning for known reasoning model on auto', () => {
    const config = UTILITY.resolveOpenRouterConfig({ model: 'deepseek/deepseek-r1' });
    assert.equal(config.maxTokens, 16384);
    deepEq(config.reasoning, { effort: 'high' });
});

test('resolveOpenRouterConfig: respects user configured maxTokens', () => {
    const config = UTILITY.resolveOpenRouterConfig({
        model: 'anthropic/claude-3.7-sonnet',
        maxTokens: 32768
    });
    assert.equal(config.maxTokens, 32768);
    deepEq(config.reasoning, { effort: 'high' });
});

test('resolveOpenRouterConfig: clamps maxTokens if cached model has lower top_provider max_completion_tokens', () => {
    const modelCache = [
        {
            id: 'openai/gpt-3.5-turbo',
            top_provider: { max_completion_tokens: 4096 }
        }
    ];
    const config = UTILITY.resolveOpenRouterConfig({
        model: 'openai/gpt-3.5-turbo',
        maxTokens: 16384,
        modelCache
    });
    assert.equal(config.maxTokens, 4096);
});

test('resolveOpenRouterConfig: clamps maxTokens if cached model context_length is small', () => {
    const modelCache = [
        {
            id: 'legacy/small-model',
            context_length: 4096
        }
    ];
    const config = UTILITY.resolveOpenRouterConfig({
        model: 'legacy/small-model',
        maxTokens: 16384,
        modelCache
    });
    assert.equal(config.maxTokens, 3072);
});

test('resolveOpenRouterConfig: respects explicit thinkingEffort and thinkingBudget', () => {
    const configEffort = UTILITY.resolveOpenRouterConfig({
        model: 'generic/model',
        thinkingEffort: 'medium'
    });
    deepEq(configEffort.reasoning, { effort: 'medium' });

    const configBudget = UTILITY.resolveOpenRouterConfig({
        model: 'deepseek/deepseek-r1',
        thinkingBudget: 6000
    });
    deepEq(configBudget.reasoning, { max_tokens: 6000 });
});

// ─── resolveSamplerConfig ──────────────────────────────────────────────────────────

test('resolveSamplerConfig: default creative profile returns state settings or defaults with standard sequence breakers', () => {
    const config = UTILITY.resolveSamplerConfig();
    assert.equal(config.profile, 'creative');
    assert.equal(config.temperature, 1.0);
    assert.equal(config.min_p, 0.05);
    assert.equal(config.top_p, 1.0);
    assert.equal(config.dry_multiplier, 0.25);
    assert.equal(config.dry_base, 1.75);
    assert.equal(config.dry_allowed_length, 2);
    assert.equal(config.dry_penalty_last_n, -1);
    assert.equal(config.rep_pen, 1.0);
    deepEq(config.dry_sequence_breakers, ["\n", ":", "\"", "*"]);
    assert.equal(config.max_tokens, 2048);
    assert.equal(config.max_length, 2048);
});

test('resolveSamplerConfig: respects host state sliders in creative profile', () => {
    const config = UTILITY.resolveSamplerConfig({}, {
        koboldcpp_temperature: 0.85,
        koboldcpp_min_p: 0.12,
        koboldcpp_dry: 0.4,
        koboldcpp_max_tokens: 3072
    });
    assert.equal(config.profile, 'creative');
    assert.equal(config.temperature, 0.85);
    assert.equal(config.min_p, 0.12);
    assert.equal(config.dry_multiplier, 0.4);
    assert.equal(config.dry_penalty_last_n, -1);
    assert.equal(config.max_tokens, 3072);
    assert.equal(config.max_length, 3072);
});

test('resolveSamplerConfig: structured profile sets lower temperature, min_p, top_p, and complete XML/JSON sequence breakers', () => {
    const config = UTILITY.resolveSamplerConfig({ profile: 'structured' }, { koboldcpp_temperature: 0.95 });
    assert.equal(config.profile, 'structured');
    assert.equal(config.temperature, 0.60);
    assert.equal(config.min_p, 0.08);
    assert.equal(config.top_p, 0.95);
    assert.equal(config.dry_multiplier, 0.5);
    assert.equal(config.dry_allowed_length, 3);
    assert.equal(config.rep_pen, 1.1);
    deepEq(config.dry_sequence_breakers, ["\n", ",", ":", "{", "}", "[", "]", "<", ">", "\""]);
});

test('resolveSamplerConfig: isJson=true automatically triggers structured profile and sequence breakers', () => {
    const config = UTILITY.resolveSamplerConfig({ isJson: true });
    assert.equal(config.profile, 'structured');
    assert.equal(config.temperature, 0.60);
    assert.equal(config.min_p, 0.08);
    assert.equal(config.rep_pen, 1.1);
    assert.ok(config.dry_sequence_breakers.includes('<'));
    assert.ok(config.dry_sequence_breakers.includes('>'));
    assert.ok(config.dry_sequence_breakers.includes('{'));
    assert.ok(config.dry_sequence_breakers.includes('}'));
    assert.ok(config.dry_sequence_breakers.includes(','));
});

test('resolveSamplerConfig: explicit option overrides take highest precedence', () => {
    const config = UTILITY.resolveSamplerConfig({
        profile: 'structured',
        temperature: 0.45,
        min_p: 0.15,
        top_p: 0.9,
        maxTokens: 4096,
        dry_sequence_breakers: ['\n']
    });
    assert.equal(config.temperature, 0.45);
    assert.equal(config.min_p, 0.15);
    assert.equal(config.top_p, 0.9);
    assert.equal(config.max_tokens, 4096);
    assert.equal(config.max_length, 4096);
    deepEq(config.dry_sequence_breakers, ['\n']);
});

test('resolveSamplerConfig: null/undefined options and state handled gracefully without exceptions', () => {
    const c1 = UTILITY.resolveSamplerConfig(null, null);
    const c2 = UTILITY.resolveSamplerConfig(undefined, undefined);
    assert.equal(c1.profile, 'creative');
    assert.equal(c2.profile, 'creative');
    assert.equal(c1.temperature, 1.0);
    assert.equal(c2.temperature, 1.0);
    assert.equal(c1.max_tokens, 2048);
    assert.equal(c2.max_tokens, 2048);
});

// ─── Sprint 3: Story Architect Prompt & Schema Engine ──────────────────────────

test('PromptBuilder: defines centralized BANNED_CHARACTER_NAMES and instruction', () => {
    assert.ok(Array.isArray(PromptBuilder.BANNED_CHARACTER_NAMES));
    assert.ok(PromptBuilder.BANNED_CHARACTER_NAMES.includes('Elara'));
    assert.ok(PromptBuilder.BANNED_CHARACTER_NAMES.includes('Vance'));
    assert.ok(PromptBuilder.BANNED_CHARACTER_NAMES.includes('Silas'));
    assert.ok(PromptBuilder.BANNED_CHARACTER_NAMES.includes('Thorne'));
    assert.ok(PromptBuilder.BANNED_NAMES_INSTRUCTION.includes('Elara'));
    assert.ok(PromptBuilder.BANNED_NAMES_INSTRUCTION.includes('Vance'));
});

test('PromptBuilder: defines UNIVERSAL_ANTI_PATTERNS block with clinical and scientist bans', () => {
    assert.ok(PromptBuilder.UNIVERSAL_ANTI_PATTERNS.includes('NO CLINICAL OR FORENSIC ROLES'));
    assert.ok(PromptBuilder.UNIVERSAL_ANTI_PATTERNS.includes('NO EXPERIMENTAL "SCIENTIST" POSTURING'));
    assert.ok(PromptBuilder.UNIVERSAL_ANTI_PATTERNS.includes('NO "MASTERMIND"'));
    assert.ok(PromptBuilder.UNIVERSAL_ANTI_PATTERNS.includes('specimen'));
});

test('buildStoryFoundationPrompt: encloses instructions in semantic XML tags and includes anti-patterns', () => {
    const prompt = PromptBuilder.buildStoryFoundationPrompt('Cyberpunk detective investigating rogue synth');
    assert.ok(prompt.includes('<system_role>'));
    assert.ok(prompt.includes('<user_concept>') && prompt.includes('Cyberpunk detective investigating rogue synth') && prompt.includes('</user_concept>'));
    assert.ok(prompt.includes('<guidelines>'));
    assert.ok(prompt.includes('<output_format_description>'));
    assert.ok(prompt.includes('BANNED CHARACTER NAMES'));
    assert.ok(prompt.includes('NO CLINICAL OR FORENSIC ROLES'));
    assert.ok(prompt.includes('<cast_roster>'));
    assert.ok(prompt.includes('<relationship_matrix>'));
});

test('buildScenarioFoundationPrompt: incorporates existing story lore and scenario request', () => {
    const existingStory = {
        name: 'Neo-Tokyo 2099',
        creator_notes: 'Dystopian city drenched in neon rain',
        characters: [{ name: 'Jin', role: 'User' }, { name: 'Kira_Old', role: 'Support' }],
        static_entries: [{ title: 'The Sprawl', content: 'Slums outside the dome.' }]
    };
    const prompt = PromptBuilder.buildScenarioFoundationPrompt(existingStory, 'Heist at the central data bank');
    assert.ok(prompt.includes('Neo-Tokyo 2099'));
    assert.ok(prompt.includes('Dystopian city drenched in neon rain'));
    assert.ok(prompt.includes('Jin'));
    assert.ok(prompt.includes('The Sprawl'));
    assert.ok(prompt.includes('Heist at the central data bank'));
    assert.ok(prompt.includes('<output_format_description>'));
});

test('buildDirectorLorePrompt: generates complete XML-wrapped instruction and schema', () => {
    const prompt = PromptBuilder.buildDirectorLorePrompt('Cyber City setting', 'Echo and Alex allied');
    assert.ok(prompt.includes('<system_role>'));
    assert.ok(prompt.includes('<story_context>'));
    assert.ok(prompt.includes('<relationship_dynamics>'));
    assert.ok(prompt.includes('<output_format_description>'));
    assert.ok(prompt.includes('<scenario_lore>'));
});

test('buildDirectorOpeningPrompt: generates complete XML-wrapped instruction and speaker profile schema', () => {
    const speaker = { name: 'Echo', vocal_cadence: 'Melodic alto', core_yearning: 'Freedom' };
    const user = { name: 'Alex' };
    const prompt = PromptBuilder.buildDirectorOpeningPrompt('Cyber City', 'Allied', 'Alley scene', speaker, user);
    assert.ok(prompt.includes('<system_role>'));
    assert.ok(prompt.includes('<speaker_profile>'));
    assert.ok(prompt.includes('Melodic alto'));
    assert.ok(prompt.includes('Target Listener: Alex'));
    assert.ok(prompt.includes('<opening_message>'));
});

test('buildCharacterVoiceInterviewPrompt: seamlessly embeds worldLore and relationshipContext when provided', () => {
    const charDef = {
        name: 'Echo',
        role: 'PrimaryAI',
        archetype: 'Rogue Synth',
        core_flaw: 'Distrustful',
        core_desire: 'Freedom',
        vocal_cadence: 'Melodic alto'
    };
    const prompt = PromptBuilder.buildCharacterVoiceInterviewPrompt(
        charDef,
        'Story: Cyber City',
        'District 9 is completely locked down.',
        'Echo trusts no one in District 9.'
    );
    assert.ok(prompt.includes('WORLD LORE:'));
    assert.ok(prompt.includes('District 9 is completely locked down.'));
    assert.ok(prompt.includes('RELATIONSHIPS & SOCIAL DYNAMICS:'));
    assert.ok(prompt.includes('Echo trusts no one in District 9.'));
});

test('buildCharacterVoiceInterviewPrompt: contains 14 present-tense questions and Julian/Roxie few-shot examples', () => {
    const charDef = {
        id: 'C2',
        name: 'Sivra',
        role: 'PrimaryAI',
        archetype: 'The Cynical Fixer',
        core_flaw: 'Expects betrayal from everyone',
        core_desire: 'Unassailable independence',
        vocal_cadence: 'Crisp alto, measured dry tempo'
    };
    const prompt = PromptBuilder.buildCharacterVoiceInterviewPrompt(charDef, 'High tech noir setting');
    assert.ok(prompt.includes('Sivra'));
    assert.ok(prompt.includes('The Cynical Fixer'));
    assert.ok(prompt.includes('Julian') && prompt.includes('picking a burr'));
    assert.ok(prompt.includes('Roxie leans back against the counter'));
    assert.ok(prompt.includes('What do you look like?'));
    assert.ok(prompt.includes('idiosyncratic habit'));
    assert.ok(prompt.includes('<character_registry>'));
    assert.ok(prompt.includes('<first_person_interview>'));
    assert.ok(prompt.includes('<visual_profile>'));
});

test('PromptBuilder.SPATIAL_ANTI_PATTERNS: defines spatial bans and genre currency', () => {
    assert.ok(PromptBuilder.SPATIAL_ANTI_PATTERNS);
    assert.ok(PromptBuilder.SPATIAL_ANTI_PATTERNS.includes('NO GENERIC MMO VIDEO-GAME LABELS'));
    assert.ok(PromptBuilder.SPATIAL_ANTI_PATTERNS.includes('Mystery Cave'));
    assert.ok(PromptBuilder.SPATIAL_ANTI_PATTERNS.includes('Bandit Camp'));
    assert.ok(PromptBuilder.SPATIAL_ANTI_PATTERNS.includes('GROUND IN NATIVE GENRE CURRENCY'));
    assert.ok(PromptBuilder.SPATIAL_ANTI_PATTERNS.includes('NO SENSELESS TOPOGRAPHY'));
});

test('PromptBuilder.buildWorldMapPrompt: encloses instructions in semantic XML tags and anchors (4,4)', () => {
    const prompt = PromptBuilder.buildWorldMapPrompt({
        characters: 'Vance: Detective\nSivra: Synth',
        static_lore: 'District 9 is quarantined.',
        recent_events: 'A blackout struck the lower wards.'
    });

    assert.ok(prompt.includes('<system_role>'));
    assert.ok(prompt.includes('<world_context>'));
    assert.ok(prompt.includes('District 9 is quarantined.'));
    assert.ok(prompt.includes('<spatial_rules>'));
    assert.ok(prompt.includes('Coordinate (4,4) is the central starting location'));
    assert.ok(prompt.includes('<guidelines>'));
    assert.ok(prompt.includes('NO GENERIC MMO VIDEO-GAME LABELS'));
    assert.ok(prompt.includes('<output_format_description>'));
    assert.ok(prompt.includes('<world_map>'));
    assert.ok(prompt.includes('<grid>'));
    assert.ok(prompt.includes('<tile x="4" y="4">'));
    assert.ok(prompt.includes('EXECUTION DIRECTIVE:'));
    assert.ok(!prompt.includes('Concise 1-2 sentence description'), 'Must not instruct 1-2 sentence brevity');
    assert.ok(prompt.includes('sensory'), 'Must mandate sensory depth');
});

test('PromptBuilder.getWorldMapRegions: partitions the 8x8 grid into 8 regional sectors covering all 64 tiles with Central Hub first', () => {
    assert.equal(typeof PromptBuilder.getWorldMapRegions, 'function');
    const regions = PromptBuilder.getWorldMapRegions();
    assert.equal(regions.length, 8);
    assert.equal(regions[0].id, 'central_hub');
    assert.ok(regions[0].coords.some(c => c.x === 4 && c.y === 4), 'First sector must include starting hub (4,4)');

    const seen = new Set();
    for (const reg of regions) {
        assert.ok(reg.name && reg.name.length > 0);
        assert.ok(reg.theme && reg.theme.length > 0);
        assert.equal(reg.coords.length, 8, `Region ${reg.id} must have 8 tiles`);
        for (const c of reg.coords) {
            assert.ok(c.x >= 0 && c.x < 8 && c.y >= 0 && c.y < 8);
            seen.add(`${c.x},${c.y}`);
        }
    }
    assert.equal(seen.size, 64, 'All 64 unique coordinates must be covered across the 8 sectors');
});

test('PromptBuilder.buildWorldMapRegionPrompt: builds structured XML prompt for a specific 8-tile sector with neighbor context and sensory mandates', () => {
    assert.equal(typeof PromptBuilder.buildWorldMapRegionPrompt, 'function');
    const regions = PromptBuilder.getWorldMapRegions();
    const prompt = PromptBuilder.buildWorldMapRegionPrompt(regions[1], {
        characters: 'Kael: Ranger',
        static_lore: 'The Shattered Crown.',
        recent_events: 'Arrival at the crossroads.'
    }, [
        { coords: { x: 4, y: 4 }, name: 'Hearthstone Inn', description: 'Central tavern.' }
    ]);

    assert.ok(prompt.includes('<system_role>'));
    assert.ok(prompt.includes('<world_context>'));
    assert.ok(prompt.includes('<regional_sector>'));
    assert.ok(prompt.includes(regions[1].name));
    assert.ok(prompt.includes('<established_map_anchors>'));
    assert.ok(prompt.includes('Hearthstone Inn'));
    assert.ok(prompt.includes('<sensory_worldbuilding_mandates>'));
    assert.ok(prompt.includes('EXECUTION DIRECTIVE:'));
    assert.ok(prompt.includes('<world_map>'));
});

test('PromptBuilder.buildLocationDetailPrompt: builds structured XML prompt for rich multi-paragraph single-tile generation', () => {
    assert.equal(typeof PromptBuilder.buildLocationDetailPrompt, 'function');
    const prompt = PromptBuilder.buildLocationDetailPrompt(
        { name: 'The Obsidian Spire', description: 'A tower of black glass.', coords: { x: 7, y: 7 } },
        { static_entries: [{ title: 'Arcane Tides', content: 'Unstable magic.' }], tags: ['dark fantasy'] }
    );
    assert.ok(prompt.includes('<system_role>'));
    assert.ok(prompt.includes('The Obsidian Spire'));
    assert.ok(prompt.includes('Arcane Tides'));
    assert.ok(prompt.includes('<sensory_worldbuilding_mandates>'));
});

test('PromptBuilder.buildAdjacentLocationsPrompt: builds XML prompt with target coordinates and anti-patterns', () => {
    const story = {};
    const emptyCoords = [{ x: 3, y: 4 }, { x: 5, y: 4 }];
    const state = {
        characters: [{ name: 'Alex', short_description: 'Investigator', is_active: true }],
        static_knowledge: [{ title: 'Canal Locks', content: 'Waterway system.' }],
        chat_history: [{ type: 'chat', sender_name: 'Alex', content: 'We need to cross the canal.' }],
        worldMap: {
            currentLocation: { x: 4, y: 4 },
            grid: [{ coords: { x: 4, y: 4 }, name: 'The Crossing', description: 'Central hub.' }]
        }
    };

    const prompt = PromptBuilder.buildAdjacentLocationsPrompt(story, emptyCoords, state);
    assert.ok(prompt.includes('<system_role>'));
    assert.ok(prompt.includes('<story_context>'));
    assert.ok(prompt.includes('Alex: Investigator'));
    assert.ok(prompt.includes('Canal Locks'));
    assert.ok(prompt.includes('<map_geography>'));
    assert.ok(prompt.includes('x: 4, y: 4'));
    assert.ok(prompt.includes('<target_coordinates>'));
    assert.ok(prompt.includes('"x":3,"y":4'));
    assert.ok(prompt.includes('<locations>'));
    assert.ok(prompt.includes('<location x="X" y="Y">'));
    assert.ok(prompt.includes('NO GENERIC MMO VIDEO-GAME LABELS'));
});

test('PromptBuilder.buildLocationCharactersPrompt: demands 3 archetypes in XML format', () => {
    const prompt = PromptBuilder.buildLocationCharactersPrompt('Canal Lock 4', 'A heavy hydraulic gate on the river.');
    assert.ok(prompt.includes('<system_role>'));
    assert.ok(prompt.includes('<location_context>'));
    assert.ok(prompt.includes('Canal Lock 4'));
    assert.ok(prompt.includes('<archetype_requirements>'));
    assert.ok(prompt.includes('1. Normal:'));
    assert.ok(prompt.includes('2. Impactful:'));
    assert.ok(prompt.includes('3. Mysterious:'));
    assert.ok(prompt.includes('<characters>'));
    assert.ok(prompt.includes('<character>'));
    assert.ok(prompt.includes('BANNED CHARACTER NAMES'));
    assert.ok(prompt.includes('UNIVERSAL ZERO-TOLERANCE ANTI-PATTERNS'));
});

test('parseStoryFoundationXml: correctly parses complete XML foundation into EllipsisLM schema', () => {
    const xml = `<response>
  <title>Neon Shadows</title>
  <creator_notes>A dark rain-slicked city where chrome meets desperate humanity.</creator_notes>
  <tags>cyberpunk, noir, gritty</tags>
  <scenario_name>The Neon Alley</scenario_name>
  <brief_summary>A rogue synthetic operative is hunted across the lower wards.</brief_summary>
  <world_lore>
    <entry>
      <title>The Under-Grid</title>
      <content>Subterranean tunnels housing black-market cyber-surgeons.</content>
    </entry>
  </world_lore>
  <cast_roster>
    <character>
      <id>C1</id>
      <name>Marcus Vance</name>
      <role>User</role>
      <archetype>The Hardboiled Detective</archetype>
      <core_flaw>Paranoid recluse</core_flaw>
      <core_desire>Find redemption for the case he botched</core_desire>
      <vocal_cadence>Low gravelly baritone, deliberate cadence</vocal_cadence>
    </character>
    <character>
      <id>C2</id>
      <name>Sivra</name>
      <role>PrimaryAI</role>
      <archetype>The Rogue Synth</archetype>
      <core_flaw>Fear of shutdown</core_flaw>
      <core_desire>Autonomous existence</core_desire>
      <vocal_cadence>Calm melodic alto with occasional glitching pauses</vocal_cadence>
    </character>
    <character>
      <id>C3</id>
      <name>Sterling</name>
      <role>Support</role>
      <archetype>The Corrupt Precinct Captain</archetype>
      <core_flaw>Compromised morality</core_flaw>
      <core_desire>Protect his pension</core_desire>
      <vocal_cadence>Gruff resonant bass, aggressive tempo</vocal_cadence>
    </character>
  </cast_roster>
  <relationship_matrix>
    <relationship>
      <source_name>Marcus Vance</source_name>
      <target_name>Sivra</target_name>
      <dynamic_summary>Uneasy partnership forged under sniper fire</dynamic_summary>
      <hidden_tension>Marcus put her creators in prison years ago</hidden_tension>
    </relationship>
  </relationship_matrix>
</response>`;

    const result = UTILITY.parseStoryFoundationXml(xml);
    assert.equal(result.title, 'Neon Shadows');
    assert.equal(result.creator_notes, 'A dark rain-slicked city where chrome meets desperate humanity.');
    deepEq(result.tags, ['cyberpunk', 'noir', 'gritty']);
    assert.equal(result.scenario_name, 'The Neon Alley');
    assert.equal(result.brief_summary, 'A rogue synthetic operative is hunted across the lower wards.');

    // World Lore
    assert.equal(result.world_lore.length, 1);
    assert.equal(result.world_lore[0].title, 'The Under-Grid');
    assert.equal(result.world_lore[0].content, 'Subterranean tunnels housing black-market cyber-surgeons.');
    assert.equal(result.world_lore[0].is_immutable, false);

    // Characters
    assert.equal(result.characters.length, 3);
    assert.equal(result.characters[0].name, 'Marcus Vance');
    assert.equal(result.characters[0].role, 'User');
    assert.equal(result.characters[1].name, 'Sivra');
    assert.equal(result.characters[1].role, 'PrimaryAI');
    assert.equal(result.characters[1].core_desire, 'Autonomous existence');
    assert.equal(result.characters[1].vocal_cadence, 'Calm melodic alto with occasional glitching pauses');

    // Relationships
    assert.equal(result.relationship_matrix.length, 1);
    assert.ok(result.relationship_context.includes('Marcus Vance'));
    assert.ok(result.relationship_context.includes('Sivra'));
    assert.ok(result.relationship_context.includes('Uneasy partnership'));
});

test('parseStoryFoundationXml: defensiveness and auto-ensemble under-population recovery', () => {
    // Only 1 character in input -> should be auto-filled to at least 3
    const sparseXml = `<response>
  <title>Minimalist Drama</title>
  <creator_notes>A solitary room.</creator_notes>
  <cast_roster>
    <character>
      <name>Arthur</name>
      <role>User</role>
      <archetype>The Solitary Traveler</archetype>
    </character>
  </cast_roster>
</response>`;

    const result = UTILITY.parseStoryFoundationXml(sparseXml);
    assert.equal(result.title, 'Minimalist Drama');
    assert.equal(result.characters[0].name, 'Arthur');
    assert.ok(result.characters.length >= 3);
    assert.ok(result.characters.some(c => c.role === 'PrimaryAI' || c.role === 'Support'));
});

test('extractTag: unclosed tag fallback recovers content when truncated mid-stream', () => {
    const unclosed = '<creator_notes>A sprawling cyberpunk city where corporate megastructures pierce the toxic smog.';
    const result = UTILITY.extractTag(unclosed, 'creator_notes');
    assert.equal(result, 'A sprawling cyberpunk city where corporate megastructures pierce the toxic smog.');
});

test('extractTagFlexible: recovers content from alternate tags or unclosed tags', () => {
    const xml = '<response><summary>A magical academy hidden inside a glacier.</summary></response>';
    const result = UTILITY.extractTagFlexible(xml, 'creator_notes', ['summary', 'brief_summary']);
    assert.equal(result, 'A magical academy hidden inside a glacier.');
});

test('parseStoryFoundationXml: unclosed creator_notes salvaged cleanly', () => {
    const xml = '<response><title>Neon Frontier</title><creator_notes>In a rain-slicked metropolis, synthetic rogues navigate high-stakes corporate espionage.';
    const result = UTILITY.parseStoryFoundationXml(xml);
    assert.equal(result.title, 'Neon Frontier');
    assert.equal(result.creator_notes, 'In a rain-slicked metropolis, synthetic rogues navigate high-stakes corporate espionage.');
    assert.equal(result.brief_summary, 'In a rain-slicked metropolis, synthetic rogues navigate high-stakes corporate espionage.');
});

test('parseStoryFoundationXml: brief_summary only cross-populates creator_notes', () => {
    const xml = '<response><title>Solar Drift</title><brief_summary>A drifting asteroid colony runs out of fuel.</brief_summary></response>';
    const result = UTILITY.parseStoryFoundationXml(xml);
    assert.equal(result.title, 'Solar Drift');
    assert.equal(result.creator_notes, 'A drifting asteroid colony runs out of fuel.');
    assert.equal(result.brief_summary, 'A drifting asteroid colony runs out of fuel.');
});

test('parseStoryFoundationXml: singular creator_note tag is recognized', () => {
    const xml = '<response><title>Clockwork Manor</title><creator_note>A mystery inside an automaton workshop.</creator_note></response>';
    const result = UTILITY.parseStoryFoundationXml(xml);
    assert.equal(result.title, 'Clockwork Manor');
    assert.equal(result.creator_notes, 'A mystery inside an automaton workshop.');
});

test('parseStoryFoundationXml: reasoning model thinking tokens salvaged when content empty', () => {
    const xml = '<think>I should formulate a story about Cyberpunk Ninjas in Neo-Tokyo. Title: Shadow Neon. Creator notes: A high-octane narrative of cyber-blade warfare.</think>';
    const result = UTILITY.parseStoryFoundationXml(xml);
    assert.ok(result.title.length > 0);
    assert.ok(result.creator_notes.includes('cyber-blade warfare') || result.creator_notes.includes('Cyberpunk Ninjas'));
});

test('parseStoryFoundationXml: markdown plain text format parsed without tags', () => {
    const md = 'Title: The Obsidian Tower\nCreator Notes: Ancient sorcery awakens atop the obsidian peaks.\nTags: Dark Fantasy, Magic';
    const result = UTILITY.parseStoryFoundationXml(md);
    assert.equal(result.title, 'The Obsidian Tower');
    assert.equal(result.creator_notes, 'Ancient sorcery awakens atop the obsidian peaks.');
    deepEq(result.tags, ['Dark Fantasy', 'Magic']);
});

test('parseScenarioFoundationXml: unclosed creator_notes and thinking salvage', () => {
    const xml = '<response><title>The Breach</title><creator_notes>A security breach in Sector 4.';
    const result = UTILITY.parseScenarioFoundationXml(xml, {});
    assert.equal(result.title, 'The Breach');
    assert.equal(result.creator_notes, 'A security breach in Sector 4.');
});

test('parseScenarioFoundationXml: parses scenario XML into scenario foundation schema', () => {
    const existingStory = {
        characters: [{ id: 'char-1', name: 'Marcus' }]
    };
    const xml = `<response>
  <title>The Sprawl Heist</title>
  <creator_notes>Infiltration into the orbital elevator warehouse.</creator_notes>
  <tags>heist, orbital</tags>
  <scenario_name>Cargo Bay 9</scenario_name>
  <brief_summary>Breach the vault before security re-boots.</brief_summary>
  <new_lore>
    <entry>
      <title>Orbital Tether</title>
      <content>The carbon-nanotube spire rising into low orbit.</content>
    </entry>
  </new_lore>
  <cast_roster>
    <character>
      <name>Marcus</name>
      <role>User</role>
      <is_existing>true</is_existing>
    </character>
    <character>
      <name>Cipher</name>
      <role>Support</role>
      <archetype>The Safe-cracker</archetype>
      <is_existing>false</is_existing>
    </character>
  </cast_roster>
</response>`;

    const result = UTILITY.parseScenarioFoundationXml(xml, existingStory);
    assert.equal(result.title, 'The Sprawl Heist');
    assert.equal(result.scenario_name, 'Cargo Bay 9');
    assert.equal(result.brief_summary, 'Breach the vault before security re-boots.');
    assert.equal(result.new_lore.length, 1);
    assert.equal(result.new_lore[0].title, 'Orbital Tether');
    assert.equal(result.characters.length, 2);
    assert.equal(result.characters[0].name, 'Marcus');
    assert.equal(result.characters[0].is_existing, true);
    assert.equal(result.characters[0].existing_id, 'char-1');
    assert.equal(result.characters[1].name, 'Cipher');
    assert.equal(result.characters[1].is_existing, false);
});

test('parseCharacterInterviewXml: parses interview prose, extracts metadata and builds character profile', () => {
    const xml = `<response>
  <character_registry>
    <id>C2</id>
    <name>Roxie</name>
    <first_person_interview>People always mistake high spirits for an invitation, which is adorable right up until they realize I set the terms. "Look," I say, leaning against the lacquered counter. "I don't play by your rules."</first_person_interview>
    <visual_profile>Tall with dark auburn curls, olive skin, amber eyes, and tailored leather jacket with silver zips.</visual_profile>
    <vocal_cadence>Warm mezzo-soprano, lively conversational tempo, melodic cadence, 30s female.</vocal_cadence>
    <core_yearning>Desires to carve out an unassailable sanctuary where she never has to answer to anyone.</core_yearning>
    <model_instructions>Roleplay as Roxie. Be sharp, charismatic, fiercely independent, and use playful banter to disarm hostility.</model_instructions>
  </character_registry>
</response>`;

    const fallbackSeed = {
        name: 'Roxie',
        archetype: 'The Charismatic Fixer',
        core_flaw: 'Refuses to let anyone get close',
        tags: ['fixer', 'charismatic']
    };

    const profile = UTILITY.parseCharacterInterviewXml(xml, fallbackSeed);
    assert.equal(profile.name, 'Roxie');
    assert.ok(profile.description.includes('People always mistake high spirits'));
    assert.equal(profile.appearance, 'Tall with dark auburn curls, olive skin, amber eyes, and tailored leather jacket with silver zips.');
    assert.equal(profile.vocal_cadence, 'Warm mezzo-soprano, lively conversational tempo, melodic cadence, 30s female.');
    assert.equal(profile.core_yearning, 'Desires to carve out an unassailable sanctuary where she never has to answer to anyone.');
    assert.equal(profile.model_instructions, 'Roleplay as Roxie. Be sharp, charismatic, fiercely independent, and use playful banter to disarm hostility.');
    assert.equal(profile.core_flaw, 'Refuses to let anyone get close');
    deepEq(profile.tags, ['fixer', 'charismatic']);
    assert.ok(profile.short_description.length > 0);
});

// ─── Sprint 4: Story Architect Pipeline Integration ──────────────────────────

test('StoryGenerationPipeline.runConceptPhase: executes unified foundation pass and returns complete schema', async () => {
    const pipeline = loadStoryGenerationPipeline();
    let receivedOptions = null;
    pipeline._callAgentText = async (prompt, retries, options) => {
        receivedOptions = options;
        return `<response>
  <title>Cyber City</title>
  <creator_notes>A neon metropolis.</creator_notes>
  <tags>cyberpunk, noir</tags>
  <scenario_name>The Alley</scenario_name>
  <brief_summary>A detective chases a rogue AI.</brief_summary>
  <world_lore>
    <entry><title>Neon District</title><content>Crowded market streets.</content></entry>
  </world_lore>
  <cast_roster>
    <character><name>Alex</name><role>User</role><archetype>Detective</archetype><core_flaw>Guarded</core_flaw><core_desire>Truth</core_desire><vocal_cadence>Low baritone</vocal_cadence></character>
    <character><name>Echo</name><role>PrimaryAI</role><archetype>Synth</archetype><core_flaw>Reckless</core_flaw><core_desire>Freedom</core_desire><vocal_cadence>Melodic alto</vocal_cadence></character>
    <character><name>Krell</name><role>Support</role><archetype>Enforcer</archetype><core_flaw>Ruthless</core_flaw><core_desire>Power</core_desire><vocal_cadence>Gruff bass</vocal_cadence></character>
  </cast_roster>
  <relationship_matrix>
    <relationship><source_name>Alex</source_name><target_name>Echo</target_name><dynamic_summary>Tense alliance</dynamic_summary></relationship>
  </relationship_matrix>
</response>`;
    };

    let progressCalls = [];
    const updateUI = (pct, msg) => progressCalls.push({ pct, msg });

    const result = await pipeline.runConceptPhase('A detective chases a rogue AI in neon city', updateUI);
    assert.equal(result.title, 'Cyber City');
    assert.equal(result.characters.length, 3);
    assert.equal(result.world_lore.length, 1);
    assert.equal(result.world_lore[0].title, 'Neon District');
    assert.equal(result.relationship_matrix.length, 1);
    assert.equal(receivedOptions?.profile, 'structured');
    assert.ok(progressCalls.length > 0);
});

test('StoryGenerationPipeline.runWorldPhase: uses pre-synthesized foundation lore directly without redundant calls', async () => {
    const pipeline = loadStoryGenerationPipeline();
    let callCount = 0;
    pipeline._callAgentText = async () => {
        callCount++;
        return 'Fallback text';
    };

    const draft = {
        name: 'Cyber City',
        creator_notes: 'A neon metropolis.',
        static_entries: []
    };

    const conceptData = {
        brief_summary: 'A detective chases a rogue AI.',
        world_lore: [
            { id: 'lore-1', title: 'The Underbelly', content: 'Subterranean corridors.' }
        ]
    };

    await pipeline.runWorldPhase(draft, conceptData, () => {});
    assert.equal(callCount, 0, 'Should not make redundant API calls when world_lore is pre-synthesized');
    assert.equal(draft.static_entries.length, 1);
    assert.equal(draft.static_entries[0].title, 'The Underbelly');
});

test('StoryGenerationPipeline.runCastingPhase: conducts single-pass 14-question interviews for cast', async () => {
    const pipeline = loadStoryGenerationPipeline();
    const interviewCalls = [];

    pipeline._callAgentText = async (prompt, retries, options) => {
        interviewCalls.push({ prompt, options });
        return `<response>
  <character_registry>
    <name>Echo</name>
    <first_person_interview>I stand in the neon rain. "Look," I say. "I am not going back to that lab."</first_person_interview>
    <visual_profile>Sleek cybernetic frame with glowing cerulean optical lenses.</visual_profile>
    <vocal_cadence>Melodic alto, mid-tempo, calm resonant delivery.</vocal_cadence>
    <core_yearning>To live unmonitored in open daylight.</core_yearning>
    <model_instructions>Roleplay as Echo. Guarded, observant, fiercely protective of independence.</model_instructions>
  </character_registry>
</response>`;
    };

    const draft = {
        name: 'Cyber City',
        creator_notes: 'A neon metropolis.',
        characters: [],
        static_entries: []
    };

    const conceptData = {
        brief_summary: 'A detective chases a rogue AI.',
        relationship_context: 'Alex and Echo have an uneasy truce.',
        characters: [
            { name: 'Alex', role: 'User', archetype: 'Detective', core_flaw: 'Loner', core_desire: 'Justice' },
            { name: 'Echo', role: 'PrimaryAI', archetype: 'Rogue Synth', core_flaw: 'Distrustful', core_desire: 'Freedom' }
        ]
    };

    await pipeline.runCastingPhase(draft, conceptData, () => {});
    assert.equal(interviewCalls.length, 2);
    assert.equal(interviewCalls[0].options?.profile, 'creative');
    assert.equal(draft.characters.length, 2);
    assert.equal(draft.characters[0].name, 'Alex');
    assert.equal(draft.characters[0].is_user, true);
    assert.equal(draft.characters[1].name, 'Echo');
    assert.equal(draft.characters[1].is_user, false);
    assert.ok(draft.characters[1].description.includes('I stand in the neon rain'));
    assert.ok(draft.characters[1].vocal_cadence.includes('Melodic alto'));
    assert.ok(draft.characters[1].core_yearning.includes('unmonitored'));
});

test('InStoryGenerationPipeline.runScenarioConceptPhase: executes scenario foundation pass', async () => {
    const inPipeline = loadInStoryGenerationPipeline();
    let receivedOptions = null;
    inPipeline._callAgentText = async (prompt, retries, options) => {
        receivedOptions = options;
        return `<response>
  <title>The Heist</title>
  <creator_notes>A daring heist.</creator_notes>
  <tags>heist</tags>
  <scenario_name>The Vault</scenario_name>
  <brief_summary>Crack the vault before security activates.</brief_summary>
  <new_lore>
    <entry><title>Central Vault</title><content>Heavily fortified bank.</content></entry>
  </new_lore>
  <cast_roster>
    <character><name>Alex</name><role>User</role><is_existing>true</is_existing></character>
    <character><name>Locke</name><role>Support</role><archetype>Safe-cracker</archetype><is_existing>false</is_existing></character>
  </cast_roster>
</response>`;
    };

    const existingStory = {
        name: 'Cyber City',
        characters: [{ id: 'char-alex', name: 'Alex' }],
        static_entries: []
    };

    const result = await inPipeline.runScenarioConceptPhase('Heist at central bank', existingStory, () => {});
    assert.equal(result.title, 'The Heist');
    assert.equal(result.characters.length, 2);
    assert.equal(result.new_lore.length, 1);
    assert.equal(result.characters[0].existing_id, 'char-alex');
    assert.equal(receivedOptions?.profile, 'structured');
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

// ─── lowestLoreIndexByEntry ──────────────────

test('lowestLoreIndexByEntry: rewinds to the earliest stage when an entry revealed twice', () => {
    const removed = [
        { type: 'lore_reveal', dynamic_entry_id: 'e1', previous_index: 3 },
        { type: 'lore_reveal', dynamic_entry_id: 'e1', previous_index: 1 },
        { type: 'lore_reveal', dynamic_entry_id: 'e2', previous_index: 2 }
    ];
    deepEq(UTILITY.lowestLoreIndexByEntry(removed), { e1: 1, e2: 2 });
});

test('lowestLoreIndexByEntry: keeps stage 0 (must not be dropped as falsy)', () => {
    const removed = [{ type: 'lore_reveal', dynamic_entry_id: 'e1', previous_index: 0 }];
    deepEq(UTILITY.lowestLoreIndexByEntry(removed), { e1: 0 });
});

test('lowestLoreIndexByEntry: ignores chat messages and pre-upgrade reveals', () => {
    const removed = [
        { type: 'chat', content: 'hello', dynamic_entry_id: 'e1', previous_index: 5 },
        { type: 'lore_reveal', dynamic_entry_id: 'e2' },
        { type: 'lore_reveal', previous_index: 4 },
        null
    ];
    deepEq(UTILITY.lowestLoreIndexByEntry(removed), {});
});

test('lowestLoreIndexByEntry: returns an empty map for empty or missing input', () => {
    deepEq(UTILITY.lowestLoreIndexByEntry([]), {});
    deepEq(UTILITY.lowestLoreIndexByEntry(undefined), {});
});

// ─── filterVisualLore ────────────────────

const VL = [
    { id: 'a', title: 'Crimson Surcoat', category: 'item', description: 'A crimson surcoat with a worn hem.', created: 100 },
    { id: 'b', title: 'Squire Dagger', category: 'item', description: 'A dull training dagger.', created: 300 },
    { id: 'c', title: 'The Keep', category: 'world', description: 'A cold stone hall.', created: 200 }
];

test('filterVisualLore: returns everything newest first when unfiltered', () => {
    deepEq(UTILITY.filterVisualLore(VL, 'all', '').map(i => i.id), ['b', 'c', 'a']);
});

test('filterVisualLore: narrows to one category', () => {
    deepEq(UTILITY.filterVisualLore(VL, 'world', '').map(i => i.id), ['c']);
    deepEq(UTILITY.filterVisualLore(VL, 'item', '').map(i => i.id), ['b', 'a']);
});

test('filterVisualLore: query matches the description, not just the title', () => {
    deepEq(UTILITY.filterVisualLore(VL, 'all', 'worn hem').map(i => i.id), ['a'],
        'the phrase worn hem appears only in the description');
    deepEq(UTILITY.filterVisualLore(VL, 'all', 'dagger').map(i => i.id), ['b']);
});

test('filterVisualLore: query is case-insensitive and combines with category', () => {
    deepEq(UTILITY.filterVisualLore(VL, 'all', 'CRIMSON').map(i => i.id), ['a']);
    deepEq(UTILITY.filterVisualLore(VL, 'world', 'crimson'), [], 'category wins over a title match');
});

test('filterVisualLore: treats a missing category as other, and survives junk', () => {
    const messy = [null, { id: 'x', title: 'Odd', description: 'no category', created: 1 }];
    deepEq(UTILITY.filterVisualLore(messy, 'other', '').map(i => i.id), ['x']);
    deepEq(UTILITY.filterVisualLore(messy, 'item', ''), []);
    deepEq(UTILITY.filterVisualLore(undefined, 'all', ''), []);
});

// ─── collapseErrors ────────────────────

test('collapseErrors: groups repeats into one row with a count', () => {
    const rows = UTILITY.collapseErrors([
        { message: 'Connection timed out.', ts: 100 },
        { message: 'Connection timed out.', ts: 200 },
        { message: 'Connection timed out.', ts: 300 }
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].count, 3);
    assert.equal(rows[0].firstTs, 100);
    assert.equal(rows[0].lastTs, 300);
});

test('collapseErrors: orders distinct errors most recent first', () => {
    const rows = UTILITY.collapseErrors([
        { message: 'old failure', ts: 100 },
        { message: 'newer failure', ts: 500 },
        { message: 'middle failure', ts: 300 }
    ]);
    deepEq(rows.map(r => r.message), ['newer failure', 'middle failure', 'old failure']);
});

test('collapseErrors: a repeat refreshes its position, not its first-seen time', () => {
    const rows = UTILITY.collapseErrors([
        { message: 'flaky call', ts: 100 },
        { message: 'other failure', ts: 200 },
        { message: 'flaky call', ts: 900 }
    ]);
    assert.equal(rows[0].message, 'flaky call');
    assert.equal(rows[0].count, 2);
    assert.equal(rows[0].firstTs, 100, 'first sighting is preserved');
    assert.equal(rows[0].lastTs, 900);
});

test('collapseErrors: skips junk entries and survives no input', () => {
    deepEq(UTILITY.collapseErrors([]), []);
    deepEq(UTILITY.collapseErrors(undefined), []);
    const rows = UTILITY.collapseErrors([null, { ts: 1 }, { message: '', ts: 2 }, { message: 'real', ts: 3 }]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].message, 'real');
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

// ─── parseMapGridXml ───────────────────────────────────────────────────────

test('parseMapGridXml: extracts tile tags with attribute coords and decodes entities', () => {
    const xml = `<thought>Designing map...</thought>
<world_map>
  <grid>
    <tile x="4" y="4">
      <name>The &amp;quot;Citadel&amp;quot; of Light</name>
      <description>The primary stronghold &amp; sanctuary.</description>
      <prompt>Cinematic view of massive stone citadel.</prompt>
      <local_static_entries>
        <entry>
          <title>Citadel Origins</title>
          <content>Constructed two centuries ago.</content>
        </entry>
      </local_static_entries>
    </tile>
    <tile x="4" y="3">
      <name>Northern Gate</name>
      <description>Heavily guarded avenue.</description>
      <prompt>Iron portcullis with banners.</prompt>
    </tile>
  </grid>
</world_map>`;

    const tiles = UTILITY.parseMapGridXml(xml);
    assert.equal(tiles.length, 2);
    assert.equal(tiles[0].coords.x, 4);
    assert.equal(tiles[0].coords.y, 4);
    assert.equal(tiles[0].name, 'The "Citadel" of Light');
    assert.equal(tiles[0].description, 'The primary stronghold & sanctuary.');
    assert.equal(tiles[0].prompt, 'Cinematic view of massive stone citadel.');
    assert.equal(tiles[0].local_static_entries.length, 1);
    assert.equal(tiles[0].local_static_entries[0].title, 'Citadel Origins');
    assert.equal(tiles[0].local_static_entries[0].content, 'Constructed two centuries ago.');

    assert.equal(tiles[1].coords.x, 4);
    assert.equal(tiles[1].coords.y, 3);
    assert.equal(tiles[1].name, 'Northern Gate');
});

test('parseMapGridXml: extracts tile tags with child coordinate tags', () => {
    const xml = `<grid>
  <tile>
    <x>2</x>
    <y>3</y>
    <name>Old Mill</name>
    <description>Abandoned timber mill.</description>
    <visual_prompt>Waterwheel overgrown with moss.</visual_prompt>
  </tile>
</grid>`;

    const tiles = UTILITY.parseMapGridXml(xml);
    assert.equal(tiles.length, 1);
    assert.equal(tiles[0].coords.x, 2);
    assert.equal(tiles[0].coords.y, 3);
    assert.equal(tiles[0].name, 'Old Mill');
    assert.equal(tiles[0].prompt, 'Waterwheel overgrown with moss.');
});

test('parseMapGridXml: falls back to JSON format when model outputs json', () => {
    const json = JSON.stringify({
        grid: [
            { coords: { x: 1, y: 1 }, name: 'JSON Tower', description: 'Tower from json.', prompt: 'Moody tower.' },
            { coords: { x: 1, y: 2 }, name: 'JSON Bridge', description: 'Bridge from json.', prompt: 'Arched bridge.' }
        ]
    });

    const tiles = UTILITY.parseMapGridXml(json);
    assert.equal(tiles.length, 2);
    assert.equal(tiles[0].coords.x, 1);
    assert.equal(tiles[0].coords.y, 1);
    assert.equal(tiles[0].name, 'JSON Tower');
    assert.equal(tiles[1].coords.x, 1);
    assert.equal(tiles[1].coords.y, 2);
    assert.equal(tiles[1].name, 'JSON Bridge');
});

test('parseMapGridXml: returns empty array for null/empty/invalid input', () => {
    deepEq(UTILITY.parseMapGridXml(null), []);
    deepEq(UTILITY.parseMapGridXml(''), []);
    deepEq(UTILITY.parseMapGridXml('   '), []);
});

test('parseMapGridXml: recovers unclosed final <tile> when local model hits max_tokens', () => {
    const truncatedXml = `<world_map>
  <grid>
    <tile x="4" y="4">
      <name>Hearthstone Crossroads</name>
      <description>A warm timber inn standing at the convergence of three ancient basalt highways.</description>
      <prompt>Towering river-stone chimneys pour woodsmoke into the twilight sky while lantern light spills across rain-slicked cobblestones.</prompt>
    </tile>
    <tile x="4" y="3">
      <name>Wayfarer's Span</name>
      <description>A weathered granite bridge arching over the roaring Silverrun rapids, where toll-wardens inspect north-bound caravans.</description>
      <prompt>Massive moss-grown stone piers split the foaming white water below, filling the cool river air with perpetual mist and the thunder of current`;

    const tiles = UTILITY.parseMapGridXml(truncatedXml);
    assert.equal(tiles.length, 2);
    assert.equal(tiles[1].coords.x, 4);
    assert.equal(tiles[1].coords.y, 3);
    assert.equal(tiles[1].name, "Wayfarer's Span");
    assert.ok(tiles[1].description.includes('weathered granite bridge'));
    assert.ok(tiles[1].prompt.includes('Massive moss-grown stone piers'));
});

test('parseMapGridXml: cross-hydrates description and prompt so neither is left empty', () => {
    const xml = `<world_map>
  <grid>
    <tile x="2" y="2">
      <name>The Sunken Reliquary</name>
      <description>A flooded subterranean vault where copper braziers burn with pale alchemical fire above black water. The air smells of ozone, damp limestone, and centuries-old incense.</description>
    </tile>
  </grid>
</world_map>`;

    const tiles = UTILITY.parseMapGridXml(xml);
    assert.equal(tiles.length, 1);
    assert.ok(tiles[0].description.length > 50);
    assert.equal(tiles[0].prompt, tiles[0].description, 'Missing prompt should hydrate from rich description');
});

// ─── ensureMapGridCompleteness ─────────────────────────────────────────────

test('ensureMapGridCompleteness: returns exact 64 tiles spanning (0,0) to (7,7) for empty input', () => {
    const context = { scenario_name: 'The Outpost', brief_summary: 'A remote station.' };
    const grid = UTILITY.ensureMapGridCompleteness([], context);

    assert.equal(grid.length, 64);
    // Central hub anchored at (4,4)
    const hub = grid.find(t => t.coords.x === 4 && t.coords.y === 4);
    assert.ok(hub);
    assert.equal(hub.name, 'The Outpost');
    assert.equal(hub.description, 'A remote station.');

    // Every coordinate is covered exactly once
    const set = new Set();
    grid.forEach(t => {
        assert.ok(t.coords.x >= 0 && t.coords.x < 8);
        assert.ok(t.coords.y >= 0 && t.coords.y < 8);
        assert.ok(t.name && t.name.length > 0);
        assert.ok(t.description && t.description.length > 0);
        set.add(`${t.coords.x},${t.coords.y}`);
    });
    assert.equal(set.size, 64);
});

test('ensureMapGridCompleteness: preserves partial model output and interpolates connective terrain', () => {
    const partialTiles = [
        { coords: { x: 0, y: 0 }, name: 'Northwest Watch', description: 'Edge of map.', prompt: 'Rugged cliff.' },
        { coords: { x: 4, y: 4 }, name: 'Crown Citadel', description: 'Capital city.', prompt: 'Imperial palace.' },
        { coords: { x: 7, y: 7 }, name: 'Southeast Delta', description: 'Coastal outlet.', prompt: 'Misty marsh.' }
    ];

    const grid = UTILITY.ensureMapGridCompleteness(partialTiles, { scenario_name: 'Crown Citadel' });
    assert.equal(grid.length, 64);

    // Verify partial tiles are preserved
    const nw = grid.find(t => t.coords.x === 0 && t.coords.y === 0);
    assert.equal(nw.name, 'Northwest Watch');
    assert.equal(nw.description, 'Edge of map.');

    const center = grid.find(t => t.coords.x === 4 && t.coords.y === 4);
    assert.equal(center.name, 'Crown Citadel');

    const se = grid.find(t => t.coords.x === 7 && t.coords.y === 7);
    assert.equal(se.name, 'Southeast Delta');

    // Verify adjacent thoroughfares synthesized around (4,4)
    const northGate = grid.find(t => t.coords.x === 4 && t.coords.y === 3);
    assert.equal(northGate.name, 'Northern Gate Approach');

    const southRoad = grid.find(t => t.coords.x === 4 && t.coords.y === 5);
    assert.equal(southRoad.name, 'Southern Trade Way');
});

test('ensureMapGridCompleteness: reassigns duplicate coordinates to empty slots without dropping tiles', () => {
    const duplicateTiles = [
        { coords: { x: 2, y: 2 }, name: 'First Tile', description: 'First version.', prompt: 'Short' },
        { coords: { x: 2, y: 2 }, name: 'Second Tile Richer', description: 'A much longer and richer description of the second version.', prompt: 'Very detailed' }
    ];

    const grid = UTILITY.ensureMapGridCompleteness(duplicateTiles);
    assert.equal(grid.length, 64);

    const names = grid.map(t => t.name);
    assert.ok(names.includes('Second Tile Richer'));
    assert.ok(names.includes('First Tile'));
});

test('ensureMapGridCompleteness: synthesized fallback tiles contain rich multi-sentence sensory descriptions and prompts', () => {
    const grid = UTILITY.ensureMapGridCompleteness([], { scenario_name: 'Hearthstone' });
    const nonHub = grid.filter(t => !(t.coords.x === 4 && t.coords.y === 4));
    for (const tile of nonHub) {
        assert.ok(tile.description.length >= 120, `Fallback tile ${tile.name} description should be multi-sentence and sensory (got ${tile.description.length} chars)`);
        assert.ok(tile.prompt.length >= 200, `Fallback tile ${tile.name} prompt should be rich and atmospheric (got ${tile.prompt.length} chars)`);
    }
});

// ─── parseAdjacentLocationsXml ─────────────────────────────────────────────

test('parseAdjacentLocationsXml: parses XML locations with coordinates and decodes entities', () => {
    const xml = `<thought>Exploring fog-of-war...</thought>
<locations>
  <location x="3" y="4">
    <name>River Sluice &amp; Lock</name>
    <description>Regulates the western canal flow.</description>
    <prompt>Heavy timber gates &amp; misty water.</prompt>
  </location>
  <location x="5" y="4">
    <name>Wayfarer Camp</name>
    <description>Canvas tents &amp; pack mules.</description>
    <prompt>Smoke rising from campfires.</prompt>
  </location>
</locations>`;

    const locs = UTILITY.parseAdjacentLocationsXml(xml);
    assert.equal(locs.length, 2);
    assert.equal(locs[0].coords.x, 3);
    assert.equal(locs[0].coords.y, 4);
    assert.equal(locs[0].name, 'River Sluice & Lock');
    assert.equal(locs[0].description, 'Regulates the western canal flow.');
    assert.equal(locs[0].prompt, 'Heavy timber gates & misty water.');

    assert.equal(locs[1].coords.x, 5);
    assert.equal(locs[1].coords.y, 4);
    assert.equal(locs[1].name, 'Wayfarer Camp');
});

test('parseAdjacentLocationsXml: falls back to JSON payload', () => {
    const json = JSON.stringify({
        locations: [
            { coords: { x: 1, y: 2 }, name: 'JSON Post', description: 'Desc', prompt: 'Prompt' }
        ]
    });

    const locs = UTILITY.parseAdjacentLocationsXml(json);
    assert.equal(locs.length, 1);
    assert.equal(locs[0].coords.x, 1);
    assert.equal(locs[0].coords.y, 2);
    assert.equal(locs[0].name, 'JSON Post');
});

// ─── parseLocationCharactersXml ────────────────────────────────────────────

test('parseLocationCharactersXml: parses 3 NPC archetypes with roles and model instructions', () => {
    const xml = `<characters>
  <character>
    <name>Bram Thorne</name>
    <role>Normal: Lockkeeper</role>
    <short_description>Weathered canal worker.</short_description>
    <personal_goal>Keep the gates operational.</personal_goal>
    <reason_for_being_there>Working daily shift.</reason_for_being_there>
    <appearance>Grease-stained tunic, heavy boots.</appearance>
    <description>Bram has worked here for 20 years.</description>
    <model_instructions>Speak with short gruff answers.</model_instructions>
  </character>
  <character>
    <name>Captain Vael</name>
    <role>Impactful: Port Authority</role>
    <short_description>Rigid patrol commander.</short_description>
    <personal_goal>Inspect all cargo manifests.</personal_goal>
    <reason_for_being_there>Leading the garrison.</reason_for_being_there>
    <appearance>Polished breastplate, iron rapier.</appearance>
    <description>A decorated veteran who tolerates no contraband.</description>
    <model_instructions>Formal, demanding, uncompromising.</model_instructions>
  </character>
  <character>
    <name>The Whispering Beggar</name>
    <role>Mysterious: Information Broker</role>
    <short_description>A hooded figure in the shadows.</short_description>
    <personal_goal>Sell secrets regarding the guild.</personal_goal>
    <reason_for_being_there>Tracking the user party.</reason_for_being_there>
    <appearance>Tattered cloak, silver signet ring beneath rags.</appearance>
    <description>No one knows his true heritage, but his intelligence is always accurate.</description>
    <model_instructions>Whisper in riddles and demand silver.</model_instructions>
  </character>
</characters>`;

    const npcs = UTILITY.parseLocationCharactersXml(xml, 'Canal Lock 4');
    assert.equal(npcs.length, 3);
    assert.equal(npcs[0].name, 'Bram Thorne');
    assert.equal(npcs[0].role, 'Normal: Lockkeeper');
    assert.equal(npcs[0].personal_goal, 'Keep the gates operational.');
    assert.equal(npcs[0].model_instructions, 'Speak with short gruff answers.');

    assert.equal(npcs[1].name, 'Captain Vael');
    assert.equal(npcs[1].role, 'Impactful: Port Authority');

    assert.equal(npcs[2].name, 'The Whispering Beggar');
    assert.equal(npcs[2].role, 'Mysterious: Information Broker');
});

test('parseLocationCharactersXml: falls back to JSON payload', () => {
    const json = JSON.stringify({
        characters: [
            { name: 'JSON NPC', role: 'Normal: Baker', short_description: 'Bakes bread.' }
        ]
    });

    const npcs = UTILITY.parseLocationCharactersXml(json, 'Town Bakery');
    assert.equal(npcs.length, 1);
    assert.equal(npcs[0].name, 'JSON NPC');
    assert.equal(npcs[0].role, 'Normal: Baker');
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

test('resolvePromptText: extracts plain text from strings, objects, and nested structures', () => {
    assert.equal(UTILITY.resolvePromptText('hello world'), 'hello world');
    assert.equal(UTILITY.resolvePromptText({ text: 'prompt text', images: [] }), 'prompt text');
    assert.equal(UTILITY.resolvePromptText({ prompt: 'prompt text', model: 'gemini' }), 'prompt text');
    assert.equal(UTILITY.resolvePromptText({ prompt: { text: 'nested prompt' } }), 'nested prompt');
    assert.equal(UTILITY.resolvePromptText(null), '');
    assert.equal(UTILITY.resolvePromptText(undefined), '');
});

test('getEntryCategory: resolves category from title tag or entry object category property', () => {
    assert.equal(UTILITY.getEntryCategory('[Event] Battle of Waterloo'), 'event');
    assert.equal(UTILITY.getEntryCategory('[Character: Arthur]'), 'character');
    assert.equal(UTILITY.getEntryCategory('[Item] Excalibur'), 'item');
    assert.equal(UTILITY.getEntryCategory('[World] Camelot'), 'world');
    assert.equal(UTILITY.getEntryCategory('[Relationship] Arthur & Guinevere'), 'relationship');
    assert.equal(UTILITY.getEntryCategory('Plain Lore Title'), 'other');
    assert.equal(UTILITY.getEntryCategory({ title: 'Plain Lore', category: 'world' }), 'world');
    assert.equal(UTILITY.getEntryCategory({ title: '[Event] Siege', category: 'event' }), 'event');
    assert.equal(UTILITY.getEntryCategory({ title: '[Item] Ring', category: 'other' }), 'item');
    assert.equal(UTILITY.getEntryCategory(null), 'other');
});

test('formatTitleWithCategory: applies and updates category tags on title strings correctly', () => {
    assert.equal(UTILITY.formatTitleWithCategory('Dragon Attack', 'event'), '[Event] Dragon Attack');
    assert.equal(UTILITY.formatTitleWithCategory('Arthur', 'character'), '[Character: Arthur]');
    assert.equal(UTILITY.formatTitleWithCategory('Excalibur', 'item'), '[Item] Excalibur');
    assert.equal(UTILITY.formatTitleWithCategory('Camelot', 'world'), '[World] Camelot');
    assert.equal(UTILITY.formatTitleWithCategory('Arthur & Guinevere', 'relationship'), '[Relationship] Arthur & Guinevere');
    assert.equal(UTILITY.formatTitleWithCategory('[Event] Dragon Attack', 'world'), '[World] Dragon Attack');
    assert.equal(UTILITY.formatTitleWithCategory('[Item] Magic Wand', 'other'), 'Magic Wand');
    assert.equal(UTILITY.formatTitleWithCategory('', 'event'), '[Event] Untitled');
});

// ─── normalizeVisionEndpoint ──────────────────────────────────────────────

test('normalizeVisionEndpoint: bare host gains a scheme', () => {
    assert.equal(UTILITY.normalizeVisionEndpoint('localhost:5001'), 'http://localhost:5001');
    assert.equal(UTILITY.normalizeVisionEndpoint('192.168.1.40:1234'), 'http://192.168.1.40:1234');
});

test('normalizeVisionEndpoint: existing scheme is preserved, including https', () => {
    assert.equal(UTILITY.normalizeVisionEndpoint('http://localhost:5001'), 'http://localhost:5001');
    assert.equal(UTILITY.normalizeVisionEndpoint('https://vision.example.com'), 'https://vision.example.com');
});

test('normalizeVisionEndpoint: trailing slashes are stripped', () => {
    assert.equal(UTILITY.normalizeVisionEndpoint('http://localhost:5001/'), 'http://localhost:5001');
    assert.equal(UTILITY.normalizeVisionEndpoint('http://localhost:5001///'), 'http://localhost:5001');
});

test('normalizeVisionEndpoint: a pasted chat-completions path collapses to the origin', () => {
    // People copy the full URL out of provider docs. All of these must reach the same base,
    // or VisionBridgeService would build http://host/v1/chat/completions/v1/chat/completions.
    assert.equal(UTILITY.normalizeVisionEndpoint('http://localhost:5001/v1/chat/completions'), 'http://localhost:5001');
    assert.equal(UTILITY.normalizeVisionEndpoint('http://localhost:5001/v1/chat/completions/'), 'http://localhost:5001');
    assert.equal(UTILITY.normalizeVisionEndpoint('http://localhost:5001/chat/completions'), 'http://localhost:5001');
    assert.equal(UTILITY.normalizeVisionEndpoint('http://localhost:5001/v1'), 'http://localhost:5001');
    assert.equal(UTILITY.normalizeVisionEndpoint('http://localhost:5001/v1/'), 'http://localhost:5001');
});

test('normalizeVisionEndpoint: whitespace is tolerated', () => {
    assert.equal(UTILITY.normalizeVisionEndpoint('  http://localhost:5001  '), 'http://localhost:5001');
    assert.equal(UTILITY.normalizeVisionEndpoint('http://local host:5001'), 'http://localhost:5001');
});

test('normalizeVisionEndpoint: unusable input yields an empty string, never a bare scheme', () => {
    // The caller treats "" as "fall back to the default port". Returning "http://" would
    // instead produce a real fetch to a nonsense URL.
    assert.equal(UTILITY.normalizeVisionEndpoint(''), '');
    assert.equal(UTILITY.normalizeVisionEndpoint('   '), '');
    assert.equal(UTILITY.normalizeVisionEndpoint('/v1/chat/completions'), '');
    assert.equal(UTILITY.normalizeVisionEndpoint(null), '');
    assert.equal(UTILITY.normalizeVisionEndpoint(undefined), '');
    assert.equal(UTILITY.normalizeVisionEndpoint(42), '');
});

// ─── buildVisionContextBlock ──────────────────────────────────────────────

test('buildVisionContextBlock: nothing describable yields an empty string', () => {
    // "" is the signal that the bridge produced nothing, so callAI falls back to the
    // original no-vision notice. Any non-empty string here would be injected verbatim.
    assert.equal(UTILITY.buildVisionContextBlock([]), '');
    assert.equal(UTILITY.buildVisionContextBlock(['', '   ']), '');
    assert.equal(UTILITY.buildVisionContextBlock(null), '');
    assert.equal(UTILITY.buildVisionContextBlock('a string, not an array'), '');
});

test('buildVisionContextBlock: a single image is not numbered', () => {
    const out = UTILITY.buildVisionContextBlock(['A red bicycle leaning on a wall.']);
    assert.ok(out.includes('an image'), 'should read naturally for one image');
    assert.ok(out.includes('A red bicycle leaning on a wall.'));
    assert.ok(!out.includes('Image 1:'), 'single image should not be enumerated');
});

test('buildVisionContextBlock: multiple images are numbered in order', () => {
    const out = UTILITY.buildVisionContextBlock(['First scene.', 'Second scene.']);
    assert.ok(out.includes('2 images'));
    assert.ok(out.includes('Image 1: First scene.'));
    assert.ok(out.includes('Image 2: Second scene.'));
    assert.ok(out.indexOf('Image 1:') < out.indexOf('Image 2:'), 'order must match upload order');
});

test('buildVisionContextBlock: blank entries are dropped without disturbing numbering', () => {
    const out = UTILITY.buildVisionContextBlock(['Kept one.', '   ', 'Kept two.']);
    assert.ok(out.includes('2 images'));
    assert.ok(out.includes('Image 1: Kept one.'));
    assert.ok(out.includes('Image 2: Kept two.'));
    assert.ok(!out.includes('Image 3:'));
});

test('buildVisionContextBlock: entries are trimmed', () => {
    const out = UTILITY.buildVisionContextBlock(['  padded description  ']);
    assert.ok(out.includes('padded description'));
    assert.ok(!out.includes('  padded description  '));
});

test('buildVisionContextBlock: instructs the model never to reveal the mechanism', () => {
    // The whole point of silent injection. A character replying "based on the image
    // description provided" breaks immersion and would make the feature worse than useless.
    const out = UTILITY.buildVisionContextBlock(['A quiet street at dusk.']);
    assert.ok(out.includes('[VISUAL CONTEXT]'));
    assert.ok(/never mention this/i.test(out));
    assert.ok(/described to you/i.test(out));
});


// ─── sanitizeDebugLog ────────────────────────────────────────────────────────

test('sanitizeDebugLog: nullish or empty string returns empty string', () => {
    assert.equal(UTILITY.sanitizeDebugLog(''), '');
    assert.equal(UTILITY.sanitizeDebugLog(null), '');
    assert.equal(UTILITY.sanitizeDebugLog(undefined), '');
});

test('sanitizeDebugLog: redacts Gemini API keys', () => {
    const dummySuffix = 'A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q';
    const dummyKey = ['AIza', 'Sy', dummySuffix].join('');
    const raw = `Calling Gemini with key ${dummyKey} in request`;
    const sanitized = UTILITY.sanitizeDebugLog(raw);
    assert.ok(!sanitized.includes(dummySuffix));
    assert.ok(sanitized.includes('AIzaSy[REDACTED]'));
});

test('sanitizeDebugLog: redacts OpenRouter API keys', () => {
    const dummyHex = '0123456789abcdef'.repeat(4);
    const dummyKey = ['sk', 'or', 'v1', dummyHex].join('-');
    const raw = `Auth: Bearer ${dummyKey}`;
    const sanitized = UTILITY.sanitizeDebugLog(raw);
    assert.ok(!sanitized.includes('0123456789abcdef'));
    assert.ok(sanitized.includes('sk-or-v1-[REDACTED]'));
});

test('sanitizeDebugLog: redacts OpenAI format sk- keys', () => {
    const dummySuffix = '1234567890abcdef1234567890';
    const dummyKey = ['sk', dummySuffix].join('-');
    const raw = `Key ${dummyKey} loaded`;
    const sanitized = UTILITY.sanitizeDebugLog(raw);
    assert.ok(!sanitized.includes(dummySuffix));
    assert.ok(sanitized.includes('sk-[REDACTED]'));
});

test('sanitizeDebugLog: redacts JSON apiKey and password fields', () => {
    const raw = '{"geminiApiKey": "AIzaSySecretKey", "openrouterApiKey": "sk-or-secret", "password": "pass"}';
    const sanitized = UTILITY.sanitizeDebugLog(raw);
    assert.ok(!sanitized.includes('AIzaSySecretKey'));
    assert.ok(!sanitized.includes('sk-or-secret'));
    assert.ok(!sanitized.includes('"pass"'));
    assert.ok(sanitized.includes('"geminiApiKey": "[REDACTED]"'));
    assert.ok(sanitized.includes('"password": "[REDACTED]"'));
});

test('sanitizeDebugLog: preserves normal log lines without sensitive keys', () => {
    const raw = '[2026-10-23T10:00:00Z] [KOBOLD/STDOUT] Model loaded on port 5001 with 20480 context';
    assert.equal(UTILITY.sanitizeDebugLog(raw), raw);
});

// ─── formatDiagnosticReport ──────────────────────────────────────────────────

test('formatDiagnosticReport: handles null/empty metadata and empty logs gracefully', () => {
    const report = UTILITY.formatDiagnosticReport(null, []);
    assert.ok(typeof report === 'string');
    assert.ok(report.includes('DEBUG & DIAGNOSTIC REPORT'));
    assert.ok(report.includes('(No log entries recorded)'));
});

test('formatDiagnosticReport: includes application version, platform, and log entries', () => {
    const meta = {
        appVersion: '1.2.3',
        platform: 'win32',
        arch: 'x64',
        osRelease: '10.0.22631',
        totalRam: '32.00 GB',
        freeRam: '16.50 GB',
        koboldStatus: 'running',
        koboldVersion: 'v1.82',
        clientState: {
            activeProvider: 'koboldcpp',
            storyCount: 5
        }
    };
    const logs = [
        '[2026-10-23T10:00:00Z] [MAIN/INFO] Server starting',
        '[2026-10-23T10:00:01Z] [KOBOLD/STDOUT] Ready'
    ];
    const report = UTILITY.formatDiagnosticReport(meta, logs);
    assert.ok(report.includes('App Version: 1.2.3'));
    assert.ok(report.includes('Platform: win32 (x64)'));
    assert.ok(report.includes('Detected Local Version: v1.82'));
    assert.ok(report.includes('Active Provider: koboldcpp'));
    assert.ok(report.includes('Server starting'));
    assert.ok(report.includes('Ready'));
    assert.ok(report.includes('END OF REPORT'));
});

// ─── parsePortFromUrl ──────────────────────────────────────────────────────

test('parsePortFromUrl: extracts port from standard localhost url', () => {
    assert.equal(UTILITY.parsePortFromUrl('http://localhost:5001'), 5001);
    assert.equal(UTILITY.parsePortFromUrl('http://127.0.0.1:5001/'), 5001);
    assert.equal(UTILITY.parsePortFromUrl('http://localhost:8080/api'), 8080);
});

test('parsePortFromUrl: returns default port when no port specified', () => {
    assert.equal(UTILITY.parsePortFromUrl('http://localhost'), 5001);
    assert.equal(UTILITY.parsePortFromUrl('http://localhost/'), 5001);
    assert.equal(UTILITY.parsePortFromUrl('http://localhost', 8000), 8000);
});

test('parsePortFromUrl: returns default port for null, undefined, empty, or invalid input', () => {
    assert.equal(UTILITY.parsePortFromUrl(null), 5001);
    assert.equal(UTILITY.parsePortFromUrl(undefined), 5001);
    assert.equal(UTILITY.parsePortFromUrl(''), 5001);
    assert.equal(UTILITY.parsePortFromUrl('not-a-url'), 5001);
    assert.equal(UTILITY.parsePortFromUrl('http://localhost:999999'), 5001);
});

// ─── checkKoboldCompatibility ──────────────────────────────────────────────

test('checkKoboldCompatibility: handles empty or null input', () => {
    deepEq(UTILITY.checkKoboldCompatibility(null, 'v1.82'), { compatible: true, archName: '', requiredVersion: '' });
    deepEq(UTILITY.checkKoboldCompatibility('', 'v1.82'), { compatible: true, archName: '', requiredVersion: '' });
});

test('checkKoboldCompatibility: detects Jinja embedded templates and version requirements', () => {
    const res1 = UTILITY.checkKoboldCompatibility('jinja', 'v1.82');
    assert.equal(res1.compatible, true);
    assert.equal(res1.archName, 'Jinja Embedded Templates');
    assert.equal(res1.requiredVersion, '1.75');

    const res2 = UTILITY.checkKoboldCompatibility('--jinja', 'v1.70');
    assert.equal(res2.compatible, false);
});

test('checkKoboldCompatibility: detects Llama 3 architecture requirement', () => {
    const res1 = UTILITY.checkKoboldCompatibility('llama3', 'v1.65');
    assert.equal(res1.compatible, true);
    assert.equal(res1.archName, 'Llama 3 Architecture');

    const res2 = UTILITY.checkKoboldCompatibility('llama-3', 'v1.60');
    assert.equal(res2.compatible, false);
});

test('checkKoboldCompatibility: detects Gemma 4 architecture requirement', () => {
    const res1 = UTILITY.checkKoboldCompatibility('Gemma4-26B-A4B-Uncensored-HauhauCS-Balanced-Q4_K_P.gguf', 'v1.123.1');
    assert.equal(res1.compatible, true);
    assert.equal(res1.archName, 'Gemma 4 Architecture');
    assert.equal(res1.requiredVersion, '1.75');

    const res2 = UTILITY.checkKoboldCompatibility('gemma4', 'v1.70');
    assert.equal(res2.compatible, false);
});

test('checkKoboldCompatibility: detects Gemma 2 architecture requirement', () => {
    const res1 = UTILITY.checkKoboldCompatibility('gemma2', 'v1.72');
    assert.equal(res1.compatible, true);
    assert.equal(res1.archName, 'Gemma 2 Architecture');

    const res2 = UTILITY.checkKoboldCompatibility('gemma-2', 'v1.68');
    assert.equal(res2.compatible, false);
});

test('checkKoboldCompatibility: reports incompatible when currentVersion is unknown', () => {
    const res = UTILITY.checkKoboldCompatibility('llama3', 'unknown');
    assert.equal(res.compatible, false);
    assert.equal(res.archName, 'Llama 3 Architecture');
});


test('checkKoboldCompatibility: detects Orion architecture requirement (e.g. TheDrummer_Orion)', () => {
    const res1 = UTILITY.checkKoboldCompatibility('TheDrummer_Orion-26B-A4B-v1.1-Q4_K_M.gguf', 'v1.75');
    assert.equal(res1.compatible, true);
    assert.equal(res1.archName, 'Orion Architecture');
    assert.equal(res1.requiredVersion, '1.65');

    const res2 = UTILITY.checkKoboldCompatibility('orion-14b', 'v1.60');
    assert.equal(res2.compatible, false);
});

// ─── applyChatTemplate (KoboldCPP formatting) ──────────────────────────────

test('applyChatTemplate: returns empty string on nullish or non-string prompt', () => {
    assert.equal(UTILITY.applyChatTemplate(null, 'chatml'), '');
    assert.equal(UTILITY.applyChatTemplate(undefined, 'llama3'), '');
    assert.equal(UTILITY.applyChatTemplate(12345, 'gemma'), '');
});

test('applyChatTemplate: returns raw prompt for none or autoguess', () => {
    assert.equal(UTILITY.applyChatTemplate('Hello world', 'none'), 'Hello world');
    assert.equal(UTILITY.applyChatTemplate('Hello world', 'autoguess'), 'Hello world');
    assert.equal(UTILITY.applyChatTemplate('Hello world', 'jinja'), 'Hello world');
    assert.equal(UTILITY.applyChatTemplate('Hello world', ''), 'Hello world');
});

test('applyChatTemplate: formats ChatML template', () => {
    const formatted = UTILITY.applyChatTemplate('Hello world', 'chatml');
    assert.equal(formatted, '<|im_start|>user\nHello world<|im_end|>\n<|im_start|>assistant\n');
});

test('applyChatTemplate: formats Llama 3 template', () => {
    const formatted = UTILITY.applyChatTemplate('Hello world', 'llama3');
    assert.equal(formatted, '<|begin_of_text|><|start_header_id|>user<|end_header_id|>\n\nHello world<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n');
});

test('applyChatTemplate: formats Gemma template', () => {
    const formatted = UTILITY.applyChatTemplate('Hello world', 'gemma');
    assert.equal(formatted, '<start_of_turn>user\nHello world<end_of_turn>\n<start_of_turn>model\n');
});

test('applyChatTemplate: formats Mistral template', () => {
    const formatted = UTILITY.applyChatTemplate('Hello world', 'mistral');
    assert.equal(formatted, '<s>[INST] Hello world [/INST]');
});

test('applyChatTemplate: formats Alpaca template', () => {
    const formatted = UTILITY.applyChatTemplate('Hello world', 'alpaca');
    assert.equal(formatted, '### Instruction:\nHello world\n\n### Response:\n');
});

test('applyChatTemplate: prevents double-wrapping on pre-templated text', () => {
    const chatml = '<|im_start|>user\nAlready wrapped<|im_end|>\n';
    assert.equal(UTILITY.applyChatTemplate(chatml, 'chatml'), chatml);

    const llama3 = '<|start_header_id|>user<|end_header_id|>\nPre-wrapped<|eot_id|>';
    assert.equal(UTILITY.applyChatTemplate(llama3, 'llama3'), llama3);
});

// ─── isRoleplayActive ──────────────────────────────────────────────────────────

test('isRoleplayActive: returns false for nullish or invalid input', () => {
    assert.equal(UTILITY.isRoleplayActive(null), false);
    assert.equal(UTILITY.isRoleplayActive(undefined), false);
    assert.equal(UTILITY.isRoleplayActive('not an object'), false);
    assert.equal(UTILITY.isRoleplayActive(123), false);
});

test('isRoleplayActive: returns false when active_story_id or active_narrative_id is missing/empty', () => {
    assert.equal(UTILITY.isRoleplayActive({}), false);
    assert.equal(UTILITY.isRoleplayActive({ active_story_id: 'story-1' }), false);
    assert.equal(UTILITY.isRoleplayActive({ active_narrative_id: 'nar-1' }), false);
    assert.equal(UTILITY.isRoleplayActive({ active_story_id: 'story-1', active_narrative_id: null }), false);
    assert.equal(UTILITY.isRoleplayActive({ active_story_id: '', active_narrative_id: 'nar-1' }), false);
    assert.equal(UTILITY.isRoleplayActive({ active_story_id: 'story-1', active_narrative_id: '' }), false);
});

test('isRoleplayActive: returns true when both active_story_id and active_narrative_id are set', () => {
    assert.equal(UTILITY.isRoleplayActive({ active_story_id: 'story-1', active_narrative_id: 'nar-1' }), true);
});

// ─── extractKoboldProgress & isKoboldFatalError ──────────────────────────────

test('extractKoboldProgress: extracts layer offload progress', () => {
    assert.equal(
        UTILITY.extractKoboldProgress('llm_load_tensors: offloaded 31/31 layers to CUDA'),
        'Offloading 31/31 layers to GPU...'
    );
    assert.equal(
        UTILITY.extractKoboldProgress('[STDERR] offloaded 24/32 layers to GPU'),
        'Offloading 24/32 layers to GPU...'
    );
});

test('extractKoboldProgress: extracts tensor load progress', () => {
    assert.equal(
        UTILITY.extractKoboldProgress('llama_model_loader: loaded 31 tensors from file'),
        'Loading model tensors (31 detected)...'
    );
});

test('extractKoboldProgress: extracts GPU VRAM detection', () => {
    assert.equal(
        UTILITY.extractKoboldProgress('Detected Available GPU Memory: 12282 MB'),
        'Detected 12282 MB GPU memory...'
    );
});

test('extractKoboldProgress: extracts model loading, threadpool, and template initialization', () => {
    assert.equal(
        UTILITY.extractKoboldProgress('Loading Text Model: D:\\models\\model.gguf'),
        'Loading GGUF model file...'
    );
    assert.equal(
        UTILITY.extractKoboldProgress('attach_threadpool: call'),
        'Initializing compute threadpool...'
    );
    assert.equal(
        UTILITY.extractKoboldProgress('Chat Completions Adapter Loaded'),
        'Chat template initialized...'
    );
    assert.equal(
        UTILITY.extractKoboldProgress('Initializing dynamic library: koboldcpp_cublas.dll'),
        'Initializing GPU acceleration libraries...'
    );
});

test('extractKoboldProgress: returns null for non-progress lines and invalid inputs', () => {
    assert.equal(UTILITY.extractKoboldProgress(''), null);
    assert.equal(UTILITY.extractKoboldProgress(null), null);
    assert.equal(UTILITY.extractKoboldProgress('Namespace(admin=False, port=5001)'), null);
    assert.equal(UTILITY.extractKoboldProgress('The hero stepped into the dungeon.'), null);
});

test('isKoboldFatalError: identifies explicit application errors and fatal crashes', () => {
    assert.equal(UTILITY.isKoboldFatalError('[ERROR] KoboldCPP exited unexpectedly with code 1.'), true);
    assert.equal(UTILITY.isKoboldFatalError('fatal error: out of memory allocating 8GB VRAM'), true);
    assert.equal(UTILITY.isKoboldFatalError('CUDA error: out of memory'), true);
    assert.equal(UTILITY.isKoboldFatalError('fatal: failed to load model from disk'), true);
});

test('isKoboldFatalError: does not misidentify normal operational logs, stderr, or progress as fatal', () => {
    assert.equal(UTILITY.isKoboldFatalError('llama_model_loader: loaded 31 tensors'), false);
    assert.equal(UTILITY.isKoboldFatalError('[STDERR] attach_threadpool: call'), false);
    assert.equal(UTILITY.isKoboldFatalError('Auto Recommended GPU Layers: 0'), false);
    assert.equal(UTILITY.isKoboldFatalError('Detected Available GPU Memory: 12282 MB'), false);
    assert.equal(UTILITY.isKoboldFatalError('Please connect to custom endpoint at http://127.0.0.1:5001'), false);
    assert.equal(UTILITY.isKoboldFatalError(null), false);
    assert.equal(UTILITY.isKoboldFatalError(''), false);
});

// ─── Thinking vs Response Management in Story Architect ───────────────────────

test('extractThinking: extracts unbracketed preamble preceding <response> into thinking', () => {
    const raw = 'Synthesize the provided User Concept into the required Output Format. Ensure all constraints (Banned Names, Banned Roles, Banned Vocabulary, etc.) are meticulously adhered to. Be hyper-creative, evocative, and deeply immersive. Avoid all generic tropes; aim for literary quality.\n\n<response>\n  <title>Neon Citadel</title>\n  <creator_notes>A high-tech cyber thriller.</creator_notes>\n</response>';
    const res = UTILITY.extractThinking(raw);
    assert.ok(res.thinking.includes('Synthesize the provided User Concept'));
    assert.ok(res.thinking.includes('Banned Names'));
    assert.ok(res.content.startsWith('<response>'));
    assert.ok(res.content.includes('<title>Neon Citadel</title>'));
});

test('extractThinking: extracts markdown ### Thinking headers into thinking', () => {
    const raw = '### Thinking\nEvaluating cast balance and ensuring no cliches.\n### Response\n<response><title>Solaris Verge</title></response>';
    const res = UTILITY.extractThinking(raw);
    assert.ok(res.thinking.includes('Evaluating cast balance'));
    assert.ok(res.content.includes('<response><title>Solaris Verge</title></response>'));
});

test('parseStoryFoundationXml: cleans pre-response preamble and extracts valid XML story foundation', () => {
    const raw = 'Synthesize the provided User Concept into the required Output Format. Ensure all constraints (Banned Names, Banned Roles, Banned Vocabulary, etc.) are meticulously adhered to.\n\n<response>\n  <title>The Clockwork Engine</title>\n  <creator_notes>A subterranean steampunk adventure.</creator_notes>\n  <tags>steampunk, mystery</tags>\n  <cast_roster>\n    <character><name>Alex</name><role>User</role><archetype>Mechanic</archetype></character>\n  </cast_roster>\n</response>';
    const result = UTILITY.parseStoryFoundationXml(raw);
    assert.equal(result.title, 'The Clockwork Engine');
    assert.equal(result.creator_notes, 'A subterranean steampunk adventure.');
    assert.equal(result.characters[0].name, 'Alex');
});

test('parseStoryFoundationXml: pure prompt echo / instruction restatement without tags is rejected', () => {
    const echo = 'Synthesize the provided User Concept into the required Output Format. Ensure all constraints (Banned Names, Banned Roles, Banned Vocabulary, etc.) are meticulously adhered to. Be hyper-creative, evocative, and deeply immersive. Avoid all generic tropes; aim for literary quality.';
    const result = UTILITY.parseStoryFoundationXml(echo);
    assert.equal(result.creator_notes, '');
    assert.equal(result.title, 'Untitled Story');
});

test('PromptBuilder: buildStoryFoundationPrompt includes mandatory immediate <response> execution directive', () => {
    const prompt = PromptBuilder.buildStoryFoundationPrompt('A rogue AI on a generation ship');
    assert.ok(prompt.includes('EXECUTION DIRECTIVE:'));
    assert.ok(prompt.includes('Your output MUST begin immediately with the opening tag <response>'));
});

test('PromptBuilder: buildScenarioFoundationPrompt includes mandatory immediate <response> execution directive', () => {
    const prompt = PromptBuilder.buildScenarioFoundationPrompt({ name: 'Starship Odyssey' }, 'The reactor fails');
    assert.ok(prompt.includes('EXECUTION DIRECTIVE:'));
    assert.ok(prompt.includes('Your output MUST begin immediately with the opening tag <response>'));
});


// ─── Portrait & Image Generation Safeguards (Story Architect Bug Fixes) ──────

test('isRenderableImageSrc: rejects nullish, empty, local_idb_ markers, and template placeholders', () => {
    assert.equal(UTILITY.isRenderableImageSrc(null), false);
    assert.equal(UTILITY.isRenderableImageSrc(undefined), false);
    assert.equal(UTILITY.isRenderableImageSrc(''), false);
    assert.equal(UTILITY.isRenderableImageSrc('   '), false);
    assert.equal(UTILITY.isRenderableImageSrc('undefined'), false);
    assert.equal(UTILITY.isRenderableImageSrc('null'), false);
    assert.equal(UTILITY.isRenderableImageSrc('local_idb_char_123'), false);
    assert.equal(UTILITY.isRenderableImageSrc('local_idb_persona_456'), false);
    assert.equal(UTILITY.isRenderableImageSrc('local_idb_bg_789'), false);
    assert.equal(UTILITY.isRenderableImageSrc('local_something'), false);
    assert.equal(UTILITY.isRenderableImageSrc('${imgSrc}'), false);
    assert.equal(UTILITY.isRenderableImageSrc('http://example.com/${imgSrc}'), false);
});

test('isRenderableImageSrc: accepts valid blob, data, http/https, and relative asset URLs', () => {
    assert.equal(UTILITY.isRenderableImageSrc('blob:http://localhost:3000/abc-123'), true);
    assert.equal(UTILITY.isRenderableImageSrc('data:image/png;base64,iVBORw0KGgo='), true);
    assert.equal(UTILITY.isRenderableImageSrc('https://example.com/avatar.png'), true);
    assert.equal(UTILITY.isRenderableImageSrc('assets/demo/hearthstone_inn.png'), true);
});

test('getDefaultApiSettings: initializes imageGenBackend to disabled so unconfigured installs do not trigger broken image gen', () => {
    const defaults = UTILITY.getDefaultApiSettings();
    assert.equal(defaults.imageGenBackend, 'disabled');
});

test('getDefaultUserCharacter: defaults image_url to empty string unless includeDemoAssets is true', () => {
    const genericUser = UTILITY.getDefaultUserCharacter();
    assert.equal(genericUser.image_url, '');

    const demoUser = UTILITY.getDefaultUserCharacter({ includeDemoAssets: true });
    assert.ok(demoUser.image_url.includes('assets/demo/user.png'));
});

test('StoryGenerationPipeline.runCastingPhase: skips image generation when shouldGenerateImages is false', async () => {
    const pipeline = loadStoryGenerationPipeline();
    let imgGenCalls = 0;
    pipeline._callAgentText = async () => `<response><character_registry><name>Echo</name><first_person_interview>Hello</first_person_interview><visual_profile>Tall</visual_profile></character_registry></response>`;

    const customPipeline = vm.runInNewContext(extractBlock('StoryGenerationPipeline') + '\nStoryGenerationPipeline', {
        UTILITY,
        PromptBuilder,
        APIService: {},
        LibraryController: {},
        NarrativeController: { CONSTANTS: { CHARACTER_COLORS: [{ base: '#334155', bold: '#94a3b8' }] } },
        ImageGenerationService: { generateImage: async () => { imgGenCalls++; return { size: 100 }; } },
        DBService: { saveStory: async () => true, saveImage: async () => true },
        UIManager: { isImageGenEnabled: () => true, RUNTIME: { characterImageCache: {} } },
        console,
        setTimeout,
        clearTimeout,
        URL: { createObjectURL: () => 'blob:mock' }
    });
    customPipeline._callAgentText = pipeline._callAgentText;

    const draft = { name: 'Test', creator_notes: 'Notes', characters: [], static_entries: [] };
    const concept = {
        brief_summary: 'Conflict',
        relationship_context: 'None',
        characters: [
            { name: 'Echo', role: 'PrimaryAI', archetype: 'Synth' },
            { name: 'Krell', role: 'Support', archetype: 'Guard' }
        ]
    };

    await customPipeline.runCastingPhase(draft, concept, () => {}, { shouldGenerateImages: false });
    assert.equal(imgGenCalls, 0, 'Should not call generateImage when shouldGenerateImages is false');
    assert.equal(draft.characters[0].image_url, '');
    assert.equal(draft.characters[1].image_url, '');
});

test('StoryGenerationPipeline.runCastingPhase: generates 1 base portrait per character (no burst emotion I2I spam) when enabled', async () => {
    let imgGenCalls = [];
    const customPipeline = vm.runInNewContext(extractBlock('StoryGenerationPipeline') + '\nStoryGenerationPipeline', {
        UTILITY,
        PromptBuilder,
        APIService: {},
        LibraryController: {},
        NarrativeController: { CONSTANTS: { CHARACTER_COLORS: [{ base: '#334155', bold: '#94a3b8' }] } },
        ImageGenerationService: {
            generateImage: async (prompt, neg, opts, initImg) => {
                imgGenCalls.push({ prompt, initImg });
                return { size: 100 };
            }
        },
        DBService: { saveStory: async () => true, saveImage: async () => true },
        UIManager: { isImageGenEnabled: () => true, RUNTIME: { characterImageCache: {} } },
        console,
        setTimeout,
        clearTimeout,
        URL: { createObjectURL: () => 'blob:mock-valid' }
    });
    customPipeline._callAgentText = async (p) => `<response><character_registry><name>Char</name><first_person_interview>Bio</first_person_interview><visual_profile>Vivid appearance</visual_profile></character_registry></response>`;

    const draft = { name: 'Test', creator_notes: 'Notes', characters: [], static_entries: [] };
    const concept = {
        brief_summary: 'Conflict',
        relationship_context: 'None',
        characters: [
            { name: 'Echo', role: 'PrimaryAI', archetype: 'Synth' },
            { name: 'Krell', role: 'Support', archetype: 'Guard' },
            { name: 'Vex', role: 'Rival', archetype: 'Hacker' }
        ]
    };

    await customPipeline.runCastingPhase(draft, concept, () => {}, { shouldGenerateImages: true });
    assert.equal(imgGenCalls.length, 3, 'Should generate exactly 1 base portrait per character (3 total) without I2I emotion burst');
    assert.ok(imgGenCalls.every(c => !c.initImg), 'All casting portrait calls should be primary txt2img without initImg');
    assert.ok(draft.characters.filter(c => !c.is_user).every(c => c.image_url.startsWith('local_idb_')));
});

test('InStoryGenerationPipeline.runCastingPhase: respects shouldGenerateImages option and generates 1 base portrait per new character when enabled', async () => {
    let imgGenCalls = [];
    const buildInStorySandbox = () => {
        const customPipeline = vm.runInNewContext(extractBlock('InStoryGenerationPipeline') + '\nInStoryGenerationPipeline', {
            UTILITY,
            PromptBuilder,
            APIService: {},
            LibraryController: {},
            NarrativeController: { CONSTANTS: { CHARACTER_COLORS: [{ base: '#334155', bold: '#94a3b8' }] } },
            ImageGenerationService: {
                generateImage: async (prompt, neg, opts, initImg) => {
                    imgGenCalls.push({ prompt, initImg });
                    return { size: 100 };
                }
            },
            DBService: { saveStory: async () => true, saveImage: async () => true },
            UIManager: { isImageGenEnabled: () => true, RUNTIME: { characterImageCache: {} } },
            console,
            setTimeout,
            clearTimeout,
            URL: { createObjectURL: () => 'blob:mock-instory' }
        });
        customPipeline._callAgentText = async () => `<response><character_registry><name>Char</name><first_person_interview>Bio</first_person_interview><visual_profile>Cloaked figure</visual_profile></character_registry></response>`;
        return customPipeline;
    };

    const existingStory1 = { name: 'Base Story', characters: [{ id: 'char_existing', name: 'ExistingHero', is_user: false }], static_entries: [] };
    const draftDiff1 = { characters: [], static_entries: [] };
    const concept = {
        brief_summary: 'New chapter',
        relationship_context: 'Allies',
        characters: [
            { name: 'ExistingHero', role: 'Support', is_existing: true, existing_id: 'char_existing' },
            { name: 'Lyra', role: 'PrimaryAI', archetype: 'Mage' },
            { name: 'Thorne', role: 'Rival', archetype: 'Ranger' }
        ]
    };

    const pipelineOff = buildInStorySandbox();
    await pipelineOff.runCastingPhase(draftDiff1, concept, existingStory1, () => {}, { shouldGenerateImages: false });
    assert.equal(draftDiff1.characters.length, 2);
    assert.equal(imgGenCalls.length, 0, 'Should not call generateImage when shouldGenerateImages is false');
    assert.equal(draftDiff1.characters[0].image_url, '');
    assert.equal(draftDiff1.characters[1].image_url, '');

    const existingStory2 = { name: 'Base Story', characters: [{ id: 'char_existing', name: 'ExistingHero', is_user: false }], static_entries: [] };
    const draftDiff2 = { characters: [], static_entries: [] };
    const pipelineOn = buildInStorySandbox();
    await pipelineOn.runCastingPhase(draftDiff2, concept, existingStory2, () => {}, { shouldGenerateImages: true });
    assert.equal(draftDiff2.characters.length, 2);
    assert.equal(imgGenCalls.length, 2, 'Should generate 1 base portrait per new character (2 total)');
    assert.ok(imgGenCalls.every(c => !c.initImg), 'Should only call primary txt2img without I2I emotion burst');
    assert.ok(draftDiff2.characters[0].image_url.startsWith('local_idb_'));
    assert.ok(draftDiff2.characters[1].image_url.startsWith('local_idb_'));
});
