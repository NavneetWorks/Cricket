import { CANVAS_HEIGHT, GROUND_HEIGHT, PLAYER_LENGTH_FACTOR } from "../game/constants";

export interface Vec2 {
    x: number;
    y: number;
}

// ─────────────────────────────────────────────────────────────────────────────
//  BOWLING RUN-UP – Biomechanically Accurate Gait System
//  Based on frame-by-frame analysis of screenshots 1.png → 7.png
//
//  COORDINATE CONVENTION:
//    x  → positive = right on canvas (bowler runs LEFT, so x decreases)
//    y  → positive = DOWN  (0 = top)
//
//  THIGH ANGLE  (relative to global vertical, i.e. straight-down = 0):
//    negative  = leg swings FORWARD (knee ahead of hip)
//    positive  = leg extends BACKWARD (knee behind hip)
//
//  KNEE FOLD    (local bend ADDED to thigh angle, always ≥ 0):
//    0 = fully straight   |  π = fully folded (shin points up)
//
//  ANKLE DIRECTION: shin terminus always computed from knee forward.
// ─────────────────────────────────────────────────────────────────────────────
//  EXPLICIT KEYFRAME ARCHITECTURE (DEGREES)
// ─────────────────────────────────────────────────────────────────────────────

export interface KeyframePose {
    // 4. Spine
    spineAngleDeg: number;         // Absolute angle wrt positive X axis. (e.g. -90 = straight up, -110 = leaning left)
    
    // 1. Shoulders
    shoulderJointDist: number;     // Distance between left and right shoulder
    shoulderJointAngleDeg: number; // Angle relative to spine clockwise. (90 = perpendicular)
    
    // 2. Arms
    leftUpperArmAngleDeg: number;  // Angle relative to shoulder line clockwise
    leftElbowAngleDeg: number;     // Angle relative to left upper arm clockwise
    rightUpperArmAngleDeg: number; // Angle relative to shoulder line clockwise
    rightElbowAngleDeg: number;    // Angle relative to right upper arm clockwise
    
    // 5. Pelvis
    pelvisJointDist: number;       // Distance between left and right hip
    pelvisJointAngleDeg: number;   // Angle relative to spine clockwise. (90 = perpendicular)
    
    // 6. Thighs
    leftThighAngleDeg: number;     // Angle relative to pelvis line clockwise
    rightThighAngleDeg: number;    // Angle relative to pelvis line clockwise
    
    // 7. Knees
    leftKneeAngleDeg: number;      // Angle relative to left thigh clockwise
    rightKneeAngleDeg: number;     // Angle relative to right thigh clockwise

    // Body height offset
    hipYOffset: number;         // Offset from ground
}

export class Bowler {

    // ── Segment lengths ────────────────────────────────────────────────────
    public readonly TOTAL_RIGHT_ARM_LENGTH = 3.4 * PLAYER_LENGTH_FACTOR;
    public readonly TOTAL_LEFT_ARM_LENGTH  = 3.5 * PLAYER_LENGTH_FACTOR;

    public readonly FRONT_UPPER_ARM = this.TOTAL_LEFT_ARM_LENGTH  * 0.5;
    public readonly FRONT_LOWER_ARM = this.TOTAL_LEFT_ARM_LENGTH  - this.FRONT_UPPER_ARM;
    public readonly BACK_UPPER_ARM  = this.TOTAL_RIGHT_ARM_LENGTH * 0.5;
    public readonly BACK_LOWER_ARM  = this.TOTAL_RIGHT_ARM_LENGTH - this.BACK_UPPER_ARM;

    public readonly FULL_LEG_LENGTH     = 5.2 * PLAYER_LENGTH_FACTOR;
    public readonly THIGH_LENGTH        = this.FULL_LEG_LENGTH * 0.50;
    public readonly SHIN_LENGTH         = this.FULL_LEG_LENGTH - this.THIGH_LENGTH;

    public readonly NECK_TO_HIP_LENGTH  = 3.4 * PLAYER_LENGTH_FACTOR;
    
    // ── World positions (computed every frame) ────────────────────────────
    public currentHipPosition:      Vec2 = { x: 0, y: 0 };
    public currentLeftHipPosition:  Vec2 = { x: 0, y: 0 };
    public currentRightHipPosition: Vec2 = { x: 0, y: 0 };
    public shoulderMid:   Vec2 = { x: 0, y: 0 };
    public frontShoulder: Vec2 = { x: 0, y: 0 };
    public backShoulder:  Vec2 = { x: 0, y: 0 };
    public headCenter:    Vec2 = { x: 0, y: 0 };
    public leftKnee:      Vec2 = { x: 0, y: 0 };
    public rightKnee:     Vec2 = { x: 0, y: 0 };
    public leftAnkle:     Vec2 = { x: 0, y: 0 };
    public rightAnkle:    Vec2 = { x: 0, y: 0 };
    
    public leftElbow:     Vec2 = { x: 0, y: 0 };
    public rightElbow:    Vec2 = { x: 0, y: 0 };
    public leftWrist:     Vec2 = { x: 0, y: 0 };
    public rightWrist:    Vec2 = { x: 0, y: 0 };

    // ── Running state ──────────────────────────────────────────────────────
    public isRunning: boolean = false;
    
    // Normalized speed: 0.0 (idle) to 1.0 (max sprint)
    public runIntensity: number = 0;
    public targetIntensity: number = 0;

    public stridePhase: number = 0;
    public strideFrequency: number = 1.9;

    public startRunning(): void {
        this.isRunning = true;
        this.targetIntensity = 1.0;
    }

    public resetToIdle(): void {
        this.isRunning = false;
        this.targetIntensity = 0.0;
        this.runIntensity = 0.0;
        this.stridePhase = 0;
        this.leftAnkleLock = null;
        this.rightAnkleLock = null;
        this.currentHipPosition.x = 1100;
        this.setInitialRunPose();
    }

    // ── Ankle planting (foot doesn't slide on ground) ─────────────────────
    private leftAnkleLock:  Vec2 | null = null;
    private rightAnkleLock: Vec2 | null = null;

    // ─────────────────────────────────────────────────────────────────────────
    //  STATIC 13 FRAMES ARRAY (Populated with initial values)
    // ─────────────────────────────────────────────────────────────────────────
    public static readonly STATIC_FRAMES: KeyframePose[] = [
        {
            // FRAME 1: Left Heel Strike
            spineAngleDeg: -130,           
            shoulderJointDist: 40,
            shoulderJointAngleDeg: 100,     
            leftUpperArmAngleDeg: 98,     
            leftElbowAngleDeg: 100,        
            rightUpperArmAngleDeg: 23,    
            rightElbowAngleDeg: 77,        
            pelvisJointDist: 10,           
            pelvisJointAngleDeg: 100,       
            leftThighAngleDeg: 160,        
            rightThighAngleDeg: 80,        
            leftKneeAngleDeg: -45,          
            rightKneeAngleDeg: -30,         
            hipYOffset: -10
        },
        {
            // FRAME 2
            spineAngleDeg: -124,           
            shoulderJointDist: 50,
            shoulderJointAngleDeg: 105,     
            leftUpperArmAngleDeg: 90,     
            leftElbowAngleDeg: 45,        
            rightUpperArmAngleDeg: 33,    
            rightElbowAngleDeg: 70,        
            pelvisJointDist: 10,           
            pelvisJointAngleDeg: 100,       
            leftThighAngleDeg: 150,        
            rightThighAngleDeg: 85,        
            leftKneeAngleDeg: -30,          
            rightKneeAngleDeg: -60,         
            hipYOffset: -10
        },
        {
            // FRAME 3
            spineAngleDeg: -120,           
            shoulderJointDist: 50,
            shoulderJointAngleDeg: 105,     
            leftUpperArmAngleDeg: 70,     
            leftElbowAngleDeg: 30,        
            rightUpperArmAngleDeg: 50,    
            rightElbowAngleDeg: 70,        
            pelvisJointDist: -10,           
            pelvisJointAngleDeg: 100,       
            leftThighAngleDeg: 130,        
            rightThighAngleDeg: 92,        
            leftKneeAngleDeg: -25,          
            rightKneeAngleDeg: -95,         
            hipYOffset: -15
        },
        {
            // FRAME 4
             spineAngleDeg: -130,           
            shoulderJointDist: 50,
            shoulderJointAngleDeg: 105,     
            leftUpperArmAngleDeg: 70,     
            leftElbowAngleDeg: 25,        
            rightUpperArmAngleDeg: 60,    
            rightElbowAngleDeg: 70,        
            pelvisJointDist: -25,           
            pelvisJointAngleDeg: 100,       
            leftThighAngleDeg: 140,        
            rightThighAngleDeg: 110,        
            leftKneeAngleDeg: -30,          
            rightKneeAngleDeg: -110,         
            hipYOffset: -12
        },
        {
            // FRAME 5
             spineAngleDeg: -135,           
            shoulderJointDist: 40,
            shoulderJointAngleDeg: 125,     
            leftUpperArmAngleDeg: 50,     
            leftElbowAngleDeg: 80,        
            rightUpperArmAngleDeg: 70,    
            rightElbowAngleDeg: 75,        
            pelvisJointDist: -30,           
            pelvisJointAngleDeg: 130,       
            leftThighAngleDeg: 110,        
            rightThighAngleDeg: 115,        
            leftKneeAngleDeg: -30,          
            rightKneeAngleDeg: -125,         
            hipYOffset: -16
        },
        {
            // FRAME 6
            spineAngleDeg: -125,           
            shoulderJointDist: 30,
            shoulderJointAngleDeg: 130,     
            leftUpperArmAngleDeg: 40,     
            leftElbowAngleDeg: 120,        
            rightUpperArmAngleDeg: 70,    
            rightElbowAngleDeg: 50,        
            pelvisJointDist: -30,           
            pelvisJointAngleDeg: 130,       
            leftThighAngleDeg: 85,        
            rightThighAngleDeg: 130,        
            leftKneeAngleDeg: -30,          
            rightKneeAngleDeg: -125,         
            hipYOffset: -16
        },
        {
            // FRAME 7
            spineAngleDeg: -125,           
            shoulderJointDist: 1,
            shoulderJointAngleDeg: 130,     
            leftUpperArmAngleDeg: 40,     
            leftElbowAngleDeg: 120,        
            rightUpperArmAngleDeg: 20,    
            rightElbowAngleDeg: 110,        
            pelvisJointDist: -30,           
            pelvisJointAngleDeg: 130,       
            leftThighAngleDeg: 60,        
            rightThighAngleDeg: 140,        
            leftKneeAngleDeg: -20,          
            rightKneeAngleDeg: -100,         
            hipYOffset: 0
        },
        {
            // FRAME 8
            spineAngleDeg: -115,           
            shoulderJointDist: 15,
            shoulderJointAngleDeg: 60,     
            leftUpperArmAngleDeg: 119,     
            leftElbowAngleDeg: 120,        
            rightUpperArmAngleDeg: 90,    
            rightElbowAngleDeg: 90,        
            pelvisJointDist: -30,           
            pelvisJointAngleDeg: 110,       
            leftThighAngleDeg: 60,        
            rightThighAngleDeg: 125,        
            leftKneeAngleDeg: -20,          
            rightKneeAngleDeg: -50,         
            hipYOffset: -10
        },
        {
            // FRAME 9
             spineAngleDeg: -120,           
            shoulderJointDist: 20,
            shoulderJointAngleDeg: 90,     
            leftUpperArmAngleDeg: 85,     
            leftElbowAngleDeg: 100,        
            rightUpperArmAngleDeg: 70,    
            rightElbowAngleDeg: 90,        
            pelvisJointDist: -30,           
            pelvisJointAngleDeg: 110,       
            leftThighAngleDeg: 70,        
            rightThighAngleDeg: 120,        
            leftKneeAngleDeg: -45,          
            rightKneeAngleDeg: -25,         
            hipYOffset: -20
        },
        {
            // FRAME 10
            spineAngleDeg: -120,           
            shoulderJointDist: 5,
            shoulderJointAngleDeg: 90,     
            leftUpperArmAngleDeg: 85,     
            leftElbowAngleDeg: 80,        
            rightUpperArmAngleDeg: 80,    
            rightElbowAngleDeg: 70,        
            pelvisJointDist: -30,           
            pelvisJointAngleDeg: 110,       
            leftThighAngleDeg: 80,        
            rightThighAngleDeg: 120,        
            leftKneeAngleDeg: -95,          
            rightKneeAngleDeg: -20,         
            hipYOffset: -20
        },
        {
            // FRAME 11
             spineAngleDeg: -120,           
            shoulderJointDist: 20,
            shoulderJointAngleDeg: 90,     
            leftUpperArmAngleDeg: 100,     
            leftElbowAngleDeg: 80,        
            rightUpperArmAngleDeg: 75,    
            rightElbowAngleDeg: 50,        
            pelvisJointDist: -30,           
            pelvisJointAngleDeg: 110,       
            leftThighAngleDeg: 100,        
            rightThighAngleDeg: 115,        
            leftKneeAngleDeg: -120,          
            rightKneeAngleDeg: -30,         
            hipYOffset: -20
        },
        {
            // FRAME 12
            spineAngleDeg: -120,           
            shoulderJointDist: 30,
            shoulderJointAngleDeg: 90,     
            leftUpperArmAngleDeg: 105,     
            leftElbowAngleDeg: 90,        
            rightUpperArmAngleDeg: 60,    
            rightElbowAngleDeg: 60,        
            pelvisJointDist: -20,           
            pelvisJointAngleDeg: 110,       
            leftThighAngleDeg: 110,        
            rightThighAngleDeg: 100,        
            leftKneeAngleDeg: -130,          
            rightKneeAngleDeg: -30,         
            hipYOffset: -20
        },
        {
            // FRAME 13
             spineAngleDeg: -120,           
            shoulderJointDist: 40,
            shoulderJointAngleDeg: 90,     
            leftUpperArmAngleDeg: 110,     
            leftElbowAngleDeg: 105,        
            rightUpperArmAngleDeg: 45,    
            rightElbowAngleDeg: 70,        
            pelvisJointDist: 5,           
            pelvisJointAngleDeg: 110,       
            leftThighAngleDeg: 150,        
            rightThighAngleDeg: 100,        
            leftKneeAngleDeg: -130,          
            rightKneeAngleDeg: -30,         
            hipYOffset: -20
        },
        {
            // FRAME 14
             spineAngleDeg: -115,           
            shoulderJointDist: 40,
            shoulderJointAngleDeg: 90,     
            leftUpperArmAngleDeg: 110,     
            leftElbowAngleDeg: 105,        
            rightUpperArmAngleDeg: 40,    
            rightElbowAngleDeg: 80,        
            pelvisJointDist: 5,           
            pelvisJointAngleDeg: 110,       
            leftThighAngleDeg: 150,        
            rightThighAngleDeg: 70,        
            leftKneeAngleDeg: -100,          
            rightKneeAngleDeg: -30,         
            hipYOffset: 0
        }
    ];

    // ─────────────────────────────────────────────────────────────────────────
    constructor(startX = 1100) {
        const baseHipY = this.baseHipY();
        this.currentHipPosition = { x: startX, y: baseHipY };
        this._rebuildUpperBody(this.currentHipPosition, -0.20);
        this._rebuildLegs();
    }

    // ─────────────────────────────────────────────────────────────────────────
    public update(dt: number): void {
        // Smoothly interpolate run intensity
        const accel = 1.5; // Smooth acceleration factor
        this.runIntensity += (this.targetIntensity - this.runIntensity) * accel * dt;

        if (this.runIntensity > 0.01) {
            this.updateRunPose(dt);
        } else if (this.targetIntensity === 0 && this.runIntensity > 0) {
            // Snap to zero to avoid micro-movements
            this.runIntensity = 0;
            this.setInitialRunPose();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  MAIN GAIT UPDATE
    // ─────────────────────────────────────────────────────────────────────────
    public updateRunPose(dt: number): void {

        // ── 1. Dynamic Freq & Stride based on Intensity ────────────────────
        // Walking freq ~0.8, Sprinting ~1.9
        this.strideFrequency = 0.8 + 1.1 * this.runIntensity;

        // ── 2. Advance stride phase ────────────────────────────────────────
        this.stridePhase = (this.stridePhase + this.strideFrequency * dt) % 1.0;
        const phase = this.stridePhase;

        // ── 3. Move body forward (left on canvas) ─────────────────────────
        // Walking stride len ~0.4, Sprinting ~0.95
        const strideLen = 2 * this.FULL_LEG_LENGTH * (0.4 + 0.55 * this.runIntensity);
        const horizontalSpeed = strideLen * this.strideFrequency;   // px/s
        this.currentHipPosition.x -= horizontalSpeed * dt;

        // Reset when off screen
        if (this.currentHipPosition.x < 100) {
            this.currentHipPosition.x = 1100;
            this.stridePhase = 0;
            this.leftAnkleLock  = null;
            this.rightAnkleLock = null;
        }

        // ── 4. Hip vertical bob ────────────────────────────────────────────
        //  Scale bob amplitude based on speed (walking has less bob)
        const bobPrimary   = -Math.cos(phase * Math.PI * 2) * (4 + 10 * this.runIntensity);   // ±4 to ±14 px
        const bobSecondary =  Math.cos(phase * Math.PI * 4) * (2 + 2.5 * this.runIntensity);  // ±2 to ±4.5 px
        const hipBob = bobPrimary + bobSecondary;
        
        // Hip lowers as speed increases
        const dynamicHipY = this.baseHipY() + (1 - this.runIntensity) * (this.FULL_LEG_LENGTH * 0.15);
        this.currentHipPosition.y = dynamicHipY + hipBob;

        const hip = this.currentHipPosition;

        // ── 5. Pelvis lateral sway ─────────────────────────────────────────
        const lateralSway = Math.sin(phase * Math.PI * 2) * (2 + 2 * this.runIntensity);
        this.currentLeftHipPosition  = { x: hip.x - 10 - lateralSway, y: hip.y };
        this.currentRightHipPosition = { x: hip.x + 10 + lateralSway, y: hip.y };

        // ── 6. Spine forward lean ──────────────────────────────────────────
        //  More lean at higher speeds
        const baseLean = -0.05 - 0.15 * this.runIntensity; 
        const pushSurge   = Math.exp(-Math.pow((phase - 0.30) / 0.10, 2)) * (0.04 * this.runIntensity);
        const spineAngle  = baseLean - pushSurge;
        this._rebuildUpperBody(hip, spineAngle);

        // ── 7. Sample gait keyframes for each leg ─────────────────────────
        const leftPose  = this._sampleGait(phase);
        const rightPose = this._sampleGait((phase + 0.5) % 1.0);

        // Interpolate poses based on intensity: at low speed, poses are less extreme
        const damp = 0.5 + 0.5 * this.runIntensity; // dampens angles by 50% when walking
        leftPose.thigh *= damp; leftPose.kneeFold *= damp;
        rightPose.thigh *= damp; rightPose.kneeFold *= damp;

        // ── 8. FK: hip → knee → ankle ─────────────────────────────────────
        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT;

        // LEFT leg
        const fkL = this._legFK(this.currentLeftHipPosition,  leftPose.thigh,  leftPose.kneeFold);
        let lKnee = fkL.knee, lAnkle = fkL.ankle;

        // RIGHT leg
        const fkR = this._legFK(this.currentRightHipPosition, rightPose.thigh, rightPose.kneeFold);
        let rKnee = fkR.knee, rAnkle = fkR.ankle;

        // ── 8. Ankle foot-plant lock (IK) ─────────────────────────────────
        //  When FK ankle reaches the ground → lock it in world-space.
        //  The body then passes OVER the planted foot (no sliding).
        //  Knee position is resolved with 2-bone IK each frame.
        const LOCK_TOLERANCE = 8; // px above ground to trigger lock

        // LEFT
        if (lAnkle.y >= groundY - LOCK_TOLERANCE) {
            if (!this.leftAnkleLock)
                this.leftAnkleLock = { x: lAnkle.x, y: groundY };
            const ik = this._legIK(this.currentLeftHipPosition, this.leftAnkleLock);
            lKnee  = ik.knee;
            lAnkle = this.leftAnkleLock;
        } else {
            this.leftAnkleLock = null;
        }

        // RIGHT
        if (rAnkle.y >= groundY - LOCK_TOLERANCE) {
            if (!this.rightAnkleLock)
                this.rightAnkleLock = { x: rAnkle.x, y: groundY };
            const ik = this._legIK(this.currentRightHipPosition, this.rightAnkleLock);
            rKnee  = ik.knee;
            rAnkle = this.rightAnkleLock;
        } else {
            this.rightAnkleLock = null;
        }

        // ── 9. Commit ──────────────────────────────────────────────────────
        this.leftKnee   = lKnee;
        this.leftAnkle  = lAnkle;
        this.rightKnee  = rKnee;
        this.rightAnkle = rAnkle;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    /** Neutral hip Y (no bob applied) */
    private baseHipY(): number {
        // Lowered from 0.96 to 0.83 for a deep sprinting crouch
        return CANVAS_HEIGHT - GROUND_HEIGHT - this.FULL_LEG_LENGTH * 0.83;
    }

    /** Interpolate gait keyframes with smoothstep easing */
    private _sampleGait(phase: number): { thigh: number; kneeFold: number } {
        // Fallback for procedural rendering to keep it working during transition
        return { thigh: -0.65, kneeFold: 0.10 };
    }

    /**
     * Forward Kinematics — 2-bone leg
     * thighAngle : vs global vertical (−=forward, +=backward)
     * kneeFold   : additive bend at knee joint (0=straight, π=folded fully)
     *
     * Shin always folds BEHIND the thigh direction (anatomically correct).
     * The shin direction angle = thighAngle + kneeFold.
     * Since kneeFold ≥ 0, shin angles MORE toward back/ground = correct knee-bend.
     */
    private _legFK(
        hip: Vec2, thighAngle: number, kneeFold: number
    ): { knee: Vec2; ankle: Vec2 } {
        const knee = {
            x: hip.x + Math.sin(thighAngle) * this.THIGH_LENGTH,
            y: hip.y + Math.cos(thighAngle) * this.THIGH_LENGTH,
        };
        // Shin direction: thighAngle + kneeFold (positive kneeFold bends knee backward)
        const shinAngle = thighAngle + kneeFold;
        const ankle = {
            x: knee.x + Math.sin(shinAngle) * this.SHIN_LENGTH,
            y: knee.y + Math.cos(shinAngle) * this.SHIN_LENGTH,
        };
        return { knee, ankle };
    }

    /**
     * Inverse Kinematics — 2-bone leg, knee bends FORWARD (in running direction)
     * Uses law of cosines.  Knee always prefers the forward-bent solution.
     */
    private _legIK(hip: Vec2, ankle: Vec2): { knee: Vec2 } {
        const dx = ankle.x - hip.x;
        const dy = ankle.y - hip.y;
        const dist = Math.min(Math.hypot(dx, dy), this.THIGH_LENGTH + this.SHIN_LENGTH - 1);

        const baseAngle = Math.atan2(dx, dy); // angle of hip→ankle vs vertical
        const cosAlpha  = (
            this.THIGH_LENGTH * this.THIGH_LENGTH +
            dist              * dist              -
            this.SHIN_LENGTH  * this.SHIN_LENGTH
        ) / (2 * this.THIGH_LENGTH * dist);
        const alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha)));

        // Knee forward → subtract alpha from baseAngle (knee pops to the left / fwd)
        const thighAngle = baseAngle - alpha;
        return {
            knee: {
                x: hip.x + Math.sin(thighAngle) * this.THIGH_LENGTH,
                y: hip.y + Math.cos(thighAngle) * this.THIGH_LENGTH,
            }
        };
    }

    /** Rebuild spine + shoulders + head from hip */
    private _rebuildUpperBody(hip: Vec2, spineAngle: number): void {
        // Spine runs from hip UPWARD at spineAngle vs vertical
        this.shoulderMid = {
            x: hip.x + Math.sin(spineAngle) * this.NECK_TO_HIP_LENGTH,
            y: hip.y - Math.cos(spineAngle) * this.NECK_TO_HIP_LENGTH,
        };
        // Shoulder bar: perpendicular to spine direction, ±10 px
        this.frontShoulder = { x: this.shoulderMid.x - 10, y: this.shoulderMid.y };
        this.backShoulder  = { x: this.shoulderMid.x + 10, y: this.shoulderMid.y };
        // Head sits ~20 px above shoulder mid
        this.headCenter = {
            x: this.shoulderMid.x + Math.sin(spineAngle) * 12,
            y: this.shoulderMid.y - 20,
        };
    }

    /** Quick FK for initial pose (called once in constructor) */
    private _rebuildLegs(): void {
        // LEFT — reaching forward for heel strike
        const fkL = this._legFK(this.currentLeftHipPosition, -0.65, 0.10);
        this.leftKnee  = fkL.knee;
        this.leftAnkle = fkL.ankle;
        // RIGHT — toe-off, fully extended back
        const fkR = this._legFK(this.currentRightHipPosition, 0.85, 0.10);
        this.rightKnee  = fkR.knee;
        this.rightAnkle = fkR.ankle;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  setInitialRunPose — kept for external callers, delegates to _rebuildLegs
    // ─────────────────────────────────────────────────────────────────────────
    public setInitialRunPose(): void {
        const hip = this.currentHipPosition;
        this.currentLeftHipPosition  = { x: hip.x - 10, y: hip.y };
        this.currentRightHipPosition = { x: hip.x + 10, y: hip.y };
        this._rebuildUpperBody(hip, -0.20);
        this._rebuildLegs();
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  DRAW DEBUG SKELETON
    // ─────────────────────────────────────────────────────────────────────────
    public drawDebugSkeleton(ctx: CanvasRenderingContext2D): void {
        ctx.save();

        // ── Bone lines ──────────────────────────────────────────────────────
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth   = 3.0;
        ctx.lineCap     = "round";
        ctx.lineJoin    = "round";

        const line = (a: Vec2, b: Vec2) => {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        };

        // Spine
        line(this.shoulderMid, this.currentHipPosition);
        // Shoulder bar
        line(this.frontShoulder, this.backShoulder);
        // Pelvis bar
        line(this.currentLeftHipPosition, this.currentRightHipPosition);
        // Left leg (front in 2.5D view)
        line(this.currentLeftHipPosition, this.leftKnee);
        line(this.leftKnee, this.leftAnkle);
        // Right leg (back in 2.5D view)
        line(this.currentRightHipPosition, this.rightKnee);
        line(this.rightKnee, this.rightAnkle);

        // Left Arm
        line(this.frontShoulder, this.leftElbow);
        line(this.leftElbow, this.leftWrist);
        // Right Arm
        line(this.backShoulder, this.rightElbow);
        line(this.rightElbow, this.rightWrist);

        // ── Cyan joint dots ─────────────────────────────────────────────────
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
            this.rightAnkle,
            this.leftElbow,
            this.rightElbow,
            this.leftWrist,
            this.rightWrist,
        ];
        ctx.fillStyle = "#00d8ff";
        for (const j of joints) {
            ctx.beginPath();
            ctx.arc(j.x, j.y, 4.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    public drawStaticPose(ctx: CanvasRenderingContext2D, frameIndex: number, worldX: number): void {
        const pose = Bowler.STATIC_FRAMES[frameIndex];
        if (!pose) return;

        const deg2rad = Math.PI / 180;

        // Base Y
        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT;
        const hipY = groundY - this.FULL_LEG_LENGTH * 0.85 + pose.hipYOffset;
        const hipCenter = { x: worldX, y: hipY };

        // 1. Spine
        const spineAng = pose.spineAngleDeg * deg2rad;
        const spineEnd = {
            x: hipCenter.x + Math.cos(spineAng) * this.NECK_TO_HIP_LENGTH,
            y: hipCenter.y + Math.sin(spineAng) * this.NECK_TO_HIP_LENGTH
        };
        const head = {
            x: spineEnd.x + Math.cos(spineAng) * 20,
            y: spineEnd.y + Math.sin(spineAng) * 20
        };

        // 2. Pelvis
        const pelvisLineAng = spineAng + pose.pelvisJointAngleDeg * deg2rad;
        const lHip = {
            x: hipCenter.x - Math.cos(pelvisLineAng) * (pose.pelvisJointDist / 2),
            y: hipCenter.y - Math.sin(pelvisLineAng) * (pose.pelvisJointDist / 2)
        };
        const rHip = {
            x: hipCenter.x + Math.cos(pelvisLineAng) * (pose.pelvisJointDist / 2),
            y: hipCenter.y + Math.sin(pelvisLineAng) * (pose.pelvisJointDist / 2)
        };

        // 3. Shoulders
        const shoulderLineAng = spineAng + pose.shoulderJointAngleDeg * deg2rad;
        const lShoulder = {
            x: spineEnd.x - Math.cos(shoulderLineAng) * (pose.shoulderJointDist / 2),
            y: spineEnd.y - Math.sin(shoulderLineAng) * (pose.shoulderJointDist / 2)
        };
        const rShoulder = {
            x: spineEnd.x + Math.cos(shoulderLineAng) * (pose.shoulderJointDist / 2),
            y: spineEnd.y + Math.sin(shoulderLineAng) * (pose.shoulderJointDist / 2)
        };

        // 4. Left Leg
        const lThighAng = pelvisLineAng + pose.leftThighAngleDeg * deg2rad;
        const lKnee = {
            x: lHip.x + Math.cos(lThighAng) * this.THIGH_LENGTH,
            y: lHip.y + Math.sin(lThighAng) * this.THIGH_LENGTH
        };
        const lShinAng = lThighAng + pose.leftKneeAngleDeg * deg2rad;
        const lAnkle = {
            x: lKnee.x + Math.cos(lShinAng) * this.SHIN_LENGTH,
            y: lKnee.y + Math.sin(lShinAng) * this.SHIN_LENGTH
        };

        // 5. Right Leg
        const rThighAng = pelvisLineAng + pose.rightThighAngleDeg * deg2rad;
        const rKnee = {
            x: rHip.x + Math.cos(rThighAng) * this.THIGH_LENGTH,
            y: rHip.y + Math.sin(rThighAng) * this.THIGH_LENGTH
        };
        const rShinAng = rThighAng + pose.rightKneeAngleDeg * deg2rad;
        const rAnkle = {
            x: rKnee.x + Math.cos(rShinAng) * this.SHIN_LENGTH,
            y: rKnee.y + Math.sin(rShinAng) * this.SHIN_LENGTH
        };

        // 6. Left Arm
        const lUpperArmAng = shoulderLineAng + pose.leftUpperArmAngleDeg * deg2rad;
        const lElbow = {
            x: lShoulder.x + Math.cos(lUpperArmAng) * this.FRONT_UPPER_ARM,
            y: lShoulder.y + Math.sin(lUpperArmAng) * this.FRONT_UPPER_ARM
        };
        const lForearmAng = lUpperArmAng + pose.leftElbowAngleDeg * deg2rad;
        const lWrist = {
            x: lElbow.x + Math.cos(lForearmAng) * this.FRONT_LOWER_ARM,
            y: lElbow.y + Math.sin(lForearmAng) * this.FRONT_LOWER_ARM
        };

        // 7. Right Arm
        const rUpperArmAng = shoulderLineAng + pose.rightUpperArmAngleDeg * deg2rad;
        const rElbow = {
            x: rShoulder.x + Math.cos(rUpperArmAng) * this.BACK_UPPER_ARM,
            y: rShoulder.y + Math.sin(rUpperArmAng) * this.BACK_UPPER_ARM
        };
        const rForearmAng = rUpperArmAng + pose.rightElbowAngleDeg * deg2rad;
        const rWrist = {
            x: rElbow.x + Math.cos(rForearmAng) * this.BACK_LOWER_ARM,
            y: rElbow.y + Math.sin(rForearmAng) * this.BACK_LOWER_ARM
        };

        // Draw it
        ctx.save();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3.0;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        const line = (a: Vec2, b: Vec2) => {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        };

        // Spine
        line(spineEnd, hipCenter);
        // Shoulders/Pelvis
        line(lShoulder, rShoulder);
        line(lHip, rHip);
        // Legs
        line(lHip, lKnee); line(lKnee, lAnkle);
        line(rHip, rKnee); line(rKnee, rAnkle);
        // Arms
        line(lShoulder, lElbow); line(lElbow, lWrist);
        line(rShoulder, rElbow); line(rElbow, rWrist);

        // Draw Left Joints (Green) and Right Joints (Blue) to distinguish
        const drawJoints = (color: string, points: Vec2[]) => {
            ctx.fillStyle = color;
            for (const j of points) {
                ctx.beginPath();
                ctx.arc(j.x, j.y, 4.5, 0, Math.PI * 2);
                ctx.fill();
            }
        };

        // Center / Spine joints (White)
        drawJoints("#ffffff", [head, spineEnd, hipCenter]);
        // Left joints (Green)
        drawJoints("#10b981", [lShoulder, lHip, lKnee, lAnkle, lElbow, lWrist]);
        // Right joints (Blue)
        drawJoints("#3b82f6", [rShoulder, rHip, rKnee, rAnkle, rElbow, rWrist]);

        // Frame label
        ctx.fillStyle = "#ffffff";
        ctx.font = "16px monospace";
        ctx.fillText(`Frame ${frameIndex + 1}`, worldX - 30, groundY + 20);

        ctx.restore();
    }
}