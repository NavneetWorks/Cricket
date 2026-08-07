import { CANVAS_HEIGHT, GROUND_HEIGHT } from "../game/constants";

type Vec2 = { x: number; y: number };

export default class Ball {
    public pos: Vec2 = { x: -100, y: -100 }; // Screen ke bahar start hogi
    public vel: Vec2 = { x: 0, y: 0 };
    
    public readonly radius = 8;
    private readonly gravity = 800; // Gravity ki taqat
    private readonly restitution = 0.6; // Bounce kitna hoga (0.6 yani 60% speed bachegi tip ke baad)
    private readonly friction = 0.98; // Zameen par ragad (Friction)

    public isActive = false; // Check karne ke liye ki ball hawa mein hai ya nahi

    constructor() {}

        // Ball ko kisi angle aur speed se fenkne ka function
    public throwBall(startX: number, startY: number, speed: number, angleDegrees: number): void {
        this.pos.x = startX;
        this.pos.y = startY;
        
        // Math lagakar angle ko velocity (X aur Y) mein convert karna
        const angleRad = (angleDegrees * Math.PI) / 180;
        this.vel.x = speed * Math.cos(angleRad);
        this.vel.y = speed * Math.sin(angleRad);
        
        this.isActive = true;
    }

    // Ball ko Canvas par draw karna (Ek Red color ki cricket ball)
    public draw(ctx: CanvasRenderingContext2D): void {
        if (!this.isActive) return; // Agar active nahi hai toh draw mat karo

        ctx.save();
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = "#d32f2f"; // Dark Red color
        ctx.fill();
        ctx.strokeStyle = "#8b0000"; // Outline color
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    }
        // Har frame mein ball ki physics (Gravity aur Bounce) calculate karna
    public update(dt: number): void {
        if (!this.isActive) return;

        // 1. Gravity apply karna (Neeche ki taraf speed badhana)
        this.vel.y += this.gravity * dt;

        // 2. Velocity ke hisaab se Position change karna
        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;

        // 3. Ground Collision (Zameen se takrana)
        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT;
        
        if (this.pos.y + this.radius >= groundY) {
            // Ball ko zameen ke andar ghusne se rokna
            this.pos.y = groundY - this.radius;

            // Y velocity ko ulta (reverse) karna aur bounce (restitution) lagana
            this.vel.y = -this.vel.y * this.restitution;

            // Zameen ki ragad (friction) ki wajah se aage jaane ki speed thodi kam karna
            this.vel.x *= this.friction;

            // Agar bounce bohot chota (almost khatam) ho gaya hai, toh ball ko vertical rok dena
            if (Math.abs(this.vel.y) < 20) {
                this.vel.y = 0;
            }
        }
    }
}

