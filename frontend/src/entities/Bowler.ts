import { CANVAS_HEIGHT, GROUND_HEIGHT, PLAYER_LENGTH_FACTOR } from "../game/constants";

export interface Vec2 {
    x: number;
    y: number;
}

export class Bowler {
    // 1. Dimensions (Jo humne upar dekhe)
    public readonly TOTAL_RIGHT_ARM_LENGTH = 3.4 * PLAYER_LENGTH_FACTOR;
    public readonly TOTAL_LEFT_ARM_LENGTH = 3.5 * PLAYER_LENGTH_FACTOR;

    public readonly FRONT_UPPER_ARM = this.TOTAL_LEFT_ARM_LENGTH * 0.4366;
    public readonly FRONT_LOWER_ARM = this.TOTAL_LEFT_ARM_LENGTH - this.FRONT_UPPER_ARM;

    public readonly BACK_UPPER_ARM = this.TOTAL_RIGHT_ARM_LENGTH * 0.4366;
    public readonly BACK_LOWER_ARM = this.TOTAL_RIGHT_ARM_LENGTH - this.BACK_UPPER_ARM;

    public readonly FULL_LEG_LENGTH = 5.2 * PLAYER_LENGTH_FACTOR;
    public readonly THIGH_LENGTH = this.FULL_LEG_LENGTH * 0.5;
    public readonly SHIN_LENGTH = this.FULL_LEG_LENGTH - this.THIGH_LENGTH;

    public readonly NECK_TO_HIP_LENGTH = 3.4 * PLAYER_LENGTH_FACTOR;
    public readonly SHOULDER_JOINT_OFFSET = 68;
    public readonly LEG_WIDTH_AT_HIP = 44;

// --- POSITIONS ---
    public currentHipPosition: Vec2;
    public currentLeftHipPosition: Vec2 = { x: 0, y: 0 };
    public currentRightHipPosition: Vec2 = { x: 0, y: 0 };
    public shoulderMid: Vec2 = { x: 0, y: 0 };
    public frontShoulder: Vec2 = { x: 0, y: 0 };
    public backShoulder: Vec2 = { x: 0, y: 0 };
    public leftKnee: Vec2 = { x: 0, y: 0 };
    public rightKnee: Vec2 = { x: 0, y: 0 };
    public leftAnkle: Vec2 = { x: 0, y: 0 };
    public rightAnkle: Vec2 = { x: 0, y: 0 };
    public headCenter: Vec2 = { x: 0, y: 0 };
    // Ellipse Offset Radii for 2.5D Depth
    public shoulderRx = this.SHOULDER_JOINT_OFFSET / 2;
    public hipRx = this.LEG_WIDTH_AT_HIP / 2;

    // --- BOWLING & RUNNING STATES ---
    public isRunning: boolean = true; // Auto-start running mode
    public runSpeed: number = 220;    // Running speed in px/s
    public stridePhase: number = 0;   // Gait cycle tracker
    public strideFrequency: number = 10; // Gait frequency (steps speed)

    constructor(startX = 1100) {
        this.currentHipPosition = {
            x: startX,
            y: (CANVAS_HEIGHT - GROUND_HEIGHT - this.FULL_LEG_LENGTH) / 0.97
        };
        this.setInitialRunPose();
    }

    public update(dt: number): void {
        if (this.isRunning) {
            this.updateRunPose(dt);
        }
    }

    // 🏃 Dynamic Non-Linear Biomechanical Running Physics
    public updateRunPose(dt: number): void {
        // 1. Stride Phase advancement
        this.stridePhase += this.strideFrequency * dt;

        // 2. Non-linear Ground Push-off Impulse (Forward Acceleration Surge)
        // Impulse peaks when trailing leg pushes off ground
        const pushImpulse = Math.pow(Math.max(0, Math.sin(this.stridePhase * 2)), 2) * 90;
        const dynamicSpeed = this.runSpeed + pushImpulse;

        this.currentHipPosition.x -= dynamicSpeed * dt;

        // Reset bowler position if he runs off left screen (looping test)
        if (this.currentHipPosition.x < 150) {
            this.currentHipPosition.x = 1100;
        }

        // 3. Dynamic Hip Bobbing & Flight Phase (Airborne Float)
        const baseHipY = (CANVAS_HEIGHT - GROUND_HEIGHT - this.FULL_LEG_LENGTH) / 0.97;
        // Non-linear vertical curve (sharp drop on impact, float at peak)
        const verticalCurve = Math.pow(Math.sin(this.stridePhase * 2), 2);
        const hipBob = verticalCurve * 10; 
        this.currentHipPosition.y = baseHipY + hipBob;

        const hip = this.currentHipPosition;

        // 4. Dynamic Pelvis 3D Twist (Hip width expands during full stride, narrows on crossover)
        const strideExtension = Math.abs(Math.sin(this.stridePhase));
        const dynamicHipOffset = 4 + strideExtension * 8; // 4px to 12px dynamic depth shift

        this.currentLeftHipPosition = { x: hip.x - dynamicHipOffset, y: hip.y };
        this.currentRightHipPosition = { x: hip.x + dynamicHipOffset, y: hip.y };

        // 5. Dynamic Spine & Torso Forward Lean (Snaps forward during push-off)
        const baseForwardLean = -0.35; // ~20 deg
        const leanImpulse = -0.08 * Math.pow(Math.max(0, Math.sin(this.stridePhase)), 2);
        const forwardLeanAngle = baseForwardLean + leanImpulse;

        this.shoulderMid = {
            x: hip.x + Math.sin(forwardLeanAngle) * this.NECK_TO_HIP_LENGTH,
            y: hip.y - Math.cos(forwardLeanAngle) * this.NECK_TO_HIP_LENGTH
        };

        this.frontShoulder = { x: this.shoulderMid.x - 10, y: this.shoulderMid.y };
        this.backShoulder = { x: this.shoulderMid.x + 10, y: this.shoulderMid.y };
        this.headCenter = { x: this.shoulderMid.x - 5, y: this.shoulderMid.y - 20 };

        // 6. Non-Linear Snappy Leg Swing Easing (Power Curve)
        const rawLeftSin = Math.sin(this.stridePhase);
        const rawRightSin = Math.sin(this.stridePhase + Math.PI);

        // Snappy power curve: Math.sign(s) * Math.pow(|s|, 0.7)
        const snappyLeftSwing = Math.sign(rawLeftSin) * Math.pow(Math.abs(rawLeftSin), 0.75) * 0.70 - 0.1;
        const snappyRightSwing = Math.sign(rawRightSin) * Math.pow(Math.abs(rawRightSin), 0.75) * 0.70 - 0.1;

        // 7. Dynamic Dual Knee Flexion (Forward Landing Flexion + Backward Recoil Fold)
        // A. Left Leg Knee Bending:
        let leftKneeFold = 0.1;
        if (rawLeftSin < 0) {
            // Forward Swing & Foot Contact Phase: Knee flexes forward (~0.65 rads)
            leftKneeFold = -0.55 * Math.sin(Math.abs(rawLeftSin) * Math.PI);
        } else {
            // Backward Recoil Phase: Knee folds high back (~1.65 rads)
            leftKneeFold = 1.65 * Math.pow(rawLeftSin, 1.3);
        }
        const leftKneeAngle = snappyLeftSwing + leftKneeFold;

        // B. Right Leg Knee Bending:
        let rightKneeFold = 0.1;
        if (rawRightSin < 0) {
            // Forward Swing & Foot Contact Phase
            rightKneeFold = -0.55 * Math.sin(Math.abs(rawRightSin) * Math.PI);
        } else {
            // Backward Recoil Phase
            rightKneeFold = 1.65 * Math.pow(rawRightSin, 1.3);
        }
        const rightKneeAngle = snappyRightSwing + rightKneeFold;

        // 8. Forward Kinematics for Knees & Ankles
        // Left Leg (Front)
        this.leftKnee = {
            x: this.currentLeftHipPosition.x + Math.sin(snappyLeftSwing) * this.THIGH_LENGTH,
            y: this.currentLeftHipPosition.y + Math.cos(snappyLeftSwing) * this.THIGH_LENGTH
        };
        this.leftAnkle = {
            x: this.leftKnee.x + Math.sin(leftKneeAngle) * this.SHIN_LENGTH,
            y: this.leftKnee.y + Math.cos(leftKneeAngle) * this.SHIN_LENGTH
        };

        // Right Leg (Back)
        this.rightKnee = {
            x: this.currentRightHipPosition.x + Math.sin(snappyRightSwing) * this.THIGH_LENGTH,
            y: this.currentRightHipPosition.y + Math.cos(snappyRightSwing) * this.THIGH_LENGTH
        };
        this.rightAnkle = {
            x: this.rightKnee.x + Math.sin(rightKneeAngle) * this.SHIN_LENGTH,
            y: this.rightKnee.y + Math.cos(rightKneeAngle) * this.SHIN_LENGTH
        };
    }


    public setInitialRunPose(): void {
        const hip = this.currentHipPosition;
        // 1. Hip Joint Offsets (Left hip front, Right hip back)
        this.currentLeftHipPosition = { x: hip.x - 8, y: hip.y };
        this.currentRightHipPosition = { x: hip.x + 8, y: hip.y };
        // 2. Spine & Torso (Forward Lean ~20°)
        const forwardLeanAngle = -0.55; // Forward lean angle in radians (~20 deg)
        this.shoulderMid = {
            x: hip.x + Math.sin(forwardLeanAngle) * this.NECK_TO_HIP_LENGTH,
            y: hip.y - Math.cos(forwardLeanAngle) * this.NECK_TO_HIP_LENGTH
        };
        this.frontShoulder = { x: this.shoulderMid.x - 10, y: this.shoulderMid.y };
        this.backShoulder = { x: this.shoulderMid.x + 10, y: this.shoulderMid.y };
        this.headCenter = { x: this.shoulderMid.x - 5, y: this.shoulderMid.y - 20 };
        // 3. Front Leg (Left Leg - Extended Forward)
        const leftThighAngle = -0.8; // Angled forward
        const leftKneeAngle = -0.0;  // Slightly bent at knee
        this.leftKnee = {
            x: this.currentLeftHipPosition.x + Math.sin(leftThighAngle) * this.THIGH_LENGTH,
            y: this.currentLeftHipPosition.y + Math.cos(leftThighAngle) * this.THIGH_LENGTH
        };
        this.leftAnkle = {
            x: this.leftKnee.x + Math.sin(leftKneeAngle) * this.SHIN_LENGTH,
            y: this.leftKnee.y + Math.cos(leftKneeAngle) * this.SHIN_LENGTH
        };
        // 4. Back Leg (Right Leg - Pushed Back & High Knee Bend matching reference photo)
        const rightThighAngle = .5;  // Angled far back towards right
        const rightKneeAngle = .8;   // Bent upwards & back towards right

        this.rightKnee = {
            x: this.currentRightHipPosition.x + Math.sin(rightThighAngle) * this.THIGH_LENGTH,
            y: this.currentRightHipPosition.y + Math.cos(rightThighAngle) * this.THIGH_LENGTH
        };

        this.rightAnkle = {
            x: this.rightKnee.x + Math.sin(rightKneeAngle) * this.SHIN_LENGTH,
            y: this.rightKnee.y + Math.cos(rightKneeAngle) * this.SHIN_LENGTH
        };
    }

    // 🔴 Draw Debug Skeleton (Only Spine + Hips + Legs + Joint Dots)
    public drawDebugSkeleton(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        // 1. Bone Lines (White)
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3.0;
        ctx.lineCap = "round";
        // Spine
        ctx.beginPath();
        ctx.moveTo(this.shoulderMid.x, this.shoulderMid.y);
        ctx.lineTo(this.currentHipPosition.x, this.currentHipPosition.y);
        ctx.stroke();
        // Shoulders & Pelvis bars
        ctx.beginPath();
        ctx.moveTo(this.frontShoulder.x, this.frontShoulder.y);
        ctx.lineTo(this.backShoulder.x, this.backShoulder.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(this.currentLeftHipPosition.x, this.currentLeftHipPosition.y);
        ctx.lineTo(this.currentRightHipPosition.x, this.currentRightHipPosition.y);
        ctx.stroke();
        // Left Leg (Front)
        ctx.beginPath();
        ctx.moveTo(this.currentLeftHipPosition.x, this.currentLeftHipPosition.y);
        ctx.lineTo(this.leftKnee.x, this.leftKnee.y);
        ctx.lineTo(this.leftAnkle.x, this.leftAnkle.y);
        ctx.stroke();
        // Right Leg (Back)
        ctx.beginPath();
        ctx.moveTo(this.currentRightHipPosition.x, this.currentRightHipPosition.y);
        ctx.lineTo(this.rightKnee.x, this.rightKnee.y);
        ctx.lineTo(this.rightAnkle.x, this.rightAnkle.y);
        ctx.stroke();
        // 2. Cyan Joint Dots
        const joints: Vec2[] = [
            this.headCenter,
            this.shoulderMid,
            this.frontShoulder,
            this.backShoulder,
            this.currentHipPosition,
            this.currentLeftHipPosition,
            this.currentRightHipPosition,
            this.leftKnee,
            this.rightKnee,
            this.leftAnkle,
            this.rightAnkle
        ];
        ctx.fillStyle = "#00d8ff";
        for (const j of joints) {
            ctx.beginPath();
            ctx.arc(j.x, j.y, 4.5, 0, 2 * Math.PI);
            ctx.fill();
        }
        ctx.restore();
    }
}