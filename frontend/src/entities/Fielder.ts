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
    public width: number = 50;
    public height: number = 95;
    public state: FielderState = "IDLE";
    public label: string;

    constructor(id: number, initialX: number, initialY: number, label: string) {
        this.id = id;
        this.pos = { x: initialX, y: initialY };
        this.initialPos = { x: initialX, y: initialY };
        this.label = label;
    }

    public moveLeft(dt: number, speed: number = 280): void {
        this.pos.x -= speed * dt;
        this.pos.x = Math.max(200, this.pos.x); // Clamp to left outfield boundary
    }

    public moveRight(dt: number, speed: number = 280): void {
        this.pos.x += speed * dt;
        const maxBoundary = WICKET_X + BOUNDARY_DISTANCE;
        this.pos.x = Math.min(maxBoundary, this.pos.x); // Clamp to right outfield boundary
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