import { CANVAS_HEIGHT, GROUND_HEIGHT, GRAVITY, RESTITUTION_GROUND,PLAYER_LENGTH_FACTOR } from "../game/constants";
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
    public rotation = 0; // Ball ke spin ke liye

    constructor() {}

    // Ball ko kisi angle aur speed se fenkne ka function
    public throwBall(startX: number, startY: number, speed: number, angleDegrees: number): void {
        this.pos.x = startX;
        this.pos.y = startY;
        this.prevPos.x = startX;
        this.prevPos.y = startY;
        this.rotation = 0; // Reset spin
        this.isStuck = false;
        
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

    // Har frame mein ball ki physics (Gravity aur Bounce) calculate karna
    public update(dt: number): void {
        if (!this.isActive || this.isStuck) return;

        this.prevPos.x = this.pos.x;
        this.prevPos.y = this.pos.y;

        // 1. Gravity apply karna (Neeche ki taraf speed badhana)
        this.vel.y += GRAVITY * dt;

        // 2. Velocity ke hisaab se Position change karna
        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;

        // Calculate rotation based on velocity (spin effect)
        this.rotation += (this.vel.x * dt) / this.radius;

        // 3. Ground Collision (Zameen se takrana)
        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT;
        
        if (this.pos.y + this.radius >= groundY) {
            // Play hard pitch bounce sound ONLY on real downward impact (>120px/s)
            if (this.vel.y > 120) {
                SoundManager.getInstance().playPitchBounce(this.vel.y, this.pos.x);
            }

            // Ball ko zameen ke andar ghusne se rokna
            this.pos.y = groundY - this.radius;

            // Y velocity ko ulta (reverse) karna aur bounce (restitution) lagana
            this.vel.y = -this.vel.y * RESTITUTION_GROUND;

            // Zameen ki ragad (friction) ki wajah se aage jaane ki speed thodi kam karna
            this.vel.x *= this.friction;

            // Agar bounce bohot chota (almost khatam) ho gaya hai, toh ball ko vertical rok dena
            if (Math.abs(this.vel.y) < 20) {
                this.vel.y = 0;
            }
        }
    }
}

