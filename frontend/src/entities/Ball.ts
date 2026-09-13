import { CANVAS_HEIGHT, GROUND_HEIGHT, GRAVITY, RESTITUTION_GROUND, FRICTION_GROUND, AIR_DRAG_COEFF, PLAYER_LENGTH_FACTOR } from "../game/constants";
import { SoundManager } from "../audio/SoundManager";

type Vec2 = { x: number; y: number };

export default class Ball {
    public pos: Vec2 = { x: -100, y: -100 }; // Screen ke bahar start hogi
    public prevPos: Vec2 = { x: -100, y: -100 };
    public vel: Vec2 = { x: 0, y: 0 };
    
    public readonly radius = .27*PLAYER_LENGTH_FACTOR;
    private readonly friction = 0.98; // Zameen par ragad (Friction)

    public isActive = false; // Check karne ke liye ki ball hawa mein hai ya nahi
    public isStuck = false; // 1-frame dwell state jab bat se chipki ho
    public isHeldInHand = false; // Flag jab ball bowler ke haath me pakdi ho
    public rotation = 0; // Ball ke spin ke liye

    constructor() {}

    // Ball ko exact 2D velocity vector (vx, vy) se fenkne ka function
    public throwBallWithVelocity(startX: number, startY: number, vx: number, vy: number): void {
        this.pos.x = startX;
        this.pos.y = startY;
        this.prevPos.x = startX;
        this.prevPos.y = startY;
        this.rotation = 0; // Reset spin
        this.isStuck = false;
        this.isHeldInHand = false;
        this.vel.x = vx;
        this.vel.y = vy;
        this.isActive = true;
    }

    // Ball ko kisi angle aur speed se fenkne ka function
    public throwBall(startX: number, startY: number, speed: number, angleDegrees: number): void {
        this.pos.x = startX;
        this.pos.y = startY;
        this.prevPos.x = startX;
        this.prevPos.y = startY;
        this.rotation = 0; // Reset spin
        this.isStuck = false;
        this.isHeldInHand = false;
        
        // Math lagakar angle ko velocity (X aur Y) mein convert karna
        const angleRad = (angleDegrees * Math.PI) / 180;
        this.vel.x = speed * Math.cos(angleRad);
        this.vel.y = speed * Math.sin(angleRad);
        
        this.isActive = true;
    }

    // Fixed-timestep render interpolation:
    // Physics ab 60Hz fixed steps par chalti hai, lekin display 60/144/240Hz kuch bhi ho sakta hai.
    // Beech ke display frames me pichli physics position (prevPos) aur current (pos) ke beech
    // blend karke smooth motion dikhte hain — warna 144Hz par ball 2-3 frame chipak kar kudegi (stutter).
    public getRenderPos(alpha: number): Vec2 {
        return {
            x: this.prevPos.x + (this.pos.x - this.prevPos.x) * alpha,
            y: this.prevPos.y + (this.pos.y - this.prevPos.y) * alpha
        };
    }

    // Ball ko Canvas par draw karna (Ek Red color ki cricket ball)
    public draw(ctx: CanvasRenderingContext2D, alpha: number = 1): void {
        if (!this.isActive) return; // Agar active nahi hai toh draw mat karo

        const rp = this.getRenderPos(alpha); // Interpolated position (alpha=1 → exact physics pos)
        ctx.save();
        ctx.translate(rp.x, rp.y);

        const gradient = ctx.createRadialGradient(
            -this.radius * 0.4, -this.radius * 0.4, this.radius * 0.1,
            0, 0, this.radius
        );
        
        gradient.addColorStop(0, "#ff8888");
        gradient.addColorStop(0.3, "#e63946");
        gradient.addColorStop(0.7, "#d32f2f");
        gradient.addColorStop(1, "#990000");

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.strokeStyle = "#880000"; 
        ctx.lineWidth = 0.5;
        ctx.stroke();

        ctx.clip();
        ctx.rotate(this.rotation); 
        
        ctx.beginPath();
        ctx.moveTo(0, -this.radius);
        ctx.lineTo(0, this.radius);
        ctx.strokeStyle = "#600000";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-1.2, -this.radius);
        ctx.lineTo(-1.2, this.radius);
        ctx.moveTo(1.2, -this.radius);
        ctx.lineTo(1.2, this.radius);
        
        ctx.setLineDash([1.5, 1.5]);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.restore();
    }

    // Har frame mein ball ki physics with 10x Sub-stepping CCD (Continuous Collision Detection)
    public update(dt: number): void {
        if (!this.isActive || this.isStuck || this.isHeldInHand) return;

        this.prevPos.x = this.pos.x;
        this.prevPos.y = this.pos.y;

        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT;
        const targetY = groundY - this.radius;

        // 🟢 10x Sub-stepping Physics Engine (600 Hz Sampling)
        const SUB_STEPS = 10;
        const subDt = dt / SUB_STEPS;

        for (let step = 0; step < SUB_STEPS; step++) {
            const stepPrevX = this.pos.x;
            const stepPrevY = this.pos.y;

            // 🟢 Aerodynamic Quadratic Air Drag (-k_air * speed * velocity)
            const speed = Math.hypot(this.vel.x, this.vel.y);
            const dragForceX = -AIR_DRAG_COEFF * speed * this.vel.x;
            const dragForceY = -AIR_DRAG_COEFF * speed * this.vel.y;

            // Apply gravity and air drag for sub-step
            this.vel.x += dragForceX * subDt;
            this.vel.y += (GRAVITY + dragForceY) * subDt;

            // Integrate position for sub-step
            const nextX = this.pos.x + this.vel.x * subDt;
            const nextY = this.pos.y + this.vel.y * subDt;

            // Continuous Collision Check against Ground Surface (targetY = groundY - radius)
            if (stepPrevY < targetY && nextY >= targetY) {
                // Exact Fractional Sub-step Intersection Point
                const f = Math.min(1.0, Math.max(0.0, (targetY - stepPrevY) / Math.max(0.001, nextY - stepPrevY)));

                // Snap to exact surface touch point
                const bounceX = stepPrevX + f * (nextX - stepPrevX);
                const bounceY = targetY;

                this.pos.x = bounceX;
                this.pos.y = bounceY;

                // Pitch Sound Effect
                if (Math.abs(this.vel.y) > 100) {
                    SoundManager.getInstance().playPitchBounce(this.vel.y, bounceX);
                }

                // Realistic Pitch Restitution & Ground Friction
                this.vel.y = -Math.abs(this.vel.y) * RESTITUTION_GROUND;
                this.vel.x *= FRICTION_GROUND;

                if (Math.abs(this.vel.y) < 20) {
                    this.vel.y = 0;
                }

                // Continue remaining sub-step time for post-bounce flight
                const remainingSubDt = subDt * (1.0 - f);
                this.pos.x += this.vel.x * remainingSubDt;
                this.pos.y += this.vel.y * remainingSubDt;
            } else {
                this.pos.x = nextX;
                this.pos.y = nextY;
                if (this.pos.y >= targetY) {
                    this.pos.y = targetY;
                    if (this.vel.y > 0) this.vel.y = -this.vel.y * RESTITUTION_GROUND;
                }
            }

            this.rotation += (this.vel.x * subDt) / this.radius;
        }
    }
}

