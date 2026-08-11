import { BAT_THICKNESS_PROFILE } from "../game/constants";

export class SoundManager {
    private static instance: SoundManager | null = null;
    
    private ctx: AudioContext | null = null;

    // Master / Fallback Audio Buffers
    private batAudioBuffer: AudioBuffer | null = null;
    private pitchAudioBuffer: AudioBuffer | null = null;

    // Dedicated Handle Audio Buffer (handle.mp3 or region0.mp3)
    private handleAudioBuffer: AudioBuffer | null = null;

    // 16 Dedicated Blade Region Audio Buffers (region1.mp3 to region16.mp3)
    private bladeRegionBuffers: Map<number, AudioBuffer> = new Map();

    private lastBatHitTime: number = 0;
    private lastPitchBounceTime: number = 0;

    private constructor() {
        this.loadAudioFiles();
    }

    public static getInstance(): SoundManager {
        if (!SoundManager.instance) {
            SoundManager.instance = new SoundManager();
        }
        return SoundManager.instance;
    }

    private initContext(): AudioContext | null {
        if (!this.ctx) {
            const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtxClass) {
                this.ctx = new AudioCtxClass();
            }
        }
        if (this.ctx && this.ctx.state === "suspended") {
            this.ctx.resume().catch(() => {});
        }
        return this.ctx;
    }

    private async loadAudioFiles(): Promise<void> {
        const ctx = this.initContext();

        // Helper to fetch and decode an audio URL
        const fetchBuffer = async (url: string): Promise<AudioBuffer | null> => {
            try {
                const res = await fetch(url);
                if (res.ok) {
                    const arrayBuf = await res.arrayBuffer();
                    if (ctx) {
                        return await ctx.decodeAudioData(arrayBuf);
                    }
                }
            } catch (e) {
                // Silently ignore missing optional files
            }
            return null;
        };

        // 1. Load Handle Sound (handle.mp3 or region0.mp3)
        let handleBuf = await fetchBuffer("/sounds/handle.mp3");
        if (!handleBuf) {
            handleBuf = await fetchBuffer("/sounds/region0.mp3");
        }
        this.handleAudioBuffer = handleBuf;

        // 2. Load 16 Blade Region Sounds (region1.mp3 to region16.mp3)
        for (let i = 1; i <= 16; i++) {
            const buf = await fetchBuffer(`/sounds/region${i}.mp3`);
            if (buf) {
                this.bladeRegionBuffers.set(i, buf);
            }
        }

        // 3. Load Master Fallback Sound (ball_hit.mp3 or bat_hit.mp3)
        let masterBuf = await fetchBuffer("/sounds/ball_hit.mp3");
        if (!masterBuf) {
            masterBuf = await fetchBuffer("/sounds/bat_hit.mp3");
        }
        this.batAudioBuffer = masterBuf;

        // 4. Load Pitch Bounce Sound (pitch_bounce.mp3)
        this.pitchAudioBuffer = await fetchBuffer("/sounds/pitch_bounce.mp3");
    }

    public lastDebugInfo = {
        impactGain: 0,
        thicknessGain: 0,
        product: 0,
        impactSpeed: 0,
        regionIndex: 0,
        time: 0
    };

    /**
     * Tune and play bat hit sound based on 16 blade regions + handle.mp3.
     * STRICT MP3 ONLY: Silent if no MP3 buffer is loaded yet.
     * @param impactSpeed Relative collision velocity (px/s)
     * @param hitPixelOffset Distance from handle top along bat (0 to 167 pixels)
     */
    public playBatHit(impactSpeed: number, hitPixelOffset: number = 100): void {
        const now = Date.now();
        // Cooldown guard: 120ms debounce to prevent multi-triggering
        if (now - this.lastBatHitTime < 120) return;
        this.lastBatHitTime = now;

        const ctx = this.initContext();
        if (!ctx) return;

        const audioNow = ctx.currentTime;

        // 1. Calculate 84-region wood thickness & handle check
        const region84Index = Math.max(0, Math.min(83, Math.floor(hitPixelOffset / 2)));
        const thickness = BAT_THICKNESS_PROFILE[region84Index] || 20;
        const isHandle = hitPixelOffset < 56; // First 56px = Handle

        // 2. Quartic Power-Law Dynamic Collision Impulse Speed Scaling (v^4.0 exponent curve)
        const speedRatio = Math.max(.001, (impactSpeed-1000) / 220.0);
        const impactGain = Math.pow(speedRatio, 1.5); // Quartic curve: 0.0001 at defense to 1.0 at power shot

        // 3. Wood Thickness Normalization (12mm to 42mm)
        const tNorm = Math.min(1.0, Math.max(0.0, (thickness - 12) / 30.0));

        // 4. Calculate 16-Region Blade Index (for pixels 56..168 = 112px blade)
        const bladeOffset = Math.max(0, Math.min(111.9, hitPixelOffset - 56));
        const bladeRegion16Index = Math.min(16, Math.max(1, Math.floor(bladeOffset / 7) + 1));

        // Pitch shift scaling: gentle touch = lower pitch (0.70x), hard hit = sharp pitch (1.25x)
        const speedPitchMod = (speedRatio - 0.5) * 0.35;

        // -------------------------------------------------------------
        // SELECTION OF DEDICATED AUDIO BUFFER
        // -------------------------------------------------------------
        let targetBuffer: AudioBuffer | null = null;
        let basePitch = 1.0;
        let thicknessGain = 1.0;

        if (isHandle) {
            // A. Handle Hit (0..56px)
            targetBuffer = this.handleAudioBuffer || this.batAudioBuffer;
            basePitch = 1.25;
            thicknessGain = 0.65;
        } else {
            // B. Blade Hit (16 Regions: region1.mp3 .. region16.mp3)
            targetBuffer = this.bladeRegionBuffers.get(bladeRegion16Index) || this.batAudioBuffer;
            basePitch = 1.35 - tNorm * 0.45;
            thicknessGain = 0.65 + tNorm * 0.55;
        }

        // STRICT MP3 ONLY: If targetBuffer is not loaded yet or missing, DO NOT play synthetic noise!
        if (!targetBuffer) return;

        // STORE DEBUGGER INFO FOR CANVAS HUD RENDERER
        this.lastDebugInfo = {
            impactGain,
            thicknessGain,
            product: impactGain * thicknessGain,
            impactSpeed,
            regionIndex: isHandle ? 0 : bladeRegion16Index,
            time: Date.now()
        };

        // DEBUGGER LOG
        console.log(`[AUDIO DEBUG] impactGain * thicknessGain: ${(impactGain * thicknessGain).toFixed(4)} | impactGain: ${impactGain.toFixed(4)} | thicknessGain: ${thicknessGain.toFixed(4)} | impactSpeed: ${impactSpeed.toFixed(1)}`);

        // Final Volume = impactGain * thicknessGain * 5.0 (v^4.0 quartic dynamic growth!)
       const finalVolume = Math.min(80.0, Math.max(0.02, impactGain * thicknessGain ))*.4;
        const finalPlaybackRate = Math.min(1.6, Math.max(0.70, basePitch + speedPitchMod));

        const source = ctx.createBufferSource();
        source.buffer = targetBuffer;
        source.playbackRate.setValueAtTime(finalPlaybackRate, audioNow);

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(finalVolume, audioNow);

        if (isHandle && !this.handleAudioBuffer) {
            // Low-pass filter for handle if using master fallback audio
            const lowpass = ctx.createBiquadFilter();
            lowpass.type = "lowpass";
            lowpass.frequency.setValueAtTime(750, audioNow);
            source.connect(lowpass);
            lowpass.connect(gainNode);
        } else if (!isHandle && !this.bladeRegionBuffers.has(bladeRegion16Index)) {
            // Peak EQ filter for sweetspot if using master fallback audio
            const eq = ctx.createBiquadFilter();
            eq.type = "peaking";
            eq.frequency.setValueAtTime(350, audioNow);
            eq.Q.setValueAtTime(1.5, audioNow);
            eq.gain.setValueAtTime(tNorm * 4.5, audioNow);
            source.connect(eq);
            eq.connect(gainNode);
        } else {
            // Direct high-fidelity playback of dedicated region MP3!
            source.connect(gainNode);
        }

        gainNode.connect(ctx.destination);
        source.start(audioNow);
    }

    /**
     * Play ball-ground pitch bounce sound based on linear normal speed and distance attenuation from batter.
     * @param bounceSpeed Vertical/impact bounce velocity along ground normal (px/s)
     * @param bounceX Ball bounce X coordinate for spatial distance attenuation
     */
    public playPitchBounce(bounceSpeed: number, bounceX: number = 300): void {
        const absSpeed = Math.abs(bounceSpeed);
        // Ignore micro-bounces and rolling (< 120px/s)
        if (absSpeed < 120) return;

        const now = Date.now();
        // Cooldown guard: 150ms debounce
        if (now - this.lastPitchBounceTime < 150) return;
        this.lastPitchBounceTime = now;

        const ctx = this.initContext();
        if (!ctx) return;

        // STRICT MP3 ONLY: If pitchAudioBuffer is missing, DO NOT play synth fallback!
        if (!this.pitchAudioBuffer) return;

        const audioNow = ctx.currentTime;

        // 1. Dependency 1: Direct Linear Speed along Ground Normal (v_normal = |v_y|)
        const normalSpeedRatio = Math.min(1.0, Math.max(0.03, (absSpeed - 120) / 2200.0));

        // 2. Dependency 2: Spatial Distance Attenuation from Batter Stance (Batter X approx 300px)
        const batterX = 300;
        const distFromBatter = Math.abs(bounceX - batterX);
        const distanceAttenuation = Math.min(1.0, Math.max(0.25, 1.0 - (distFromBatter / 1200.0)));

        // 5X VOLUME BOOST (Combined 2-Dependency Bounce Volume)
        const finalVolume = Math.min(5.0, Math.max(0.10, normalSpeedRatio * distanceAttenuation * 5.0));

        // Pitch shift based on normal impact speed (harder pitch impact = crisp thud pitch)
        const playbackRate = 0.85 + normalSpeedRatio * 0.3;

        const source = ctx.createBufferSource();
        source.buffer = this.pitchAudioBuffer;
        source.playbackRate.setValueAtTime(playbackRate, audioNow);

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(finalVolume, audioNow);

        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        source.start(audioNow);
    }
}
