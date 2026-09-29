import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    GROUND_HEIGHT,
    WICKET_X,
    BOWLER_WICKET_X
} from "./constants";

export class GroundRenderer {
    private offscreenCanvas: HTMLCanvasElement;
    private offscreenCtx: CanvasRenderingContext2D;

    public readonly minWorldX: number = -600;
    public readonly maxWorldX: number = 8000;
    public readonly totalWidth: number;
    public readonly groundHeight: number;

    constructor(groundHeight: number = GROUND_HEIGHT) {
        this.groundHeight = groundHeight;
        this.totalWidth = this.maxWorldX - this.minWorldX;

        this.offscreenCanvas = document.createElement("canvas");
        this.offscreenCanvas.width = this.totalWidth;
        this.offscreenCanvas.height = this.groundHeight + 25; 

        const ctx = this.offscreenCanvas.getContext("2d");
        if (!ctx) throw new Error("Failed to get 2D context");
        this.offscreenCtx = ctx;

        this.bakeProceduralGround();
    }

    private hash(x: number, y: number): number {
        let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0;
        h = Math.imul(h ^ (h >>> 13), 3266489917) | 0;
        return (h ^ (h >>> 16)) >>> 0;
    }

    private noise(x: number, y: number): number {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const xf = x - xi;
        const yf = y - yi;

        const u = xf * xf * (3.0 - 2.0 * xf);
        const v = yf * yf * (3.0 - 2.0 * yf);

        const a = this.hash(xi, yi) / 4294967296;
        const b = this.hash(xi + 1, yi) / 4294967296;
        const c = this.hash(xi, yi + 1) / 4294967296;
        const d = this.hash(xi + 1, yi + 1) / 4294967296;

        return a + u * (b - a) + v * (c - a) + u * v * (a - b - c + d);
    }

    private fbm(x: number, y: number, octaves: number = 4): number {
        let value = 0;
        let amplitude = 0.5;
        let frequency = 1;
        for (let i = 0; i < octaves; i++) {
            value += amplitude * this.noise(x * frequency, y * frequency);
            frequency *= 2;
            amplitude *= 0.5;
        }
        return value;
    }

    private bakeProceduralGround() {
        const ctx = this.offscreenCtx;
        const width = this.totalWidth;
        const totalH = this.groundHeight + 25; 
        
        const pitchStart = (WICKET_X - 140) - this.minWorldX;
        const pitchEnd = (BOWLER_WICKET_X + 160) - this.minWorldX;

        ctx.clearRect(0, 0, width, totalH);

        // =====================================================================
        // 1. STYLIZED CARTOON SOIL (Bold colors, smooth chunky blobs, no grit)
        // =====================================================================
        const imgData = ctx.createImageData(width, totalH);
        const data = imgData.data;
        const groundTop = 20; 

        for (let x = 0; x < width; x++) {
            const worldX = x + this.minWorldX;
            
            for (let y = 0; y < totalH; y++) {
                const idx = (y * width + x) * 4;

                if (y < groundTop) {
                    data[idx + 3] = 0; 
                    continue;
                }

                // Smooth, low-octave noise for large cartoonish blobs
                const n = this.fbm(worldX * 0.03, y * 0.03, 2); 
                
                let r, g, b;
                
                // Stylized 3-tone dirt (cell-shaded look)
                if (n > 0.6) {
                    r = 110; g = 75; b = 45; // Highlight dirt
                } else if (n < 0.4) {
                    r = 65; g = 40; b = 25;  // Shadow dirt
                } else {
                    r = 85; g = 55; b = 35;  // Base dirt
                }
                
                // Sharp 4px shadow band right under the grass for pop
                if (y - groundTop < 4) {
                    r = 45; g = 30; b = 15;
                }
                
                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = 255; 
            }
        }
        
        ctx.putImageData(imgData, 0, 0);

        // =====================================================================
        // 2. STYLIZED ROOTS (Thick, bold, smooth curves)
        // =====================================================================
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        for (let x = 0; x < width; x += 4.0) { // Widely spaced
            const worldX = x + this.minWorldX;
            
            if ((this.hash(worldX, 100) / 4294967296) > 0.5) continue;
            
            const rootDepth = 6 + (this.hash(worldX, 101) / 4294967296) * 10; 
            ctx.lineWidth = 1.8; // Thick, bold vector look
            
            ctx.strokeStyle = `rgba(180, 150, 80, 0.9)`; 
            
            ctx.beginPath();
            ctx.moveTo(x, groundTop);
            
            // Simple, single smooth curve downwards instead of jagged spikes
            const swing = (this.hash(worldX, 102) / 4294967296 - 0.5) * 15;
            ctx.quadraticCurveTo(x + swing, groundTop + rootDepth/2, x + swing*0.5, groundTop + rootDepth);
            ctx.stroke();
        }

        // =====================================================================
        // 3. STYLIZED GRASS (Solid opacity, bold colors, thicker blades)
        // =====================================================================
        for (let x = 0; x < width; x += 1.0) { // Less dense for a cleaner look
            const worldX = x + this.minWorldX;
            
            const fadeDist = 100; // Shorter fade for a slightly more stylized step
            let pitchWeight = 0;
            if (x >= pitchStart && x <= pitchEnd) pitchWeight = 1;
            else if (x >= pitchStart - fadeDist && x < pitchStart) {
                pitchWeight = (x - (pitchStart - fadeDist)) / fadeDist; // Linear
            } else if (x > pitchEnd && x <= pitchEnd + fadeDist) {
                pitchWeight = 1 - ((x - pitchEnd) / fadeDist); // Linear
            }
            
            const isPitchBlade = (this.hash(worldX, 1) / 4294967296) < pitchWeight;
            
            // Simple slight lean
            const angle = (this.hash(worldX, 2) / 4294967296 - 0.5) * (Math.PI / 5.0); 
            
            // Fixed stepped heights for cartoon look
            const pitchH = 3 + Math.floor((this.hash(worldX, 3) / 4294967296) * 2) * 2; // 3 or 5
            const outfH = 8 + Math.floor((this.hash(worldX, 3) / 4294967296) * 3) * 3; // 8, 11, or 14
            const height = pitchH * pitchWeight + outfH * (1 - pitchWeight);
            
            let r, g, bVal;
            if (isPitchBlade) {
                // Pitch: bold tan/green
                const type = this.hash(worldX, 4) / 4294967296;
                if (type < 0.5) {
                    r = 150; g = 170; bVal = 90; // Bright yellowish
                } else {
                    r = 120; g = 140; bVal = 70; // Muted green
                }
            } else {
                // Outfield: very bold flat greens
                const type = this.hash(worldX, 4) / 4294967296;
                if (type < 0.33) {
                    r = 40; g = 190; bVal = 50; // Neon green
                } else if (type < 0.66) {
                    r = 20; g = 150; bVal = 30; // Mid green
                } else {
                    r = 80; g = 210; bVal = 60; // Highlight green
                }
            }
            
            ctx.lineWidth = 1.8; // Thick cartoon strokes
            ctx.strokeStyle = `rgba(${r}, ${g}, ${bVal}, 1.0)`; // Solid color, no opacity blending
            
            ctx.beginPath();
            ctx.moveTo(x, groundTop + 2); // Start deeply inside the top shadow band
            // Draw straight spikes for a cleaner cartoon vector look
            ctx.lineTo(x + Math.sin(angle) * height, groundTop - height);
            ctx.stroke();
        }

        // =====================================================================
        // 4. STYLIZED CHALK CREASE
        // =====================================================================
        const creases = [
            WICKET_X, WICKET_X + 80, 
            BOWLER_WICKET_X - 80, BOWLER_WICKET_X
        ];

        creases.forEach(creaseWorldX => {
            const cx = creaseWorldX - this.minWorldX;
            const creaseWidth = 6;
            
            ctx.fillStyle = "rgba(255, 255, 255, 1.0)";
            ctx.fillRect(cx - creaseWidth/2, groundTop - 2, creaseWidth, 6);
            
            // Stylized, chunky chalk dust
            for (let i = 0; i < 40; i++) { // Much less dust
                const rx = (this.hash(creaseWorldX, i) / 4294967296 - 0.5) * 16;
                const ry = (this.hash(creaseWorldX, i+1) / 4294967296 - 0.5) * 6;
                
                ctx.fillStyle = `rgba(255, 255, 255, 0.8)`;
                ctx.fillRect(cx + rx, groundTop + 1 + ry, 2, 2); // Chunky 2x2 dust pixels
            }
        });
        
        const runupMarkers = [1000, 1300, 1600, 1900, 2200, 2500];
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        runupMarkers.forEach(wx => {
            const localX = wx - this.minWorldX;
            ctx.fillRect(localX - 1.5, groundTop - 2, 3, 10);
        });
    }

    public render(
        destCtx: CanvasRenderingContext2D,
        cameraX: number,
        canvasWidth: number = CANVAS_WIDTH,
        canvasHeight: number = CANVAS_HEIGHT
    ) {
        const groundY = canvasHeight - this.groundHeight - 25;

        const srcX = Math.max(0, cameraX - this.minWorldX);
        const srcW = Math.min(canvasWidth, this.totalWidth - srcX);

        if (srcW > 0) {
            destCtx.drawImage(
                this.offscreenCanvas,
                srcX, 0, srcW, this.groundHeight + 25,
                0, groundY, srcW, this.groundHeight + 25
            );
        }
    }
}
