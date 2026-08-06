import { BAT_CENTER_OF_MASS_RATIO } from "../game/constants";

type Vec2 = { x: number; y: number };

export default class Bat {

    private readonly BAT_MASS = 1.0;
    private readonly SPRING_STIFFNESS = 260;
    private readonly DAMPING = 22;
    private readonly GRAVITY = 600;
    private comTarget: Vec2 = { x: 0, y: 0 };   // where mouse wants it
    private comActual: Vec2 = { x: 700, y: 350 }; // where it PHYSICALLY is (start near shoulder)
    private comVelocity: Vec2 = { x: 0, y: 0 };

      // batAngle now also needs to lag — see below
    private batAngleActual = 0;
    private batAngleVelocity = 0;
    // --- BAT BREAKDOWN ---
    private readonly HANDLE_LENGTH = 56;  // 33% of the bat
    private readonly BLADE_LENGTH = 112;  // 67% of the bat
    private readonly TOTAL_LENGTH = this.HANDLE_LENGTH + this.BLADE_LENGTH;
    // --- WIDTHS ---
    private readonly HANDLE_WIDTH = 10;
    private readonly BLADE_WIDTH = 22;

    // --- FRONT ARM ---
    private readonly FRONT_UPPER_ARM = 76;
    private readonly FRONT_LOWER_ARM = 74;

    // --- BACK ARM ---
    private readonly BACK_UPPER_ARM = 64;
    private readonly BACK_LOWER_ARM = 62;

    // --- SHOULDER ANCHORS ---
    private readonly FRONT_SHOULDER_OFFSET = { x: 0, y: 0 };
    private readonly BACK_SHOULDER_OFFSET = { x: 30, y: -4 };

    // How far the bat's center of mass sits from the raw cursor point,
    // perpendicular to the bat's own axis. Purely a feel/tuning constant —
    // increase it if the bat should trail further from the actual cursor.
    private readonly GRIP_OFFSET_FROM_CURSOR = 20;

    // The maximum radius the bat is allowed to travel away from the shoulders
    private readonly MAX_REACH = 130;

    // Bend-side flags. Both -1 makes the elbows bend naturally in parallel (fixes the diamond shape).
    private readonly BACK_ARM_BEND: 1 | -1 = -1;   // must bend to the right
    private readonly FRONT_ARM_BEND: 1 | -1 = 1; // must bend to the right

    private readonly EPS = 0.01;



    // Joint Positions
    private FRONT_SHOULDER: Vec2 = { x: 700, y: 350 };
    private BACK_SHOULDER: Vec2 = {
        x: this.FRONT_SHOULDER.x + this.BACK_SHOULDER_OFFSET.x,
        y: this.FRONT_SHOULDER.y + this.BACK_SHOULDER_OFFSET.y,
    };

    // Computed each frame
    private batAngle = 0;
    private centerOfMass: Vec2 = { x: 0, y: 0 };
    private handleTop: Vec2 = { x: 0, y: 0 };
    private bladeTip: Vec2 = { x: 0, y: 0 };

    private frontWristTarget: Vec2 = { x: 0, y: 0 };
    private backWristTarget: Vec2 = { x: 0, y: 0 };

    private frontElbow: Vec2 = { x: 0, y: 0 };
    private backElbow: Vec2 = { x: 0, y: 0 };
    private frontWrist: Vec2 = { x: 0, y: 0 }; // actual (possibly clamped) wrist
    private backWrist: Vec2 = { x: 0, y: 0 };

    private mouse: Vec2 = { x: 0, y: 0 };

    update(mouseX: number, mouseY: number, dt: number): void {
        this.mouse.x = mouseX;
        this.mouse.y = mouseY;

        this.updateBatPose(dt);
        this.updateArm(
            this.FRONT_SHOULDER,
            this.frontWristTarget,
            this.FRONT_UPPER_ARM,
            this.FRONT_LOWER_ARM,
            this.FRONT_ARM_BEND,
            "front"
        );
        this.updateArm(
            this.BACK_SHOULDER,
            this.backWristTarget,
            this.BACK_UPPER_ARM,
            this.BACK_LOWER_ARM,
            this.BACK_ARM_BEND,
            "back"
        );
    }

    // ---------------------------------------------------------------
    // STEP 1: bat orientation + COM + wrist targets, driven by mouse
    // ---------------------------------------------------------------
    private updateBatPose(dt: number): void {
        const shoulderMid = {
            x: (this.FRONT_SHOULDER.x + this.BACK_SHOULDER.x) / 2,
            y: (this.FRONT_SHOULDER.y + this.BACK_SHOULDER.y) / 2,
        };

        const FRONT_MAX = this.FRONT_UPPER_ARM + this.FRONT_LOWER_ARM;
        const BACK_MAX = this.BACK_UPPER_ARM + this.BACK_LOWER_ARM;
        const comOffsetFromTop = this.TOTAL_LENGTH * BAT_CENTER_OF_MASS_RATIO;
        
        let clampedMouse = { x: this.mouse.x, y: this.mouse.y };
        let targetAngle = 0;
        let finalComTarget = { x: 0, y: 0 };
        
        // --- Dynamic Kinematic Leash (Iterative Solver) ---
        // We check if the mouse position forces either wrist past its absolute max stretch.
        // If it does, we pull the mouse backward slightly and check again, until both elbows are safe!
        for (let i = 0; i < 10; i++) {
            targetAngle = Math.atan2(clampedMouse.y - shoulderMid.y, clampedMouse.x - shoulderMid.x);
            const targetDir = { x: Math.cos(targetAngle), y: Math.sin(targetAngle) };
            
            let perp = { x: -targetDir.y, y: targetDir.x };
            if (perp.x < 0) { perp.x *= -1; perp.y *= -1; }

            finalComTarget = {
                x: clampedMouse.x + perp.x * this.GRIP_OFFSET_FROM_CURSOR,
                y: clampedMouse.y + perp.y * this.GRIP_OFFSET_FROM_CURSOR,
            };
            
            // Calculate where the wrists WOULD be if the bat followed this mouse
            const theoreticalHandleTop = {
                x: finalComTarget.x - targetDir.x * comOffsetFromTop,
                y: finalComTarget.y - targetDir.y * comOffsetFromTop,
            };
            
            const theoreticalFrontWrist = {
                x: theoreticalHandleTop.x + targetDir.x * (this.HANDLE_LENGTH * 0.5),
                y: theoreticalHandleTop.y + targetDir.y * (this.HANDLE_LENGTH * 0.5),
            };
            const theoreticalBackWrist = {
                x: theoreticalHandleTop.x + targetDir.x * (this.HANDLE_LENGTH * 0.0),
                y: theoreticalHandleTop.y + targetDir.y * (this.HANDLE_LENGTH * 0.0),
            };
            
            const frontDist = Math.hypot(theoreticalFrontWrist.x - this.FRONT_SHOULDER.x, theoreticalFrontWrist.y - this.FRONT_SHOULDER.y);
            const backDist = Math.hypot(theoreticalBackWrist.x - this.BACK_SHOULDER.x, theoreticalBackWrist.y - this.BACK_SHOULDER.y);
            
            const frontOver = frontDist - FRONT_MAX;
            const backOver = backDist - BACK_MAX;
            
            // If neither hand is slipping, we are perfectly safe!
            if (frontOver <= 0.1 && backOver <= 0.1) {
                break; 
            }
            
            // Find which hand is slipping the most, and pull the mouse back by that exact amount
            const worstOver = Math.max(frontOver, backOver);
            clampedMouse.x -= Math.cos(targetAngle) * worstOver;
            clampedMouse.y -= Math.sin(targetAngle) * worstOver;
        }

        this.comTarget = finalComTarget;

        this.simulateComPhysics(dt);
        this.simulateAngle(targetAngle, dt);

        const dir: Vec2 = { x: Math.cos(this.batAngleActual), y: Math.sin(this.batAngleActual) };
        this.batAngle = this.batAngleActual;

        this.handleTop = {
            x: this.comActual.x - dir.x * comOffsetFromTop,
            y: this.comActual.y - dir.y * comOffsetFromTop,
        };
        this.bladeTip = {
            x: this.handleTop.x + dir.x * this.TOTAL_LENGTH,
            y: this.handleTop.y + dir.y * this.TOTAL_LENGTH,
        };

        // Fixed wrist positions: Back hand at top, Front hand at middle
        const backHandPosition = 0.0;
        const frontHandPosition = 0.5;

        this.backWristTarget = {
            x: this.handleTop.x + dir.x * (this.HANDLE_LENGTH * backHandPosition),
            y: this.handleTop.y + dir.y * (this.HANDLE_LENGTH * backHandPosition),
        };
        this.frontWristTarget = {
            x: this.handleTop.x + dir.x * (this.HANDLE_LENGTH * frontHandPosition),
            y: this.handleTop.y + dir.y * (this.HANDLE_LENGTH * frontHandPosition),
        };

        this.centerOfMass = this.comActual;
    }

    private simulateComPhysics(dt: number): void {
        const dx = this.comTarget.x - this.comActual.x;
        const dy = this.comTarget.y - this.comActual.y;

        const springForceX = dx * this.SPRING_STIFFNESS;
        const springForceY = dy * this.SPRING_STIFFNESS;

        const dampingForceX = -this.comVelocity.x * this.DAMPING;
        const dampingForceY = -this.comVelocity.y * this.DAMPING;

        const restingY = this.FRONT_SHOULDER.y + 150;
        const displacement = Math.max(0, restingY - this.comActual.y);
        const gravityScale = 1 + (displacement / 120) * 0.6;
        const gravityForceY = this.GRAVITY * this.BAT_MASS * gravityScale;

        const totalForceX = springForceX + dampingForceX;
        const totalForceY = springForceY + dampingForceY + gravityForceY;

        const accelX = totalForceX / this.BAT_MASS;
        const accelY = totalForceY / this.BAT_MASS;

        this.comVelocity.x += accelX * dt;
        this.comVelocity.y += accelY * dt;

        this.comActual.x += this.comVelocity.x * dt;
        this.comActual.y += this.comVelocity.y * dt;
    }

    private simulateAngle(targetAngle: number, dt: number): void {
        let diff = targetAngle - this.batAngleActual;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;

        const springTorque = diff * this.SPRING_STIFFNESS;
        const dampingTorque = -this.batAngleVelocity * this.DAMPING;
        const angularAccel = (springTorque + dampingTorque) / this.BAT_MASS;

        this.batAngleVelocity += angularAccel * dt;
        this.batAngleActual += this.batAngleVelocity * dt;
    }

    // ---------------------------------------------------------------
    // STEP 2: 2-bone IK per arm — shoulder is fixed, wrist is the target
    // ---------------------------------------------------------------
    private updateArm(
        shoulder: Vec2,
        target: Vec2,
        upperLen: number,
        lowerLen: number,
        bendSide: 1 | -1,
        which: "front" | "back"
    ): void {
        const dx = target.x - shoulder.x;
        const dy = target.y - shoulder.y;
        const rawDist = Math.hypot(dx, dy);

        const minReach = Math.abs(upperLen - lowerLen) + this.EPS;
        const maxReach = upperLen + lowerLen - this.EPS;
        const dist = Math.min(Math.max(rawDist, minReach), maxReach);

        // If the target was out of reach, clamp the ACTUAL wrist position
        // along the shoulder->target ray to the max/min reachable distance.
        const clampedTarget: Vec2 =
            rawDist === 0
                ? { x: shoulder.x + dist, y: shoulder.y }
                : {
                      x: shoulder.x + (dx / rawDist) * dist,
                      y: shoulder.y + (dy / rawDist) * dist,
                  };

        const baseAngle = Math.atan2(
            clampedTarget.y - shoulder.y,
            clampedTarget.x - shoulder.x
        );

        const cosAngle = (upperLen ** 2 + dist ** 2 - lowerLen ** 2) / (2 * upperLen * dist);
        const shoulderAngle = Math.acos(Math.min(1, Math.max(-1, cosAngle)));

        const candidateA = this.pointOnCircle(shoulder, upperLen, baseAngle + shoulderAngle);
        const candidateB = this.pointOnCircle(shoulder, upperLen, baseAngle - shoulderAngle);

        // Pick the candidate on the requested side of the shoulder->target line.
        const elbow = this.sideOfLine(shoulder, clampedTarget, candidateA) === bendSide
            ? candidateA
            : candidateB;

        if (which === "front") {
            this.frontElbow = elbow;
            this.frontWrist = clampedTarget;
        } else {
            this.backElbow = elbow;
            this.backWrist = clampedTarget;
        }
    }

    private pointOnCircle(center: Vec2, radius: number, angle: number): Vec2 {
        return {
            x: center.x + radius * Math.cos(angle),
            y: center.y + radius * Math.sin(angle),
        };
    }

    // Returns 1 or -1 depending on which side of line A->B point P falls on.
    // (Cross product of AB x AP.) Canvas y is down, so "1" and "-1" here are
    // just consistent labels — match them visually to left/right, not math left/right.
    private sideOfLine(a: Vec2, b: Vec2, p: Vec2): 1 | -1 {
        const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        return cross >= 0 ? 1 : -1;
    }

    draw(ctx: CanvasRenderingContext2D): void {
        this.drawBat(ctx);
        this.drawArms(ctx);
        this.drawDebug(ctx);
    }

    private drawBat(ctx: CanvasRenderingContext2D): void {
        const dir: Vec2 = { x: Math.cos(this.batAngle), y: Math.sin(this.batAngle) };
        const handleBladeJunction: Vec2 = {
            x: this.handleTop.x + dir.x * this.HANDLE_LENGTH,
            y: this.handleTop.y + dir.y * this.HANDLE_LENGTH,
        };

        // Handle — thin
        ctx.beginPath();
        ctx.moveTo(this.handleTop.x, this.handleTop.y);
        ctx.lineTo(handleBladeJunction.x, handleBladeJunction.y);
        ctx.strokeStyle = "#4a2c1a";
        ctx.lineWidth = this.HANDLE_WIDTH;
        ctx.lineCap = "round";
        ctx.stroke();

        // Blade — thick
        ctx.beginPath();
        ctx.moveTo(handleBladeJunction.x, handleBladeJunction.y);
        ctx.lineTo(this.bladeTip.x, this.bladeTip.y);
        ctx.strokeStyle = "#d9a066";
        ctx.lineWidth = this.BLADE_WIDTH;
        ctx.lineCap = "round";
        ctx.stroke();
    }

    private drawArms(ctx: CanvasRenderingContext2D): void {
        this.drawLimb(ctx, this.FRONT_SHOULDER, this.frontElbow, this.frontWrist, "green");
        this.drawLimb(ctx, this.BACK_SHOULDER, this.backElbow, this.backWrist, "purple");
    }

    private drawLimb(ctx: CanvasRenderingContext2D, s: Vec2, e: Vec2, w: Vec2, color: string): void {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(e.x, e.y);
        ctx.lineTo(w.x, w.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 8;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
    }

    private drawDebug(ctx: CanvasRenderingContext2D): void {
        ctx.beginPath();
        ctx.arc(this.FRONT_SHOULDER.x, this.FRONT_SHOULDER.y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = "red";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(this.BACK_SHOULDER.x, this.BACK_SHOULDER.y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = "blue";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(this.centerOfMass.x, this.centerOfMass.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = "yellow";
        ctx.fill();
    }
}