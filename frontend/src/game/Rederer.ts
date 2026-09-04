import Bat from "../entities/Bat";
import Ball from "../entities/Ball";
import Wicket from "../entities/Wicket";
import BowlingArea from "../entities/BowlingArea";
import Input from "./Input";
import { SoundManager } from "../audio/SoundManager";
import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    GAME_COLORS,
    GROUND_HEIGHT,
    GRAVITY
} from "./constants";

export default class Renderer{
    private ctx:CanvasRenderingContext2D;
    private input: Input;
    private bat:Bat;
    private ball: Ball;
    public wicket: Wicket;
    public bowlingArea: BowlingArea;
    
    public gameMode: 'BATTING' | 'BOWLING' = 'BATTING';
    public useImageGround: boolean = true;
    private groundImage: HTMLImageElement;

    constructor(ctx:CanvasRenderingContext2D,bat:Bat,input:Input,ball: Ball){
        this.ctx = ctx;
        this.bat = bat;
        this.input = input;
        this.ball = ball;
        this.wicket = new Wicket(this.bat);
        this.bowlingArea = new BowlingArea();
        
        this.groundImage = new Image();
        this.groundImage.src = '/assets/cricket_ground_layers_cropped.png';
        
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'g') {
                this.useImageGround = !this.useImageGround;
                console.log("Image Ground toggled:", this.useImageGround);
            }
        });
    }
    public render(alpha: number = 1){
        this.ctx.clearRect(
            0,0,CANVAS_WIDTH,CANVAS_HEIGHT
        );

        this.drawSky();
        this.drawGround();
        this.wicket.draw(this.ctx);

        this.drawBat();
        // ⚾ BOWLING Mode me Bowling Arc Overlay bhi draw hoga:
        if (this.gameMode === 'BOWLING') {
            this.bowlingArea.draw(this.ctx);
        }

        this.ball.draw(this.ctx, alpha);
        this.drawDebug();
        this.drawMiniScreen(alpha);
    }
    private drawSky(){
        this.ctx.fillStyle = GAME_COLORS.SKY;
        this.ctx.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
    }
    // Simple hash function to generate static noise based on coordinates
    private getStaticNoise(x: number, y: number): number {
        let t = (x * 374761393 + y * 668265263) >>> 0;
        t = ((t ^ (t >>> 15)) * 2246822519) >>> 0;
        t = ((t ^ (t >>> 13)) * 3266489917) >>> 0;
        return ((t ^ (t >>> 16)) >>> 0) / 4294967296; // Returns 0.0 to 1.0
    }
        private drawGround(){
        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT; 
        
        // Fast 60-144 FPS Solid Ground Fill (Zero Image/Loop Overhead)
        this.ctx.fillStyle = GAME_COLORS.GROUND; // "#3CB043" (Solid Green)
        this.ctx.fillRect(0, groundY, CANVAS_WIDTH, GROUND_HEIGHT);
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

        // 4. TINY VERTICAL WICKET LINE (AT WORLD X = 150)
        const wicketWorldX = this.wicket ? this.wicket.FIXED_X : 150;
        const miniWicketX = boxX + (wicketWorldX - minWorldX) * scaleX;
        this.ctx.strokeStyle = "#38bdf8"; // Bright cyan wicket line
        this.ctx.lineWidth = 2.0;
        this.ctx.beginPath();
        this.ctx.moveTo(miniWicketX, miniGroundY);
        this.ctx.lineTo(miniWicketX, miniGroundY - 14); // 14px height
        this.ctx.stroke();

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

            const stepDt = 0.015;
            let firstPoint = true;
            for (let t = 0; t <= 3.0; t += stepDt) {
                const px = startX + vx * t;
                const py = startY + vy * t + 0.5 * g * t * t;

                if (py > groundY + 10 || px > maxWorldX + 500) break;

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

        this.ctx.restore();
    }

    }
