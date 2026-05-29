# Immersive Feature Expansion Plan (Revised)

This implementation plan details the technical designs for five premium features to be added to EllipsisLM, revised and expanded based on user feedback. These features enhance narrative visuality, world consistency, and control, keeping strictly to the project's **local-first monolithic architecture**.

---

## User Review Required

> [!IMPORTANT]
> The **Branching Timeline Canvas** and **Visual Novel Interface** introduce dynamic, graphics-heavy UI layers. We will implement them using native SVG and vanilla DOM manipulation to ensure zero external framework dependencies and keep the monolithic file highly portable.

> [!WARNING]
> The **Genre-Agnostic Inventory & Journal System** relies on a parser layer that intercepts LLM outputs to track state. To prevent local LLM hallucination and parsing failures from breaking the story, user manual overrides are treated as the single source of truth.

---

## Open Questions

> [!IMPORTANT]
> - **Visual Novel Sprite Cutouts**: For character silhouette transparency, should we offer a basic canvas chroma-keying tool, or does the proposed circle-to-transparent mask crop feature align better with the simplified user control model?
> - **SVG Canvas Optimization**: For stories with dozens of branches, should the SVG timeline visualizer render the entire network nodes recursively, or should we limit it to a depth of $N$ levels from the currently active node to optimize viewport rendering?
> - **Inventory UI**: Should the sliding inventory and journal panel overlay the main chat screen (dismissed on swipe/click outside) or split the horizontal viewport alongside the chat panel?

---

## Technical Mapping of Proposed Changes

We will register these modifications within the categorized brackets in [index.html](file:///d:/AI_Projects/Ellipsis%20LM/EllipsisLM/index.html):
- `[SEC:CSS:CORE]`: Add variables for VN overlays, SVG node layouts, and progress gauges.
- `[SEC:HTML:BODY]`: Add timeline canvas modal structures, inventory panels, and the VN dialogue block.
- `[SEC:JS:STATE:RS]`: Register state bindings for active branches, inventory states, and token counts.
- `[SEC:JS:SRV:DB]`: Modify narrative stores to handle item/journal parameters and message parenting indices.
- `[SEC:JS:UI:TEMPLATE]`: Standardize timeline nodes, token bars, and VN sprite layouts.
- `[SEC:JS:CTRL:NAR]`: Update narrative controllers to coordinate branching events, import/export tasks, and inventory parsers.

---

## Proposed Features

### 1. Beautiful Context Token Visualizer & Trim Gauge (QoL)
*   **Purpose**: A clean, premium infographic representing LLM context space, warning users before old messages slip out of local memory.
*   **Placement**: Positioned at the very top of the Prompt Settings tab (`settings-prompt-content` in the `settings-modal`).
*   **UI/UX Design**:
    *   **Segmented Gradient Bar**: A sleek, horizontal progress bar representing total context capacity (e.g. 8,192 tokens).
    *   **Color-Coded Segments**:
        *   `System/Directives` (Indigo): Base prompt, system settings, character card rules.
        *   `Knowledge/Lore` (Teal): Active static memory entries and triggered dynamic lorebook entries.
        *   `Recent History` (Violet): Conversational messages currently in context.
        *   `Free Space` (Dark Gray): Available remaining tokens.
    *   **Dynamic Tooltips**: Hovering over any segment displays the exact character count, estimated tokens, and percentage of overall context.
    *   **Trim Warning**: When the history segment crosses the maximum limit threshold, a pulsing crimson glow animates at the right edge of the history block, showing an alert: *"Context sliding window active: older logs are being summarized/pruned."*
*   **Estimation Engine**:
    *   Uses a fast, low-overhead word-to-token approximation algorithm in `UTILITY` (counting character-sequences/words and applying a `words * 1.33` multiplier), avoiding heavy client-side tokenizer libraries to keep `index.html` size down.

---

### 2. Standardized Lorebook Interoperability (Full-Size)
*   **Purpose**: Implement pure file-level import/export for common lorebook formats (SillyTavern World Info and Chub.ai JSON), mapping them directly to EllipsisLM static and dynamic knowledge.
*   **Placement**: Integrated as "Import Lorebook" and "Export Lorebook" buttons in the Dynamic tab of the `knowledge-modal`.
*   **Technical Pipeline**:
    *   **SillyTavern Schema Mapping**:
        *   SillyTavern `keys` (comma-separated triggers) $\to$ EllipsisLM dynamic entry `keywords` array.
        *   SillyTavern `content` $\to$ EllipsisLM dynamic entry `content` text.
        *   SillyTavern `constant` (always active) $\to$ EllipsisLM dynamic entry `probability` (set to `100`).
        *   SillyTavern `order` (insertion depth) $\to$ Map to priority insertion indexes.
    *   **Chub.ai Card V2 Lorebook Mapping**:
        *   Parses the inner `lorebook` array and extracts the keyword triggers, content blocks, and selective activation parameters, translating them directly to EllipsisLM database records.
    *   **Export Pipeline**:
        *   Converts the story's `dynamic_entries` array back into a standard SillyTavern-compliant JSON envelope (`{ "entries": { ... } }`) and triggers a browser file download.
*   **Scope Constraint**:
    *   Purely data-level conversion. No LLM pipeline or AI agent overhead is utilized, maximizing execution speed and reliability.

---

### 3. Genre-Agnostic Inventory & Narrative Journal System (Full-Size)
*   **Purpose**: Track mechanical states (items, relationships, quests, logs) across genres (Dungeon Crawlers, Romance, Slice-of-Life, Sci-Fi) without locking the user into a specific gameplay mode.
*   **State Architecture (`activeNarrativeState.gameState`)**:
    ```json
    {
      "resources": [
        { "id": "gold", "name": "Gold", "value": 150, "type": "currency", "icon": "circle" },
        { "id": "iron-sword", "name": "Iron Sword", "value": 1, "type": "item", "description": "Slightly rusted blade" }
      ],
      "relationships": [
        { "characterId": "alice-id", "track": "Affection", "value": 75, "milestone": "First Date Completed" }
      ],
      "journal": [
        { "id": "quest-escape", "title": "Escape the Dungeon", "status": "active", "log": ["Found a rusted key in the corner."] }
      ]
    }
    ```
*   **Cross-Genre Adaptability**:
    *   *Dungeon Crawler*: Tracks traditional gold, weapons, potions, and active dungeon quests.
    *   *Romance*: Tracks relationship stats (affection, attraction indices), memorable gifts in inventory, and date plans in the journal.
    *   *Slice-of-Life*: Tracks contacts, schedule entries, and job/school milestones.
    *   *Space Opera*: Tracks ship modules, scrap currency, and faction standing points.
*   **UI/UX Design**:
    *   A clean, sliding side-panel (`glass-bg` backdrop) with tabs: "Possessions" (grid cards representing items/resources) and "Chronicle" (timeline representation of quest logs and relationship milestones).
    *   **Manual Overrides**: Each item, status bar, and log entry features an inline edit icon. The user can add, delete, or modify quantities and values directly.
*   **LLM Interception & Handling Failures**:
    *   **Context Injection**: The active game state is formatted as a structured XML block and prepended to the system prompt context:
      ```xml
      <CURRENT_STATE>
      Inventory: Rusted Key (1), Gold (150)
      Active Quests: Escape the Dungeon (Objective: Find exit)
      Alice Affection: 75%
      </CURRENT_STATE>
      ```
    *   **Trigger Extraction**: To avoid expensive API overhead, we use an inline interceptor. If the LLM response contains markdown indicators (e.g. `[STATE: +Rusted Key]`, `[STATE: Quest Complete: Escape the Dungeon]`), the system updates the state, parses the updates, and automatically strips the indicators from the final rendered text in the chat bubble.
    *   **Failure Recovery**: Since LLMs can fail to update state or hallucinate changes, EllipsisLM treats the UI as the absolute source of truth. If a state change is parsed, a subtle toast appears at the bottom right: *"State Updated: +1 Rusted Key. [Undo] [Edit]"*. Clicking Undo reverts the parse; clicking Edit opens the manual panel.

---

### 4. Interactive Branching Timeline Canvas (Large-Scale)
*   **Purpose**: Help users visualize and manage branching storylines through a graphical timeline tree, preventing confusion when juggling multiple narrative splits.
*   **Combined Feature Concept**: Merges quick branch save-states with an interactive tree graph.
*   **UI/UX Design**:
    *   **Timeline Overlay**: A fullscreen modal with a dark, grid-pattern background.
    *   **SVG Tree Graph**: Draws a responsive node tree of the narrative's history.
        *   **Active Path**: Highlighted with a glowing, thick neon line connecting nodes.
        *   **Fork Nodes**: Circles indicating points where the user regenerated, branched, or swiped.
        *   **Node Tooltips**: Hovering over a node displays the date/time, active characters, and a scrollable text snippet of that checkpoint.
        *   **Quick Jumping**: Double-clicking any node instantly swaps the active narrative state to that historical branch, updating the chat history UI.
        *   **Manual Node Naming**: Users can right-click nodes to label branches (e.g., "Sided with the faction", "Saved the village").
    *   **Canvas Control**: Smooth dragging to pan, and mouse wheel to zoom, managed through standard CSS `transform: translate() scale()` rules.
*   **Database & File Scoping**:
    *   The `narratives` IndexedDB store is extended. Each message record receives a `parentId` field. If a user branches, a new narrative record is written, pointing its base message index to the parent message ID in the original narrative, creating a tree linkage without duplicating identical historic databases.

---

### 5. Visual Novel Interface Mode (Large-Scale)
*   **Purpose**: A cinematic alternate interface that translates text dialogue into a 2.5D visual novel structure.
*   **Constraint**: Restrict execution strictly to **Horizontal (Desktop) viewports** where widescreen ratios can host character sprites and panoramic backdrops cleanly.
*   **Implementation Workflow**:
    *   **Background Scene Generator**:
        *   Renders location backdrops using the `VisualMaster` generated image assets. The backgrounds scale to fill the screen and transition smoothly with a `transition-all duration-700` blur/fade effect when characters travel or scenes change.
    *   **Character Cutout Renderer**:
        *   Character avatars are displayed as vertical sprites.
        *   Users can upload high-resolution sprites. We supply a circular transparency masking crop tool inside the character editor to ensure clean silhouettes over the backdrops.
    *   **Emotional Sprite Swaps**:
        *   The *Sentiment Agent* evaluates recent dialogue turns and generates a mood tag (e.g., `joy`, `sorrow`, `anger`, `thought`).
        *   Characters can be configured with multiple sprite uploads mapped to these mood tags (e.g., `character_happy.png`, `character_angry.png`).
        *   The UI swaps the image source to match the mood tag. If a specific emotional sprite is missing, the system falls back to the `neutral` avatar and applies subtle CSS color temperature adjustments (e.g. slight warm tint for anger, cool hue for sorrow).
    *   **Dialogue Interface**:
        *   Hides standard scrolling bubbles.
        *   Renders a widescreen glassmorphism overlay bar at the bottom with a bold character name plate, showing the text dialogue with a smooth typewriter rendering effect.

---

## Verification Plan

### Automated Tests
- Add parser tests in `test.js` to validate ST/Chub JSON lorebook key conversions.
- Add test coverage for the regex token estimator to verify accuracy within $\pm 5\%$ of standard tokenizers.
- Write tests for the markdown state parser to confirm state tags are successfully extracted and stripped.

### Manual Verification
1. **Infographic Render**: Verify the context visualizer updates correctly when adding long scenarios or updating settings.
2. **Lorebook Imports**: Import community lore cards and verify triggered entries are retrieved during chat flow.
3. **Inventory Parsing & Toast**: Trigger an item acquisition in the chat, check if the resource is added, and verify the "Undo" action reverts it.
4. **Timeline Jump**: Spawn multiple narrative branches, confirm they display as a tree in the SVG overlay, and verify jumping preserves local variables.
5. **Horizontal VN Layout**: Switch to VN mode in widescreen, check sprite mood rendering matching Sentiment tags, and confirm layout resets cleanly when resizing back to vertical mobile mode.
