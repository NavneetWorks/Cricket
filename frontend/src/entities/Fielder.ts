import { WICKET_X, BOUNDARY_DISTANCE } from "../game/constants";

export interface Vec2 {
    x: number;
    y: number;
}
export type FielderState = "IDLE" | "CHASING" | "CATCHING" | "GROUND_STOP" | "THROWING";

export default class Fielder {
    public id: number;
    public pos: Vec2;
    public z: number = 0; // Z-axis depth (0 = baseline, +z = background behind screen)
    public initialPos: Vec2;
    public initialZ: number = 0;
    public width: number = 60;
    public height: number = 200;
    public state: FielderState = "IDLE";
    public label: string;
    public runSpeed: number = 1600; // px/s fielding run speed
    public targetPos: Vec2 | null = null;
    public targetZ: number = 0;

    // Focal distance for 3D perspective depth calculation
    public static readonly FOCAL_LENGTH: number = 400;

    constructor(id: number, initialX: number, initialY: number, initialZ: number = 0, label: string = "") {
        this.id = id;
        this.pos = { x: initialX, y: initialY };
        // Enforce Z >= 0 constraint (strictly at baseline or behind screen)
        this.z = Math.max(0, initialZ);
        this.initialPos = { x: initialX, y: initialY };
        this.initialZ = this.z;
        this.targetZ = this.z;
        this.label = label;
    }

    public get scale(): number {
        // Perspective scaling: S = FOCAL_LENGTH / (FOCAL_LENGTH + z)
        return Fielder.FOCAL_LENGTH / (Fielder.FOCAL_LENGTH + Math.max(0, this.z));
    }

    public get renderWidth(): number {
        return this.width * this.scale;
    }

    public get renderHeight(): number {
        return this.height * this.scale;
    }

    public get renderY(): number {
        // Feet ALWAYS stay 100% anchored on the ground line (pos.y)
        return this.pos.y;
    }

    public resetToInitialPosition(): void {
        this.pos.x = this.initialPos.x;
        this.pos.y = this.initialPos.y;
        this.z = this.initialZ;
        this.targetZ = this.initialZ;
        this.state = "IDLE";
        this.targetPos = null;
    }

    /**
     * Per-Frame 1D X-Axis Closing-Speed Intersection Algorithm:
     * Calculates the exact horizontal meeting point (X_intersect) each frame based on
     * relative closing speed between ball velocity and fielder run speed.
     */
    public updateAI(
        dt: number,
        ballPos: Vec2,
        ballVel: Vec2 = { x: 0, y: 0 },
        ballZ: number = 0,
        ballVelZ: number = 0,
        friction: number = 0.99,
        stumpsX: number = WICKET_X
    ): void {
        if (this.state === "CHASING") {
            const ballX = ballPos.x;
            const fielderX = this.pos.x;
            const dist = Math.abs(fielderX - ballX);
            let targetX = ballX;

            if (dist > 5 && Math.abs(ballVel.x) > 10) {
                // Determine closing speed based on relative movement direction
                const isMovingTowardFielder = (ballX < fielderX && ballVel.x > 0) || (ballX > fielderX && ballVel.x < 0);
                const closingSpeed = isMovingTowardFielder 
                    ? (this.runSpeed + Math.abs(ballVel.x)) 
                    : (this.runSpeed - Math.abs(ballVel.x));

                if (closingSpeed > 20) {
                    const timeToMeet = dist / closingSpeed;
                    targetX = ballX + (ballVel.x * timeToMeet);
                }
            }

            this.targetPos = { x: targetX, y: ballPos.y };
            this.targetZ = Math.max(0, ballZ);
        }

        if ((this.state === "CHASING" || this.state === "CATCHING") && this.targetPos) {
            const dx = this.targetPos.x - this.pos.x;
            const dz = this.targetZ - this.z;
            const dist3D = Math.hypot(dx, dz);

            if (dist3D > 5) {
                const dirX = dx / dist3D;
                const dirZ = dz / dist3D;

                this.pos.x += dirX * this.runSpeed * dt;
                this.z += dirZ * this.runSpeed * dt;
                this.z = Math.max(0, this.z);
            }
        }
    }

    // 🎯 Continuous Collision Detection (CCD): Line Segment vs Fielder Scaled AABB
    public intersectsLine(prevPos: Vec2, currPos: Vec2, ballZ: number = 0): boolean {
        // Z-depth tolerance check (Must be within 50px depth layer)
        if (Math.abs(ballZ - this.z) > 50) return false;

        const drawW = this.renderWidth;
        const drawH = this.renderHeight;
        const groundY = this.pos.y; // 100% Fixed ground level

        const minX = this.pos.x - drawW / 2;
        const maxX = this.pos.x + drawW / 2;
        const minY = groundY - drawH; // Top of Fielder Head/Reach
        const maxY = groundY;         // Feet Ground Level

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
        this.pos.x -= speed * this.scale * dt;
        this.pos.x = Math.max(200, this.pos.x); // Clamp to left outfield boundary
        this.initialPos.x = this.pos.x;
    }

    public moveRight(dt: number, speed: number = 280): void {
        this.pos.x += speed * this.scale * dt;
        const maxBoundary = WICKET_X + BOUNDARY_DISTANCE;
        this.pos.x = Math.min(maxBoundary, this.pos.x); // Clamp to right outfield boundary
        this.initialPos.x = this.pos.x;
    }

    public draw(ctx: CanvasRenderingContext2D, isSelected: boolean): void {
        ctx.save();
        
        const s = this.scale;
        const drawW = this.renderWidth;
        const drawH = this.renderHeight;
        const groundY = this.pos.y; // Fixed ground Y level

        // 0. Dynamic Depth Shadow on Ground
        ctx.beginPath();
        ctx.ellipse(this.pos.x, groundY + 2, drawW * 0.45, drawW * 0.18, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.fill();

        // 1. Dotted Reach & Height Bounding Box
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.rect(this.pos.x - drawW / 2, groundY - drawH, drawW, drawH);
        ctx.strokeStyle = isSelected ? "#38bdf8" : "rgba(255, 255, 255, 0.45)";
        ctx.lineWidth = isSelected ? 2.5 * s : 1.2 * s;
        ctx.stroke();
        ctx.setLineDash([]);

        // 2. Dynamic Fielder Body & Jersey Rendering (Scaled by Z-depth from groundY up)
        const bodyW = drawW * 0.55;
        const bodyH = drawH * 0.85;
        const headRadius = Math.max(4, Math.min(9 * s, drawH * 0.08));

        ctx.fillStyle = isSelected ? "#0284c7" : "#0369a1";
        ctx.fillRect(this.pos.x - bodyW / 2, groundY - bodyH, bodyW, bodyH);

        // Fielder Head
        ctx.beginPath();
        ctx.arc(this.pos.x, groundY - bodyH - headRadius / 2, headRadius, 0, Math.PI * 2);
        ctx.fillStyle = "#fde047";
        ctx.fill();

        // 3. Selection Badge Label ("F1 - HOLD F" / "F2 - HOLD J")
        ctx.font = `bold ${Math.max(8, Math.round(11 * s))}px system-ui, sans-serif`;
        ctx.fillStyle = isSelected ? "#f0f9ff" : "rgba(255, 255, 255, 0.85)";
        ctx.textAlign = "center";
        ctx.fillText(this.label, this.pos.x, groundY - drawH - (10 * s));

        ctx.restore();
    }
}