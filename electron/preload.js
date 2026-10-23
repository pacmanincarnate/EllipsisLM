/**
 * EllipsisLM Electron Preload Script
 * 
 * Runs in an isolated context. Uses contextBridge to safely expose
 * a limited set of Node/IPC capabilities to the HTML renderer
 * without enabling full nodeIntegration (which would be insecure).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronBridge', {

    /**
     * KoboldCPP process management.
     * All calls route through ipcMain in main.js.
     */
    kobold: {
        /**
         * Start KoboldCPP with the given CLI args.
         * @param {object} opts - { modelPath, contextSize, port, useCuda, gpuLayers, quantKv, useJinja, chatcompletionsadapter, autoFit }
         * @returns {Promise<void>}
         */
        start(opts) {
            return ipcRenderer.invoke('kobold:start', opts);
        },

        /** Stop the running KoboldCPP process. */
        stop: (opts) => ipcRenderer.invoke('kobold:stop', opts),

        /** Get the current status of the KoboldCPP process. */
        getStatus: () => ipcRenderer.invoke('kobold:getStatus'),

        /** Get the detailed process, port, and version status of KoboldCPP. */
        getDetailedStatus: (port) => ipcRenderer.invoke('kobold:getDetailedStatus', port),

        /** Get the current download progress and status for KoboldCPP. */
        getDownloadProgress: () => ipcRenderer.invoke('kobold:getDownloadProgress'),

        /** Get the latest available KoboldCPP version from GitHub. */
        getLatestVersion: () => ipcRenderer.invoke('kobold:getLatestVersion'),

        /** Get the locally installed KoboldCPP version. */
        getLocalVersion: () => ipcRenderer.invoke('kobold:getLocalVersion'),

        /**
         * Update KoboldCPP to a specific version.
         * @param {string} version - The version string to update to.
         * @returns {Promise<void>}
         */
        update: (version) => ipcRenderer.invoke('kobold:update', version),

        /**
         * Subscribe to status update events.
         * @param {function} callback - Called with a status string: 'starting'|'running'|'stopped'|'error'
         * @returns {function} Unsubscribe function.
         */
        onStatusChange(callback) {
            const listener = (_event, status) => callback(status);
            ipcRenderer.on('kobold:statusChange', listener);
            return () => ipcRenderer.removeListener('kobold:statusChange', listener);
        },

        /**
         * Subscribe to download progress events.
         * @param {function} callback - Called with a percentage (0-100).
         * @returns {function} Unsubscribe function.
         */
        onDownloadProgress(callback) {
            const listener = (_event, progress) => callback(progress);
            ipcRenderer.on('kobold:downloadProgress', listener);
            return () => ipcRenderer.removeListener('kobold:downloadProgress', listener);
        },

        /**
         * Subscribe to log line events from the KoboldCPP stdout.
         * @param {function} callback - Called with each line of text.
         * @returns {function} Unsubscribe function.
         */
        onLog(callback) {
            const listener = (_event, line) => callback(line);
            ipcRenderer.on('kobold:log', listener);
            return () => ipcRenderer.removeListener('kobold:log', listener);
        },

        /**
         * Subscribe to incompatible model detection events.
         * @param {function} callback - Called with { log, arch }.
         * @returns {function} Unsubscribe function.
         */
        onIncompatibleModel(callback) {
            const listener = (_event, data) => callback(data);
            ipcRenderer.on('kobold:incompatibleModel', listener);
            return () => ipcRenderer.removeListener('kobold:incompatibleModel', listener);
        },

        /**
         * Subscribe to port conflict detection events.
         * @param {function} callback - Called with { port, pid, exePath }.
         * @returns {function} Unsubscribe function.
         */
        onPortConflict(callback) {
            const listener = (_event, data) => callback(data);
            ipcRenderer.on('kobold:portConflict', listener);
            return () => ipcRenderer.removeListener('kobold:portConflict', listener);
        }
    },

    /**
     * Open a native file picker dialog to select a GGUF model file.
     * @returns {Promise<string|null>} Resolved file path, or null if cancelled.
     */
    pickModelFile() {
        return ipcRenderer.invoke('dialog:pickModelFile');
    },

    /** App metadata and Update system */
    app: {
        /** Returns the OS platform string (e.g., 'win32', 'darwin'). */
        getPlatform() {
            return process.platform;
        },

        /** Returns the app version string from package.json */
        getVersion() {
            return ipcRenderer.invoke('app:getVersion');
        },

        /** Get the latest available app version from GitHub. */
        getLatestVersion: () => ipcRenderer.invoke('app:getLatestVersion'),

        /** Download the app update installer. */
        downloadUpdate: (url) => ipcRenderer.invoke('app:downloadUpdate', url),

        /** Launch the downloaded installer and quit. */
        applyUpdate: (installerPath) => ipcRenderer.invoke('app:applyUpdate', installerPath),

        /** Progress listener for app updates. */
        onUpdateProgress: (callback) => {
            const listener = (_event, progress) => callback(progress);
            ipcRenderer.on('app:updateProgress', listener);
            return () => ipcRenderer.removeListener('app:updateProgress', listener);
        },

        /** Returns the resolved path to a bundled resource (e.g. koboldcpp.exe). */
        getResourcePath(filename) {
            return ipcRenderer.invoke('app:getResourcePath', filename);
        },

        /** Scrape JSON data from a URL using a hidden browser window */
        scrapeUrl: (url) => ipcRenderer.invoke('app:scrapeUrl', url)
    },

    /** Native Auto-Backup management */
    backup: {
        saveNative: (payload) => ipcRenderer.invoke('backup:saveNative', payload),
        loadNative: () => ipcRenderer.invoke('backup:loadNative'),
        getInfo: () => ipcRenderer.invoke('backup:getInfo')
    },

    /** Debugging and diagnostics log management */
    debug: {
        copyLog: (clientState) => ipcRenderer.invoke('debug:copyLog', clientState),
        getLog: (clientState) => ipcRenderer.invoke('debug:getLog', clientState),
        openLogFile: () => ipcRenderer.invoke('debug:openLogFile'),
        clearLog: () => ipcRenderer.invoke('debug:clearLog'),
        log: (level, message, source) => ipcRenderer.invoke('debug:log', { level, message, source })
    }
});
