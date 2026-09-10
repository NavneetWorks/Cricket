import { CANVAS_HEIGHT, GROUND_HEIGHT,PLAYER_LENGTH_FACTOR } from "../game/constants";
import Bat from "./Bat";

export default class Wicket {
    private bat: Bat;

    // ICC Wicket Specification Constants (True 2D Side-View Single Stump)
    public readonly WICKET_HEIGHT = 3.7*PLAYER_LENGTH_FACTOR; // 125px total height
    public readonly STUMP_DIAMETER = 0.2*PLAYER_LENGTH_FACTOR; // 6.5px diameter for stump post
    public readonly BAIL_BARREL_DIAMETER = 0.05*PLAYER_LENGTH_FACTOR; // 5.0px diameter for bail barrel
    public readonly BAIL_SPIGOT_DIAMETER = 0.025*PLAYER_LENGTH_FACTOR; // 2.5px diameter for inner spigot seating
    public readonly FIXED_X = 50; // Fixed X = 150 position

    // Wicket Hit / OUT State
    public isOut: boolean = false;
    public hitTime: number = 0;

    // Dynamic Physics & Animation Properties
    public stumpAngle: number = 0; // Current tilt angle in radians (0 = vertical)
    public targetStumpAngle: number = 0; // Target tilt angle (e.g. 1.48 rad for full uproot)
    public stumpAngularVel: number = 0; // Rotation speed (rad/s)

    public isBailDislodged: boolean = false;
    public bailPos: { x: number; y: number } = { x: 50, y: 0 };
    public bailVel: { x: number; y: number } = { x: 0, y: 0 };
    public bailAngle: number = 0;
    public bailAngularVel: number = 0;

    constructor(bat: Bat) {
        this.bat = bat;
        this.reset();
    }

    public getCenterX(): number {
        return this.FIXED_X;
    }

    /**
     * Reset wicket and bail positions & animation states for a new ball
     */
    public reset(): void {
        this.isOut = false;
        this.hitTime = 0;

        this.stumpAngle = 0;
        this.targetStumpAngle = 0;
        this.stumpAngularVel = 0;

        this.isBailDislodged = false;
        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT;
        const stumpTopY = groundY - this.WICKET_HEIGHT;
        const bailRadius = this.BAIL_BARREL_DIAMETER / 2;
        this.bailPos = { x: this.FIXED_X, y: stumpTopY - bailRadius + 1.0 };
        this.bailVel = { x: 0, y: 0 };
        this.bailAngle = 0;
        this.bailAngularVel = 0;
    }

    /**
     * Update dynamic animation step for stump rotation & flying bail physics
     */
    public update(dt: number): void {
        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT;

        // 1. Stump Rotation Animation
        if (this.stumpAngle < this.targetStumpAngle) {
            this.stumpAngle += this.stumpAngularVel * dt;
            if (this.stumpAngle >= this.targetStumpAngle) {
                this.stumpAngle = this.targetStumpAngle;
                this.stumpAngularVel = 0;
            }
        }

        // 2. Bail Projectile Flight Physics
        if (this.isBailDislodged) {
            this.bailPos.x += this.bailVel.x * dt;
            this.bailPos.y += this.bailVel.y * dt;

            // Gravity pulls bail down to ground
            const gravity = 980; // px/s^2
            this.bailVel.y += gravity * dt;
            this.bailAngle += this.bailAngularVel * dt;

            // Ground plane collision check for falling bail
            const bailRadius = this.BAIL_BARREL_DIAMETER / 2;
            if (this.bailPos.y >= groundY - bailRadius) {
                this.bailPos.y = groundY - bailRadius;
                this.bailVel.x *= 0.6; // Friction on ground
                this.bailVel.y = -this.bailVel.y * 0.3; // Small bounce
                if (Math.abs(this.bailVel.y) < 15) {
                    this.bailVel.y = 0;
                    this.bailVel.x = 0;
                    this.bailAngularVel = 0;
                }
            }
        }
    }

    /**
     * Check hit & trigger uproot/bend and bail dislodgement
     */
    public checkHit(ball: any, batHitOccurred: boolean = false, batHitSubStep: number = 30): boolean {
        if (!ball || !ball.isActive) return false;

        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT;
        const stumpTopY = groundY - this.WICKET_HEIGHT;
        const stumpX = this.FIXED_X;
        const radius = (ball.radius || 6) + (this.STUMP_DIAMETER / 2);

        // Ball trajectory segment from prevPos to pos
        const x1 = ball.prevPos ? ball.prevPos.x : ball.pos.x;
        const y1 = ball.prevPos ? ball.prevPos.y : ball.pos.y;
        const x2 = ball.pos.x;
        const y2 = ball.pos.y;

        // X-axis collision band check
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);

        if (maxX < stumpX - radius || minX > stumpX + radius) {
            return false;
        }

        // Calculate parametric intersection time tWicket along ball path [0, 1]
        const dx = x2 - x1;
        let tWicket = 1.0;

        if (Math.abs(dx) > 0.0001) {
            tWicket = (stumpX - x1) / dx;
        } else {
            tWicket = 0.5;
        }

        if (tWicket < 0 || tWicket > 1) {
            return false;
        }

        // Y position of ball at moment of intersection at stumpX
        const yAtStump = y1 + tWicket * (y2 - y1);

        // Vertical collision range
        if (yAtStump >= (stumpTopY - 6.0 - (ball.radius || 6)) && yAtStump <= groundY + 5) {
            // Priority Resolution Rule: Compare tBat vs tWicket
            if (batHitOccurred) {
                const tBat = batHitSubStep / 30.0;
                if (tBat < tWicket) {
                    // Bat hit happened FIRST! Deflected by bat. Not Out.
                    return false;
                }
            }

            // WICKET HIT! Trigger OUT & Dynamic Physics!
            this.isOut = true;
            this.hitTime = Date.now();

            const vImpact = Math.hypot(ball.vel.x, ball.vel.y);

            // 1. NO REVERSE BOUNCE! Keep ball moving forward with reduced speed & slight deflection
            ball.vel.x *= 0.82; // 18% speed reduction passing through wickets
            ball.vel.y += (Math.random() - 0.5) * 50;

            // 2. STUMP UPROOT / BEND ANIMATION BASED ON IMPACT SPEED
            if (vImpact > 1800) {
                // High Speed Impact -> Full Uproot (falls flat ~85 deg)
                this.targetStumpAngle = 1.48; // ~85 degrees
                this.stumpAngularVel = 6.0;   // Fast spin
            } else if (vImpact > 800) {
                // Medium Speed Impact -> Moderate Bend (~40 deg)
                this.targetStumpAngle = 0.70; // ~40 degrees
                this.stumpAngularVel = 3.5;
            } else {
                // Low Speed Impact -> Gentle Nudge (~15 deg)
                this.targetStumpAngle = 0.26; // ~15 degrees
                this.stumpAngularVel = 2.0;
            }

            // 3. ALWAYS DISLODGE BAIL & FLY IN AIR
            this.isBailDislodged = true;
            const bailRadius = this.BAIL_BARREL_DIAMETER / 2;
            this.bailPos = { x: stumpX, y: stumpTopY - bailRadius };
            this.bailVel = {
                x: - (120 + vImpact * 0.08), // Flies backwards (left)
                y: - (180 + vImpact * 0.05)  // Pops up into air
            };
            this.bailAngularVel = 12.0; // Tumbling rotation

            console.log(`[WICKET HIT - BOWLED OUT!] Impact Speed: ${Math.floor(vImpact)} | Target Angle: ${this.targetStumpAngle.toFixed(2)}`);
            return true;
        }

        return false;
    }

    /**
     * Draw Wicket (Rotating Stump + Flying Bail)
     */
    public draw(ctx: CanvasRenderingContext2D): void {
        const sx = this.FIXED_X;
        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT;
        const stumpTopY = groundY - this.WICKET_HEIGHT;
        const w = this.STUMP_DIAMETER;

        ctx.save();

        // --- 1. BASE SHADOW ON GROUND ---
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.beginPath();
        ctx.ellipse(sx, groundY + 1, 6, 2.5, 0, 0, 2 * Math.PI);
        ctx.fill();

        // --- 2. ROTATING ICC DEEP BLUE STUMP (PIVOT AT GROUND BASE) ---
        ctx.save();
        ctx.translate(sx, groundY);
        ctx.rotate(-this.stumpAngle); // Rotate backwards (leftwards)

        // Stump Gradient
        const stumpGrad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        stumpGrad.addColorStop(0.0, "#030a1c");
        stumpGrad.addColorStop(0.3, "#0b2553");
        stumpGrad.addColorStop(0.55, "#1d4ed8"); // Metallic blue shine ridge
        stumpGrad.addColorStop(0.8, "#0f2e6b");
        stumpGrad.addColorStop(1.0, "#020713");

        ctx.fillStyle = stumpGrad;
        ctx.fillRect(-w / 2, -this.WICKET_HEIGHT, w, this.WICKET_HEIGHT);

        // Metallic outline
        ctx.strokeStyle = "rgba(147, 197, 253, 0.5)";
        ctx.lineWidth = 0.6;
        ctx.strokeRect(-w / 2, -this.WICKET_HEIGHT, w, this.WICKET_HEIGHT);

        // Top U-shaped notch
        ctx.fillStyle = "#030a1c";
        ctx.fillRect(-w / 2 + 1.0, -this.WICKET_HEIGHT, w - 2.0, 2.0);

        // Draw seated bail ONLY if not yet dislodged
        if (!this.isBailDislodged) {
            const bailRadius = this.BAIL_BARREL_DIAMETER / 2;
            const bailCenterY = -this.WICKET_HEIGHT - bailRadius + 1.0;

            // Spigot peg
            ctx.fillStyle = "#1d4ed8";
            ctx.fillRect(-1.25, -this.WICKET_HEIGHT - 0.5, 2.5, 1.5);

            // Metallic Circle
            const circleGrad = ctx.createRadialGradient(-0.8, bailCenterY - 0.8, 0.5, 0, bailCenterY, bailRadius);
            circleGrad.addColorStop(0.0, "#93c5fd");
            circleGrad.addColorStop(0.4, "#2563eb");
            circleGrad.addColorStop(0.85, "#0b2553");
            circleGrad.addColorStop(1.0, "#020713");

            ctx.fillStyle = circleGrad;
            ctx.beginPath();
            ctx.arc(0, bailCenterY, bailRadius, 0, 2 * Math.PI);
            ctx.fill();

            ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
            ctx.lineWidth = 0.6;
            ctx.stroke();
        }

        ctx.restore();

        // --- 3. DRAW FLYING / DISLODGED BAIL (PROJECTILE POSITION) ---
        if (this.isBailDislodged) {
            ctx.save();
            ctx.translate(this.bailPos.x, this.bailPos.y);
            ctx.rotate(this.bailAngle);

            const bailRadius = this.BAIL_BARREL_DIAMETER / 2;
            const circleGrad = ctx.createRadialGradient(-0.8, -0.8, 0.5, 0, 0, bailRadius);
            circleGrad.addColorStop(0.0, "#93c5fd");
            circleGrad.addColorStop(0.4, "#2563eb");
            circleGrad.addColorStop(0.85, "#0b2553");
            circleGrad.addColorStop(1.0, "#020713");

            ctx.fillStyle = circleGrad;
            ctx.beginPath();
            ctx.arc(0, 0, bailRadius, 0, 2 * Math.PI);
            ctx.fill();

            ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
            ctx.lineWidth = 0.7;
            ctx.stroke();

            ctx.restore();
        }

        ctx.restore();
    }

    /**
     * Draw Static Wicket at any specified X coordinate (e.g. Bowler End Wicket)
     */
    public drawAt(ctx: CanvasRenderingContext2D, customX: number): void {
        const sx = customX;
        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT;
        const w = this.STUMP_DIAMETER;

        ctx.save();

        // 1. BASE SHADOW ON GROUND
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.beginPath();
        ctx.ellipse(sx, groundY + 1, 6, 2.5, 0, 0, 2 * Math.PI);
        ctx.fill();

        // 2. STATIC ICC DEEP BLUE STUMP
        ctx.save();
        ctx.translate(sx, groundY);

        const stumpGrad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        stumpGrad.addColorStop(0.0, "#030a1c");
        stumpGrad.addColorStop(0.3, "#0b2553");
        stumpGrad.addColorStop(0.55, "#1d4ed8");
        stumpGrad.addColorStop(0.8, "#0f2e6b");
        stumpGrad.addColorStop(1.0, "#020713");

        ctx.fillStyle = stumpGrad;
        ctx.fillRect(-w / 2, -this.WICKET_HEIGHT, w, this.WICKET_HEIGHT);

        ctx.strokeStyle = "rgba(147, 197, 253, 0.5)";
        ctx.lineWidth = 0.6;
        ctx.strokeRect(-w / 2, -this.WICKET_HEIGHT, w, this.WICKET_HEIGHT);

        ctx.fillStyle = "#030a1c";
        ctx.fillRect(-w / 2 + 1.0, -this.WICKET_HEIGHT, w - 2.0, 2.0);

        // Seated bail
        const bailRadius = this.BAIL_BARREL_DIAMETER / 2;
        const bailCenterY = -this.WICKET_HEIGHT - bailRadius + 1.0;

        ctx.fillStyle = "#1d4ed8";
        ctx.fillRect(-1.25, -this.WICKET_HEIGHT - 0.5, 2.5, 1.5);

        const circleGrad = ctx.createRadialGradient(-0.8, bailCenterY - 0.8, 0.5, 0, bailCenterY, bailRadius);
        circleGrad.addColorStop(0.0, "#93c5fd");
        circleGrad.addColorStop(0.4, "#2563eb");
        circleGrad.addColorStop(0.85, "#0b2553");
        circleGrad.addColorStop(1.0, "#020713");

        ctx.fillStyle = circleGrad;
        ctx.beginPath();
        ctx.arc(0, bailCenterY, bailRadius, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 0.6;
        ctx.stroke();

        ctx.restore();
        ctx.restore();
    }
}
