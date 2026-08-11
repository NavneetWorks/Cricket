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





    
}