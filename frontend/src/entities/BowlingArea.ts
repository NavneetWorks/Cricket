import Ball from "./Ball";
import bowlerOuterArcData from "../config/bowler_outer_arc.json";
import bowlerInnerArcData from "../config/bowler_inner_arc.json";
import { BOWLING_FROM_ANGLE, BOWLING_TO_ANGLE } from "../game/constants";

export interface Vec2 {
    x: number;
    y: number;
}

export interface ArcConfigEntry {
    angle: number;
    radius: number;
}

/**
 * Interpolate radius for any given angle (0-360 deg) strictly using JSON table entries
 */
export function getArcRadius(angleDeg: number, data: ArcConfigEntry[]): number {
    let normalized = angleDeg % 360;
    if (normalized < 0) normalized += 360;

    if (!data || data.length === 0) return 140;

    let prev = data[0];
    let next = data[data.length - 1];

    for (let i = 0; i < data.length; i++) {
        if (data[i].angle === normalized) return data[i].radius;
        if (data[i].angle < normalized) prev = data[i];
        if (data[i].angle > normalized) {
            next = data[i];
            break;
        }
    }

    if (prev.angle === next.angle) return prev.radius;

    const span = next.angle - prev.angle;
    if (span <= 0) return prev.radius;

    const factor = (normalized - prev.angle) / span;
    return prev.radius + factor * (next.radius - prev.radius);
}

export class CircularMouseQueue {
    private buffer: Vec2[];
    public capacity: number;
    private head: number = 0;
    private count: number = 0;

    constructor(capacity: number = 100) {
        this.capacity = capacity;
        this.buffer = new Array(capacity);
    }

    public push(point: Vec2): void {
        this.buffer[this.head] = { x: point.x, y: point.y };
        this.head = (this.head + 1) % this.capacity;
        if (this.count < this.capacity) {
            this.count++;
        }
    }

    public clear(): void {
        this.head = 0;
        this.count = 0;
    }

    public get size(): number {
        return this.count;
    }

    public get(index: number): Vec2 | null {
        if (index < 0 || index >= this.count) return null;
        const actualIndex = (this.head - this.count + index + this.capacity) % this.capacity;
        return this.buffer[actualIndex];
    }

    public getOldest(): Vec2 | null {
        return this.get(0);
    }

    public getNewest(): Vec2 | null {
        return this.get(this.count - 1);
    }
}

export default class BowlingArea {
    // Card Position & Bounding Box
    public x: number = 1420;
    public y: number = 380;
    public width: number = 380;
    public height: number = 380;

    // Skeletal Joint Parameters (Derived from Batter Arm Length = 150px)
    public readonly TOTAL_ARM_LENGTH: number = 150;
    public upperArmLength: number = 150 * 0.4366; // 65.49px
    public foreArmLength: number = 150 - (150 * 0.4366); // 84.51px

    // Joint Positions (Screen Coordinates)
    public shoulderPos: Vec2 = { x: 100, y: 540 };
    public elbowPos: Vec2 = { x: 1610, y: 495 };
    public handPos: Vec2 = { x: 1610, y: 430 };

    // Dynamic Center Shift (Rightward on CCW rotation, Leftward on CW rotation)
    public centerShiftX: number = 0;
    public readonly MAX_CENTER_SHIFT_X: number = 100;
    public centerShiftSpeed: number = 1400.0; // Linear Shift Speed Multiplier (px/s)

    // Fixed Vertical Release Line Position (Static on Screen)
    public get releaseLineX(): number {
        return this.x + 40; // Static 1460px
    }

    // Two-Stage Release Intersect State Tracking
    public isMouseIntersected: boolean = false;
    public savedReleaseSpeed: number = 0;
    public savedReleaseAngleDeg: number = 0;

    // Release Arc Zone Angles (Degrees loaded from constants.ts)
    public get releaseStartAngleDeg(): number { return Math.min(BOWLING_FROM_ANGLE, BOWLING_TO_ANGLE); }
    public get releaseEndAngleDeg(): number { return Math.max(BOWLING_FROM_ANGLE, BOWLING_TO_ANGLE); }

    // Torsional Spring State Tracking (Matching Bat.ts Torsional Physics)
    public currentArmAngleRad: number = -Math.PI / 2; // Arm angle in radians
    public armAngularVelocity: number = 0; // Arm angular velocity (rad/s)
    public accumulatedMomentum: number = 0;
    public isBallReleased: boolean = false;
    
    // Circular Mouse Queue Buffer (Capacity = 100) & Path Traversal Index
    public circularMouseQueue: CircularMouseQueue = new CircularMouseQueue(1000);
    public ballQueueIndex: number = 0;

    // Mouse Position Queue Trajectory Direction (Matching Bat.ts Direction Vector)
    private mousePositionQueue: Vec2[] = [];
    private readonly QUEUE_SIZE: number = 10;
    public MOUSE_STILL_THRESHOLD: number = 90.0; // px/s rest threshold (~1.5px per frame at 60fps)
    public peakRotationalVelocity: number = 0; // Peak tangential speed tracked during wind-up before rest
    private isFirstFrameInBox: boolean = true;
    private prevMouseX: number = 0;
    private prevMouseY: number = 0;
    private prevStepDist: number = 0;
    private prevTargetRad: number = 0;

    // Debug Visual Overlay Lines
    public mouseDebugTrail: Vec2[] = [];
    public ballDebugTrajectory: Vec2[] = [];

    // Release Debug Information
    public lastReleaseInfo: {
        posX: number;
        posY: number;
        velX: number;
        velY: number;
        speed: number;
        angle: number;
        timestamp: number;
    } | null = null;

    constructor() {
        this.updateJointsFromShoulder();
    }

    public get restCenter(): Vec2 {
        return {
            x: this.x + this.width / 2,
            y: this.y + this.height / 2
        };
    }

    public updateJointsFromShoulder(): void {
        const baseX = this.x + this.width / 2 - 20;
        this.shoulderPos = {
            x: baseX + this.centerShiftX,
            y: 500
        };
        this.elbowPos = {
            x: this.shoulderPos.x,
            y: this.shoulderPos.y - this.upperArmLength
        };
        this.handPos = {
            x: this.elbowPos.x,
            y: this.elbowPos.y - this.foreArmLength
        };
    }

    public reset(ball: Ball): void {
        this.isBallReleased = false;
        this.isMouseIntersected = false;
        this.savedReleaseSpeed = 0;
        this.savedReleaseAngleDeg = 0;
        this.centerShiftX = 0;
        this.accumulatedMomentum = 0;
        this.prevStepDist = 0;
        this.peakRotationalVelocity = 0;
        this.circularMouseQueue.clear();
        this.ballQueueIndex = 0;
        this.mousePositionQueue = [];
        this.mouseDebugTrail = [];
        this.ballDebugTrajectory = [];
        this.currentArmAngleRad = -Math.PI / 2;
        this.armAngularVelocity = 0;
        this.isFirstFrameInBox = true;

        this.updateJointsFromShoulder();
        ball.pos.x = this.handPos.x;
        ball.pos.y = this.handPos.y;
        ball.prevPos.x = this.handPos.x;
        ball.prevPos.y = this.handPos.y;
        ball.vel.x = 0;
        ball.vel.y = 0;
        ball.isActive = true;
    }

    public isMouseInside(mouseX: number, mouseY: number): boolean {
        // Arc itself is the bowling area (260px interaction radius around shoulder pivot)
        const dist = Math.hypot(mouseX - this.shoulderPos.x, mouseY - this.shoulderPos.y);
        return dist <= 260;
    }

    /**
     * Solve 2-Segment Inverse Kinematics strictly clamped inside JSON Outer Arc bounds
     */
    private solveInverseKinematics(targetX: number, targetY: number): void {
        const sx = this.shoulderPos.x;
        const sy = this.shoulderPos.y;

        const dx = targetX - sx;
        const dy = targetY - sy;
        let dist = Math.hypot(dx, dy);

        // Target angle from shoulder (0 to 360 deg)
        let targetAngleRad = Math.atan2(dy, dx);
        let targetAngleDeg = targetAngleRad * (180 / Math.PI);
        if (targetAngleDeg < 0) targetAngleDeg += 360;

        // Dynamic Reach Bounds loaded directly from JSON Config Tables!
        const maxReach = getArcRadius(targetAngleDeg, bowlerOuterArcData);
        const minReach = getArcRadius(targetAngleDeg, bowlerInnerArcData);

        // STRICT VISUAL CLAMP: Hand & ball NEVER cross the Outer Arc line!
        dist = Math.max(minReach, Math.min(maxReach - 1, dist));

        // Law of Cosines for elbow angle
        const l1 = this.upperArmLength;
        const l2 = this.foreArmLength;
        
        let cosElbow = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
        cosElbow = Math.max(-1, Math.min(1, cosElbow));
        const elbowOffsetAngle = Math.acos(cosElbow);

        // Calculate Elbow Joint Position
        const elbowAngle = targetAngleRad - elbowOffsetAngle;
        this.elbowPos.x = sx + Math.cos(elbowAngle) * l1;
        this.elbowPos.y = sy + Math.sin(elbowAngle) * l1;

        // Hand Position strictly locked inside Outer Arc
        this.handPos.x = sx + Math.cos(targetAngleRad) * dist;
        this.handPos.y = sy + Math.sin(targetAngleRad) * dist;
    }

    public update(dt: number, mouseX: number, mouseY: number, ball: Ball): void {
        this.updateJointsFromShoulder();

        // Once ball is released, record red trajectory path
        if (this.isBallReleased) {
            if (ball.isActive) {
                this.ballDebugTrajectory.push({ x: ball.pos.x, y: ball.pos.y });
            }
            return;
        }

        if (this.isMouseInside(mouseX, mouseY)) {
            // Record black pencil line for mouse path
            this.mouseDebugTrail.push({ x: mouseX, y: mouseY });
            let firstFrame = false;
            if (this.isFirstFrameInBox) {
                this.prevMouseX = mouseX;
                this.prevMouseY = mouseY;
                this.prevStepDist = 0;
                this.currentArmAngleRad = Math.atan2(mouseY - this.shoulderPos.y, mouseX - this.shoulderPos.x);
                this.armAngularVelocity = 0;
                this.isFirstFrameInBox = false;
                firstFrame = true;
                this.mouseDebugTrail = [];
                this.ballDebugTrajectory = [];
                this.isMouseIntersected = false;
            }

            const sx = this.shoulderPos.x;
            const sy = this.shoulderPos.y;
            const mouseDist = Math.hypot(mouseX - sx, mouseY - sy);
            const mouseAngleRad = Math.atan2(mouseY - sy, mouseX - sx);

            let mouseAngleDeg = mouseAngleRad * (180 / Math.PI);
            if (mouseAngleDeg < 0) mouseAngleDeg += 360;

            const maxReach = getArcRadius(mouseAngleDeg, bowlerOuterArcData);
            const mouseMaxReach = maxReach + 50; // Mouse Outer Arc is +50px larger than Ball Outer Arc
            const minReach = getArcRadius(mouseAngleDeg, bowlerInnerArcData);

            // 1. 100% DIRECT HARD MOUSE STICK (Zero Jitter / Zero Offset!)
            let targetHandX = mouseX;
            let targetHandY = mouseY;

            if (mouseDist > maxReach) {
                const borderR = maxReach - 1;
                targetHandX = sx + Math.cos(mouseAngleRad) * borderR;
                targetHandY = sy + Math.sin(mouseAngleRad) * borderR;
            } else if (mouseDist < minReach) {
                targetHandX = sx + Math.cos(mouseAngleRad) * minReach;
                targetHandY = sy + Math.sin(mouseAngleRad) * minReach;
            }

            const targetRad = Math.atan2(targetHandY - sy, targetHandX - sx);
            
            let prevAngularError = targetRad - this.currentArmAngleRad;
            while (prevAngularError > Math.PI) prevAngularError -= Math.PI * 2;
            while (prevAngularError < -Math.PI) prevAngularError += Math.PI * 2;
            this.armAngularVelocity = (prevAngularError / (dt > 0 ? dt : 0.016)) * 0.88;

            // Calculate Frame-by-Frame Mouse Rotation Angular Delta
            let deltaMouseAngle = targetRad - this.prevTargetRad;
            while (deltaMouseAngle > Math.PI) deltaMouseAngle -= Math.PI * 2;
            while (deltaMouseAngle < -Math.PI) deltaMouseAngle += Math.PI * 2;

            if (firstFrame) {
                deltaMouseAngle = 0; // Prevent huge jump from previous swing's release angle
            }

            // Shift Rules:
            // In canvas, Anti-Clockwise means angle decreases (deltaMouseAngle < 0).
            // A negative delta * shiftSpeed creates a negative shiftStep, which subtracts from centerShiftX, moving it LEFT.
            // Clockwise rotation (delta > 0) creates positive shiftStep, moving it RIGHT.
            if (Math.abs(deltaMouseAngle) > 0.001) {
                const shiftStep = deltaMouseAngle * this.centerShiftSpeed * (dt > 0 ? dt : 0.016);
                this.centerShiftX = Math.max(-this.MAX_CENTER_SHIFT_X, Math.min(this.MAX_CENTER_SHIFT_X, this.centerShiftX + shiftStep));
                this.updateJointsFromShoulder();
            }

            this.prevTargetRad = targetRad;
            this.currentArmAngleRad = targetRad;

            // Solve Inverse Kinematics directly to targetHandX, targetHandY
            this.solveInverseKinematics(targetHandX, targetHandY);

            ball.pos.x = this.handPos.x;
            ball.pos.y = this.handPos.y;
            ball.prevPos.x = this.handPos.x;
            ball.prevPos.y = this.handPos.y;
            ball.vel.x = 0;
            ball.vel.y = 0;
            ball.isActive = true;

            // Record target point in Circular Queue Buffer (Capacity = 100)
            this.circularMouseQueue.push({ x: targetHandX, y: targetHandY });

            // Record red trajectory path before release during arm swing
            this.ballDebugTrajectory.push({ x: this.handPos.x, y: this.handPos.y });

            // 2. Mouse Velocity & Trajectory Queue Tracking
            const handRadius = Math.hypot(this.handPos.x - sx, this.handPos.y - sy);
            const currentTangentialVelocity = Math.abs(this.armAngularVelocity) * handRadius;

            const mdx = mouseX - this.prevMouseX;
            const mdy = mouseY - this.prevMouseY;
            const currentMouseSpeed = (dt > 0) ? (Math.hypot(mdx, mdy) / dt) : 0;

            this.mousePositionQueue.push({ x: mouseX, y: mouseY });
            if (this.mousePositionQueue.length > this.QUEUE_SIZE) {
                this.mousePositionQueue.shift();
            }

            if (currentMouseSpeed > this.MOUSE_STILL_THRESHOLD) {
                this.peakRotationalVelocity = Math.max(this.peakRotationalVelocity, currentTangentialVelocity);
            }

            const currentAngularSpeed = Math.abs(this.armAngularVelocity);
            if (currentAngularSpeed > 1.2) {
                this.accumulatedMomentum = Math.min(1.0, this.accumulatedMomentum + (currentAngularSpeed * dt * 0.4));
            } else {
                this.accumulatedMomentum = Math.max(0, this.accumulatedMomentum - dt * 0.5);
            }

            let armAngleDeg = this.currentArmAngleRad * (180 / Math.PI);
            if (armAngleDeg < 0) armAngleDeg += 360;

            // 3. TWO-STAGE VERTICAL RELEASE LINE TRIGGER
            // STAGE 1: Mouse intersects Vertical Release Line -> Calculate and LOCK Release Speed!
            if (!this.isMouseIntersected && mouseX <= this.releaseLineX) {
                let avgMouseSpeed = 1200;
                if (this.mousePositionQueue.length >= 2) {
                    let totalDist = 0;
                    for (let i = 1; i < this.mousePositionQueue.length; i++) {
                        const p1 = this.mousePositionQueue[i - 1];
                        const p2 = this.mousePositionQueue[i];
                        totalDist += Math.hypot(p2.x - p1.x, p2.y - p1.y);
                    }
                    const frameCount = this.mousePositionQueue.length - 1;
                    const avgStepDist = totalDist / frameCount;
                    avgMouseSpeed = (dt > 0) ? (avgStepDist / dt) : (avgStepDist * 60);
                }

                const launchSpeed = avgMouseSpeed;
                this.savedReleaseSpeed = launchSpeed;
                this.isMouseIntersected = true;
            }

            // STAGE 2: Ball reaches Vertical Release Line -> INSTANT SEAMLESS BALL RELEASE!
            if (this.isMouseIntersected && this.handPos.x <= this.releaseLineX) {
                // Calculate INSTANTANEOUS Tangential Release Angle at exact release frame (Zero Kink!)
                let releaseAngleRad = Math.atan2(
                    this.handPos.y - this.prevMouseY,
                    this.handPos.x - this.prevMouseX
                );

                if (this.mousePositionQueue.length >= 3) {
                    const p1 = this.mousePositionQueue[this.mousePositionQueue.length - 3];
                    const p2 = this.mousePositionQueue[this.mousePositionQueue.length - 1];
                    const qdx = p2.x - p1.x;
                    const qdy = p2.y - p1.y;
                    if (Math.hypot(qdx, qdy) > 1.0) {
                        releaseAngleRad = Math.atan2(qdy, qdx);
                    }
                }

                let releaseAngleDeg = releaseAngleRad * (180 / Math.PI);
                if (releaseAngleDeg < 0) releaseAngleDeg += 360;

                this.savedReleaseAngleDeg = releaseAngleDeg;
                ball.throwBall(this.handPos.x, this.handPos.y, this.savedReleaseSpeed, releaseAngleDeg);
                this.ballDebugTrajectory.push({ x: this.handPos.x, y: this.handPos.y });

                this.lastReleaseInfo = {
                    posX: Math.round(this.handPos.x),
                    posY: Math.round(this.handPos.y),
                    velX: Math.round(ball.vel.x),
                    velY: Math.round(ball.vel.y),
                    speed: Math.round(this.savedReleaseSpeed),
                    angle: Math.round(this.savedReleaseAngleDeg),
                    timestamp: Date.now()
                };

                this.isBallReleased = true;
                this.isFirstFrameInBox = true;
                this.peakRotationalVelocity = 0;
                this.prevMouseX = mouseX;
                this.prevMouseY = mouseY;
                return;
            }

            this.prevMouseX = mouseX;
            this.prevMouseY = mouseY;
        } else {
            // Mouse is outside bowling area -> Rest arm at default position
            this.solveInverseKinematics(this.shoulderPos.x, this.shoulderPos.y - 120);

            ball.pos.x = this.handPos.x;
            ball.pos.y = this.handPos.y;
            ball.prevPos.x = this.handPos.x;
            ball.prevPos.y = this.handPos.y;
            ball.vel.x = 0;
            ball.vel.y = 0;
            ball.isActive = true;

            this.accumulatedMomentum = 0;
            this.prevStepDist = 0;
            this.isFirstFrameInBox = true;
        }
    }

    public draw(ctx: CanvasRenderingContext2D): void {
        ctx.save();

        const boxX = this.x;
        const boxY = this.y;
        const boxW = this.width;
        const boxH = this.height;
        const sx = this.shoulderPos.x;
        const sy = this.shoulderPos.y;

        // 0. DRAW VERTICAL RELEASE LINE
        const vLineX = this.releaseLineX;
        ctx.save();
        ctx.strokeStyle = "#38bdf8"; // Bright glowing cyan line
        ctx.lineWidth = 3.0;
        ctx.shadowColor = "#38bdf8";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(vLineX, boxY);
        ctx.lineTo(vLineX, boxY + boxH);
        ctx.stroke();
        ctx.restore();

        // 1. DRAW OUTER ARC STRICTLY USING VALUES FROM bowler_outer_arc.json
        ctx.strokeStyle = "#0ea5e9"; // Cyan outer arc
        ctx.lineWidth = 2.2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();

        let firstPoint = true;
        for (let a = 0; a <= 360; a += 3) {
            const r = getArcRadius(a, bowlerOuterArcData);
            const rad = (a * Math.PI) / 180;
            const px = sx + Math.cos(rad) * r;
            const py = sy + Math.sin(rad) * r;

            if (firstPoint) {
                ctx.moveTo(px, py);
                firstPoint = false;
            } else {
                ctx.lineTo(px, py);
            }
        }
        ctx.closePath();
        ctx.stroke();

        // 1B. DRAW MOUSE OUTER ARC (+50px larger than Ball Outer Arc)
        ctx.strokeStyle = "rgba(56, 189, 248, 0.5)"; // Dashed sky blue mouse outer arc
        ctx.lineWidth = 1.6;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();

        firstPoint = true;
        for (let a = 0; a <= 360; a += 3) {
            const r = getArcRadius(a, bowlerOuterArcData) + 50;
            const rad = (a * Math.PI) / 180;
            const px = sx + Math.cos(rad) * r;
            const py = sy + Math.sin(rad) * r;

            if (firstPoint) {
                ctx.moveTo(px, py);
                firstPoint = false;
            } else {
                ctx.lineTo(px, py);
            }
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        // 5. DRAW INNER ARC STRICTLY USING VALUES FROM bowler_inner_arc.json
        ctx.strokeStyle = "rgba(245, 158, 11, 0.75)"; // Amber inner arc
        ctx.lineWidth = 1.8;
        ctx.beginPath();

        firstPoint = true;
        for (let a = 0; a <= 360; a += 3) {
            const r = getArcRadius(a, bowlerInnerArcData);
            const rad = (a * Math.PI) / 180;
            const px = sx + Math.cos(rad) * r;
            const py = sy + Math.sin(rad) * r;

            if (firstPoint) {
                ctx.moveTo(px, py);
                firstPoint = false;
            } else {
                ctx.lineTo(px, py);
            }
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        // 6. DRAW DEDICATED DELIVERY RELEASE ARC ZONE (Glowing Emerald Sector)
        const startRad = (this.releaseStartAngleDeg * Math.PI) / 180;
        const endRad = (this.releaseEndAngleDeg * Math.PI) / 180;

        ctx.fillStyle = "rgba(34, 197, 94, 0.15)";
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        
        // Draw release sector outer curve using JSON radii
        for (let a = this.releaseStartAngleDeg; a <= this.releaseEndAngleDeg; a += 2) {
            const r = getArcRadius(a, bowlerOuterArcData);
            const rad = (a * Math.PI) / 180;
            const px = sx + Math.cos(rad) * r;
            const py = sy + Math.sin(rad) * r;
            ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Release Zone Label
        ctx.font = "bold 11px sans-serif";
        ctx.fillStyle = "#4ade80";
        ctx.fillText("RELEASE ZONE", sx - 85, sy - 85);

        // 7. DRAW SKELETAL BOWLER ARM (Shoulder -> Elbow -> Hand)
        // Upper Arm (Shoulder to Elbow)
        ctx.strokeStyle = "#fbbf24"; // Amber Bicep
        ctx.lineWidth = 5.0;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(this.elbowPos.x, this.elbowPos.y);
        ctx.stroke();

        // Forearm (Elbow to Hand)
        ctx.strokeStyle = "#38bdf8"; // Cyan Forearm
        ctx.lineWidth = 4.0;
        ctx.beginPath();
        ctx.moveTo(this.elbowPos.x, this.elbowPos.y);
        ctx.lineTo(this.handPos.x, this.handPos.y);
        ctx.stroke();

        // Joints (Shoulder & Elbow Knots)
        ctx.fillStyle = "#ef4444"; // Red Shoulder Joint
        ctx.beginPath();
        ctx.arc(sx, sy, 6, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = "#f59e0b"; // Orange Elbow Joint
        ctx.beginPath();
        ctx.arc(this.elbowPos.x, this.elbowPos.y, 5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = "#38bdf8"; // Hand Joint
        ctx.beginPath();
        ctx.arc(this.handPos.x, this.handPos.y, 4, 0, 2 * Math.PI);
        ctx.fill();

        // 8. Instruction Subtext
        ctx.font = "10px sans-serif";
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.fillText("SWING ARM INTO RELEASE ZONE & WHIP TO RELEASE | 'R' RESET", boxX + boxW / 2, boxY + boxH - 10);

        // 9. Real-Time Momentum Bar
        const barX = boxX + 20;
        const barY = boxY + boxH - 26;
        const barW = boxW - 40;
        const barH = 7;

        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.fillRect(barX, barY, barW, barH);

        if (this.accumulatedMomentum > 0.02) {
            const fillWidth = barW * this.accumulatedMomentum;
            let barColor = "#22c55e";
            if (this.accumulatedMomentum > 0.7) barColor = "#ef4444";
            else if (this.accumulatedMomentum > 0.4) barColor = "#eab308";

            ctx.fillStyle = barColor;
            ctx.shadowColor = barColor;
            ctx.shadowBlur = 8;
            ctx.fillRect(barX, barY, fillWidth, barH);
            ctx.shadowBlur = 0;
        }

        // 10. DRAW BLACK PENCIL MOUSE TRAIL
        if (this.mouseDebugTrail.length >= 2) {
            ctx.save();
            ctx.strokeStyle = "#000000"; // Black pencil line
            ctx.lineWidth = 2.0;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(this.mouseDebugTrail[0].x, this.mouseDebugTrail[0].y);
            for (let i = 1; i < this.mouseDebugTrail.length; i++) {
                ctx.lineTo(this.mouseDebugTrail[i].x, this.mouseDebugTrail[i].y);
            }
            ctx.stroke();
            ctx.restore();
        }

        // 11. DRAW RED BALL TRAJECTORY TRAIL ON RELEASE
        if (this.ballDebugTrajectory.length >= 2) {
            ctx.save();
            ctx.strokeStyle = "#ff0000"; // Red ball trajectory line
            ctx.lineWidth = 3.0;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(this.ballDebugTrajectory[0].x, this.ballDebugTrajectory[0].y);
            for (let i = 1; i < this.ballDebugTrajectory.length; i++) {
                ctx.lineTo(this.ballDebugTrajectory[i].x, this.ballDebugTrajectory[i].y);
            }
            ctx.stroke();
            ctx.restore();
        }

        // 12. DRAW RELEASE SPEED HUD DISPLAY BANNER
        if (this.lastReleaseInfo) {
            const speedKmh = Math.round(this.lastReleaseInfo.speed / 35);
            const hudText = `⚡ RELEASE SPEED: ${this.lastReleaseInfo.speed} px/s (${speedKmh} km/h) | ANGLE: ${this.lastReleaseInfo.angle}°`;
            
            ctx.save();
            const hudX = boxX + boxW / 2 - 140;
            const hudY = boxY + 12;
            const hudW = 280;
            const hudH = 30;

            ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
            ctx.strokeStyle = "#facc15"; // Golden glow border
            ctx.lineWidth = 2.0;

            ctx.beginPath();
            ctx.roundRect(hudX, hudY, hudW, hudH, 8);
            ctx.fill();
            ctx.stroke();

            ctx.font = "bold 12px sans-serif";
            ctx.fillStyle = "#facc15"; // Yellow glowing speed text
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(hudText, boxX + boxW / 2, hudY + hudH / 2);
            ctx.restore();
        }

        ctx.restore();
    }
}
