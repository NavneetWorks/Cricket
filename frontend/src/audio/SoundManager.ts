import { BAT_THICKNESS_PROFILE } from "../game/constants";

export class SoundManager {
    private static instance: SoundManager | null = null;
    
    private ctx: AudioContext | null = null;
    private batAudioBuffer: AudioBuffer | null = null;
    private pitchAudioBuffer: AudioBuffer | null = null;

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
        try {
            const batRes = await fetch("/sounds/bat_hit.mp3");
            if (batRes.ok) {
                const arrayBuf = await batRes.arrayBuffer();
                const ctx = this.initContext();
                if (ctx) {
                    this.batAudioBuffer = await ctx.decodeAudioData(arrayBuf);
                }
            }
        } catch (e) {
            console.warn("Could not load /sounds/bat_hit.mp3:", e);
        }

        try {
            const pitchRes = await fetch("/sounds/pitch_bounce.mp3");
            if (pitchRes.ok) {
                const arrayBuf = await pitchRes.arrayBuffer();
                const ctx = this.initContext();
                if (ctx) {
                    this.pitchAudioBuffer = await ctx.decodeAudioData(arrayBuf);
                }
            }
        } catch (e) {
            console.warn("Could not load /sounds/pitch_bounce.mp3:", e);
        }
    }

    /**
     * Tune and play user's bat_hit.mp3 based on exact 84-region wood thickness & impact speed.
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

        // 1. Calculate 84-region index (2px per region across 168px total bat length)
        // Indices 0..27 = 56px Rubber-wrapped cylindrical cane handle
        // Indices 28..83 = 112px Wooden blade profile (14mm to 42mm thickness)
        const regionIndex = Math.max(0, Math.min(83, Math.floor(hitPixelOffset / 2)));
        const thickness = BAT_THICKNESS_PROFILE[regionIndex] || 20;

        // 2. Direct Linear Collision Impact Velocity Scaling (Full Range: 500px/s soft to 5500px/s power shot)
        const speedRatio = Math.min(1.0, Math.max(0.03, (impactSpeed - 500) / 5000.0));
        const impactGain = speedRatio; // Direct linear scaling for maximum audible volume contrast

        // 3. Continuous Wood Thickness Audio DSP Calculations (T = 12mm to 42mm)
        const tNorm = Math.min(1.0, Math.max(0.0, (thickness - 12) / 30.0)); // 0.0 at handle/12mm, 1.0 at 42mm sweetspot

        const isHandle = regionIndex < 28; // First 56px

        // A. Continuous Playback Rate (Pitch Shift based on impact speed + thickness)
        const basePlaybackRate = isHandle ? 1.30 : (1.35 - tNorm * 0.45);
        const speedPitchMod = (speedRatio - 0.5) * 0.25;
        const playbackRate = Math.min(1.6, Math.max(0.7, basePlaybackRate + speedPitchMod));

        // B. Continuous Thickness Gain Amplitude: 0.65x at thin wood up to 1.20x at 42mm sweetspot
        const thicknessGain = isHandle ? 0.65 : (0.65 + tNorm * 0.55);

        const finalVolume = Math.min(1.0, Math.max(0.03, impactGain * thicknessGain));

        // MODE 1: Web Audio DSP Tuning of User's /sounds/bat_hit.mp3 Buffer
        if (this.batAudioBuffer) {
            const source = ctx.createBufferSource();
            source.buffer = this.batAudioBuffer;
            source.playbackRate.setValueAtTime(playbackRate, audioNow);

            const gainNode = ctx.createGain();
            gainNode.gain.setValueAtTime(finalVolume, audioNow);

            if (isHandle) {
                // Rubber-wrapped cylindrical cane handle filter (Low-Pass 750Hz absorbs high wood crack)
                const lowpass = ctx.createBiquadFilter();
                lowpass.type = "lowpass";
                lowpass.frequency.setValueAtTime(750, audioNow);

                source.connect(lowpass);
                lowpass.connect(gainNode);
            } else {
                // Wooden Blade EQ Filter (Boosts 350Hz low-mid punch for thick sweetspot)
                const eq = ctx.createBiquadFilter();
                eq.type = "peaking";
                eq.frequency.setValueAtTime(350, audioNow);
                eq.Q.setValueAtTime(1.5, audioNow);
                eq.gain.setValueAtTime(tNorm * 4.5, audioNow); // +4.5dB bass boost on sweetspot hit!

                source.connect(eq);
                eq.connect(gainNode);
            }

            gainNode.connect(ctx.destination);
            source.start(audioNow);
            return;
        }

        // MODE 2: Clean Single-Shot Fallback (If mp3 is still downloading or missing)
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(finalVolume, audioNow);
        const duration = isHandle ? 0.045 : (0.04 + tNorm * 0.11);
        masterGain.gain.exponentialRampToValueAtTime(0.001, audioNow + duration);

        if (isHandle) {
            // Damped rubber-over-cane cylinder thud
            const osc = ctx.createOscillator();
            osc.type = "sine";
            osc.frequency.setValueAtTime(550, audioNow);
            osc.frequency.exponentialRampToValueAtTime(150, audioNow + 0.045);

            osc.connect(masterGain);
            masterGain.connect(ctx.destination);
            osc.start(audioNow);
            osc.stop(audioNow + 0.045);
        } else {
            // Wood blade hit
            const attackLen = Math.floor(ctx.sampleRate * 0.01);
            const noiseBuf = ctx.createBuffer(1, attackLen, ctx.sampleRate);
            const data = noiseBuf.getChannelData(0);
            for (let i = 0; i < attackLen; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (attackLen * 0.3));
            }

            const noiseSource = ctx.createBufferSource();
            noiseSource.buffer = noiseBuf;

            const bandpass = ctx.createBiquadFilter();
            bandpass.type = "bandpass";
            bandpass.frequency.setValueAtTime(1800 + (1 - tNorm) * 600, audioNow);
            bandpass.Q.setValueAtTime(3.0, audioNow);

            noiseSource.connect(bandpass);
            bandpass.connect(masterGain);

            const bodyOsc = ctx.createOscillator();
            bodyOsc.type = "triangle";
            const fundamentalFreq = 380 + (1 - tNorm) * 800;
            bodyOsc.frequency.setValueAtTime(fundamentalFreq, audioNow);

            bodyOsc.connect(masterGain);
            masterGain.connect(ctx.destination);

            noiseSource.start(audioNow);
            bodyOsc.start(audioNow);

            noiseSource.stop(audioNow + 0.01);
            bodyOsc.stop(audioNow + duration);
        }
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

        const audioNow = ctx.currentTime;

        // 1. Dependency 1: Direct Linear Speed along Ground Normal (v_normal = |v_y|)
        const normalSpeedRatio = Math.min(1.0, Math.max(0.03, (absSpeed - 120) / 2200.0));

        // 2. Dependency 2: Spatial Distance Attenuation from Batter Stance (Batter X approx 300px)
        const batterX = 300;
        const distFromBatter = Math.abs(bounceX - batterX);
        const distanceAttenuation = Math.min(1.0, Math.max(0.25, 1.0 - (distFromBatter / 1200.0)));

        // Combined 2-Dependency Bounce Volume
        const finalVolume = Math.min(1.0, Math.max(0.02, normalSpeedRatio * distanceAttenuation));

        // Pitch shift based on normal impact speed (harder pitch impact = crisp thud pitch)
        const playbackRate = 0.85 + normalSpeedRatio * 0.3;

        if (this.pitchAudioBuffer) {
            const source = ctx.createBufferSource();
            source.buffer = this.pitchAudioBuffer;
            source.playbackRate.setValueAtTime(playbackRate, audioNow);

            const gainNode = ctx.createGain();
            gainNode.gain.setValueAtTime(finalVolume, audioNow);

            source.connect(gainNode);
            gainNode.connect(ctx.destination);
            source.start(audioNow);
            return;
        }

        // Clean fallback
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(finalVolume, audioNow);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioNow + 0.06);

        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(240 * playbackRate, audioNow);
        osc.frequency.exponentialRampToValueAtTime(80, audioNow + 0.05);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(audioNow);
        osc.stop(audioNow + 0.06);
    }
}
