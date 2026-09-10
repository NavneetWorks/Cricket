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
        this.currentHipPosition.x = 1100;
        this.setInitialRunPose();
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  STATIC 13 FRAMES ARRAY (Populated with initial values)
    // ─────────────────────────────────────────────────────────────────────────
    public static readonly STATIC_FRAMES: KeyframePose[] = [
        {
            // FRAME 1
            spineAngleDeg: -130.0,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 100.0,
            leftUpperArmAngleDeg: 98.0,
            leftElbowAngleDeg: 100.0,
            rightUpperArmAngleDeg: 23.0,
            rightElbowAngleDeg: 77.0,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 160.0,
            rightThighAngleDeg: 80.0,
            leftKneeAngleDeg: -45.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -10.0
        },
        {
            // FRAME 2
            spineAngleDeg: -128.5,
            shoulderJointDist: 42.5,
            shoulderJointAngleDeg: 101.0,
            leftUpperArmAngleDeg: 96.0,
            leftElbowAngleDeg: 87.5,
            rightUpperArmAngleDeg: 25.5,
            rightElbowAngleDeg: 75.0,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 157.5,
            rightThighAngleDeg: 81.5,
            leftKneeAngleDeg: -42.5,
            rightKneeAngleDeg: -37.5,
            hipYOffset: -10.0
        },
        {
            // FRAME 3
            spineAngleDeg: -127.0,
            shoulderJointDist: 45.0,
            shoulderJointAngleDeg: 102.0,
            leftUpperArmAngleDeg: 94.0,
            leftElbowAngleDeg: 75.0,
            rightUpperArmAngleDeg: 28.0,
            rightElbowAngleDeg: 73.0,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 155.0,
            rightThighAngleDeg: 83.0,
            leftKneeAngleDeg: -40.0,
            rightKneeAngleDeg: -45.0,
            hipYOffset: -10.0
        },
        {
            // FRAME 4
            spineAngleDeg: -127.0,
            shoulderJointDist: 45.0,
            shoulderJointAngleDeg: 102.0,
            leftUpperArmAngleDeg: 94.0,
            leftElbowAngleDeg: 67.5,
            rightUpperArmAngleDeg: 28.0,
            rightElbowAngleDeg: 73.0,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 155.0,
            rightThighAngleDeg: 83.0,
            leftKneeAngleDeg: -37.5,
            rightKneeAngleDeg: -45.0,
            hipYOffset: -10.0
        },
        {
            // FRAME 5
            spineAngleDeg: -127.0,
            shoulderJointDist: 45.0,
            shoulderJointAngleDeg: 102.0,
            leftUpperArmAngleDeg: 94.0,
            leftElbowAngleDeg: 60.0,
            rightUpperArmAngleDeg: 28.0,
            rightElbowAngleDeg: 73.0,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 155.0,
            rightThighAngleDeg: 83.0,
            leftKneeAngleDeg: -35.0,
            rightKneeAngleDeg: -45.0,
            hipYOffset: -10.0
        },
        {
            // FRAME 6
            spineAngleDeg: -125.5,
            shoulderJointDist: 47.5,
            shoulderJointAngleDeg: 103.5,
            leftUpperArmAngleDeg: 92.0,
            leftElbowAngleDeg: 52.5,
            rightUpperArmAngleDeg: 30.5,
            rightElbowAngleDeg: 71.5,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 152.5,
            rightThighAngleDeg: 84.0,
            leftKneeAngleDeg: -32.5,
            rightKneeAngleDeg: -52.5,
            hipYOffset: -10.0
        },
        {
            // FRAME 7
            spineAngleDeg: -124.0,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 90.0,
            leftElbowAngleDeg: 45.0,
            rightUpperArmAngleDeg: 33.0,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 85.0,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -60.0,
            hipYOffset: -10.0
        },
        {
            // FRAME 8
            spineAngleDeg: -123.0,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 41.5,
            rightUpperArmAngleDeg: 37.0,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 145.0,
            rightThighAngleDeg: 87.0,
            leftKneeAngleDeg: -29.0,
            rightKneeAngleDeg: -66.5,
            hipYOffset: -11.0
        },
        {
            // FRAME 9
            spineAngleDeg: -122.0,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 80.0,
            leftElbowAngleDeg: 38.0,
            rightUpperArmAngleDeg: 41.0,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 0.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 140.0,
            rightThighAngleDeg: 89.0,
            leftKneeAngleDeg: -28.0,
            rightKneeAngleDeg: -73.0,
            hipYOffset: -12.0
        },
        {
            // FRAME 10
            spineAngleDeg: -122.0,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 80.0,
            leftElbowAngleDeg: 38.0,
            rightUpperArmAngleDeg: 41.0,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 0.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 140.0,
            rightThighAngleDeg: 89.0,
            leftKneeAngleDeg: -28.0,
            rightKneeAngleDeg: -79.0,
            hipYOffset: -13.0
        },
        {
            // FRAME 11
            spineAngleDeg: -122.0,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 80.0,
            leftElbowAngleDeg: 38.0,
            rightUpperArmAngleDeg: 41.0,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 0.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 140.0,
            rightThighAngleDeg: 89.0,
            leftKneeAngleDeg: -28.0,
            rightKneeAngleDeg: -85.0,
            hipYOffset: -14.0
        },
        {
            // FRAME 12
            spineAngleDeg: -121.0,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 75.0,
            leftElbowAngleDeg: 34.0,
            rightUpperArmAngleDeg: 45.5,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -5.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 135.0,
            rightThighAngleDeg: 90.5,
            leftKneeAngleDeg: -26.5,
            rightKneeAngleDeg: -90.0,
            hipYOffset: -14.5
        },
        {
            // FRAME 13
            spineAngleDeg: -120.0,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 30.0,
            rightUpperArmAngleDeg: 50.0,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 130.0,
            rightThighAngleDeg: 92.0,
            leftKneeAngleDeg: -25.0,
            rightKneeAngleDeg: -95.0,
            hipYOffset: -15.0
        },
        {
            // FRAME 14
            spineAngleDeg: -122.5,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 28.5,
            rightUpperArmAngleDeg: 52.5,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -14.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 132.5,
            rightThighAngleDeg: 96.5,
            leftKneeAngleDeg: -26.0,
            rightKneeAngleDeg: -98.5,
            hipYOffset: -14.5
        },
        {
            // FRAME 15
            spineAngleDeg: -125.0,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 27.0,
            rightUpperArmAngleDeg: 55.0,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -18.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 135.0,
            rightThighAngleDeg: 101.0,
            leftKneeAngleDeg: -27.0,
            rightKneeAngleDeg: -102.0,
            hipYOffset: -14.0
        },
        {
            // FRAME 16
            spineAngleDeg: -127.5,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 26.0,
            rightUpperArmAngleDeg: 57.5,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -21.5,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 137.5,
            rightThighAngleDeg: 105.5,
            leftKneeAngleDeg: -28.5,
            rightKneeAngleDeg: -106.0,
            hipYOffset: -13.0
        },
        {
            // FRAME 17
            spineAngleDeg: -130.0,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 25.0,
            rightUpperArmAngleDeg: 60.0,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -25.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 140.0,
            rightThighAngleDeg: 110.0,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -110.0,
            hipYOffset: -12.0
        },
        {
            // FRAME 18
            spineAngleDeg: -131.5,
            shoulderJointDist: 47.5,
            shoulderJointAngleDeg: 110.0,
            leftUpperArmAngleDeg: 65.0,
            leftElbowAngleDeg: 32.5,
            rightUpperArmAngleDeg: 62.5,
            rightElbowAngleDeg: 71.0,
            pelvisJointDist: -26.0,
            pelvisJointAngleDeg: 105.0,
            leftThighAngleDeg: 135.0,
            rightThighAngleDeg: 110.5,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -112.5,
            hipYOffset: -12.5
        },
        {
            // FRAME 19
            spineAngleDeg: -133.0,
            shoulderJointDist: 45.0,
            shoulderJointAngleDeg: 115.0,
            leftUpperArmAngleDeg: 60.0,
            leftElbowAngleDeg: 40.0,
            rightUpperArmAngleDeg: 65.0,
            rightElbowAngleDeg: 72.0,
            pelvisJointDist: -27.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 130.0,
            rightThighAngleDeg: 111.0,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -115.0,
            hipYOffset: -13.0
        },
        {
            // FRAME 20
            spineAngleDeg: -133.0,
            shoulderJointDist: 45.0,
            shoulderJointAngleDeg: 115.0,
            leftUpperArmAngleDeg: 60.0,
            leftElbowAngleDeg: 47.5,
            rightUpperArmAngleDeg: 65.0,
            rightElbowAngleDeg: 72.0,
            pelvisJointDist: -27.0,
            pelvisJointAngleDeg: 115.0,
            leftThighAngleDeg: 125.0,
            rightThighAngleDeg: 112.5,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -117.5,
            hipYOffset: -14.0
        },
        {
            // FRAME 21
            spineAngleDeg: -133.0,
            shoulderJointDist: 45.0,
            shoulderJointAngleDeg: 115.0,
            leftUpperArmAngleDeg: 60.0,
            leftElbowAngleDeg: 55.0,
            rightUpperArmAngleDeg: 65.0,
            rightElbowAngleDeg: 72.0,
            pelvisJointDist: -27.0,
            pelvisJointAngleDeg: 120.0,
            leftThighAngleDeg: 120.0,
            rightThighAngleDeg: 114.0,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -120.0,
            hipYOffset: -15.0
        },
        {
            // FRAME 22
            spineAngleDeg: -133.0,
            shoulderJointDist: 45.0,
            shoulderJointAngleDeg: 115.0,
            leftUpperArmAngleDeg: 60.0,
            leftElbowAngleDeg: 62.5,
            rightUpperArmAngleDeg: 65.0,
            rightElbowAngleDeg: 72.0,
            pelvisJointDist: -27.0,
            pelvisJointAngleDeg: 120.0,
            leftThighAngleDeg: 120.0,
            rightThighAngleDeg: 114.0,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -120.0,
            hipYOffset: -15.0
        },
        {
            // FRAME 23
            spineAngleDeg: -133.0,
            shoulderJointDist: 45.0,
            shoulderJointAngleDeg: 115.0,
            leftUpperArmAngleDeg: 60.0,
            leftElbowAngleDeg: 70.0,
            rightUpperArmAngleDeg: 65.0,
            rightElbowAngleDeg: 72.0,
            pelvisJointDist: -27.0,
            pelvisJointAngleDeg: 120.0,
            leftThighAngleDeg: 120.0,
            rightThighAngleDeg: 114.0,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -120.0,
            hipYOffset: -15.0
        },
        {
            // FRAME 24
            spineAngleDeg: -134.0,
            shoulderJointDist: 42.5,
            shoulderJointAngleDeg: 120.0,
            leftUpperArmAngleDeg: 55.0,
            leftElbowAngleDeg: 75.0,
            rightUpperArmAngleDeg: 67.5,
            rightElbowAngleDeg: 73.5,
            pelvisJointDist: -28.5,
            pelvisJointAngleDeg: 125.0,
            leftThighAngleDeg: 115.0,
            rightThighAngleDeg: 114.5,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -122.5,
            hipYOffset: -15.5
        },
        {
            // FRAME 25
            spineAngleDeg: -135.0,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 125.0,
            leftUpperArmAngleDeg: 50.0,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 75.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 110.0,
            rightThighAngleDeg: 115.0,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 26
            spineAngleDeg: -132.5,
            shoulderJointDist: 37.5,
            shoulderJointAngleDeg: 126.0,
            leftUpperArmAngleDeg: 47.5,
            leftElbowAngleDeg: 87.5,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 105.0,
            rightThighAngleDeg: 118.5,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 27
            spineAngleDeg: -130.0,
            shoulderJointDist: 35.0,
            shoulderJointAngleDeg: 127.0,
            leftUpperArmAngleDeg: 45.0,
            leftElbowAngleDeg: 95.0,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 65.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 100.0,
            rightThighAngleDeg: 122.0,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 28
            spineAngleDeg: -130.0,
            shoulderJointDist: 35.0,
            shoulderJointAngleDeg: 127.0,
            leftUpperArmAngleDeg: 45.0,
            leftElbowAngleDeg: 101.5,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 61.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 96.0,
            rightThighAngleDeg: 124.0,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 29
            spineAngleDeg: -130.0,
            shoulderJointDist: 35.0,
            shoulderJointAngleDeg: 127.0,
            leftUpperArmAngleDeg: 45.0,
            leftElbowAngleDeg: 108.0,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 57.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 92.0,
            rightThighAngleDeg: 126.0,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 30
            spineAngleDeg: -127.5,
            shoulderJointDist: 32.5,
            shoulderJointAngleDeg: 128.5,
            leftUpperArmAngleDeg: 42.5,
            leftElbowAngleDeg: 114.0,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 53.5,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 88.5,
            rightThighAngleDeg: 128.0,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 31
            spineAngleDeg: -125.0,
            shoulderJointDist: 30.0,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 50.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 85.0,
            rightThighAngleDeg: 130.0,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 32
            spineAngleDeg: -125.0,
            shoulderJointDist: 25.0,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 62.5,
            rightElbowAngleDeg: 60.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 78.5,
            rightThighAngleDeg: 131.5,
            leftKneeAngleDeg: -29.0,
            rightKneeAngleDeg: -120.0,
            hipYOffset: -13.0
        },
        {
            // FRAME 33
            spineAngleDeg: -125.0,
            shoulderJointDist: 20.0,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 55.0,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 72.0,
            rightThighAngleDeg: 133.0,
            leftKneeAngleDeg: -28.0,
            rightKneeAngleDeg: -115.0,
            hipYOffset: -10.0
        },
        {
            // FRAME 34
            spineAngleDeg: -125.0,
            shoulderJointDist: 15.0,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 47.5,
            rightElbowAngleDeg: 80.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 69.0,
            rightThighAngleDeg: 133.0,
            leftKneeAngleDeg: -26.0,
            rightKneeAngleDeg: -111.0,
            hipYOffset: -7.5
        },
        {
            // FRAME 35
            spineAngleDeg: -125.0,
            shoulderJointDist: 10.0,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 40.0,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 66.0,
            rightThighAngleDeg: 133.0,
            leftKneeAngleDeg: -24.0,
            rightKneeAngleDeg: -107.0,
            hipYOffset: -5.0
        },
        {
            // FRAME 36
            spineAngleDeg: -125.0,
            shoulderJointDist: 5.5,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 30.0,
            rightElbowAngleDeg: 100.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 63.0,
            rightThighAngleDeg: 136.5,
            leftKneeAngleDeg: -22.0,
            rightKneeAngleDeg: -103.5,
            hipYOffset: -2.5
        },
        {
            // FRAME 37
            spineAngleDeg: -125.0,
            shoulderJointDist: 1.0,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 20.0,
            rightElbowAngleDeg: 110.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 140.0,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -100.0,
            hipYOffset: 0.0
        },
        {
            // FRAME 38
            spineAngleDeg: -124.0,
            shoulderJointDist: 2.5,
            shoulderJointAngleDeg: 125.0,
            leftUpperArmAngleDeg: 45.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 25.0,
            rightElbowAngleDeg: 108.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 128.8,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 138.8,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -95.0,
            hipYOffset: -0.8
        },
        {
            // FRAME 39
            spineAngleDeg: -123.0,
            shoulderJointDist: 4.0,
            shoulderJointAngleDeg: 120.0,
            leftUpperArmAngleDeg: 50.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 30.0,
            rightElbowAngleDeg: 106.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 127.5,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 137.5,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -90.0,
            hipYOffset: -1.5
        },
        {
            // FRAME 40
            spineAngleDeg: -122.0,
            shoulderJointDist: 5.5,
            shoulderJointAngleDeg: 115.0,
            leftUpperArmAngleDeg: 55.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 35.0,
            rightElbowAngleDeg: 104.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 126.2,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 136.2,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -85.0,
            hipYOffset: -2.2
        },
        {
            // FRAME 41
            spineAngleDeg: -121.0,
            shoulderJointDist: 7.0,
            shoulderJointAngleDeg: 110.0,
            leftUpperArmAngleDeg: 60.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 40.0,
            rightElbowAngleDeg: 102.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 125.0,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 135.0,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -80.0,
            hipYOffset: -3.0
        },
        {
            // FRAME 42
            spineAngleDeg: -119.5,
            shoulderJointDist: 8.5,
            shoulderJointAngleDeg: 100.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 50.0,
            rightElbowAngleDeg: 99.5,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 122.5,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 133.0,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -72.5,
            hipYOffset: -4.5
        },
        {
            // FRAME 43
            spineAngleDeg: -118.0,
            shoulderJointDist: 10.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 80.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 60.0,
            rightElbowAngleDeg: 97.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 120.0,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 131.0,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -65.0,
            hipYOffset: -6.0
        },
        {
            // FRAME 44
            spineAngleDeg: -117.0,
            shoulderJointDist: 11.5,
            shoulderJointAngleDeg: 82.5,
            leftUpperArmAngleDeg: 90.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 67.5,
            rightElbowAngleDeg: 95.5,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 117.5,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 129.0,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -61.0,
            hipYOffset: -7.0
        },
        {
            // FRAME 45
            spineAngleDeg: -116.0,
            shoulderJointDist: 13.0,
            shoulderJointAngleDeg: 75.0,
            leftUpperArmAngleDeg: 100.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 75.0,
            rightElbowAngleDeg: 94.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 115.0,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 127.0,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -57.0,
            hipYOffset: -8.0
        },
        {
            // FRAME 46
            spineAngleDeg: -115.5,
            shoulderJointDist: 14.0,
            shoulderJointAngleDeg: 67.5,
            leftUpperArmAngleDeg: 109.5,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 82.5,
            rightElbowAngleDeg: 92.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 112.5,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 126.0,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -53.5,
            hipYOffset: -9.0
        },
        {
            // FRAME 47
            spineAngleDeg: -115.0,
            shoulderJointDist: 15.0,
            shoulderJointAngleDeg: 60.0,
            leftUpperArmAngleDeg: 119.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 90.0,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 125.0,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -50.0,
            hipYOffset: -10.0
        },
        {
            // FRAME 48
            spineAngleDeg: -116.0,
            shoulderJointDist: 16.0,
            shoulderJointAngleDeg: 67.5,
            leftUpperArmAngleDeg: 110.5,
            leftElbowAngleDeg: 115.0,
            rightUpperArmAngleDeg: 85.0,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 62.5,
            rightThighAngleDeg: 123.5,
            leftKneeAngleDeg: -26.5,
            rightKneeAngleDeg: -42.5,
            hipYOffset: -12.5
        },
        {
            // FRAME 49
            spineAngleDeg: -117.0,
            shoulderJointDist: 17.0,
            shoulderJointAngleDeg: 75.0,
            leftUpperArmAngleDeg: 102.0,
            leftElbowAngleDeg: 110.0,
            rightUpperArmAngleDeg: 80.0,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 65.0,
            rightThighAngleDeg: 122.0,
            leftKneeAngleDeg: -33.0,
            rightKneeAngleDeg: -35.0,
            hipYOffset: -15.0
        },
        {
            // FRAME 50
            spineAngleDeg: -118.5,
            shoulderJointDist: 18.5,
            shoulderJointAngleDeg: 82.5,
            leftUpperArmAngleDeg: 93.5,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 75.0,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 67.5,
            rightThighAngleDeg: 121.0,
            leftKneeAngleDeg: -39.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -17.5
        },
        {
            // FRAME 51
            spineAngleDeg: -120.0,
            shoulderJointDist: 20.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 100.0,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 70.0,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -45.0,
            rightKneeAngleDeg: -25.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 52
            spineAngleDeg: -120.0,
            shoulderJointDist: 18.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 97.5,
            rightUpperArmAngleDeg: 71.2,
            rightElbowAngleDeg: 87.5,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 71.2,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -50.0,
            rightKneeAngleDeg: -24.2,
            hipYOffset: -20.0
        },
        {
            // FRAME 53
            spineAngleDeg: -120.0,
            shoulderJointDist: 16.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 95.0,
            rightUpperArmAngleDeg: 72.5,
            rightElbowAngleDeg: 85.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 72.5,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -55.0,
            rightKneeAngleDeg: -23.5,
            hipYOffset: -20.0
        },
        {
            // FRAME 54
            spineAngleDeg: -120.0,
            shoulderJointDist: 14.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 92.5,
            rightUpperArmAngleDeg: 73.8,
            rightElbowAngleDeg: 82.5,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 73.8,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -60.0,
            rightKneeAngleDeg: -22.8,
            hipYOffset: -20.0
        },
        {
            // FRAME 55
            spineAngleDeg: -120.0,
            shoulderJointDist: 12.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 90.0,
            rightUpperArmAngleDeg: 75.0,
            rightElbowAngleDeg: 80.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 75.0,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -65.0,
            rightKneeAngleDeg: -22.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 56
            spineAngleDeg: -120.0,
            shoulderJointDist: 10.8,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 88.8,
            rightUpperArmAngleDeg: 75.5,
            rightElbowAngleDeg: 78.8,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 75.8,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -69.2,
            rightKneeAngleDeg: -21.8,
            hipYOffset: -20.0
        },
        {
            // FRAME 57
            spineAngleDeg: -120.0,
            shoulderJointDist: 9.5,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 87.5,
            rightUpperArmAngleDeg: 76.0,
            rightElbowAngleDeg: 77.5,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 76.5,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -73.5,
            rightKneeAngleDeg: -21.5,
            hipYOffset: -20.0
        },
        {
            // FRAME 58
            spineAngleDeg: -120.0,
            shoulderJointDist: 8.2,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 86.2,
            rightUpperArmAngleDeg: 76.5,
            rightElbowAngleDeg: 76.2,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 77.2,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -77.8,
            rightKneeAngleDeg: -21.2,
            hipYOffset: -20.0
        },
        {
            // FRAME 59
            spineAngleDeg: -120.0,
            shoulderJointDist: 7.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 85.0,
            rightUpperArmAngleDeg: 77.0,
            rightElbowAngleDeg: 75.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 78.0,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -82.0,
            rightKneeAngleDeg: -21.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 60
            spineAngleDeg: -120.0,
            shoulderJointDist: 6.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 82.5,
            rightUpperArmAngleDeg: 78.5,
            rightElbowAngleDeg: 72.5,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 79.0,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -88.5,
            rightKneeAngleDeg: -20.5,
            hipYOffset: -20.0
        },
        {
            // FRAME 61
            spineAngleDeg: -120.0,
            shoulderJointDist: 5.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 80.0,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 80.0,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -95.0,
            rightKneeAngleDeg: -20.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 62
            spineAngleDeg: -120.0,
            shoulderJointDist: 8.5,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 88.5,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 78.5,
            rightElbowAngleDeg: 65.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 85.0,
            rightThighAngleDeg: 118.5,
            leftKneeAngleDeg: -102.5,
            rightKneeAngleDeg: -22.5,
            hipYOffset: -20.0
        },
        {
            // FRAME 63
            spineAngleDeg: -120.0,
            shoulderJointDist: 12.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 92.0,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 77.0,
            rightElbowAngleDeg: 60.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 90.0,
            rightThighAngleDeg: 117.0,
            leftKneeAngleDeg: -110.0,
            rightKneeAngleDeg: -25.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 64
            spineAngleDeg: -120.0,
            shoulderJointDist: 16.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 96.0,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 76.0,
            rightElbowAngleDeg: 55.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 95.0,
            rightThighAngleDeg: 116.0,
            leftKneeAngleDeg: -115.0,
            rightKneeAngleDeg: -27.5,
            hipYOffset: -20.0
        },
        {
            // FRAME 65
            spineAngleDeg: -120.0,
            shoulderJointDist: 20.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 100.0,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 75.0,
            rightElbowAngleDeg: 50.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 100.0,
            rightThighAngleDeg: 115.0,
            leftKneeAngleDeg: -120.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 66
            spineAngleDeg: -120.0,
            shoulderJointDist: 22.5,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 101.0,
            leftElbowAngleDeg: 82.5,
            rightUpperArmAngleDeg: 71.5,
            rightElbowAngleDeg: 52.5,
            pelvisJointDist: -27.5,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 102.5,
            rightThighAngleDeg: 111.5,
            leftKneeAngleDeg: -122.5,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 67
            spineAngleDeg: -120.0,
            shoulderJointDist: 25.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 102.0,
            leftElbowAngleDeg: 85.0,
            rightUpperArmAngleDeg: 68.0,
            rightElbowAngleDeg: 55.0,
            pelvisJointDist: -25.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 105.0,
            rightThighAngleDeg: 108.0,
            leftKneeAngleDeg: -125.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 68
            spineAngleDeg: -120.0,
            shoulderJointDist: 27.5,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 103.5,
            leftElbowAngleDeg: 87.5,
            rightUpperArmAngleDeg: 64.0,
            rightElbowAngleDeg: 57.5,
            pelvisJointDist: -22.5,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 107.5,
            rightThighAngleDeg: 104.0,
            leftKneeAngleDeg: -127.5,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 69
            spineAngleDeg: -120.0,
            shoulderJointDist: 30.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 105.0,
            leftElbowAngleDeg: 90.0,
            rightUpperArmAngleDeg: 60.0,
            rightElbowAngleDeg: 60.0,
            pelvisJointDist: -20.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 110.0,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -130.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 70
            spineAngleDeg: -120.0,
            shoulderJointDist: 32.5,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 106.0,
            leftElbowAngleDeg: 94.0,
            rightUpperArmAngleDeg: 56.0,
            rightElbowAngleDeg: 62.5,
            pelvisJointDist: -12.5,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 117.5,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -130.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 71
            spineAngleDeg: -120.0,
            shoulderJointDist: 35.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 107.0,
            leftElbowAngleDeg: 98.0,
            rightUpperArmAngleDeg: 52.0,
            rightElbowAngleDeg: 65.0,
            pelvisJointDist: -5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 125.0,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -130.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 72
            spineAngleDeg: -120.0,
            shoulderJointDist: 36.2,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 107.8,
            leftElbowAngleDeg: 99.8,
            rightUpperArmAngleDeg: 50.2,
            rightElbowAngleDeg: 66.2,
            pelvisJointDist: -2.5,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 131.2,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -130.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 73
            spineAngleDeg: -120.0,
            shoulderJointDist: 37.5,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 108.5,
            leftElbowAngleDeg: 101.5,
            rightUpperArmAngleDeg: 48.5,
            rightElbowAngleDeg: 67.5,
            pelvisJointDist: 0.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 137.5,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -130.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 74
            spineAngleDeg: -120.0,
            shoulderJointDist: 38.8,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 109.2,
            leftElbowAngleDeg: 103.2,
            rightUpperArmAngleDeg: 46.8,
            rightElbowAngleDeg: 68.8,
            pelvisJointDist: 2.5,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 143.8,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -130.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 75
            spineAngleDeg: -120.0,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 45.0,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -130.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 76
            spineAngleDeg: -118.5,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 43.5,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 92.5,
            leftKneeAngleDeg: -122.5,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 77
            spineAngleDeg: -117.0,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 42.0,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 85.0,
            leftKneeAngleDeg: -115.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 78
            spineAngleDeg: -116.0,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 41.0,
            rightElbowAngleDeg: 75.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 77.5,
            leftKneeAngleDeg: -107.5,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -18.0
        },
        {
            // FRAME 79
            spineAngleDeg: -115.0,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 40.0,
            rightElbowAngleDeg: 80.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 70.0,
            leftKneeAngleDeg: -100.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 80
            spineAngleDeg: -118.5,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 92.5,
            leftUpperArmAngleDeg: 107.5,
            leftElbowAngleDeg: 103.5,
            rightUpperArmAngleDeg: 35.5,
            rightElbowAngleDeg: 79.2,
            pelvisJointDist: 6.2,
            pelvisJointAngleDeg: 107.5,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 72.5,
            leftKneeAngleDeg: -92.5,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -15.0
        },
        {
            // FRAME 81
            spineAngleDeg: -122.0,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 95.0,
            leftUpperArmAngleDeg: 105.0,
            leftElbowAngleDeg: 102.0,
            rightUpperArmAngleDeg: 31.0,
            rightElbowAngleDeg: 78.5,
            pelvisJointDist: 7.5,
            pelvisJointAngleDeg: 105.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 75.0,
            leftKneeAngleDeg: -85.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -14.0
        },
        {
            // FRAME 82
            spineAngleDeg: -122.0,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 95.0,
            leftUpperArmAngleDeg: 105.0,
            leftElbowAngleDeg: 102.0,
            rightUpperArmAngleDeg: 31.0,
            rightElbowAngleDeg: 78.5,
            pelvisJointDist: 7.5,
            pelvisJointAngleDeg: 105.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 75.0,
            leftKneeAngleDeg: -80.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -13.5
        },
        {
            // FRAME 83
            spineAngleDeg: -122.0,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 95.0,
            leftUpperArmAngleDeg: 105.0,
            leftElbowAngleDeg: 102.0,
            rightUpperArmAngleDeg: 31.0,
            rightElbowAngleDeg: 78.5,
            pelvisJointDist: 7.5,
            pelvisJointAngleDeg: 105.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 75.0,
            leftKneeAngleDeg: -75.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -13.0
        },
        {
            // FRAME 84
            spineAngleDeg: -122.0,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 95.0,
            leftUpperArmAngleDeg: 105.0,
            leftElbowAngleDeg: 102.0,
            rightUpperArmAngleDeg: 31.0,
            rightElbowAngleDeg: 78.5,
            pelvisJointDist: 7.5,
            pelvisJointAngleDeg: 105.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 75.0,
            leftKneeAngleDeg: -70.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -12.5
        },
        {
            // FRAME 85
            spineAngleDeg: -122.0,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 95.0,
            leftUpperArmAngleDeg: 105.0,
            leftElbowAngleDeg: 102.0,
            rightUpperArmAngleDeg: 31.0,
            rightElbowAngleDeg: 78.5,
            pelvisJointDist: 7.5,
            pelvisJointAngleDeg: 105.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 75.0,
            leftKneeAngleDeg: -65.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -12.0
        }

    ];

    // ─────────────────────────────────────────────────────────────────────────
    constructor(startX = 1100) {
        this.currentHipPosition = { x: startX, y: 0 };
        this.setInitialRunPose();
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
    public static catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
        const t2 = t * t;
        const t3 = t2 * t;
        return 0.5 * (
            (2 * p1) +
            (-p0 + p2) * t +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
            (-p0 + 3 * p1 - 3 * p2 + p3) * t3
        );
    }

    public static catmullRomDeg(p0: number, p1: number, p2: number, p3: number, t: number): number {
        const norm = (val: number, ref: number) => {
            let diff = (val - ref) % 360;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;
            return ref + diff;
        };

        const v1 = p1;
        const v0 = norm(p0, v1);
        const v2 = norm(p2, v1);
        const v3 = norm(p3, v2);

        return Bowler.catmullRom(v0, v1, v2, v3, t);
    }

    public static interpolateCatmullRom(p0: KeyframePose, p1: KeyframePose, p2: KeyframePose, p3: KeyframePose, t: number): KeyframePose {
        return {
            spineAngleDeg: Bowler.catmullRomDeg(p0.spineAngleDeg, p1.spineAngleDeg, p2.spineAngleDeg, p3.spineAngleDeg, t),
            shoulderJointDist: Bowler.catmullRom(p0.shoulderJointDist, p1.shoulderJointDist, p2.shoulderJointDist, p3.shoulderJointDist, t),
            shoulderJointAngleDeg: Bowler.catmullRomDeg(p0.shoulderJointAngleDeg, p1.shoulderJointAngleDeg, p2.shoulderJointAngleDeg, p3.shoulderJointAngleDeg, t),
            leftUpperArmAngleDeg: Bowler.catmullRomDeg(p0.leftUpperArmAngleDeg, p1.leftUpperArmAngleDeg, p2.leftUpperArmAngleDeg, p3.leftUpperArmAngleDeg, t),
            leftElbowAngleDeg: Bowler.catmullRomDeg(p0.leftElbowAngleDeg, p1.leftElbowAngleDeg, p2.leftElbowAngleDeg, p3.leftElbowAngleDeg, t),
            rightUpperArmAngleDeg: Bowler.catmullRomDeg(p0.rightUpperArmAngleDeg, p1.rightUpperArmAngleDeg, p2.rightUpperArmAngleDeg, p3.rightUpperArmAngleDeg, t),
            rightElbowAngleDeg: Bowler.catmullRomDeg(p0.rightElbowAngleDeg, p1.rightElbowAngleDeg, p2.rightElbowAngleDeg, p3.rightElbowAngleDeg, t),
            pelvisJointDist: Bowler.catmullRom(p0.pelvisJointDist, p1.pelvisJointDist, p2.pelvisJointDist, p3.pelvisJointDist, t),
            pelvisJointAngleDeg: Bowler.catmullRomDeg(p0.pelvisJointAngleDeg, p1.pelvisJointAngleDeg, p2.pelvisJointAngleDeg, p3.pelvisJointAngleDeg, t),
            leftThighAngleDeg: Bowler.catmullRomDeg(p0.leftThighAngleDeg, p1.leftThighAngleDeg, p2.leftThighAngleDeg, p3.leftThighAngleDeg, t),
            rightThighAngleDeg: Bowler.catmullRomDeg(p0.rightThighAngleDeg, p1.rightThighAngleDeg, p2.rightThighAngleDeg, p3.rightThighAngleDeg, t),
            leftKneeAngleDeg: Bowler.catmullRomDeg(p0.leftKneeAngleDeg, p1.leftKneeAngleDeg, p2.leftKneeAngleDeg, p3.leftKneeAngleDeg, t),
            rightKneeAngleDeg: Bowler.catmullRomDeg(p0.rightKneeAngleDeg, p1.rightKneeAngleDeg, p2.rightKneeAngleDeg, p3.rightKneeAngleDeg, t),
            hipYOffset: Bowler.catmullRom(p0.hipYOffset, p1.hipYOffset, p2.hipYOffset, p3.hipYOffset, t)
        };
    }

    public static interpolatePose(p1: KeyframePose, p2: KeyframePose, t: number): KeyframePose {
        const lerpVal = (a: number, b: number, factor: number) => a + (b - a) * factor;

        // Angle lerp using shortest path (-180 to 180 wrapping)
        const lerpDeg = (a: number, b: number, factor: number) => {
            let diff = (b - a) % 360;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;
            return a + diff * factor;
        };

        return {
            spineAngleDeg: lerpDeg(p1.spineAngleDeg, p2.spineAngleDeg, t),
            shoulderJointDist: lerpVal(p1.shoulderJointDist, p2.shoulderJointDist, t),
            shoulderJointAngleDeg: lerpDeg(p1.shoulderJointAngleDeg, p2.shoulderJointAngleDeg, t),
            leftUpperArmAngleDeg: lerpDeg(p1.leftUpperArmAngleDeg, p2.leftUpperArmAngleDeg, t),
            leftElbowAngleDeg: lerpDeg(p1.leftElbowAngleDeg, p2.leftElbowAngleDeg, t),
            rightUpperArmAngleDeg: lerpDeg(p1.rightUpperArmAngleDeg, p2.rightUpperArmAngleDeg, t),
            rightElbowAngleDeg: lerpDeg(p1.rightElbowAngleDeg, p2.rightElbowAngleDeg, t),
            pelvisJointDist: lerpVal(p1.pelvisJointDist, p2.pelvisJointDist, t),
            pelvisJointAngleDeg: lerpDeg(p1.pelvisJointAngleDeg, p2.pelvisJointAngleDeg, t),
            leftThighAngleDeg: lerpDeg(p1.leftThighAngleDeg, p2.leftThighAngleDeg, t),
            rightThighAngleDeg: lerpDeg(p1.rightThighAngleDeg, p2.rightThighAngleDeg, t),
            leftKneeAngleDeg: lerpDeg(p1.leftKneeAngleDeg, p2.leftKneeAngleDeg, t),
            rightKneeAngleDeg: lerpDeg(p1.rightKneeAngleDeg, p2.rightKneeAngleDeg, t),
            hipYOffset: lerpVal(p1.hipYOffset, p2.hipYOffset, t)
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    public applyKeyframePose(pose: KeyframePose, worldX: number): void {
        const deg2rad = Math.PI / 180;
        
        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT;
        const hipY = groundY - this.FULL_LEG_LENGTH * 0.85 + pose.hipYOffset;
        this.currentHipPosition = { x: worldX, y: hipY };

        // 1. Spine
        const spineAng = pose.spineAngleDeg * deg2rad;
        this.shoulderMid = {
            x: this.currentHipPosition.x + Math.cos(spineAng) * this.NECK_TO_HIP_LENGTH,
            y: this.currentHipPosition.y + Math.sin(spineAng) * this.NECK_TO_HIP_LENGTH
        };
        this.headCenter = {
            x: this.shoulderMid.x + Math.cos(spineAng) * 20,
            y: this.shoulderMid.y + Math.sin(spineAng) * 20
        };

        // 2. Pelvis
        const pelvisLineAng = spineAng + pose.pelvisJointAngleDeg * deg2rad;
        this.currentLeftHipPosition = {
            x: this.currentHipPosition.x - Math.cos(pelvisLineAng) * (pose.pelvisJointDist / 2),
            y: this.currentHipPosition.y - Math.sin(pelvisLineAng) * (pose.pelvisJointDist / 2)
        };
        this.currentRightHipPosition = {
            x: this.currentHipPosition.x + Math.cos(pelvisLineAng) * (pose.pelvisJointDist / 2),
            y: this.currentHipPosition.y + Math.sin(pelvisLineAng) * (pose.pelvisJointDist / 2)
        };

        // 3. Shoulders
        const shoulderLineAng = spineAng + pose.shoulderJointAngleDeg * deg2rad;
        this.frontShoulder = {
            x: this.shoulderMid.x - Math.cos(shoulderLineAng) * (pose.shoulderJointDist / 2),
            y: this.shoulderMid.y - Math.sin(shoulderLineAng) * (pose.shoulderJointDist / 2)
        };
        this.backShoulder = {
            x: this.shoulderMid.x + Math.cos(shoulderLineAng) * (pose.shoulderJointDist / 2),
            y: this.shoulderMid.y + Math.sin(shoulderLineAng) * (pose.shoulderJointDist / 2)
        };

        // 4. Left Leg
        const lThighAng = pelvisLineAng + pose.leftThighAngleDeg * deg2rad;
        this.leftKnee = {
            x: this.currentLeftHipPosition.x + Math.cos(lThighAng) * this.THIGH_LENGTH,
            y: this.currentLeftHipPosition.y + Math.sin(lThighAng) * this.THIGH_LENGTH
        };
        const lShinAng = lThighAng + pose.leftKneeAngleDeg * deg2rad;
        this.leftAnkle = {
            x: this.leftKnee.x + Math.cos(lShinAng) * this.SHIN_LENGTH,
            y: this.leftKnee.y + Math.sin(lShinAng) * this.SHIN_LENGTH
        };

        // 5. Right Leg
        const rThighAng = pelvisLineAng + pose.rightThighAngleDeg * deg2rad;
        this.rightKnee = {
            x: this.currentRightHipPosition.x + Math.cos(rThighAng) * this.THIGH_LENGTH,
            y: this.currentRightHipPosition.y + Math.sin(rThighAng) * this.THIGH_LENGTH
        };
        const rShinAng = rThighAng + pose.rightKneeAngleDeg * deg2rad;
        this.rightAnkle = {
            x: this.rightKnee.x + Math.cos(rShinAng) * this.SHIN_LENGTH,
            y: this.rightKnee.y + Math.sin(rShinAng) * this.SHIN_LENGTH
        };

        // 6. Left Arm
        const lUpperArmAng = shoulderLineAng + pose.leftUpperArmAngleDeg * deg2rad;
        this.leftElbow = {
            x: this.frontShoulder.x + Math.cos(lUpperArmAng) * this.FRONT_UPPER_ARM,
            y: this.frontShoulder.y + Math.sin(lUpperArmAng) * this.FRONT_UPPER_ARM
        };
        const lForearmAng = lUpperArmAng + pose.leftElbowAngleDeg * deg2rad;
        this.leftWrist = {
            x: this.leftElbow.x + Math.cos(lForearmAng) * this.FRONT_LOWER_ARM,
            y: this.leftElbow.y + Math.sin(lForearmAng) * this.FRONT_LOWER_ARM
        };

        // 7. Right Arm
        const rUpperArmAng = shoulderLineAng + pose.rightUpperArmAngleDeg * deg2rad;
        this.rightElbow = {
            x: this.backShoulder.x + Math.cos(rUpperArmAng) * this.BACK_UPPER_ARM,
            y: this.backShoulder.y + Math.sin(rUpperArmAng) * this.BACK_UPPER_ARM
        };
        const rForearmAng = rUpperArmAng + pose.rightElbowAngleDeg * deg2rad;
        this.rightWrist = {
            x: this.rightElbow.x + Math.cos(rForearmAng) * this.BACK_LOWER_ARM,
            y: this.rightElbow.y + Math.sin(rForearmAng) * this.BACK_LOWER_ARM
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Adjustable variable for how much physical distance one full cycle of 14 frames covers.
    public runCycleDistance: number = 420; 

    public updateRunPose(dt: number): void {
        // 1. Update frequency based on intensity
        this.strideFrequency = 0.5 + .7 * this.runIntensity;

        // 2. Advance stride phase (0 to 1)
        this.stridePhase = (this.stridePhase + this.strideFrequency * dt) % 1.0;

        // 3. Move body forward (left on canvas)
        const horizontalSpeed = this.runCycleDistance * this.strideFrequency * this.runIntensity;
        this.currentHipPosition.x -= horizontalSpeed * dt;

        // Reset when off screen
        if (this.currentHipPosition.x < 100) {
            this.currentHipPosition.x = 1100;
            this.stridePhase = 0;
        }

        // 4. Catmull-Rom Keyframe Interpolation across 4 points
        const totalFrames = Bowler.STATIC_FRAMES.length;
        const frameFloat = this.stridePhase * totalFrames;
        
        const idx1 = Math.floor(frameFloat) % totalFrames;
        const idx0 = (idx1 - 1 + totalFrames) % totalFrames;
        const idx2 = (idx1 + 1) % totalFrames;
        const idx3 = (idx1 + 2) % totalFrames;
        const t = frameFloat - Math.floor(frameFloat);

        const pose0 = Bowler.STATIC_FRAMES[idx0];
        const pose1 = Bowler.STATIC_FRAMES[idx1];
        const pose2 = Bowler.STATIC_FRAMES[idx2];
        const pose3 = Bowler.STATIC_FRAMES[idx3];

        const interpolatedPose = Bowler.interpolateCatmullRom(pose0, pose1, pose2, pose3, t);

        // 5. Vertical Gravity Bounce Arc (Apex floating feel when running)
        const gravityBounce = Math.sin(this.stridePhase * Math.PI * 2) * 6.0;
        interpolatedPose.hipYOffset += gravityBounce;

        // 6. Apply the interpolated pose to the real skeleton directly
        this.applyKeyframePose(interpolatedPose, this.currentHipPosition.x);
    }

    // ─────────────────────────────────────────────────────────────────────────
    public setInitialRunPose(): void {
        this.applyKeyframePose(Bowler.STATIC_FRAMES[0], this.currentHipPosition.x);
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

    public drawStaticPose(ctx: CanvasRenderingContext2D, frameIndex: number, worldX: number, customGroundY?: number): void {
        const pose = Bowler.STATIC_FRAMES[frameIndex];
        if (!pose) return;

        const deg2rad = Math.PI / 180;

        // Base Y
        const groundY = customGroundY !== undefined ? customGroundY : (CANVAS_HEIGHT - GROUND_HEIGHT);
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