import Bat from "../entities/Bat";
import Ball from "../entities/Ball";
import { Bowler } from "../entities/Bowler";
import Wicket from "../entities/Wicket";
import BowlingArea from "../entities/BowlingArea";
import Input from "./Input";
import Joystick from "./Joystick";
import Fielder from "../entities/Fielder";
import { SoundManager } from "../audio/SoundManager";
import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    GAME_COLORS,
    GROUND_HEIGHT,
    GRAVITY,
    AIR_DRAG_COEFF,
    WICKET_X,
    PITCH_LENGTH,
    BOWLER_WICKET_X,
    BOUNDARY_DISTANCE,
    BOWLER_START_X
} from "./constants";

export default class Renderer{
    private ctx:CanvasRenderingContext2D;
    private input: Input;
    private bat:Bat;
    private ball: Ball;
    public bowler: Bowler;
    public wicket: Wicket;
    public bowlingArea: BowlingArea;
    public joystick: Joystick;
    public fielders: Fielder[] = [];
    public keysPressed: Set<string> = new Set();
    
    public gameMode: 'BATTING' | 'BOWLING' | 'NEW_BOWLER' | 'DEBUG_13_FRAMES' | 'ANIMATION_PLAY' = 'BATTING';
    public debugSelectedFrames: number[] = []; // Empty = all, or 1-based indices e.g. [3, 6, 7]
    public debugFrameSource: 'RUNUP' | 'JUMP' = 'RUNUP';

    public cameraX: number = 0;

    public fieldingMessage: string | null = null;
    public fieldingMessageTimer: number = 0;

    public batterRuns: number = 0;
    public batterBalls: number = 0;
    public last6Balls: string[] = [];

    public recordBallOutcome(outcome: string) {
        this.batterBalls++;
        this.last6Balls.push(outcome);
        if (this.last6Balls.length > 6) {
            this.last6Balls.shift();
        }
    }

    public resetBatterStats() {
        this.batterRuns = 0;
        this.batterBalls = 0;
        this.last6Balls = [];
    }

    public useImageGround: boolean = true;
    private groundImage: HTMLImageElement;

    constructor(ctx:CanvasRenderingContext2D,bat:Bat,input:Input,ball: Ball){
        this.ctx = ctx;
        this.bat = bat;
        this.input = input;
        this.ball = ball;
        this.bowler = new Bowler(BOWLER_START_X);
        this.wicket = new Wicket(this.bat);
        this.bowlingArea = new BowlingArea();
        this.joystick = new Joystick();
        
        this.groundImage = new Image();
        this.groundImage.src = '/assets/cricket_ground_layers_cropped.png';
        
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'g') {
                this.useImageGround = !this.useImageGround;
                console.log("Image Ground toggled:", this.useImageGround);
            }
        });
    }

    private updateCamera() {
        if (this.gameMode === 'NEW_BOWLER' || this.gameMode === 'BOWLING') {
            // Anchor bowler near right edge with ~50px margin for back leg/foot
            const rightOffset = 120; // leaves 50px gap from right canvas border
            
            // 🔒 During Manual Jump Phase: Lock camera at preJumpStartX so ground stops scrolling & character glides forward across the screen!
            const bowler = this.bowler;
           if ((bowler.isExecutingJump || bowler.isPreJumpTransitioning || bowler.isPreJumpFrozen) && !bowler.isCycleCompleted) {
                const preJumpX = bowler.preJumpStartX > 0 ? bowler.preJumpStartX : bowler.currentHipPosition.x;
                const preJumpCamX = preJumpX - (CANVAS_WIDTH - rightOffset);
                this.cameraX = Math.max(0, preJumpCamX);
            }
            else {
                const targetCamX = bowler.currentHipPosition.x - (CANVAS_WIDTH - rightOffset);
                this.cameraX = Math.max(0, targetCamX);
            }
        } else {
            this.cameraX = 0;
        }
    }

    public render(alpha: number = 1){
        this.ctx.clearRect(
            0,0,CANVAS_WIDTH,CANVAS_HEIGHT
        );

        if (this.gameMode === 'DEBUG_13_FRAMES') {
            this.drawDebug13Frames();
            return;
        }

        this.updateCamera();

        this.drawSky();
        this.drawGround();

        // 🎥 Translate World Entities by -cameraX for camera tracking
        this.ctx.save();
        this.ctx.translate(-this.cameraX, 0);

        this.wicket.draw(this.ctx);

        // 🏏 Bat & Batsman Skeleton drawn in both BATTING and NEW_BOWLER modes:
        if (this.gameMode === 'BATTING' || this.gameMode === 'NEW_BOWLER' || this.gameMode === 'BOWLING') {
            this.drawBat();
        }

        // ⚾ BOWLING Mode me purana Bowling Arc Overlay draw hoga:
        if (this.gameMode === 'BOWLING') {
            this.bowlingArea.draw(this.ctx);
        }

        // 🏏 Bowler End Wicket (Drawn at BOWLER_WICKET_X)
        const wicketWorldX = this.wicket ? this.wicket.FIXED_X : WICKET_X;
        this.wicket.drawAt(this.ctx, BOWLER_WICKET_X);

        // 🏃 Bowler Skeleton draw in NEW_BOWLER, BOWLING, BATTING, and ANIMATION_PLAY modes:
        if (this.gameMode === 'NEW_BOWLER' || this.gameMode === 'BOWLING' || this.gameMode === 'BATTING' || this.gameMode === 'ANIMATION_PLAY') {
            this.bowler.drawDebugSkeleton(this.ctx, this.ball);
        }

        // 📍 Draw Red Jump Indicator Line on Ground in NEW_BOWLER mode
        if ((this.gameMode === 'NEW_BOWLER' || this.gameMode === 'BATTING') && this.bowler.startJumpX) {
            const groundY = CANVAS_HEIGHT - GROUND_HEIGHT;
            const markX = this.bowler.startJumpX;

            this.ctx.save();
            // Red vertical line on ground
            this.ctx.strokeStyle = "#ef4444";
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(markX, groundY - 45);
            this.ctx.lineTo(markX, groundY + 5);
            this.ctx.stroke();

            // Red dot badge
            this.ctx.fillStyle = "#ef4444";
            this.ctx.beginPath();
            this.ctx.arc(markX, groundY - 45, 5, 0, Math.PI * 2);
            this.ctx.fill();

            // Red label
            this.ctx.font = "bold 11px Inter, Arial, sans-serif";
            this.ctx.fillStyle = "#ef4444";
            this.ctx.textAlign = "center";
            this.ctx.fillText("JUMP POINT", markX, groundY - 54);
            this.ctx.restore();
        }

       // this.drawBallTrail();
        this.ball.draw(this.ctx, alpha);

        if (this.fielders && this.fielders.length > 0) {
            this.drawFielders(this.fielders, this.keysPressed);
        }

        this.ctx.restore(); // Restore context for fixed HUD / UI overlays

        this.drawDebug();

        // 🕹️ Draw Bottom-Right Bowling Arm Joystick & Top Screen Debug HUD in NEW_BOWLER mode:
        if (this.gameMode === 'NEW_BOWLER') {
            this.joystick.setSyncedKnobPos(this.bowler.smoothJoystickAngleRad, this.bowler.smoothJoystickRadiusRatio);
            this.joystick.draw(this.ctx);

            // 🟢 Right Side Debug HUD Pill for Pre-Delivery Jump Initiation (Below Top Buttons)
            const bowler = this.bowler;
            const badgeW = 540;
            const badgeH = 38;
            const badgeX = CANVAS_WIDTH - badgeW - 20;
            const badgeY = 65;

            this.ctx.save();
            this.ctx.fillStyle = "rgba(15, 23, 42, 0.90)";
            this.ctx.beginPath();
            this.ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
            this.ctx.fill();

            this.ctx.strokeStyle = "#10b981"; // Emerald green border
            this.ctx.lineWidth = 1.5;
            this.ctx.stroke();

            this.ctx.font = "bold 13px Inter, Arial, sans-serif";
            this.ctx.fillStyle = "#ffffff";
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";

            const offsetDeg = bowler.initialStaticOffsetDeg.toFixed(1);
            const jumpAngleDeg = bowler.accumulatedJoystickAngleDeg.toFixed(1);
            
            let statusText = `🏃 Press SPACE to Run | Left Click to Jump`;
            if (bowler.isGatheringArmActive) {
                statusText = `🎯 GATHERING PHASE | Jump Swing Angle: 0.0° (Waiting for Red Mark)`;
            } else if (bowler.isExecutingJump || bowler.isPreJumpTransitioning || bowler.isPreJumpFrozen) {
                const phaseStr = bowler.currentBowlingPhase ? `[PHASE ${bowler.currentBowlingPhase}]` : ``;
                statusText = `🚀 JUMP ${phaseStr} | Swing Angle: ${jumpAngleDeg}° | Offset: ${offsetDeg}°`;
            } else if (bowler.isCycleCompleted) {
                const spd = bowler.lastReleaseSpeed?.toFixed(0) ?? "0";
                const ang = bowler.lastReleaseAngleDeg?.toFixed(1) ?? "0";
                statusText = `🏁 DELIVERY COMPLETE | Speed: ${spd} px/s | Angle: ${ang}° | Final Swing: ${jumpAngleDeg}°`;
            }

            this.ctx.fillText(statusText, badgeX + badgeW / 2, badgeY + badgeH / 2);
            this.ctx.restore();

            // 📊 Angle Travelled and Current Frame HUD Pill
            const frameBadgeW = 540;
            const frameBadgeH = 38;
            const frameBadgeX = CANVAS_WIDTH - frameBadgeW - 20;
            const frameBadgeY = 110;
            
            this.ctx.save();
            this.ctx.fillStyle = "rgba(15, 23, 42, 0.90)";
            this.ctx.beginPath();
            this.ctx.roundRect(frameBadgeX, frameBadgeY, frameBadgeW, frameBadgeH, 8);
            this.ctx.fill();

            this.ctx.strokeStyle = "#f59e0b"; // Amber border
            this.ctx.lineWidth = 1.5;
            this.ctx.stroke();

            this.ctx.font = "bold 13px Inter, Arial, sans-serif";
            this.ctx.fillStyle = "#ffffff";
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";

            const currentFrameNum = Math.floor(Math.min(645, Math.max(0.0, bowler.accumulatedJoystickAngleDeg)));
            const angleText = `📊 Angle Travelled: ${jumpAngleDeg}°  |  Current Frame: ${currentFrameNum}`;

            this.ctx.fillText(angleText, frameBadgeX + frameBadgeW / 2, frameBadgeY + frameBadgeH / 2);
            this.ctx.restore();

            // 🚀 Release Speed Debug HUD Pill (Positioned right below at Y = 155)
            if (bowler.lastReleaseSpeed !== null) {
                const relBadgeW = 680;
                const relBadgeH = 38;
                const relBadgeX = CANVAS_WIDTH - relBadgeW - 20;
                const relBadgeY = 155;

                this.ctx.save();
                this.ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
                this.ctx.beginPath();
                this.ctx.roundRect(relBadgeX, relBadgeY, relBadgeW, relBadgeH, 8);
                this.ctx.fill();

                this.ctx.strokeStyle = "#38bdf8"; // Vibrant Cyan border
                this.ctx.lineWidth = 1.5;
                this.ctx.stroke();

                this.ctx.font = "bold 12.5px Inter, Arial, sans-serif";
                this.ctx.fillStyle = "#38bdf8"; // Vibrant Cyan text
                this.ctx.textAlign = "center";
                this.ctx.textBaseline = "middle";

                const vx = bowler.lastReleaseVx?.toFixed(0) ?? "0";
                const vy = bowler.lastReleaseVy?.toFixed(0) ?? "0";
                const vBodyX = bowler.lastReleaseVBodyX?.toFixed(0) ?? "0";
                const vArmX = bowler.lastReleaseVArmX?.toFixed(0) ?? "0";
                const speed = bowler.lastReleaseSpeed?.toFixed(0) ?? "0";
                const angle = bowler.lastReleaseAngleDeg?.toFixed(1) ?? "0";

                const relText = `🚀 RELEASE: ${speed} px/s | Vx = ${vBodyX} (runup) + ${vArmX} (arm) = ${vx} px/s | Vy: ${vy} px/s | Angle: ${angle}°`;
                this.ctx.fillText(relText, relBadgeX + relBadgeW / 2, relBadgeY + relBadgeH / 2);
                this.ctx.restore();
            }
        }
        // 🏏 Render Fielding Results
        if (this.fieldingMessage && this.fieldingMessageTimer > 0) {
            this.ctx.save();
            this.ctx.font = "900 48px Inter, Arial, sans-serif";
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";

            // Outline / Drop Shadow effect
            this.ctx.lineWidth = 6;
            this.ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
            this.ctx.strokeText(this.fieldingMessage, CANVAS_WIDTH / 2, 200);

            // Fill text with colors based on catch vs stop
            if (this.fieldingMessage.includes("CATCH")) {
                this.ctx.fillStyle = "#facc15"; // Yellow for catches
            } else {
                this.ctx.fillStyle = "#38bdf8"; // Light blue for fielded balls
            }
            this.ctx.fillText(this.fieldingMessage, CANVAS_WIDTH / 2, 200);
            this.ctx.restore();
        }

        // 🏏 Render Clean Minimalist Ground-Integrated Scorecard (Bottom Center)
        this.ctx.save();
        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT; // 725px
        const hudWidth = 400;
        const scoreX = (CANVAS_WIDTH - hudWidth) / 2; // Centered at bottom ground
        const scoreY = groundY + 15;

        // 1. Batter Name & Score (Clean Text Overlaid Directly on Ground with Drop Shadows)
        this.ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
        this.ctx.shadowBlur = 4;
        this.ctx.shadowOffsetX = 1;
        this.ctx.shadowOffsetY = 2;

        this.ctx.font = "900 12px Inter, Arial, sans-serif";
        this.ctx.fillStyle = "#facc15"; // Warm Gold Label
        this.ctx.textAlign = "left";
        this.ctx.textBaseline = "top";
        this.ctx.fillText("BATTER", scoreX, scoreY + 4);

        // Big Runs & Balls Text
        this.ctx.font = "900 32px Inter, Arial, sans-serif";
        this.ctx.fillStyle = "#ffffff";
        this.ctx.textBaseline = "alphabetic";
        this.ctx.fillText(`${this.batterRuns}`, scoreX, scoreY + 54);

        const runsWidth = this.ctx.measureText(`${this.batterRuns}`).width;
        this.ctx.font = "bold 18px Inter, Arial, sans-serif";
        this.ctx.fillStyle = "#38bdf8"; // Vibrant Cyan
        this.ctx.fillText(`(${this.batterBalls}b)`, scoreX + runsWidth + 8, scoreY + 54);

        // Vertical Divider Line (Subtle Translucent White)
        const sepX = scoreX + 175;
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.moveTo(sepX, scoreY + 6);
        this.ctx.lineTo(sepX, scoreY + 56);
        this.ctx.stroke();

        // 2. THIS OVER Section (Floating Color-Coded Pills Directly on Ground)
        const overX = sepX + 20;
        this.ctx.font = "900 12px Inter, Arial, sans-serif";
        this.ctx.fillStyle = "#facc15"; // Warm Gold Label
        this.ctx.textAlign = "left";
        this.ctx.textBaseline = "top";
        this.ctx.fillText("THIS OVER", overX, scoreY + 4);

        const pillRadius = 14;
        const pillSpacing = 35;
        const pillCenterY = scoreY + 44;

        for (let i = 0; i < 6; i++) {
            const px = overX + i * pillSpacing + pillRadius;
            const outcome = this.last6Balls[i];

            this.ctx.beginPath();
            this.ctx.arc(px, pillCenterY, pillRadius, 0, Math.PI * 2);

            if (!outcome) {
                // Empty slot (Translucent circle on ground)
                this.ctx.shadowBlur = 0;
                this.ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
                this.ctx.fill();
                this.ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
                this.ctx.lineWidth = 1.5;
                this.ctx.stroke();
            } else {
                let pillColor = "#475569"; // Dot ball (dark slate)
                if (outcome === "4") pillColor = "#16a34a"; // Vibrant Green for 4
                else if (outcome === "6") pillColor = "#9333ea"; // Deep Purple for 6
                else if (outcome === "W") pillColor = "#dc2626"; // Crimson Red for Wicket
                else if (["1", "2", "3"].includes(outcome)) pillColor = "#0284c7"; // Cyan Blue for runs

                this.ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
                this.ctx.shadowBlur = 6;
                this.ctx.shadowOffsetY = 2;
                this.ctx.fillStyle = pillColor;
                this.ctx.fill();

                this.ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
                this.ctx.lineWidth = 1;
                this.ctx.stroke();

                this.ctx.shadowBlur = 0;
                this.ctx.font = "900 13px Inter, Arial, sans-serif";
                this.ctx.fillStyle = "#ffffff";
                this.ctx.textAlign = "center";
                this.ctx.textBaseline = "middle";
                this.ctx.fillText(outcome, px, pillCenterY + 0.5);
            }
        }

        this.ctx.restore();

        // 🎯 Render Custom Virtual Cursor
        this.drawCustomCursor();

        this.drawMiniScreen(alpha);
    }

    private drawCustomCursor() {
        if (!this.input) return;
        const cx = this.input.mouseX;
        const cy = this.input.mouseY;

        this.ctx.save();

        // 1. Glowing Outer Gold Aura
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 11, 0, Math.PI * 2);
        this.ctx.fillStyle = "rgba(251, 191, 36, 0.25)";
        this.ctx.fill();

        // 2. Crisp Metallic Gold Ring
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        this.ctx.strokeStyle = "#fbbf24"; // Bright Amber Gold
        this.ctx.lineWidth = 2.0;
        this.ctx.shadowColor = "#f59e0b";
        this.ctx.shadowBlur = 8;
        this.ctx.stroke();

        // 3. Tactical Reticle Ticks (Top, Bottom, Left, Right)
        this.ctx.strokeStyle = "#fef08a";
        this.ctx.lineWidth = 1.5;
        this.ctx.shadowBlur = 0;
        
        // Top & Bottom ticks
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy - 10); this.ctx.lineTo(cx, cy - 6);
        this.ctx.moveTo(cx, cy + 6);  this.ctx.lineTo(cx, cy + 10);
        // Left & Right ticks
        this.ctx.moveTo(cx - 10, cy); this.ctx.lineTo(cx - 6, cy);
        this.ctx.moveTo(cx + 6, cy);  this.ctx.lineTo(cx + 10, cy);
        this.ctx.stroke();

        // 4. Center Bright White Core
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fill();

        this.ctx.restore();
    }

    private drawDebug13Frames() {
        this.drawSky();
        this.drawGround();
        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT;

        // Draw ground baseline
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([8, 4]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, groundY);
        this.ctx.lineTo(CANVAS_WIDTH, groundY);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Choose keyframe array source
        const sourceFrames = this.debugFrameSource === 'JUMP' ? Bowler.PRE_DELIVERY_JUMP : Bowler.STATIC_FRAMES;
        const totalAvailable = sourceFrames.length;

        // Determine 0-based frame indices to render
        let indicesToRender: number[] = [];
        if (this.debugSelectedFrames && this.debugSelectedFrames.length > 0) {
            indicesToRender = this.debugSelectedFrames
                .map(n => n - 1) // convert 1-based to 0-based
                .filter(idx => idx >= 0 && idx < totalAvailable);
        }

        // If no valid filter specified, render all available frames
        if (indicesToRender.length === 0) {
            for (let i = 0; i < totalAvailable; i++) indicesToRender.push(i);
        }

        // Clean layout spacing calculations
        const count = indicesToRender.length;
        const margin = 100;
        const usableWidth = CANVAS_WIDTH - margin * 2;
        const spacing = count > 1 ? usableWidth / (count - 1) : 0;

        indicesToRender.forEach((frameIdx, order) => {
            const xPos = count === 1 ? CANVAS_WIDTH / 2 : CANVAS_WIDTH - margin - order * spacing;

            // Render skeleton pose
            this.bowler.drawStaticPose(this.ctx, frameIdx, xPos, groundY, sourceFrames);

            // Render Frame Number Badge above skeleton
            const labelText = `FRAME ${frameIdx + 1}`;
            const badgeY = groundY - 370;

            this.ctx.save();
            this.ctx.font = "bold 13px Inter, Arial, sans-serif";
            const textWidth = this.ctx.measureText(labelText).width;
            
            // Badge background pill
            this.ctx.fillStyle = this.debugFrameSource === 'JUMP' ? "rgba(225, 29, 72, 0.9)" : "rgba(139, 92, 246, 0.9)";
            this.ctx.beginPath();
            this.ctx.roundRect(xPos - textWidth / 2 - 10, badgeY - 14, textWidth + 20, 24, 6);
            this.ctx.fill();
            this.ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
            this.ctx.lineWidth = 1;
            this.ctx.stroke();

            // Text
            this.ctx.fillStyle = "#ffffff";
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";
            this.ctx.fillText(labelText, xPos, badgeY - 2);
            this.ctx.restore();
        });
    }

    private drawOverlay() {
        if (!this.input.isMouseActive) {
            this.ctx.save();
            const badgeW = 380;
            const badgeH = 40;
            const badgeX = (CANVAS_WIDTH - badgeW) / 2;
            const badgeY = 20;

            // Semi-transparent pill background
            this.ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
            this.ctx.beginPath();
            this.ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
            this.ctx.fill();

            // Accent border
            this.ctx.strokeStyle = "#38bdf8";
            this.ctx.lineWidth = 1.5;
            this.ctx.stroke();

            // Text
            this.ctx.font = "bold 15px sans-serif";
            this.ctx.fillStyle = "#ffffff";
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";
            this.ctx.fillText("Press ENTER to Control Bat with Mouse", CANVAS_WIDTH / 2, badgeY + badgeH / 2);
            this.ctx.restore();
        }
    }
    private drawSky(){
        this.ctx.fillStyle = GAME_COLORS.SKY;
        this.ctx.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
    }
    public drawFielders(fielders: Fielder[], keysPressed: Set<string>): void {
        const isF1Hold = keysPressed.has("f") || keysPressed.has("F");
        const isF2Hold = keysPressed.has("j") || keysPressed.has("J");

        if (fielders[0]) fielders[0].draw(this.ctx, isF1Hold);
        if (fielders[1]) fielders[1].draw(this.ctx, isF2Hold);
    }
    // Simple hash function to generate static noise based on coordinates
    private getStaticNoise(x: number, y: number): number {
        let t = (x * 374761393 + y * 668265263) >>> 0;
        t = ((t ^ (t >>> 15)) * 2246822519) >>> 0;
        t = ((t ^ (t >>> 13)) * 3266489917) >>> 0;
        return ((t ^ (t >>> 16)) >>> 0) / 4294967296; // Returns 0.0 to 1.0
    }
    private drawGround() {
        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT;

        // 1. BASE SOLID GROUND FILL
        this.ctx.fillStyle = GAME_COLORS.GROUND; // "#3CB043"
        this.ctx.fillRect(0, groundY, CANVAS_WIDTH, GROUND_HEIGHT);

        // 2. ALTERNATING LAWN MOWER STRIPES (Every 100px in world space)
        const stripeWidth = 100;
        const minWorldX = -500;
        const maxWorldX = 4000;

        for (let wx = minWorldX; wx <= maxWorldX; wx += stripeWidth) {
            const screenX = wx - this.cameraX;
            if (screenX + stripeWidth < 0 || screenX > CANVAS_WIDTH) continue;

            const stripeIndex = Math.floor((wx - minWorldX) / stripeWidth);
            if (stripeIndex % 2 === 0) {
                this.ctx.fillStyle = "rgba(0, 0, 0, 0.08)"; // Darker green stripe overlay
                this.ctx.fillRect(screenX, groundY, stripeWidth, GROUND_HEIGHT);
            }
        }

        // 3. DENSE PROCEDURAL GRASS SPIKES ALONG TOP GROUND EDGE
        this.ctx.strokeStyle = "#1b5220";
        this.ctx.lineWidth = 1.2;

        const bladeSpacing = 16; // Grass tuft every 16px
        for (let wx = minWorldX; wx <= maxWorldX; wx += bladeSpacing) {
            const screenX = wx - this.cameraX;
            if (screenX < -20 || screenX > CANVAS_WIDTH + 20) continue;

            // Deterministic height pseudo-noise using world position wx
            const noise = this.getStaticNoise(wx, 42);
            const bladeH = 6 + noise * 10; // 6px to 16px height spikes
            const tilt = (this.getStaticNoise(wx, 99) - 0.5) * 6; // Slight left/right tilt

            // Draw grass tuft (3 blades per tuft)
            this.ctx.beginPath();
            // Center blade
            this.ctx.moveTo(screenX, groundY);
            this.ctx.lineTo(screenX + tilt, groundY - bladeH);
            // Left blade
            this.ctx.moveTo(screenX - 3, groundY);
            this.ctx.lineTo(screenX - 3 + tilt - 3, groundY - bladeH * 0.75);
            // Right blade
            this.ctx.moveTo(screenX + 3, groundY);
            this.ctx.lineTo(screenX + 3 + tilt + 3, groundY - bladeH * 0.85);
            this.ctx.stroke();
        }

        // 4. RUN-UP DISTANCE CHALK MARKERS & CREASE LINES
        const chalkMarkerPositions = [150, 700, 1000, 1300, 1600, 1900, 2200, 2500];

        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        this.ctx.lineWidth = 2.0;

        chalkMarkerPositions.forEach(wx => {
            const screenX = wx - this.cameraX;
            if (screenX >= -50 && screenX <= CANVAS_WIDTH + 50) {
                // Vertical chalk line
                this.ctx.beginPath();
                this.ctx.moveTo(screenX, groundY);
                this.ctx.lineTo(screenX, groundY + 25);
                this.ctx.stroke();
            }
        });
    }

    // private drawGround(){
    //     const groundY = CANVAS_HEIGHT - GROUND_HEIGHT; 
        
    //     // Draw Image Ground (Fast 60 FPS GPU Rendering)
    //     if (this.groundImage.complete && this.groundImage.naturalWidth !== 0) {
    //         const imgWidth = this.groundImage.naturalWidth;
    //         const imgHeight = this.groundImage.naturalHeight;
    //         const scaleY = GROUND_HEIGHT / imgHeight;
    //         const scaleX = scaleY; 
    //         const scaledWidth = imgWidth * scaleX;
    //         const scaledHeight = GROUND_HEIGHT;
            
    //         for (let x = 0; x < CANVAS_WIDTH; x += scaledWidth) {
    //             this.ctx.drawImage(this.groundImage, x, groundY, scaledWidth, scaledHeight);
    //         }
    //         return; // Skip procedural loops for maximum performance
    //     }

    //     // Fallback fill if image is loading
    //     this.ctx.fillStyle = "#3CB043";
    //     this.ctx.fillRect(0, groundY, CANVAS_WIDTH, GROUND_HEIGHT);

    //     /* PROCEDURAL GROUND LOOPS COMMENTED OUT FOR 60 FPS PERFORMANCE
    //     const blockW = 4;
    //     const blockH = 4;
    //     for (let y = groundY; y < CANVAS_HEIGHT; y += blockH) {
    //         for (let x = 0; x < CANVAS_WIDTH; x += blockW) { ... }
    //     }
    //     for (let x = 0; x < CANVAS_WIDTH; x += 1) { ... }
    //     */
    // }
    private drawBat(){
        this.bat.draw(this.ctx);
    }
    private drawDebug(){
        /* DEBUG OVERLAYS - DISABLED FOR NOW
        this.ctx.font = "14px monospace";
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillText(`Mouse X: ${this.input.mouseX}, Mouse Y: ${this.input.mouseY}`, 10, 22);

        // LIVE AUDIO HUD DEBUGGER OVERLAY
        const debugInfo = SoundManager.getInstance().lastDebugInfo;
        if (debugInfo && debugInfo.time > 0) {
            const boxX = 10;
            const boxY = 90;
            const boxW = 450;
            const boxH = 75;

            // Dark semi-transparent background HUD card
            this.ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
            this.ctx.fillRect(boxX, boxY, boxW, boxH);
            this.ctx.strokeStyle = "#fbbf24"; // Amber border
            this.ctx.lineWidth = 1.5;
            this.ctx.strokeRect(boxX, boxY, boxW, boxH);

            // Metrics
            this.ctx.font = "bold 14px monospace";
            this.ctx.fillStyle = "#facc15"; // Yellow header
            this.ctx.fillText(`impactGain * thicknessGain: ${debugInfo.product.toFixed(4)}`, boxX + 10, boxY + 22);

            this.ctx.font = "12px monospace";
            this.ctx.fillStyle = "#67e8f9"; // Cyan metrics
            const regionLabel = debugInfo.regionIndex === 0 ? "Handle (0..56px)" : `Blade Region ${debugInfo.regionIndex} (of 16)`;
            this.ctx.fillText(`impactGain: ${debugInfo.impactGain.toFixed(4)} | thicknessGain: ${debugInfo.thicknessGain.toFixed(4)}`, boxX + 10, boxY + 44);
            this.ctx.fillText(`impactSpeed: ${debugInfo.impactSpeed.toFixed(1)} px/s | Zone: ${regionLabel}`, boxX + 10, boxY + 63);
        }
        */

        // DRAW BOLD RED "OUT" DEBUG OVERLAY IF WICKET IS HIT
        if (this.wicket && this.wicket.isOut) {
            this.ctx.save();
            const outX = CANVAS_WIDTH * 0.28; // Mid of top center and top left
            const outY = 45;

            // Glowing red background badge
            this.ctx.fillStyle = "rgba(220, 38, 38, 0.95)";
            this.ctx.fillRect(outX - 60, outY - 22, 120, 42);
            this.ctx.strokeStyle = "#ffffff";
            this.ctx.lineWidth = 2.5;
            this.ctx.strokeRect(outX - 60, outY - 22, 120, 42);

            this.ctx.font = "bold 30px sans-serif";
            this.ctx.fillStyle = "#ffffff";
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";
            this.ctx.fillText("OUT", outX, outY - 1);
            this.ctx.restore();
        }
    }

    /**
     * Draw Top-Left Mini Screen HUD Card (800px scaled representation of 10,000px world range)
     */
    private drawMiniScreen(alpha: number = 1): void {
        this.ctx.save();

        const boxX = 20;
        const boxY = 20;
        const boxW = 800; // 800px scaled width for 10,000px world range
        const boxH = 210; // Increased height (breadth) for better lob arc headroom

        const minWorldX = -300;
        const maxWorldX = 10000;
        const totalWorldX = maxWorldX - minWorldX; // 10,300px total range
        const scaleX = boxW / totalWorldX; // ~0.07767 (800 / 10300)

        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT; // 753px
        const miniGroundY = boxY + boxH - 22;
        const maxFlightHeight = 2200; // px height headroom
        const scaleY = (boxH - 45) / maxFlightHeight;

        // 1. MINI SCREEN CARD CONTAINER
        this.ctx.fillStyle = "rgba(15, 23, 42, 0.90)"; // Dark slate background
        this.ctx.fillRect(boxX, boxY, boxW, boxH);
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.7)"; // Clean white border
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeRect(boxX, boxY, boxW, boxH);

        // 2. HEADER LABELS ("MINI SCREEN  |  BALL RANGE: 78 px")
        this.ctx.font = "bold 12px sans-serif";
        this.ctx.textAlign = "left";
        this.ctx.textBaseline = "top";
        
        // "MINI SCREEN" in white
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillText("MINI SCREEN", boxX + 14, boxY + 12);

        // Integrated Range text right next to "MINI SCREEN" label
        const lastStats = (this.bat as any).lastHitStats;
        if (lastStats && lastStats.predictedRange !== undefined) {
            const rangePx = Math.round(lastStats.predictedRange);
            this.ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
            this.ctx.fillText("  |  ", boxX + 98, boxY + 12);

            this.ctx.fillStyle = "#fbbf24"; // Bright amber text
            this.ctx.fillText(`BALL RANGE: ${rangePx} px`, boxX + 124, boxY + 12);
        }

        // 3. HORIZONTAL GROUND BASELINE
        this.ctx.strokeStyle = "rgba(74, 222, 128, 0.85)"; // Green ground line
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.moveTo(boxX, miniGroundY);
        this.ctx.lineTo(boxX + boxW, miniGroundY);
        this.ctx.stroke();

        // 4. TINY VERTICAL WICKET LINE (AT WORLD X = WICKET_X) - Batsman End Wicket
        const wicketWorldX = this.wicket ? this.wicket.FIXED_X : WICKET_X;
        const miniWicketX = boxX + (wicketWorldX - minWorldX) * scaleX;
        this.ctx.strokeStyle = "#38bdf8"; // Bright cyan wicket line
        this.ctx.lineWidth = 2.0;
        this.ctx.beginPath();
        this.ctx.moveTo(miniWicketX, miniGroundY);
        this.ctx.lineTo(miniWicketX, miniGroundY - 14); // 14px height
        this.ctx.stroke();

        // 4b. TINY VERTICAL BOWLER WICKET LINE (AT WORLD X = BOWLER_WICKET_X)
        const bowlerWicketX = BOWLER_WICKET_X;
        const miniBowlerWicketX = boxX + (bowlerWicketX - minWorldX) * scaleX;
        this.ctx.strokeStyle = "#38bdf8"; // Bright cyan wicket line
        this.ctx.lineWidth = 2.0;
        this.ctx.beginPath();
        this.ctx.moveTo(miniBowlerWicketX, miniGroundY);
        this.ctx.lineTo(miniBowlerWicketX, miniGroundY - 14); // 14px height
        this.ctx.stroke();

        // 4c. GREEN BOUNDARY MARKER POINT (AT BOUNDARY_DISTANCE FROM BATSMAN WICKET)
        const boundaryWorldX = wicketWorldX + BOUNDARY_DISTANCE;
        const mini4xX = boxX + (boundaryWorldX - minWorldX) * scaleX;

        this.ctx.save();
        this.ctx.strokeStyle = "rgba(34, 197, 94, 0.65)"; // Vibrant Emerald Green
        this.ctx.lineWidth = 1.5;
        this.ctx.setLineDash([3, 3]);
        this.ctx.beginPath();
        this.ctx.moveTo(mini4xX, miniGroundY);
        this.ctx.lineTo(mini4xX, boxY + 30);
        this.ctx.stroke();

        // Green Boundary Point Circle
        this.ctx.fillStyle = "#22c55e";
        this.ctx.beginPath();
        this.ctx.arc(mini4xX, miniGroundY, 5, 0, Math.PI * 2);
        this.ctx.fill();

        // Text Badge Label
        this.ctx.font = "bold 10px Inter, Arial, sans-serif";
        this.ctx.fillStyle = "#22c55e";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "bottom";
        this.ctx.fillText(`BOUNDARY: ${BOUNDARY_DISTANCE}px`, mini4xX, boxY + 28);
        this.ctx.restore();

        // 5. FULL PARABOLIC TRAJECTORY ARC AFTER HIT (0..10,000 px)
        if (lastStats && lastStats.ballSpeedAfterX !== undefined) {
            const vx = lastStats.ballSpeedAfterX;
            const vy = lastStats.ballSpeedAfterY;
            const startX = lastStats.hitPosX !== undefined ? lastStats.hitPosX : 350;
            const startY = lastStats.hitPosY !== undefined ? lastStats.hitPosY : (groundY - 100);
            const g = GRAVITY; // GRAVITY

            this.ctx.strokeStyle = "rgba(56, 189, 248, 0.85)"; // Cyan trajectory line
            this.ctx.lineWidth = 1.5;
            this.ctx.setLineDash([3, 3]); // Dashed arc
            this.ctx.beginPath();

            const simDt = 0.008; // 125 Hz precise step simulation with air drag
            let px = startX;
            let py = startY;
            let simVx = vx;
            let simVy = vy;

            let firstPoint = true;
            for (let t = 0; t <= 5.0; t += simDt) {
                const speed = Math.hypot(simVx, simVy);
                const dragForceX = -AIR_DRAG_COEFF * speed * simVx;
                const dragForceY = -AIR_DRAG_COEFF * speed * simVy;

                simVx += dragForceX * simDt;
                simVy += (GRAVITY + dragForceY) * simDt;

                px += simVx * simDt;
                py += simVy * simDt;

                if (py > groundY + 5 || px > maxWorldX + 500) break;

                const mx = boxX + (px - minWorldX) * scaleX;
                const my = miniGroundY - (groundY - py) * scaleY;

                if (firstPoint) {
                    this.ctx.moveTo(mx, my);
                    firstPoint = false;
                } else {
                    this.ctx.lineTo(mx, my);
                }
            }
            this.ctx.stroke();
            this.ctx.setLineDash([]); // Reset line dash
        }

        // 6. TINY SOLID BLACK BALL DOT
        if (this.ball && this.ball.isActive) {
            // Interpolated render position (main canvas ball ke saath sync me dikhe)
            const ballWorldX = this.ball.getRenderPos(alpha).x;
            const ballWorldY = this.ball.getRenderPos(alpha).y;

            const miniBallX = boxX + (ballWorldX - minWorldX) * scaleX;
            const miniBallY = miniGroundY - (groundY - ballWorldY) * scaleY;

            // Render small solid BLACK ball dot matching user diagram
            this.ctx.fillStyle = "#000000"; // Solid Black
            this.ctx.beginPath();
            this.ctx.arc(miniBallX, miniBallY, 2.5, 0, 2 * Math.PI);
            this.ctx.fill();

            // High contrast white halo ring
            this.ctx.strokeStyle = "#ffffff";
            this.ctx.lineWidth = 0.8;
            this.ctx.stroke();
        }

        // 7. MINI FIELDERS RENDERING (F1 & F2 on Mini Screen Radar)
        if (this.fielders && this.fielders.length > 0) {
            for (const fielder of this.fielders) {
                const miniFielderX = boxX + (fielder.pos.x - minWorldX) * scaleX;
                const miniFielderY = miniGroundY - (groundY - fielder.pos.y) * scaleY;
                const isFHold = fielder.id === 1 
                    ? (this.keysPressed.has("f") || this.keysPressed.has("F")) 
                    : (this.keysPressed.has("j") || this.keysPressed.has("J"));

                // Draw Mini Fielder Marker Dot
                this.ctx.fillStyle = isFHold ? "#38bdf8" : "#0284c7";
                this.ctx.beginPath();
                this.ctx.arc(miniFielderX, miniFielderY - 3, 3.5, 0, Math.PI * 2);
                this.ctx.fill();

                this.ctx.strokeStyle = "#ffffff";
                this.ctx.lineWidth = 1;
                this.ctx.stroke();

                // Draw F1 / F2 Text Label above marker
                this.ctx.font = "bold 9px Inter, Arial, sans-serif";
                this.ctx.fillStyle = isFHold ? "#38bdf8" : "#e2e8f0";
                this.ctx.textAlign = "center";
                this.ctx.textBaseline = "bottom";
                this.ctx.fillText(`F${fielder.id}`, miniFielderX, miniFielderY - 8);
            }
        }

        this.ctx.restore();
    }

    private drawBallTrail() {
        const points = this.bowler.ballTrailPoints;
        if (points.length < 2) return;

        const authIdx = this.bowler.authoritativeHitTrailIndex !== undefined && this.bowler.authoritativeHitTrailIndex !== null ? this.bowler.authoritativeHitTrailIndex : -1;
        const splitIndex = (authIdx > 0 && authIdx < points.length) ? authIdx : points.length;

        this.ctx.save();
        this.ctx.lineWidth = 3.5;
        this.ctx.lineCap = "round";
        this.ctx.lineJoin = "round";

        const drawSegment = (startIdx: number, endIdx: number) => {
            if (endIdx - startIdx < 1) return;
            this.ctx.beginPath();
            this.ctx.moveTo(points[startIdx].x, points[startIdx].y);
            if (endIdx - startIdx === 1) {
                this.ctx.lineTo(points[startIdx + 1].x, points[startIdx + 1].y);
            } else {
                for (let i = startIdx + 1; i < endIdx; i++) {
                    const xc = (points[i].x + points[i + 1].x) / 2;
                    const yc = (points[i].y + points[i + 1].y) / 2;
                    this.ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
                }
                const last = points[endIdx];
                const prev = points[endIdx - 1];
                this.ctx.quadraticCurveTo(prev.x, prev.y, last.x, last.y);
            }
            this.ctx.stroke();
        };

        // Draw First Segment (Red)
        if (splitIndex > 0) {
            this.ctx.strokeStyle = "#ef4444"; // Vibrant Red
            drawSegment(0, splitIndex - 1);
        }

        // Draw Second Segment (Dark Blue)
        if (splitIndex < points.length) {
            this.ctx.strokeStyle = "#1e3a8a"; // Dark Blue
            drawSegment(splitIndex - 1, points.length - 1);
        }

        // Draw small dot at the latest ball point
        const last = points[points.length - 1];
        this.ctx.fillStyle = (splitIndex < points.length) ? "#1e3a8a" : "#ef4444";
        this.ctx.beginPath();
        this.ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
        this.ctx.fill();

        // 🟢 Draw Glowing Green Debug Dot where authoritative real release update replaced local ball state!
        if (this.bowler.debugReconciliationPoint) {
            const pt = this.bowler.debugReconciliationPoint;
            this.ctx.beginPath();
            this.ctx.arc(pt.x, pt.y, 12, 0, Math.PI * 2);
            this.ctx.fillStyle = "rgba(34, 197, 94, 0.4)";
            this.ctx.fill();

            this.ctx.beginPath();
            this.ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
            this.ctx.fillStyle = "#22c55e"; // Bright Green
            this.ctx.strokeStyle = "#ffffff";
            this.ctx.lineWidth = 2;
            this.ctx.fill();
            this.ctx.stroke();

            this.ctx.font = "bold 12px Inter, Arial, sans-serif";
            this.ctx.fillStyle = "#22c55e";
            this.ctx.textAlign = "center";
            this.ctx.fillText("REAL RECONCILIATION UPDATE", pt.x, pt.y - 16);
        }

        this.ctx.restore();
    }
}
