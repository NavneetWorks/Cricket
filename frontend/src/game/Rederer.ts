import Bat from "../entities/Bat";
import Ball from "../entities/Ball";
import Input from "./Input";
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

    constructor(ctx:CanvasRenderingContext2D,bat:Bat,input:Input,ball: Ball){
        this.ctx = ctx;
        this.bat = bat;
        this.input = input;
        this.ball = ball;
    }
    public render(){
        this.ctx.clearRect(
            0,0,CANVAS_WIDTH,CANVAS_HEIGHT
        );

        this.drawSky();
        this.drawGround();
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
        const blockW = 10;
        const blockH = 6;
        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT; 
        
        for (let y = groundY; y < CANVAS_HEIGHT; y += blockH) {
            for (let x = 0; x < CANVAS_WIDTH; x += blockW) {
                const depthIndex = (y - groundY) / blockH;
                
                let baseR, baseG, baseB;
                let noiseMultiplier = 1;
                
                // Add jagged wave to the depth index so the layers aren't perfectly flat
                const jaggedNoise = this.getStaticNoise(x, 0);
                const effectiveDepth = depthIndex + Math.sin(x * 0.05) * 1.5 + jaggedNoise * 2;
                
                if (effectiveDepth < 3) {
                    // 1. Top Soil (Lighter, less brownish/black)
                    baseR = 80; baseG = 65; baseB = 50;
                } else if (effectiveDepth < 6) {
                    // 2. Loam Layer (Medium brown)
                    baseR = 110; baseG = 80; baseB = 55;
                } else if (effectiveDepth < 8) {
                    // 3. Compacted Clay (Light brownish)
                    baseR = 140; baseG = 100; baseB = 65;
                    noiseMultiplier = 0.5; // Compacted = less coarse noise
                } else {
                    // 4. Base layer (Tuned reddish to pure brown)
                    baseR = 145; baseG = 100; baseB = 60;
                    noiseMultiplier = 1.2; // Slightly coarse
                }
                
                // Add random noise to each block for texture (-15 to +15) * multiplier
                const noise = (this.getStaticNoise(x, y) - 0.5) * 30 * noiseMultiplier;
                
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
            
            // 1. Draw Roots (pointing down into the Top Soil)
            // Since density is higher, reduce root probability to 15% so it's not overcrowded
            if (staticNoise > 0.85) { 
                const rootLength = 3 + (this.getStaticNoise(x, 5) * 8); // 3 to 11 pixels deep
                const rootAngle = (this.getStaticNoise(x, 6) - 0.5) * (Math.PI / 4); // Wiggle left/right
                const rootEndX = x + Math.sin(rootAngle) * rootLength;
                const rootEndY = groundY + Math.cos(rootAngle) * rootLength;
                
                this.ctx.lineWidth = 1;
                this.ctx.strokeStyle = `rgba(180, 160, 140, 0.4)`; // Tan/white semi-transparent
                this.ctx.beginPath();
                this.ctx.moveTo(x, groundY);
                this.ctx.lineTo(rootEndX, rootEndY);
                this.ctx.stroke();
            }

            // 2. Draw Grass Spikes (Sloggy / Drooping bend)
            // Randomize height between 5.6 and 14 pixels (1.4x of original 4-10)
            const spikeHeight = 5.6 + (staticNoise * 8.4);
            
            // We want most grass to be bent, and only a few straight.
            // Using a square root curve pushes values away from 0 (straight) towards extremes (bent).
            const rawAngleNoise = this.getStaticNoise(x, 3) * 2 - 1; // -1 to 1
            const bendFactor = Math.sign(rawAngleNoise) * Math.pow(Math.abs(rawAngleNoise), 0.5); 
            
            const maxAngle = Math.PI / 2.2; // Up to ~80 degrees bend (very sloggy)
            const angle = bendFactor * maxAngle;
            
            // Calculate curve endpoints (y is reduced more if angle is high, causing a droop)
            const endX = x + Math.sin(angle) * spikeHeight;
            const endY = groundY - Math.cos(angle) * (spikeHeight * 0.7); 
            
            // Control point for the quadratic curve (pulls the blade outward before dropping)
            const cpX = x + Math.sin(angle * 1.5) * (spikeHeight * 0.6);
            const cpY = groundY - (spikeHeight * 0.5);
            
            // Natural grass green color variation
            const colorNoise = this.getStaticNoise(x, 4);
            const grassR = 85 + Math.floor(colorNoise * 40); // 85-125
            const grassG = 130 + Math.floor(colorNoise * 60); // 130-190
            const grassB = 30 + Math.floor(colorNoise * 40); // 30-70
            
            this.ctx.lineWidth = 1.2;
            this.ctx.strokeStyle = `rgb(${grassR}, ${grassG}, ${grassB})`;
            this.ctx.beginPath();
            this.ctx.moveTo(x, groundY);
            // quadraticCurveTo creates the smooth bending/sloggy effect
            this.ctx.quadraticCurveTo(cpX, cpY, endX, endY);
            this.ctx.stroke();
        }
    }
    private drawBat(){
        this.bat.draw(this.ctx);
    }
    private drawDebug(){
        this.ctx.font = "20px Arial";
        this.ctx.fillStyle = "white";;
        this.ctx.fillText(`Mouse X: ${this.input.mouseX}, Mouse Y: ${this.input.mouseY}`, 10, 30);
        
    }










    
}