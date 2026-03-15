export class PlaybackEngine {
    constructor() {
        this.timer = null;
        this.transitionTimer = null;
        this.running = false;
        this.remaining = 0;
        this.currentPoseSeconds = 0;
        
        // ── Active practice duration tracking ────────────────────────────────
        // We track wall-clock intervals rather than counting ticks so that
        // paused time, browsing time, and tab-switch gaps are excluded.
        this._activePracticeMs = 0;     // accumulated ms across completed play intervals
        this._playStartWallMs  = null;  // wall-clock timestamp of last "Start" press
        
        // Hooks
        this.onStart = () => {};
        this.onTick = (remaining, currentPoseSeconds) => {};
        this.onPoseComplete = (wasLongHold) => {};
        this.onTransitionStart = (secs) => {};
        this.onTransitionTick = (secs) => {};
        this.onTransitionComplete = () => {};
        this.onStop = () => {};
    }

    // ── Public getter: active seconds elapsed (paused time excluded) ─────────
    get activePracticeSeconds() {
        let ms = this._activePracticeMs;
        // If currently playing, add the in-progress interval too
        if (this.running && this._playStartWallMs !== null) {
            ms += (Date.now() - this._playStartWallMs);
        }
        return Math.round(ms / 1000);
    }

    // ── Reset all duration tracking (call when a new sequence is selected) ───
    resetPracticeTimer() {
        this._activePracticeMs = 0;
        this._playStartWallMs  = null;
    }
    
    setPoseTime(seconds) {
        this.currentPoseSeconds = parseInt(seconds, 10) || 0;
        this.remaining = this.currentPoseSeconds;
        this.onTick(this.remaining, this.currentPoseSeconds); // Ensure UI updates instantly on set
    }

    start() {
        if (this.running) {
            this.stop();
            return;
        }

        this.running = true;
        this._playStartWallMs = Date.now(); // ← record wall-clock start
        this.onStart();

        this.timer = setInterval(() => {
            if (this.remaining > 0) {
                this.remaining--;
                this.onTick(this.remaining, this.currentPoseSeconds);
            }
            
            if (this.remaining <= 0) {
                clearInterval(this.timer);
                this.timer = null;
                // Accumulate this play interval before marking as stopped
                if (this._playStartWallMs !== null) {
                    this._activePracticeMs += (Date.now() - this._playStartWallMs);
                    this._playStartWallMs = null;
                }
                this.running = false;

                const wasLongHold = this.currentPoseSeconds >= 60;
                this.onPoseComplete(wasLongHold);
            }
        }, 1000);
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        if (this.transitionTimer) clearInterval(this.transitionTimer);
        this.transitionTimer = null;
        
        // Accumulate wall-clock ms for this play interval
        if (this.running && this._playStartWallMs !== null) {
            this._activePracticeMs += (Date.now() - this._playStartWallMs);
            this._playStartWallMs = null;
        }
        this.running = false;
        this.onStop();
    }

    startTransition(secs = 15) {
        let transitionSecs = secs;
        this.onTransitionStart(transitionSecs);
        
        // Transition time is NOT counted as active practice (user is recovering/
        // reading which next pose is coming, not actively holding a pose).
        this.transitionTimer = setInterval(() => {
            transitionSecs--;
            this.onTransitionTick(transitionSecs);
            
            if (transitionSecs <= 0) {
                this.finishTransition();
            }
        }, 1000);
    }
    
    finishTransition() {
        if (this.transitionTimer) {
            clearInterval(this.transitionTimer);
            this.transitionTimer = null;
        }
        this.onTransitionComplete();
    }
    
    skipTransition() {
        if (this.transitionTimer) {
            this.finishTransition();
        }
    }
}

export const playbackEngine = new PlaybackEngine();

