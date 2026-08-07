import { BAT_CENTER_OF_MASS_RATIO } from "../game/constants";
import outerArcJson from "../config/outer_handle_arc.json";
import innerArcJson from "../config/inner_handle_arc.json";

type Vec2 = { x: number; y: number };

export default class Bat {

    private readonly BAT_MASS = 1.0;
    private readonly SPRING_STIFFNESS = 260;
    private readonly DAMPING = 22;
    // --- Wrist Rotation Physics ---
    private readonly WRIST_TILT_SPEED_SCALE: number = 0.005; // How much the bat tilts based on UP speed

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
    private readonly HANDLE_STIFFNESS_Y = 30; // Increased so it hits speed limit!for now
    // --- BAT BREAKDOWN ---
    private readonly HANDLE_LENGTH = 56;  // 33% of the bat
    private readonly BLADE_LENGTH = 2*this.HANDLE_LENGTH; // 67% of the bat
    private readonly TOTAL_BAT_LENGTH = this.HANDLE_LENGTH + this.BLADE_LENGTH;
    private readonly TOTAL_RIGHT_ARM_LENGTH  =  this.TOTAL_BAT_LENGTH*0.7777;
    private readonly TOTAL_LEFT_ARM_LENGTH = this.TOTAL_BAT_LENGTH*0.58333;
    // --- WIDTHS ---

    private readonly HANDLE_WIDTH = this.TOTAL_BAT_LENGTH*.0388888888;
    private readonly BLADE_WIDTH = 22;

    // --- FRONT ARM ---
    private readonly FRONT_UPPER_ARM = this.TOTAL_LEFT_ARM_LENGTH*.3619;
    private readonly FRONT_LOWER_ARM = this.TOTAL_LEFT_ARM_LENGTH-this.FRONT_UPPER_ARM;

    // --- BACK ARM ---
    private readonly BACK_UPPER_ARM = this.TOTAL_RIGHT_ARM_LENGTH*.4366;
    private readonly BACK_LOWER_ARM = this.TOTAL_RIGHT_ARM_LENGTH-this.BACK_UPPER_ARM;

    private readonly SHOULDER_JOINT_OFFSET =   (this.FRONT_UPPER_ARM + this.FRONT_LOWER_ARM)/5;



    // --- SHOULDER ANCHORS ---
    private readonly FRONT_SHOULDER_OFFSET = { x: 0, y: 0 };
    private readonly BACK_SHOULDER_OFFSET = { x: this.SHOULDER_JOINT_OFFSET, y: 0 };

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
        const comOffsetFromTop = this.TOTAL_BAT_LENGTH * BAT_CENTER_OF_MASS_RATIO;
        
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

        const dtClamp = Math.min(dt, 0.05);

        // Calculate COM movement
        let comUpSpeed = -this.comVelocity.y;

        // Current relative vector between Handle and COM
        let dxAngle = this.handleActual.x - this.comActual.x;
        let dyAngle = this.handleActual.y - this.comActual.y;
        
        // Find current angle
        let currentAngle = Math.atan2(dyAngle, dxAngle); 
        
        // 1. Upward Swing -> Tilt Linearly
        if (comUpSpeed > 0) {
            let tiltSpeed = comUpSpeed * this.WRIST_TILT_SPEED_SCALE;
            // Straight up is -PI/2. Tilting right means angle increases towards 0.
            currentAngle += tiltSpeed * dtClamp; 
        } 
        
        // 2. Set desired handle position using the angle (Locks the angle if not moving UP)
        let desiredHandleX = this.comActual.x + Math.cos(currentAngle) * comOffsetFromTop;
        let desiredHandleY = this.comActual.y + Math.sin(currentAngle) * comOffsetFromTop;

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
                // let minRadius = this.getInterpolatedRadius(innerArcJson, angleDeg, 400);

                if (hDist > maxRadius) {
                    this.handleActual.x = shoulderMid.x + (hdx / hDist) * maxRadius;
                    this.handleActual.y = shoulderMid.y + (hdy / hDist) * maxRadius;
                } 
                // else if (hDist < minRadius) {
                //     if (!handleHitSpeedLimit) { // BYPASS MIN ARC IF TILTING
                //         this.handleActual.x = shoulderMid.x + (hdx / hDist) * minRadius;
                //         this.handleActual.y = shoulderMid.y + (hdy / hDist) * minRadius;
                //     }
                // }
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
            x: this.handleTop.x + dir.x * this.TOTAL_BAT_LENGTH,
            y: this.handleTop.y + dir.y * this.TOTAL_BAT_LENGTH,
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
        this.drawArms(ctx);
        this.drawDebug(ctx);
    }

    private drawBat(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        
        // Transform to bat's local space. 
        // In local space, (0,0) is handleTop, X-axis points down the length of the bat.
        ctx.translate(this.handleTop.x, this.handleTop.y);
        ctx.rotate(this.batAngle);

        const hl = this.HANDLE_LENGTH;
        const tl = this.TOTAL_BAT_LENGTH;
        const bl = tl - hl; // Blade length

        // Positive local Y points LEFT (back of the bat). Negative local Y points RIGHT (front hitting face).
        const hr = this.HANDLE_WIDTH / 2; 
        const frontY = -hr; // Perfectly flat front face matching the handle
        const toeBackY = hr * 0.5; // Toe tapers to be a bit thin at the very bottom
        const maxSpineY = this.BLADE_WIDTH * 0.9; // Max thickness of the sweet spot
        const swellX = hl + bl * 0.65; // Position of the sweet spot along the length

        // 1. Draw Bat Body (Wood Blade)
        ctx.beginPath();
        ctx.moveTo(hl, frontY); // Start at handle junction (front)
        ctx.lineTo(tl - 3, frontY); // Flat front face all the way down
        
        // Rounded Toe
        ctx.quadraticCurveTo(tl, frontY, tl, 0); 
        ctx.lineTo(tl, toeBackY); 

        // Curved Spine (Back of the bat)
        ctx.bezierCurveTo(
            swellX, maxSpineY + 5,          // CP1: Pulls the curve out to form the sweet spot
            hl + bl * 0.2, maxSpineY * 0.4, // CP2: Tapers back in towards the handle
            hl, hr                          // End at handle junction (back)
        );
        ctx.closePath();

        // Fill wood color
        ctx.fillStyle = "#e6cba8"; // Light English Willow
        ctx.fill();
        ctx.strokeStyle = "#8a5a2b"; // Darker wood outline
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 2. Draw Handle / Grip
        ctx.beginPath();
        ctx.moveTo(0, -hr);
        ctx.lineTo(hl, -hr);
        ctx.lineTo(hl, hr);
        ctx.lineTo(0, hr);
        ctx.closePath();
        
        ctx.fillStyle = "#d32f2f"; // MRF Red Grip
        ctx.fill();
        ctx.stroke();

        // 3. Draw Details (MRF Sticker)
        ctx.save();
        ctx.fillStyle = "#d32f2f"; // Red sticker
        ctx.font = "bold 16px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // Place sticker halfway down the blade, centered vertically
        ctx.translate(hl + bl * 0.45, 0);
        ctx.fillText("MRF", 0, 0);
        ctx.restore();

        ctx.restore();
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