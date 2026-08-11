import { CANVAS_HEIGHT, GROUND_HEIGHT } from "../game/constants";
import Bat from "./Bat";

export default class Wicket {
    private bat: Bat;

    // ICC Wicket Specification Constants (True 2D Side-View Single Stump)
    public readonly WICKET_HEIGHT = 125; // 125px total height
    public readonly STUMP_DIAMETER = 6.5; // 6.5px diameter for stump post
    public readonly BAIL_BARREL_DIAMETER = 5.0; // 5.0px diameter for bail barrel
    public readonly BAIL_SPIGOT_DIAMETER = 2.5; // 2.5px diameter for inner spigot seating
    public readonly FIXED_X = 150; // Fixed X = 150 position

    // Wicket Hit / OUT State
    public isOut: boolean = false;
    public hitTime: number = 0;

    constructor(bat: Bat) {
        this.bat = bat;
    }

    /**do code
     * 
     * Get the fixed X position of the wicket (X = 150)
     */
    public getCenterX(): number {
        return this.FIXED_X;
    }

    /**
     * Reset wicket collision state for new ball
     */
    public reset(): void {
        this.isOut = false;
        this.hitTime = 0;
    }

    /**
     * Check if ball trajectory line segment intersects the static vertical wicket line
     * @param ball Ball entity
     * @param batHitOccurred Whether a bat collision occurred in the same frame
     * @param batHitSubStep Sub-step (1..30) when bat collision occurred
     */
    public checkHit(ball: any, batHitOccurred: boolean = false, batHitSubStep: number = 30): boolean {
        if (!ball || !ball.isActive) return false;

        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT;
        const stumpTopY = groundY - this.WICKET_HEIGHT;
        const stumpX = this.FIXED_X;
        const radius = (ball.radius || 6) + (this.STUMP_DIAMETER / 2);

        // Ball trajectory segment from prevPos (or pos) to pos
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

        // Y position of ball at the moment of intersection at stumpX
        const yAtStump = y1 + tWicket * (y2 - y1);

        // Vertical collision range: from top of bail (stumpTopY - 5px) down to groundY
        if (yAtStump >= (stumpTopY - 5.0 - (ball.radius || 6)) && yAtStump <= groundY + 5) {
            // Priority Resolution Rule: Compare tBat vs tWicket
            if (batHitOccurred) {
                const tBat = batHitSubStep / 30.0;
                if (tBat < tWicket) {
                    // Bat hit happened FIRST! Deflected by bat. Not Out.
                    return false;
                }
            }

            // WICKET HIT! Trigger OUT!
            this.isOut = true;
            this.hitTime = Date.now();
            console.log(`[WICKET HIT - BOWLED OUT!] tWicket: ${tWicket.toFixed(3)} | Ball Y: ${yAtStump.toFixed(1)}`);
            return true;
        }

        return false;
    }

    /**
     * Draw True 2D Side-View ICC Deep Blue Wicket (Single Stump + Side-View Circular Bail End-Profile) at X = 150
     */
    public draw(ctx: CanvasRenderingContext2D): void {
        const sx = this.FIXED_X;
        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT;
        const stumpTopY = groundY - this.WICKET_HEIGHT;
        const w = this.STUMP_DIAMETER;
        const leftX = sx - w / 2;

        ctx.save();

        // --- 1. BASE SHADOW ON GROUND ---
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.beginPath();
        ctx.ellipse(sx, groundY + 1, 6, 2.5, 0, 0, 2 * Math.PI);
        ctx.fill();

        // --- 2. SINGLE ICC DEEP BLUE STUMP (SIDE VIEW) ---
        // Metallic ICC Deep Blue Gradient (#030a1c -> #0b2553 -> #1d4ed8 -> #020713)
        const stumpGrad = ctx.createLinearGradient(leftX, 0, leftX + w, 0);
        stumpGrad.addColorStop(0.0, "#030a1c");
        stumpGrad.addColorStop(0.3, "#0b2553");
        stumpGrad.addColorStop(0.55, "#1d4ed8"); // Metallic blue shine ridge
        stumpGrad.addColorStop(0.8, "#0f2e6b");
        stumpGrad.addColorStop(1.0, "#020713");

        ctx.fillStyle = stumpGrad;
        ctx.fillRect(leftX, stumpTopY, w, this.WICKET_HEIGHT);

        // Fine metallic edge outline
        ctx.strokeStyle = "rgba(147, 197, 253, 0.5)";
        ctx.lineWidth = 0.6;
        ctx.strokeRect(leftX, stumpTopY, w, this.WICKET_HEIGHT);

        // Top U-shaped groove notch on stump head
        ctx.fillStyle = "#030a1c";
        ctx.fillRect(leftX + 1.0, stumpTopY, w - 2.0, 2.0);

        // --- 3. TRUE 2D SIDE-VIEW BAIL (CIRCULAR END PROFILE) ---
        const bailRadius = this.BAIL_BARREL_DIAMETER / 2; // 2.5px radius (5.0px diameter)
        const bailCenterY = stumpTopY - bailRadius + 1.0;  // Seated inside top notch

        // Inner Spigot Peg Seating (2.5px diameter base)
        ctx.fillStyle = "#1d4ed8";
        ctx.fillRect(sx - 1.25, stumpTopY - 0.5, 2.5, 1.5);

        // Metallic ICC Blue Circle (5.0px diameter)
        const circleGrad = ctx.createRadialGradient(sx - 0.8, bailCenterY - 0.8, 0.5, sx, bailCenterY, bailRadius);
        circleGrad.addColorStop(0.0, "#93c5fd"); // Top reflection spot
        circleGrad.addColorStop(0.4, "#2563eb"); // ICC Deep Blue
        circleGrad.addColorStop(0.85, "#0b2553");
        circleGrad.addColorStop(1.0, "#020713");

        ctx.fillStyle = circleGrad;
        ctx.beginPath();
        ctx.arc(sx, bailCenterY, bailRadius, 0, 2 * Math.PI);
        ctx.fill();

        // White metallic reflection ring border
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 0.6;
        ctx.stroke();

        ctx.restore();
    }
}
