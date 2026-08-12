import Bat from "../entities/Bat";
import Ball from "../entities/Ball";
import Wicket from "../entities/Wicket";
import Input from "./Input";
import { SoundManager } from "../audio/SoundManager";
import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    GAME_COLORS,
    GROUND_HEIGHT
} from "./constants";

export default class Renderer{
    private ctx:CanvasRenderingContext2D;
    private input: Input;
    private bat:Bat;
    private ball: Ball;
    public wicket: Wicket;
    
    public useImageGround: boolean = false;
    private groundImage: HTMLImageElement;

    constructor(ctx:CanvasRenderingContext2D,bat:Bat,input:Input,ball: Ball){
        this.ctx = ctx;
        this.bat = bat;
        this.input = input;
        this.ball = ball;
        this.wicket = new Wicket(this.bat);
        
        this.groundImage = new Image();
        this.groundImage.src = '/assets/cricket_ground_layers_cropped.png';
        
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'g') {
                this.useImageGround = !this.useImageGround;
                console.log("Image Ground toggled:", this.useImageGround);
            }
        });
    }
    public render(){
        this.ctx.clearRect(
            0,0,CANVAS_WIDTH,CANVAS_HEIGHT
        );

        this.drawSky();
        this.drawGround();
        this.wicket.draw(this.ctx);
        this.drawBat();
        this.ball.draw(this.ctx);
        this.drawDebug();
        this.drawMiniScreen();
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
        
        // Draw Image Ground if enabled
        if (this.useImageGround && this.groundImage.complete && this.groundImage.naturalWidth !== 0) {
            const imgWidth = this.groundImage.naturalWidth;
            const imgHeight = this.groundImage.naturalHeight;
            // Scale vertically to fit the ground height, keep aspect ratio horizontally
            const scaleY = GROUND_HEIGHT / imgHeight;
            const scaleX = scaleY; 
            const scaledWidth = imgWidth * scaleX;
            const scaledHeight = GROUND_HEIGHT;
            
            // Repeat the image side-by-side until the canvas is covered
            for(let x = 0; x < CANVAS_WIDTH; x += scaledWidth) {
                this.ctx.drawImage(this.groundImage, x, groundY, scaledWidth, scaledHeight);
            }
            return; // Skip the pixel rendering
        }

        const blockW = 4;
        const blockH = 4;
        
        for (let y = groundY; y < CANVAS_HEIGHT; y += blockH) {
            for (let x = 0; x < CANVAS_WIDTH; x += blockW) {
                const depthIndex = (y - groundY) / blockH;
                
                let baseR, baseG, baseB;
                let noiseMultiplier = 1;
                
                // Small jagged noise to keep layers mostly flat but slightly organic
                const jaggedNoise = this.getStaticNoise(x, 0);
                const effectiveDepth = depthIndex + (jaggedNoise - 0.5) * 1.5;
                
                if (effectiveDepth < 5.5) {
                    // 1. Top Soil (Darkest blackish-brown) - decreased depth
                    baseR = 30; baseG = 20; baseB = 15;
                    noiseMultiplier = 1.0; 
                } else if (effectiveDepth < 9.5) {
                    // 2. Loam Layer (Dark chocolate brown) - increased depth
                    baseR = 50; baseG = 30; baseB = 20;
                    noiseMultiplier = 0.9;
                } else if (effectiveDepth < 13.0) {
                    // 3. Compacted Clay (Reddish rich brown) - increased depth
                    baseR = 90; baseG = 45; baseB = 25;
                    noiseMultiplier = 0.8; 
                } else if (effectiveDepth < 15.5) {
                    // 4. Base layer (Orange/Tan brown with pebbles)
                    baseR = 130; baseG = 75; baseB = 40;
                    noiseMultiplier = 1.0; 
                } else {
                    // 5. Light Sandy Pebbles
                    baseR = 160; baseG = 100; baseB = 50;
                    noiseMultiplier = 1.2; 
                }
                
                // Texture: noise amplitude reduced so it's not overly noisy, creating a finer texture
                const noise = (this.getStaticNoise(x, y) - 0.5) * 35 * noiseMultiplier;
                
                const finalR = Math.min(255, Math.max(0, Math.floor(baseR + noise)));
                const finalG = Math.min(255, Math.max(0, Math.floor(baseG + noise)));
                const finalB = Math.min(255, Math.max(0, Math.floor(baseB + noise)));
                
                this.ctx.fillStyle = `rgb(${finalR}, ${finalG}, ${finalB})`;
                this.ctx.fillRect(x, y, blockW, blockH);
            }
        }

        // Draw top layer grass spikes and roots
        // Step every 1 pixel for maximum dense coverage
        for (let x = 0; x < CANVAS_WIDTH; x += 1) {
            const staticNoise = this.getStaticNoise(x, 2);
            
            // 1. Draw Roots (Solid golden web)
            // Almost every pixel has a root (very dense)
            if (staticNoise > 0.1) { 
                const rootDepth = 3 + (this.getStaticNoise(x, 5) * 5); // 3 to 8 pixels deep
                
                this.ctx.lineWidth = 1.5;
                this.ctx.strokeStyle = `rgba(170, 130, 60, 0.8)`; // Golden brown
                this.ctx.beginPath();
                this.ctx.moveTo(x, groundY);
                
                // Curve heavily left or right
                const dir = (this.getStaticNoise(x, 7) > 0.5) ? 1 : -1;
                const spread = 3 + this.getStaticNoise(x, 8) * 8; // Spread wide horizontally
                
                const cpX = x + dir * spread * 0.5;
                const cpY = groundY + rootDepth * 0.8;
                
                const endX = x + dir * spread;
                const endY = groundY + rootDepth * (0.3 + this.getStaticNoise(x, 9) * 0.7);
                
                this.ctx.quadraticCurveTo(cpX, cpY, endX, endY);
                this.ctx.stroke();
            }

            // 2. Draw Grass Spikes 
            const spikeHeight = 6 + (staticNoise * 8); // 6 to 14
            
            const rawAngleNoise = this.getStaticNoise(x, 3) * 2 - 1; 
            const bendFactor = Math.sign(rawAngleNoise) * Math.pow(Math.abs(rawAngleNoise), 0.5); 
            
            const maxAngle = Math.PI / 2.5; 
            const angle = bendFactor * maxAngle;
            
            const endX = x + Math.sin(angle) * spikeHeight;
            const endY = groundY - Math.cos(angle) * (spikeHeight * 0.7); 
            
            const cpX = x + Math.sin(angle * 1.5) * (spikeHeight * 0.6);
            const cpY = groundY - (spikeHeight * 0.5);
            
            // Vibrant Green grass (from image)
            const colorNoise = this.getStaticNoise(x, 4);
            const grassR = 60 + Math.floor(colorNoise * 40); // 60-100
            const grassG = 140 + Math.floor(colorNoise * 50); // 140-190
            const grassB = 20 + Math.floor(colorNoise * 20); // 20-40
            
            this.ctx.lineWidth = 1.2;
            this.ctx.strokeStyle = `rgb(${grassR}, ${grassG}, ${grassB})`;
            this.ctx.beginPath();
            this.ctx.moveTo(x, groundY);
            // quadraticCurveTo creates the smooth bending/sloggy effect
            this.ctx.quadraticCurveTo(cpX, cpY, endX, endY);
            this.ctx.stroke();
        }

        /* CREASE LINES - DISABLED FOR NOW
        // Add 2 thin horizontal white crease lines
        this.ctx.strokeStyle = "#ffffff";
        this.ctx.lineWidth = 1.5;
        
        // 1. Pop Crease Line (at X = 320)
        this.ctx.beginPath();
        this.ctx.moveTo(320, groundY);
        this.ctx.lineTo(320, CANVAS_HEIGHT);
        this.ctx.stroke();
        
        // 2. Bowling Crease Line (at X = 380)
        this.ctx.beginPath();
        this.ctx.moveTo(380, groundY);
        this.ctx.lineTo(380, CANVAS_HEIGHT);
        this.ctx.stroke();
        */
    }
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
    private drawMiniScreen(): void {
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
            const g = 3566; // GRAVITY

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
            const ballWorldX = this.ball.pos.x;
            const ballWorldY = this.ball.pos.y;

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