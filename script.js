// YouTube IFrame API Loading
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

// Constants
const FRAME_TIME = 1000 / 30; // Approx 30fps

// Global Manager
let syncManager;

function onYouTubeIframeAPIReady() {
    syncManager = new SyncManager();

    // Parse URL Parameters
    const params = new URLSearchParams(window.location.search);
    let hasParams = false;
    let i = 1;

    // Loop through v1, v2, v3...
    while (params.has(`v${i}`)) {
        hasParams = true;
        const vid = extractVideoId(params.get(`v${i}`));
        const offset = parseInt(params.get(`o${i}`)) || 0;

        if (vid) {
            syncManager.addPlayer(vid, offset);
        }
        i++;
    }

    // Default Fallback if no URL params
    if (!hasParams) {
        syncManager.addPlayer('kbNdx0yqbZE'); // Primary
        syncManager.addPlayer('fckdimdQ2ak', 680); // Secondary 1
    }
}

/**
 * SyncManager: Orchestrates multiple SyncPlayer instances
 */
class SyncManager {
    constructor() {
        this.players = [];
        this.primary = null;
        this.isPlaying = false;

        this.players = [];
        this.primary = null;
        this.isPlaying = false;

        this.setupGlobalControls();

        // Global Loop
        this.interval = setInterval(() => this.updateLoop(), 100);
    }

    addPlayer(videoId, initialOffset = 0) {
        const id = this.players.length; // Simple ID, index-based for now but we use uniqueId internally too
        const player = new SyncPlayer(id, videoId, this, initialOffset);
        this.players.push(player);

        if (this.players.length === 1) {
            this.primary = player; // First player is always Primary
            player.setLabel("Primary");
        } else {
            player.setLabel(`Secondary ${this.players.length - 1}`);
        }
    }

    removePlayer(uniqueId) {
        // Find index
        const index = this.players.findIndex(p => p.uniqueId === uniqueId);
        if (index === -1) return;

        // Destroy player
        this.players[index].destroy();
        this.players.splice(index, 1);

        // Re-assign Primary if needed
        if (this.players.length > 0) {
            this.primary = this.players[0];
            this.primary.setLabel("Primary");
            // Renumber others for clarity
            this.players.forEach((p, i) => {
                if (i > 0) p.setLabel(`Secondary ${i}`);
            });
        } else {
            this.primary = null;
        }
    }

    // Called when Primary state changes
    onPrimaryStateChange(newState) {
        if (!this.primary) return;

        if (newState === YT.PlayerState.PLAYING) {
            this.isPlaying = true;
            this.broadcastPlay();
            this.updateGlobalIcons(true);
        } else if (newState === YT.PlayerState.PAUSED) {
            this.isPlaying = false;
            this.broadcastPause();
            this.forceSyncAll();
            this.updateGlobalIcons(false);
        } else if (newState === YT.PlayerState.BUFFERING) {
            // Pause secondaries to wait for primary
            this.broadcastPause();
        } else if (newState === YT.PlayerState.CUED || newState === YT.PlayerState.ENDED) {
            this.isPlaying = false;
            this.updateGlobalIcons(false);
        }
    }

    broadcastPlay() {
        this.players.forEach(p => {
            if (p !== this.primary) p.play();
        });
    }

    broadcastPause() {
        this.players.forEach(p => {
            if (p !== this.primary) p.pause();
        });
    }

    broadcastSeek(relativeSeconds) {
        this.broadcastPause();
        // Give pause a moment to settle
        setTimeout(() => {
            this.players.forEach(p => p.step(relativeSeconds));
        }, 50);
    }

    forceSyncAll() {
        if (!this.primary) return;
        const primaryTime = this.primary.getCurrentTime();
        this.players.forEach(p => {
            if (p !== this.primary) p.syncToPrimary(primaryTime);
        });
    }

    updateLoop() {
        if (!this.primary || !this.isPlaying) return;

        // Check if Primary is actually playing (sanity check)
        if (this.primary.state !== YT.PlayerState.PLAYING) return;

        const primaryTime = this.primary.getCurrentTime();

        // Check secondaries
        this.players.forEach(p => {
            if (p === this.primary) return;
            p.checkDrift(primaryTime, this.primary.getPlaybackRate());
        });
    }

    setupGlobalControls() {
        const addBtn = document.getElementById('add-player-btn');
        if (addBtn) addBtn.addEventListener('click', () => {
            this.addPlayer('');
        });

        // Define broadcastRate method inside SyncManager
        this.broadcastRate = (rate) => {
            this.players.forEach(p => {
                if (p !== this.primary) p.setRate(rate);
            });
        };

        this.playAll = () => {
            if (!this.primary) return;
            // Play Primary
            this.primary.play();
            // Play Secondaries immediately
            this.players.forEach(p => {
                if (p !== this.primary) p.play();
            });
        };

        this.pauseAll = () => {
            this.players.forEach(p => p.pause());
        };

        const loadBtn = document.getElementById('load-videos-btn');
        if (loadBtn) loadBtn.addEventListener('click', () => {
            this.players.forEach(p => p.loadFromInput());
        });

        const shareBtn = document.getElementById('share-btn');
        if (shareBtn) shareBtn.addEventListener('click', () => {
            const baseUrl = window.location.origin + window.location.pathname;
            const params = new URLSearchParams();

            this.players.forEach((p, index) => {
                const i = index + 1;
                const vid = extractVideoId(p.input.value);
                if (vid) {
                    params.set(`v${i}`, vid);
                    if (p.syncOffset !== 0) {
                        params.set(`o${i}`, p.syncOffset);
                    }
                }
            });

            const shareUrl = `${baseUrl}?${params.toString()}`;
            navigator.clipboard.writeText(shareUrl).then(() => {
                const originalText = shareBtn.textContent;
                shareBtn.textContent = "Copied!";
                setTimeout(() => shareBtn.textContent = originalText, 2000);
            }).catch(err => {
                console.error('Failed to copy: ', err);
                prompt("Copy this link:", shareUrl);
            });
        });

        document.getElementById('btn-play').addEventListener('click', () => this.playAll());
        document.getElementById('btn-pause').addEventListener('click', () => this.pauseAll());

        document.querySelector('[data-action="frame-back"]').addEventListener('click', () => this.broadcastSeek(-FRAME_TIME / 1000));
        document.querySelector('[data-action="frame-fwd"]').addEventListener('click', () => this.broadcastSeek(FRAME_TIME / 1000));

        // Legacy Sync buttons removed
    }

    updateGlobalIcons(isPlaying) {
        const btnPlay = document.getElementById('btn-play');
        const btnPause = document.getElementById('btn-pause');
        if (isPlaying) {
            btnPlay.classList.add('hidden');
            btnPause.classList.remove('hidden');
        } else {
            btnPause.classList.add('hidden');
            btnPlay.classList.remove('hidden');
        }
    }
}

/**
 * SyncPlayer: Manages a single Player UI & Logic
 */
class SyncPlayer {
    constructor(id, initialVideoId, manager, initialOffset = 0) {
        this.manager = manager;
        this.uniqueId = `player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.player = null;
        this.syncOffset = initialOffset;
        this.lastSeekTime = 0;
        this.state = -1;
        this.playbackRate = 1.0;
        this.targetQuality = 'default';
        this.consecutiveDriftFrames = 0;

        this.createElement(initialVideoId);

        // Defer player creation slightly to ensure DOM is ready? 
        // No, createElement appends synchronously.
        const vid = extractVideoId(initialVideoId);
        if (vid) {
            this.initPlayer(vid);
        }
    }

    createElement(initialVideoId) {
        const template = document.getElementById('player-template');
        const clone = template.content.cloneNode(true);
        const container = clone.querySelector('.video-container');

        this.element = container;
        this.element.dataset.uid = this.uniqueId;

        // Bind UI Elements
        this.input = container.querySelector('.video-id-input');
        this.input.value = initialVideoId;

        this.removeBtn = container.querySelector('.remove-btn');
        this.removeBtn.addEventListener('click', () => this.manager.removePlayer(this.uniqueId));

        this.timeDisplay = container.querySelector('.time-display');

        this.tapBtn = container.querySelector('.tap-btn');
        this.tapBtn.addEventListener('click', () => this.onTap());
        this.tapInfo = container.querySelector('.tap-info');

        // New Offset Controls
        this.offsetInput = container.querySelector('.offset-input');
        this.offsetInput.value = this.syncOffset;

        container.querySelector('[data-action="offset-dec-100"]').addEventListener('click', () => this.adjustOffset(-100));
        container.querySelector('[data-action="offset-dec-10"]').addEventListener('click', () => this.adjustOffset(-10));
        container.querySelector('[data-action="offset-inc-10"]').addEventListener('click', () => this.adjustOffset(10));
        container.querySelector('[data-action="offset-inc-100"]').addEventListener('click', () => this.adjustOffset(100));

        this.offsetInput.addEventListener('change', (e) => {
            const val = parseInt(e.target.value) || 0;
            const delta = val - this.syncOffset;
            this.adjustOffset(delta);
        });

        // this.offsetDisplay no longer exists, replaced by input

        // Setup Placeholder for YouTube API
        const placeholder = container.querySelector('.yt-placeholder');
        placeholder.id = this.uniqueId; // YT API replaces this ID

        document.getElementById('players-grid').appendChild(container);
    }

    setLabel(text) {
        this.element.querySelector('.player-label').textContent = `Video (${text})`;
    }

    destroy() {
        if (this.player && this.player.destroy) this.player.destroy();
        this.element.remove();
    }

    initPlayer(videoId) {
        // If creating with empty ID, don't init player yet
        if (!videoId) return;

        this.player = new YT.Player(this.uniqueId, {
            height: '100%',
            width: '100%',
            videoId: videoId,
            host: 'https://www.youtube-nocookie.com',
            playerVars: { 'playsinline': 1, 'rel': 0, 'autoplay': 0 },
            events: {
                'onReady': (e) => this.onReady(e),
                'onStateChange': (e) => this.onStateChange(e),
                'onPlaybackRateChange': (e) => this.onRateChange(e)
            }
        });
    }

    loadFromInput() {
        const inputVal = this.input.value;
        const vid = extractVideoId(inputVal);

        if (!vid) {
            if (inputVal) console.warn("Invalid YouTube ID or URL:", inputVal);
            return;
        }

        // Update input to show the clean ID (optional, but good for clarity)
        this.input.value = vid;

        if (this.player && this.player.cueVideoById) {
            this.player.cueVideoById(vid);
        } else {
            // Not initialized yet (was empty)
            this.initPlayer(vid);
        }
    }

    onReady(e) {
        // Restore speed setting
        this.setRate(this.playbackRate);
        this.setQuality(this.targetQuality);
    }

    onStateChange(e) {
        this.state = e.data;
        if (this === this.manager.primary) {
            this.manager.onPrimaryStateChange(this.state);
        }
    }

    onRateChange(e) {
        this.playbackRate = e.data;
        if (this === this.manager.primary) {
            this.manager.broadcastRate(this.playbackRate);
        }
    }

    play() {
        if (this.player && this.player.playVideo) this.player.playVideo();
    }

    pause() {
        if (this.player && this.player.pauseVideo) this.player.pauseVideo();
    }

    step(seconds) {
        if (!this.player || !this.player.getCurrentTime) return;
        this.player.seekTo(this.player.getCurrentTime() + seconds, true);
    }

    setRate(rate) {
        this.playbackRate = rate;
        if (this.player && this.player.setPlaybackRate) {
            this.player.setPlaybackRate(rate);
        }
    }

    setQuality(quality) {
        this.targetQuality = quality;
        if (this.player && this.player.setPlaybackQuality) {
            this.player.setPlaybackQuality(quality);
        }
    }

    getCurrentTime() {
        return this.player && this.player.getCurrentTime ? this.player.getCurrentTime() : 0;
    }

    setVolume(vol) {
        // vol is 0-100
        if (this.player && this.player.setVolume) {
            this.player.setVolume(vol);
        }
    }

    getPlaybackRate() {
        return this.player && this.player.getPlaybackRate ? this.player.getPlaybackRate() : 1;
    }

    adjustOffset(delta) {
        this.syncOffset += delta;
        this.updateOffsetDisplay();
        // If paused, apply immediately
        if (!this.manager.isPlaying) this.forceSyncToMaster();
    }

    updateOffsetDisplay() {
        if (this.offsetInput) this.offsetInput.value = this.syncOffset;
    }

    onTap() {
        const t = this.getCurrentTime();
        this.tapInfo.textContent = formatTime(t);

        if (this === this.manager.primary) {
            // Primary Cue
            this.manager.primaryCue = t;
        } else {
            // Secondary Cue - Calculate Offset
            // Target: secondaryTime=T should equal primaryTime=PrimaryCue
            // So drift = PrimaryCue - T
            // If T is behind, diff is positive. Offset should be positive.
            if (this.manager.primary && this.manager.primaryCue !== undefined) {
                // Target: secondaryTime=T should equal primaryTime=PrimaryCue + Offset
                // So Offset = T - PrimaryCue
                // Example: Primary=0, Secondary=5. Offset should be +5.
                const diff = t - this.manager.primaryCue;
                this.syncOffset = Math.round((diff) * 1000);

                this.updateOffsetDisplay();
                this.forceSyncToPrimary();
            }
        }
    }

    forceSyncToPrimary() {
        if (this === this.manager.primary) return;
        const primaryTime = this.manager.primary.getCurrentTime();
        this.syncToPrimary(primaryTime);
    }

    syncToPrimary(primaryTime) {
        // Secondary = Primary + Offset
        const targetTime = primaryTime + (this.syncOffset / 1000);
        if (targetTime < 0) return;

        if (this.player && this.player.seekTo) {
            this.player.seekTo(targetTime, true);
            this.lastSeekTime = Date.now();
        }
    }

    checkDrift(primaryTime, primaryRate) {
        // Don't drift check if buffering or speed mismatch
        if (this.state === YT.PlayerState.BUFFERING) return;
        if (this.getPlaybackRate() !== primaryRate) return;

        // Secondary = Primary + Offset
        const targetTime = primaryTime + (this.syncOffset / 1000);
        const myTime = this.getCurrentTime();
        const diff = myTime - targetTime;

        // Cooldown
        if (Date.now() - this.lastSeekTime < 1000) return;

        // Strict threshold (0.04) to catch small offsets like 80ms
        const THRESHOLD = 0.04;

        if (Math.abs(diff) > THRESHOLD) {
            console.log(`[Player Drift] Drift: ${diff.toFixed(3)}. Correcting.`);
            this.syncToPrimary(primaryTime);
        }

        // Update Time Display
        if (this.timeDisplay) this.timeDisplay.textContent = formatTime(myTime);
    }
}


// Utils
function formatTime(seconds) {
    if (typeof seconds !== 'number') return "00:00.000";
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${pad(min)}:${pad(sec)}.${pad(ms, 3)}`;
}

function pad(num, size = 2) {
    let s = num + "";
    while (s.length < size) s = "0" + s;
    return s;
}

function extractVideoId(input) {
    if (!input) return null;
    // If it's already an 11-char ID (and looks like one), return it.
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
        return input;
    }
    // Regex for standard and share URLs
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = input.match(regex);
    return match ? match[1] : null; // Return ID or null if failed
}
