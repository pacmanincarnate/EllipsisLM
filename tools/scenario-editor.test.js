// Unit & Contract tests for the scenario editor create/save lifecycle.
//
// Covers two latent bugs:
//   1. "New Scenario" used to be written to the database before the user
//      confirmed anything, so cancelling left a stray scenario behind.
//   2. Save/Edit used to return silently when the story or scenario could not
//      be found, so a failed save looked like a dead editor.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const acorn = require('acorn');

const htmlPath = path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// ── Extract the real LibraryController methods from index.html ──

function inlineScripts(source) {
    const blocks = [];
    const openRe = /<script(\s[^>]*)?>/g;
    let m;
    while ((m = openRe.exec(source)) !== null) {
        const attrs = m[1] || '';
        if (/\bsrc\s*=/i.test(attrs)) continue; // external script
        const contentStart = openRe.lastIndex;
        const closeIdx = source.indexOf('</script>', contentStart);
        if (closeIdx === -1) continue;
        blocks.push({
            js: source.slice(contentStart, closeIdx),
            sourceType: /\btype\s*=\s*["']module["']/i.test(attrs) ? 'module' : 'script'
        });
        openRe.lastIndex = closeIdx + '</script>'.length;
    }
    return blocks;
}

const METHOD_NAMES = ['createNewScenario', 'editScenario', 'saveScenario', 'populateScenarioEditor'];

function findObjectExpression(ast, bindingName) {
    const stack = [ast];
    while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node.type !== 'string') continue;
        if (
            node.type === 'VariableDeclarator' &&
            node.id && node.id.name === bindingName &&
            node.init && node.init.type === 'ObjectExpression'
        ) {
            return node.init;
        }
        for (const key of Object.keys(node)) {
            if (key === 'start' || key === 'end' || key === 'loc') continue;
            const value = node[key];
            if (Array.isArray(value)) {
                value.forEach(child => {
                    if (child && typeof child.type === 'string') stack.push(child);
                });
            } else if (value && typeof value.type === 'string') {
                stack.push(value);
            }
        }
    }
    return null;
}

function extractControllerMethodSource() {
    for (const block of inlineScripts(html)) {
        if (!block.js.includes('const LibraryController = {')) continue;
        const ast = acorn.parse(block.js, {
            ecmaVersion: 'latest',
            sourceType: block.sourceType,
            allowReturnOutsideFunction: true
        });
        const objectNode = findObjectExpression(ast, 'LibraryController');
        if (!objectNode) continue;

        const sources = {};
        for (const prop of objectNode.properties) {
            if (!prop.key) continue;
            const name = prop.key.name || prop.key.value;
            if (METHOD_NAMES.includes(name)) {
                sources[name] = block.js.slice(prop.start, prop.end);
            }
        }
        const missing = METHOD_NAMES.filter(name => !sources[name]);
        if (missing.length) {
            throw new Error('LibraryController is missing methods: ' + missing.join(', '));
        }
        return METHOD_NAMES.map(name => sources[name]).join(',\n');
    }
    throw new Error('LibraryController definition not found in index.html');
}

const controllerMethodSource = extractControllerMethodSource();

// ── Sandbox harness ──

function makeStory(overrides = {}) {
    return {
        id: 'story-1',
        name: 'Test Story',
        characters: [
            { id: 'char-1', name: 'Alice' },
            { id: 'user-1', name: 'You', is_user: true }
        ],
        scenarios: [
            {
                id: 'scn-1',
                name: 'Arrival',
                message: 'You arrive at the inn.',
                static_entries: [],
                dynamic_entries: [],
                active_character_ids: ['char-1']
            }
        ],
        ...overrides
    };
}

function createHarness(story, options = {}) {
    const notifications = [];
    const calls = [];
    const saved = [];
    const elements = new Map();

    [
        'edit-scenario-story-id',
        'edit-scenario-id',
        'edit-scenario-name',
        'edit-scenario-message',
        'edit-scenario-characters',
        'scenario-static-entries-list',
        'scenario-dynamic-entries-list',
        'scenario-static-entry-details',
        'scenario-dynamic-entry-details'
    ].forEach(id => elements.set(id, { id, value: '', innerHTML: '' }));

    const library = { stories: [story], active_story_id: story.id };

    const sandbox = {
        console,
        UIManager: {
            showNotification: (msg, type) => notifications.push({ msg, type }),
            openStoryDetails: (storyId) => calls.push({ fn: 'openStoryDetails', storyId })
        },
        AppController: {
            openModal: (id) => calls.push({ fn: 'openModal', id }),
            closeModal: (id) => calls.push({ fn: 'closeModal', id })
        },
        DBService: {
            // Mirror IndexedDB structured-clone semantics: callers never get the stored object.
            getStory: async (id) => (id === story.id ? JSON.parse(JSON.stringify(story)) : null),
            saveStory: async (value) => {
                saved.push(JSON.parse(JSON.stringify(value)));
                return options.saveResult !== false;
            }
        },
        StateManager: { getLibrary: () => library },
        UTILITY: { uuid: () => 'draft-1' },
        UIComponents: { ScenarioCharacterTile: () => '<div></div>' },
        DOM: { unsafe: (value) => value },
        document: { getElementById: (id) => elements.get(id) || null },
        alert: (msg) => { throw new Error('Unexpected alert: ' + msg); }
    };

    vm.createContext(sandbox);
    vm.runInContext(`globalThis.__methods = ({${controllerMethodSource}});`, sandbox);

    const controller = Object.assign({}, sandbox.__methods, {
        currentEditScenario: null,
        currentEditScenarioStoryId: null,
        currentEditScenarioIsNew: false,
        selectedScenarioStaticId: null,
        selectedScenarioDynamicId: null,
        // The methods under test only need these to exist; their own rendering
        // behaviour is covered elsewhere.
        switchScenarioTab() {},
        renderScenarioCast() {},
        renderScenarioStaticEntries() {},
        renderScenarioDynamicEntries() {}
    });

    return { controller, elements, notifications, calls, saved, library, story };
}

// ── Source contract ──

test('source contract: createNewScenario must not persist before the user saves', () => {
    const start = html.indexOf('async createNewScenario(');
    assert.ok(start !== -1, 'createNewScenario must exist');
    const end = html.indexOf('async editScenario(', start);
    assert.ok(end > start, 'editScenario must follow createNewScenario');

    const body = html.slice(start, end);
    assert.doesNotMatch(body, /saveStory\s*\(/, 'createNewScenario must not write to the database');
    assert.match(body, /currentEditScenarioIsNew\s*=\s*true/, 'createNewScenario must mark the draft as new');
});

// ── Runtime behaviour ──

test('createNewScenario opens an unsaved draft, so cancelling leaves no scenario behind', async () => {
    const harness = createHarness(makeStory());

    await harness.controller.createNewScenario('story-1');

    assert.equal(harness.saved.length, 0, 'opening the editor must not write to the database');
    assert.equal(harness.story.scenarios.length, 1, 'the stored story must not gain a scenario yet');
    assert.equal(harness.controller.currentEditScenarioIsNew, true, 'the draft must be flagged as new');
    assert.equal(harness.controller.currentEditScenarioStoryId, 'story-1');
    assert.equal(harness.elements.get('edit-scenario-id').value, 'draft-1');
    assert.equal(harness.elements.get('edit-scenario-name').value, 'New Scenario');
    assert.equal(harness.elements.get('edit-scenario-message').value, 'The story begins...');
    assert.ok(
        harness.calls.some(c => c.fn === 'openModal' && c.id === 'edit-scenario-modal'),
        'the editor must open'
    );
});

test('saveScenario persists a new draft as a new scenario', async () => {
    const harness = createHarness(makeStory());
    await harness.controller.createNewScenario('story-1');

    harness.elements.get('edit-scenario-name').value = 'Tavern Start';
    harness.elements.get('edit-scenario-message').value = 'You wake in the inn.';

    await harness.controller.saveScenario();

    assert.equal(harness.saved.length, 1, 'Save must write exactly once');
    const scenarios = harness.saved[0].scenarios;
    assert.equal(scenarios.length, 2, 'the draft must be appended to the story');

    const created = scenarios.find(s => s.id === 'draft-1');
    assert.ok(created, 'the draft must be stored under its generated id');
    assert.equal(created.name, 'Tavern Start');
    assert.equal(created.message, 'You wake in the inn.');
    assert.equal(harness.controller.currentEditScenarioIsNew, false, 'the draft is no longer new after saving');
    assert.ok(
        harness.calls.some(c => c.fn === 'closeModal' && c.id === 'edit-scenario-modal'),
        'the editor must close after a successful save'
    );
    assert.ok(
        harness.calls.some(c => c.fn === 'openStoryDetails' && c.storyId === 'story-1'),
        'the details panel must refresh after saving'
    );
});

test('saveScenario still updates an existing scenario without duplicating it', async () => {
    const harness = createHarness(makeStory());

    await harness.controller.editScenario('story-1', 'scn-1');
    assert.equal(harness.elements.get('edit-scenario-name').value, 'Arrival');
    assert.equal(harness.controller.currentEditScenarioIsNew, false);

    harness.elements.get('edit-scenario-name').value = 'Arrival (Revised)';
    await harness.controller.saveScenario();

    assert.equal(harness.saved.length, 1);
    assert.equal(harness.saved[0].scenarios.length, 1, 'no extra scenario may be created');
    assert.equal(harness.saved[0].scenarios[0].name, 'Arrival (Revised)');
});

test('editScenario reports a missing scenario instead of silently doing nothing', async () => {
    const harness = createHarness(makeStory());

    await harness.controller.editScenario('story-1', 'scn-gone');

    assert.equal(
        harness.calls.some(c => c.fn === 'openModal'),
        false,
        'the editor must not open for a scenario that no longer exists'
    );
    assert.ok(
        harness.notifications.some(n => n.type === 'error' && /no longer exists/.test(n.msg)),
        'the user must be told the scenario is gone'
    );
});

test('editScenario reports a missing story instead of silently doing nothing', async () => {
    const harness = createHarness(makeStory());

    await harness.controller.editScenario('story-unknown', 'scn-1');

    assert.equal(harness.calls.some(c => c.fn === 'openModal'), false);
    assert.ok(
        harness.notifications.some(n => n.type === 'error' && /story not found/.test(n.msg)),
        'the user must be told the story is gone'
    );
});

test('saveScenario refuses to resurrect a deleted scenario and says so', async () => {
    const harness = createHarness(makeStory());
    harness.controller.currentEditScenario = { id: 'scn-gone', name: 'Ghost', message: 'Boo' };
    harness.controller.currentEditScenarioIsNew = false;
    harness.elements.get('edit-scenario-story-id').value = 'story-1';
    harness.elements.get('edit-scenario-id').value = 'scn-gone';
    harness.elements.get('edit-scenario-name').value = 'Ghost';
    harness.elements.get('edit-scenario-message').value = 'Boo';

    await harness.controller.saveScenario();

    assert.equal(harness.saved.length, 0, 'nothing may be written');
    assert.ok(
        harness.notifications.some(n => n.type === 'error' && /no longer exists/.test(n.msg)),
        'the user must be told the scenario is gone'
    );
    assert.equal(
        harness.calls.some(c => c.fn === 'closeModal'),
        false,
        'the editor must stay open so the user can react'
    );
});

test('saveScenario surfaces a database write failure', async () => {
    const harness = createHarness(makeStory(), { saveResult: false });

    await harness.controller.editScenario('story-1', 'scn-1');
    await harness.controller.saveScenario();

    assert.equal(harness.saved.length, 1, 'a write must be attempted');
    assert.ok(
        harness.notifications.some(n => n.type === 'error' && /write failed/.test(n.msg)),
        'the user must be told the save failed'
    );
    assert.equal(
        harness.calls.some(c => c.fn === 'closeModal'),
        false,
        'the editor must stay open on failure'
    );
});
