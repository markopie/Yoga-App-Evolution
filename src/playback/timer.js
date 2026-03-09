export class PlaybackEngine {
    constructor() {
        this.timer = null;
        this.transitionTimer = null;
        this.running = false;
        this.remaining = 0;
        this.currentPoseSeconds = 0;
        
        // Hooks
        this.onStart = () => {};
        this.onTick = (remaining, currentPoseSeconds) => {};
        this.onPoseComplete = (wasLongHold) => {};
        this.onTransitionStart = (secs) => {};
        this.onTransitionTick = (secs) => {};
        this.onTransitionComplete = () => {};
        this.onStop = () => {};
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
        this.onStart();

        this.timer = setInterval(() => {
            if (this.remaining > 0) {
                this.remaining--;
                this.onTick(this.remaining, this.currentPoseSeconds);
            }
            
            if (this.remaining <= 0) {
                clearInterval(this.timer);
                this.timer = null;

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
        this.running = false;
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
