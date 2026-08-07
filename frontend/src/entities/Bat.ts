import { BAT_CENTER_OF_MASS_RATIO } from "../game/constants";
import outerArcJson from "../config/outer_handle_arc.json";
import innerArcJson from "../config/inner_handle_arc.json";

type Vec2 = { x: number; y: number };

export default class Bat {

    private readonly BAT_MASS = 1.0;
    private readonly SPRING_STIFFNESS = 260;
    private readonly DAMPING = 22;
    // --- Wrist Rotation Physics ---
    private readonly MAX_HANDLE_SPEED_UP: number = 100; // Force it to be very slow for testing
    private readonly HANDLE_COM_SPEED_SCALE: number = 0.1; // Make it extremely restricted

    // Debug vars
    private debug_comUpSpeed = 0;
    private debug_handleUpSpeed = 0;
    private debug_handleRightSpeed = 0;
    private debug_actualDeltaY = 0;
    private debug_maxDeltaY = 0;
    private debug_isHit = false;
    private debug_dx = 0;
    private debug_dy = 0;
    private prevHandlePos: Vec2 | null = null;
    
    private readonly GRAVITY = 600;
    private comTarget: Vec2 = { x: 300, y: 550 };   // where mouse wants it
    private comActual: Vec2 = { x: 700, y: 350 }; // where it PHYSICALLY is (start near shoulder)
    private comVelocity: Vec2 = { x: 0, y: 0 };

    private batAngleActual = 0;
    private handleActual: Vec2 = { x: 700, y: 350 };
    private handleVelocity: Vec2 = { x: 0, y: 0 };
    private readonly HANDLE_STIFFNESS_X = 15; // Fast
    private readonly HANDLE_STIFFNESS_Y = 3;  // Slow, fixed for now
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

    // Minimum elbow bend angles (degrees). 0 means completely folded, 180 means completely straight.
    private readonly FRONT_ARM_MIN_ELBOW_ANGLE = 45;
    private readonly BACK_ARM_MIN_ELBOW_ANGLE = 80;

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

    private getInterpolatedRadius(pts: { angle: number, radius: number }[], targetAngle: number, scaleDivisor: number = 200): number {
        if (pts.length === 0) return 100;
        
        // Clamp the angle to the bounds of the JSON array so it doesn't extrapolate
        const minAngle = pts[0].angle;
        const maxAngle = pts[pts.length - 1].angle;
        let clampedAngle = Math.max(minAngle, Math.min(maxAngle, targetAngle));

        let p1 = pts[0];
        let p2 = pts[pts.length - 1];

        for (let i = 0; i < pts.length - 1; i++) {
            if (clampedAngle >= pts[i].angle && clampedAngle <= pts[i + 1].angle) {
                p1 = pts[i];
                p2 = pts[i + 1];
                break;
            }
        }

        const t = (clampedAngle - p1.angle) / ((p2.angle - p1.angle) || 1);
        const interpolatedRadius = p1.radius + t * (p2.radius - p1.radius);
        
        const frontMax = this.FRONT_UPPER_ARM + this.FRONT_LOWER_ARM;
        return interpolatedRadius * (frontMax / scaleDivisor);
    }

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
        
        // 1. Mouse Target Clamping (Safe Zone)
        const rawMouseX = this.mouse.x + this.GRIP_OFFSET_FROM_CURSOR;
        const rawMouseY = this.mouse.y;
        
        const dxMouse = rawMouseX - shoulderMid.x;
        const dyMouse = rawMouseY - shoulderMid.y;
        const mouseDist = Math.hypot(dxMouse, dyMouse);
        
        const maxSafeRadius = Math.max(
            FRONT_MAX + comOffsetFromTop - (this.HANDLE_LENGTH * 0.5), 
            BACK_MAX + comOffsetFromTop
        );
        
        if (mouseDist > maxSafeRadius) {
            this.comTarget = {
                x: shoulderMid.x + (dxMouse / mouseDist) * maxSafeRadius,
                y: shoulderMid.y + (dyMouse / mouseDist) * maxSafeRadius
            };
        } else {
            this.comTarget = { x: rawMouseX, y: rawMouseY };
        }

        this.simulateComPhysics(dt);

        // 2. Handle moves towards ideal position (straight above COM)
        const handleIdealTarget = {
            x: this.comActual.x,
            y: this.comActual.y - comOffsetFromTop
        };

        const dtClamp = Math.min(dt, 0.05);
        let desiredHandleX = this.handleActual.x + (handleIdealTarget.x - this.handleActual.x) * this.HANDLE_STIFFNESS_X * dtClamp;
        let desiredHandleY = this.handleActual.y + (handleIdealTarget.y - this.handleActual.y) * this.HANDLE_STIFFNESS_Y * dtClamp;

        // Apply UP speed limit (Wrist Rotation mechanics)
        const comUpSpeed = -this.comVelocity.y; // Positive if COM is moving UP
        let maxHandleUpSpeed = Infinity;
        
        if (comUpSpeed > 0) {
            maxHandleUpSpeed = Math.min(comUpSpeed * this.HANDLE_COM_SPEED_SCALE, this.MAX_HANDLE_SPEED_UP);
        }
        
        const maxHandleDeltaY = maxHandleUpSpeed * dtClamp;
        const actualDeltaY = this.handleActual.y - desiredHandleY; // Positive if Handle is trying to move UP
        
        let handleHitSpeedLimit = false;

        if (actualDeltaY > maxHandleDeltaY) {
            // Handle is trying to go UP faster than allowed. Clamp it!
            desiredHandleY = this.handleActual.y - maxHandleDeltaY;
            handleHitSpeedLimit = true;
        }

        this.debug_comUpSpeed = comUpSpeed;
        this.debug_actualDeltaY = actualDeltaY;
        this.debug_maxDeltaY = maxHandleDeltaY;
        this.debug_isHit = handleHitSpeedLimit;

        this.handleActual.x = desiredHandleX;
        this.handleActual.y = desiredHandleY;

        const frontHandPosition = 0.5;
        const frontWristDistFromTop = this.HANDLE_LENGTH * frontHandPosition;

        for (let i = 0; i < 5; i++) {
            // A. Rigid Body Projection (Handle and COM must be `comOffsetFromTop` apart)
            const dx = this.handleActual.x - this.comActual.x;
            const dy = this.handleActual.y - this.comActual.y;
            const bDist = Math.hypot(dx, dy);
            if (bDist > 0.01) {
                const diff = bDist - comOffsetFromTop;
                
                // Move both equally towards/away from each other to satisfy the length
                const offsetX = (dx / bDist) * diff * 0.5;
                const offsetY = (dy / bDist) * diff * 0.5;
                
                this.handleActual.x -= offsetX;
                this.handleActual.y -= offsetY;
                this.comActual.x += offsetX;
                this.comActual.y += offsetY;
            }

            // B. Arc Constraints on Handle
            
            // 1. Strict Ceiling (Handle cannot go into the negative Y area above shoulder)
            if (this.handleActual.y < shoulderMid.y) {
                this.handleActual.y = shoulderMid.y;
            }

            // 2. Radial Arc Constraints
            let hdx = this.handleActual.x - shoulderMid.x;
            let hdy = this.handleActual.y - shoulderMid.y;
            let hDist = Math.hypot(hdx, hdy);

            if (hDist > 0.01) {
                let angleDeg = Math.atan2(hdy, hdx) * 180 / Math.PI;
                let maxRadius = this.getInterpolatedRadius(outerArcJson, angleDeg, 200);
                let minRadius = this.getInterpolatedRadius(innerArcJson, angleDeg, 400);

                if (hDist > maxRadius) {
                    this.handleActual.x = shoulderMid.x + (hdx / hDist) * maxRadius;
                    this.handleActual.y = shoulderMid.y + (hdy / hDist) * maxRadius;
                } else if (hDist < minRadius) {
                    this.handleActual.x = shoulderMid.x + (hdx / hDist) * minRadius;
                    this.handleActual.y = shoulderMid.y + (hdy / hDist) * minRadius;
                }
            }
        }

        // 4. Calculate Final Angle (Vector from Handle to COM)
        const dirX = this.comActual.x - this.handleActual.x;
        const dirY = this.comActual.y - this.handleActual.y;
        this.batAngleActual = Math.atan2(dirY, dirX);
        this.batAngle = this.batAngleActual;

        // 5. Update derived positions
        const dir = { x: Math.cos(this.batAngleActual), y: Math.sin(this.batAngleActual) };
        
        this.handleTop = { x: this.handleActual.x, y: this.handleActual.y };
        this.bladeTip = {
            x: this.handleTop.x + dir.x * this.TOTAL_LENGTH,
            y: this.handleTop.y + dir.y * this.TOTAL_LENGTH,
        };

        const backHandPosition = 0.0;
        
        this.backWristTarget = {
            x: this.handleTop.x + dir.x * (this.HANDLE_LENGTH * backHandPosition),
            y: this.handleTop.y + dir.y * (this.HANDLE_LENGTH * backHandPosition),
        };
        this.frontWristTarget = {
            x: this.handleTop.x + dir.x * (this.HANDLE_LENGTH * frontHandPosition),
            y: this.handleTop.y + dir.y * (this.HANDLE_LENGTH * frontHandPosition),
        };

        this.centerOfMass = this.comActual;

        if (this.prevHandlePos && dt > 0) {
            this.debug_handleUpSpeed = (this.prevHandlePos.y - this.handleActual.y) / dt;
            this.debug_handleRightSpeed = (this.handleActual.x - this.prevHandlePos.x) / dt;
        }
        this.prevHandlePos = { x: this.handleActual.x, y: this.handleActual.y };
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
        //this.drawArms(ctx);
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

        // Debug draw shoulderMid center
        const shoulderMid = {
            x: (this.FRONT_SHOULDER.x + this.BACK_SHOULDER.x) / 2,
            y: (this.FRONT_SHOULDER.y + this.BACK_SHOULDER.y) / 2,
        };
        ctx.beginPath();
        ctx.arc(shoulderMid.x, shoulderMid.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = "lime";
        ctx.fill();

        // Debug draw outer arc
        ctx.beginPath();
        for (let a = 0; a <= 180; a += 5) {
            let maxRadius = this.getInterpolatedRadius(outerArcJson, a);
            let px = shoulderMid.x + Math.cos(a * Math.PI / 180) * maxRadius;
            let py = shoulderMid.y + Math.sin(a * Math.PI / 180) * maxRadius;
            if (a === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();
        // Debug draw inner arc
        ctx.beginPath();
        for (let a = 0; a <= 180; a += 5) {
            let minRadius = this.getInterpolatedRadius(innerArcJson, a, 400);
            let px = shoulderMid.x + Math.cos(a * Math.PI / 180) * minRadius;
            let py = shoulderMid.y + Math.sin(a * Math.PI / 180) * minRadius;
            if (a === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = "rgba(255, 100, 100, 0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Debug text for Wrist Rotation
        ctx.fillStyle = "black";
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "center";
        
        ctx.fillText(`COM Y: ${this.comActual.y.toFixed(2)}`, ctx.canvas.width / 2, 30);
        ctx.fillText(`Handle Y: ${this.handleActual.y.toFixed(2)}`, ctx.canvas.width / 2, 50);
        ctx.fillText(`Handle X: ${this.handleActual.x.toFixed(2)}`, ctx.canvas.width / 2, 70);
        
        ctx.textAlign = "left"; // Reset alignment
    }
}