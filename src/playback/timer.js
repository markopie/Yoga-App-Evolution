export class PlaybackEngine {
    constructor() {
        this.timer = null;
        this.transitionTimer = null;
        this.running = false;
        this.isSuspended = false; // NEW: Tracks deliberate audio pauses
        this.remaining = 0;
        this.currentPoseSeconds = 0;
        
        // ── Active practice duration tracking ────────────────────────────────
        this._activePracticeMs = 0;     
        this._playStartWallMs  = null;  
        
        // Hooks
        this.onStart = () => {};
        this.onTick = (remaining, currentPoseSeconds) => {};
        this.onActiveTick = (secondsElapsed) => {};
        this.onPoseComplete = (wasLongHold) => {};
        this.onTransitionStart = (secs) => {};
        this.onTransitionTick = (secs) => {};
        this.onTransitionComplete = () => {};
        this.onStop = () => {};
    }

    get activePracticeSeconds() {
        let ms = this._activePracticeMs;
        if (this.running && !this.isSuspended && this._playStartWallMs !== null) {
            ms += (Date.now() - this._playStartWallMs);
        }
        return Math.round(ms / 1000);
    }

    resetPracticeTimer() {
        this._activePracticeMs = 0;
        this._playStartWallMs  = null;
    }
    
    setPoseTime(seconds) {
        this.currentPoseSeconds = parseInt(seconds, 10) || 0;
        this.remaining = this.currentPoseSeconds;
        this.onTick(this.remaining, this.currentPoseSeconds); 
        
        // Auto-resume if running, BUT protect the suspended state
        if (this.running && !this.timer && !this.isSuspended) {
            this.resume();
        }
    }

    start() {
        if (this.running) {
            this.stop();
            return;
        }

        this.running = true;
        this.isSuspended = false;
        this._playStartWallMs = Date.now(); 
        
        this.onStart(); // Interceptor runs here and might call suspend()

        // Only resume if onStart() didn't intentionally suspend it
        if (!this.isSuspended) {
            this.resume(); 
        }
    }

    suspend() {
        this.isSuspended = true;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        // Pause wall-clock tracking so audio prompts don't inflate practice time
        if (this._playStartWallMs !== null) {
            this._activePracticeMs += (Date.now() - this._playStartWallMs);
            this._playStartWallMs = null;
        }
    }

    resume() {
        if (!this.running) return;
        this.isSuspended = false;
        if (this.timer) return; // Already ticking

        this._playStartWallMs = Date.now(); // Restart wall-clock

        this.timer = setInterval(() => {
            if (this.remaining > 0) {
                this.remaining--;
                this.onTick(this.remaining, this.currentPoseSeconds);
                this.onActiveTick(1);
            }
            
            if (this.remaining <= 0) {
                clearInterval(this.timer);
                this.timer = null;
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
        
        if (this.running && this._playStartWallMs !== null) {
            this._activePracticeMs += (Date.now() - this._playStartWallMs);
            this._playStartWallMs = null;
        }
        
        this.running = false;
        this.isSuspended = false; // Reset suspension state
        this.onStop();
    }

    startTransition(secs = 15) {
        let transitionSecs = secs;
        this.onTransitionStart(transitionSecs);
        
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