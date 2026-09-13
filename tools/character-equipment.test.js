const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

(async () => {
    const browser = await chromium.launch({ headless: true, ...(process.env.PLAYER_TEST_BROWSER ? { executablePath: process.env.PLAYER_TEST_BROWSER } : {}) });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('https://**/*', route => {
            const url = route.request().url();
            let file;
            if (url.includes('/marked/')) file = path.join(path.dirname(require.resolve('marked')), 'marked.umd.js');
            if (url.includes('/jszip/')) file = path.resolve(path.dirname(require.resolve('jszip')), '../dist/jszip.min.js');
            if (url.includes('/pako/')) file = path.join(path.dirname(require.resolve('pako')), 'dist/pako.min.js');
            return file ? route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(file) }) : route.abort();
        });
        await page.addInitScript(() => localStorage.setItem('onboarding_dismissed', 'true'));
        await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
        await page.waitForFunction(() => typeof ReactiveStore !== 'undefined' && !!ReactiveStore.state);
        await page.addStyleTag({ content: '#notification-container { visibility: hidden; }' });
        const fixture = await page.evaluate(async () => {
            const story = await StoryService.createNewStory();
            StateManager.getLibrary().stories.push(story);
            await LibraryController.editScenario(story.id, story.scenarios[0].id);
            return { storyId: story.id, scenarioId: story.scenarios[0].id, userId: story.characters.find(c => c.is_user).id };
        });
        await page.click('#scenario-tab-btn-player');
        await page.fill('#scenario-player-name', 'Arbert');
        await page.fill('#scenario-player-age', '29');
        await page.fill('#scenario-player-height', '178 cm');
        await page.fill('#scenario-player-equipment', 'Work jacket\nWork boots\n2 × Torch\nPhone');
        await page.click('#scenario-tab-btn-cast');
        await page.click('#scenario-tab-btn-player');
        assert.equal(await page.inputValue('#scenario-player-age'), '29');
        assert.equal(await page.inputValue('#scenario-player-height'), '178 cm');
        assert.match(await page.inputValue('#scenario-player-equipment'), /2 × Torch/);
        await page.evaluate(() => LibraryController.saveScenario());
        const runs = await page.evaluate(async fixture => {
            const first = await StoryService.createNarrativeFromScenario(fixture.storyId, fixture.scenarioId);
            const second = await StoryService.createNarrativeFromScenario(fixture.storyId, fixture.scenarioId);
            StateManager.getLibrary().active_story_id = fixture.storyId;
            StateManager.getLibrary().active_narrative_id = first.id;
            StateManager.saveLibrary();
            return { first: first.id, second: second.id };
        }, fixture);
        await page.reload();
        await page.waitForFunction(() => typeof ReactiveStore !== 'undefined' && !!ReactiveStore.state?.narrativeId);
        await page.addStyleTag({ content: '#notification-container { visibility: hidden; }' });
        await page.evaluate(() => {
            Object.assign(ReactiveStore.state, { enableAutoStaticKnowledge: false, enableResponseOptions: false,
                enableAnalysis: false, enableJournal: false, enableStats: false, enableLivingPersona: false });
            window.equipmentApiCalls = 0;
            APIService.callAI = async () => { equipmentApiCalls++; throw new Error('Equipment editing must stay local'); };
            TextModeController.deliverUnprompted = () => {};
            NarrativeController.triggerAutoKnowledgeUpdates = () => {};
            MusicService.checkTrigger = () => {};
            const torch = ReactiveStore.state.gameState.resources.find(item => item.name === 'Torch');
            torch.description = 'Waxed wooden torch';
            torch.rarity = 'Common';
            window.originalTorchId = torch.id;
            UIManager.renderChat();
        });
        const inventory = () => page.evaluate(() => Object.fromEntries(UTILITY.getCharacterEquipment(ReactiveStore.state).map(item => [item.name, item.value])));
        assert.deepEqual(await inventory(), { 'Work jacket': 1, 'Work boots': 1, Torch: 2, Phone: 1 });
        await page.click('#inventory-toggle-btn');
        assert.equal(await page.locator('#inventory-panel').isVisible(), true);
        assert.match(await page.locator('#inventory-panel').textContent(), /Work jacket/);
        const quotedName = `Arbert's "lucky" charm`;
        await page.evaluate(name => InventoryController.addResource(name, 1), quotedName);
        const charmRow = page.getByText(quotedName, { exact: true }).locator('..').locator('..');
        await charmRow.getByTitle('Increase Qty').click();
        assert.equal((await inventory())[quotedName], 2);
        await charmRow.getByTitle('Decrease Qty').click();
        assert.equal((await inventory())[quotedName], 1);
        await charmRow.getByTitle('Delete Item').click();
        assert.equal((await inventory())[quotedName], undefined);
        await page.click('#player-sheet-btn');
        assert.equal(await page.inputValue('#live-player-age'), '29');
        assert.equal(await page.inputValue('#live-player-height'), '178 cm');
        await page.fill('#live-player-age', '30');
        await page.fill('#live-player-height', `5'2"`);
        await page.fill('#live-player-equipment', 'Work boots\n2 × Torch\nPhone\nCloak');
        await page.evaluate(() => {
            InventoryController.addResource('Torch', -1);
            InventoryController.addResource('Phone', -1);
            InventoryController.addResource('Gold', 5);
        });
        assert.match(await page.inputValue('#live-player-equipment'), /Cloak/);
        for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
            await page.setViewportSize(viewport);
            await page.evaluate(() => app.updateLayout());
            await page.locator('#live-player-equipment').scrollIntoViewIfNeeded();
            assert.equal(await page.locator('#live-player-form').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
            await page.screenshot({ path: path.resolve(__dirname, `../dist/player-equipment-${viewport.width}.png`) });
        }
        await page.click('[data-action="save-player-sheet"]');
        await page.waitForFunction(() => ReactiveStore.state.playerCharacter.height === `5'2"`);
        assert.deepEqual(await inventory(), { 'Work boots': 1, Torch: 1, Gold: 5, Cloak: 1 });
        assert.equal(await page.evaluate(() => ReactiveStore.state.gameState.resources.find(item => item.name === 'Torch').id === originalTorchId), true);
        assert.equal(await page.evaluate(() => ReactiveStore.state.gameState.resources.find(item => item.name === 'Torch').description), 'Waxed wooden torch');
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.evaluate(() => app.updateLayout());
        await page.click('#player-sheet-btn');
        await page.evaluate(() => InventoryController.addResource('Torch', 1));
        await page.waitForFunction(() => document.getElementById('live-player-equipment').value.includes('2 × Torch'));
        await page.fill('#live-player-personality', 'Quietly determined.');
        await page.click('[data-action="save-player-sheet"]');
        assert.equal((await inventory()).Torch, 2);
        const npcId = await page.evaluate(() => {
            const state = ReactiveStore.state;
            const narrator = state.characters.find(c => c.is_narrator) || state.characters.find(c => !c.is_user);
            NarrativeController.startStreamingResponse(narrator.id, 'A guard approaches. [NPC_MET: Mira|guard|A tall woman wearing a wool cloak.]', 'neutral');
            const npc = state.characters.find(c => c.name === 'Mira');
            npc.equipment = ['Old staff'];
            return npc.id;
        });
        await page.evaluate(id => {
            window.activeCharTab = 'tab-character-sheet';
            AppController.openModal('character-detail-modal', id);
        }, npcId);
        const npcField = field => page.locator(`#tab-character-sheet [data-field="${field}"]`);
        await npcField('age').fill('34');
        await npcField('age').blur();
        await npcField('height').fill('182 cm');
        await npcField('height').blur();
        await page.fill('#npc-equipment', 'Spear\n3 × Torch');
        await page.locator('#npc-equipment').blur();
        assert.equal(await page.evaluate(id => UTILITY.getCharacterEquipment(ReactiveStore.state, id).find(item => item.name === 'Torch').value, npcId), 3);
        assert.equal((await inventory()).Torch, 2);
        await page.evaluate(id => InventoryController.addResource('Torch', 1, id), npcId);
        await page.waitForFunction(() => document.getElementById('npc-equipment').value.includes('4 × Torch'));
        await page.evaluate(() => {
            ReactiveStore.state.enableJournal = true;
            InventoryController.processStateUpdates({ id: UTILITY.uuid(), content: 'You receive a torch. [STATE: +1 Torch]' });
        });
        assert.equal((await inventory()).Torch, 3);
        assert.equal(await page.evaluate(id => UTILITY.getCharacterEquipment(ReactiveStore.state, id).find(item => item.name === 'Torch').value, npcId), 4);
        await page.evaluate(() => {
            InventoryController.processStateUpdates({ id: UTILITY.uuid(), content: 'You use the spare torch. [STATE: -1 Torch]' });
            ReactiveStore.state.enableJournal = false;
        });
        assert.equal((await inventory()).Torch, 2);
        for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
            await page.setViewportSize(viewport);
            await page.evaluate(() => app.updateLayout());
            await npcField('age').scrollIntoViewIfNeeded();
            assert.equal(await page.locator('.npc-character-sheet').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
            await page.screenshot({ path: path.resolve(__dirname, `../dist/npc-equipment-${viewport.width}.png`) });
        }
        const context = await page.evaluate(id => ({
            player: PromptBuilder.buildPlayerContext(ReactiveStore.state),
            npc: PromptBuilder.buildNpcContext(ReactiveStore.state),
            swarm: PromptBuilder.buildSwarmCharacterResponsePrompt(ReactiveStore.getCharacter(id), '', '', ReactiveStore.state),
            direct: JSON.stringify(PromptBuilder.buildPrompt(id, false, null, null, true))
        }), npcId);
        assert.match(context.player, /Age: 30/);
        assert.match(context.player, /Height: 5'2"/);
        assert.match(context.player, /2 × Torch/);
        assert.ok(!context.player.includes('Spear'));
        for (const prompt of [context.npc, context.swarm, context.direct]) {
            assert.ok(prompt.includes('Age: 34'));
            assert.ok(prompt.includes('Height: 182 cm'));
            assert.ok(prompt.includes('Spear; 4 × Torch'));
        }
        await page.evaluate(() => ReactiveStore.forceSave());
        const saved = await page.evaluate(async ({ fixture, runs }) => ({ story: await DBService.getStory(fixture.storyId), other: await DBService.getNarrative(runs.second) }), { fixture, runs });
        assert.equal(saved.story.scenarios[0].playerCharacter.age, '29');
        assert.equal(saved.story.scenarios[0].playerCharacter.height, '178 cm');
        assert.equal(saved.other.state.playerCharacter.height, '178 cm');
        assert.equal(saved.other.state.gameState.resources.find(item => item.name === 'Torch').value, 2);
        assert.equal(saved.other.state.gameState.resources.find(item => item.name === 'Phone').value, 1);
        assert.equal(saved.other.state.gameState.characterResources, undefined);
        assert.notEqual(saved.story.characters.find(c => c.id === fixture.userId).height, `5'2"`);
        assert.equal(await page.evaluate(() => equipmentApiCalls), 0);
        await page.reload();
        await page.waitForFunction(() => typeof ReactiveStore !== 'undefined' && !!ReactiveStore.state?.narrativeId);
        assert.deepEqual(await inventory(), { 'Work boots': 1, Torch: 2, Gold: 5, Cloak: 1 });
        assert.equal(await page.evaluate(id => ReactiveStore.getCharacter(id).npc_profile.age, npcId), '34');
        assert.equal(await page.evaluate(id => UTILITY.getCharacterEquipment(ReactiveStore.state, id).find(item => item.name === 'Torch').value, npcId), 4);
        await page.click('#player-sheet-btn');
        await page.fill('#live-player-equipment', '');
        await page.click('[data-action="save-player-sheet"]');
        await page.locator('#inventory-panel-container').waitFor({ state: 'hidden' });
        assert.deepEqual(await inventory(), {});
        await page.evaluate(id => InventoryController.setEquipment(id, []), npcId);
        await page.waitForFunction(() => !ReactiveStore._isSaving);
        await page.evaluate(() => ReactiveStore.forceSave());
        await page.reload();
        await page.waitForFunction(() => typeof ReactiveStore !== 'undefined' && !!ReactiveStore.state?.narrativeId);
        assert.deepEqual(await inventory(), {});
        assert.deepEqual(await page.evaluate(id => UTILITY.getCharacterEquipment(ReactiveStore.state, id), npcId), []);
        await page.click('#player-sheet-btn');
        assert.equal(await page.inputValue('#live-player-equipment'), '');
        assert.equal(await page.inputValue('#live-player-height'), `5'2"`);
        assert.deepEqual(errors, []);
        process.stdout.write('Age, height, starting/live equipment, inventory sync, NPC ownership, concurrent edits, persistence, isolation, empty inventories, prompts, and responsive sheets passed.\n');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
