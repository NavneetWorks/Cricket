import { WICKET_X, BOUNDARY_DISTANCE } from "../game/constants";

export interface Vec2 {
    x: number;
    y: number;
}
export type FielderState = "IDLE" | "CHASING" | "CATCHING" | "GROUND_STOP" | "THROWING";

export default class Fielder {
    public id: number;
    public pos: Vec2;
    public initialPos: Vec2;
    public width: number = 60;
    public height: number = 100;
    public state: FielderState = "IDLE";
    public label: string;
    public runSpeed: number = 300; // px/s fielding run speed
    public targetPos: Vec2 | null = null;

    constructor(id: number, initialX: number, initialY: number, label: string) {
        this.id = id;
        this.pos = { x: initialX, y: initialY };
        this.initialPos = { x: initialX, y: initialY };
        this.label = label;
    }

    public resetToInitialPosition(): void {
        this.pos.x = this.initialPos.x;
        this.pos.y = this.initialPos.y;
        this.state = "IDLE";
        this.targetPos = null;
    }

    public updateAI(dt: number, ballPos: Vec2, stumpsX: number): void {
        if (this.state === "CHASING") {
            this.targetPos = ballPos;
        }

        if ((this.state === "CHASING" || this.state === "CATCHING") && this.targetPos) {
            const dx = this.targetPos.x - this.pos.x;
            if (Math.abs(dx) > 5) {
                this.pos.x += Math.sign(dx) * this.runSpeed * dt;
            }
        }
    }

    // 🎯 Continuous Collision Detection (CCD): Line Segment vs Fielder AABB
    public intersectsLine(prevPos: Vec2, currPos: Vec2): boolean {
        const minX = this.pos.x - this.width / 2;
        const maxX = this.pos.x + this.width / 2;
        const minY = this.pos.y - this.height; // Top of Fielder Head/Reach
        const maxY = this.pos.y;               // Feet Ground Level

        // Liang-Barsky Line Segment Clipping Algorithm
        let t0 = 0;
        let t1 = 1;
        const dx = currPos.x - prevPos.x;
        const dy = currPos.y - prevPos.y;

        const p = [-dx, dx, -dy, dy];
        const q = [prevPos.x - minX, maxX - prevPos.x, prevPos.y - minY, maxY - prevPos.y];

        for (let i = 0; i < 4; i++) {
            if (p[i] === 0) {
                if (q[i] < 0) return false; // Parallel & outside bounding box
            } else {
                const r = q[i] / p[i];
                if (p[i] < 0) {
                    if (r > t1) return false;
                    if (r > t0) t0 = r;
                } else {
                    if (r < t0) return false;
                    if (r < t1) t1 = r;
                }
            }
        }
        return true; // Segment intersects fielder box in this frame
    }

    public moveLeft(dt: number, speed: number = 280): void {
        this.pos.x -= speed * dt;
        this.pos.x = Math.max(200, this.pos.x); // Clamp to left outfield boundary
        this.initialPos.x = this.pos.x; // Save this as the new original position
    }

    public moveRight(dt: number, speed: number = 280): void {
        this.pos.x += speed * dt;
        const maxBoundary = WICKET_X + BOUNDARY_DISTANCE;
        this.pos.x = Math.min(maxBoundary, this.pos.x); // Clamp to right outfield boundary
        this.initialPos.x = this.pos.x; // Save this as the new original position
    }

    public draw(ctx: CanvasRenderingContext2D, isSelected: boolean): void {
        ctx.save();
        
        // 1. Dotted Reach & Height Bounding Box
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.rect(this.pos.x - this.width / 2, this.pos.y - this.height, this.width, this.height);
        ctx.strokeStyle = isSelected ? "#38bdf8" : "rgba(255, 255, 255, 0.45)";
        ctx.lineWidth = isSelected ? 2.5 : 1.2;
        ctx.stroke();
        ctx.setLineDash([]);

        // 2. Dynamic Fielder Body & Jersey Rendering
        const bodyW = this.width * 0.55;
        const bodyH = this.height * 0.85;
        const headRadius = Math.min(9, this.height * 0.08);

        ctx.fillStyle = isSelected ? "#0284c7" : "#0369a1";
        ctx.fillRect(this.pos.x - bodyW / 2, this.pos.y - bodyH, bodyW, bodyH);

        // Fielder Head
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y - bodyH - headRadius / 2, headRadius, 0, Math.PI * 2);
        ctx.fillStyle = "#fde047";
        ctx.fill();

        // 3. Selection Badge Label ("F1 - HOLD F" / "F2 - HOLD J")
        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.fillStyle = isSelected ? "#f0f9ff" : "rgba(255, 255, 255, 0.85)";
        ctx.textAlign = "center";
        ctx.fillText(this.label, this.pos.x, this.pos.y - this.height - 10);

        ctx.restore();
    }
}