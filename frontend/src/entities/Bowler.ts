import { CANVAS_WIDTH, CANVAS_HEIGHT, GROUND_HEIGHT, PLAYER_LENGTH_FACTOR } from "../game/constants";

export interface Vec2 {
    x: number;
    y: number;
}


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

export interface RangeNode {
    lowerFrameIndex: number;
    lowerAngleDeg: number;
    upperFrameIndex: number;
    upperAngleDeg: number;
    next: RangeNode | null;
}

export class RangeLinkedList {
    public head: RangeNode | null = null;
    public tail: RangeNode | null = null;
    public currentPointer: RangeNode | null = null;

    public append(lowerIdx: number, lowerAng: number, upperIdx: number, upperAng: number): void {
        const node: RangeNode = {
            lowerFrameIndex: lowerIdx,
            lowerAngleDeg: lowerAng,
            upperFrameIndex: upperIdx,
            upperAngleDeg: upperAng,
            next: null
        };
        if (!this.head) {
            this.head = node;
            this.tail = node;
            this.currentPointer = node;
        } else if (this.tail) {
            this.tail.next = node;
            this.tail = node;
        }
    }

    public resetPointer(): void {
        this.currentPointer = this.head;
    }

    public getCurrentNode(): RangeNode | null {
        return this.currentPointer;
    }

    public advancePointerSafely(): void {
        if (this.currentPointer && this.currentPointer.next !== null) {
            this.currentPointer = this.currentPointer.next;
        }
    }
}

export class Bowler {

    // ── Segment lengths ────────────────────────────────────────────────────
    private readonly BOWLER_SCALE = 1.2;
    public readonly TOTAL_RIGHT_ARM_LENGTH = 3.4 * PLAYER_LENGTH_FACTOR*this.BOWLER_SCALE;
    public readonly TOTAL_LEFT_ARM_LENGTH  = 3.5 * PLAYER_LENGTH_FACTOR*this.BOWLER_SCALE;

    public readonly FRONT_UPPER_ARM = this.TOTAL_LEFT_ARM_LENGTH  * 0.5;
    public readonly FRONT_LOWER_ARM = this.TOTAL_LEFT_ARM_LENGTH  - this.FRONT_UPPER_ARM;
    public readonly BACK_UPPER_ARM  = this.TOTAL_RIGHT_ARM_LENGTH * 0.5;
    public readonly BACK_LOWER_ARM  = this.TOTAL_RIGHT_ARM_LENGTH - this.BACK_UPPER_ARM;

    public readonly FULL_LEG_LENGTH     = 5.2 * PLAYER_LENGTH_FACTOR*this.BOWLER_SCALE;
    public readonly THIGH_LENGTH        = this.FULL_LEG_LENGTH * 0.50;
    public readonly SHIN_LENGTH         = this.FULL_LEG_LENGTH - this.THIGH_LENGTH;

    public readonly NECK_TO_HIP_LENGTH  = 3.4 * PLAYER_LENGTH_FACTOR*this.BOWLER_SCALE;
    
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

    // ── Pre-Jump Adaptive Transition & Flight Execution State ───────────────────────────
    public isPreJumpTransitioning: boolean = false;
    public isPreJumpFrozen: boolean = false;
    public isExecutingJump: boolean = false;
    public jumpPhase: number = 0; // 0.0 to 1.0 progression through 420 frames
    public hasReleasedBall: boolean = false; // Flag to track ball release instant during jump

    // Dedicated controls for jump action speed and body/limb movement frequency
    public jumpAnimationDuration: number = 1.2; // Time in seconds to complete the full 420-frame jump (arm/leg speed)
    public jumpForwardSpeed: number = 350;       // Forward displacement speed during jump in px/sec (step forward speed)

    public preJumpStartX: number = 0;
    private preJumpTargetDistance: number = 40; // Max ceiling 40px
    private preJumpStartPose: KeyframePose | null = null;
    private preJumpJointVelocities: Record<string, number> = {};
    private lastPoseSnapshot: KeyframePose | null = null;

    public startRunning(): void {     
        this.isRunning = true;
        this.isPreJumpTransitioning = false;   
        this.isPreJumpFrozen = false;
        this.isExecutingJump = false;
        this.jumpPhase = 0;
        this.hasReleasedBall = false;
        this.targetIntensity = 1.0;
    }

    public triggerPreJump(): void {
        if (!this.isRunning || this.isPreJumpTransitioning || this.isPreJumpFrozen || this.isExecutingJump) return;

        this.isPreJumpTransitioning = true;
        this.preJumpStartX = this.currentHipPosition.x;
        
        // Capture current snapshot pose
        const currentPose = this.lastPoseSnapshot ? { ...this.lastPoseSnapshot } : { ...Bowler.STATIC_FRAMES[0] };
        this.preJumpStartPose = currentPose;

        // Target pose is Frame 1 of the Jump action
        const jumpFrames = Bowler.getExpandedJumpFrames();
        const targetPose = jumpFrames[0] || Bowler.STATIC_FRAMES[0];

        // Calculate total angle distance to adaptively scale transition distance (10px to 40px)
        let totalAngleDiff = 0;
        const keys: (keyof KeyframePose)[] = [
            'spineAngleDeg', 'shoulderJointAngleDeg', 'leftUpperArmAngleDeg', 'leftElbowAngleDeg',
            'rightUpperArmAngleDeg', 'rightElbowAngleDeg', 'leftThighAngleDeg', 'rightThighAngleDeg',
            'leftKneeAngleDeg', 'rightKneeAngleDeg'
        ];

        keys.forEach(k => {
            let diff = Math.abs((targetPose[k] as number) - (currentPose[k] as number));
            if (diff > 180) diff = 360 - diff;
            totalAngleDiff += diff;
            
            // Estimate joint angular velocity direction from stride phase derivative
            this.preJumpJointVelocities[k] = ((targetPose[k] as number) - (currentPose[k] as number) > 0 ? 1 : -1) * 15.0;
        });

        // Adaptive blend distance: 10px minimum, 40px maximum
        this.preJumpTargetDistance = Math.min(40, Math.max(10, Math.round(totalAngleDiff * 0.08)));
    }

    public resetToIdle(): void {
        this.isRunning = false;
        this.isPreJumpTransitioning = false;
        this.isPreJumpFrozen = false;
        this.isExecutingJump = false;
        this.jumpPhase = 0;
        this.hasReleasedBall = false;
        this.targetIntensity = 0.0;
        this.runIntensity = 0.0;
        this.resetProceduralUpperBodyState();
        if (this.currentHipPosition.x < 2000) {
            this.currentHipPosition.x = 2600; // Far right starting position for runup
        }
        this.setInitialRunPose();
    }

    public isCycleCompleted: boolean = false;
    public dynamicOffsetDeg: number = 0.0;
    public offsetVelocityDeg: number = 0.0;
    public lastArmAngleRad: number | null = null;
    public lastJoystickAngleRad: number | null = null;
    public lastJoystickVelDeg: number = 0.0;

    public resetProceduralUpperBodyState(): void {
        this.currentProceduralNBArmAngleDeg = 48.0;
        this.currentProceduralNBElbowAngleDeg = 75.0;
        this.currentProceduralSpineAngleDeg = -130.0;
        this.currentProceduralShoulderAngleDeg = 100.0;
        this.currentProceduralShoulderDist = 15.0;
        this.unwrappedArmAngleDeg = 180.0;
        this.lastArmAngleRad = null;
        this.isCycleCompleted = false;
        this.dynamicOffsetDeg = 0.0;
        this.offsetVelocityDeg = 0.0;
        this.lastJoystickAngleRad = null;
        this.lastJoystickVelDeg = 0.0;
        Bowler.resetAllRangeLUTPointers();
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
            spineAngleDeg: -129.9,
            shoulderJointDist: 40.16,
            shoulderJointAngleDeg: 100.06,
            leftUpperArmAngleDeg: 97.87,
            leftElbowAngleDeg: 99.2,
            rightUpperArmAngleDeg: 23.16,
            rightElbowAngleDeg: 76.87,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 159.84,
            rightThighAngleDeg: 80.1,
            leftKneeAngleDeg: -44.84,
            rightKneeAngleDeg: -30.48,
            hipYOffset: -10.0
        },
        {
            // FRAME 3
            spineAngleDeg: -129.73,
            shoulderJointDist: 40.45,
            shoulderJointAngleDeg: 100.18,
            leftUpperArmAngleDeg: 97.64,
            leftElbowAngleDeg: 97.73,
            rightUpperArmAngleDeg: 23.45,
            rightElbowAngleDeg: 76.64,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 159.55,
            rightThighAngleDeg: 80.27,
            leftKneeAngleDeg: -44.55,
            rightKneeAngleDeg: -31.36,
            hipYOffset: -10.0
        },
        {
            // FRAME 4
            spineAngleDeg: -129.5,
            shoulderJointDist: 40.83,
            shoulderJointAngleDeg: 100.33,
            leftUpperArmAngleDeg: 97.33,
            leftElbowAngleDeg: 95.83,
            rightUpperArmAngleDeg: 23.83,
            rightElbowAngleDeg: 76.33,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 159.17,
            rightThighAngleDeg: 80.5,
            leftKneeAngleDeg: -44.17,
            rightKneeAngleDeg: -32.5,
            hipYOffset: -10.0
        },
        {
            // FRAME 5
            spineAngleDeg: -129.4,
            shoulderJointDist: 40.99,
            shoulderJointAngleDeg: 100.4,
            leftUpperArmAngleDeg: 97.2,
            leftElbowAngleDeg: 95.03,
            rightUpperArmAngleDeg: 23.99,
            rightElbowAngleDeg: 76.2,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 159.01,
            rightThighAngleDeg: 80.6,
            leftKneeAngleDeg: -44.01,
            rightKneeAngleDeg: -32.98,
            hipYOffset: -10.0
        },
        {
            // FRAME 6
            spineAngleDeg: -129.23,
            shoulderJointDist: 41.29,
            shoulderJointAngleDeg: 100.52,
            leftUpperArmAngleDeg: 96.97,
            leftElbowAngleDeg: 93.57,
            rightUpperArmAngleDeg: 24.29,
            rightElbowAngleDeg: 75.97,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 158.71,
            rightThighAngleDeg: 80.77,
            leftKneeAngleDeg: -43.71,
            rightKneeAngleDeg: -33.86,
            hipYOffset: -10.0
        },
        {
            // FRAME 7
            spineAngleDeg: -129.0,
            shoulderJointDist: 41.67,
            shoulderJointAngleDeg: 100.67,
            leftUpperArmAngleDeg: 96.67,
            leftElbowAngleDeg: 91.67,
            rightUpperArmAngleDeg: 24.67,
            rightElbowAngleDeg: 75.67,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 158.33,
            rightThighAngleDeg: 81.0,
            leftKneeAngleDeg: -43.33,
            rightKneeAngleDeg: -35.0,
            hipYOffset: -10.0
        },
        {
            // FRAME 8
            spineAngleDeg: -128.9,
            shoulderJointDist: 41.83,
            shoulderJointAngleDeg: 100.73,
            leftUpperArmAngleDeg: 96.54,
            leftElbowAngleDeg: 90.87,
            rightUpperArmAngleDeg: 24.83,
            rightElbowAngleDeg: 75.54,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 158.17,
            rightThighAngleDeg: 81.1,
            leftKneeAngleDeg: -43.17,
            rightKneeAngleDeg: -35.48,
            hipYOffset: -10.0
        },
        {
            // FRAME 9
            spineAngleDeg: -128.73,
            shoulderJointDist: 42.12,
            shoulderJointAngleDeg: 100.85,
            leftUpperArmAngleDeg: 96.31,
            leftElbowAngleDeg: 89.4,
            rightUpperArmAngleDeg: 25.12,
            rightElbowAngleDeg: 75.31,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 157.88,
            rightThighAngleDeg: 81.27,
            leftKneeAngleDeg: -42.88,
            rightKneeAngleDeg: -36.36,
            hipYOffset: -10.0
        },
        {
            // FRAME 10
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
            // FRAME 11
            spineAngleDeg: -128.4,
            shoulderJointDist: 42.66,
            shoulderJointAngleDeg: 101.06,
            leftUpperArmAngleDeg: 95.87,
            leftElbowAngleDeg: 86.7,
            rightUpperArmAngleDeg: 25.66,
            rightElbowAngleDeg: 74.87,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 157.34,
            rightThighAngleDeg: 81.6,
            leftKneeAngleDeg: -42.34,
            rightKneeAngleDeg: -37.98,
            hipYOffset: -10.0
        },
        {
            // FRAME 12
            spineAngleDeg: -128.23,
            shoulderJointDist: 42.95,
            shoulderJointAngleDeg: 101.18,
            leftUpperArmAngleDeg: 95.64,
            leftElbowAngleDeg: 85.23,
            rightUpperArmAngleDeg: 25.95,
            rightElbowAngleDeg: 74.64,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 157.05,
            rightThighAngleDeg: 81.77,
            leftKneeAngleDeg: -42.05,
            rightKneeAngleDeg: -38.86,
            hipYOffset: -10.0
        },
        {
            // FRAME 13
            spineAngleDeg: -128.0,
            shoulderJointDist: 43.33,
            shoulderJointAngleDeg: 101.33,
            leftUpperArmAngleDeg: 95.33,
            leftElbowAngleDeg: 83.33,
            rightUpperArmAngleDeg: 26.33,
            rightElbowAngleDeg: 74.33,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 156.67,
            rightThighAngleDeg: 82.0,
            leftKneeAngleDeg: -41.67,
            rightKneeAngleDeg: -40.0,
            hipYOffset: -10.0
        },
        {
            // FRAME 14
            spineAngleDeg: -127.9,
            shoulderJointDist: 43.49,
            shoulderJointAngleDeg: 101.4,
            leftUpperArmAngleDeg: 95.2,
            leftElbowAngleDeg: 82.53,
            rightUpperArmAngleDeg: 26.49,
            rightElbowAngleDeg: 74.2,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 156.51,
            rightThighAngleDeg: 82.1,
            leftKneeAngleDeg: -41.51,
            rightKneeAngleDeg: -40.48,
            hipYOffset: -10.0
        },
        {
            // FRAME 15
            spineAngleDeg: -127.73,
            shoulderJointDist: 43.79,
            shoulderJointAngleDeg: 101.52,
            leftUpperArmAngleDeg: 94.97,
            leftElbowAngleDeg: 81.07,
            rightUpperArmAngleDeg: 26.79,
            rightElbowAngleDeg: 73.97,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 156.21,
            rightThighAngleDeg: 82.27,
            leftKneeAngleDeg: -41.21,
            rightKneeAngleDeg: -41.36,
            hipYOffset: -10.0
        },
        {
            // FRAME 16
            spineAngleDeg: -127.5,
            shoulderJointDist: 44.17,
            shoulderJointAngleDeg: 101.67,
            leftUpperArmAngleDeg: 94.67,
            leftElbowAngleDeg: 79.17,
            rightUpperArmAngleDeg: 27.17,
            rightElbowAngleDeg: 73.67,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 155.83,
            rightThighAngleDeg: 82.5,
            leftKneeAngleDeg: -40.83,
            rightKneeAngleDeg: -42.5,
            hipYOffset: -10.0
        },
        {
            // FRAME 17
            spineAngleDeg: -127.4,
            shoulderJointDist: 44.33,
            shoulderJointAngleDeg: 101.73,
            leftUpperArmAngleDeg: 94.54,
            leftElbowAngleDeg: 78.37,
            rightUpperArmAngleDeg: 27.33,
            rightElbowAngleDeg: 73.54,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 155.67,
            rightThighAngleDeg: 82.6,
            leftKneeAngleDeg: -40.67,
            rightKneeAngleDeg: -42.98,
            hipYOffset: -10.0
        },
        {
            // FRAME 18
            spineAngleDeg: -127.23,
            shoulderJointDist: 44.62,
            shoulderJointAngleDeg: 101.85,
            leftUpperArmAngleDeg: 94.31,
            leftElbowAngleDeg: 76.9,
            rightUpperArmAngleDeg: 27.62,
            rightElbowAngleDeg: 73.31,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 155.38,
            rightThighAngleDeg: 82.77,
            leftKneeAngleDeg: -40.38,
            rightKneeAngleDeg: -43.86,
            hipYOffset: -10.0
        },
        {
            // FRAME 19
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
            // FRAME 20
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
            // FRAME 21
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
            // FRAME 22
            spineAngleDeg: -126.9,
            shoulderJointDist: 45.16,
            shoulderJointAngleDeg: 102.1,
            leftUpperArmAngleDeg: 93.87,
            leftElbowAngleDeg: 59.52,
            rightUpperArmAngleDeg: 28.16,
            rightElbowAngleDeg: 72.9,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 154.84,
            rightThighAngleDeg: 83.06,
            leftKneeAngleDeg: -34.84,
            rightKneeAngleDeg: -45.48,
            hipYOffset: -10.0
        },
        {
            // FRAME 23
            spineAngleDeg: -126.73,
            shoulderJointDist: 45.45,
            shoulderJointAngleDeg: 102.27,
            leftUpperArmAngleDeg: 93.64,
            leftElbowAngleDeg: 58.64,
            rightUpperArmAngleDeg: 28.45,
            rightElbowAngleDeg: 72.73,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 154.55,
            rightThighAngleDeg: 83.18,
            leftKneeAngleDeg: -34.55,
            rightKneeAngleDeg: -46.36,
            hipYOffset: -10.0
        },
        {
            // FRAME 24
            spineAngleDeg: -126.5,
            shoulderJointDist: 45.83,
            shoulderJointAngleDeg: 102.5,
            leftUpperArmAngleDeg: 93.33,
            leftElbowAngleDeg: 57.5,
            rightUpperArmAngleDeg: 28.83,
            rightElbowAngleDeg: 72.5,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 154.17,
            rightThighAngleDeg: 83.33,
            leftKneeAngleDeg: -34.17,
            rightKneeAngleDeg: -47.5,
            hipYOffset: -10.0
        },
        {
            // FRAME 25
            spineAngleDeg: -126.4,
            shoulderJointDist: 45.99,
            shoulderJointAngleDeg: 102.6,
            leftUpperArmAngleDeg: 93.2,
            leftElbowAngleDeg: 57.02,
            rightUpperArmAngleDeg: 28.99,
            rightElbowAngleDeg: 72.4,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 154.01,
            rightThighAngleDeg: 83.4,
            leftKneeAngleDeg: -34.01,
            rightKneeAngleDeg: -47.98,
            hipYOffset: -10.0
        },
        {
            // FRAME 26
            spineAngleDeg: -126.23,
            shoulderJointDist: 46.29,
            shoulderJointAngleDeg: 102.77,
            leftUpperArmAngleDeg: 92.97,
            leftElbowAngleDeg: 56.14,
            rightUpperArmAngleDeg: 29.29,
            rightElbowAngleDeg: 72.23,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 153.71,
            rightThighAngleDeg: 83.52,
            leftKneeAngleDeg: -33.71,
            rightKneeAngleDeg: -48.86,
            hipYOffset: -10.0
        },
        {
            // FRAME 27
            spineAngleDeg: -126.0,
            shoulderJointDist: 46.67,
            shoulderJointAngleDeg: 103.0,
            leftUpperArmAngleDeg: 92.67,
            leftElbowAngleDeg: 55.0,
            rightUpperArmAngleDeg: 29.67,
            rightElbowAngleDeg: 72.0,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 153.33,
            rightThighAngleDeg: 83.67,
            leftKneeAngleDeg: -33.33,
            rightKneeAngleDeg: -50.0,
            hipYOffset: -10.0
        },
        {
            // FRAME 28
            spineAngleDeg: -125.9,
            shoulderJointDist: 46.83,
            shoulderJointAngleDeg: 103.1,
            leftUpperArmAngleDeg: 92.54,
            leftElbowAngleDeg: 54.52,
            rightUpperArmAngleDeg: 29.83,
            rightElbowAngleDeg: 71.9,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 153.17,
            rightThighAngleDeg: 83.73,
            leftKneeAngleDeg: -33.17,
            rightKneeAngleDeg: -50.48,
            hipYOffset: -10.0
        },
        {
            // FRAME 29
            spineAngleDeg: -125.73,
            shoulderJointDist: 47.12,
            shoulderJointAngleDeg: 103.27,
            leftUpperArmAngleDeg: 92.31,
            leftElbowAngleDeg: 53.64,
            rightUpperArmAngleDeg: 30.12,
            rightElbowAngleDeg: 71.73,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 152.88,
            rightThighAngleDeg: 83.85,
            leftKneeAngleDeg: -32.88,
            rightKneeAngleDeg: -51.36,
            hipYOffset: -10.0
        },
        {
            // FRAME 30
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
            // FRAME 31
            spineAngleDeg: -125.4,
            shoulderJointDist: 47.66,
            shoulderJointAngleDeg: 103.6,
            leftUpperArmAngleDeg: 91.87,
            leftElbowAngleDeg: 52.02,
            rightUpperArmAngleDeg: 30.66,
            rightElbowAngleDeg: 71.4,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 152.34,
            rightThighAngleDeg: 84.06,
            leftKneeAngleDeg: -32.34,
            rightKneeAngleDeg: -52.98,
            hipYOffset: -10.0
        },
        {
            // FRAME 32
            spineAngleDeg: -125.23,
            shoulderJointDist: 47.95,
            shoulderJointAngleDeg: 103.77,
            leftUpperArmAngleDeg: 91.64,
            leftElbowAngleDeg: 51.14,
            rightUpperArmAngleDeg: 30.95,
            rightElbowAngleDeg: 71.23,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 152.05,
            rightThighAngleDeg: 84.18,
            leftKneeAngleDeg: -32.05,
            rightKneeAngleDeg: -53.86,
            hipYOffset: -10.0
        },
        {
            // FRAME 33
            spineAngleDeg: -125.0,
            shoulderJointDist: 48.33,
            shoulderJointAngleDeg: 104.0,
            leftUpperArmAngleDeg: 91.33,
            leftElbowAngleDeg: 50.0,
            rightUpperArmAngleDeg: 31.33,
            rightElbowAngleDeg: 71.0,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 151.67,
            rightThighAngleDeg: 84.33,
            leftKneeAngleDeg: -31.67,
            rightKneeAngleDeg: -55.0,
            hipYOffset: -10.0
        },
        {
            // FRAME 34
            spineAngleDeg: -124.9,
            shoulderJointDist: 48.49,
            shoulderJointAngleDeg: 104.1,
            leftUpperArmAngleDeg: 91.2,
            leftElbowAngleDeg: 49.52,
            rightUpperArmAngleDeg: 31.49,
            rightElbowAngleDeg: 70.9,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 151.51,
            rightThighAngleDeg: 84.4,
            leftKneeAngleDeg: -31.51,
            rightKneeAngleDeg: -55.48,
            hipYOffset: -10.0
        },
        {
            // FRAME 35
            spineAngleDeg: -124.73,
            shoulderJointDist: 48.79,
            shoulderJointAngleDeg: 104.27,
            leftUpperArmAngleDeg: 90.97,
            leftElbowAngleDeg: 48.64,
            rightUpperArmAngleDeg: 31.79,
            rightElbowAngleDeg: 70.73,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 151.21,
            rightThighAngleDeg: 84.52,
            leftKneeAngleDeg: -31.21,
            rightKneeAngleDeg: -56.36,
            hipYOffset: -10.0
        },
        {
            // FRAME 36
            spineAngleDeg: -124.5,
            shoulderJointDist: 49.17,
            shoulderJointAngleDeg: 104.5,
            leftUpperArmAngleDeg: 90.67,
            leftElbowAngleDeg: 47.5,
            rightUpperArmAngleDeg: 32.17,
            rightElbowAngleDeg: 70.5,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 150.83,
            rightThighAngleDeg: 84.67,
            leftKneeAngleDeg: -30.83,
            rightKneeAngleDeg: -57.5,
            hipYOffset: -10.0
        },
        {
            // FRAME 37
            spineAngleDeg: -124.4,
            shoulderJointDist: 49.33,
            shoulderJointAngleDeg: 104.6,
            leftUpperArmAngleDeg: 90.54,
            leftElbowAngleDeg: 47.02,
            rightUpperArmAngleDeg: 32.33,
            rightElbowAngleDeg: 70.4,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 150.67,
            rightThighAngleDeg: 84.73,
            leftKneeAngleDeg: -30.67,
            rightKneeAngleDeg: -57.98,
            hipYOffset: -10.0
        },
        {
            // FRAME 38
            spineAngleDeg: -124.23,
            shoulderJointDist: 49.62,
            shoulderJointAngleDeg: 104.77,
            leftUpperArmAngleDeg: 90.31,
            leftElbowAngleDeg: 46.14,
            rightUpperArmAngleDeg: 32.62,
            rightElbowAngleDeg: 70.23,
            pelvisJointDist: 10.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 150.38,
            rightThighAngleDeg: 84.85,
            leftKneeAngleDeg: -30.38,
            rightKneeAngleDeg: -58.86,
            hipYOffset: -10.0
        },
        {
            // FRAME 39
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
            // FRAME 40
            spineAngleDeg: -123.88,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 89.41,
            leftElbowAngleDeg: 44.59,
            rightUpperArmAngleDeg: 33.47,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 9.41,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 149.41,
            rightThighAngleDeg: 85.24,
            leftKneeAngleDeg: -29.88,
            rightKneeAngleDeg: -60.77,
            hipYOffset: -10.12
        },
        {
            // FRAME 41
            spineAngleDeg: -123.67,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 88.33,
            leftElbowAngleDeg: 43.83,
            rightUpperArmAngleDeg: 34.33,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 8.33,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 148.33,
            rightThighAngleDeg: 85.67,
            leftKneeAngleDeg: -29.67,
            rightKneeAngleDeg: -62.17,
            hipYOffset: -10.33
        },
        {
            // FRAME 42
            spineAngleDeg: -123.55,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 87.74,
            leftElbowAngleDeg: 43.42,
            rightUpperArmAngleDeg: 34.8,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 7.74,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 147.74,
            rightThighAngleDeg: 85.9,
            leftKneeAngleDeg: -29.55,
            rightKneeAngleDeg: -62.93,
            hipYOffset: -10.45
        },
        {
            // FRAME 43
            spineAngleDeg: -123.33,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 86.67,
            leftElbowAngleDeg: 42.67,
            rightUpperArmAngleDeg: 35.67,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 6.67,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 146.67,
            rightThighAngleDeg: 86.33,
            leftKneeAngleDeg: -29.33,
            rightKneeAngleDeg: -64.33,
            hipYOffset: -10.67
        },
        {
            // FRAME 44
            spineAngleDeg: -123.21,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 86.08,
            leftElbowAngleDeg: 42.26,
            rightUpperArmAngleDeg: 36.14,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 6.08,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 146.08,
            rightThighAngleDeg: 86.57,
            leftKneeAngleDeg: -29.21,
            rightKneeAngleDeg: -65.1,
            hipYOffset: -10.79
        },
        {
            // FRAME 45
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
            // FRAME 46
            spineAngleDeg: -122.88,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 84.41,
            leftElbowAngleDeg: 41.09,
            rightUpperArmAngleDeg: 37.47,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 4.41,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 144.41,
            rightThighAngleDeg: 87.24,
            leftKneeAngleDeg: -28.88,
            rightKneeAngleDeg: -67.27,
            hipYOffset: -11.12
        },
        {
            // FRAME 47
            spineAngleDeg: -122.67,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 83.33,
            leftElbowAngleDeg: 40.33,
            rightUpperArmAngleDeg: 38.33,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 3.33,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 143.33,
            rightThighAngleDeg: 87.67,
            leftKneeAngleDeg: -28.67,
            rightKneeAngleDeg: -68.67,
            hipYOffset: -11.33
        },
        {
            // FRAME 48
            spineAngleDeg: -122.55,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 82.74,
            leftElbowAngleDeg: 39.92,
            rightUpperArmAngleDeg: 38.8,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 2.74,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 142.74,
            rightThighAngleDeg: 87.9,
            leftKneeAngleDeg: -28.55,
            rightKneeAngleDeg: -69.43,
            hipYOffset: -11.45
        },
        {
            // FRAME 49
            spineAngleDeg: -122.33,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 81.67,
            leftElbowAngleDeg: 39.17,
            rightUpperArmAngleDeg: 39.67,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 1.67,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 141.67,
            rightThighAngleDeg: 88.33,
            leftKneeAngleDeg: -28.33,
            rightKneeAngleDeg: -70.83,
            hipYOffset: -11.67
        },
        {
            // FRAME 50
            spineAngleDeg: -122.21,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 81.08,
            leftElbowAngleDeg: 38.76,
            rightUpperArmAngleDeg: 40.14,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 1.08,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 141.08,
            rightThighAngleDeg: 88.57,
            leftKneeAngleDeg: -28.21,
            rightKneeAngleDeg: -71.6,
            hipYOffset: -11.79
        },
        {
            // FRAME 51
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
            // FRAME 52
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
            rightKneeAngleDeg: -73.71,
            hipYOffset: -12.12
        },
        {
            // FRAME 53
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
            rightKneeAngleDeg: -75.0,
            hipYOffset: -12.33
        },
        {
            // FRAME 54
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
            rightKneeAngleDeg: -75.71,
            hipYOffset: -12.45
        },
        {
            // FRAME 55
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
            rightKneeAngleDeg: -77.0,
            hipYOffset: -12.67
        },
        {
            // FRAME 56
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
            rightKneeAngleDeg: -77.71,
            hipYOffset: -12.79
        },
        {
            // FRAME 57
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
            // FRAME 58
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
            rightKneeAngleDeg: -79.71,
            hipYOffset: -13.12
        },
        {
            // FRAME 59
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
            rightKneeAngleDeg: -81.0,
            hipYOffset: -13.33
        },
        {
            // FRAME 60
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
            rightKneeAngleDeg: -81.71,
            hipYOffset: -13.45
        },
        {
            // FRAME 61
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
            rightKneeAngleDeg: -83.0,
            hipYOffset: -13.67
        },
        {
            // FRAME 62
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
            rightKneeAngleDeg: -83.71,
            hipYOffset: -13.79
        },
        {
            // FRAME 63
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
            // FRAME 64
            spineAngleDeg: -121.9,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 79.52,
            leftElbowAngleDeg: 37.62,
            rightUpperArmAngleDeg: 41.43,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -0.48,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 139.52,
            rightThighAngleDeg: 89.14,
            leftKneeAngleDeg: -27.86,
            rightKneeAngleDeg: -85.48,
            hipYOffset: -14.05
        },
        {
            // FRAME 65
            spineAngleDeg: -121.73,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 78.64,
            leftElbowAngleDeg: 36.91,
            rightUpperArmAngleDeg: 42.22,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -1.36,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 138.64,
            rightThighAngleDeg: 89.41,
            leftKneeAngleDeg: -27.59,
            rightKneeAngleDeg: -86.36,
            hipYOffset: -14.14
        },
        {
            // FRAME 66
            spineAngleDeg: -121.5,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 77.5,
            leftElbowAngleDeg: 36.0,
            rightUpperArmAngleDeg: 43.25,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -2.5,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 137.5,
            rightThighAngleDeg: 89.75,
            leftKneeAngleDeg: -27.25,
            rightKneeAngleDeg: -87.5,
            hipYOffset: -14.25
        },
        {
            // FRAME 67
            spineAngleDeg: -121.4,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 77.02,
            leftElbowAngleDeg: 35.62,
            rightUpperArmAngleDeg: 43.68,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -2.98,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 137.02,
            rightThighAngleDeg: 89.89,
            leftKneeAngleDeg: -27.11,
            rightKneeAngleDeg: -87.98,
            hipYOffset: -14.3
        },
        {
            // FRAME 68
            spineAngleDeg: -121.23,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 76.14,
            leftElbowAngleDeg: 34.91,
            rightUpperArmAngleDeg: 44.47,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -3.86,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 136.14,
            rightThighAngleDeg: 90.16,
            leftKneeAngleDeg: -26.84,
            rightKneeAngleDeg: -88.86,
            hipYOffset: -14.39
        },
        {
            // FRAME 69
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
            // FRAME 70
            spineAngleDeg: -120.9,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 74.52,
            leftElbowAngleDeg: 33.62,
            rightUpperArmAngleDeg: 45.93,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -5.48,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 134.52,
            rightThighAngleDeg: 90.64,
            leftKneeAngleDeg: -26.36,
            rightKneeAngleDeg: -90.48,
            hipYOffset: -14.55
        },
        {
            // FRAME 71
            spineAngleDeg: -120.73,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 73.64,
            leftElbowAngleDeg: 32.91,
            rightUpperArmAngleDeg: 46.72,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -6.36,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 133.64,
            rightThighAngleDeg: 90.91,
            leftKneeAngleDeg: -26.09,
            rightKneeAngleDeg: -91.36,
            hipYOffset: -14.64
        },
        {
            // FRAME 72
            spineAngleDeg: -120.5,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 72.5,
            leftElbowAngleDeg: 32.0,
            rightUpperArmAngleDeg: 47.75,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -7.5,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 132.5,
            rightThighAngleDeg: 91.25,
            leftKneeAngleDeg: -25.75,
            rightKneeAngleDeg: -92.5,
            hipYOffset: -14.75
        },
        {
            // FRAME 73
            spineAngleDeg: -120.4,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 72.02,
            leftElbowAngleDeg: 31.62,
            rightUpperArmAngleDeg: 48.18,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -7.98,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 132.02,
            rightThighAngleDeg: 91.39,
            leftKneeAngleDeg: -25.61,
            rightKneeAngleDeg: -92.98,
            hipYOffset: -14.8
        },
        {
            // FRAME 74
            spineAngleDeg: -120.23,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 71.14,
            leftElbowAngleDeg: 30.91,
            rightUpperArmAngleDeg: 48.97,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -8.86,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 131.14,
            rightThighAngleDeg: 91.66,
            leftKneeAngleDeg: -25.34,
            rightKneeAngleDeg: -93.86,
            hipYOffset: -14.89
        },
        {
            // FRAME 75
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
            // FRAME 76
            spineAngleDeg: -120.44,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 29.73,
            rightUpperArmAngleDeg: 50.44,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -10.71,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 130.44,
            rightThighAngleDeg: 92.8,
            leftKneeAngleDeg: -25.18,
            rightKneeAngleDeg: -95.62,
            hipYOffset: -14.91
        },
        {
            // FRAME 77
            spineAngleDeg: -121.25,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 29.25,
            rightUpperArmAngleDeg: 51.25,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -12.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 131.25,
            rightThighAngleDeg: 94.25,
            leftKneeAngleDeg: -25.5,
            rightKneeAngleDeg: -96.75,
            hipYOffset: -14.75
        },
        {
            // FRAME 78
            spineAngleDeg: -121.69,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 28.98,
            rightUpperArmAngleDeg: 51.69,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -12.71,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 131.69,
            rightThighAngleDeg: 95.05,
            leftKneeAngleDeg: -25.68,
            rightKneeAngleDeg: -97.37,
            hipYOffset: -14.66
        },
        {
            // FRAME 79
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
            // FRAME 80
            spineAngleDeg: -122.94,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 28.23,
            rightUpperArmAngleDeg: 52.94,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -14.71,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 132.94,
            rightThighAngleDeg: 97.3,
            leftKneeAngleDeg: -26.18,
            rightKneeAngleDeg: -99.12,
            hipYOffset: -14.41
        },
        {
            // FRAME 81
            spineAngleDeg: -123.75,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 27.75,
            rightUpperArmAngleDeg: 53.75,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -16.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 133.75,
            rightThighAngleDeg: 98.75,
            leftKneeAngleDeg: -26.5,
            rightKneeAngleDeg: -100.25,
            hipYOffset: -14.25
        },
        {
            // FRAME 82
            spineAngleDeg: -124.19,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 27.48,
            rightUpperArmAngleDeg: 54.19,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -16.71,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 134.19,
            rightThighAngleDeg: 99.55,
            leftKneeAngleDeg: -26.68,
            rightKneeAngleDeg: -100.87,
            hipYOffset: -14.16
        },
        {
            // FRAME 83
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
            // FRAME 84
            spineAngleDeg: -125.44,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 26.82,
            rightUpperArmAngleDeg: 55.44,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -18.62,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 135.44,
            rightThighAngleDeg: 101.8,
            leftKneeAngleDeg: -27.27,
            rightKneeAngleDeg: -102.71,
            hipYOffset: -13.82
        },
        {
            // FRAME 85
            spineAngleDeg: -126.25,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 26.5,
            rightUpperArmAngleDeg: 56.25,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -19.75,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 136.25,
            rightThighAngleDeg: 103.25,
            leftKneeAngleDeg: -27.75,
            rightKneeAngleDeg: -104.0,
            hipYOffset: -13.5
        },
        {
            // FRAME 86
            spineAngleDeg: -126.69,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 26.32,
            rightUpperArmAngleDeg: 56.69,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -20.37,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 136.69,
            rightThighAngleDeg: 104.05,
            leftKneeAngleDeg: -28.02,
            rightKneeAngleDeg: -104.71,
            hipYOffset: -13.32
        },
        {
            // FRAME 87
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
            // FRAME 88
            spineAngleDeg: -127.94,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 25.82,
            rightUpperArmAngleDeg: 57.94,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -22.12,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 137.94,
            rightThighAngleDeg: 106.3,
            leftKneeAngleDeg: -28.77,
            rightKneeAngleDeg: -106.71,
            hipYOffset: -12.82
        },
        {
            // FRAME 89
            spineAngleDeg: -128.75,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 25.5,
            rightUpperArmAngleDeg: 58.75,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -23.25,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 138.75,
            rightThighAngleDeg: 107.75,
            leftKneeAngleDeg: -29.25,
            rightKneeAngleDeg: -108.0,
            hipYOffset: -12.5
        },
        {
            // FRAME 90
            spineAngleDeg: -129.19,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 25.32,
            rightUpperArmAngleDeg: 59.19,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: -23.87,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 139.19,
            rightThighAngleDeg: 108.55,
            leftKneeAngleDeg: -29.52,
            rightKneeAngleDeg: -108.71,
            hipYOffset: -12.32
        },
        {
            // FRAME 91
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
            // FRAME 92
            spineAngleDeg: -130.14,
            shoulderJointDist: 49.76,
            shoulderJointAngleDeg: 105.48,
            leftUpperArmAngleDeg: 69.52,
            leftElbowAngleDeg: 25.72,
            rightUpperArmAngleDeg: 60.24,
            rightElbowAngleDeg: 70.1,
            pelvisJointDist: -25.1,
            pelvisJointAngleDeg: 100.48,
            leftThighAngleDeg: 139.52,
            rightThighAngleDeg: 110.05,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -110.24,
            hipYOffset: -12.05
        },
        {
            // FRAME 93
            spineAngleDeg: -130.41,
            shoulderJointDist: 49.32,
            shoulderJointAngleDeg: 106.36,
            leftUpperArmAngleDeg: 68.64,
            leftElbowAngleDeg: 27.04,
            rightUpperArmAngleDeg: 60.68,
            rightElbowAngleDeg: 70.27,
            pelvisJointDist: -25.27,
            pelvisJointAngleDeg: 101.36,
            leftThighAngleDeg: 138.64,
            rightThighAngleDeg: 110.14,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -110.68,
            hipYOffset: -12.14
        },
        {
            // FRAME 94
            spineAngleDeg: -130.75,
            shoulderJointDist: 48.75,
            shoulderJointAngleDeg: 107.5,
            leftUpperArmAngleDeg: 67.5,
            leftElbowAngleDeg: 28.75,
            rightUpperArmAngleDeg: 61.25,
            rightElbowAngleDeg: 70.5,
            pelvisJointDist: -25.5,
            pelvisJointAngleDeg: 102.5,
            leftThighAngleDeg: 137.5,
            rightThighAngleDeg: 110.25,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -111.25,
            hipYOffset: -12.25
        },
        {
            // FRAME 95
            spineAngleDeg: -130.89,
            shoulderJointDist: 48.51,
            shoulderJointAngleDeg: 107.98,
            leftUpperArmAngleDeg: 67.02,
            leftElbowAngleDeg: 29.47,
            rightUpperArmAngleDeg: 61.49,
            rightElbowAngleDeg: 70.6,
            pelvisJointDist: -25.6,
            pelvisJointAngleDeg: 102.98,
            leftThighAngleDeg: 137.02,
            rightThighAngleDeg: 110.3,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -111.49,
            hipYOffset: -12.3
        },
        {
            // FRAME 96
            spineAngleDeg: -131.16,
            shoulderJointDist: 48.07,
            shoulderJointAngleDeg: 108.86,
            leftUpperArmAngleDeg: 66.14,
            leftElbowAngleDeg: 30.79,
            rightUpperArmAngleDeg: 61.93,
            rightElbowAngleDeg: 70.77,
            pelvisJointDist: -25.77,
            pelvisJointAngleDeg: 103.86,
            leftThighAngleDeg: 136.14,
            rightThighAngleDeg: 110.39,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -111.93,
            hipYOffset: -12.39
        },
        {
            // FRAME 97
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
            // FRAME 98
            spineAngleDeg: -131.64,
            shoulderJointDist: 47.26,
            shoulderJointAngleDeg: 110.48,
            leftUpperArmAngleDeg: 64.52,
            leftElbowAngleDeg: 33.22,
            rightUpperArmAngleDeg: 62.74,
            rightElbowAngleDeg: 71.1,
            pelvisJointDist: -26.1,
            pelvisJointAngleDeg: 105.48,
            leftThighAngleDeg: 134.52,
            rightThighAngleDeg: 110.55,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -112.74,
            hipYOffset: -12.55
        },
        {
            // FRAME 99
            spineAngleDeg: -131.91,
            shoulderJointDist: 46.82,
            shoulderJointAngleDeg: 111.36,
            leftUpperArmAngleDeg: 63.64,
            leftElbowAngleDeg: 34.54,
            rightUpperArmAngleDeg: 63.18,
            rightElbowAngleDeg: 71.27,
            pelvisJointDist: -26.27,
            pelvisJointAngleDeg: 106.36,
            leftThighAngleDeg: 133.64,
            rightThighAngleDeg: 110.64,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -113.18,
            hipYOffset: -12.64
        },
        {
            // FRAME 100
            spineAngleDeg: -132.25,
            shoulderJointDist: 46.25,
            shoulderJointAngleDeg: 112.5,
            leftUpperArmAngleDeg: 62.5,
            leftElbowAngleDeg: 36.25,
            rightUpperArmAngleDeg: 63.75,
            rightElbowAngleDeg: 71.5,
            pelvisJointDist: -26.5,
            pelvisJointAngleDeg: 107.5,
            leftThighAngleDeg: 132.5,
            rightThighAngleDeg: 110.75,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -113.75,
            hipYOffset: -12.75
        },
        {
            // FRAME 101
            spineAngleDeg: -132.39,
            shoulderJointDist: 46.01,
            shoulderJointAngleDeg: 112.98,
            leftUpperArmAngleDeg: 62.02,
            leftElbowAngleDeg: 36.97,
            rightUpperArmAngleDeg: 63.99,
            rightElbowAngleDeg: 71.6,
            pelvisJointDist: -26.6,
            pelvisJointAngleDeg: 107.98,
            leftThighAngleDeg: 132.02,
            rightThighAngleDeg: 110.8,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -113.99,
            hipYOffset: -12.8
        },
        {
            // FRAME 102
            spineAngleDeg: -132.66,
            shoulderJointDist: 45.57,
            shoulderJointAngleDeg: 113.86,
            leftUpperArmAngleDeg: 61.14,
            leftElbowAngleDeg: 38.29,
            rightUpperArmAngleDeg: 64.43,
            rightElbowAngleDeg: 71.77,
            pelvisJointDist: -26.77,
            pelvisJointAngleDeg: 108.86,
            leftThighAngleDeg: 131.14,
            rightThighAngleDeg: 110.89,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -114.43,
            hipYOffset: -12.89
        },
        {
            // FRAME 103
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
            // FRAME 104
            spineAngleDeg: -133.0,
            shoulderJointDist: 45.0,
            shoulderJointAngleDeg: 115.0,
            leftUpperArmAngleDeg: 60.0,
            leftElbowAngleDeg: 40.72,
            rightUpperArmAngleDeg: 65.0,
            rightElbowAngleDeg: 72.0,
            pelvisJointDist: -27.0,
            pelvisJointAngleDeg: 110.48,
            leftThighAngleDeg: 129.52,
            rightThighAngleDeg: 111.14,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -115.24,
            hipYOffset: -13.1
        },
        {
            // FRAME 105
            spineAngleDeg: -133.0,
            shoulderJointDist: 45.0,
            shoulderJointAngleDeg: 115.0,
            leftUpperArmAngleDeg: 60.0,
            leftElbowAngleDeg: 42.04,
            rightUpperArmAngleDeg: 65.0,
            rightElbowAngleDeg: 72.0,
            pelvisJointDist: -27.0,
            pelvisJointAngleDeg: 111.36,
            leftThighAngleDeg: 128.64,
            rightThighAngleDeg: 111.41,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -115.68,
            hipYOffset: -13.27
        },
        {
            // FRAME 106
            spineAngleDeg: -133.0,
            shoulderJointDist: 45.0,
            shoulderJointAngleDeg: 115.0,
            leftUpperArmAngleDeg: 60.0,
            leftElbowAngleDeg: 43.75,
            rightUpperArmAngleDeg: 65.0,
            rightElbowAngleDeg: 72.0,
            pelvisJointDist: -27.0,
            pelvisJointAngleDeg: 112.5,
            leftThighAngleDeg: 127.5,
            rightThighAngleDeg: 111.75,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -116.25,
            hipYOffset: -13.5
        },
        {
            // FRAME 107
            spineAngleDeg: -133.0,
            shoulderJointDist: 45.0,
            shoulderJointAngleDeg: 115.0,
            leftUpperArmAngleDeg: 60.0,
            leftElbowAngleDeg: 44.47,
            rightUpperArmAngleDeg: 65.0,
            rightElbowAngleDeg: 72.0,
            pelvisJointDist: -27.0,
            pelvisJointAngleDeg: 112.98,
            leftThighAngleDeg: 127.02,
            rightThighAngleDeg: 111.89,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -116.49,
            hipYOffset: -13.6
        },
        {
            // FRAME 108
            spineAngleDeg: -133.0,
            shoulderJointDist: 45.0,
            shoulderJointAngleDeg: 115.0,
            leftUpperArmAngleDeg: 60.0,
            leftElbowAngleDeg: 45.79,
            rightUpperArmAngleDeg: 65.0,
            rightElbowAngleDeg: 72.0,
            pelvisJointDist: -27.0,
            pelvisJointAngleDeg: 113.86,
            leftThighAngleDeg: 126.14,
            rightThighAngleDeg: 112.16,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -116.93,
            hipYOffset: -13.77
        },
        {
            // FRAME 109
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
            // FRAME 110
            spineAngleDeg: -133.0,
            shoulderJointDist: 45.0,
            shoulderJointAngleDeg: 115.0,
            leftUpperArmAngleDeg: 60.0,
            leftElbowAngleDeg: 48.22,
            rightUpperArmAngleDeg: 65.0,
            rightElbowAngleDeg: 72.0,
            pelvisJointDist: -27.0,
            pelvisJointAngleDeg: 115.48,
            leftThighAngleDeg: 124.52,
            rightThighAngleDeg: 112.64,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -117.74,
            hipYOffset: -14.1
        },
        {
            // FRAME 111
            spineAngleDeg: -133.0,
            shoulderJointDist: 45.0,
            shoulderJointAngleDeg: 115.0,
            leftUpperArmAngleDeg: 60.0,
            leftElbowAngleDeg: 49.54,
            rightUpperArmAngleDeg: 65.0,
            rightElbowAngleDeg: 72.0,
            pelvisJointDist: -27.0,
            pelvisJointAngleDeg: 116.36,
            leftThighAngleDeg: 123.64,
            rightThighAngleDeg: 112.91,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -118.18,
            hipYOffset: -14.27
        },
        {
            // FRAME 112
            spineAngleDeg: -133.0,
            shoulderJointDist: 45.0,
            shoulderJointAngleDeg: 115.0,
            leftUpperArmAngleDeg: 60.0,
            leftElbowAngleDeg: 51.25,
            rightUpperArmAngleDeg: 65.0,
            rightElbowAngleDeg: 72.0,
            pelvisJointDist: -27.0,
            pelvisJointAngleDeg: 117.5,
            leftThighAngleDeg: 122.5,
            rightThighAngleDeg: 113.25,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -118.75,
            hipYOffset: -14.5
        },
        {
            // FRAME 113
            spineAngleDeg: -133.0,
            shoulderJointDist: 45.0,
            shoulderJointAngleDeg: 115.0,
            leftUpperArmAngleDeg: 60.0,
            leftElbowAngleDeg: 51.97,
            rightUpperArmAngleDeg: 65.0,
            rightElbowAngleDeg: 72.0,
            pelvisJointDist: -27.0,
            pelvisJointAngleDeg: 117.98,
            leftThighAngleDeg: 122.02,
            rightThighAngleDeg: 113.39,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -118.99,
            hipYOffset: -14.6
        },
        {
            // FRAME 114
            spineAngleDeg: -133.0,
            shoulderJointDist: 45.0,
            shoulderJointAngleDeg: 115.0,
            leftUpperArmAngleDeg: 60.0,
            leftElbowAngleDeg: 53.29,
            rightUpperArmAngleDeg: 65.0,
            rightElbowAngleDeg: 72.0,
            pelvisJointDist: -27.0,
            pelvisJointAngleDeg: 118.86,
            leftThighAngleDeg: 121.14,
            rightThighAngleDeg: 113.66,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -119.43,
            hipYOffset: -14.77
        },
        {
            // FRAME 115
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
            // FRAME 116
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
            // FRAME 117
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
            // FRAME 118
            spineAngleDeg: -133.1,
            shoulderJointDist: 44.76,
            shoulderJointAngleDeg: 115.48,
            leftUpperArmAngleDeg: 59.52,
            leftElbowAngleDeg: 70.48,
            rightUpperArmAngleDeg: 65.24,
            rightElbowAngleDeg: 72.14,
            pelvisJointDist: -27.14,
            pelvisJointAngleDeg: 120.48,
            leftThighAngleDeg: 119.52,
            rightThighAngleDeg: 114.05,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -120.24,
            hipYOffset: -15.05
        },
        {
            // FRAME 119
            spineAngleDeg: -133.27,
            shoulderJointDist: 44.32,
            shoulderJointAngleDeg: 116.36,
            leftUpperArmAngleDeg: 58.64,
            leftElbowAngleDeg: 71.36,
            rightUpperArmAngleDeg: 65.68,
            rightElbowAngleDeg: 72.41,
            pelvisJointDist: -27.41,
            pelvisJointAngleDeg: 121.36,
            leftThighAngleDeg: 118.64,
            rightThighAngleDeg: 114.14,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -120.68,
            hipYOffset: -15.14
        },
        {
            // FRAME 120
            spineAngleDeg: -133.5,
            shoulderJointDist: 43.75,
            shoulderJointAngleDeg: 117.5,
            leftUpperArmAngleDeg: 57.5,
            leftElbowAngleDeg: 72.5,
            rightUpperArmAngleDeg: 66.25,
            rightElbowAngleDeg: 72.75,
            pelvisJointDist: -27.75,
            pelvisJointAngleDeg: 122.5,
            leftThighAngleDeg: 117.5,
            rightThighAngleDeg: 114.25,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -121.25,
            hipYOffset: -15.25
        },
        {
            // FRAME 121
            spineAngleDeg: -133.6,
            shoulderJointDist: 43.51,
            shoulderJointAngleDeg: 117.98,
            leftUpperArmAngleDeg: 57.02,
            leftElbowAngleDeg: 72.98,
            rightUpperArmAngleDeg: 66.49,
            rightElbowAngleDeg: 72.89,
            pelvisJointDist: -27.89,
            pelvisJointAngleDeg: 122.98,
            leftThighAngleDeg: 117.02,
            rightThighAngleDeg: 114.3,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -121.49,
            hipYOffset: -15.3
        },
        {
            // FRAME 122
            spineAngleDeg: -133.77,
            shoulderJointDist: 43.07,
            shoulderJointAngleDeg: 118.86,
            leftUpperArmAngleDeg: 56.14,
            leftElbowAngleDeg: 73.86,
            rightUpperArmAngleDeg: 66.93,
            rightElbowAngleDeg: 73.16,
            pelvisJointDist: -28.16,
            pelvisJointAngleDeg: 123.86,
            leftThighAngleDeg: 116.14,
            rightThighAngleDeg: 114.39,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -121.93,
            hipYOffset: -15.39
        },
        {
            // FRAME 123
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
            // FRAME 124
            spineAngleDeg: -134.1,
            shoulderJointDist: 42.26,
            shoulderJointAngleDeg: 120.48,
            leftUpperArmAngleDeg: 54.52,
            leftElbowAngleDeg: 75.48,
            rightUpperArmAngleDeg: 67.74,
            rightElbowAngleDeg: 73.64,
            pelvisJointDist: -28.64,
            pelvisJointAngleDeg: 125.48,
            leftThighAngleDeg: 114.52,
            rightThighAngleDeg: 114.55,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -122.74,
            hipYOffset: -15.55
        },
        {
            // FRAME 125
            spineAngleDeg: -134.27,
            shoulderJointDist: 41.82,
            shoulderJointAngleDeg: 121.36,
            leftUpperArmAngleDeg: 53.64,
            leftElbowAngleDeg: 76.36,
            rightUpperArmAngleDeg: 68.18,
            rightElbowAngleDeg: 73.91,
            pelvisJointDist: -28.91,
            pelvisJointAngleDeg: 126.36,
            leftThighAngleDeg: 113.64,
            rightThighAngleDeg: 114.64,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -123.18,
            hipYOffset: -15.64
        },
        {
            // FRAME 126
            spineAngleDeg: -134.5,
            shoulderJointDist: 41.25,
            shoulderJointAngleDeg: 122.5,
            leftUpperArmAngleDeg: 52.5,
            leftElbowAngleDeg: 77.5,
            rightUpperArmAngleDeg: 68.75,
            rightElbowAngleDeg: 74.25,
            pelvisJointDist: -29.25,
            pelvisJointAngleDeg: 127.5,
            leftThighAngleDeg: 112.5,
            rightThighAngleDeg: 114.75,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -123.75,
            hipYOffset: -15.75
        },
        {
            // FRAME 127
            spineAngleDeg: -134.6,
            shoulderJointDist: 41.01,
            shoulderJointAngleDeg: 122.98,
            leftUpperArmAngleDeg: 52.02,
            leftElbowAngleDeg: 77.98,
            rightUpperArmAngleDeg: 68.99,
            rightElbowAngleDeg: 74.39,
            pelvisJointDist: -29.39,
            pelvisJointAngleDeg: 127.98,
            leftThighAngleDeg: 112.02,
            rightThighAngleDeg: 114.8,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -123.99,
            hipYOffset: -15.8
        },
        {
            // FRAME 128
            spineAngleDeg: -134.77,
            shoulderJointDist: 40.57,
            shoulderJointAngleDeg: 123.86,
            leftUpperArmAngleDeg: 51.14,
            leftElbowAngleDeg: 78.86,
            rightUpperArmAngleDeg: 69.43,
            rightElbowAngleDeg: 74.66,
            pelvisJointDist: -29.66,
            pelvisJointAngleDeg: 128.86,
            leftThighAngleDeg: 111.14,
            rightThighAngleDeg: 114.89,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -124.43,
            hipYOffset: -15.89
        },
        {
            // FRAME 129
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
            // FRAME 130
            spineAngleDeg: -134.76,
            shoulderJointDist: 39.76,
            shoulderJointAngleDeg: 125.1,
            leftUpperArmAngleDeg: 49.76,
            leftElbowAngleDeg: 80.72,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 74.52,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 109.52,
            rightThighAngleDeg: 115.34,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 131
            spineAngleDeg: -134.32,
            shoulderJointDist: 39.32,
            shoulderJointAngleDeg: 125.27,
            leftUpperArmAngleDeg: 49.32,
            leftElbowAngleDeg: 82.04,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 73.64,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 108.64,
            rightThighAngleDeg: 115.95,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 132
            spineAngleDeg: -133.75,
            shoulderJointDist: 38.75,
            shoulderJointAngleDeg: 125.5,
            leftUpperArmAngleDeg: 48.75,
            leftElbowAngleDeg: 83.75,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 72.5,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 107.5,
            rightThighAngleDeg: 116.75,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 133
            spineAngleDeg: -133.51,
            shoulderJointDist: 38.51,
            shoulderJointAngleDeg: 125.6,
            leftUpperArmAngleDeg: 48.51,
            leftElbowAngleDeg: 84.47,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 72.02,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 107.02,
            rightThighAngleDeg: 117.09,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 134
            spineAngleDeg: -133.07,
            shoulderJointDist: 38.07,
            shoulderJointAngleDeg: 125.77,
            leftUpperArmAngleDeg: 48.07,
            leftElbowAngleDeg: 85.79,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 71.14,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 106.14,
            rightThighAngleDeg: 117.7,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 135
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
            // FRAME 136
            spineAngleDeg: -132.26,
            shoulderJointDist: 37.26,
            shoulderJointAngleDeg: 126.1,
            leftUpperArmAngleDeg: 47.26,
            leftElbowAngleDeg: 88.22,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 69.52,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 104.52,
            rightThighAngleDeg: 118.84,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 137
            spineAngleDeg: -131.82,
            shoulderJointDist: 36.82,
            shoulderJointAngleDeg: 126.27,
            leftUpperArmAngleDeg: 46.82,
            leftElbowAngleDeg: 89.54,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 68.64,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 103.64,
            rightThighAngleDeg: 119.45,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 138
            spineAngleDeg: -131.25,
            shoulderJointDist: 36.25,
            shoulderJointAngleDeg: 126.5,
            leftUpperArmAngleDeg: 46.25,
            leftElbowAngleDeg: 91.25,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 67.5,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 102.5,
            rightThighAngleDeg: 120.25,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 139
            spineAngleDeg: -131.01,
            shoulderJointDist: 36.01,
            shoulderJointAngleDeg: 126.6,
            leftUpperArmAngleDeg: 46.01,
            leftElbowAngleDeg: 91.97,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 67.02,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 102.02,
            rightThighAngleDeg: 120.59,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 140
            spineAngleDeg: -130.57,
            shoulderJointDist: 35.57,
            shoulderJointAngleDeg: 126.77,
            leftUpperArmAngleDeg: 45.57,
            leftElbowAngleDeg: 93.29,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 66.14,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 101.14,
            rightThighAngleDeg: 121.2,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 141
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
            // FRAME 142
            spineAngleDeg: -130.0,
            shoulderJointDist: 35.0,
            shoulderJointAngleDeg: 127.0,
            leftUpperArmAngleDeg: 45.0,
            leftElbowAngleDeg: 96.15,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 64.29,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 99.29,
            rightThighAngleDeg: 122.35,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 143
            spineAngleDeg: -130.0,
            shoulderJointDist: 35.0,
            shoulderJointAngleDeg: 127.0,
            leftUpperArmAngleDeg: 45.0,
            leftElbowAngleDeg: 98.25,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 63.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 98.0,
            rightThighAngleDeg: 123.0,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 144
            spineAngleDeg: -130.0,
            shoulderJointDist: 35.0,
            shoulderJointAngleDeg: 127.0,
            leftUpperArmAngleDeg: 45.0,
            leftElbowAngleDeg: 99.4,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 62.29,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 97.29,
            rightThighAngleDeg: 123.35,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 145
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
            // FRAME 146
            spineAngleDeg: -130.0,
            shoulderJointDist: 35.0,
            shoulderJointAngleDeg: 127.0,
            leftUpperArmAngleDeg: 45.0,
            leftElbowAngleDeg: 102.65,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 60.29,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 95.29,
            rightThighAngleDeg: 124.35,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 147
            spineAngleDeg: -130.0,
            shoulderJointDist: 35.0,
            shoulderJointAngleDeg: 127.0,
            leftUpperArmAngleDeg: 45.0,
            leftElbowAngleDeg: 104.75,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 59.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 94.0,
            rightThighAngleDeg: 125.0,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 148
            spineAngleDeg: -130.0,
            shoulderJointDist: 35.0,
            shoulderJointAngleDeg: 127.0,
            leftUpperArmAngleDeg: 45.0,
            leftElbowAngleDeg: 105.9,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 58.29,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 93.29,
            rightThighAngleDeg: 125.35,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 149
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
            // FRAME 150
            spineAngleDeg: -129.56,
            shoulderJointDist: 34.56,
            shoulderJointAngleDeg: 127.27,
            leftUpperArmAngleDeg: 44.56,
            leftElbowAngleDeg: 109.06,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 56.38,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 91.38,
            rightThighAngleDeg: 126.35,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 151
            spineAngleDeg: -128.75,
            shoulderJointDist: 33.75,
            shoulderJointAngleDeg: 127.75,
            leftUpperArmAngleDeg: 43.75,
            leftElbowAngleDeg: 111.0,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 55.25,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 90.25,
            rightThighAngleDeg: 127.0,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 152
            spineAngleDeg: -128.31,
            shoulderJointDist: 33.31,
            shoulderJointAngleDeg: 128.02,
            leftUpperArmAngleDeg: 43.31,
            leftElbowAngleDeg: 112.06,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 54.63,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 89.63,
            rightThighAngleDeg: 127.35,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 153
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
            // FRAME 154
            spineAngleDeg: -127.06,
            shoulderJointDist: 32.06,
            shoulderJointAngleDeg: 128.77,
            leftUpperArmAngleDeg: 42.06,
            leftElbowAngleDeg: 115.06,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 52.88,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 87.88,
            rightThighAngleDeg: 128.35,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 155
            spineAngleDeg: -126.25,
            shoulderJointDist: 31.25,
            shoulderJointAngleDeg: 129.25,
            leftUpperArmAngleDeg: 41.25,
            leftElbowAngleDeg: 117.0,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 51.75,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 86.75,
            rightThighAngleDeg: 129.0,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 156
            spineAngleDeg: -125.81,
            shoulderJointDist: 30.81,
            shoulderJointAngleDeg: 129.52,
            leftUpperArmAngleDeg: 40.81,
            leftElbowAngleDeg: 118.06,
            rightUpperArmAngleDeg: 70.0,
            rightElbowAngleDeg: 51.13,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 86.13,
            rightThighAngleDeg: 129.35,
            leftKneeAngleDeg: -30.0,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -16.0
        },
        {
            // FRAME 157
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
            // FRAME 158
            spineAngleDeg: -125.0,
            shoulderJointDist: 29.41,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 69.12,
            rightElbowAngleDeg: 51.18,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 84.23,
            rightThighAngleDeg: 130.18,
            leftKneeAngleDeg: -29.88,
            rightKneeAngleDeg: -124.41,
            hipYOffset: -15.65
        },
        {
            // FRAME 159
            spineAngleDeg: -125.0,
            shoulderJointDist: 28.33,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 67.5,
            rightElbowAngleDeg: 53.33,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 82.83,
            rightThighAngleDeg: 130.5,
            leftKneeAngleDeg: -29.67,
            rightKneeAngleDeg: -123.33,
            hipYOffset: -15.0
        },
        {
            // FRAME 160
            spineAngleDeg: -125.0,
            shoulderJointDist: 27.74,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 66.62,
            rightElbowAngleDeg: 54.51,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 82.07,
            rightThighAngleDeg: 130.68,
            leftKneeAngleDeg: -29.55,
            rightKneeAngleDeg: -122.74,
            hipYOffset: -14.65
        },
        {
            // FRAME 161
            spineAngleDeg: -125.0,
            shoulderJointDist: 26.67,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 65.0,
            rightElbowAngleDeg: 56.67,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 80.67,
            rightThighAngleDeg: 131.0,
            leftKneeAngleDeg: -29.33,
            rightKneeAngleDeg: -121.67,
            hipYOffset: -14.0
        },
        {
            // FRAME 162
            spineAngleDeg: -125.0,
            shoulderJointDist: 26.08,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 64.12,
            rightElbowAngleDeg: 57.85,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 79.9,
            rightThighAngleDeg: 131.18,
            leftKneeAngleDeg: -29.21,
            rightKneeAngleDeg: -121.08,
            hipYOffset: -13.65
        },
        {
            // FRAME 163
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
            // FRAME 164
            spineAngleDeg: -125.0,
            shoulderJointDist: 24.41,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 61.62,
            rightElbowAngleDeg: 61.18,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 77.73,
            rightThighAngleDeg: 131.68,
            leftKneeAngleDeg: -28.88,
            rightKneeAngleDeg: -119.41,
            hipYOffset: -12.65
        },
        {
            // FRAME 165
            spineAngleDeg: -125.0,
            shoulderJointDist: 23.33,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 60.0,
            rightElbowAngleDeg: 63.33,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 76.33,
            rightThighAngleDeg: 132.0,
            leftKneeAngleDeg: -28.67,
            rightKneeAngleDeg: -118.33,
            hipYOffset: -12.0
        },
        {
            // FRAME 166
            spineAngleDeg: -125.0,
            shoulderJointDist: 22.74,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 59.12,
            rightElbowAngleDeg: 64.51,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 75.57,
            rightThighAngleDeg: 132.18,
            leftKneeAngleDeg: -28.55,
            rightKneeAngleDeg: -117.74,
            hipYOffset: -11.65
        },
        {
            // FRAME 167
            spineAngleDeg: -125.0,
            shoulderJointDist: 21.67,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 57.5,
            rightElbowAngleDeg: 66.67,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 74.17,
            rightThighAngleDeg: 132.5,
            leftKneeAngleDeg: -28.33,
            rightKneeAngleDeg: -116.67,
            hipYOffset: -11.0
        },
        {
            // FRAME 168
            spineAngleDeg: -125.0,
            shoulderJointDist: 21.08,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 56.62,
            rightElbowAngleDeg: 67.85,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 73.4,
            rightThighAngleDeg: 132.68,
            leftKneeAngleDeg: -28.21,
            rightKneeAngleDeg: -116.08,
            hipYOffset: -10.65
        },
        {
            // FRAME 169
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
            // FRAME 170
            spineAngleDeg: -125.0,
            shoulderJointDist: 19.12,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 53.67,
            rightElbowAngleDeg: 71.77,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 71.47,
            rightThighAngleDeg: 133.0,
            leftKneeAngleDeg: -27.65,
            rightKneeAngleDeg: -114.29,
            hipYOffset: -9.56
        },
        {
            // FRAME 171
            spineAngleDeg: -125.0,
            shoulderJointDist: 17.5,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 51.25,
            rightElbowAngleDeg: 75.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 70.5,
            rightThighAngleDeg: 133.0,
            leftKneeAngleDeg: -27.0,
            rightKneeAngleDeg: -113.0,
            hipYOffset: -8.75
        },
        {
            // FRAME 172
            spineAngleDeg: -125.0,
            shoulderJointDist: 16.62,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 49.92,
            rightElbowAngleDeg: 76.77,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 69.97,
            rightThighAngleDeg: 133.0,
            leftKneeAngleDeg: -26.65,
            rightKneeAngleDeg: -112.29,
            hipYOffset: -8.31
        },
        {
            // FRAME 173
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
            // FRAME 174
            spineAngleDeg: -125.0,
            shoulderJointDist: 14.12,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 46.17,
            rightElbowAngleDeg: 81.77,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 68.47,
            rightThighAngleDeg: 133.0,
            leftKneeAngleDeg: -25.65,
            rightKneeAngleDeg: -110.29,
            hipYOffset: -7.06
        },
        {
            // FRAME 175
            spineAngleDeg: -125.0,
            shoulderJointDist: 12.5,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 43.75,
            rightElbowAngleDeg: 85.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 67.5,
            rightThighAngleDeg: 133.0,
            leftKneeAngleDeg: -25.0,
            rightKneeAngleDeg: -109.0,
            hipYOffset: -6.25
        },
        {
            // FRAME 176
            spineAngleDeg: -125.0,
            shoulderJointDist: 11.62,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 42.42,
            rightElbowAngleDeg: 86.77,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 66.97,
            rightThighAngleDeg: 133.0,
            leftKneeAngleDeg: -24.65,
            rightKneeAngleDeg: -108.29,
            hipYOffset: -5.81
        },
        {
            // FRAME 177
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
            // FRAME 178
            spineAngleDeg: -125.0,
            shoulderJointDist: 9.2,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 38.23,
            rightElbowAngleDeg: 91.77,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 65.47,
            rightThighAngleDeg: 133.62,
            leftKneeAngleDeg: -23.65,
            rightKneeAngleDeg: -106.38,
            hipYOffset: -4.56
        },
        {
            // FRAME 179
            spineAngleDeg: -125.0,
            shoulderJointDist: 7.75,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 35.0,
            rightElbowAngleDeg: 95.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 64.5,
            rightThighAngleDeg: 134.75,
            leftKneeAngleDeg: -23.0,
            rightKneeAngleDeg: -105.25,
            hipYOffset: -3.75
        },
        {
            // FRAME 180
            spineAngleDeg: -125.0,
            shoulderJointDist: 6.95,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 33.23,
            rightElbowAngleDeg: 96.77,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 63.97,
            rightThighAngleDeg: 135.37,
            leftKneeAngleDeg: -22.65,
            rightKneeAngleDeg: -104.63,
            hipYOffset: -3.31
        },
        {
            // FRAME 181
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
            // FRAME 182
            spineAngleDeg: -125.0,
            shoulderJointDist: 4.7,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 28.23,
            rightElbowAngleDeg: 101.77,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 62.47,
            rightThighAngleDeg: 137.12,
            leftKneeAngleDeg: -21.65,
            rightKneeAngleDeg: -102.88,
            hipYOffset: -2.06
        },
        {
            // FRAME 183
            spineAngleDeg: -125.0,
            shoulderJointDist: 3.25,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 25.0,
            rightElbowAngleDeg: 105.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 61.5,
            rightThighAngleDeg: 138.25,
            leftKneeAngleDeg: -21.0,
            rightKneeAngleDeg: -101.75,
            hipYOffset: -1.25
        },
        {
            // FRAME 184
            spineAngleDeg: -125.0,
            shoulderJointDist: 2.45,
            shoulderJointAngleDeg: 130.0,
            leftUpperArmAngleDeg: 40.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 23.23,
            rightElbowAngleDeg: 106.77,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 130.0,
            leftThighAngleDeg: 60.97,
            rightThighAngleDeg: 138.87,
            leftKneeAngleDeg: -20.65,
            rightKneeAngleDeg: -101.13,
            hipYOffset: -0.81
        },
        {
            // FRAME 185
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
            // FRAME 186
            spineAngleDeg: -124.9,
            shoulderJointDist: 1.14,
            shoulderJointAngleDeg: 129.52,
            leftUpperArmAngleDeg: 40.48,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 20.48,
            rightElbowAngleDeg: 109.81,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 129.88,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 139.88,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -99.52,
            hipYOffset: -0.08
        },
        {
            // FRAME 187
            spineAngleDeg: -124.73,
            shoulderJointDist: 1.41,
            shoulderJointAngleDeg: 128.64,
            leftUpperArmAngleDeg: 41.36,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 21.36,
            rightElbowAngleDeg: 109.46,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 129.67,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 139.67,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -98.64,
            hipYOffset: -0.22
        },
        {
            // FRAME 188
            spineAngleDeg: -124.5,
            shoulderJointDist: 1.75,
            shoulderJointAngleDeg: 127.5,
            leftUpperArmAngleDeg: 42.5,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 22.5,
            rightElbowAngleDeg: 109.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 129.4,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 139.4,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -97.5,
            hipYOffset: -0.4
        },
        {
            // FRAME 189
            spineAngleDeg: -124.4,
            shoulderJointDist: 1.89,
            shoulderJointAngleDeg: 127.02,
            leftUpperArmAngleDeg: 42.98,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 22.98,
            rightElbowAngleDeg: 108.81,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 129.28,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 139.28,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -97.02,
            hipYOffset: -0.48
        },
        {
            // FRAME 190
            spineAngleDeg: -124.23,
            shoulderJointDist: 2.16,
            shoulderJointAngleDeg: 126.14,
            leftUpperArmAngleDeg: 43.86,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 23.86,
            rightElbowAngleDeg: 108.46,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 129.07,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 139.07,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -96.14,
            hipYOffset: -0.62
        },
        {
            // FRAME 191
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
            // FRAME 192
            spineAngleDeg: -123.9,
            shoulderJointDist: 2.64,
            shoulderJointAngleDeg: 124.52,
            leftUpperArmAngleDeg: 45.48,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 25.48,
            rightElbowAngleDeg: 107.81,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 128.67,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 138.67,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -94.52,
            hipYOffset: -0.87
        },
        {
            // FRAME 193
            spineAngleDeg: -123.73,
            shoulderJointDist: 2.91,
            shoulderJointAngleDeg: 123.64,
            leftUpperArmAngleDeg: 46.36,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 26.36,
            rightElbowAngleDeg: 107.46,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 128.45,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 138.45,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -93.64,
            hipYOffset: -0.99
        },
        {
            // FRAME 194
            spineAngleDeg: -123.5,
            shoulderJointDist: 3.25,
            shoulderJointAngleDeg: 122.5,
            leftUpperArmAngleDeg: 47.5,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 27.5,
            rightElbowAngleDeg: 107.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 128.15,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 138.15,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -92.5,
            hipYOffset: -1.15
        },
        {
            // FRAME 195
            spineAngleDeg: -123.4,
            shoulderJointDist: 3.39,
            shoulderJointAngleDeg: 122.02,
            leftUpperArmAngleDeg: 47.98,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 27.98,
            rightElbowAngleDeg: 106.81,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 128.02,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 138.02,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -92.02,
            hipYOffset: -1.22
        },
        {
            // FRAME 196
            spineAngleDeg: -123.23,
            shoulderJointDist: 3.66,
            shoulderJointAngleDeg: 121.14,
            leftUpperArmAngleDeg: 48.86,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 28.86,
            rightElbowAngleDeg: 106.46,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 127.8,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 137.8,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -91.14,
            hipYOffset: -1.34
        },
        {
            // FRAME 197
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
            // FRAME 198
            spineAngleDeg: -122.9,
            shoulderJointDist: 4.14,
            shoulderJointAngleDeg: 119.52,
            leftUpperArmAngleDeg: 50.48,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 30.48,
            rightElbowAngleDeg: 105.81,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 127.37,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 137.37,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -89.52,
            hipYOffset: -1.57
        },
        {
            // FRAME 199
            spineAngleDeg: -122.73,
            shoulderJointDist: 4.41,
            shoulderJointAngleDeg: 118.64,
            leftUpperArmAngleDeg: 51.36,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 31.36,
            rightElbowAngleDeg: 105.46,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 127.15,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 137.15,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -88.64,
            hipYOffset: -1.69
        },
        {
            // FRAME 200
            spineAngleDeg: -122.5,
            shoulderJointDist: 4.75,
            shoulderJointAngleDeg: 117.5,
            leftUpperArmAngleDeg: 52.5,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 32.5,
            rightElbowAngleDeg: 105.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 126.85,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 136.85,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -87.5,
            hipYOffset: -1.85
        },
        {
            // FRAME 201
            spineAngleDeg: -122.4,
            shoulderJointDist: 4.89,
            shoulderJointAngleDeg: 117.02,
            leftUpperArmAngleDeg: 52.98,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 32.98,
            rightElbowAngleDeg: 104.81,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 126.72,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 136.72,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -87.02,
            hipYOffset: -1.92
        },
        {
            // FRAME 202
            spineAngleDeg: -122.23,
            shoulderJointDist: 5.16,
            shoulderJointAngleDeg: 116.14,
            leftUpperArmAngleDeg: 53.86,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 33.86,
            rightElbowAngleDeg: 104.46,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 126.5,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 136.5,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -86.14,
            hipYOffset: -2.04
        },
        {
            // FRAME 203
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
            // FRAME 204
            spineAngleDeg: -121.9,
            shoulderJointDist: 5.64,
            shoulderJointAngleDeg: 114.52,
            leftUpperArmAngleDeg: 55.48,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 35.48,
            rightElbowAngleDeg: 103.81,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 126.08,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 136.08,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -84.52,
            hipYOffset: -2.28
        },
        {
            // FRAME 205
            spineAngleDeg: -121.73,
            shoulderJointDist: 5.91,
            shoulderJointAngleDeg: 113.64,
            leftUpperArmAngleDeg: 56.36,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 36.36,
            rightElbowAngleDeg: 103.46,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 125.87,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 135.87,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -83.64,
            hipYOffset: -2.42
        },
        {
            // FRAME 206
            spineAngleDeg: -121.5,
            shoulderJointDist: 6.25,
            shoulderJointAngleDeg: 112.5,
            leftUpperArmAngleDeg: 57.5,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 37.5,
            rightElbowAngleDeg: 103.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 125.6,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 135.6,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -82.5,
            hipYOffset: -2.6
        },
        {
            // FRAME 207
            spineAngleDeg: -121.4,
            shoulderJointDist: 6.39,
            shoulderJointAngleDeg: 112.02,
            leftUpperArmAngleDeg: 57.98,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 37.98,
            rightElbowAngleDeg: 102.81,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 125.48,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 135.48,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -82.02,
            hipYOffset: -2.68
        },
        {
            // FRAME 208
            spineAngleDeg: -121.23,
            shoulderJointDist: 6.66,
            shoulderJointAngleDeg: 111.14,
            leftUpperArmAngleDeg: 58.86,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 38.86,
            rightElbowAngleDeg: 102.46,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 125.27,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 135.27,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -81.14,
            hipYOffset: -2.82
        },
        {
            // FRAME 209
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
            // FRAME 210
            spineAngleDeg: -120.9,
            shoulderJointDist: 7.1,
            shoulderJointAngleDeg: 109.36,
            leftUpperArmAngleDeg: 60.64,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 40.64,
            rightElbowAngleDeg: 101.84,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 124.84,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 134.87,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -79.52,
            hipYOffset: -3.1
        },
        {
            // FRAME 211
            spineAngleDeg: -120.73,
            shoulderJointDist: 7.27,
            shoulderJointAngleDeg: 108.19,
            leftUpperArmAngleDeg: 61.81,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 41.81,
            rightElbowAngleDeg: 101.55,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 124.55,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 134.64,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -78.64,
            hipYOffset: -3.27
        },
        {
            // FRAME 212
            spineAngleDeg: -120.5,
            shoulderJointDist: 7.5,
            shoulderJointAngleDeg: 106.67,
            leftUpperArmAngleDeg: 63.33,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 43.33,
            rightElbowAngleDeg: 101.17,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 124.17,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 134.33,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -77.5,
            hipYOffset: -3.5
        },
        {
            // FRAME 213
            spineAngleDeg: -120.4,
            shoulderJointDist: 7.6,
            shoulderJointAngleDeg: 106.03,
            leftUpperArmAngleDeg: 63.97,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 43.97,
            rightElbowAngleDeg: 101.01,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 124.01,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 134.2,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -77.02,
            hipYOffset: -3.6
        },
        {
            // FRAME 214
            spineAngleDeg: -120.23,
            shoulderJointDist: 7.77,
            shoulderJointAngleDeg: 104.85,
            leftUpperArmAngleDeg: 65.15,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 45.15,
            rightElbowAngleDeg: 100.71,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 123.71,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 133.97,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -76.14,
            hipYOffset: -3.77
        },
        {
            // FRAME 215
            spineAngleDeg: -120.0,
            shoulderJointDist: 8.0,
            shoulderJointAngleDeg: 103.33,
            leftUpperArmAngleDeg: 66.67,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 46.67,
            rightElbowAngleDeg: 100.33,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 123.33,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 133.67,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -75.0,
            hipYOffset: -4.0
        },
        {
            // FRAME 216
            spineAngleDeg: -119.9,
            shoulderJointDist: 8.1,
            shoulderJointAngleDeg: 102.69,
            leftUpperArmAngleDeg: 67.31,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 47.31,
            rightElbowAngleDeg: 100.17,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 123.17,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 133.54,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -74.52,
            hipYOffset: -4.1
        },
        {
            // FRAME 217
            spineAngleDeg: -119.73,
            shoulderJointDist: 8.27,
            shoulderJointAngleDeg: 101.52,
            leftUpperArmAngleDeg: 68.48,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 48.48,
            rightElbowAngleDeg: 99.88,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 122.88,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 133.31,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -73.64,
            hipYOffset: -4.27
        },
        {
            // FRAME 218
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
            // FRAME 219
            spineAngleDeg: -119.4,
            shoulderJointDist: 8.6,
            shoulderJointAngleDeg: 99.36,
            leftUpperArmAngleDeg: 70.64,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 50.64,
            rightElbowAngleDeg: 99.34,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 122.34,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 132.87,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -72.02,
            hipYOffset: -4.6
        },
        {
            // FRAME 220
            spineAngleDeg: -119.23,
            shoulderJointDist: 8.77,
            shoulderJointAngleDeg: 98.19,
            leftUpperArmAngleDeg: 71.81,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 51.81,
            rightElbowAngleDeg: 99.05,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 122.05,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 132.64,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -71.14,
            hipYOffset: -4.77
        },
        {
            // FRAME 221
            spineAngleDeg: -119.0,
            shoulderJointDist: 9.0,
            shoulderJointAngleDeg: 96.67,
            leftUpperArmAngleDeg: 73.33,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 53.33,
            rightElbowAngleDeg: 98.67,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 121.67,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 132.33,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -70.0,
            hipYOffset: -5.0
        },
        {
            // FRAME 222
            spineAngleDeg: -118.9,
            shoulderJointDist: 9.1,
            shoulderJointAngleDeg: 96.03,
            leftUpperArmAngleDeg: 73.97,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 53.97,
            rightElbowAngleDeg: 98.51,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 121.51,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 132.2,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -69.52,
            hipYOffset: -5.1
        },
        {
            // FRAME 223
            spineAngleDeg: -118.73,
            shoulderJointDist: 9.27,
            shoulderJointAngleDeg: 94.85,
            leftUpperArmAngleDeg: 75.15,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 55.15,
            rightElbowAngleDeg: 98.21,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 121.21,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 131.97,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -68.64,
            hipYOffset: -5.27
        },
        {
            // FRAME 224
            spineAngleDeg: -118.5,
            shoulderJointDist: 9.5,
            shoulderJointAngleDeg: 93.33,
            leftUpperArmAngleDeg: 76.67,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 56.67,
            rightElbowAngleDeg: 97.83,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 120.83,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 131.67,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -67.5,
            hipYOffset: -5.5
        },
        {
            // FRAME 225
            spineAngleDeg: -118.4,
            shoulderJointDist: 9.6,
            shoulderJointAngleDeg: 92.69,
            leftUpperArmAngleDeg: 77.31,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 57.31,
            rightElbowAngleDeg: 97.67,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 120.67,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 131.54,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -67.02,
            hipYOffset: -5.6
        },
        {
            // FRAME 226
            spineAngleDeg: -118.23,
            shoulderJointDist: 9.77,
            shoulderJointAngleDeg: 91.52,
            leftUpperArmAngleDeg: 78.48,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 58.48,
            rightElbowAngleDeg: 97.38,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 120.38,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 131.31,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -66.14,
            hipYOffset: -5.77
        },
        {
            // FRAME 227
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
            // FRAME 228
            spineAngleDeg: -117.82,
            shoulderJointDist: 10.27,
            shoulderJointAngleDeg: 88.67,
            leftUpperArmAngleDeg: 81.77,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 61.33,
            rightElbowAngleDeg: 96.73,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 119.56,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 130.65,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -64.29,
            hipYOffset: -6.18
        },
        {
            // FRAME 229
            spineAngleDeg: -117.5,
            shoulderJointDist: 10.75,
            shoulderJointAngleDeg: 86.25,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 63.75,
            rightElbowAngleDeg: 96.25,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 118.75,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 130.0,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -63.0,
            hipYOffset: -6.5
        },
        {
            // FRAME 230
            spineAngleDeg: -117.32,
            shoulderJointDist: 11.02,
            shoulderJointAngleDeg: 84.92,
            leftUpperArmAngleDeg: 86.77,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 65.08,
            rightElbowAngleDeg: 95.98,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 118.31,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 129.65,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -62.29,
            hipYOffset: -6.68
        },
        {
            // FRAME 231
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
            // FRAME 232
            spineAngleDeg: -116.82,
            shoulderJointDist: 11.77,
            shoulderJointAngleDeg: 81.17,
            leftUpperArmAngleDeg: 91.77,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 68.83,
            rightElbowAngleDeg: 95.23,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 117.06,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 128.65,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -60.29,
            hipYOffset: -7.18
        },
        {
            // FRAME 233
            spineAngleDeg: -116.5,
            shoulderJointDist: 12.25,
            shoulderJointAngleDeg: 78.75,
            leftUpperArmAngleDeg: 95.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 71.25,
            rightElbowAngleDeg: 94.75,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 116.25,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 128.0,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -59.0,
            hipYOffset: -7.5
        },
        {
            // FRAME 234
            spineAngleDeg: -116.32,
            shoulderJointDist: 12.52,
            shoulderJointAngleDeg: 77.42,
            leftUpperArmAngleDeg: 96.77,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 72.58,
            rightElbowAngleDeg: 94.48,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 115.81,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 127.65,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -58.29,
            hipYOffset: -7.68
        },
        {
            // FRAME 235
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
            // FRAME 236
            spineAngleDeg: -115.91,
            shoulderJointDist: 13.18,
            shoulderJointAngleDeg: 73.67,
            leftUpperArmAngleDeg: 101.68,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 76.33,
            rightElbowAngleDeg: 93.65,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 114.56,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 126.82,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -56.38,
            hipYOffset: -8.18
        },
        {
            // FRAME 237
            spineAngleDeg: -115.75,
            shoulderJointDist: 13.5,
            shoulderJointAngleDeg: 71.25,
            leftUpperArmAngleDeg: 104.75,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 78.75,
            rightElbowAngleDeg: 93.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 113.75,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 126.5,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -55.25,
            hipYOffset: -8.5
        },
        {
            // FRAME 238
            spineAngleDeg: -115.66,
            shoulderJointDist: 13.68,
            shoulderJointAngleDeg: 69.92,
            leftUpperArmAngleDeg: 106.43,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 80.08,
            rightElbowAngleDeg: 92.65,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 113.31,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 126.32,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -54.63,
            hipYOffset: -8.68
        },
        {
            // FRAME 239
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
            // FRAME 240
            spineAngleDeg: -115.41,
            shoulderJointDist: 14.18,
            shoulderJointAngleDeg: 66.17,
            leftUpperArmAngleDeg: 111.18,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 83.83,
            rightElbowAngleDeg: 91.65,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 112.06,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 125.82,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -52.88,
            hipYOffset: -9.18
        },
        {
            // FRAME 241
            spineAngleDeg: -115.25,
            shoulderJointDist: 14.5,
            shoulderJointAngleDeg: 63.75,
            leftUpperArmAngleDeg: 114.25,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 86.25,
            rightElbowAngleDeg: 91.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 111.25,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 125.5,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -51.75,
            hipYOffset: -9.5
        },
        {
            // FRAME 242
            spineAngleDeg: -115.16,
            shoulderJointDist: 14.68,
            shoulderJointAngleDeg: 62.42,
            leftUpperArmAngleDeg: 115.93,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 87.58,
            rightElbowAngleDeg: 90.65,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.81,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 125.32,
            leftKneeAngleDeg: -20.0,
            rightKneeAngleDeg: -51.13,
            hipYOffset: -9.68
        },
        {
            // FRAME 243
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
            // FRAME 244
            spineAngleDeg: -115.06,
            shoulderJointDist: 15.06,
            shoulderJointAngleDeg: 60.48,
            leftUpperArmAngleDeg: 118.46,
            leftElbowAngleDeg: 119.68,
            rightUpperArmAngleDeg: 89.68,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 60.16,
            rightThighAngleDeg: 124.9,
            leftKneeAngleDeg: -20.42,
            rightKneeAngleDeg: -49.52,
            hipYOffset: -10.16
        },
        {
            // FRAME 245
            spineAngleDeg: -115.18,
            shoulderJointDist: 15.18,
            shoulderJointAngleDeg: 61.36,
            leftUpperArmAngleDeg: 117.46,
            leftElbowAngleDeg: 119.09,
            rightUpperArmAngleDeg: 89.09,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 60.45,
            rightThighAngleDeg: 124.73,
            leftKneeAngleDeg: -21.18,
            rightKneeAngleDeg: -48.64,
            hipYOffset: -10.45
        },
        {
            // FRAME 246
            spineAngleDeg: -115.33,
            shoulderJointDist: 15.33,
            shoulderJointAngleDeg: 62.5,
            leftUpperArmAngleDeg: 116.17,
            leftElbowAngleDeg: 118.33,
            rightUpperArmAngleDeg: 88.33,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 60.83,
            rightThighAngleDeg: 124.5,
            leftKneeAngleDeg: -22.17,
            rightKneeAngleDeg: -47.5,
            hipYOffset: -10.83
        },
        {
            // FRAME 247
            spineAngleDeg: -115.4,
            shoulderJointDist: 15.4,
            shoulderJointAngleDeg: 62.98,
            leftUpperArmAngleDeg: 115.62,
            leftElbowAngleDeg: 118.01,
            rightUpperArmAngleDeg: 88.01,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 60.99,
            rightThighAngleDeg: 124.4,
            leftKneeAngleDeg: -22.59,
            rightKneeAngleDeg: -47.02,
            hipYOffset: -10.99
        },
        {
            // FRAME 248
            spineAngleDeg: -115.52,
            shoulderJointDist: 15.52,
            shoulderJointAngleDeg: 63.86,
            leftUpperArmAngleDeg: 114.62,
            leftElbowAngleDeg: 117.43,
            rightUpperArmAngleDeg: 87.43,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 61.29,
            rightThighAngleDeg: 124.23,
            leftKneeAngleDeg: -23.35,
            rightKneeAngleDeg: -46.14,
            hipYOffset: -11.29
        },
        {
            // FRAME 249
            spineAngleDeg: -115.67,
            shoulderJointDist: 15.67,
            shoulderJointAngleDeg: 65.0,
            leftUpperArmAngleDeg: 113.33,
            leftElbowAngleDeg: 116.67,
            rightUpperArmAngleDeg: 86.67,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 61.67,
            rightThighAngleDeg: 124.0,
            leftKneeAngleDeg: -24.33,
            rightKneeAngleDeg: -45.0,
            hipYOffset: -11.67
        },
        {
            // FRAME 250
            spineAngleDeg: -115.73,
            shoulderJointDist: 15.73,
            shoulderJointAngleDeg: 65.48,
            leftUpperArmAngleDeg: 112.79,
            leftElbowAngleDeg: 116.35,
            rightUpperArmAngleDeg: 86.35,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 61.83,
            rightThighAngleDeg: 123.9,
            leftKneeAngleDeg: -24.75,
            rightKneeAngleDeg: -44.52,
            hipYOffset: -11.83
        },
        {
            // FRAME 251
            spineAngleDeg: -115.85,
            shoulderJointDist: 15.85,
            shoulderJointAngleDeg: 66.36,
            leftUpperArmAngleDeg: 111.79,
            leftElbowAngleDeg: 115.76,
            rightUpperArmAngleDeg: 85.76,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 62.12,
            rightThighAngleDeg: 123.73,
            leftKneeAngleDeg: -25.51,
            rightKneeAngleDeg: -43.64,
            hipYOffset: -12.12
        },
        {
            // FRAME 252
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
            // FRAME 253
            spineAngleDeg: -116.06,
            shoulderJointDist: 16.06,
            shoulderJointAngleDeg: 67.98,
            leftUpperArmAngleDeg: 109.96,
            leftElbowAngleDeg: 114.68,
            rightUpperArmAngleDeg: 84.68,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 62.66,
            rightThighAngleDeg: 123.4,
            leftKneeAngleDeg: -26.92,
            rightKneeAngleDeg: -42.02,
            hipYOffset: -12.66
        },
        {
            // FRAME 254
            spineAngleDeg: -116.18,
            shoulderJointDist: 16.18,
            shoulderJointAngleDeg: 68.86,
            leftUpperArmAngleDeg: 108.96,
            leftElbowAngleDeg: 114.09,
            rightUpperArmAngleDeg: 84.09,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 62.95,
            rightThighAngleDeg: 123.23,
            leftKneeAngleDeg: -27.68,
            rightKneeAngleDeg: -41.14,
            hipYOffset: -12.95
        },
        {
            // FRAME 255
            spineAngleDeg: -116.33,
            shoulderJointDist: 16.33,
            shoulderJointAngleDeg: 70.0,
            leftUpperArmAngleDeg: 107.67,
            leftElbowAngleDeg: 113.33,
            rightUpperArmAngleDeg: 83.33,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 63.33,
            rightThighAngleDeg: 123.0,
            leftKneeAngleDeg: -28.67,
            rightKneeAngleDeg: -40.0,
            hipYOffset: -13.33
        },
        {
            // FRAME 256
            spineAngleDeg: -116.4,
            shoulderJointDist: 16.4,
            shoulderJointAngleDeg: 70.48,
            leftUpperArmAngleDeg: 107.12,
            leftElbowAngleDeg: 113.01,
            rightUpperArmAngleDeg: 83.01,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 63.49,
            rightThighAngleDeg: 122.9,
            leftKneeAngleDeg: -29.09,
            rightKneeAngleDeg: -39.52,
            hipYOffset: -13.49
        },
        {
            // FRAME 257
            spineAngleDeg: -116.52,
            shoulderJointDist: 16.52,
            shoulderJointAngleDeg: 71.36,
            leftUpperArmAngleDeg: 106.12,
            leftElbowAngleDeg: 112.43,
            rightUpperArmAngleDeg: 82.43,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 63.79,
            rightThighAngleDeg: 122.73,
            leftKneeAngleDeg: -29.85,
            rightKneeAngleDeg: -38.64,
            hipYOffset: -13.79
        },
        {
            // FRAME 258
            spineAngleDeg: -116.67,
            shoulderJointDist: 16.67,
            shoulderJointAngleDeg: 72.5,
            leftUpperArmAngleDeg: 104.83,
            leftElbowAngleDeg: 111.67,
            rightUpperArmAngleDeg: 81.67,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 64.17,
            rightThighAngleDeg: 122.5,
            leftKneeAngleDeg: -30.83,
            rightKneeAngleDeg: -37.5,
            hipYOffset: -14.17
        },
        {
            // FRAME 259
            spineAngleDeg: -116.73,
            shoulderJointDist: 16.73,
            shoulderJointAngleDeg: 72.98,
            leftUpperArmAngleDeg: 104.29,
            leftElbowAngleDeg: 111.35,
            rightUpperArmAngleDeg: 81.35,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 64.33,
            rightThighAngleDeg: 122.4,
            leftKneeAngleDeg: -31.25,
            rightKneeAngleDeg: -37.02,
            hipYOffset: -14.33
        },
        {
            // FRAME 260
            spineAngleDeg: -116.85,
            shoulderJointDist: 16.85,
            shoulderJointAngleDeg: 73.86,
            leftUpperArmAngleDeg: 103.29,
            leftElbowAngleDeg: 110.76,
            rightUpperArmAngleDeg: 80.76,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 64.62,
            rightThighAngleDeg: 122.23,
            leftKneeAngleDeg: -32.01,
            rightKneeAngleDeg: -36.14,
            hipYOffset: -14.62
        },
        {
            // FRAME 261
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
            // FRAME 262
            spineAngleDeg: -117.18,
            shoulderJointDist: 17.18,
            shoulderJointAngleDeg: 75.88,
            leftUpperArmAngleDeg: 101.0,
            leftElbowAngleDeg: 109.41,
            rightUpperArmAngleDeg: 79.41,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 65.29,
            rightThighAngleDeg: 121.88,
            leftKneeAngleDeg: -33.71,
            rightKneeAngleDeg: -34.41,
            hipYOffset: -15.29
        },
        {
            // FRAME 263
            spineAngleDeg: -117.5,
            shoulderJointDist: 17.5,
            shoulderJointAngleDeg: 77.5,
            leftUpperArmAngleDeg: 99.17,
            leftElbowAngleDeg: 108.33,
            rightUpperArmAngleDeg: 78.33,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 65.83,
            rightThighAngleDeg: 121.67,
            leftKneeAngleDeg: -35.0,
            rightKneeAngleDeg: -33.33,
            hipYOffset: -15.83
        },
        {
            // FRAME 264
            spineAngleDeg: -117.68,
            shoulderJointDist: 17.68,
            shoulderJointAngleDeg: 78.38,
            leftUpperArmAngleDeg: 98.17,
            leftElbowAngleDeg: 107.74,
            rightUpperArmAngleDeg: 77.74,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 66.13,
            rightThighAngleDeg: 121.55,
            leftKneeAngleDeg: -35.71,
            rightKneeAngleDeg: -32.74,
            hipYOffset: -16.13
        },
        {
            // FRAME 265
            spineAngleDeg: -118.0,
            shoulderJointDist: 18.0,
            shoulderJointAngleDeg: 80.0,
            leftUpperArmAngleDeg: 96.33,
            leftElbowAngleDeg: 106.67,
            rightUpperArmAngleDeg: 76.67,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 66.67,
            rightThighAngleDeg: 121.33,
            leftKneeAngleDeg: -37.0,
            rightKneeAngleDeg: -31.67,
            hipYOffset: -16.67
        },
        {
            // FRAME 266
            spineAngleDeg: -118.18,
            shoulderJointDist: 18.18,
            shoulderJointAngleDeg: 80.88,
            leftUpperArmAngleDeg: 95.33,
            leftElbowAngleDeg: 106.08,
            rightUpperArmAngleDeg: 76.08,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 66.96,
            rightThighAngleDeg: 121.21,
            leftKneeAngleDeg: -37.71,
            rightKneeAngleDeg: -31.08,
            hipYOffset: -16.96
        },
        {
            // FRAME 267
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
            // FRAME 268
            spineAngleDeg: -118.68,
            shoulderJointDist: 18.68,
            shoulderJointAngleDeg: 83.38,
            leftUpperArmAngleDeg: 92.5,
            leftElbowAngleDeg: 104.41,
            rightUpperArmAngleDeg: 74.41,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 67.79,
            rightThighAngleDeg: 120.88,
            leftKneeAngleDeg: -39.71,
            rightKneeAngleDeg: -29.41,
            hipYOffset: -17.79
        },
        {
            // FRAME 269
            spineAngleDeg: -119.0,
            shoulderJointDist: 19.0,
            shoulderJointAngleDeg: 85.0,
            leftUpperArmAngleDeg: 90.67,
            leftElbowAngleDeg: 103.33,
            rightUpperArmAngleDeg: 73.33,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 68.33,
            rightThighAngleDeg: 120.67,
            leftKneeAngleDeg: -41.0,
            rightKneeAngleDeg: -28.33,
            hipYOffset: -18.33
        },
        {
            // FRAME 270
            spineAngleDeg: -119.18,
            shoulderJointDist: 19.18,
            shoulderJointAngleDeg: 85.88,
            leftUpperArmAngleDeg: 89.67,
            leftElbowAngleDeg: 102.74,
            rightUpperArmAngleDeg: 72.74,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 68.63,
            rightThighAngleDeg: 120.55,
            leftKneeAngleDeg: -41.71,
            rightKneeAngleDeg: -27.74,
            hipYOffset: -18.63
        },
        {
            // FRAME 271
            spineAngleDeg: -119.5,
            shoulderJointDist: 19.5,
            shoulderJointAngleDeg: 87.5,
            leftUpperArmAngleDeg: 87.83,
            leftElbowAngleDeg: 101.67,
            rightUpperArmAngleDeg: 71.67,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 69.17,
            rightThighAngleDeg: 120.33,
            leftKneeAngleDeg: -43.0,
            rightKneeAngleDeg: -26.67,
            hipYOffset: -19.17
        },
        {
            // FRAME 272
            spineAngleDeg: -119.68,
            shoulderJointDist: 19.68,
            shoulderJointAngleDeg: 88.38,
            leftUpperArmAngleDeg: 86.83,
            leftElbowAngleDeg: 101.08,
            rightUpperArmAngleDeg: 71.08,
            rightElbowAngleDeg: 90.0,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 69.46,
            rightThighAngleDeg: 120.21,
            leftKneeAngleDeg: -43.71,
            rightKneeAngleDeg: -26.08,
            hipYOffset: -19.46
        },
        {
            // FRAME 273
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
            // FRAME 274
            spineAngleDeg: -120.0,
            shoulderJointDist: 19.81,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 99.76,
            rightUpperArmAngleDeg: 70.12,
            rightElbowAngleDeg: 89.76,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 70.12,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -45.48,
            rightKneeAngleDeg: -24.92,
            hipYOffset: -20.0
        },
        {
            // FRAME 275
            spineAngleDeg: -120.0,
            shoulderJointDist: 19.46,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 99.32,
            rightUpperArmAngleDeg: 70.33,
            rightElbowAngleDeg: 89.32,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 70.33,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -46.36,
            rightKneeAngleDeg: -24.78,
            hipYOffset: -20.0
        },
        {
            // FRAME 276
            spineAngleDeg: -120.0,
            shoulderJointDist: 19.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 98.75,
            rightUpperArmAngleDeg: 70.6,
            rightElbowAngleDeg: 88.75,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 70.6,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -47.5,
            rightKneeAngleDeg: -24.6,
            hipYOffset: -20.0
        },
        {
            // FRAME 277
            spineAngleDeg: -120.0,
            shoulderJointDist: 18.81,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 98.51,
            rightUpperArmAngleDeg: 70.72,
            rightElbowAngleDeg: 88.51,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 70.72,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -47.98,
            rightKneeAngleDeg: -24.52,
            hipYOffset: -20.0
        },
        {
            // FRAME 278
            spineAngleDeg: -120.0,
            shoulderJointDist: 18.46,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 98.07,
            rightUpperArmAngleDeg: 70.93,
            rightElbowAngleDeg: 88.07,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 70.93,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -48.86,
            rightKneeAngleDeg: -24.38,
            hipYOffset: -20.0
        },
        {
            // FRAME 279
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
            // FRAME 280
            spineAngleDeg: -120.0,
            shoulderJointDist: 17.81,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 97.26,
            rightUpperArmAngleDeg: 71.33,
            rightElbowAngleDeg: 87.26,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 71.33,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -50.48,
            rightKneeAngleDeg: -24.13,
            hipYOffset: -20.0
        },
        {
            // FRAME 281
            spineAngleDeg: -120.0,
            shoulderJointDist: 17.46,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 96.82,
            rightUpperArmAngleDeg: 71.55,
            rightElbowAngleDeg: 86.82,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 71.55,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -51.36,
            rightKneeAngleDeg: -24.01,
            hipYOffset: -20.0
        },
        {
            // FRAME 282
            spineAngleDeg: -120.0,
            shoulderJointDist: 17.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 96.25,
            rightUpperArmAngleDeg: 71.85,
            rightElbowAngleDeg: 86.25,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 71.85,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -52.5,
            rightKneeAngleDeg: -23.85,
            hipYOffset: -20.0
        },
        {
            // FRAME 283
            spineAngleDeg: -120.0,
            shoulderJointDist: 16.81,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 96.01,
            rightUpperArmAngleDeg: 71.98,
            rightElbowAngleDeg: 86.01,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 71.98,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -52.98,
            rightKneeAngleDeg: -23.78,
            hipYOffset: -20.0
        },
        {
            // FRAME 284
            spineAngleDeg: -120.0,
            shoulderJointDist: 16.46,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 95.57,
            rightUpperArmAngleDeg: 72.2,
            rightElbowAngleDeg: 85.57,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 72.2,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -53.86,
            rightKneeAngleDeg: -23.66,
            hipYOffset: -20.0
        },
        {
            // FRAME 285
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
            // FRAME 286
            spineAngleDeg: -120.0,
            shoulderJointDist: 15.81,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 94.76,
            rightUpperArmAngleDeg: 72.63,
            rightElbowAngleDeg: 84.76,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 72.63,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -55.48,
            rightKneeAngleDeg: -23.43,
            hipYOffset: -20.0
        },
        {
            // FRAME 287
            spineAngleDeg: -120.0,
            shoulderJointDist: 15.46,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 94.32,
            rightUpperArmAngleDeg: 72.85,
            rightElbowAngleDeg: 84.32,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 72.85,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -56.36,
            rightKneeAngleDeg: -23.31,
            hipYOffset: -20.0
        },
        {
            // FRAME 288
            spineAngleDeg: -120.0,
            shoulderJointDist: 15.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 93.75,
            rightUpperArmAngleDeg: 73.15,
            rightElbowAngleDeg: 83.75,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 73.15,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -57.5,
            rightKneeAngleDeg: -23.15,
            hipYOffset: -20.0
        },
        {
            // FRAME 289
            spineAngleDeg: -120.0,
            shoulderJointDist: 14.81,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 93.51,
            rightUpperArmAngleDeg: 73.28,
            rightElbowAngleDeg: 83.51,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 73.28,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -57.98,
            rightKneeAngleDeg: -23.08,
            hipYOffset: -20.0
        },
        {
            // FRAME 290
            spineAngleDeg: -120.0,
            shoulderJointDist: 14.46,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 93.07,
            rightUpperArmAngleDeg: 73.5,
            rightElbowAngleDeg: 83.07,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 73.5,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -58.86,
            rightKneeAngleDeg: -22.96,
            hipYOffset: -20.0
        },
        {
            // FRAME 291
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
            // FRAME 292
            spineAngleDeg: -120.0,
            shoulderJointDist: 13.81,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 92.26,
            rightUpperArmAngleDeg: 73.92,
            rightElbowAngleDeg: 82.26,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 73.92,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -60.48,
            rightKneeAngleDeg: -22.72,
            hipYOffset: -20.0
        },
        {
            // FRAME 293
            spineAngleDeg: -120.0,
            shoulderJointDist: 13.46,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 91.82,
            rightUpperArmAngleDeg: 74.13,
            rightElbowAngleDeg: 81.82,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 74.13,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -61.36,
            rightKneeAngleDeg: -22.58,
            hipYOffset: -20.0
        },
        {
            // FRAME 294
            spineAngleDeg: -120.0,
            shoulderJointDist: 13.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 91.25,
            rightUpperArmAngleDeg: 74.4,
            rightElbowAngleDeg: 81.25,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 74.4,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -62.5,
            rightKneeAngleDeg: -22.4,
            hipYOffset: -20.0
        },
        {
            // FRAME 295
            spineAngleDeg: -120.0,
            shoulderJointDist: 12.81,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 91.01,
            rightUpperArmAngleDeg: 74.52,
            rightElbowAngleDeg: 81.01,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 74.52,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -62.98,
            rightKneeAngleDeg: -22.32,
            hipYOffset: -20.0
        },
        {
            // FRAME 296
            spineAngleDeg: -120.0,
            shoulderJointDist: 12.46,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 90.57,
            rightUpperArmAngleDeg: 74.73,
            rightElbowAngleDeg: 80.57,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 74.73,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -63.86,
            rightKneeAngleDeg: -22.18,
            hipYOffset: -20.0
        },
        {
            // FRAME 297
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
            // FRAME 298
            spineAngleDeg: -120.0,
            shoulderJointDist: 11.79,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 89.79,
            rightUpperArmAngleDeg: 75.09,
            rightElbowAngleDeg: 79.79,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 75.14,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -65.74,
            rightKneeAngleDeg: -21.96,
            hipYOffset: -20.0
        },
        {
            // FRAME 299
            spineAngleDeg: -120.0,
            shoulderJointDist: 11.4,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 89.4,
            rightUpperArmAngleDeg: 75.25,
            rightElbowAngleDeg: 79.4,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 75.4,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -67.1,
            rightKneeAngleDeg: -21.9,
            hipYOffset: -20.0
        },
        {
            // FRAME 300
            spineAngleDeg: -120.0,
            shoulderJointDist: 11.19,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 89.19,
            rightUpperArmAngleDeg: 75.34,
            rightElbowAngleDeg: 79.19,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 75.54,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -67.84,
            rightKneeAngleDeg: -21.86,
            hipYOffset: -20.0
        },
        {
            // FRAME 301
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
            // FRAME 302
            spineAngleDeg: -120.0,
            shoulderJointDist: 10.57,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 88.57,
            rightUpperArmAngleDeg: 75.59,
            rightElbowAngleDeg: 78.57,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 75.92,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -69.96,
            rightKneeAngleDeg: -21.75,
            hipYOffset: -20.0
        },
        {
            // FRAME 303
            spineAngleDeg: -120.0,
            shoulderJointDist: 10.15,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 88.15,
            rightUpperArmAngleDeg: 75.75,
            rightElbowAngleDeg: 78.15,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 76.15,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -71.35,
            rightKneeAngleDeg: -21.65,
            hipYOffset: -20.0
        },
        {
            // FRAME 304
            spineAngleDeg: -120.0,
            shoulderJointDist: 9.92,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 87.92,
            rightUpperArmAngleDeg: 75.84,
            rightElbowAngleDeg: 77.92,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 76.27,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -72.11,
            rightKneeAngleDeg: -21.6,
            hipYOffset: -20.0
        },
        {
            // FRAME 305
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
            // FRAME 306
            spineAngleDeg: -120.0,
            shoulderJointDist: 9.27,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 87.27,
            rightUpperArmAngleDeg: 76.09,
            rightElbowAngleDeg: 77.27,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 76.62,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -74.26,
            rightKneeAngleDeg: -21.45,
            hipYOffset: -20.0
        },
        {
            // FRAME 307
            spineAngleDeg: -120.0,
            shoulderJointDist: 8.85,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 86.85,
            rightUpperArmAngleDeg: 76.25,
            rightElbowAngleDeg: 76.85,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 76.85,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -75.65,
            rightKneeAngleDeg: -21.35,
            hipYOffset: -20.0
        },
        {
            // FRAME 308
            spineAngleDeg: -120.0,
            shoulderJointDist: 8.62,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 86.62,
            rightUpperArmAngleDeg: 76.34,
            rightElbowAngleDeg: 76.62,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 76.97,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -76.41,
            rightKneeAngleDeg: -21.3,
            hipYOffset: -20.0
        },
        {
            // FRAME 309
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
            // FRAME 310
            spineAngleDeg: -120.0,
            shoulderJointDist: 7.99,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 85.99,
            rightUpperArmAngleDeg: 76.59,
            rightElbowAngleDeg: 75.99,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 77.34,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -78.54,
            rightKneeAngleDeg: -21.16,
            hipYOffset: -20.0
        },
        {
            // FRAME 311
            spineAngleDeg: -120.0,
            shoulderJointDist: 7.6,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 85.6,
            rightUpperArmAngleDeg: 76.75,
            rightElbowAngleDeg: 75.6,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 77.6,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -79.9,
            rightKneeAngleDeg: -21.1,
            hipYOffset: -20.0
        },
        {
            // FRAME 312
            spineAngleDeg: -120.0,
            shoulderJointDist: 7.39,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 85.39,
            rightUpperArmAngleDeg: 76.84,
            rightElbowAngleDeg: 75.39,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 77.74,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -80.64,
            rightKneeAngleDeg: -21.06,
            hipYOffset: -20.0
        },
        {
            // FRAME 313
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
            // FRAME 314
            spineAngleDeg: -120.0,
            shoulderJointDist: 6.88,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 84.71,
            rightUpperArmAngleDeg: 77.18,
            rightElbowAngleDeg: 74.71,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 78.12,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -82.77,
            rightKneeAngleDeg: -20.94,
            hipYOffset: -20.0
        },
        {
            // FRAME 315
            spineAngleDeg: -120.0,
            shoulderJointDist: 6.67,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 84.17,
            rightUpperArmAngleDeg: 77.5,
            rightElbowAngleDeg: 74.17,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 78.33,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -84.17,
            rightKneeAngleDeg: -20.83,
            hipYOffset: -20.0
        },
        {
            // FRAME 316
            spineAngleDeg: -120.0,
            shoulderJointDist: 6.55,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 83.87,
            rightUpperArmAngleDeg: 77.68,
            rightElbowAngleDeg: 73.87,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 78.45,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -84.93,
            rightKneeAngleDeg: -20.77,
            hipYOffset: -20.0
        },
        {
            // FRAME 317
            spineAngleDeg: -120.0,
            shoulderJointDist: 6.33,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 83.33,
            rightUpperArmAngleDeg: 78.0,
            rightElbowAngleDeg: 73.33,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 78.67,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -86.33,
            rightKneeAngleDeg: -20.67,
            hipYOffset: -20.0
        },
        {
            // FRAME 318
            spineAngleDeg: -120.0,
            shoulderJointDist: 6.21,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 83.04,
            rightUpperArmAngleDeg: 78.18,
            rightElbowAngleDeg: 73.04,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 78.79,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -87.1,
            rightKneeAngleDeg: -20.61,
            hipYOffset: -20.0
        },
        {
            // FRAME 319
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
            // FRAME 320
            spineAngleDeg: -120.0,
            shoulderJointDist: 5.88,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 82.21,
            rightUpperArmAngleDeg: 78.68,
            rightElbowAngleDeg: 72.21,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 79.12,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -89.27,
            rightKneeAngleDeg: -20.44,
            hipYOffset: -20.0
        },
        {
            // FRAME 321
            spineAngleDeg: -120.0,
            shoulderJointDist: 5.67,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 81.67,
            rightUpperArmAngleDeg: 79.0,
            rightElbowAngleDeg: 71.67,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 79.33,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -90.67,
            rightKneeAngleDeg: -20.33,
            hipYOffset: -20.0
        },
        {
            // FRAME 322
            spineAngleDeg: -120.0,
            shoulderJointDist: 5.55,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 81.37,
            rightUpperArmAngleDeg: 79.18,
            rightElbowAngleDeg: 71.37,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 79.45,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -91.43,
            rightKneeAngleDeg: -20.27,
            hipYOffset: -20.0
        },
        {
            // FRAME 323
            spineAngleDeg: -120.0,
            shoulderJointDist: 5.33,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 80.83,
            rightUpperArmAngleDeg: 79.5,
            rightElbowAngleDeg: 70.83,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 79.67,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -92.83,
            rightKneeAngleDeg: -20.17,
            hipYOffset: -20.0
        },
        {
            // FRAME 324
            spineAngleDeg: -120.0,
            shoulderJointDist: 5.21,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.0,
            leftElbowAngleDeg: 80.54,
            rightUpperArmAngleDeg: 79.68,
            rightElbowAngleDeg: 70.54,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 79.79,
            rightThighAngleDeg: 120.0,
            leftKneeAngleDeg: -93.6,
            rightKneeAngleDeg: -20.11,
            hipYOffset: -20.0
        },
        {
            // FRAME 325
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
            // FRAME 326
            spineAngleDeg: -120.0,
            shoulderJointDist: 5.23,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.23,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 79.9,
            rightElbowAngleDeg: 69.68,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 80.32,
            rightThighAngleDeg: 119.9,
            leftKneeAngleDeg: -95.48,
            rightKneeAngleDeg: -20.16,
            hipYOffset: -20.0
        },
        {
            // FRAME 327
            spineAngleDeg: -120.0,
            shoulderJointDist: 5.64,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 85.64,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 79.73,
            rightElbowAngleDeg: 69.09,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 80.91,
            rightThighAngleDeg: 119.73,
            leftKneeAngleDeg: -96.36,
            rightKneeAngleDeg: -20.45,
            hipYOffset: -20.0
        },
        {
            // FRAME 328
            spineAngleDeg: -120.0,
            shoulderJointDist: 6.17,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 86.17,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 79.5,
            rightElbowAngleDeg: 68.33,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 81.67,
            rightThighAngleDeg: 119.5,
            leftKneeAngleDeg: -97.5,
            rightKneeAngleDeg: -20.83,
            hipYOffset: -20.0
        },
        {
            // FRAME 329
            spineAngleDeg: -120.0,
            shoulderJointDist: 6.39,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 86.39,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 79.4,
            rightElbowAngleDeg: 68.01,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 81.99,
            rightThighAngleDeg: 119.4,
            leftKneeAngleDeg: -97.98,
            rightKneeAngleDeg: -20.99,
            hipYOffset: -20.0
        },
        {
            // FRAME 330
            spineAngleDeg: -120.0,
            shoulderJointDist: 6.8,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 86.8,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 79.23,
            rightElbowAngleDeg: 67.43,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 82.57,
            rightThighAngleDeg: 119.23,
            leftKneeAngleDeg: -98.86,
            rightKneeAngleDeg: -21.29,
            hipYOffset: -20.0
        },
        {
            // FRAME 331
            spineAngleDeg: -120.0,
            shoulderJointDist: 7.33,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 87.33,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 79.0,
            rightElbowAngleDeg: 66.67,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 83.33,
            rightThighAngleDeg: 119.0,
            leftKneeAngleDeg: -100.0,
            rightKneeAngleDeg: -21.67,
            hipYOffset: -20.0
        },
        {
            // FRAME 332
            spineAngleDeg: -120.0,
            shoulderJointDist: 7.56,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 87.56,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 78.9,
            rightElbowAngleDeg: 66.35,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 83.65,
            rightThighAngleDeg: 118.9,
            leftKneeAngleDeg: -100.48,
            rightKneeAngleDeg: -21.83,
            hipYOffset: -20.0
        },
        {
            // FRAME 333
            spineAngleDeg: -120.0,
            shoulderJointDist: 7.97,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 87.97,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 78.73,
            rightElbowAngleDeg: 65.76,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 84.24,
            rightThighAngleDeg: 118.73,
            leftKneeAngleDeg: -101.36,
            rightKneeAngleDeg: -22.12,
            hipYOffset: -20.0
        },
        {
            // FRAME 334
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
            // FRAME 335
            spineAngleDeg: -120.0,
            shoulderJointDist: 8.73,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 88.73,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 78.4,
            rightElbowAngleDeg: 64.68,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 85.32,
            rightThighAngleDeg: 118.4,
            leftKneeAngleDeg: -102.98,
            rightKneeAngleDeg: -22.66,
            hipYOffset: -20.0
        },
        {
            // FRAME 336
            spineAngleDeg: -120.0,
            shoulderJointDist: 9.14,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 89.14,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 78.23,
            rightElbowAngleDeg: 64.09,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 85.91,
            rightThighAngleDeg: 118.23,
            leftKneeAngleDeg: -103.86,
            rightKneeAngleDeg: -22.95,
            hipYOffset: -20.0
        },
        {
            // FRAME 337
            spineAngleDeg: -120.0,
            shoulderJointDist: 9.67,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 89.67,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 78.0,
            rightElbowAngleDeg: 63.33,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 86.67,
            rightThighAngleDeg: 118.0,
            leftKneeAngleDeg: -105.0,
            rightKneeAngleDeg: -23.33,
            hipYOffset: -20.0
        },
        {
            // FRAME 338
            spineAngleDeg: -120.0,
            shoulderJointDist: 9.89,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 89.89,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 77.9,
            rightElbowAngleDeg: 63.01,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 86.99,
            rightThighAngleDeg: 117.9,
            leftKneeAngleDeg: -105.48,
            rightKneeAngleDeg: -23.49,
            hipYOffset: -20.0
        },
        {
            // FRAME 339
            spineAngleDeg: -120.0,
            shoulderJointDist: 10.3,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 90.3,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 77.73,
            rightElbowAngleDeg: 62.43,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 87.57,
            rightThighAngleDeg: 117.73,
            leftKneeAngleDeg: -106.36,
            rightKneeAngleDeg: -23.79,
            hipYOffset: -20.0
        },
        {
            // FRAME 340
            spineAngleDeg: -120.0,
            shoulderJointDist: 10.83,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 90.83,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 77.5,
            rightElbowAngleDeg: 61.67,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 88.33,
            rightThighAngleDeg: 117.5,
            leftKneeAngleDeg: -107.5,
            rightKneeAngleDeg: -24.17,
            hipYOffset: -20.0
        },
        {
            // FRAME 341
            spineAngleDeg: -120.0,
            shoulderJointDist: 11.06,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 91.06,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 77.4,
            rightElbowAngleDeg: 61.35,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 88.65,
            rightThighAngleDeg: 117.4,
            leftKneeAngleDeg: -107.98,
            rightKneeAngleDeg: -24.33,
            hipYOffset: -20.0
        },
        {
            // FRAME 342
            spineAngleDeg: -120.0,
            shoulderJointDist: 11.47,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 91.47,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 77.23,
            rightElbowAngleDeg: 60.76,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 89.24,
            rightThighAngleDeg: 117.23,
            leftKneeAngleDeg: -108.86,
            rightKneeAngleDeg: -24.62,
            hipYOffset: -20.0
        },
        {
            // FRAME 343
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
            // FRAME 344
            spineAngleDeg: -120.0,
            shoulderJointDist: 12.38,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 92.38,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 76.9,
            rightElbowAngleDeg: 59.52,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 90.48,
            rightThighAngleDeg: 116.9,
            leftKneeAngleDeg: -110.48,
            rightKneeAngleDeg: -25.24,
            hipYOffset: -20.0
        },
        {
            // FRAME 345
            spineAngleDeg: -120.0,
            shoulderJointDist: 13.09,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 93.09,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 76.73,
            rightElbowAngleDeg: 58.64,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 91.36,
            rightThighAngleDeg: 116.73,
            leftKneeAngleDeg: -111.36,
            rightKneeAngleDeg: -25.68,
            hipYOffset: -20.0
        },
        {
            // FRAME 346
            spineAngleDeg: -120.0,
            shoulderJointDist: 14.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 94.0,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 76.5,
            rightElbowAngleDeg: 57.5,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 92.5,
            rightThighAngleDeg: 116.5,
            leftKneeAngleDeg: -112.5,
            rightKneeAngleDeg: -26.25,
            hipYOffset: -20.0
        },
        {
            // FRAME 347
            spineAngleDeg: -120.0,
            shoulderJointDist: 14.38,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 94.38,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 76.4,
            rightElbowAngleDeg: 57.02,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 92.98,
            rightThighAngleDeg: 116.4,
            leftKneeAngleDeg: -112.98,
            rightKneeAngleDeg: -26.49,
            hipYOffset: -20.0
        },
        {
            // FRAME 348
            spineAngleDeg: -120.0,
            shoulderJointDist: 15.09,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 95.09,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 76.23,
            rightElbowAngleDeg: 56.14,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 93.86,
            rightThighAngleDeg: 116.23,
            leftKneeAngleDeg: -113.86,
            rightKneeAngleDeg: -26.93,
            hipYOffset: -20.0
        },
        {
            // FRAME 349
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
            // FRAME 350
            spineAngleDeg: -120.0,
            shoulderJointDist: 16.38,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 96.38,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 75.9,
            rightElbowAngleDeg: 54.52,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 95.48,
            rightThighAngleDeg: 115.9,
            leftKneeAngleDeg: -115.48,
            rightKneeAngleDeg: -27.74,
            hipYOffset: -20.0
        },
        {
            // FRAME 351
            spineAngleDeg: -120.0,
            shoulderJointDist: 17.09,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 97.09,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 75.73,
            rightElbowAngleDeg: 53.64,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 96.36,
            rightThighAngleDeg: 115.73,
            leftKneeAngleDeg: -116.36,
            rightKneeAngleDeg: -28.18,
            hipYOffset: -20.0
        },
        {
            // FRAME 352
            spineAngleDeg: -120.0,
            shoulderJointDist: 18.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 98.0,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 75.5,
            rightElbowAngleDeg: 52.5,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 97.5,
            rightThighAngleDeg: 115.5,
            leftKneeAngleDeg: -117.5,
            rightKneeAngleDeg: -28.75,
            hipYOffset: -20.0
        },
        {
            // FRAME 353
            spineAngleDeg: -120.0,
            shoulderJointDist: 18.38,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 98.38,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 75.4,
            rightElbowAngleDeg: 52.02,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 97.98,
            rightThighAngleDeg: 115.4,
            leftKneeAngleDeg: -117.98,
            rightKneeAngleDeg: -28.99,
            hipYOffset: -20.0
        },
        {
            // FRAME 354
            spineAngleDeg: -120.0,
            shoulderJointDist: 19.09,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 99.09,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 75.23,
            rightElbowAngleDeg: 51.14,
            pelvisJointDist: -30.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 98.86,
            rightThighAngleDeg: 115.23,
            leftKneeAngleDeg: -118.86,
            rightKneeAngleDeg: -29.43,
            hipYOffset: -20.0
        },
        {
            // FRAME 355
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
            // FRAME 356
            spineAngleDeg: -120.0,
            shoulderJointDist: 20.44,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 100.18,
            leftElbowAngleDeg: 80.44,
            rightUpperArmAngleDeg: 74.38,
            rightElbowAngleDeg: 50.44,
            pelvisJointDist: -29.56,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 100.44,
            rightThighAngleDeg: 114.38,
            leftKneeAngleDeg: -120.44,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 357
            spineAngleDeg: -120.0,
            shoulderJointDist: 21.25,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 100.5,
            leftElbowAngleDeg: 81.25,
            rightUpperArmAngleDeg: 73.25,
            rightElbowAngleDeg: 51.25,
            pelvisJointDist: -28.75,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 101.25,
            rightThighAngleDeg: 113.25,
            leftKneeAngleDeg: -121.25,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 358
            spineAngleDeg: -120.0,
            shoulderJointDist: 21.69,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 100.68,
            leftElbowAngleDeg: 81.69,
            rightUpperArmAngleDeg: 72.63,
            rightElbowAngleDeg: 51.69,
            pelvisJointDist: -28.31,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 101.69,
            rightThighAngleDeg: 112.63,
            leftKneeAngleDeg: -121.69,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 359
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
            // FRAME 360
            spineAngleDeg: -120.0,
            shoulderJointDist: 22.94,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 101.18,
            leftElbowAngleDeg: 82.94,
            rightUpperArmAngleDeg: 70.88,
            rightElbowAngleDeg: 52.94,
            pelvisJointDist: -27.06,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 102.94,
            rightThighAngleDeg: 110.88,
            leftKneeAngleDeg: -122.94,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 361
            spineAngleDeg: -120.0,
            shoulderJointDist: 23.75,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 101.5,
            leftElbowAngleDeg: 83.75,
            rightUpperArmAngleDeg: 69.75,
            rightElbowAngleDeg: 53.75,
            pelvisJointDist: -26.25,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 103.75,
            rightThighAngleDeg: 109.75,
            leftKneeAngleDeg: -123.75,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 362
            spineAngleDeg: -120.0,
            shoulderJointDist: 24.19,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 101.68,
            leftElbowAngleDeg: 84.19,
            rightUpperArmAngleDeg: 69.13,
            rightElbowAngleDeg: 54.19,
            pelvisJointDist: -25.81,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 104.19,
            rightThighAngleDeg: 109.13,
            leftKneeAngleDeg: -124.19,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 363
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
            // FRAME 364
            spineAngleDeg: -120.0,
            shoulderJointDist: 25.44,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 102.27,
            leftElbowAngleDeg: 85.44,
            rightUpperArmAngleDeg: 67.29,
            rightElbowAngleDeg: 55.44,
            pelvisJointDist: -24.56,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 105.44,
            rightThighAngleDeg: 107.29,
            leftKneeAngleDeg: -125.44,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 365
            spineAngleDeg: -120.0,
            shoulderJointDist: 26.25,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 102.75,
            leftElbowAngleDeg: 86.25,
            rightUpperArmAngleDeg: 66.0,
            rightElbowAngleDeg: 56.25,
            pelvisJointDist: -23.75,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 106.25,
            rightThighAngleDeg: 106.0,
            leftKneeAngleDeg: -126.25,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 366
            spineAngleDeg: -120.0,
            shoulderJointDist: 26.69,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 103.02,
            leftElbowAngleDeg: 86.69,
            rightUpperArmAngleDeg: 65.29,
            rightElbowAngleDeg: 56.69,
            pelvisJointDist: -23.31,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 106.69,
            rightThighAngleDeg: 105.29,
            leftKneeAngleDeg: -126.69,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 367
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
            // FRAME 368
            spineAngleDeg: -120.0,
            shoulderJointDist: 27.94,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 103.77,
            leftElbowAngleDeg: 87.94,
            rightUpperArmAngleDeg: 63.29,
            rightElbowAngleDeg: 57.94,
            pelvisJointDist: -22.06,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 107.94,
            rightThighAngleDeg: 103.29,
            leftKneeAngleDeg: -127.94,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 369
            spineAngleDeg: -120.0,
            shoulderJointDist: 28.75,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 104.25,
            leftElbowAngleDeg: 88.75,
            rightUpperArmAngleDeg: 62.0,
            rightElbowAngleDeg: 58.75,
            pelvisJointDist: -21.25,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 108.75,
            rightThighAngleDeg: 102.0,
            leftKneeAngleDeg: -128.75,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 370
            spineAngleDeg: -120.0,
            shoulderJointDist: 29.19,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 104.52,
            leftElbowAngleDeg: 89.19,
            rightUpperArmAngleDeg: 61.29,
            rightElbowAngleDeg: 59.19,
            pelvisJointDist: -20.81,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 109.19,
            rightThighAngleDeg: 101.29,
            leftKneeAngleDeg: -129.19,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 371
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
            // FRAME 372
            spineAngleDeg: -120.0,
            shoulderJointDist: 30.83,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 105.33,
            leftElbowAngleDeg: 91.33,
            rightUpperArmAngleDeg: 58.67,
            rightElbowAngleDeg: 60.83,
            pelvisJointDist: -17.5,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 112.5,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -130.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 373
            spineAngleDeg: -120.0,
            shoulderJointDist: 31.67,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 105.67,
            leftElbowAngleDeg: 92.67,
            rightUpperArmAngleDeg: 57.33,
            rightElbowAngleDeg: 61.67,
            pelvisJointDist: -15.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 115.0,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -130.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 374
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
            // FRAME 375
            spineAngleDeg: -120.0,
            shoulderJointDist: 33.33,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 106.33,
            leftElbowAngleDeg: 95.33,
            rightUpperArmAngleDeg: 54.67,
            rightElbowAngleDeg: 63.33,
            pelvisJointDist: -10.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 120.0,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -130.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 376
            spineAngleDeg: -120.0,
            shoulderJointDist: 34.17,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 106.67,
            leftElbowAngleDeg: 96.67,
            rightUpperArmAngleDeg: 53.33,
            rightElbowAngleDeg: 64.17,
            pelvisJointDist: -7.5,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 122.5,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -130.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 377
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
            // FRAME 378
            spineAngleDeg: -120.0,
            shoulderJointDist: 35.4,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 107.27,
            leftElbowAngleDeg: 98.6,
            rightUpperArmAngleDeg: 51.4,
            rightElbowAngleDeg: 65.4,
            pelvisJointDist: -4.17,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 127.07,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -130.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 379
            spineAngleDeg: -120.0,
            shoulderJointDist: 35.8,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 107.53,
            leftElbowAngleDeg: 99.2,
            rightUpperArmAngleDeg: 50.8,
            rightElbowAngleDeg: 65.8,
            pelvisJointDist: -3.33,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 129.13,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -130.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 380
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
            // FRAME 381
            spineAngleDeg: -120.0,
            shoulderJointDist: 36.63,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 108.03,
            leftElbowAngleDeg: 100.37,
            rightUpperArmAngleDeg: 49.63,
            rightElbowAngleDeg: 66.63,
            pelvisJointDist: -1.67,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 133.3,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -130.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 382
            spineAngleDeg: -120.0,
            shoulderJointDist: 37.07,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 108.27,
            leftElbowAngleDeg: 100.93,
            rightUpperArmAngleDeg: 49.07,
            rightElbowAngleDeg: 67.07,
            pelvisJointDist: -0.83,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 135.4,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -130.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 383
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
            // FRAME 384
            spineAngleDeg: -120.0,
            shoulderJointDist: 37.93,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 108.73,
            leftElbowAngleDeg: 102.07,
            rightUpperArmAngleDeg: 47.93,
            rightElbowAngleDeg: 67.93,
            pelvisJointDist: 0.83,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 139.6,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -130.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 385
            spineAngleDeg: -120.0,
            shoulderJointDist: 38.37,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 108.97,
            leftElbowAngleDeg: 102.63,
            rightUpperArmAngleDeg: 47.37,
            rightElbowAngleDeg: 68.37,
            pelvisJointDist: 1.67,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 141.7,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -130.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 386
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
            // FRAME 387
            spineAngleDeg: -120.0,
            shoulderJointDist: 39.2,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 109.47,
            leftElbowAngleDeg: 103.8,
            rightUpperArmAngleDeg: 46.2,
            rightElbowAngleDeg: 69.2,
            pelvisJointDist: 3.33,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 145.87,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -130.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 388
            spineAngleDeg: -120.0,
            shoulderJointDist: 39.6,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 109.73,
            leftElbowAngleDeg: 104.4,
            rightUpperArmAngleDeg: 45.6,
            rightElbowAngleDeg: 69.6,
            pelvisJointDist: 4.17,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 147.93,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -130.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 389
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
            // FRAME 390
            spineAngleDeg: -119.9,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 44.9,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 99.52,
            leftKneeAngleDeg: -129.52,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 391
            spineAngleDeg: -119.73,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 44.73,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 98.64,
            leftKneeAngleDeg: -128.64,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 392
            spineAngleDeg: -119.5,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 44.5,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 97.5,
            leftKneeAngleDeg: -127.5,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 393
            spineAngleDeg: -119.4,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 44.4,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 97.02,
            leftKneeAngleDeg: -127.02,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 394
            spineAngleDeg: -119.23,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 44.23,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 96.14,
            leftKneeAngleDeg: -126.14,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 395
            spineAngleDeg: -119.0,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 44.0,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 95.0,
            leftKneeAngleDeg: -125.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 396
            spineAngleDeg: -118.9,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 43.9,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 94.52,
            leftKneeAngleDeg: -124.52,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 397
            spineAngleDeg: -118.73,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 43.73,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 93.64,
            leftKneeAngleDeg: -123.64,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 398
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
            // FRAME 399
            spineAngleDeg: -118.4,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 43.4,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 92.02,
            leftKneeAngleDeg: -122.02,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 400
            spineAngleDeg: -118.23,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 43.23,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 91.14,
            leftKneeAngleDeg: -121.14,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 401
            spineAngleDeg: -118.0,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 43.0,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 90.0,
            leftKneeAngleDeg: -120.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 402
            spineAngleDeg: -117.9,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 42.9,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 89.52,
            leftKneeAngleDeg: -119.52,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 403
            spineAngleDeg: -117.73,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 42.73,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 88.64,
            leftKneeAngleDeg: -118.64,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 404
            spineAngleDeg: -117.5,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 42.5,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 87.5,
            leftKneeAngleDeg: -117.5,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 405
            spineAngleDeg: -117.4,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 42.4,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 87.02,
            leftKneeAngleDeg: -117.02,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 406
            spineAngleDeg: -117.23,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 42.23,
            rightElbowAngleDeg: 70.0,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 86.14,
            leftKneeAngleDeg: -116.14,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -20.0
        },
        {
            // FRAME 407
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
            // FRAME 408
            spineAngleDeg: -116.94,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 41.94,
            rightElbowAngleDeg: 70.32,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 84.52,
            leftKneeAngleDeg: -114.52,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -19.87
        },
        {
            // FRAME 409
            spineAngleDeg: -116.82,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 41.82,
            rightElbowAngleDeg: 70.91,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 83.64,
            leftKneeAngleDeg: -113.64,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -19.64
        },
        {
            // FRAME 410
            spineAngleDeg: -116.67,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 41.67,
            rightElbowAngleDeg: 71.67,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 82.5,
            leftKneeAngleDeg: -112.5,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -19.33
        },
        {
            // FRAME 411
            spineAngleDeg: -116.6,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 41.6,
            rightElbowAngleDeg: 71.99,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 82.02,
            leftKneeAngleDeg: -112.02,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -19.2
        },
        {
            // FRAME 412
            spineAngleDeg: -116.48,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 41.48,
            rightElbowAngleDeg: 72.57,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 81.14,
            leftKneeAngleDeg: -111.14,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -18.97
        },
        {
            // FRAME 413
            spineAngleDeg: -116.33,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 41.33,
            rightElbowAngleDeg: 73.33,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 80.0,
            leftKneeAngleDeg: -110.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -18.67
        },
        {
            // FRAME 414
            spineAngleDeg: -116.27,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 41.27,
            rightElbowAngleDeg: 73.65,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 79.52,
            leftKneeAngleDeg: -109.52,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -18.54
        },
        {
            // FRAME 415
            spineAngleDeg: -116.15,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 41.15,
            rightElbowAngleDeg: 74.24,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 78.64,
            leftKneeAngleDeg: -108.64,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -18.31
        },
        {
            // FRAME 416
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
            // FRAME 417
            spineAngleDeg: -115.94,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 40.94,
            rightElbowAngleDeg: 75.32,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 77.02,
            leftKneeAngleDeg: -107.02,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -17.87
        },
        {
            // FRAME 418
            spineAngleDeg: -115.82,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 40.82,
            rightElbowAngleDeg: 75.91,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 76.14,
            leftKneeAngleDeg: -106.14,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -17.64
        },
        {
            // FRAME 419
            spineAngleDeg: -115.67,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 40.67,
            rightElbowAngleDeg: 76.67,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 75.0,
            leftKneeAngleDeg: -105.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -17.33
        },
        {
            // FRAME 420
            spineAngleDeg: -115.6,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 40.6,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 74.52,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -17.2
        },
        {
            // FRAME 421
            spineAngleDeg: -115.48,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 40.48,
            rightElbowAngleDeg: 77.57,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 73.64,
            leftKneeAngleDeg: -103.64,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -16.97
        },
        {
            // FRAME 422
            spineAngleDeg: -115.33,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 40.33,
            rightElbowAngleDeg: 78.33,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 72.5,
            leftKneeAngleDeg: -102.5,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -16.67
        },
        {
            // FRAME 423
            spineAngleDeg: -115.27,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 40.27,
            rightElbowAngleDeg: 78.65,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 72.02,
            leftKneeAngleDeg: -102.02,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -16.54
        },
        {
            // FRAME 424
            spineAngleDeg: -115.15,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 40.15,
            rightElbowAngleDeg: 79.24,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 71.14,
            leftKneeAngleDeg: -101.14,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -16.31
        },
        {
            // FRAME 425
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
            // FRAME 426
            spineAngleDeg: -116.17,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.83,
            leftUpperArmAngleDeg: 109.17,
            leftElbowAngleDeg: 104.5,
            rightUpperArmAngleDeg: 38.5,
            rightElbowAngleDeg: 79.73,
            pelvisJointDist: 5.4,
            pelvisJointAngleDeg: 109.17,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 70.83,
            leftKneeAngleDeg: -97.5,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -15.67
        },
        {
            // FRAME 427
            spineAngleDeg: -117.33,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 91.67,
            leftUpperArmAngleDeg: 108.33,
            leftElbowAngleDeg: 104.0,
            rightUpperArmAngleDeg: 37.0,
            rightElbowAngleDeg: 79.47,
            pelvisJointDist: 5.8,
            pelvisJointAngleDeg: 108.33,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 71.67,
            leftKneeAngleDeg: -95.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -15.33
        },
        {
            // FRAME 428
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
            // FRAME 429
            spineAngleDeg: -119.67,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 93.33,
            leftUpperArmAngleDeg: 106.67,
            leftElbowAngleDeg: 103.0,
            rightUpperArmAngleDeg: 34.0,
            rightElbowAngleDeg: 78.97,
            pelvisJointDist: 6.63,
            pelvisJointAngleDeg: 106.67,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 73.33,
            leftKneeAngleDeg: -90.0,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -14.67
        },
        {
            // FRAME 430
            spineAngleDeg: -120.83,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 94.17,
            leftUpperArmAngleDeg: 105.83,
            leftElbowAngleDeg: 102.5,
            rightUpperArmAngleDeg: 32.5,
            rightElbowAngleDeg: 78.73,
            pelvisJointDist: 7.07,
            pelvisJointAngleDeg: 105.83,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 74.17,
            leftKneeAngleDeg: -87.5,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -14.33
        },
        {
            // FRAME 431
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
            // FRAME 432
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
            leftKneeAngleDeg: -82.5,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -13.75
        },
        {
            // FRAME 433
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
            // FRAME 434
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
            leftKneeAngleDeg: -77.5,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -13.25
        },
        {
            // FRAME 435
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
            // FRAME 436
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
            leftKneeAngleDeg: -72.5,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -12.75
        },
        {
            // FRAME 437
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
            // FRAME 438
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
            leftKneeAngleDeg: -67.5,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -12.25
        },
        {
            // FRAME 439
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
    //  PRE-DELIVERY JUMP & LANDING KEYFRAMES ARRAY (For tuning gather, landing, & delivery)
    // ─────────────────────────────────────────────────────────────────────────
    public static readonly PRE_DELIVERY_JUMP: KeyframePose[] = [
        {
            // FRAME 1
            spineAngleDeg: -115.6,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 40.6,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 74.52,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -17.2
        },
         {
            // FRAME 2
            spineAngleDeg: -108,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 85.0,
            leftUpperArmAngleDeg: 115.0,
            leftElbowAngleDeg: 112.0,
            rightUpperArmAngleDeg: 45,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 145.0,
            rightThighAngleDeg: 70,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -17.2
        },
       
        {
            // FRAME 3
            spineAngleDeg: -98,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 80.0,
            leftUpperArmAngleDeg: 120.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 50.6,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 110.0,
            leftThighAngleDeg: 140.0,
            rightThighAngleDeg: 60,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -17.2
        },
         {
            // FRAME 4
            spineAngleDeg: -96,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 80.0,
            leftUpperArmAngleDeg: 135.0,
            leftElbowAngleDeg: 110.0,
            rightUpperArmAngleDeg: 52.6,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 100.0,//
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 65,
            leftKneeAngleDeg: -85,
            rightKneeAngleDeg: -23.0,
            hipYOffset: -17.2
        },
        {
            // FRAME 5
            spineAngleDeg: -94,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 80.0,
            leftUpperArmAngleDeg: 142.0,
            leftElbowAngleDeg: 105.0,
            rightUpperArmAngleDeg: 52.6,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 90.0,//
            leftThighAngleDeg: 155.0,
            rightThighAngleDeg: 68,
            leftKneeAngleDeg: -80,
            rightKneeAngleDeg: -21.0,
            hipYOffset: -17.2
        },
        {
            // FRAME 6
            spineAngleDeg: -92,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 80.0,
            leftUpperArmAngleDeg: 150.0,
            leftElbowAngleDeg: 100.0,
            rightUpperArmAngleDeg: 55.6,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 80.0,
            leftThighAngleDeg: 160.0,
            rightThighAngleDeg: 70,
            leftKneeAngleDeg: -75,
            rightKneeAngleDeg: -20.0,
            hipYOffset: -17.2
        },//2 end
         {
            // FRAME 7
            spineAngleDeg: -89,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 80.0,
            leftUpperArmAngleDeg: 155.0,
            leftElbowAngleDeg: 100.0,
            rightUpperArmAngleDeg: 48,
            rightElbowAngleDeg: 80,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 80.0,
            leftThighAngleDeg: 155.0,
            rightThighAngleDeg: 65.0,
            leftKneeAngleDeg: -67,
            rightKneeAngleDeg: -25.0,
            hipYOffset: -17.2
        },
        {
            // FRAME 8
            spineAngleDeg: -86,
            shoulderJointDist: 40.0,
            shoulderJointAngleDeg: 80.0,
            leftUpperArmAngleDeg: 160.0,
            leftElbowAngleDeg: 100.0,
            rightUpperArmAngleDeg: 40,
            rightElbowAngleDeg: 85,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 80.0,
            leftThighAngleDeg: 150.0,
            rightThighAngleDeg: 60.0,
            leftKneeAngleDeg: -60,
            rightKneeAngleDeg: -30.0,
            hipYOffset: -17.2
        },
        {
            // FRAME 9
            spineAngleDeg: -90,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 175.0,
            leftElbowAngleDeg: 90.0,
            rightUpperArmAngleDeg: 40,
            rightElbowAngleDeg: 85,
            pelvisJointDist: 5.0,
            pelvisJointAngleDeg: 80.0,
            leftThighAngleDeg: 140.0,
            rightThighAngleDeg: 65.0,
            leftKneeAngleDeg: -43,
            rightKneeAngleDeg: -45.0,
            hipYOffset: -17.2
        },//till 4th

          {
            // FRAME 10
            spineAngleDeg: -90,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 90.0,
            leftUpperArmAngleDeg: 185.0,
            leftElbowAngleDeg: 90.0,
            rightUpperArmAngleDeg: 45,
            rightElbowAngleDeg: 85,
            pelvisJointDist: -5.0,
            pelvisJointAngleDeg: 80.0,
            leftThighAngleDeg: 140.0,
            rightThighAngleDeg: 70.0,
            leftKneeAngleDeg: -43,
            rightKneeAngleDeg: -70.0,
            hipYOffset: -17.2
        },//till 5th
           {
            // FRAME 11
            spineAngleDeg: -95,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 100.0,
            leftUpperArmAngleDeg: 185.0,
            leftElbowAngleDeg: 90.0,
            rightUpperArmAngleDeg: 45,
            rightElbowAngleDeg: 85,
            pelvisJointDist: -15.0,
            pelvisJointAngleDeg: 80.0,
            leftThighAngleDeg: 135.0,
            rightThighAngleDeg: 80.0,
            leftKneeAngleDeg: -50,
            rightKneeAngleDeg: -90.0,
            hipYOffset: -17.2
        },//till 6th
            {
            // FRAME 12
            spineAngleDeg: -90,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 100.0,
            leftUpperArmAngleDeg: 200.0,
            leftElbowAngleDeg: 50.0,
            rightUpperArmAngleDeg: 60,
            rightElbowAngleDeg: 85,
            pelvisJointDist: -25.0,
            pelvisJointAngleDeg: 90.0,
            leftThighAngleDeg: 125.0,
            rightThighAngleDeg: 60.0,
            leftKneeAngleDeg: -25,
            rightKneeAngleDeg: -90.0,
            hipYOffset: -17.2
        },//till 7th
           {
            // FRAME 13
            spineAngleDeg: -90,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 100.0,
            leftUpperArmAngleDeg: 220.0,
            leftElbowAngleDeg: 35.0,
            rightUpperArmAngleDeg: 65,
            rightElbowAngleDeg: 75,
            pelvisJointDist: -25.0,
            pelvisJointAngleDeg: 90.0,
            leftThighAngleDeg: 130.0,
            rightThighAngleDeg: 80.0,
            leftKneeAngleDeg: -25,
            rightKneeAngleDeg: -90.0,
            hipYOffset: -17.2
        },//till 8th
         {
            // FRAME 14
            spineAngleDeg: -88,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 210.0,
            leftElbowAngleDeg: 45.0,
            rightUpperArmAngleDeg: 70,
            rightElbowAngleDeg: 75,
            pelvisJointDist: -25.0,
            pelvisJointAngleDeg: 90.0,
            leftThighAngleDeg: 115.0,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: -20,
            rightKneeAngleDeg: -125.0,
            hipYOffset: -17.2
        },//till 9th
         {
            // FRAME 15
            spineAngleDeg: -88,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 205.0,
            leftElbowAngleDeg: 45.0,
            rightUpperArmAngleDeg: 80,
            rightElbowAngleDeg: 75,
            pelvisJointDist: -25.0,
            pelvisJointAngleDeg: 90.0,
            leftThighAngleDeg: 115.0,
            rightThighAngleDeg: 90.0,
            leftKneeAngleDeg: -25,
            rightKneeAngleDeg: -115.0,
            hipYOffset: -21.2
        },//till 11h
         {
            // FRAME 16
            spineAngleDeg: -88,
            shoulderJointDist: 50.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 190.0,
            leftElbowAngleDeg: 45.0,
            rightUpperArmAngleDeg: 95,
            rightElbowAngleDeg: 75,
            pelvisJointDist: -25.0,
            pelvisJointAngleDeg: 90.0,
            leftThighAngleDeg: 105.0,
            rightThighAngleDeg: 105.0,
            leftKneeAngleDeg: -25,
            rightKneeAngleDeg: -120.0,
            hipYOffset: -25.2
        },//till 12h
           {
            // FRAME 17
            spineAngleDeg: -88,
            shoulderJointDist: 25.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 150.0,
            leftElbowAngleDeg: 60.0,
            rightUpperArmAngleDeg: 110,
            rightElbowAngleDeg: 75,
            pelvisJointDist: -25.0,
            pelvisJointAngleDeg: 90.0,
            leftThighAngleDeg: 98.0,
            rightThighAngleDeg: 122.0,
            leftKneeAngleDeg: -25,
            rightKneeAngleDeg: -120.0,
            hipYOffset: -26.2
        },//till 14h 13 missing
          {
            // FRAME 18
            spineAngleDeg: -88, 
            shoulderJointDist: 15.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 100,
            rightElbowAngleDeg: 75,
            pelvisJointDist: -25.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 90.0,
            rightThighAngleDeg: 122.0,
            leftKneeAngleDeg: -25,
            rightKneeAngleDeg: -120.0,
            hipYOffset: -26.2
        },//till 15th
         {
            // FRAME 19
            spineAngleDeg: -80, 
            shoulderJointDist: 15.0,
            shoulderJointAngleDeg: 105.0,
            leftUpperArmAngleDeg: 90.0,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 100,
            rightElbowAngleDeg: 75,
            pelvisJointDist: -25.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 70.0,
            rightThighAngleDeg: 122.0,
            leftKneeAngleDeg: -25,
            rightKneeAngleDeg: -105.0,
            hipYOffset: -25.2
        },//till 16th
        {
            // FRAME 20
            spineAngleDeg: -80, 
            shoulderJointDist: 15.0,
            shoulderJointAngleDeg: 80.0,
            leftUpperArmAngleDeg: 110.0,
            leftElbowAngleDeg: 120.0,
            rightUpperArmAngleDeg: 120,
            rightElbowAngleDeg: 95,
            pelvisJointDist: -35.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 60.0,
            rightThighAngleDeg: 122.0,
            leftKneeAngleDeg: -25,
            rightKneeAngleDeg: -100.0,
            hipYOffset: -25.2
        },// 18th
         {
            // FRAME 21
            spineAngleDeg: -75, 
            shoulderJointDist: -10.0,
            shoulderJointAngleDeg: 80.0,
            leftUpperArmAngleDeg: 60.0,
            leftElbowAngleDeg: 100.0,
            rightUpperArmAngleDeg: 130,
            rightElbowAngleDeg: 105,
            pelvisJointDist: -35.0,
            pelvisJointAngleDeg: 100.0,
            leftThighAngleDeg: 55.0,
            rightThighAngleDeg: 122.0,
            leftKneeAngleDeg: -25,
            rightKneeAngleDeg: -70.0,
            hipYOffset: -29.2
        },// 19th

        {
            // FRAME 22
            spineAngleDeg: -75, 
            shoulderJointDist: -30.0,
            shoulderJointAngleDeg: 80.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 130,
            rightElbowAngleDeg: 135,
            pelvisJointDist: -35.0,
            pelvisJointAngleDeg: 80.0,
            leftThighAngleDeg: 70.0,
            rightThighAngleDeg: 135.0,
            leftKneeAngleDeg: -30,
            rightKneeAngleDeg: -50.0,
            hipYOffset: -29.2
        },// 21st
        {
            // FRAME 23
            spineAngleDeg: -75, 
            shoulderJointDist: -30.0,
            shoulderJointAngleDeg: 80.0,
            leftUpperArmAngleDeg: 65.0,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 130,
            rightElbowAngleDeg: 140,
            pelvisJointDist: -35.0,
            pelvisJointAngleDeg: 70.0,
            leftThighAngleDeg: 90.0,
            rightThighAngleDeg: 160.0,
            leftKneeAngleDeg: -80,
            rightKneeAngleDeg: -50.0,
            hipYOffset: -29.2
        },// 23

           {
            // FRAME 24
            spineAngleDeg: -80, 
            shoulderJointDist: -50.0,
            shoulderJointAngleDeg: 80.0,
            leftUpperArmAngleDeg: 80.0,
            leftElbowAngleDeg: 80.0,
            rightUpperArmAngleDeg: 130,
            rightElbowAngleDeg: 140,
            pelvisJointDist: 20.0,
            pelvisJointAngleDeg: 80.0, 
            leftThighAngleDeg: 90.0,
            rightThighAngleDeg: 140.0,
            leftKneeAngleDeg: -100,
            rightKneeAngleDeg: -25.0,
            hipYOffset: -29.2
        },// 26
           {
            // FRAME 25
            spineAngleDeg: -80, 
            shoulderJointDist: -60.0,
            shoulderJointAngleDeg: 100.0,
            leftUpperArmAngleDeg: 80.0,
            leftElbowAngleDeg: 60.0,
            rightUpperArmAngleDeg: 130,
            rightElbowAngleDeg: 140,
            pelvisJointDist: 35.0,
            pelvisJointAngleDeg: 80.0, 
            leftThighAngleDeg: 110.0,
            rightThighAngleDeg: 140.0,
            leftKneeAngleDeg: -130,
            rightKneeAngleDeg: -15.0,
            hipYOffset: -24.2
        },// 29

           {
            // FRAME 26
            spineAngleDeg: -80, 
            shoulderJointDist: -60.0,
            shoulderJointAngleDeg: 100.0,
            leftUpperArmAngleDeg: 80.0,
            leftElbowAngleDeg: 60.0,
            rightUpperArmAngleDeg: 150,
            rightElbowAngleDeg: 120,
            pelvisJointDist: 35.0,
            pelvisJointAngleDeg: 80.0, 
            leftThighAngleDeg: 140.0,
            rightThighAngleDeg: 130.0,
            leftKneeAngleDeg: -130,
            rightKneeAngleDeg: -15.0,
            hipYOffset: -20.2
        },// 31
             {
            // FRAME 27
            spineAngleDeg: -90, 
            shoulderJointDist: -60.0,
            shoulderJointAngleDeg: 100.0,
            leftUpperArmAngleDeg: 90.0,
            leftElbowAngleDeg: 60.0,
            rightUpperArmAngleDeg: 160,
            rightElbowAngleDeg: 120,
            pelvisJointDist: 35.0,
            pelvisJointAngleDeg: 100.0, 
            leftThighAngleDeg: 140.0,
            rightThighAngleDeg: 110.0,
            leftKneeAngleDeg: -120,
            rightKneeAngleDeg: -15.0,
            hipYOffset: -20.2
        },// 33
           {
            // FRAME 28
            spineAngleDeg: -95, 
            shoulderJointDist: -60.0,
            shoulderJointAngleDeg: 100.0,
            leftUpperArmAngleDeg: 95.0,
            leftElbowAngleDeg: 60.0,
            rightUpperArmAngleDeg: 180,
            rightElbowAngleDeg: 100,
            pelvisJointDist: 35.0,
            pelvisJointAngleDeg: 110.0, 
            leftThighAngleDeg: 160.0,
            rightThighAngleDeg: 110.0,
            leftKneeAngleDeg: -120,
            rightKneeAngleDeg: -25.0,
            hipYOffset: -29.2
        },// 36+
           {
            // FRAME 29
            spineAngleDeg: -95, 
            shoulderJointDist: -60.0,
            shoulderJointAngleDeg: 120.0,
            leftUpperArmAngleDeg: 80.0,
            leftElbowAngleDeg: 30.0,
            rightUpperArmAngleDeg: 190,
            rightElbowAngleDeg: 60,
            pelvisJointDist: 35.0,
            pelvisJointAngleDeg: 120.0, 
            leftThighAngleDeg: 165.0,
            rightThighAngleDeg: 90.0,
            leftKneeAngleDeg: -90,
            rightKneeAngleDeg: -25.0,
            hipYOffset: -29.2
        },// 39
           {
            // FRAME 30
            spineAngleDeg: -95, 
            shoulderJointDist: -60.0,
            shoulderJointAngleDeg: 120.0,
            leftUpperArmAngleDeg: 80.0,
            leftElbowAngleDeg: 30.0,
            rightUpperArmAngleDeg: 210,
            rightElbowAngleDeg: 30,
            pelvisJointDist: 35.0,
            pelvisJointAngleDeg: 120.0, 
            leftThighAngleDeg: 160.0,
            rightThighAngleDeg: 85.0,
            leftKneeAngleDeg: -45,
            rightKneeAngleDeg: -35.0,
            hipYOffset: -29.2
        },// 41
          {
            // FRAME 31
            spineAngleDeg: -95, 
            shoulderJointDist: -60.0,
            shoulderJointAngleDeg: 120.0,
            leftUpperArmAngleDeg: 80.0,
            leftElbowAngleDeg: 70.0,
            rightUpperArmAngleDeg: 210,
            rightElbowAngleDeg: 30,
            pelvisJointDist: 35.0,
            pelvisJointAngleDeg: 110.0, 
            leftThighAngleDeg: 155.0,
            rightThighAngleDeg: 85.0,
            leftKneeAngleDeg: -25,
            rightKneeAngleDeg: -50.0,
            hipYOffset: -24.2
        },// 44
        {
            // FRAME 32
            spineAngleDeg: -90, 
            shoulderJointDist: -60.0,
            shoulderJointAngleDeg: 110.0,
            leftUpperArmAngleDeg: 70.0,
            leftElbowAngleDeg: 10.0,
            rightUpperArmAngleDeg: 195.0,
            rightElbowAngleDeg: 30,
            pelvisJointDist: 35.0,
            pelvisJointAngleDeg: 110.0, 
            leftThighAngleDeg: 145.0,
            rightThighAngleDeg: 75.0,
            leftKneeAngleDeg: -0,
            rightKneeAngleDeg: -60.0,
            hipYOffset: -19.2
        },// 47
         {
            // FRAME 33
            spineAngleDeg: -90, 
            shoulderJointDist: -60.0,
            shoulderJointAngleDeg: 100.0,
            leftUpperArmAngleDeg: 50.0,
            leftElbowAngleDeg: -10.0,
            rightUpperArmAngleDeg: 178.0,
            rightElbowAngleDeg: 30,
            pelvisJointDist: 35.0,
            pelvisJointAngleDeg: 100.0, 
            leftThighAngleDeg: 145.0,
            rightThighAngleDeg: 75.0,
            leftKneeAngleDeg: -0,
            rightKneeAngleDeg: -60.0,
            hipYOffset: 0.2
        },// 50
        {
            // FRAME 34
            spineAngleDeg: -90, 
            shoulderJointDist: -60.0,
            shoulderJointAngleDeg: 100.0,
            leftUpperArmAngleDeg: 25.0,
            leftElbowAngleDeg: -15.0,
            rightUpperArmAngleDeg: 150.0,
            rightElbowAngleDeg: 30,
            pelvisJointDist: 35.0,
            pelvisJointAngleDeg: 85.0, 
            leftThighAngleDeg: 145.0,
            rightThighAngleDeg: 75.0,
            leftKneeAngleDeg: -15,
            rightKneeAngleDeg: -40.0,
            hipYOffset: 0.2
        },// 55

        {
            // FRAME 35
            spineAngleDeg: -90, 
            shoulderJointDist: -60.0,
            shoulderJointAngleDeg: 85.0,
            leftUpperArmAngleDeg: 25.0,
            leftElbowAngleDeg: -15.0,
            rightUpperArmAngleDeg: 150.0,
            rightElbowAngleDeg: 30,
            pelvisJointDist: 35.0,
            pelvisJointAngleDeg: 85.0, 
            leftThighAngleDeg: 155.0,
            rightThighAngleDeg: 75.0,
            leftKneeAngleDeg: -15,
            rightKneeAngleDeg: -50.0,
            hipYOffset: 20
        },// 55
         {
            // FRAME 36
            spineAngleDeg: -90, 
            shoulderJointDist: -60.0,
            shoulderJointAngleDeg: 80.0,
            leftUpperArmAngleDeg: 10.0,
            leftElbowAngleDeg: -15.0,
            rightUpperArmAngleDeg: 135.0,
            rightElbowAngleDeg: 30,
            pelvisJointDist: 35.0,
            pelvisJointAngleDeg: 85.0, 
            leftThighAngleDeg: 140.0,
            rightThighAngleDeg: 75.0,
            leftKneeAngleDeg: -0,
            rightKneeAngleDeg: -50.0,
            hipYOffset: 20
        },// my
        {
            // FRAME 37
            spineAngleDeg: -100, 
            shoulderJointDist: -70.0,
            shoulderJointAngleDeg: 65.0,
            leftUpperArmAngleDeg: 10.0,
            leftElbowAngleDeg: -5.0,
            rightUpperArmAngleDeg: 130.0,
            rightElbowAngleDeg: 30,
            pelvisJointDist: 15.0, 
            pelvisJointAngleDeg: 85.0, 
            leftThighAngleDeg: 140.0,
            rightThighAngleDeg: 100.0,
            leftKneeAngleDeg: 2,
            rightKneeAngleDeg: -60.0, 
            hipYOffset: 5
        },// my
        {
            // FRAME 38  
            spineAngleDeg: -120, 
            shoulderJointDist: -70.0,
            shoulderJointAngleDeg: 40.0,
            leftUpperArmAngleDeg: 15.0,
            leftElbowAngleDeg: 0, 
            rightUpperArmAngleDeg: 140.0,
            rightElbowAngleDeg: 50,
            pelvisJointDist: 0.0,
            pelvisJointAngleDeg: 80.0, 
            leftThighAngleDeg: 165.0,
            rightThighAngleDeg: 125.0, 
            leftKneeAngleDeg: -5, 
            rightKneeAngleDeg: -60.0,
            hipYOffset: 5   
        },// my
        {
            // FRAME 39    
            spineAngleDeg: -130, 
            shoulderJointDist: -70.0,
            shoulderJointAngleDeg: 10.0,
            leftUpperArmAngleDeg: 10.0,
            leftElbowAngleDeg: 10, 
            rightUpperArmAngleDeg: 190.0, 
            rightElbowAngleDeg: 50,
            pelvisJointDist: 0.0,
            pelvisJointAngleDeg: 80.0,  
            leftThighAngleDeg: 175.0,  
            rightThighAngleDeg: 150.0, 
            leftKneeAngleDeg: 2, 
            rightKneeAngleDeg: -70.0,
            hipYOffset: 1     
        },// my
         {
            // FRAME 40
            spineAngleDeg: -130, 
            shoulderJointDist: -70.0,
            shoulderJointAngleDeg: 10.0,
            leftUpperArmAngleDeg: -10.0,
            leftElbowAngleDeg: -10, 
            rightUpperArmAngleDeg: 190.0, 
            rightElbowAngleDeg: 50,
            pelvisJointDist: 0.0,
            pelvisJointAngleDeg: 80.0,  
            leftThighAngleDeg: 175.0,  
            rightThighAngleDeg: 160.0, 
            leftKneeAngleDeg: 2, 
            rightKneeAngleDeg: -75.0,
            hipYOffset: 1     
        },// my

         {
            // FRAME 41
            spineAngleDeg: -150, 
            shoulderJointDist: -70.0,
            shoulderJointAngleDeg: 10.0,
            leftUpperArmAngleDeg: -30.0,
            leftElbowAngleDeg: -10,                   
            rightUpperArmAngleDeg: 190.0, 
            rightElbowAngleDeg: 50,
            pelvisJointDist: 0.0,
            pelvisJointAngleDeg: 80.0,  
            leftThighAngleDeg: 175.0,  
            rightThighAngleDeg: 185.0, 
            leftKneeAngleDeg: 2, 
            rightKneeAngleDeg: -75.0,
            hipYOffset: -15  
        },// my   
        {
            // FRAME 42
            spineAngleDeg: -170, 
            shoulderJointDist: -70.0,
            shoulderJointAngleDeg: 10.0,
            leftUpperArmAngleDeg: -70.0,
            leftElbowAngleDeg: -10,                    
            rightUpperArmAngleDeg: 200.0, 
            rightElbowAngleDeg: 60,
            pelvisJointDist: 0.0,          
            pelvisJointAngleDeg: 80.0,    
            leftThighAngleDeg: 190.0,  
            rightThighAngleDeg: 215.0,  
            leftKneeAngleDeg: 2, 
            rightKneeAngleDeg: -75.0,
            hipYOffset: -25  
        },// my   



    ];

    // ─────────────────────────────────────────────────────────────────────────
    constructor(startX = 1100) {
        this.currentHipPosition = { x: startX, y: 0 };
        this.setInitialRunPose();
    }

    // ─────────────────────────────────────────────────────────────────────────
    public update(dt: number): void {
        // Smoothly interpolate run intensity gradually over runup
        const accel = 0.90; // Fast punchy run-up acceleration factor
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

    // Generator function that expands N base keyframes into 420+ ultra-dense Catmull-Rom sub-frames
    public static generateExpandedFrames(baseFrames: KeyframePose[], targetCount: number = 420): KeyframePose[] {
        const result: KeyframePose[] = [];
        const totalBase = baseFrames.length;
        if (totalBase === 0) return result;
        if (totalBase === 1) return Array(targetCount).fill(baseFrames[0]);

        for (let i = 0; i < targetCount; i++) {
            const progress = i / (targetCount - 1);
            const frameFloat = progress * (totalBase - 1);
            const idx1 = Math.floor(frameFloat);
            const idx0 = Math.max(0, idx1 - 1);
            const idx2 = Math.min(totalBase - 1, idx1 + 1);
            const idx3 = Math.min(totalBase - 1, idx1 + 2);
            const t = frameFloat - Math.floor(frameFloat);

            const pose0 = baseFrames[idx0];
            const pose1 = baseFrames[idx1];
            const pose2 = baseFrames[idx2];
            const pose3 = baseFrames[idx3];

            result.push(Bowler.interpolateCatmullRom(pose0, pose1, pose2, pose3, t));
        }
        return result;
    }

    private static _cachedExpandedJumpFrames: KeyframePose[] | null = null;
    public static getExpandedJumpFrames(): KeyframePose[] {
        if (!Bowler._cachedExpandedJumpFrames || Bowler._cachedExpandedJumpFrames.length === 0) {
            Bowler._cachedExpandedJumpFrames = Bowler.generateExpandedFrames(Bowler.PRE_DELIVERY_JUMP, 420);
        }
        return Bowler._cachedExpandedJumpFrames;
    }

    private static _angleLUT: { frame1Index: number; frame2Index: number; t: number; isExact: boolean }[] | null = null;

    public static getAngleLUT(): { frame1Index: number; frame2Index: number; t: number; isExact: boolean }[] {
        if (!Bowler._angleLUT) {
            Bowler._angleLUT = Bowler.buildAngleLUT();
        }
        return Bowler._angleLUT;
    }

    private static buildAngleLUT(): { frame1Index: number; frame2Index: number; t: number; isExact: boolean }[] {
        const jumpFrames = Bowler.getExpandedJumpFrames();
        const lut: { frame1Index: number; frame2Index: number; t: number; isExact: boolean }[] = new Array(360);

        const frameAngles = jumpFrames.map(f => {
            let totalDeg = (f.spineAngleDeg + f.shoulderJointAngleDeg + f.leftUpperArmAngleDeg) % 360;
            if (totalDeg < 0) totalDeg += 360;
            return totalDeg;
        });

        for (let deg = 0; deg < 360; deg++) {
            let bestI = 0;
            let secondBestI = 1;
            let minDiff = Infinity;
            let secondMinDiff = Infinity;

            for (let i = 0; i < jumpFrames.length; i++) {
                let diff = Math.abs(frameAngles[i] - deg);
                if (diff > 180) diff = 360 - diff;

                if (diff < minDiff) {
                    secondMinDiff = minDiff;
                    secondBestI = bestI;
                    minDiff = diff;
                    bestI = i;
                } else if (diff < secondMinDiff) {
                    secondMinDiff = diff;
                    secondBestI = i;
                }
            }

            if (minDiff < 0.001 || bestI === secondBestI) {
                lut[deg] = {
                    frame1Index: bestI,
                    frame2Index: bestI,
                    t: 0,
                    isExact: true
                };
            } else {
                const totalRange = minDiff + secondMinDiff;
                const t = totalRange > 0.0001 ? minDiff / totalRange : 0;
                lut[deg] = {
                    frame1Index: bestI,
                    frame2Index: secondBestI,
                    t: t,
                    isExact: false
                };
            }
        }

        return lut;
    }

    private static _keyframeRatios: {
        spineRatio: number;
        nonBowlingArmRatio: number;
        nonBowlingElbowRatio: number;
        shoulderAngleRatio: number;
        shoulderDistRatio: number;
    } | null = null;

    public static getKeyframeMotionRatios() {
        if (!Bowler._keyframeRatios) {
            const frames = Bowler.PRE_DELIVERY_JUMP;
            let sumSpine = 0;
            let sumNBArm = 0;
            let sumNBElbow = 0;
            let sumShoulderAngle = 0;
            let sumShoulderDist = 0;
            let validPairs = 0;

            for (let i = 0; i < frames.length - 1; i++) {
                const f1 = frames[i];
                const f2 = frames[i + 1];

                const armAng1 = f1.spineAngleDeg + f1.shoulderJointAngleDeg + f1.leftUpperArmAngleDeg;
                const armAng2 = f2.spineAngleDeg + f2.shoulderJointAngleDeg + f2.leftUpperArmAngleDeg;
                const deltaArm = Math.abs(armAng2 - armAng1);

                if (deltaArm > 0.001) {
                    sumSpine += Math.abs(f2.spineAngleDeg - f1.spineAngleDeg) / deltaArm;
                    sumNBArm += Math.abs(f2.rightUpperArmAngleDeg - f1.rightUpperArmAngleDeg) / deltaArm;
                    sumNBElbow += Math.abs(f2.rightElbowAngleDeg - f1.rightElbowAngleDeg) / deltaArm;
                    sumShoulderAngle += Math.abs(f2.shoulderJointAngleDeg - f1.shoulderJointAngleDeg) / deltaArm;
                    sumShoulderDist += Math.abs(f2.shoulderJointDist - f1.shoulderJointDist) / deltaArm;
                    validPairs++;
                }
            }

            const count = validPairs > 0 ? validPairs : 1;
            Bowler._keyframeRatios = {
                spineRatio: sumSpine / count,
                nonBowlingArmRatio: sumNBArm / count,
                nonBowlingElbowRatio: sumNBElbow / count,
                shoulderAngleRatio: sumShoulderAngle / count,
                shoulderDistRatio: sumShoulderDist / count
            };
        }
        return Bowler._keyframeRatios;
    }

    private static _rangeLUT: RangeLinkedList[] | null = null;

    public static getRangeLUT(): RangeLinkedList[] {
        if (!Bowler._rangeLUT) {
            Bowler._rangeLUT = Bowler.buildRangeLUT();
        }
        return Bowler._rangeLUT;
    }

    private static buildRangeLUT(): RangeLinkedList[] {
        const lut: RangeLinkedList[] = new Array(360);
        for (let i = 0; i < 360; i++) {
            lut[i] = new RangeLinkedList();
        }

        const frames = Bowler.PRE_DELIVERY_JUMP;
        for (let i = 0; i < frames.length - 1; i++) {
            const f1 = frames[i];
            const f2 = frames[i + 1];

            const ang1 = Math.round(f1.leftUpperArmAngleDeg);
            const ang2 = Math.round(f2.leftUpperArmAngleDeg);

            const step = ang1 <= ang2 ? 1 : -1;
            let currentAng = ang1;
            while (true) {
                const targetIndex = (currentAng % 360 + 360) % 360;
                lut[targetIndex].append(i, ang1, i + 1, ang2);
                if (currentAng === ang2) break;
                currentAng += step;
            }
        }

        return lut;
    }

    public static resetAllRangeLUTPointers(): void {
        const lut = Bowler.getRangeLUT();
        lut.forEach(list => list.resetPointer());
    }

    public currentProceduralNBArmAngleDeg: number = 48.0;
    public currentProceduralNBElbowAngleDeg: number = 75.0;
    public currentProceduralSpineAngleDeg: number = -130.0;
    public currentProceduralShoulderAngleDeg: number = 100.0;
    public currentProceduralShoulderDist: number = 15.0;
    public currentProceduralPelvisAngleDeg: number = 10.0;
    public currentProceduralPelvisDist: number = 18.0;
    public currentProceduralLeftThighDeg: number = -15.0;
    public currentProceduralRightThighDeg: number = 30.0;
    public currentProceduralLeftKneeDeg: number = 45.0;
    public currentProceduralRightKneeDeg: number = 30.0;
    public currentProceduralHipYOffset: number = 0.0;
    public currentProceduralJumpXOffset: number = 0.0;
    public unwrappedArmAngleDeg: number = 180.0;
    public static getJumpKeyframeStrideRatio(uIdx: number): number {
        // Total 41 Keyframes non-linear stride displacement curve S(uIdx)
        if (uIdx <= 0) return 0.0;
        if (uIdx >= 41) return 1.0;

        if (uIdx <= 9) {
            // Stage 1 (Frames 0 -> 9): 1st Foot Plant & Spring Pull Stride Ease-Out
            const alpha = uIdx / 9.0;
            return 0.28 * (1 - Math.pow(1 - alpha, 2));
        } else if (uIdx <= 13) {
            // Stage 2 (Frames 9 -> 13): Light Linear Momentum Carryover
            const alpha = (uIdx - 9.0) / 4.0;
            return 0.28 + 0.12 * alpha;
        } else if (uIdx <= 30) {
            // Stage 3 (Frames 13 -> 30): 2nd Foot Spring Stride & Drive Ease-Out
            const alpha = (uIdx - 13.0) / 17.0;
            return 0.40 + 0.42 * (1 - Math.pow(1 - alpha, 2));
        } else {
            // Stage 4 (Frames 30 -> 41): Final Light Linear Momentum Glide to Delivery Finish
            const alpha = (uIdx - 30.0) / 11.0;
            return 0.82 + 0.18 * alpha;
        }
    }

    public getProceduralUpperBodyPose(armAngleRad: number): KeyframePose {
        const frames = Bowler.PRE_DELIVERY_JUMP;
        const lastFrame = frames[frames.length - 1];

        // 🎯 CLAMP FINISH POSE AT FRAME 41 WHEN CYCLE COMPLETED (NO TELEPORT SNAP BACK TO FRAME 0!)
        if (this.isCycleCompleted) {
            const lerpFactor = 0.25;
            this.currentProceduralSpineAngleDeg += (lastFrame.spineAngleDeg - this.currentProceduralSpineAngleDeg) * lerpFactor;
            this.currentProceduralShoulderDist += (lastFrame.shoulderJointDist - this.currentProceduralShoulderDist) * lerpFactor;
            this.currentProceduralShoulderAngleDeg += (lastFrame.shoulderJointAngleDeg - this.currentProceduralShoulderAngleDeg) * lerpFactor;
            this.currentProceduralNBArmAngleDeg += (lastFrame.rightUpperArmAngleDeg - this.currentProceduralNBArmAngleDeg) * lerpFactor;
            this.currentProceduralNBElbowAngleDeg += (lastFrame.rightElbowAngleDeg - this.currentProceduralNBElbowAngleDeg) * lerpFactor;

            const leftUpperArmAngleDeg = (armAngleRad * 180 / Math.PI) - this.currentProceduralSpineAngleDeg - this.currentProceduralShoulderAngleDeg;

            return {
                ...lastFrame,
                spineAngleDeg: this.currentProceduralSpineAngleDeg,
                shoulderJointDist: this.currentProceduralShoulderDist,
                shoulderJointAngleDeg: this.currentProceduralShoulderAngleDeg,
                leftUpperArmAngleDeg: leftUpperArmAngleDeg,
                leftElbowAngleDeg: 0.0,
                rightUpperArmAngleDeg: this.currentProceduralNBArmAngleDeg,
                rightElbowAngleDeg: this.currentProceduralNBElbowAngleDeg
            };
        }

        // 1. QUERY RANGE LUT WITH RAW JOYSTICK ANGLE (BODY FOLLOWS PURE KEYFRAME TABLE!)
        let targetDeg = Math.round((armAngleRad * 180 / Math.PI)) % 360;
        if (targetDeg < 0) targetDeg += 360;

        const lut = Bowler.getRangeLUT();
        const list = lut[targetDeg];
        const node = list.getCurrentNode();

        if (node) {
            const lIdx = Math.max(0, Math.min(frames.length - 1, node.lowerFrameIndex));
            const uIdx = Math.max(0, Math.min(frames.length - 1, node.upperFrameIndex));

            const lowerPose = frames[lIdx];
            const upperPose = frames[uIdx];

            // Direct Distance Ratio (t) Calculation between lowerPose and upperPose
            const range = node.upperAngleDeg - node.lowerAngleDeg;
            let t = 0;
            if (Math.abs(range) > 0.001) {
                t = Math.max(0, Math.min(1, (targetDeg - node.lowerAngleDeg) / range));
            }

            const lerpVal = (a: number, b: number, factor: number) => a + (b - a) * factor;
            const lerpDeg = (a: number, b: number, factor: number) => {
                let diff = (b - a) % 360;
                if (diff > 180) diff -= 360;
                if (diff < -180) diff += 360;
                return a + diff * factor;
            };

            const targetSpine = lerpDeg(lowerPose.spineAngleDeg, upperPose.spineAngleDeg, t);
            const targetDist = lerpVal(lowerPose.shoulderJointDist, upperPose.shoulderJointDist, t);
            const targetShAngle = lerpDeg(lowerPose.shoulderJointAngleDeg, upperPose.shoulderJointAngleDeg, t);
            const targetNBArm = lerpDeg(lowerPose.rightUpperArmAngleDeg, upperPose.rightUpperArmAngleDeg, t);
            const targetNBElbow = lerpDeg(lowerPose.rightElbowAngleDeg, upperPose.rightElbowAngleDeg, t);

            // Interpolate lower-body / legs fields for full-body hand sync
            const targetPelvisDist = lerpVal(lowerPose.pelvisJointDist, upperPose.pelvisJointDist, t);
            const targetPelvisAngle = lerpDeg(lowerPose.pelvisJointAngleDeg, upperPose.pelvisJointAngleDeg, t);
            const targetLeftThigh = lerpDeg(lowerPose.leftThighAngleDeg, upperPose.leftThighAngleDeg, t);
            const targetRightThigh = lerpDeg(lowerPose.rightThighAngleDeg, upperPose.rightThighAngleDeg, t);
            const targetLeftKnee = lerpDeg(lowerPose.leftKneeAngleDeg, upperPose.leftKneeAngleDeg, t);
            const targetRightKnee = lerpDeg(lowerPose.rightKneeAngleDeg, upperPose.rightKneeAngleDeg, t);
            const targetHipY = lerpVal(lowerPose.hipYOffset, upperPose.hipYOffset, t);

            // Calculate Keyframe-Driven Non-Linear Stride Displacement Ratio S(uIdx)
            const strideRatio1 = Bowler.getJumpKeyframeStrideRatio(lIdx);
            const strideRatio2 = Bowler.getJumpKeyframeStrideRatio(uIdx);
            const targetStrideRatio = lerpVal(strideRatio1, strideRatio2, t);

            // 60 FPS Bat-Style Spring-Damper Inertia Filtering Gliding
            const lerpFactor = 0.18;
            this.currentProceduralSpineAngleDeg += (targetSpine - this.currentProceduralSpineAngleDeg) * lerpFactor;
            this.currentProceduralShoulderDist += (targetDist - this.currentProceduralShoulderDist) * lerpFactor;
            this.currentProceduralShoulderAngleDeg += (targetShAngle - this.currentProceduralShoulderAngleDeg) * lerpFactor;
            this.currentProceduralNBArmAngleDeg += (targetNBArm - this.currentProceduralNBArmAngleDeg) * lerpFactor;
            this.currentProceduralNBElbowAngleDeg += (targetNBElbow - this.currentProceduralNBElbowAngleDeg) * lerpFactor;

            this.currentProceduralPelvisDist += (targetPelvisDist - this.currentProceduralPelvisDist) * lerpFactor;
            this.currentProceduralPelvisAngleDeg += (targetPelvisAngle - this.currentProceduralPelvisAngleDeg) * lerpFactor;
            this.currentProceduralLeftThighDeg += (targetLeftThigh - this.currentProceduralLeftThighDeg) * lerpFactor;
            this.currentProceduralRightThighDeg += (targetRightThigh - this.currentProceduralRightThighDeg) * lerpFactor;
            this.currentProceduralLeftKneeDeg += (targetLeftKnee - this.currentProceduralLeftKneeDeg) * lerpFactor;
            this.currentProceduralRightKneeDeg += (targetRightKnee - this.currentProceduralRightKneeDeg) * lerpFactor;
            this.currentProceduralHipYOffset += (targetHipY - this.currentProceduralHipYOffset) * lerpFactor;

            this.currentProceduralJumpXOffset += (targetStrideRatio * 200.0 - this.currentProceduralJumpXOffset) * lerpFactor;

            // Offset paused per user request (Dynamic Offset = 0)
            this.dynamicOffsetDeg = 0.0;

            // Detect if we have reached the final keyframe (Frame 41)
            if (uIdx >= frames.length - 1 && list.currentPointer && list.currentPointer.next === null) {
                this.isCycleCompleted = true;
            }

            // Pure Automatic Pointer Advancement (stuck at tail node, NEVER null!)
            list.advancePointerSafely();

            const leftUpperArmAngleDeg = (armAngleRad * 180 / Math.PI) - this.currentProceduralSpineAngleDeg - this.currentProceduralShoulderAngleDeg;

            return {
                ...lowerPose,
                spineAngleDeg: this.currentProceduralSpineAngleDeg,
                shoulderJointDist: this.currentProceduralShoulderDist,
                shoulderJointAngleDeg: this.currentProceduralShoulderAngleDeg,
                leftUpperArmAngleDeg: leftUpperArmAngleDeg,
                leftElbowAngleDeg: 0.0,
                rightUpperArmAngleDeg: this.currentProceduralNBArmAngleDeg,
                rightElbowAngleDeg: this.currentProceduralNBElbowAngleDeg,
                pelvisJointDist: this.currentProceduralPelvisDist,
                pelvisJointAngleDeg: this.currentProceduralPelvisAngleDeg,
                leftThighAngleDeg: this.currentProceduralLeftThighDeg,
                rightThighAngleDeg: this.currentProceduralRightThighDeg,
                leftKneeAngleDeg: this.currentProceduralLeftKneeDeg,
                rightKneeAngleDeg: this.currentProceduralRightKneeDeg,
                hipYOffset: this.currentProceduralHipYOffset
            };
        }

        return frames[0];
    }

    public static getProceduralUpperBodyPose(armAngleRad: number): KeyframePose {
        const dummyBowler = new Bowler(0);
        return dummyBowler.getProceduralUpperBodyPose(armAngleRad);
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

    public applyUpperBodyPoseOnly(pose: KeyframePose): void {
        const deg2rad = Math.PI / 180;
        
        // 1. Spine (Spine angle and upper body orientation, anchored at currentHipPosition)
        const spineAng = pose.spineAngleDeg * deg2rad;
        this.shoulderMid = {
            x: this.currentHipPosition.x + Math.cos(spineAng) * this.NECK_TO_HIP_LENGTH,
            y: this.currentHipPosition.y + Math.sin(spineAng) * this.NECK_TO_HIP_LENGTH
        };
        this.headCenter = {
            x: this.shoulderMid.x + Math.cos(spineAng) * 20,
            y: this.shoulderMid.y + Math.sin(spineAng) * 20
        };

        // 2. Shoulders (Distance and Line Angle)
        const shoulderLineAng = spineAng + pose.shoulderJointAngleDeg * deg2rad;
        this.frontShoulder = {
            x: this.shoulderMid.x - Math.cos(shoulderLineAng) * (pose.shoulderJointDist / 2),
            y: this.shoulderMid.y - Math.sin(shoulderLineAng) * (pose.shoulderJointDist / 2)
        };
        this.backShoulder = {
            x: this.shoulderMid.x + Math.cos(shoulderLineAng) * (pose.shoulderJointDist / 2),
            y: this.shoulderMid.y + Math.sin(shoulderLineAng) * (pose.shoulderJointDist / 2)
        };

        // 3. Non-Bowling Arm (Right Arm)
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

    public overrideLeftArmAngle(targetAngleRad: number): void {
        const totalArmLength = this.FRONT_UPPER_ARM + this.FRONT_LOWER_ARM;
        this.overrideLeftArmWithIK(targetAngleRad, totalArmLength);
    }

    public overrideLeftArmWithIK(targetAngleRad: number, dist: number): void {
        const l1 = this.FRONT_UPPER_ARM;
        const l2 = this.FRONT_LOWER_ARM;
        const maxReach = l1 + l2;
        const minReach = Math.abs(l1 - l2) + 2;

        const clampedDist = Math.max(minReach, Math.min(maxReach - 0.5, dist));

        let cosElbow = (l1 * l1 + clampedDist * clampedDist - l2 * l2) / (2 * l1 * clampedDist);
        cosElbow = Math.max(-1, Math.min(1, cosElbow));
        const elbowOffsetAngle = Math.acos(cosElbow);

        const elbowAngle = targetAngleRad - elbowOffsetAngle;
        this.leftElbow = {
            x: this.frontShoulder.x + Math.cos(elbowAngle) * l1,
            y: this.frontShoulder.y + Math.sin(elbowAngle) * l1
        };
        this.leftWrist = {
            x: this.frontShoulder.x + Math.cos(targetAngleRad) * clampedDist,
            y: this.frontShoulder.y + Math.sin(targetAngleRad) * clampedDist
        };
    }

    // Dynamic distance one full cycle of 2 steps covers, calculated from bowler leg length
    public get runCycleDistance(): number {
        return this.FULL_LEG_LENGTH * 3.1;
    }

    public updateRunPose(dt: number): void {
        // A. Executing Jump Animation (420-Frame Expanded Ultra-Smooth Playback)
        if (this.isExecutingJump) {
            // Slow, graceful jump playback duration using jumpAnimationDuration
            this.jumpPhase += dt * (1.0 / Math.max(0.1, this.jumpAnimationDuration));
            if (this.jumpPhase >= 1.0) {
                this.jumpPhase = 1.0;
                this.isExecutingJump = false;
                this.isPreJumpFrozen = true;
            }

            const jumpFrames = Bowler.getExpandedJumpFrames();
            const totalJumpFrames = jumpFrames.length;
            const frameFloat = Math.min(totalJumpFrames - 1, this.jumpPhase * (totalJumpFrames - 1));
            
            const idx1 = Math.floor(frameFloat);
            const idx2 = Math.min(totalJumpFrames - 1, idx1 + 1);
            const t = frameFloat - idx1;

            const pose1 = jumpFrames[idx1];
            const pose2 = jumpFrames[idx2];

            // Smooth lerp between pre-computed Catmull-Rom dense sub-frames
            const interpolatedJumpPose = Bowler.interpolatePose(pose1, pose2, t);

            // Forward ground velocity during jump using jumpForwardSpeed
            if (this.isExecutingJump) {
                this.currentHipPosition.x -= this.jumpForwardSpeed * dt;
            }

            this.lastPoseSnapshot = interpolatedJumpPose;
            this.applyKeyframePose(interpolatedJumpPose, this.currentHipPosition.x);
            return;
        }

        // B. Frozen State after Jump Complete
        if (this.isPreJumpFrozen) {
            const jumpFrames = Bowler.getExpandedJumpFrames();
            const lastFrame = jumpFrames[jumpFrames.length - 1] || Bowler.STATIC_FRAMES[419];
            this.applyKeyframePose(lastFrame, this.currentHipPosition.x);
            return;
        }

        // 1. Dynamic Stride Frequency (Animation frame execution speed)
        const minFrequency = 0.45;
        const maxFrequency = 2.00;
        this.strideFrequency = minFrequency + (maxFrequency - minFrequency) * Math.pow(this.runIntensity, 1.1);

        // 2. Advance stride phase (0 to 1)
        this.stridePhase = (this.stridePhase + this.strideFrequency * dt) % 1.0;

        // 3. Forward speed locked directly to leg-length stride distance and frame execution rate
        const pushImpulse = 0.85 + 0.35 * Math.abs(Math.sin(this.stridePhase * Math.PI * 2));
        const rawSpeed = this.runCycleDistance * this.strideFrequency * pushImpulse;
        const MAX_RUN_SPEED = 1200; // Constant top speed limit in px/sec
        let horizontalSpeed = Math.min(rawSpeed, MAX_RUN_SPEED);

        // C. Pre-Jump Transition State (Dynamic Adaptive Blend within max 40px)
        if (this.isPreJumpTransitioning) {
            // Speed dip during gathering deceleration
            horizontalSpeed *= 0.65;
            this.currentHipPosition.x -= horizontalSpeed * dt;

            const distTraveled = Math.abs(this.preJumpStartX - this.currentHipPosition.x);
            const alpha = Math.min(1.0, distTraveled / Math.max(1, this.preJumpTargetDistance));
            
            // Ease-Out Quad curve for athletic spring-loaded takeoff
            const easedAlpha = 1 - Math.pow(1 - alpha, 2);

            const startPose = this.preJumpStartPose || Bowler.STATIC_FRAMES[0];
            const jumpFrames = Bowler.getExpandedJumpFrames();
            const targetPose = jumpFrames[0] || Bowler.STATIC_FRAMES[0];

            // Interpolate current running pose -> Frame 1 of Jump
            const blendedPose = Bowler.interpolatePose(startPose, targetPose, easedAlpha);
            
            // Add subtle gravity dip during gathering stance
            const gatheringDip = Math.sin(alpha * Math.PI) * 4.0;
            blendedPose.hipYOffset += gatheringDip;

            this.lastPoseSnapshot = blendedPose;
            this.applyKeyframePose(blendedPose, this.currentHipPosition.x);

            // Completion check -> Automatically launch into 420-Frame Jump Animation!
            if (alpha >= 1.0) {
                this.isPreJumpTransitioning = false;
                this.isExecutingJump = true;
                this.jumpPhase = 0;
            }
            return;
        }

        // C. Normal Runup Motion
        this.currentHipPosition.x -= horizontalSpeed * dt;

        // Reset when off screen
        if (this.currentHipPosition.x < 100) {
            this.currentHipPosition.x = 1100;
            this.stridePhase = 0;
        }

        // Catmull-Rom Keyframe Interpolation across 4 points
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

        // Vertical Gravity Bounce Arc
        const gravityBounce = Math.sin(this.stridePhase * Math.PI * 2) * 6.0;
        interpolatedPose.hipYOffset += gravityBounce;

        this.lastPoseSnapshot = interpolatedPose;
        this.applyKeyframePose(interpolatedPose, this.currentHipPosition.x);
    }

    // ─────────────────────────────────────────────────────────────────────────
    public setInitialRunPose(): void {
        this.applyKeyframePose(Bowler.STATIC_FRAMES[0], this.currentHipPosition.x);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  DRAW DEBUG SKELETON
    // ─────────────────────────────────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────────────────
    //  DRAW DEBUG SKELETON (Brett Lee Motion Tracking Overlay Style)
    // ─────────────────────────────────────────────────────────────────────────
    public drawMuscularLeg(
        ctx: CanvasRenderingContext2D,
        hip: Vec2,
        knee: Vec2,
        ankle: Vec2,
        color: string = "#2563eb"
    ): void {
        // --- VECTOR MATH FOR CONTOURS ---
        const tDx = knee.x - hip.x;
        const tDy = knee.y - hip.y;
        const tLen = Math.hypot(tDx, tDy) || 1;
        const tUx = tDx / tLen;
        const tUy = tDy / tLen;
        const tNx = -tUy;
        const tNy = tUx;

        const sDx = ankle.x - knee.x;
        const sDy = ankle.y - knee.y;
        const sLen = Math.hypot(sDx, sDy) || 1;
        const sUx = sDx / sLen;
        const sUy = sDy / sLen;
        const sNx = -sUy;
        const sNy = sUx;

        // --- TAPERED MUSCULAR THIGH & CALF DIMENSIONS ---
        const hipRadius = 17.0;       // Upper thigh near hip
        const quadBulgeRadius = 15.0; // Quad muscle bulge
        const kneeRadius = 9.5;       // Knee joint

        const midThighX = hip.x + tUx * (tLen * 0.5);
        const midThighY = hip.y + tUy * (tLen * 0.5);

        const calfBulgeRadius = 12.0; // Muscular calf bulge
        const ankleRadius = 7.0;

        const midShinX = knee.x + sUx * (sLen * 0.4);
        const midShinY = knee.y + sUy * (sLen * 0.4);

        ctx.save();

        const upOffset = 14;
        const hipUpX = hip.x - tUx * upOffset;
        const hipUpY = hip.y - tUy * upOffset;

        // 1. Muscular Thigh Base & Polygon
        const thighGrad = ctx.createLinearGradient(hipUpX, hipUpY, knee.x, knee.y);
        thighGrad.addColorStop(0, color);
        thighGrad.addColorStop(0.5, "#3b82f6");
        thighGrad.addColorStop(1, "#1d4ed8");

        ctx.beginPath();
        ctx.arc(hipUpX, hipUpY, hipRadius, 0, 2 * Math.PI);
        ctx.fillStyle = thighGrad;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(hipUpX + tNx * hipRadius, hipUpY + tNy * hipRadius);
        ctx.lineTo(midThighX + tNx * quadBulgeRadius, midThighY + tNy * quadBulgeRadius);
        ctx.lineTo(knee.x + tNx * kneeRadius, knee.y + tNy * kneeRadius);
        ctx.lineTo(knee.x - tNx * kneeRadius, knee.y - tNy * kneeRadius);
        ctx.lineTo(midThighX - tNx * quadBulgeRadius, midThighY - tNy * quadBulgeRadius);
        ctx.lineTo(hipUpX - tNx * hipRadius, hipUpY - tNy * hipRadius);
        ctx.closePath();

        ctx.fillStyle = thighGrad;
        ctx.fill();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 2. Muscular Calf / Shin Polygon
        ctx.beginPath();
        ctx.moveTo(knee.x + sNx * kneeRadius, knee.y + sNy * kneeRadius);
        ctx.lineTo(midShinX + sNx * calfBulgeRadius, midShinY + sNy * calfBulgeRadius);
        ctx.lineTo(ankle.x + sNx * ankleRadius, ankle.y + sNy * ankleRadius);
        ctx.lineTo(ankle.x - sNx * ankleRadius, ankle.y - sNy * ankleRadius);
        ctx.lineTo(midShinX - sNx * calfBulgeRadius, midShinY - sNy * calfBulgeRadius);
        ctx.lineTo(knee.x - sNx * kneeRadius, knee.y - sNy * kneeRadius);
        ctx.closePath();

        const shinGrad = ctx.createLinearGradient(knee.x, knee.y, ankle.x, ankle.y);
        shinGrad.addColorStop(0, "#1d4ed8");
        shinGrad.addColorStop(1, "#1e3a8a");
        ctx.fillStyle = shinGrad;
        ctx.fill();

        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 3. Smooth Circular Knee Cap Joint (Batsman Style)
        ctx.beginPath();
        ctx.arc(knee.x, knee.y, kneeRadius + 1.0, 0, 2 * Math.PI);
        ctx.fillStyle = "#1d4ed8";
        ctx.fill();
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 4. Athletic Running Shoes at 90° to Shin (Bigger Proportional Shoes)
        const shoeAngle = Math.atan2(sNy, sNx);
        const shoeCenterX = ankle.x - sUx * 2 + sNx * 10;
        const shoeCenterY = ankle.y - sUy * 2 + sNy * 10;

        // Shoe Sole Base (Dark Rubber Spikes)
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.ellipse(shoeCenterX, shoeCenterY + 3, 19.0, 6.5, shoeAngle, 0, 2 * Math.PI);
        ctx.fill();

        // White Athletic Running Shoe Upper Body
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.ellipse(shoeCenterX, shoeCenterY, 18.0, 8.5, shoeAngle, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = "#0284c7";
        ctx.lineWidth = 2.0;
        ctx.stroke();

        // Cyan Accent Stripe / Brand Logo
        ctx.fillStyle = "#00e5ff";
        ctx.beginPath();
        ctx.ellipse(shoeCenterX + sNx * 3, shoeCenterY + sNy * 3, 7.5, 3.5, shoeAngle, 0, 2 * Math.PI);
        ctx.fill();

        // Shoe Toe Cap Detail
        ctx.fillStyle = "#e2e8f0";
        ctx.beginPath();
        ctx.arc(shoeCenterX + sNx * 12, shoeCenterY + sNy * 12, 4.5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.restore();
    }

    public drawDebugSkeleton(ctx: CanvasRenderingContext2D): void {
        ctx.save();

        // ── Draw Muscular 3D Legs & Trousers Anatomy ────────────────────────
        this.drawMuscularLeg(ctx, this.currentRightHipPosition, this.rightKnee, this.rightAnkle, "#1d4ed8");
        this.drawMuscularLeg(ctx, this.currentLeftHipPosition, this.leftKnee, this.leftAnkle, "#2563eb");

        // ── Thick White Bone lines ───────────────────────────────────────────
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth   = 4.5;
        ctx.lineCap     = "round";
        ctx.lineJoin    = "round";

        const line = (a: Vec2, b: Vec2) => {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        };

        // Spine (Neck to Hips)
        line(this.headCenter, this.shoulderMid);
        line(this.shoulderMid, this.currentHipPosition);
        // Shoulder bar
        line(this.frontShoulder, this.backShoulder);
        // Pelvis bar
        line(this.currentLeftHipPosition, this.currentRightHipPosition);
        
        // Legs
        line(this.currentLeftHipPosition, this.leftKnee);
        line(this.leftKnee, this.leftAnkle);
        line(this.currentRightHipPosition, this.rightKnee);
        line(this.rightKnee, this.rightAnkle);

        // Arms
        line(this.frontShoulder, this.leftElbow);
        line(this.leftElbow, this.leftWrist);
        line(this.backShoulder, this.rightElbow);
        line(this.rightElbow, this.rightWrist);

        // ── Bright Cyan Joint Dots (Brett Lee Tracking Nodes) ────────────────
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
        
        // Draw Cyan Joint Circles with subtle white border
        for (const j of joints) {
            ctx.fillStyle = "#00e5ff"; // Bright Cyan
            ctx.beginPath();
            ctx.arc(j.x, j.y, 5.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(j.x, j.y, 5.5, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }

    public drawStaticPose(ctx: CanvasRenderingContext2D, frameIndex: number, worldX: number, customGroundY?: number, customFrames?: KeyframePose[]): void {
        const frames = customFrames || Bowler.STATIC_FRAMES;
        const pose = frames[frameIndex];
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

        // Draw Muscular 3D Legs & Trousers Anatomy
        this.drawMuscularLeg(ctx, rHip, rKnee, rAnkle, "#1d4ed8");
        this.drawMuscularLeg(ctx, lHip, lKnee, lAnkle, "#2563eb");

        // Draw Skeleton Line Structure
        ctx.save();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 4.0;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        const line = (a: Vec2, b: Vec2) => {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        };

        // Head/Neck & Spine
        line(head, spineEnd);
        line(spineEnd, hipCenter);
        // Shoulders & Pelvis bars
        line(lShoulder, rShoulder);
        line(lHip, rHip);
        // Legs
        line(lHip, lKnee); line(lKnee, lAnkle);
        line(rHip, rKnee); line(rKnee, rAnkle);
        // Arms
        line(lShoulder, lElbow); line(lElbow, lWrist);
        line(rShoulder, rElbow); line(rElbow, rWrist);

        // Draw Brett Lee Style Cyan Joint Dots (#00e5ff)
        const joints: Vec2[] = [
            head,
            spineEnd,
            hipCenter,
            lShoulder, rShoulder,
            lHip, rHip,
            lKnee, rKnee,
            lAnkle, rAnkle,
            lElbow, rElbow,
            lWrist, rWrist
        ];

        for (const j of joints) {
            ctx.fillStyle = "#00e5ff"; // Bright Cyan
            ctx.beginPath();
            ctx.arc(j.x, j.y, 5.0, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(j.x, j.y, 5.0, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Frame label
        ctx.fillStyle = "#ffffff";
        ctx.font = "16px monospace";
        ctx.fillText(`Frame ${frameIndex + 1}`, worldX - 30, groundY + 20);

        ctx.restore();
    }
}