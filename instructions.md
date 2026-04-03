# EllipsisLM Project Instructions

Welcome to the **EllipsisLM** source code! This document provides crucial context, architectural overviews, and strict guidelines for modifying and extending the application. Before contributing code, review this document thoroughly to ensure that changes align with the project's philosophy, structure, and standards.

## 1. Overall Goals & Intent of the Project
EllipsisLM is an open-source, private, and deeply customizable AI-powered roleplay engine. The main intent is to provide a premium, highly immersive storytelling experience directly on the user's device. 
Its core philosophy revolves around:
- **Privacy & Local-First Execution**: Capable of running entirely offline using local LLM backends (like KoboldCPP and LM Studio).
- **Infinite Portability**: The core application functions seamlessly offline as a single monolithic HTML file.
- **Deep World-Building**: Expanding beyond standard chat limits by providing complex multi-character management, map generation, and persistent dynamic background agents.

## 2. Architecture and Libraries Used
EllipsisLM uses an unconventional but highly deliberate architecture that prioritizes extreme zero-install portability alongside robust desktop capabilities.

### Core Architecture
- **The Monolith (`index.html`)**: The entire frontend state management, logic, DOM manipulation, custom CSS, and HTML template definitions are self-contained within an enormous `index.html` file (23,000+ lines). The file is heavily modularized via technical map tags (e.g., `[SEC:JS:STATE:RS]`).
- **Electron Wrapper (`electron/`)**: A lightweight container that wraps the monolithic HTML file to function as a native desktop application. It integrates OS-level functions, such as auto-launching and managing local `koboldcpp` binaries.

### Libraries Used
No major frontend frameworks (like React, Vue, or Angular) are used in the core monolithic product.
- **Vanilla JavaScript**: State management logic, reactive stores, event delegation, and DOM updates are all pure JS.
- **Tailwind CSS (`electron/tailwind.css`)**: Used extensively alongside custom CSS for modern utility-class styling.
- **JSZip & Pako**: For handling complex data package formats (zipping/unzipping imports/exports).
- **Marked.js**: For parsing and rendering Markdown from LLM outputs.

## 3. Overall Structure of the Application's Code
Understanding the internal structure of `index.html` is critical. It is internally routed through specifically named ID brackets:
- `[SEC:HTML:BODY]` UI structure, modals, containers.
- `[SEC:JS:STATE:RS]` Custom implementation of a Proxy-based state `ReactiveStore` to manage reactive data.
- `[SEC:JS:SRV:DB]` Database services natively wrapping `IndexedDB` for local storage in the browser cache.
- `[SEC:JS:UI:TEMPLATE]` UI component definition strings to dynamically inject HTML.
- `[SEC:JS:CTRL:*]` Controllers responsible for orchestrating specific segments (e.g., `LibraryController` for managing stories, `NarrativeController` for routing chats, `WorldController` for managing the map).
- `[SEC:JS:MOD:AH]` Custom central action handler managing delegated events to minimize event listeners.

When making extensive updates, ensure that new functions and variables are slotted into their appropriate categorized bracket.

## 4. Exhaustive List of Features and Controls
EllipsisLM features an immense array of dynamic roleplay elements:
- **Hierarchical Story Organization**: 
  - *Stories*: Parent containers acting as the root character card.
  - *Scenarios*: Reusable roleplay starter templates (custom characters, memories, visual themes).
  - *Narratives*: Actively branching distinct playthroughs spawned from scenarios.
- **Character Management**: 
  - Manage unlimited characters.
  - Active/inactive status toggles.
  - "Narrator Mode" toggle—forces the character to speak occasionally to push the story, but prevents back-to-back takeover.
- **Roleplay Interface & Controls**:
  - *Write/Generate*: Auto-generate the user input, or pass the user input to generate the AI response.
  - *Specific Actor Targeting*: Select from the dropdown to force a specific character to reply next.
  - *Contextual Regenerate*: Overwrite the current response or pivot the story by swapping the designated speaker.
- **World Map System**:
  - An 8x8 spatial grid holding short/long descriptions and location-specific memories.
  - Auto-generated maps through prompted generation.
  - Background tracking of player movement via context scanning or UI-driven quick travel and path plotting.
- **Lore & Knowledge Systems**:
  - *Static Knowledge*: Persistent summarized lore, automatically refreshed and updated by backend prompt calls.
  - *Dynamic Knowledge*: A robust Lorebook supporting conditional `AND/XOR` keywords and probability percentage triggers.
- **Background Agents (Multi-Prompting)**:
  - *Event Master*: Runs roughly every 6 turns to ingest chat history and inject a logical background event. 
  - *Sentiment Agent*: Periodically deduces the active characters' feelings and dynamically changes character portraits based on state.
  - *Inline AI-Generators*: Floating icons in the UI to dynamically invoke the LLM to write character personas or generate location descriptions on the fly.
  - *Static Memory Extractor*: Reviews chat flow to condense important events into persistent memory.
- **Import/Export**: Extensive support for reading/writing internal JSON backups, standard V2 PNG Character cards, BYAF cards, and bulk-folder importing.
- **Customizable UI/UX**: Toggles for Desktop (Horizontal)/Mobile (Vertical) view, Cinematic modes, bubble layout customization, fonts, background blur, and theme colors.

## 5. Data Storage Hierarchy & Scoping
EllipsisLM uses a tiered data structure to ensure that specific playthroughs remain isolated while sharing a global "World Bible." Information is stored across four primary scopes:

### Universal (Application-Level)
*   **Folders**: Global organizational structures for grouping stories.
*   **Global Settings**: API keys, model preferences, and master UI themes.
*   **Character Image Store**: A centralized `characterImages` IndexedDB store that holds every portrait blob, referenced by unique IDs across the entire app.

### Story (The "World Bible")
*   **Root Metadata**: Title, tags, and creator's notes.
*   **Character Roster**: The master definitions of all characters (personas, base images, and toggles).
*   **Global Lore**: Static and Dynamic knowledge entries that define the world's rules.
*   **Scenarios & Narratives**: The lists of all templates and playthroughs belonging to this story.

### Scenario (The Template Snapshot)
*   **Initial State**: A frozen snapshot of the Story's lore and map at the moment of creation.
*   **Opening Message**: The unique starting point for any playthrough spawned from this scenario.
*   **Configuration**: Specific active character lists and custom system prompts for this roleplay starter.

### Narrative (The Live Playthrough)
*   **History**: The full chat history, message counters, and timestamps unique to this run.
*   **Evolution**: Narrative-specific memories and summarized states that diverge from the base scenario.
*   **Live Map State**: The player's current coordinates, planned path, and journey destination.

## 6. Generation Pipelines & Multi-Prompting
For complex tasks (like creating an entire story from a single prompt), EllipsisLM utilizes a **Pipeline** pattern. This avoids "one-shot" failures by breaking the task into discrete, logical phases:
- **World Phase**: Generates the underlying lore and setting.
- **Casting Phase**: Generates the characters and their relationships based on the world.
- **Director Phase**: Synthesizes the world and cast into a cohesive opening scenario and first message.
- **Visual Phase**: Orchestrates background and portrait generation to match the newly created context.

When implementing features that require significant AI "reasoning," always look to utilize or extend the `StoryGenerationPipeline` rather than writing monolithic prompts.

## 7. Coding Standards and Best Practices
When contributing code to EllipsisLM, the following standards are non-negotiable:
- **Maintain the Monolith Safely**: All frontend logic additions must be made inside `index.html`. Do not attempt to add external script bundles or install complex component libraries via NPM. 
- **Vanilla DOM Handling**: Rely on the existing DOM orchestration mechanisms (`UIManager`, `ReactiveStore`, `ActionHandler`).
- **Responsive Layout First**: Always ensure your UI additions gracefully fall back through the flexbox rules into vertical (Mobile) mode cleanly. Always test your UI changes against horizontal mode overlapping.
- **Thorough Section Tagging**: Maintain to the strict bracket-ID schema established. If you need a new functional subsection, document and map it.

## 8. How to Think About Changes ("Red-Teaming" Features)
Do not immediately accept the first idea that comes to mind when addressing an issue or building a feature. You must actively **"red-team"** your implementation plan.

When you develop a plan, challenge its integrity:
- *Will this DOM mutation break the `ActionHandler` delegation?*
- *How does this text expansion behave in Cinematic View vs standard Bubble View?*
- *If I add this prompt agent, how does it interact when the user switches LLM endpoints from Gemini to a local KoboldCPP server?*
- *What happens when the `IndexedDB` transaction is interrupted during this multi-agent loop?*

If an approach introduces friction or causes edge-case bugs, discard it and redesign it. Anticipate failures, UX degradation, and state desynchronization, and select the architectural route that solves these fundamentally.

## 9. We Take the Best Path, Not the Easiest
**Shortcuts are strictly forbidden.** We do not implement hacky workarounds or "good enough" fixes. Every feature or refactor must follow the best possible implementation path. 

If adding a new UI toggle requires you to write an extensive custom CSS module, adjust the Proxy event listener, and refactor a legacy `[SEC:JS:...]` template, you will do exactly that. The integrity of the codebase and the quality of the user experience are paramount.

## 10. "Token Agnostic" Philosophy
EllipsisLM is explicitly designed to be **Token Agnostic**. 

When conceptualizing prompt logic, AI interactions, or data summarizations for the LLM, you are allowed to use as many tokens as necessary to achieve high-quality functionality. The application delegates the cost and model hardware explicitly to the user via local generation (KoboldCPP, LM Studio) or BYO-Keys (Gemini, OpenRouter). 

**Do not cripple functionality in the name of marginal token efficiency!** While prompt compression and context brevity are important for speed and avoiding context cliffs, they must absolutely **not** come at the cost of the AI's intelligence, depth, or functionality. If the Event Master or World Map auto-generator requires a 400-token system prompt and rigorous output checking to be highly robust, write the 400-token prompt.

## 11. UI/UX Philosophy & Implementation
EllipsisLM is built with a "User-First" design philosophy that prioritizes aesthetic immersion and functional clarity. Unlike many open-source projects where the interface is a cluttered "cockpit" of buttons with little regard for usability, EllipsisLM aims for **Invisible Utility**.

### Core UX Goals
- **Cohesion over Clutter**: Every UI element must belong to a consistent design system (`index.css` variables). We do not add one-off buttons; we integrate features into existing logical groups.
- **Refinement & Clarity**: Access to complex settings (API keys, LLM parameters, prompt tags) must be straightforward but tucked away until requested. We use modal-driven deep settings to keep the main chat interface pristine.
- **Visual Hierarchy**: Critical information (active story, sender name, typing status) is emphasized through color, typography, and motion, while secondary metadata (timestamps, control icons) is softened or hidden behind hover states.

### Quality Contrast
In contrast to typical open-source AI frontends that often suffer from "Developer UI" (overwhelming lists of plain text and unstyled buttons), EllipsisLM employs:
- **Materiality (Glassmorphism)**: Use of `glass-bg`, `backdrop-blur`, and subtle gradients to create depth and a premium feel.
- **Purposeful Color Coding**: Intentional use of role-based colors (e.g., Indigo for User interactions, Teal for System/Narrator) to guide the user's eye without textual labeling.
- **Micro-Animations**: Smooth transitions (`duration-300`, `animate-fade-in`) that provide feedback and make the interface feel "alive" rather than static and brittle.

### Implementation Strategies
- **Responsive Layout Triggers**: The app dynamically swaps between Desktop (Horizontal) and Mobile (Vertical) layouts. UI components must be built to adapt to these logic-driven CSS classes (`layout-horizontal`, `layout-vertical`).
- **Progressive Disclosure**: Advanced controls (like the `action-btn-group` in chat bubbles) are hidden by default and only revealed on `hover` or `long-press`, keeping the user's focus on the narrative.
- **CSS-Variable Driven Themes**: All styles must use the root CSS variables (e.g., `--brand-color`, `--chat-font-family`). This allows for consistent global "theming" when a user changes settings.
- **Centralized HTML Rendering**: Use the `UIComponents` and `UIManager` sections to ensure that any new UI element is rendered consistently across the app.

## 12. The "Never Do" List
To maintain the long-term integrity and premium quality of EllipsisLM, the following actions are strictly prohibited:

- **NEVER introduce external JS frameworks**: Do not refactor the monolithic core into React, Vue, or other complex npm-managed frameworks. The project depends on the single-file portability of the monolithic `index.html`.
- **NEVER use placeholders**: Do not commit code that leaves "TODO" functionality or placeholder images. Every feature must be a fully realized, production-ready implementation according to the "Best Path."
- **NEVER sacrifice AI depth for token efficiency**: (Reinforcing Section 10). If an agent prompt needs to be extensive to be effective, let it be. Do not "cut corners" on the AI's intelligence.
- **NEVER use ad-hoc inline styles for static elements**: All static UI styling must flow through the `index.css` variable system or utility classes. Only truly dynamic/calculated values should be applied as inline styles.
- **NEVER bypass the ActionHandler**: Do not attach unique event listeners to every single button. Utilize the established centralized delegation system to keep the global DOM event footprint minimal.
- **NEVER break the Section Tagging map**: Do not add code (logic or UI) outside of the identified `[SEC:...]` brackets. This prevents the document from becoming un-navigable.
- **NEVER prioritize one orientation over another**: Features must be functionally and visually complete in both **Horizontal (Desktop)** and **Vertical (Mobile)** modes. If a feature is "unusable" in one mode, it is considered broken.
- **NEVER ship without Red-Teaming**: Do not finalize a feature without attempting to "break" its logic. Anticipate race conditions, input edge cases, and state desynchronization.

## 13. Commenting & Documentation Standards
High-quality, accurate documentation is vital for maintaining the massively monolithic `index.html`. 

### Maintain Brackets & Searchable Tags
Every major function, service, or UI block must include a standardized comment header that improves navigability. Continue and expand upon the bracket-based technical map system (e.g., `[UI:TEMPLATE:...]` or `[CTRL:NAR:...]`) to link related elements and ensure rapid searchability across 20,000+ lines.

### Human-Readable descriptions
Comments must include human-readable descriptions of the code's *intent* and *logic* in plain English. Do not simply restate a method name; explain what it solves and any side-effects it might have on the `ReactiveStore` or the DOM.

### Linkage & Cross-References
Include searchable references to related UI IDs, CSS classes, or dependent services within the comments. This "trail of breadcrumbs" ensures that any developer can understand how a logic change in a controller affects a component in the `[SEC:JS:UI:TEMPLATE]` section.

### Zero Tolerance for Stale Comments
Comments are as critical as the code itself. When a block of code is revised, its associated comments **must be updated or replaced** immediately. 
- **Inaccurate documentation significantly degrades the auditability and comprehendability of the project.** 
- Leaving stale comments in place is considered an anti-pattern. If a comment no longer accurately reflects the logic, it must be purged or rewritten.
- A feature is not "complete" until the internal documentation correctly describes the implementation's current state.

## 14. README Maintenance & User-Facing Documentation
The `README.md` is the primary bridge between the technical implementation and the end-user. To ensure that users always understand the application's true potential, it must be treated as a living document.

### Mandatory Updates
Every time a new feature is implemented or an existing one is significantly changed, the `README.md` **must** be evaluated and updated appropriately.

### Layman-Term Standard
All user-facing documentation must avoid technical jargon. Instead of describing "IndexedDB transactions," describe how "your library is safely stored in your browser." The goal is accessibility.

### "Experience-First" Framing
Don't just list technical capabilities; explain *why* they matter for the roleplay experience. 
- *Bad*: "Event Master runs a separate prompt call every 6 turns."
- *Good*: "The Event Master injects unexpected plot twists into your story so that it never feels static or predictable."

### Highlight Superiority
Explicitly use the README to contrast EllipsisLM with more basic AI front-ends by highlighting features like the spatial World Map, dynamic background agents, or the multi-character "Narrator" system. Explain how these contribute to a more immersive and controlled storytelling environment.
