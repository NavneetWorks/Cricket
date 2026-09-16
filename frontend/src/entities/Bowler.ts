import { CANVAS_WIDTH, CANVAS_HEIGHT, GROUND_HEIGHT, PLAYER_LENGTH_FACTOR, BOWLER_START_X , BOWLER_WICKET_X 
} from "../game/constants";

// ── 🚀 DECELERATION RELEASE ENGINE CONSTANTS ─────────────────────────────
// 1. Minimum angular speed (in rad/sec) required to register an active swing. Default: 5.0 rad/sec (~286 deg/sec)
export const DECEL_MIN_SWING_SPEED: number = 5.0;
export const DECEL_DROP_RATIO: number = 0.5;

// ── ⏱️ FRAME RANGE RELEASE WINDOW CONSTANTS ─────────────────────────────
// Minimum allowed release frame in 71 total jump frame scale (Default: 63.0)
export const JUMP_RELEASE_FRAME_MIN: number = 680.0;

// Maximum allowed release frame in 71 total jump frame scale (Default: 66.0)
export const JUMP_RELEASE_FRAME_MAX: number = 720.0;

export interface Vec2 {
    x: number;  
    y: number;    
}

 export interface BowlerJoystickSnapshot {
    tick: number;
    screenX: number;
     screenY: number;   
       receivedTime: number;
 }

export interface KeyframePose {  
    // 4. Spine
    spineAngleDeg: number;         // Absolute angle wrt positive X axis. (e.g. -90 = straight up, -110 = leaning left)
    
    // 1. Shoulders
    shoulderJointDist: number;     // Distance between left and right shoulder
    shoulderJointAngleDeg: number; // Angle relative to spine clockwise. (90 = perpendicular)
    
    // 2. Arms
    leftUpperArmAngleDeg: number;  // Angle relative to shoulder line clockwise
    globalLeftUpperArmAngleDeg?: number; // Precomputed absolute global angle
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

    // Ground Step Forward Displacement (0px to 200px)
    forwardDisplacement?: number;

    // Normalized Stride Displacement Ratio (0.0 to 1.0)
    normalizedDisplacementRatio?: number;

    // Displacement ratio from pre-jump start position (0.0 to 1.0)
    displacementFromPreJumpX?: number;
    displacementX?: number;
}

export interface RangeNode {
    lowerFrameIndex: number;
    lowerAngleDeg: number;
    upperFrameIndex: number;
    upperAngleDeg: number;
    next: RangeNode | null;
}

export interface BowlerJoystickSnapshot {
    tick: number;
    screenX: number;
    screenY: number;
    receivedTime: number;
}

export class BowlerJoystickQueue {
    private buffer: (BowlerJoystickSnapshot | null)[];
    private front: number = 0; // Read / Dequeue Pointer
    private rear: number = 0;  // Write / Enqueue Pointer
    private count: number = 0;
    private readonly capacity: number;

    constructor(capacity: number = 16) {
        this.capacity = capacity;
        this.buffer = new Array(capacity).fill(null);
    }

    // 📥 Enqueue (Write incoming UDP packet)
    public enqueue(item: BowlerJoystickSnapshot): void {
        this.buffer[this.rear] = item;
        this.rear = (this.rear + 1) % this.capacity;

        if (this.count < this.capacity) {
            this.count++;
        } else {
            // Buffer full! Oldest snapshot overwrite hua -> advance front
            this.front = (this.front + 1) % this.capacity;
        }
    }

    // 📤 Dequeue (Read 60Hz tick packet)
    public dequeue(): BowlerJoystickSnapshot | null {
        if (this.count === 0) return null; // Queue khali hai (Underrun)

        const item = this.buffer[this.front];
        this.buffer[this.front] = null; // Clear slot
        this.front = (this.front + 1) % this.capacity;
        this.count--;

        return item;
    }

    // 🔍 Peek Front Item (Bina Dequeue kiye dekhna)
    public peek(): BowlerJoystickSnapshot | null {
        if (this.count === 0) return null;
        return this.buffer[this.front];
    }

    public isEmpty(): boolean {
        return this.count === 0;
    }

    public size(): number {
        return this.count;
    }

    // 🧹 Reset / Clear Queue
    public clear(): void {
        this.front = 0;
        this.rear = 0;
        this.count = 0;
        this.buffer.fill(null);
    }
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
    public visualHistory: any[] = [];
    // ── Segment lengths ────────────────────────────────────────────────────
    private readonly BOWLER_SCALE = 1.1;       
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

    public hasGatherExecuted: boolean = false;
    
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

    public maxObservedOmegaRad: number = 0.0;
    public prevLeftWristY: number = 0.0;
    public postReleaseDelaySec: number = 0.0;
    public lastReceivedJoystickTick: number = -1;
    public targetNetworkJoystickAngleRad: number | null = null;
    public targetNetworkJoystickRadiusRatio: number = 1.0;
    public debugReconciliationPoint: Vec2 | null = null;
    public localReleaseTrailIndex: number = 0;
    public lastReceivedPacketTime: number = 0;
    public playheadDelayMs: number = 30;
    public isExtrapolating: boolean = false;
    public releaseDelayTimer: number = 0;
    public pendingVisualThrow: { releaseX: number; releaseY: number; vReleaseX: number; vReleaseY: number } | null = null;

    public startRunning(): void {     
        this.isRunning = true;
        this.isPreJumpTransitioning = false;   
        this.isPreJumpFrozen = false;
        this.isExecutingJump = false;
        this.jumpPhase = 0;
        this.hasReleasedBall = false;
        this.targetIntensity = 1.0;
        this.maxObservedOmegaRad = 0.0;
        this.postReleaseDelaySec = 0.0;
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
        this.hasGatherExecuted = false;
        this.targetIntensity = 0.0;
        this.runIntensity = 0.0;
        this.maxObservedOmegaRad = 0.0;
        this.postReleaseDelaySec = 0.0;
        this.resetProceduralUpperBodyState();
        if (this.currentHipPosition.x < 2000) {
            this.currentHipPosition.x = BOWLER_START_X; // Far right starting position for runup
        }
        this.startJumpX = BOWLER_WICKET_X;
        this.gatheringStartX = null;
        this.gatheringTargetX = null;
        this.isGatheringArmActive = false;
        this.gatheringAngleTraveledDeg = 0.0;
        this.ballTrailPoints = [];
        this.authoritativeHitTrailIndex = -1;
        this.isBallReleased = false;
        this.releaseDelayTimer = 0;
        this.pendingVisualThrow = null;
        this.lastReleaseVx = null;
        this.lastReleaseVy = null;
        this.lastReleaseVBodyX = null;
        this.lastReleaseVArmX = null;
        this.lastReleaseSpeed = null;
        this.lastReleaseAngleDeg = null;

        // ⏱️ Netcode One-Way Lag (RTT / 2) Frame Countdown & Queue Reset
        this.pendingRunupDelaySec = 0.0;
        this.pendingGatherDelaySec = 0.0;
        this.pendingGatherClickX = null;
        this.joystickQueue.clear();

        this.setInitialRunPose();
    }

    public readonly DEFAULT_START_JUMP_X: number = 750.0;
    public readonly POST_RELEASE_DELAY_SEC: number = 0.10;
    public isCycleCompleted: boolean = false;
    public startJumpX: number = 750.0;
    public gatheringStartX: number | null = null;
    public gatheringTargetX: number | null = null;
    public isGatheringArmActive: boolean = false;
    public ballTrailPoints: Vec2[] = [];
    public authoritativeHitTrailIndex: number = -1;
    public localHitTrailIndex: number = -1;
    public isBallReleased: boolean = false;
    public debugReleasePoint: Vec2 | null = null;
    public gatheringAngleTraveledDeg: number = 0.0;
    public lastReleaseVx: number | null = null;
    public lastReleaseVy: number | null = null;
    public lastReleaseVBodyX: number | null = null;
    public lastReleaseVArmX: number | null = null;
    public lastReleaseSpeed: number | null = null;
    public lastReleaseAngleDeg: number | null = null;
    public runupGatheringEndSpeedFactor: number = 0.5; // 0.5 = 50% end momentum at jump takeoff
    public totalJumpStrideDistance: number = 400.0;
    public totalJumpDurationSec: number = 1.2;
    public elapsedJumpTime: number = 0.0;
    public initialStaticOffsetDeg: number = 0.0;
    public accumulatedJoystickAngleDeg: number = 0.0;
    public dynamicOffsetDeg: number = 0.0;
    public offsetVelocityDeg: number = 0.0;
    public lastArmAngleRad: number | null = null;
    public lastJoystickAngleRad: number | null = null;
    public lastJoystickVelDeg: number = 0.0;
    public lastRunupSpeedX: number = 800.0;
    public initialRunupSpeedX: number = 800.0;
    public accumulatedDisplacementX: number = 0.0;
    public lastInterpolatedDisplacementX: number = -20.0;
    public momentumTransferFactor: number = 0.5; // 50% momentum transfer factor from runup
    public smoothJoystickAngleRad: number = Math.PI;
    public joystickAngularVelRad: number = 0.0;
    public smoothJoystickRadiusRatio: number = 1.0;
    public joystickRadiusVelRatio: number = 0.0;

    // 🎛️ Dedicated Tuning Constants (Angle & Radius Resistance for Jump & Gathering phases)
    public JOYSTICK_ANGLE_STIFFNESS: number = 1000.0;
    public JOYSTICK_ANGLE_DAMPING: number = 100.0;
    public JOYSTICK_RADIUS_STIFFNESS: number = 100.0;
    public JOYSTICK_RADIUS_DAMPING: number = 100.0;

    public GATHERING_ANGLE_STIFFNESS: number = 1000.0;
    public GATHERING_ANGLE_DAMPING: number = 100.0;
    public GATHERING_RADIUS_STIFFNESS: number = 100.0;
    public GATHERING_RADIUS_DAMPING: number = 100.0;  

    public joystickQueue: BowlerJoystickQueue = new BowlerJoystickQueue(16);

    // ⏱️ Netcode One-Way Lag (RTT / 2) Frame-Based Delay Attributes
    public pendingRunupDelaySec: number = 0.0;      // Space key runup countdown (in seconds)
    public pendingGatherDelaySec: number = 0.0;     // Left-click gather countdown (in seconds)
    public pendingGatherClickX: number | null = null; // Stored target clickX for delayed gather


    public resetProceduralUpperBodyState(): void {  
        this.currentProceduralNBArmAngleDeg = 48.0;
        this.currentProceduralNBElbowAngleDeg = 75.0;
        this.currentProceduralSpineAngleDeg = -130.0;
        this.currentProceduralShoulderAngleDeg = 100.0;  
        this.currentProceduralShoulderDist = 15.0;
        this.unwrappedArmAngleDeg = 180.0;
        this.lastArmAngleRad = null;
        this.isCycleCompleted = false;
        this.elapsedJumpTime = 0.0;
        this.initialStaticOffsetDeg = 0.0;
        this.accumulatedJoystickAngleDeg = 0.0;
        this.currentProceduralJumpXOffset = 0.0;
        this.dynamicOffsetDeg = 0.0;
        this.offsetVelocityDeg = 0.0;
        this.lastJoystickAngleRad = null;
        this.lastJoystickVelDeg = 0.0;
        this.lastRunupSpeedX = 800.0;
        this.initialRunupSpeedX = 800.0;
        this.accumulatedDisplacementX = 0.0;
        this.lastInterpolatedDisplacementX = -20.0;
        this.smoothJoystickAngleRad = Math.PI;
        this.joystickAngularVelRad = 0.0;
        this.smoothJoystickRadiusRatio = 1.0;
        this.joystickRadiusVelRatio = 0.0;
        this.startJumpX = 750.0;
        this.isGatheringArmActive = false;
        this.gatheringAngleTraveledDeg = 0.0;
        this.ballTrailPoints = [];
        this.isBallReleased = false;
        this.lastReleaseVx = null;
        this.lastReleaseVy = null;
        this.lastReleaseVBodyX = null;
        this.lastReleaseVArmX = null;
        this.lastReleaseSpeed = null;
        this.lastReleaseAngleDeg = null;
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
            leftUpperArmAngleDeg: 60.02,
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
            // EXPANDED FRAME 0
            spineAngleDeg: -115.60,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 90.00,
            leftUpperArmAngleDeg: 110.00,
            leftElbowAngleDeg: 105.00,
            rightUpperArmAngleDeg: 40.60,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 150.00,
            rightThighAngleDeg: 74.52,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: 0.00,
            globalLeftUpperArmAngleDeg: 84
        },
        {
            // EXPANDED FRAME 1
            spineAngleDeg: -114.60,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 89.34,
            leftUpperArmAngleDeg: 110.66,
            leftElbowAngleDeg: 105.92,
            rightUpperArmAngleDeg: 41.18,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 149.34,
            rightThighAngleDeg: 73.93,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: -1.97,
            globalLeftUpperArmAngleDeg: 85
        },
        {
            // EXPANDED FRAME 2
            spineAngleDeg: -113.60,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 88.68,
            leftUpperArmAngleDeg: 111.32,
            leftElbowAngleDeg: 106.84,
            rightUpperArmAngleDeg: 41.76,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 148.68,
            rightThighAngleDeg: 73.33,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: -3.95,
            globalLeftUpperArmAngleDeg: 86
        },
        {
            // EXPANDED FRAME 3
            spineAngleDeg: -112.60,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 88.03,
            leftUpperArmAngleDeg: 111.97,
            leftElbowAngleDeg: 107.76,
            rightUpperArmAngleDeg: 42.34,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 148.03,
            rightThighAngleDeg: 72.74,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: -5.92,
            globalLeftUpperArmAngleDeg: 87
        },
        {
            // EXPANDED FRAME 4
            spineAngleDeg: -111.60,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 87.37,
            leftUpperArmAngleDeg: 112.63,
            leftElbowAngleDeg: 108.68,
            rightUpperArmAngleDeg: 42.92,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 147.37,
            rightThighAngleDeg: 72.14,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: -7.89,
            globalLeftUpperArmAngleDeg: 88
        },
        {
            // EXPANDED FRAME 5
            spineAngleDeg: -110.60,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 86.71,
            leftUpperArmAngleDeg: 113.29,
            leftElbowAngleDeg: 109.61,
            rightUpperArmAngleDeg: 43.49,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 146.71,
            rightThighAngleDeg: 71.55,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: -9.87,
            globalLeftUpperArmAngleDeg: 89
        },
        {
            // EXPANDED FRAME 6
            spineAngleDeg: -109.60,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 86.05,
            leftUpperArmAngleDeg: 113.95,
            leftElbowAngleDeg: 110.53,
            rightUpperArmAngleDeg: 44.07,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 146.05,
            rightThighAngleDeg: 70.95,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: -11.84,
            globalLeftUpperArmAngleDeg: 90
        },
        {
            // EXPANDED FRAME 7
            spineAngleDeg: -108.60,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 85.39,
            leftUpperArmAngleDeg: 114.61,
            leftElbowAngleDeg: 111.45,
            rightUpperArmAngleDeg: 44.65,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 145.39,
            rightThighAngleDeg: 70.36,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: -13.82,
            globalLeftUpperArmAngleDeg: 91
        },
        {
            // EXPANDED FRAME 8
            spineAngleDeg: -107.00,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 84.50,
            leftUpperArmAngleDeg: 115.50,
            leftElbowAngleDeg: 112.80,
            rightUpperArmAngleDeg: 45.56,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 144.50,
            rightThighAngleDeg: 69.00,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: -15.72,
            globalLeftUpperArmAngleDeg: 92
        },
        {
            // EXPANDED FRAME 9
            spineAngleDeg: -106.00,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 84.00,
            leftUpperArmAngleDeg: 116.00,
            leftElbowAngleDeg: 113.60,
            rightUpperArmAngleDeg: 46.12,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 144.00,
            rightThighAngleDeg: 68.00,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: -16.44,
            globalLeftUpperArmAngleDeg: 93
        },
        {
            // EXPANDED FRAME 10
            spineAngleDeg: -106.00,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 84.00,
            leftUpperArmAngleDeg: 116.00,
            leftElbowAngleDeg: 113.60,
            rightUpperArmAngleDeg: 46.12,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 144.00,
            rightThighAngleDeg: 68.00,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: -16.44,
            globalLeftUpperArmAngleDeg: 94
        },
        {
            // EXPANDED FRAME 11
            spineAngleDeg: -105.00,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 83.50,
            leftUpperArmAngleDeg: 116.50,
            leftElbowAngleDeg: 114.40,
            rightUpperArmAngleDeg: 46.68,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 143.50,
            rightThighAngleDeg: 67.00,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: -17.16,
            globalLeftUpperArmAngleDeg: 95
        },
        {
            // EXPANDED FRAME 12
            spineAngleDeg: -104.00,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 83.00,
            leftUpperArmAngleDeg: 117.00,
            leftElbowAngleDeg: 115.20,
            rightUpperArmAngleDeg: 47.24,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 143.00,
            rightThighAngleDeg: 66.00,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: -17.88,
            globalLeftUpperArmAngleDeg: 96
        },
        {
            // EXPANDED FRAME 13
            spineAngleDeg: -103.00,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 82.50,
            leftUpperArmAngleDeg: 117.50,
            leftElbowAngleDeg: 116.00,
            rightUpperArmAngleDeg: 47.80,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 142.50,
            rightThighAngleDeg: 65.00,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: -18.60,
            globalLeftUpperArmAngleDeg: 97
        },
        {
            // EXPANDED FRAME 14
            spineAngleDeg: -102.00,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 82.00,
            leftUpperArmAngleDeg: 118.00,
            leftElbowAngleDeg: 116.80,
            rightUpperArmAngleDeg: 48.36,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 142.00,
            rightThighAngleDeg: 64.00,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: -19.32,
            globalLeftUpperArmAngleDeg: 98
        },
        {
            // EXPANDED FRAME 15
            spineAngleDeg: -101.00,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 81.50,
            leftUpperArmAngleDeg: 118.50,
            leftElbowAngleDeg: 117.60,
            rightUpperArmAngleDeg: 48.92,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 141.50,
            rightThighAngleDeg: 63.00,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: -20.04,
            globalLeftUpperArmAngleDeg: 99
        },
        {
            // EXPANDED FRAME 16
            spineAngleDeg: -100.00,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 81.00,
            leftUpperArmAngleDeg: 119.00,
            leftElbowAngleDeg: 118.40,
            rightUpperArmAngleDeg: 49.48,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 141.00,
            rightThighAngleDeg: 62.00,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: -20.76,
            globalLeftUpperArmAngleDeg: 100
        },
        {
            // EXPANDED FRAME 17
            spineAngleDeg: -99.00,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.50,
            leftUpperArmAngleDeg: 119.50,
            leftElbowAngleDeg: 119.20,
            rightUpperArmAngleDeg: 50.04,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 140.50,
            rightThighAngleDeg: 61.00,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: -21.48,
            globalLeftUpperArmAngleDeg: 101
        },
        {
            // EXPANDED FRAME 18
            spineAngleDeg: -98.00,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 120.00,
            leftElbowAngleDeg: 120.00,
            rightUpperArmAngleDeg: 50.60,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 60.00,
            leftKneeAngleDeg: -104.52,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: -22.20,
            globalLeftUpperArmAngleDeg: 102
        },
        {
            // EXPANDED FRAME 19
            spineAngleDeg: -97.88,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 120.88,
            leftElbowAngleDeg: 119.41,
            rightUpperArmAngleDeg: 50.72,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 109.41,
            leftThighAngleDeg: 140.59,
            rightThighAngleDeg: 60.29,
            leftKneeAngleDeg: -103.37,
            rightKneeAngleDeg: -29.59,
            hipYOffset: -17.20,
            displacementX: -22.61,
            globalLeftUpperArmAngleDeg: 103
        },
        {
            // EXPANDED FRAME 20
            spineAngleDeg: -97.76,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 121.76,
            leftElbowAngleDeg: 118.82,
            rightUpperArmAngleDeg: 50.84,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 108.82,
            leftThighAngleDeg: 141.18,
            rightThighAngleDeg: 60.59,
            leftKneeAngleDeg: -102.22,
            rightKneeAngleDeg: -29.18,
            hipYOffset: -17.20,
            displacementX: -23.02,
            globalLeftUpperArmAngleDeg: 104
        },
        {
            // EXPANDED FRAME 21
            spineAngleDeg: -97.65,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 122.65,
            leftElbowAngleDeg: 118.24,
            rightUpperArmAngleDeg: 50.95,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 108.24,
            leftThighAngleDeg: 141.76,
            rightThighAngleDeg: 60.88,
            leftKneeAngleDeg: -101.08,
            rightKneeAngleDeg: -28.76,
            hipYOffset: -17.20,
            displacementX: -23.44,
            globalLeftUpperArmAngleDeg: 105
        },
        {
            // EXPANDED FRAME 22
            spineAngleDeg: -97.53,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 123.53,
            leftElbowAngleDeg: 117.65,
            rightUpperArmAngleDeg: 51.07,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 107.65,
            leftThighAngleDeg: 142.35,
            rightThighAngleDeg: 61.18,
            leftKneeAngleDeg: -99.93,
            rightKneeAngleDeg: -28.35,
            hipYOffset: -17.20,
            displacementX: -23.85,
            globalLeftUpperArmAngleDeg: 106
        },
        {
            // EXPANDED FRAME 23
            spineAngleDeg: -97.41,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 124.41,
            leftElbowAngleDeg: 117.06,
            rightUpperArmAngleDeg: 51.19,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 107.06,
            leftThighAngleDeg: 142.94,
            rightThighAngleDeg: 61.47,
            leftKneeAngleDeg: -98.78,
            rightKneeAngleDeg: -27.94,
            hipYOffset: -17.20,
            displacementX: -24.26,
            globalLeftUpperArmAngleDeg: 107
        },
        {
            // EXPANDED FRAME 24
            spineAngleDeg: -97.29,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 125.29,
            leftElbowAngleDeg: 116.47,
            rightUpperArmAngleDeg: 51.31,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 106.47,
            leftThighAngleDeg: 143.53,
            rightThighAngleDeg: 61.76,
            leftKneeAngleDeg: -97.63,
            rightKneeAngleDeg: -27.53,
            hipYOffset: -17.20,
            displacementX: -24.67,
            globalLeftUpperArmAngleDeg: 108
        },
        {
            // EXPANDED FRAME 25
            spineAngleDeg: -97.18,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 126.18,
            leftElbowAngleDeg: 115.88,
            rightUpperArmAngleDeg: 51.42,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 105.88,
            leftThighAngleDeg: 144.12,
            rightThighAngleDeg: 62.06,
            leftKneeAngleDeg: -96.48,
            rightKneeAngleDeg: -27.12,
            hipYOffset: -17.20,
            displacementX: -25.08,
            globalLeftUpperArmAngleDeg: 109
        },
        {
            // EXPANDED FRAME 26
            spineAngleDeg: -97.06,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 127.06,
            leftElbowAngleDeg: 115.29,
            rightUpperArmAngleDeg: 51.54,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 105.29,
            leftThighAngleDeg: 144.71,
            rightThighAngleDeg: 62.35,
            leftKneeAngleDeg: -95.33,
            rightKneeAngleDeg: -26.71,
            hipYOffset: -17.20,
            displacementX: -25.49,
            globalLeftUpperArmAngleDeg: 110
        },
        {
            // EXPANDED FRAME 27
            spineAngleDeg: -96.94,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 127.94,
            leftElbowAngleDeg: 114.71,
            rightUpperArmAngleDeg: 51.66,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 104.71,
            leftThighAngleDeg: 145.29,
            rightThighAngleDeg: 62.65,
            leftKneeAngleDeg: -94.19,
            rightKneeAngleDeg: -26.29,
            hipYOffset: -17.20,
            displacementX: -25.91,
            globalLeftUpperArmAngleDeg: 111
        },
        {
            // EXPANDED FRAME 28
            spineAngleDeg: -96.82,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 128.82,
            leftElbowAngleDeg: 114.12,
            rightUpperArmAngleDeg: 51.78,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 104.12,
            leftThighAngleDeg: 145.88,
            rightThighAngleDeg: 62.94,
            leftKneeAngleDeg: -93.04,
            rightKneeAngleDeg: -25.88,
            hipYOffset: -17.20,
            displacementX: -26.32,
            globalLeftUpperArmAngleDeg: 112
        },
        {
            // EXPANDED FRAME 29
            spineAngleDeg: -96.71,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 129.71,
            leftElbowAngleDeg: 113.53,
            rightUpperArmAngleDeg: 51.89,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 103.53,
            leftThighAngleDeg: 146.47,
            rightThighAngleDeg: 63.24,
            leftKneeAngleDeg: -91.89,
            rightKneeAngleDeg: -25.47,
            hipYOffset: -17.20,
            displacementX: -26.73,
            globalLeftUpperArmAngleDeg: 113
        },
        {
            // EXPANDED FRAME 30
            spineAngleDeg: -96.59,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 130.59,
            leftElbowAngleDeg: 112.94,
            rightUpperArmAngleDeg: 52.01,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 102.94,
            leftThighAngleDeg: 147.06,
            rightThighAngleDeg: 63.53,
            leftKneeAngleDeg: -90.74,
            rightKneeAngleDeg: -25.06,
            hipYOffset: -17.20,
            displacementX: -27.14,
            globalLeftUpperArmAngleDeg: 114
        },
        {
            // EXPANDED FRAME 31
            spineAngleDeg: -96.47,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 131.47,
            leftElbowAngleDeg: 112.35,
            rightUpperArmAngleDeg: 52.13,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 102.35,
            leftThighAngleDeg: 147.65,
            rightThighAngleDeg: 63.82,
            leftKneeAngleDeg: -89.59,
            rightKneeAngleDeg: -24.65,
            hipYOffset: -17.20,
            displacementX: -27.55,
            globalLeftUpperArmAngleDeg: 115
        },
        {
            // EXPANDED FRAME 32
            spineAngleDeg: -96.35,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 132.35,
            leftElbowAngleDeg: 111.76,
            rightUpperArmAngleDeg: 52.25,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 101.76,
            leftThighAngleDeg: 148.24,
            rightThighAngleDeg: 64.12,
            leftKneeAngleDeg: -88.44,
            rightKneeAngleDeg: -24.24,
            hipYOffset: -17.20,
            displacementX: -27.96,
            globalLeftUpperArmAngleDeg: 116
        },
        {
            // EXPANDED FRAME 33
            spineAngleDeg: -96.24,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 133.24,
            leftElbowAngleDeg: 111.18,
            rightUpperArmAngleDeg: 52.36,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 101.18,
            leftThighAngleDeg: 148.82,
            rightThighAngleDeg: 64.41,
            leftKneeAngleDeg: -87.30,
            rightKneeAngleDeg: -23.82,
            hipYOffset: -17.20,
            displacementX: -28.38,
            globalLeftUpperArmAngleDeg: 117
        },
        {
            // EXPANDED FRAME 34
            spineAngleDeg: -96.12,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 134.12,
            leftElbowAngleDeg: 110.59,
            rightUpperArmAngleDeg: 52.48,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 100.59,
            leftThighAngleDeg: 149.41,
            rightThighAngleDeg: 64.71,
            leftKneeAngleDeg: -86.15,
            rightKneeAngleDeg: -23.41,
            hipYOffset: -17.20,
            displacementX: -28.79,
            globalLeftUpperArmAngleDeg: 118
        },
        {
            // EXPANDED FRAME 35
            spineAngleDeg: -96.00,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 135.00,
            leftElbowAngleDeg: 110.00,
            rightUpperArmAngleDeg: 52.60,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 150.00,
            rightThighAngleDeg: 65.00,
            leftKneeAngleDeg: -85.00,
            rightKneeAngleDeg: -23.00,
            hipYOffset: -17.20,
            displacementX: -29.20,
            globalLeftUpperArmAngleDeg: 119
        },
        {
            // EXPANDED FRAME 36
            spineAngleDeg: -95.78,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 135.78,
            leftElbowAngleDeg: 109.44,
            rightUpperArmAngleDeg: 52.60,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 98.89,
            leftThighAngleDeg: 150.56,
            rightThighAngleDeg: 65.33,
            leftKneeAngleDeg: -84.44,
            rightKneeAngleDeg: -22.78,
            hipYOffset: -17.20,
            displacementX: -29.94,
            globalLeftUpperArmAngleDeg: 120
        },
        {
            // EXPANDED FRAME 37
            spineAngleDeg: -95.56,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 136.56,
            leftElbowAngleDeg: 108.89,
            rightUpperArmAngleDeg: 52.60,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 97.78,
            leftThighAngleDeg: 151.11,
            rightThighAngleDeg: 65.67,
            leftKneeAngleDeg: -83.89,
            rightKneeAngleDeg: -22.56,
            hipYOffset: -17.20,
            displacementX: -30.69,
            globalLeftUpperArmAngleDeg: 121
        },
        {
            // EXPANDED FRAME 38
            spineAngleDeg: -95.33,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 137.33,
            leftElbowAngleDeg: 108.33,
            rightUpperArmAngleDeg: 52.60,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 96.67,
            leftThighAngleDeg: 151.67,
            rightThighAngleDeg: 66.00,
            leftKneeAngleDeg: -83.33,
            rightKneeAngleDeg: -22.33,
            hipYOffset: -17.20,
            displacementX: -31.43,
            globalLeftUpperArmAngleDeg: 122
        },
        {
            // EXPANDED FRAME 39
            spineAngleDeg: -95.11,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 138.11,
            leftElbowAngleDeg: 107.78,
            rightUpperArmAngleDeg: 52.60,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 95.56,
            leftThighAngleDeg: 152.22,
            rightThighAngleDeg: 66.33,
            leftKneeAngleDeg: -82.78,
            rightKneeAngleDeg: -22.11,
            hipYOffset: -17.20,
            displacementX: -32.18,
            globalLeftUpperArmAngleDeg: 123
        },
        {
            // EXPANDED FRAME 40
            spineAngleDeg: -94.89,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 138.89,
            leftElbowAngleDeg: 107.22,
            rightUpperArmAngleDeg: 52.60,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 94.44,
            leftThighAngleDeg: 152.78,
            rightThighAngleDeg: 66.67,
            leftKneeAngleDeg: -82.22,
            rightKneeAngleDeg: -21.89,
            hipYOffset: -17.20,
            displacementX: -32.92,
            globalLeftUpperArmAngleDeg: 124
        },
        {
            // EXPANDED FRAME 41
            spineAngleDeg: -94.67,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 139.67,
            leftElbowAngleDeg: 106.67,
            rightUpperArmAngleDeg: 52.60,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 93.33,
            leftThighAngleDeg: 153.33,
            rightThighAngleDeg: 67.00,
            leftKneeAngleDeg: -81.67,
            rightKneeAngleDeg: -21.67,
            hipYOffset: -17.20,
            displacementX: -33.67,
            globalLeftUpperArmAngleDeg: 125
        },
        {
            // EXPANDED FRAME 42
            spineAngleDeg: -94.44,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 140.44,
            leftElbowAngleDeg: 106.11,
            rightUpperArmAngleDeg: 52.60,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 92.22,
            leftThighAngleDeg: 153.89,
            rightThighAngleDeg: 67.33,
            leftKneeAngleDeg: -81.11,
            rightKneeAngleDeg: -21.44,
            hipYOffset: -17.20,
            displacementX: -34.41,
            globalLeftUpperArmAngleDeg: 126
        },
        {
            // EXPANDED FRAME 43
            spineAngleDeg: -94.22,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 141.22,
            leftElbowAngleDeg: 105.56,
            rightUpperArmAngleDeg: 52.60,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 91.11,
            leftThighAngleDeg: 154.44,
            rightThighAngleDeg: 67.67,
            leftKneeAngleDeg: -80.56,
            rightKneeAngleDeg: -21.22,
            hipYOffset: -17.20,
            displacementX: -35.16,
            globalLeftUpperArmAngleDeg: 127
        },
        {
            // EXPANDED FRAME 44
            spineAngleDeg: -94.00,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 142.00,
            leftElbowAngleDeg: 105.00,
            rightUpperArmAngleDeg: 52.60,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 155.00,
            rightThighAngleDeg: 68.00,
            leftKneeAngleDeg: -80.00,
            rightKneeAngleDeg: -21.00,
            hipYOffset: -17.20,
            displacementX: -35.90,
            globalLeftUpperArmAngleDeg: 128
        },
        {
            // EXPANDED FRAME 45
            spineAngleDeg: -93.80,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 142.80,
            leftElbowAngleDeg: 104.50,
            rightUpperArmAngleDeg: 52.90,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 89.00,
            leftThighAngleDeg: 155.50,
            rightThighAngleDeg: 68.20,
            leftKneeAngleDeg: -79.50,
            rightKneeAngleDeg: -20.90,
            hipYOffset: -17.20,
            displacementX: -36.56,
            globalLeftUpperArmAngleDeg: 129
        },
        {
            // EXPANDED FRAME 46
            spineAngleDeg: -93.60,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 143.60,
            leftElbowAngleDeg: 104.00,
            rightUpperArmAngleDeg: 53.20,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 88.00,
            leftThighAngleDeg: 156.00,
            rightThighAngleDeg: 68.40,
            leftKneeAngleDeg: -79.00,
            rightKneeAngleDeg: -20.80,
            hipYOffset: -17.20,
            displacementX: -37.22,
            globalLeftUpperArmAngleDeg: 130
        },
        {
            // EXPANDED FRAME 47
            spineAngleDeg: -93.40,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 144.40,
            leftElbowAngleDeg: 103.50,
            rightUpperArmAngleDeg: 53.50,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 87.00,
            leftThighAngleDeg: 156.50,
            rightThighAngleDeg: 68.60,
            leftKneeAngleDeg: -78.50,
            rightKneeAngleDeg: -20.70,
            hipYOffset: -17.20,
            displacementX: -37.88,
            globalLeftUpperArmAngleDeg: 131
        },
        {
            // EXPANDED FRAME 48
            spineAngleDeg: -93.20,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 145.20,
            leftElbowAngleDeg: 103.00,
            rightUpperArmAngleDeg: 53.80,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 86.00,
            leftThighAngleDeg: 157.00,
            rightThighAngleDeg: 68.80,
            leftKneeAngleDeg: -78.00,
            rightKneeAngleDeg: -20.60,
            hipYOffset: -17.20,
            displacementX: -38.54,
            globalLeftUpperArmAngleDeg: 132
        },
        {
            // EXPANDED FRAME 49
            spineAngleDeg: -93.00,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 146.00,
            leftElbowAngleDeg: 102.50,
            rightUpperArmAngleDeg: 54.10,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 157.50,
            rightThighAngleDeg: 69.00,
            leftKneeAngleDeg: -77.50,
            rightKneeAngleDeg: -20.50,
            hipYOffset: -17.20,
            displacementX: -39.20,
            globalLeftUpperArmAngleDeg: 133
        },
        {
            // EXPANDED FRAME 50
            spineAngleDeg: -92.80,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 146.80,
            leftElbowAngleDeg: 102.00,
            rightUpperArmAngleDeg: 54.40,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 84.00,
            leftThighAngleDeg: 158.00,
            rightThighAngleDeg: 69.20,
            leftKneeAngleDeg: -77.00,
            rightKneeAngleDeg: -20.40,
            hipYOffset: -17.20,
            displacementX: -39.86,
            globalLeftUpperArmAngleDeg: 134
        },
        {
            // EXPANDED FRAME 51
            spineAngleDeg: -92.60,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 147.60,
            leftElbowAngleDeg: 101.50,
            rightUpperArmAngleDeg: 54.70,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 83.00,
            leftThighAngleDeg: 158.50,
            rightThighAngleDeg: 69.40,
            leftKneeAngleDeg: -76.50,
            rightKneeAngleDeg: -20.30,
            hipYOffset: -17.20,
            displacementX: -40.52,
            globalLeftUpperArmAngleDeg: 135
        },
        {
            // EXPANDED FRAME 52
            spineAngleDeg: -92.40,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 148.40,
            leftElbowAngleDeg: 101.00,
            rightUpperArmAngleDeg: 55.00,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 82.00,
            leftThighAngleDeg: 159.00,
            rightThighAngleDeg: 69.60,
            leftKneeAngleDeg: -76.00,
            rightKneeAngleDeg: -20.20,
            hipYOffset: -17.20,
            displacementX: -41.18,
            globalLeftUpperArmAngleDeg: 136
        },
        {
            // EXPANDED FRAME 53
            spineAngleDeg: -92.20,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 149.20,
            leftElbowAngleDeg: 100.50,
            rightUpperArmAngleDeg: 55.30,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 81.00,
            leftThighAngleDeg: 159.50,
            rightThighAngleDeg: 69.80,
            leftKneeAngleDeg: -75.50,
            rightKneeAngleDeg: -20.10,
            hipYOffset: -17.20,
            displacementX: -41.84,
            globalLeftUpperArmAngleDeg: 137
        },
        {
            // EXPANDED FRAME 54
            spineAngleDeg: -92.00,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 150.00,
            leftElbowAngleDeg: 100.00,
            rightUpperArmAngleDeg: 55.60,
            rightElbowAngleDeg: 76.99,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 160.00,
            rightThighAngleDeg: 70.00,
            leftKneeAngleDeg: -75.00,
            rightKneeAngleDeg: -20.00,
            hipYOffset: -17.20,
            displacementX: -42.50,
            globalLeftUpperArmAngleDeg: 138
        },
        {
            // EXPANDED FRAME 55
            spineAngleDeg: -91.63,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 150.63,
            leftElbowAngleDeg: 100.00,
            rightUpperArmAngleDeg: 54.65,
            rightElbowAngleDeg: 77.37,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 159.38,
            rightThighAngleDeg: 69.38,
            leftKneeAngleDeg: -74.00,
            rightKneeAngleDeg: -20.63,
            hipYOffset: -17.20,
            displacementX: -43.30,
            globalLeftUpperArmAngleDeg: 139
        },
        {
            // EXPANDED FRAME 56
            spineAngleDeg: -91.25,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 151.25,
            leftElbowAngleDeg: 100.00,
            rightUpperArmAngleDeg: 53.70,
            rightElbowAngleDeg: 77.74,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 158.75,
            rightThighAngleDeg: 68.75,
            leftKneeAngleDeg: -73.00,
            rightKneeAngleDeg: -21.25,
            hipYOffset: -17.20,
            displacementX: -44.10,
            globalLeftUpperArmAngleDeg: 140
        },
        {
            // EXPANDED FRAME 57
            spineAngleDeg: -90.88,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 151.88,
            leftElbowAngleDeg: 100.00,
            rightUpperArmAngleDeg: 52.75,
            rightElbowAngleDeg: 78.12,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 158.13,
            rightThighAngleDeg: 68.13,
            leftKneeAngleDeg: -72.00,
            rightKneeAngleDeg: -21.88,
            hipYOffset: -17.20,
            displacementX: -44.90,
            globalLeftUpperArmAngleDeg: 141
        },
        {
            // EXPANDED FRAME 58
            spineAngleDeg: -90.50,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 152.50,
            leftElbowAngleDeg: 100.00,
            rightUpperArmAngleDeg: 51.80,
            rightElbowAngleDeg: 78.50,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 157.50,
            rightThighAngleDeg: 67.50,
            leftKneeAngleDeg: -71.00,
            rightKneeAngleDeg: -22.50,
            hipYOffset: -17.20,
            displacementX: -45.70,
            globalLeftUpperArmAngleDeg: 142
        },
        {
            // EXPANDED FRAME 59
            spineAngleDeg: -90.13,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 153.13,
            leftElbowAngleDeg: 100.00,
            rightUpperArmAngleDeg: 50.85,
            rightElbowAngleDeg: 78.87,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 156.88,
            rightThighAngleDeg: 66.88,
            leftKneeAngleDeg: -70.00,
            rightKneeAngleDeg: -23.13,
            hipYOffset: -17.20,
            displacementX: -46.50,
            globalLeftUpperArmAngleDeg: 143
        },
        {
            // EXPANDED FRAME 60
            spineAngleDeg: -89.75,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 153.75,
            leftElbowAngleDeg: 100.00,
            rightUpperArmAngleDeg: 49.90,
            rightElbowAngleDeg: 79.25,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 156.25,
            rightThighAngleDeg: 66.25,
            leftKneeAngleDeg: -69.00,
            rightKneeAngleDeg: -23.75,
            hipYOffset: -17.20,
            displacementX: -47.30,
            globalLeftUpperArmAngleDeg: 144
        },
        {
            // EXPANDED FRAME 61
            spineAngleDeg: -89.38,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 154.38,
            leftElbowAngleDeg: 100.00,
            rightUpperArmAngleDeg: 48.95,
            rightElbowAngleDeg: 79.62,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 155.63,
            rightThighAngleDeg: 65.63,
            leftKneeAngleDeg: -68.00,
            rightKneeAngleDeg: -24.38,
            hipYOffset: -17.20,
            displacementX: -48.10,
            globalLeftUpperArmAngleDeg: 145
        },
        {
            // EXPANDED FRAME 62
            spineAngleDeg: -89.00,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 155.00,
            leftElbowAngleDeg: 100.00,
            rightUpperArmAngleDeg: 48.00,
            rightElbowAngleDeg: 80.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 155.00,
            rightThighAngleDeg: 65.00,
            leftKneeAngleDeg: -67.00,
            rightKneeAngleDeg: -25.00,
            hipYOffset: -17.20,
            displacementX: -48.90,
            globalLeftUpperArmAngleDeg: 146
        },
        {
            // EXPANDED FRAME 63
            spineAngleDeg: -88.63,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 155.63,
            leftElbowAngleDeg: 100.00,
            rightUpperArmAngleDeg: 47.00,
            rightElbowAngleDeg: 80.63,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 154.38,
            rightThighAngleDeg: 64.38,
            leftKneeAngleDeg: -66.13,
            rightKneeAngleDeg: -25.63,
            hipYOffset: -17.20,
            displacementX: -49.67,
            globalLeftUpperArmAngleDeg: 147
        },
        {
            // EXPANDED FRAME 64
            spineAngleDeg: -88.25,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 156.25,
            leftElbowAngleDeg: 100.00,
            rightUpperArmAngleDeg: 46.00,
            rightElbowAngleDeg: 81.25,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 153.75,
            rightThighAngleDeg: 63.75,
            leftKneeAngleDeg: -65.25,
            rightKneeAngleDeg: -26.25,
            hipYOffset: -17.20,
            displacementX: -50.45,
            globalLeftUpperArmAngleDeg: 148
        },
        {
            // EXPANDED FRAME 65
            spineAngleDeg: -87.88,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 156.88,
            leftElbowAngleDeg: 100.00,
            rightUpperArmAngleDeg: 45.00,
            rightElbowAngleDeg: 81.88,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 153.13,
            rightThighAngleDeg: 63.13,
            leftKneeAngleDeg: -64.38,
            rightKneeAngleDeg: -26.88,
            hipYOffset: -17.20,
            displacementX: -51.23,
            globalLeftUpperArmAngleDeg: 149
        },
        {
            // EXPANDED FRAME 66
            spineAngleDeg: -87.50,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 157.50,
            leftElbowAngleDeg: 100.00,
            rightUpperArmAngleDeg: 44.00,
            rightElbowAngleDeg: 82.50,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 152.50,
            rightThighAngleDeg: 62.50,
            leftKneeAngleDeg: -63.50,
            rightKneeAngleDeg: -27.50,
            hipYOffset: -17.20,
            displacementX: -52.00,
            globalLeftUpperArmAngleDeg: 150
        },
        {
            // EXPANDED FRAME 67
            spineAngleDeg: -87.13,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 158.13,
            leftElbowAngleDeg: 100.00,
            rightUpperArmAngleDeg: 43.00,
            rightElbowAngleDeg: 83.13,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 151.88,
            rightThighAngleDeg: 61.88,
            leftKneeAngleDeg: -62.63,
            rightKneeAngleDeg: -28.13,
            hipYOffset: -17.20,
            displacementX: -52.77,
            globalLeftUpperArmAngleDeg: 151
        },
        {
            // EXPANDED FRAME 68
            spineAngleDeg: -86.75,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 158.75,
            leftElbowAngleDeg: 100.00,
            rightUpperArmAngleDeg: 42.00,
            rightElbowAngleDeg: 83.75,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 151.25,
            rightThighAngleDeg: 61.25,
            leftKneeAngleDeg: -61.75,
            rightKneeAngleDeg: -28.75,
            hipYOffset: -17.20,
            displacementX: -53.55,
            globalLeftUpperArmAngleDeg: 152
        },
        {
            // EXPANDED FRAME 69
            spineAngleDeg: -86.38,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 159.38,
            leftElbowAngleDeg: 100.00,
            rightUpperArmAngleDeg: 41.00,
            rightElbowAngleDeg: 84.38,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 150.63,
            rightThighAngleDeg: 60.63,
            leftKneeAngleDeg: -60.88,
            rightKneeAngleDeg: -29.38,
            hipYOffset: -17.20,
            displacementX: -54.33,
            globalLeftUpperArmAngleDeg: 153
        },
        {
            // EXPANDED FRAME 70
            spineAngleDeg: -86.00,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 160.00,
            leftElbowAngleDeg: 100.00,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 150.00,
            rightThighAngleDeg: 60.00,
            leftKneeAngleDeg: -60.00,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -17.20,
            displacementX: -55.10,
            globalLeftUpperArmAngleDeg: 154
        },
        {
            // EXPANDED FRAME 71
            spineAngleDeg: -86.19,
            shoulderJointDist: 40.48,
            shoulderJointAngleDeg: 80.48,
            leftUpperArmAngleDeg: 160.71,
            leftElbowAngleDeg: 99.52,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 149.52,
            rightThighAngleDeg: 60.24,
            leftKneeAngleDeg: -59.19,
            rightKneeAngleDeg: -30.71,
            hipYOffset: -17.20,
            displacementX: -55.38,
            globalLeftUpperArmAngleDeg: 155
        },
        {
            // EXPANDED FRAME 72
            spineAngleDeg: -86.38,
            shoulderJointDist: 40.95,
            shoulderJointAngleDeg: 80.95,
            leftUpperArmAngleDeg: 161.43,
            leftElbowAngleDeg: 99.05,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 149.05,
            rightThighAngleDeg: 60.48,
            leftKneeAngleDeg: -58.38,
            rightKneeAngleDeg: -31.43,
            hipYOffset: -17.20,
            displacementX: -55.66,
            globalLeftUpperArmAngleDeg: 156
        },
        {
            // EXPANDED FRAME 73
            spineAngleDeg: -86.57,
            shoulderJointDist: 41.43,
            shoulderJointAngleDeg: 81.43,
            leftUpperArmAngleDeg: 162.14,
            leftElbowAngleDeg: 98.57,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 148.57,
            rightThighAngleDeg: 60.71,
            leftKneeAngleDeg: -57.57,
            rightKneeAngleDeg: -32.14,
            hipYOffset: -17.20,
            displacementX: -55.94,
            globalLeftUpperArmAngleDeg: 157
        },
        {
            // EXPANDED FRAME 74
            spineAngleDeg: -86.76,
            shoulderJointDist: 41.90,
            shoulderJointAngleDeg: 81.90,
            leftUpperArmAngleDeg: 162.86,
            leftElbowAngleDeg: 98.10,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 148.10,
            rightThighAngleDeg: 60.95,
            leftKneeAngleDeg: -56.76,
            rightKneeAngleDeg: -32.86,
            hipYOffset: -17.20,
            displacementX: -56.22,
            globalLeftUpperArmAngleDeg: 158
        },
        {
            // EXPANDED FRAME 75
            spineAngleDeg: -86.95,
            shoulderJointDist: 42.38,
            shoulderJointAngleDeg: 82.38,
            leftUpperArmAngleDeg: 163.57,
            leftElbowAngleDeg: 97.62,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 147.62,
            rightThighAngleDeg: 61.19,
            leftKneeAngleDeg: -55.95,
            rightKneeAngleDeg: -33.57,
            hipYOffset: -17.20,
            displacementX: -56.50,
            globalLeftUpperArmAngleDeg: 159
        },
        {
            // EXPANDED FRAME 76
            spineAngleDeg: -87.14,
            shoulderJointDist: 42.86,
            shoulderJointAngleDeg: 82.86,
            leftUpperArmAngleDeg: 164.29,
            leftElbowAngleDeg: 97.14,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 147.14,
            rightThighAngleDeg: 61.43,
            leftKneeAngleDeg: -55.14,
            rightKneeAngleDeg: -34.29,
            hipYOffset: -17.20,
            displacementX: -56.79,
            globalLeftUpperArmAngleDeg: 160
        },
        {
            // EXPANDED FRAME 77
            spineAngleDeg: -87.33,
            shoulderJointDist: 43.33,
            shoulderJointAngleDeg: 83.33,
            leftUpperArmAngleDeg: 165.00,
            leftElbowAngleDeg: 96.67,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 146.67,
            rightThighAngleDeg: 61.67,
            leftKneeAngleDeg: -54.33,
            rightKneeAngleDeg: -35.00,
            hipYOffset: -17.20,
            displacementX: -57.07,
            globalLeftUpperArmAngleDeg: 161
        },
        {
            // EXPANDED FRAME 78
            spineAngleDeg: -87.52,
            shoulderJointDist: 43.81,
            shoulderJointAngleDeg: 83.81,
            leftUpperArmAngleDeg: 165.71,
            leftElbowAngleDeg: 96.19,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 146.19,
            rightThighAngleDeg: 61.90,
            leftKneeAngleDeg: -53.52,
            rightKneeAngleDeg: -35.71,
            hipYOffset: -17.20,
            displacementX: -57.35,
            globalLeftUpperArmAngleDeg: 162
        },
        {
            // EXPANDED FRAME 79
            spineAngleDeg: -87.71,
            shoulderJointDist: 44.29,
            shoulderJointAngleDeg: 84.29,
            leftUpperArmAngleDeg: 166.43,
            leftElbowAngleDeg: 95.71,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 145.71,
            rightThighAngleDeg: 62.14,
            leftKneeAngleDeg: -52.71,
            rightKneeAngleDeg: -36.43,
            hipYOffset: -17.20,
            displacementX: -57.63,
            globalLeftUpperArmAngleDeg: 163
        },
        {
            // EXPANDED FRAME 80
            spineAngleDeg: -87.90,
            shoulderJointDist: 44.76,
            shoulderJointAngleDeg: 84.76,
            leftUpperArmAngleDeg: 167.14,
            leftElbowAngleDeg: 95.24,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 145.24,
            rightThighAngleDeg: 62.38,
            leftKneeAngleDeg: -51.90,
            rightKneeAngleDeg: -37.14,
            hipYOffset: -17.20,
            displacementX: -57.91,
            globalLeftUpperArmAngleDeg: 164
        },
        {
            // EXPANDED FRAME 81
            spineAngleDeg: -88.10,
            shoulderJointDist: 45.24,
            shoulderJointAngleDeg: 85.24,
            leftUpperArmAngleDeg: 167.86,
            leftElbowAngleDeg: 94.76,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 144.76,
            rightThighAngleDeg: 62.62,
            leftKneeAngleDeg: -51.10,
            rightKneeAngleDeg: -37.86,
            hipYOffset: -17.20,
            displacementX: -58.19,
            globalLeftUpperArmAngleDeg: 165
        },
        {
            // EXPANDED FRAME 82
            spineAngleDeg: -88.29,
            shoulderJointDist: 45.71,
            shoulderJointAngleDeg: 85.71,
            leftUpperArmAngleDeg: 168.57,
            leftElbowAngleDeg: 94.29,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 144.29,
            rightThighAngleDeg: 62.86,
            leftKneeAngleDeg: -50.29,
            rightKneeAngleDeg: -38.57,
            hipYOffset: -17.20,
            displacementX: -58.47,
            globalLeftUpperArmAngleDeg: 166
        },
        {
            // EXPANDED FRAME 83
            spineAngleDeg: -88.48,
            shoulderJointDist: 46.19,
            shoulderJointAngleDeg: 86.19,
            leftUpperArmAngleDeg: 169.29,
            leftElbowAngleDeg: 93.81,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 143.81,
            rightThighAngleDeg: 63.10,
            leftKneeAngleDeg: -49.48,
            rightKneeAngleDeg: -39.29,
            hipYOffset: -17.20,
            displacementX: -58.75,
            globalLeftUpperArmAngleDeg: 167
        },
        {
            // EXPANDED FRAME 84
            spineAngleDeg: -88.67,
            shoulderJointDist: 46.67,
            shoulderJointAngleDeg: 86.67,
            leftUpperArmAngleDeg: 170.00,
            leftElbowAngleDeg: 93.33,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 143.33,
            rightThighAngleDeg: 63.33,
            leftKneeAngleDeg: -48.67,
            rightKneeAngleDeg: -40.00,
            hipYOffset: -17.20,
            displacementX: -59.03,
            globalLeftUpperArmAngleDeg: 168
        },
        {
            // EXPANDED FRAME 85
            spineAngleDeg: -88.86,
            shoulderJointDist: 47.14,
            shoulderJointAngleDeg: 87.14,
            leftUpperArmAngleDeg: 170.71,
            leftElbowAngleDeg: 92.86,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 142.86,
            rightThighAngleDeg: 63.57,
            leftKneeAngleDeg: -47.86,
            rightKneeAngleDeg: -40.71,
            hipYOffset: -17.20,
            displacementX: -59.31,
            globalLeftUpperArmAngleDeg: 169
        },
        {
            // EXPANDED FRAME 86
            spineAngleDeg: -89.05,
            shoulderJointDist: 47.62,
            shoulderJointAngleDeg: 87.62,
            leftUpperArmAngleDeg: 171.43,
            leftElbowAngleDeg: 92.38,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 142.38,
            rightThighAngleDeg: 63.81,
            leftKneeAngleDeg: -47.05,
            rightKneeAngleDeg: -41.43,
            hipYOffset: -17.20,
            displacementX: -59.60,
            globalLeftUpperArmAngleDeg: 170
        },
        {
            // EXPANDED FRAME 87
            spineAngleDeg: -89.24,
            shoulderJointDist: 48.10,
            shoulderJointAngleDeg: 88.10,
            leftUpperArmAngleDeg: 172.14,
            leftElbowAngleDeg: 91.90,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 141.90,
            rightThighAngleDeg: 64.05,
            leftKneeAngleDeg: -46.24,
            rightKneeAngleDeg: -42.14,
            hipYOffset: -17.20,
            displacementX: -59.88,
            globalLeftUpperArmAngleDeg: 171
        },
        {
            // EXPANDED FRAME 88
            spineAngleDeg: -89.43,
            shoulderJointDist: 48.57,
            shoulderJointAngleDeg: 88.57,
            leftUpperArmAngleDeg: 172.86,
            leftElbowAngleDeg: 91.43,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 141.43,
            rightThighAngleDeg: 64.29,
            leftKneeAngleDeg: -45.43,
            rightKneeAngleDeg: -42.86,
            hipYOffset: -17.20,
            displacementX: -60.16,
            globalLeftUpperArmAngleDeg: 172
        },
        {
            // EXPANDED FRAME 89
            spineAngleDeg: -89.62,
            shoulderJointDist: 49.05,
            shoulderJointAngleDeg: 89.05,
            leftUpperArmAngleDeg: 173.57,
            leftElbowAngleDeg: 90.95,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 140.95,
            rightThighAngleDeg: 64.52,
            leftKneeAngleDeg: -44.62,
            rightKneeAngleDeg: -43.57,
            hipYOffset: -17.20,
            displacementX: -60.44,
            globalLeftUpperArmAngleDeg: 173
        },
        {
            // EXPANDED FRAME 90
            spineAngleDeg: -89.81,
            shoulderJointDist: 49.52,
            shoulderJointAngleDeg: 89.52,
            leftUpperArmAngleDeg: 174.29,
            leftElbowAngleDeg: 90.48,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 140.48,
            rightThighAngleDeg: 64.76,
            leftKneeAngleDeg: -43.81,
            rightKneeAngleDeg: -44.29,
            hipYOffset: -17.20,
            displacementX: -60.72,
            globalLeftUpperArmAngleDeg: 174
        },
        {
            // EXPANDED FRAME 91
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 90.00,
            leftUpperArmAngleDeg: 175.00,
            leftElbowAngleDeg: 90.00,
            rightUpperArmAngleDeg: 40.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 65.00,
            leftKneeAngleDeg: -43.00,
            rightKneeAngleDeg: -45.00,
            hipYOffset: -17.20,
            displacementX: -61.00,
            globalLeftUpperArmAngleDeg: 175
        },
        {
            // EXPANDED FRAME 92
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 90.00,
            leftUpperArmAngleDeg: 176.00,
            leftElbowAngleDeg: 90.00,
            rightUpperArmAngleDeg: 40.50,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 4.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 65.50,
            leftKneeAngleDeg: -43.00,
            rightKneeAngleDeg: -47.50,
            hipYOffset: -17.20,
            displacementX: -61.58,
            globalLeftUpperArmAngleDeg: 176
        },
        {
            // EXPANDED FRAME 93
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 90.00,
            leftUpperArmAngleDeg: 177.00,
            leftElbowAngleDeg: 90.00,
            rightUpperArmAngleDeg: 41.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 3.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 66.00,
            leftKneeAngleDeg: -43.00,
            rightKneeAngleDeg: -50.00,
            hipYOffset: -17.20,
            displacementX: -62.16,
            globalLeftUpperArmAngleDeg: 177
        },
        {
            // EXPANDED FRAME 94
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 90.00,
            leftUpperArmAngleDeg: 178.00,
            leftElbowAngleDeg: 90.00,
            rightUpperArmAngleDeg: 41.50,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 2.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 66.50,
            leftKneeAngleDeg: -43.00,
            rightKneeAngleDeg: -52.50,
            hipYOffset: -17.20,
            displacementX: -62.74,
            globalLeftUpperArmAngleDeg: 178
        },
        {
            // EXPANDED FRAME 95
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 90.00,
            leftUpperArmAngleDeg: 179.00,
            leftElbowAngleDeg: 90.00,
            rightUpperArmAngleDeg: 42.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 1.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 67.00,
            leftKneeAngleDeg: -43.00,
            rightKneeAngleDeg: -55.00,
            hipYOffset: -17.20,
            displacementX: -63.32,
            globalLeftUpperArmAngleDeg: 179
        },
        {
            // EXPANDED FRAME 96
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 90.00,
            leftUpperArmAngleDeg: 180.00,
            leftElbowAngleDeg: 90.00,
            rightUpperArmAngleDeg: 42.50,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 67.50,
            leftKneeAngleDeg: -43.00,
            rightKneeAngleDeg: -57.50,
            hipYOffset: -17.20,
            displacementX: -63.90,
            globalLeftUpperArmAngleDeg: 180
        },
        {
            // EXPANDED FRAME 97
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 90.00,
            leftUpperArmAngleDeg: 181.00,
            leftElbowAngleDeg: 90.00,
            rightUpperArmAngleDeg: 43.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -1.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 68.00,
            leftKneeAngleDeg: -43.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -17.20,
            displacementX: -64.48,
            globalLeftUpperArmAngleDeg: 181
        },
        {
            // EXPANDED FRAME 98
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 90.00,
            leftUpperArmAngleDeg: 182.00,
            leftElbowAngleDeg: 90.00,
            rightUpperArmAngleDeg: 43.50,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -2.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 68.50,
            leftKneeAngleDeg: -43.00,
            rightKneeAngleDeg: -62.50,
            hipYOffset: -17.20,
            displacementX: -65.06,
            globalLeftUpperArmAngleDeg: 182
        },
        {
            // EXPANDED FRAME 99
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 90.00,
            leftUpperArmAngleDeg: 183.00,
            leftElbowAngleDeg: 90.00,
            rightUpperArmAngleDeg: 44.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -3.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 69.00,
            leftKneeAngleDeg: -43.00,
            rightKneeAngleDeg: -65.00,
            hipYOffset: -17.20,
            displacementX: -65.64,
            globalLeftUpperArmAngleDeg: 183
        },
        {
            // EXPANDED FRAME 100
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 90.00,
            leftUpperArmAngleDeg: 184.00,
            leftElbowAngleDeg: 90.00,
            rightUpperArmAngleDeg: 44.50,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -4.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 69.50,
            leftKneeAngleDeg: -43.00,
            rightKneeAngleDeg: -67.50,
            hipYOffset: -17.20,
            displacementX: -66.22,
            globalLeftUpperArmAngleDeg: 184
        },
        {
            // EXPANDED FRAME 101
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 90.00,
            leftUpperArmAngleDeg: 185.00,
            leftElbowAngleDeg: 90.00,
            rightUpperArmAngleDeg: 45.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -5.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 70.00,
            leftKneeAngleDeg: -43.00,
            rightKneeAngleDeg: -70.00,
            hipYOffset: -17.20,
            displacementX: -66.80,
            globalLeftUpperArmAngleDeg: 185
        },
        {
            // EXPANDED FRAME 102
            spineAngleDeg: -91.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 92.00,
            leftUpperArmAngleDeg: 185.00,
            leftElbowAngleDeg: 90.00,
            rightUpperArmAngleDeg: 45.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -7.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 139.00,
            rightThighAngleDeg: 72.00,
            leftKneeAngleDeg: -44.40,
            rightKneeAngleDeg: -74.00,
            hipYOffset: -17.20,
            displacementX: -67.94,
            globalLeftUpperArmAngleDeg: 186
        },
        {
            // EXPANDED FRAME 103
            spineAngleDeg: -92.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 94.00,
            leftUpperArmAngleDeg: 185.00,
            leftElbowAngleDeg: 90.00,
            rightUpperArmAngleDeg: 45.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -9.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 138.00,
            rightThighAngleDeg: 74.00,
            leftKneeAngleDeg: -45.80,
            rightKneeAngleDeg: -78.00,
            hipYOffset: -17.20,
            displacementX: -69.08,
            globalLeftUpperArmAngleDeg: 187
        },
        {
            // EXPANDED FRAME 104
            spineAngleDeg: -93.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 96.00,
            leftUpperArmAngleDeg: 185.00,
            leftElbowAngleDeg: 90.00,
            rightUpperArmAngleDeg: 45.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -11.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 137.00,
            rightThighAngleDeg: 76.00,
            leftKneeAngleDeg: -47.20,
            rightKneeAngleDeg: -82.00,
            hipYOffset: -17.20,
            displacementX: -70.22,
            globalLeftUpperArmAngleDeg: 188
        },
        {
            // EXPANDED FRAME 105
            spineAngleDeg: -94.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 98.00,
            leftUpperArmAngleDeg: 185.00,
            leftElbowAngleDeg: 90.00,
            rightUpperArmAngleDeg: 45.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -13.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 136.00,
            rightThighAngleDeg: 78.00,
            leftKneeAngleDeg: -48.60,
            rightKneeAngleDeg: -86.00,
            hipYOffset: -17.20,
            displacementX: -71.36,
            globalLeftUpperArmAngleDeg: 189
        },
        {
            // EXPANDED FRAME 106
            spineAngleDeg: -95.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 185.00,
            leftElbowAngleDeg: 90.00,
            rightUpperArmAngleDeg: 45.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -15.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 135.00,
            rightThighAngleDeg: 80.00,
            leftKneeAngleDeg: -50.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -72.50,
            globalLeftUpperArmAngleDeg: 190
        },
        {
            // EXPANDED FRAME 107
            spineAngleDeg: -94.75,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 185.75,
            leftElbowAngleDeg: 88.00,
            rightUpperArmAngleDeg: 45.75,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -15.50,
            pelvisJointAngleDeg: 80.50,
            leftThighAngleDeg: 134.50,
            rightThighAngleDeg: 79.00,
            leftKneeAngleDeg: -48.75,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -72.77,
            globalLeftUpperArmAngleDeg: 191
        },
        {
            // EXPANDED FRAME 108
            spineAngleDeg: -94.50,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 186.50,
            leftElbowAngleDeg: 86.00,
            rightUpperArmAngleDeg: 46.50,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -16.00,
            pelvisJointAngleDeg: 81.00,
            leftThighAngleDeg: 134.00,
            rightThighAngleDeg: 78.00,
            leftKneeAngleDeg: -47.50,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -73.04,
            globalLeftUpperArmAngleDeg: 192
        },
        {
            // EXPANDED FRAME 109
            spineAngleDeg: -94.25,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 187.25,
            leftElbowAngleDeg: 84.00,
            rightUpperArmAngleDeg: 47.25,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -16.50,
            pelvisJointAngleDeg: 81.50,
            leftThighAngleDeg: 133.50,
            rightThighAngleDeg: 77.00,
            leftKneeAngleDeg: -46.25,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -73.31,
            globalLeftUpperArmAngleDeg: 193
        },
        {
            // EXPANDED FRAME 110
            spineAngleDeg: -94.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 188.00,
            leftElbowAngleDeg: 82.00,
            rightUpperArmAngleDeg: 48.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -17.00,
            pelvisJointAngleDeg: 82.00,
            leftThighAngleDeg: 133.00,
            rightThighAngleDeg: 76.00,
            leftKneeAngleDeg: -45.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -73.58,
            globalLeftUpperArmAngleDeg: 194
        },
        {
            // EXPANDED FRAME 111
            spineAngleDeg: -93.75,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 188.75,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 48.75,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -17.50,
            pelvisJointAngleDeg: 82.50,
            leftThighAngleDeg: 132.50,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -43.75,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -73.85,
            globalLeftUpperArmAngleDeg: 195
        },
        {
            // EXPANDED FRAME 112
            spineAngleDeg: -93.50,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 189.50,
            leftElbowAngleDeg: 78.00,
            rightUpperArmAngleDeg: 49.50,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -18.00,
            pelvisJointAngleDeg: 83.00,
            leftThighAngleDeg: 132.00,
            rightThighAngleDeg: 74.00,
            leftKneeAngleDeg: -42.50,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -74.12,
            globalLeftUpperArmAngleDeg: 196
        },
        {
            // EXPANDED FRAME 113
            spineAngleDeg: -93.25,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 190.25,
            leftElbowAngleDeg: 76.00,
            rightUpperArmAngleDeg: 50.25,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -18.50,
            pelvisJointAngleDeg: 83.50,
            leftThighAngleDeg: 131.50,
            rightThighAngleDeg: 73.00,
            leftKneeAngleDeg: -41.25,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -74.39,
            globalLeftUpperArmAngleDeg: 197
        },
        {
            // EXPANDED FRAME 114
            spineAngleDeg: -93.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 191.00,
            leftElbowAngleDeg: 74.00,
            rightUpperArmAngleDeg: 51.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -19.00,
            pelvisJointAngleDeg: 84.00,
            leftThighAngleDeg: 131.00,
            rightThighAngleDeg: 72.00,
            leftKneeAngleDeg: -40.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -74.66,
            globalLeftUpperArmAngleDeg: 198
        },
        {
            // EXPANDED FRAME 115
            spineAngleDeg: -92.75,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 191.75,
            leftElbowAngleDeg: 72.00,
            rightUpperArmAngleDeg: 51.75,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -19.50,
            pelvisJointAngleDeg: 84.50,
            leftThighAngleDeg: 130.50,
            rightThighAngleDeg: 71.00,
            leftKneeAngleDeg: -38.75,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -74.93,
            globalLeftUpperArmAngleDeg: 199
        },
        {
            // EXPANDED FRAME 116
            spineAngleDeg: -92.50,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 192.50,
            leftElbowAngleDeg: 70.00,
            rightUpperArmAngleDeg: 52.50,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -20.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 130.00,
            rightThighAngleDeg: 70.00,
            leftKneeAngleDeg: -37.50,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -75.20,
            globalLeftUpperArmAngleDeg: 200
        },
        {
            // EXPANDED FRAME 117
            spineAngleDeg: -92.25,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 193.25,
            leftElbowAngleDeg: 68.00,
            rightUpperArmAngleDeg: 53.25,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -20.50,
            pelvisJointAngleDeg: 85.50,
            leftThighAngleDeg: 129.50,
            rightThighAngleDeg: 69.00,
            leftKneeAngleDeg: -36.25,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -75.47,
            globalLeftUpperArmAngleDeg: 201
        },
        {
            // EXPANDED FRAME 118
            spineAngleDeg: -92.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 194.00,
            leftElbowAngleDeg: 66.00,
            rightUpperArmAngleDeg: 54.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -21.00,
            pelvisJointAngleDeg: 86.00,
            leftThighAngleDeg: 129.00,
            rightThighAngleDeg: 68.00,
            leftKneeAngleDeg: -35.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -75.74,
            globalLeftUpperArmAngleDeg: 202
        },
        {
            // EXPANDED FRAME 119
            spineAngleDeg: -91.75,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 194.75,
            leftElbowAngleDeg: 64.00,
            rightUpperArmAngleDeg: 54.75,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -21.50,
            pelvisJointAngleDeg: 86.50,
            leftThighAngleDeg: 128.50,
            rightThighAngleDeg: 67.00,
            leftKneeAngleDeg: -33.75,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -76.01,
            globalLeftUpperArmAngleDeg: 203
        },
        {
            // EXPANDED FRAME 120
            spineAngleDeg: -91.50,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 195.50,
            leftElbowAngleDeg: 62.00,
            rightUpperArmAngleDeg: 55.50,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -22.00,
            pelvisJointAngleDeg: 87.00,
            leftThighAngleDeg: 128.00,
            rightThighAngleDeg: 66.00,
            leftKneeAngleDeg: -32.50,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -76.28,
            globalLeftUpperArmAngleDeg: 204
        },
        {
            // EXPANDED FRAME 121
            spineAngleDeg: -91.25,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 196.25,
            leftElbowAngleDeg: 60.00,
            rightUpperArmAngleDeg: 56.25,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -22.50,
            pelvisJointAngleDeg: 87.50,
            leftThighAngleDeg: 127.50,
            rightThighAngleDeg: 65.00,
            leftKneeAngleDeg: -31.25,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -76.55,
            globalLeftUpperArmAngleDeg: 205
        },
        {
            // EXPANDED FRAME 122
            spineAngleDeg: -91.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 197.00,
            leftElbowAngleDeg: 58.00,
            rightUpperArmAngleDeg: 57.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -23.00,
            pelvisJointAngleDeg: 88.00,
            leftThighAngleDeg: 127.00,
            rightThighAngleDeg: 64.00,
            leftKneeAngleDeg: -30.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -76.82,
            globalLeftUpperArmAngleDeg: 206
        },
        {
            // EXPANDED FRAME 123
            spineAngleDeg: -90.75,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 197.75,
            leftElbowAngleDeg: 56.00,
            rightUpperArmAngleDeg: 57.75,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -23.50,
            pelvisJointAngleDeg: 88.50,
            leftThighAngleDeg: 126.50,
            rightThighAngleDeg: 63.00,
            leftKneeAngleDeg: -28.75,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -77.09,
            globalLeftUpperArmAngleDeg: 207
        },
        {
            // EXPANDED FRAME 124
            spineAngleDeg: -90.50,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 198.50,
            leftElbowAngleDeg: 54.00,
            rightUpperArmAngleDeg: 58.50,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -24.00,
            pelvisJointAngleDeg: 89.00,
            leftThighAngleDeg: 126.00,
            rightThighAngleDeg: 62.00,
            leftKneeAngleDeg: -27.50,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -77.36,
            globalLeftUpperArmAngleDeg: 208
        },
        {
            // EXPANDED FRAME 125
            spineAngleDeg: -90.25,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 199.25,
            leftElbowAngleDeg: 52.00,
            rightUpperArmAngleDeg: 59.25,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -24.50,
            pelvisJointAngleDeg: 89.50,
            leftThighAngleDeg: 125.50,
            rightThighAngleDeg: 61.00,
            leftKneeAngleDeg: -26.25,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -77.63,
            globalLeftUpperArmAngleDeg: 209
        },
        {
            // EXPANDED FRAME 126
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 200.00,
            leftElbowAngleDeg: 50.00,
            rightUpperArmAngleDeg: 60.00,
            rightElbowAngleDeg: 85.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 125.00,
            rightThighAngleDeg: 60.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -77.90,
            globalLeftUpperArmAngleDeg: 210
        },
        {
            // EXPANDED FRAME 127
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 201.00,
            leftElbowAngleDeg: 49.25,
            rightUpperArmAngleDeg: 60.25,
            rightElbowAngleDeg: 84.50,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 125.25,
            rightThighAngleDeg: 61.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -78.16,
            globalLeftUpperArmAngleDeg: 211
        },
        {
            // EXPANDED FRAME 128
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 202.00,
            leftElbowAngleDeg: 48.50,
            rightUpperArmAngleDeg: 60.50,
            rightElbowAngleDeg: 84.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 125.50,
            rightThighAngleDeg: 62.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -78.42,
            globalLeftUpperArmAngleDeg: 212
        },
        {
            // EXPANDED FRAME 129
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 203.00,
            leftElbowAngleDeg: 47.75,
            rightUpperArmAngleDeg: 60.75,
            rightElbowAngleDeg: 83.50,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 125.75,
            rightThighAngleDeg: 63.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -78.68,
            globalLeftUpperArmAngleDeg: 213
        },
        {
            // EXPANDED FRAME 130
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 204.00,
            leftElbowAngleDeg: 47.00,
            rightUpperArmAngleDeg: 61.00,
            rightElbowAngleDeg: 83.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 126.00,
            rightThighAngleDeg: 64.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -78.94,
            globalLeftUpperArmAngleDeg: 214
        },
        {
            // EXPANDED FRAME 131
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 205.00,
            leftElbowAngleDeg: 46.25,
            rightUpperArmAngleDeg: 61.25,
            rightElbowAngleDeg: 82.50,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 126.25,
            rightThighAngleDeg: 65.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -79.20,
            globalLeftUpperArmAngleDeg: 215
        },
        {
            // EXPANDED FRAME 132
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 206.00,
            leftElbowAngleDeg: 45.50,
            rightUpperArmAngleDeg: 61.50,
            rightElbowAngleDeg: 82.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 126.50,
            rightThighAngleDeg: 66.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -79.46,
            globalLeftUpperArmAngleDeg: 216
        },
        {
            // EXPANDED FRAME 133
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 207.00,
            leftElbowAngleDeg: 44.75,
            rightUpperArmAngleDeg: 61.75,
            rightElbowAngleDeg: 81.50,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 126.75,
            rightThighAngleDeg: 67.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -79.72,
            globalLeftUpperArmAngleDeg: 217
        },
        {
            // EXPANDED FRAME 134
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 208.00,
            leftElbowAngleDeg: 44.00,
            rightUpperArmAngleDeg: 62.00,
            rightElbowAngleDeg: 81.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 127.00,
            rightThighAngleDeg: 68.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -79.98,
            globalLeftUpperArmAngleDeg: 218
        },
        {
            // EXPANDED FRAME 135
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 202.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 219
        },
        {
            // EXPANDED FRAME 136
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 203.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 220
        },
        {
            // EXPANDED FRAME 137
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 204.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 221
        },
        {
            // EXPANDED FRAME 138
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 205.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 222
        },
        {
            // EXPANDED FRAME 139
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 206.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 223
        },
        {
            // EXPANDED FRAME 140
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 207.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 224
        },
        {
            // EXPANDED FRAME 141
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 208.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 225
        },
        {
            // EXPANDED FRAME 142
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 209.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 226
        },
        {
            // EXPANDED FRAME 143
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 210.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 227
        },
        {
            // EXPANDED FRAME 144
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 211.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 228
        },
        {
            // EXPANDED FRAME 145
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 212.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 229
        },
        {
            // EXPANDED FRAME 146
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 213.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 230
        },
        {
            // EXPANDED FRAME 147
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 214.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 231
        },
        {
            // EXPANDED FRAME 148
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 215.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 232
        },
        {
            // EXPANDED FRAME 149
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 216.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 233
        },
        {
            // EXPANDED FRAME 150
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 217.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 234
        },
        {
            // EXPANDED FRAME 151
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 218.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 235
        },
        {
            // EXPANDED FRAME 152
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 219.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 236
        },
        {
            // EXPANDED FRAME 153
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 220.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 237
        },
        {
            // EXPANDED FRAME 154
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 221.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 238
        },
        {
            // EXPANDED FRAME 155
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 222.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 239
        },
        {
            // EXPANDED FRAME 156
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 223.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 240
        },
        {
            // EXPANDED FRAME 157
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 224.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 241
        },
        {
            // EXPANDED FRAME 158
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 225.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 242
        },
        {
            // EXPANDED FRAME 159
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 226.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 243
        },
        {
            // EXPANDED FRAME 160
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 227.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 244
        },
        {
            // EXPANDED FRAME 161
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 228.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 245
        },
        {
            // EXPANDED FRAME 162
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 229.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 246
        },
        {
            // EXPANDED FRAME 163
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 230.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 247
        },
        {
            // EXPANDED FRAME 164
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 231.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 248
        },
        {
            // EXPANDED FRAME 165
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 232.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 249
        },
        {
            // EXPANDED FRAME 166
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 233.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 250
        },
        {
            // EXPANDED FRAME 167
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 234.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 251
        },
        {
            // EXPANDED FRAME 168
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 235.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 252
        },
        {
            // EXPANDED FRAME 169
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 236.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 253
        },
        {
            // EXPANDED FRAME 170
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 237.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 254
        },
        {
            // EXPANDED FRAME 171
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 238.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 255
        },
        {
            // EXPANDED FRAME 172
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 239.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 256
        },
        {
            // EXPANDED FRAME 173
            spineAngleDeg: -88.05,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 104.86,
            leftUpperArmAngleDeg: 238.19,
            leftElbowAngleDeg: 44.95,
            rightUpperArmAngleDeg: 83.41,
            rightElbowAngleDeg: 75.15,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.73,
            rightThighAngleDeg: 93.32,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -115.62,
            hipYOffset: -22.13,
            displacementX: -104.09,
            globalLeftUpperArmAngleDeg: 255
        },
        {
            // EXPANDED FRAME 174
            spineAngleDeg: -88.11,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 104.73,
            leftUpperArmAngleDeg: 237.38,
            leftElbowAngleDeg: 44.91,
            rightUpperArmAngleDeg: 82.82,
            rightElbowAngleDeg: 75.30,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 113.14,
            rightThighAngleDeg: 92.65,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -114.91,
            hipYOffset: -22.00,
            displacementX: -103.43,
            globalLeftUpperArmAngleDeg: 254
        },
        {
            // EXPANDED FRAME 175
            spineAngleDeg: -88.16,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 104.59,
            leftUpperArmAngleDeg: 236.57,
            leftElbowAngleDeg: 44.86,
            rightUpperArmAngleDeg: 82.24,
            rightElbowAngleDeg: 75.45,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 113.54,
            rightThighAngleDeg: 91.97,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -114.20,
            hipYOffset: -21.86,
            displacementX: -102.76,
            globalLeftUpperArmAngleDeg: 253
        },
        {
            // EXPANDED FRAME 176
            spineAngleDeg: -88.22,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 104.46,
            leftUpperArmAngleDeg: 235.76,
            leftElbowAngleDeg: 44.81,
            rightUpperArmAngleDeg: 81.65,
            rightElbowAngleDeg: 75.59,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 113.94,
            rightThighAngleDeg: 91.30,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -113.48,
            hipYOffset: -21.72,
            displacementX: -102.10,
            globalLeftUpperArmAngleDeg: 252
        },
        {
            // EXPANDED FRAME 177
            spineAngleDeg: -88.27,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 104.32,
            leftUpperArmAngleDeg: 234.95,
            leftElbowAngleDeg: 44.76,
            rightUpperArmAngleDeg: 81.06,
            rightElbowAngleDeg: 75.74,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 114.35,
            rightThighAngleDeg: 90.62,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -112.77,
            hipYOffset: -21.58,
            displacementX: -101.44,
            globalLeftUpperArmAngleDeg: 251
        },
        {
            // EXPANDED FRAME 178
            spineAngleDeg: -88.32,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 104.19,
            leftUpperArmAngleDeg: 234.14,
            leftElbowAngleDeg: 44.72,
            rightUpperArmAngleDeg: 80.47,
            rightElbowAngleDeg: 75.89,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 114.75,
            rightThighAngleDeg: 89.95,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -112.06,
            hipYOffset: -21.45,
            displacementX: -100.78,
            globalLeftUpperArmAngleDeg: 250
        },
        {
            // EXPANDED FRAME 179
            spineAngleDeg: -88.38,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 104.05,
            leftUpperArmAngleDeg: 233.32,
            leftElbowAngleDeg: 44.67,
            rightUpperArmAngleDeg: 79.89,
            rightElbowAngleDeg: 76.04,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 115.15,
            rightThighAngleDeg: 89.27,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -111.35,
            hipYOffset: -21.31,
            displacementX: -100.11,
            globalLeftUpperArmAngleDeg: 249
        },
        {
            // EXPANDED FRAME 180
            spineAngleDeg: -88.43,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 103.92,
            leftUpperArmAngleDeg: 232.51,
            leftElbowAngleDeg: 44.62,
            rightUpperArmAngleDeg: 79.30,
            rightElbowAngleDeg: 76.19,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 115.56,
            rightThighAngleDeg: 88.59,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -110.64,
            hipYOffset: -21.17,
            displacementX: -99.45,
            globalLeftUpperArmAngleDeg: 248
        },
        {
            // EXPANDED FRAME 181
            spineAngleDeg: -88.49,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 103.78,
            leftUpperArmAngleDeg: 231.70,
            leftElbowAngleDeg: 44.57,
            rightUpperArmAngleDeg: 78.71,
            rightElbowAngleDeg: 76.34,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 115.96,
            rightThighAngleDeg: 87.92,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -109.93,
            hipYOffset: -21.04,
            displacementX: -98.79,
            globalLeftUpperArmAngleDeg: 247
        },
        {
            // EXPANDED FRAME 182
            spineAngleDeg: -88.54,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 103.65,
            leftUpperArmAngleDeg: 230.89,
            leftElbowAngleDeg: 44.53,
            rightUpperArmAngleDeg: 78.12,
            rightElbowAngleDeg: 76.49,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 116.36,
            rightThighAngleDeg: 87.24,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -109.21,
            hipYOffset: -20.90,
            displacementX: -98.13,
            globalLeftUpperArmAngleDeg: 246
        },
        {
            // EXPANDED FRAME 183
            spineAngleDeg: -88.59,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 103.51,
            leftUpperArmAngleDeg: 230.08,
            leftElbowAngleDeg: 44.48,
            rightUpperArmAngleDeg: 77.53,
            rightElbowAngleDeg: 76.64,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 116.77,
            rightThighAngleDeg: 86.57,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -108.50,
            hipYOffset: -20.76,
            displacementX: -97.46,
            globalLeftUpperArmAngleDeg: 245
        },
        {
            // EXPANDED FRAME 184
            spineAngleDeg: -88.65,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 103.38,
            leftUpperArmAngleDeg: 229.27,
            leftElbowAngleDeg: 44.43,
            rightUpperArmAngleDeg: 76.95,
            rightElbowAngleDeg: 76.78,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 117.17,
            rightThighAngleDeg: 85.89,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -107.79,
            hipYOffset: -20.63,
            displacementX: -96.80,
            globalLeftUpperArmAngleDeg: 244
        },
        {
            // EXPANDED FRAME 185
            spineAngleDeg: -88.70,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 103.24,
            leftUpperArmAngleDeg: 228.46,
            leftElbowAngleDeg: 44.39,
            rightUpperArmAngleDeg: 76.36,
            rightElbowAngleDeg: 76.93,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 117.57,
            rightThighAngleDeg: 85.22,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -107.08,
            hipYOffset: -20.49,
            displacementX: -96.14,
            globalLeftUpperArmAngleDeg: 243
        },
        {
            // EXPANDED FRAME 186
            spineAngleDeg: -88.76,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 103.11,
            leftUpperArmAngleDeg: 227.65,
            leftElbowAngleDeg: 44.34,
            rightUpperArmAngleDeg: 75.77,
            rightElbowAngleDeg: 77.08,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 117.98,
            rightThighAngleDeg: 84.54,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -106.37,
            hipYOffset: -20.35,
            displacementX: -95.48,
            globalLeftUpperArmAngleDeg: 242
        },
        {
            // EXPANDED FRAME 187
            spineAngleDeg: -88.81,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 102.97,
            leftUpperArmAngleDeg: 226.84,
            leftElbowAngleDeg: 44.29,
            rightUpperArmAngleDeg: 75.18,
            rightElbowAngleDeg: 77.23,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 118.38,
            rightThighAngleDeg: 83.86,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -105.66,
            hipYOffset: -20.21,
            displacementX: -94.81,
            globalLeftUpperArmAngleDeg: 241
        },
        {
            // EXPANDED FRAME 188
            spineAngleDeg: -88.86,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 102.84,
            leftUpperArmAngleDeg: 226.03,
            leftElbowAngleDeg: 44.24,
            rightUpperArmAngleDeg: 74.59,
            rightElbowAngleDeg: 77.38,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 118.78,
            rightThighAngleDeg: 83.19,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -104.94,
            hipYOffset: -20.08,
            displacementX: -94.15,
            globalLeftUpperArmAngleDeg: 240
        },
        {
            // EXPANDED FRAME 189
            spineAngleDeg: -88.92,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 102.70,
            leftUpperArmAngleDeg: 225.22,
            leftElbowAngleDeg: 44.20,
            rightUpperArmAngleDeg: 74.01,
            rightElbowAngleDeg: 77.53,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 119.19,
            rightThighAngleDeg: 82.51,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -104.23,
            hipYOffset: -19.94,
            displacementX: -93.49,
            globalLeftUpperArmAngleDeg: 239
        },
        {
            // EXPANDED FRAME 190
            spineAngleDeg: -88.97,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 102.57,
            leftUpperArmAngleDeg: 224.41,
            leftElbowAngleDeg: 44.15,
            rightUpperArmAngleDeg: 73.42,
            rightElbowAngleDeg: 77.68,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 119.59,
            rightThighAngleDeg: 81.84,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -103.52,
            hipYOffset: -19.80,
            displacementX: -92.83,
            globalLeftUpperArmAngleDeg: 238
        },
        {
            // EXPANDED FRAME 191
            spineAngleDeg: -89.03,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 102.43,
            leftUpperArmAngleDeg: 223.59,
            leftElbowAngleDeg: 44.10,
            rightUpperArmAngleDeg: 72.83,
            rightElbowAngleDeg: 77.82,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 119.99,
            rightThighAngleDeg: 81.16,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -102.81,
            hipYOffset: -19.67,
            displacementX: -92.16,
            globalLeftUpperArmAngleDeg: 237
        },
        {
            // EXPANDED FRAME 192
            spineAngleDeg: -89.08,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 102.30,
            leftUpperArmAngleDeg: 222.78,
            leftElbowAngleDeg: 44.05,
            rightUpperArmAngleDeg: 72.24,
            rightElbowAngleDeg: 77.97,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 120.39,
            rightThighAngleDeg: 80.49,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -102.10,
            hipYOffset: -19.53,
            displacementX: -91.50,
            globalLeftUpperArmAngleDeg: 236
        },
        {
            // EXPANDED FRAME 193
            spineAngleDeg: -89.14,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 102.16,
            leftUpperArmAngleDeg: 221.97,
            leftElbowAngleDeg: 44.01,
            rightUpperArmAngleDeg: 71.66,
            rightElbowAngleDeg: 78.12,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 120.80,
            rightThighAngleDeg: 79.81,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -101.39,
            hipYOffset: -19.39,
            displacementX: -90.84,
            globalLeftUpperArmAngleDeg: 235
        },
        {
            // EXPANDED FRAME 194
            spineAngleDeg: -89.19,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 102.03,
            leftUpperArmAngleDeg: 221.16,
            leftElbowAngleDeg: 43.96,
            rightUpperArmAngleDeg: 71.07,
            rightElbowAngleDeg: 78.27,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 121.20,
            rightThighAngleDeg: 79.14,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -100.67,
            hipYOffset: -19.26,
            displacementX: -90.18,
            globalLeftUpperArmAngleDeg: 234
        },
        {
            // EXPANDED FRAME 195
            spineAngleDeg: -89.24,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 101.89,
            leftUpperArmAngleDeg: 220.35,
            leftElbowAngleDeg: 43.91,
            rightUpperArmAngleDeg: 70.48,
            rightElbowAngleDeg: 78.42,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 121.60,
            rightThighAngleDeg: 78.46,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -99.96,
            hipYOffset: -19.12,
            displacementX: -89.51,
            globalLeftUpperArmAngleDeg: 233
        },
        {
            // EXPANDED FRAME 196
            spineAngleDeg: -89.30,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 101.76,
            leftUpperArmAngleDeg: 219.54,
            leftElbowAngleDeg: 43.86,
            rightUpperArmAngleDeg: 69.89,
            rightElbowAngleDeg: 78.57,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 122.01,
            rightThighAngleDeg: 77.78,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -99.25,
            hipYOffset: -18.98,
            displacementX: -88.85,
            globalLeftUpperArmAngleDeg: 232
        },
        {
            // EXPANDED FRAME 197
            spineAngleDeg: -89.35,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 101.62,
            leftUpperArmAngleDeg: 218.73,
            leftElbowAngleDeg: 43.82,
            rightUpperArmAngleDeg: 69.30,
            rightElbowAngleDeg: 78.72,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 122.41,
            rightThighAngleDeg: 77.11,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -98.54,
            hipYOffset: -18.84,
            displacementX: -88.19,
            globalLeftUpperArmAngleDeg: 231
        },
        {
            // EXPANDED FRAME 198
            spineAngleDeg: -89.41,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 101.49,
            leftUpperArmAngleDeg: 217.92,
            leftElbowAngleDeg: 43.77,
            rightUpperArmAngleDeg: 68.72,
            rightElbowAngleDeg: 78.86,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 122.81,
            rightThighAngleDeg: 76.43,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -97.83,
            hipYOffset: -18.71,
            displacementX: -87.53,
            globalLeftUpperArmAngleDeg: 230
        },
        {
            // EXPANDED FRAME 199
            spineAngleDeg: -89.46,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 101.35,
            leftUpperArmAngleDeg: 217.11,
            leftElbowAngleDeg: 43.72,
            rightUpperArmAngleDeg: 68.13,
            rightElbowAngleDeg: 79.01,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 123.22,
            rightThighAngleDeg: 75.76,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -97.12,
            hipYOffset: -18.57,
            displacementX: -86.86,
            globalLeftUpperArmAngleDeg: 229
        },
        {
            // EXPANDED FRAME 200
            spineAngleDeg: -89.51,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 101.22,
            leftUpperArmAngleDeg: 216.30,
            leftElbowAngleDeg: 43.68,
            rightUpperArmAngleDeg: 67.54,
            rightElbowAngleDeg: 79.16,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 123.62,
            rightThighAngleDeg: 75.08,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -96.40,
            hipYOffset: -18.43,
            displacementX: -86.20,
            globalLeftUpperArmAngleDeg: 228
        },
        {
            // EXPANDED FRAME 201
            spineAngleDeg: -89.57,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 101.08,
            leftUpperArmAngleDeg: 215.49,
            leftElbowAngleDeg: 43.63,
            rightUpperArmAngleDeg: 66.95,
            rightElbowAngleDeg: 79.31,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 124.02,
            rightThighAngleDeg: 74.41,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -95.69,
            hipYOffset: -18.30,
            displacementX: -85.54,
            globalLeftUpperArmAngleDeg: 227
        },
        {
            // EXPANDED FRAME 202
            spineAngleDeg: -89.62,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.95,
            leftUpperArmAngleDeg: 214.68,
            leftElbowAngleDeg: 43.58,
            rightUpperArmAngleDeg: 66.36,
            rightElbowAngleDeg: 79.46,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 124.43,
            rightThighAngleDeg: 73.73,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -94.98,
            hipYOffset: -18.16,
            displacementX: -84.88,
            globalLeftUpperArmAngleDeg: 226
        },
        {
            // EXPANDED FRAME 203
            spineAngleDeg: -89.68,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.81,
            leftUpperArmAngleDeg: 213.86,
            leftElbowAngleDeg: 43.53,
            rightUpperArmAngleDeg: 65.78,
            rightElbowAngleDeg: 79.61,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 124.83,
            rightThighAngleDeg: 73.05,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -94.27,
            hipYOffset: -18.02,
            displacementX: -84.21,
            globalLeftUpperArmAngleDeg: 225
        },
        {
            // EXPANDED FRAME 204
            spineAngleDeg: -89.73,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.68,
            leftUpperArmAngleDeg: 213.05,
            leftElbowAngleDeg: 43.49,
            rightUpperArmAngleDeg: 65.19,
            rightElbowAngleDeg: 79.76,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 125.23,
            rightThighAngleDeg: 72.38,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -93.56,
            hipYOffset: -17.89,
            displacementX: -83.55,
            globalLeftUpperArmAngleDeg: 224
        },
        {
            // EXPANDED FRAME 205
            spineAngleDeg: -89.78,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.54,
            leftUpperArmAngleDeg: 212.24,
            leftElbowAngleDeg: 43.44,
            rightUpperArmAngleDeg: 64.60,
            rightElbowAngleDeg: 79.91,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 125.64,
            rightThighAngleDeg: 71.70,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -92.85,
            hipYOffset: -17.75,
            displacementX: -82.89,
            globalLeftUpperArmAngleDeg: 223
        },
        {
            // EXPANDED FRAME 206
            spineAngleDeg: -89.84,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.41,
            leftUpperArmAngleDeg: 211.43,
            leftElbowAngleDeg: 43.39,
            rightUpperArmAngleDeg: 64.01,
            rightElbowAngleDeg: 80.05,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 126.04,
            rightThighAngleDeg: 71.03,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -92.13,
            hipYOffset: -17.61,
            displacementX: -82.23,
            globalLeftUpperArmAngleDeg: 222
        },
        {
            // EXPANDED FRAME 207
            spineAngleDeg: -89.89,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.27,
            leftUpperArmAngleDeg: 210.62,
            leftElbowAngleDeg: 43.34,
            rightUpperArmAngleDeg: 63.43,
            rightElbowAngleDeg: 80.20,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 126.44,
            rightThighAngleDeg: 70.35,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -91.42,
            hipYOffset: -17.47,
            displacementX: -81.56,
            globalLeftUpperArmAngleDeg: 221
        },
        {
            // EXPANDED FRAME 208
            spineAngleDeg: -89.95,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.14,
            leftUpperArmAngleDeg: 209.81,
            leftElbowAngleDeg: 43.30,
            rightUpperArmAngleDeg: 62.84,
            rightElbowAngleDeg: 80.35,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 126.85,
            rightThighAngleDeg: 69.68,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.71,
            hipYOffset: -17.34,
            displacementX: -80.90,
            globalLeftUpperArmAngleDeg: 220
        },
        {
            // EXPANDED FRAME 209
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 209.00,
            leftElbowAngleDeg: 43.25,
            rightUpperArmAngleDeg: 62.25,
            rightElbowAngleDeg: 80.50,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 127.25,
            rightThighAngleDeg: 69.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -80.24,
            globalLeftUpperArmAngleDeg: 219
        },
        {
            // EXPANDED FRAME 210
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 210.00,
            leftElbowAngleDeg: 42.50,
            rightUpperArmAngleDeg: 62.50,
            rightElbowAngleDeg: 80.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 127.50,
            rightThighAngleDeg: 70.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -80.50,
            globalLeftUpperArmAngleDeg: 220
        },
        {
            // EXPANDED FRAME 211
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 211.00,
            leftElbowAngleDeg: 41.75,
            rightUpperArmAngleDeg: 62.75,
            rightElbowAngleDeg: 79.50,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 127.75,
            rightThighAngleDeg: 71.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -80.76,
            globalLeftUpperArmAngleDeg: 221
        },
        {
            // EXPANDED FRAME 212
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 212.00,
            leftElbowAngleDeg: 41.00,
            rightUpperArmAngleDeg: 63.00,
            rightElbowAngleDeg: 79.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 128.00,
            rightThighAngleDeg: 72.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -81.02,
            globalLeftUpperArmAngleDeg: 222
        },
        {
            // EXPANDED FRAME 213
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 213.00,
            leftElbowAngleDeg: 40.25,
            rightUpperArmAngleDeg: 63.25,
            rightElbowAngleDeg: 78.50,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 128.25,
            rightThighAngleDeg: 73.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -81.28,
            globalLeftUpperArmAngleDeg: 223
        },
        {
            // EXPANDED FRAME 214
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 214.00,
            leftElbowAngleDeg: 39.50,
            rightUpperArmAngleDeg: 63.50,
            rightElbowAngleDeg: 78.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 128.50,
            rightThighAngleDeg: 74.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -81.54,
            globalLeftUpperArmAngleDeg: 224
        },
        {
            // EXPANDED FRAME 215
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 215.00,
            leftElbowAngleDeg: 38.75,
            rightUpperArmAngleDeg: 63.75,
            rightElbowAngleDeg: 77.50,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 128.75,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -81.80,
            globalLeftUpperArmAngleDeg: 225
        },
        {
            // EXPANDED FRAME 216
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 216.00,
            leftElbowAngleDeg: 38.00,
            rightUpperArmAngleDeg: 64.00,
            rightElbowAngleDeg: 77.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 129.00,
            rightThighAngleDeg: 76.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -82.06,
            globalLeftUpperArmAngleDeg: 226
        },
        {
            // EXPANDED FRAME 217
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 217.00,
            leftElbowAngleDeg: 37.25,
            rightUpperArmAngleDeg: 64.25,
            rightElbowAngleDeg: 76.50,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 129.25,
            rightThighAngleDeg: 77.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -82.32,
            globalLeftUpperArmAngleDeg: 227
        },
        {
            // EXPANDED FRAME 218
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 218.00,
            leftElbowAngleDeg: 36.50,
            rightUpperArmAngleDeg: 64.50,
            rightElbowAngleDeg: 76.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 129.50,
            rightThighAngleDeg: 78.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -82.58,
            globalLeftUpperArmAngleDeg: 228
        },
        {
            // EXPANDED FRAME 219
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 219.00,
            leftElbowAngleDeg: 35.75,
            rightUpperArmAngleDeg: 64.75,
            rightElbowAngleDeg: 75.50,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 129.75,
            rightThighAngleDeg: 79.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -82.84,
            globalLeftUpperArmAngleDeg: 229
        },
        {
            // EXPANDED FRAME 220
            spineAngleDeg: -90.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 220.00,
            leftElbowAngleDeg: 35.00,
            rightUpperArmAngleDeg: 65.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 130.00,
            rightThighAngleDeg: 80.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -17.20,
            displacementX: -83.10,
            globalLeftUpperArmAngleDeg: 230
        },
        {
            // EXPANDED FRAME 221
            spineAngleDeg: -89.33,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 101.67,
            leftUpperArmAngleDeg: 216.67,
            leftElbowAngleDeg: 38.33,
            rightUpperArmAngleDeg: 66.67,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 125.00,
            rightThighAngleDeg: 86.67,
            leftKneeAngleDeg: -23.33,
            rightKneeAngleDeg: -101.67,
            hipYOffset: -17.20,
            displacementX: -86.50,
            globalLeftUpperArmAngleDeg: 229
        },
        {
            // EXPANDED FRAME 222
            spineAngleDeg: -88.33,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 104.17,
            leftUpperArmAngleDeg: 211.67,
            leftElbowAngleDeg: 43.33,
            rightUpperArmAngleDeg: 69.17,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 117.50,
            rightThighAngleDeg: 96.67,
            leftKneeAngleDeg: -20.83,
            rightKneeAngleDeg: -119.17,
            hipYOffset: -17.20,
            displacementX: -91.47,
            globalLeftUpperArmAngleDeg: 228
        },
        {
            // EXPANDED FRAME 223
            spineAngleDeg: -88.16,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 104.59,
            leftUpperArmAngleDeg: 210.33,
            leftElbowAngleDeg: 44.16,
            rightUpperArmAngleDeg: 70.59,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 116.25,
            rightThighAngleDeg: 97.34,
            leftKneeAngleDeg: -20.91,
            rightKneeAngleDeg: -121.09,
            hipYOffset: -17.60,
            displacementX: -93.25,
            globalLeftUpperArmAngleDeg: 227
        },
        {
            // EXPANDED FRAME 224
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 209.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 72.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 115.00,
            rightThighAngleDeg: 98.00,
            leftKneeAngleDeg: -21.00,
            rightKneeAngleDeg: -123.00,
            hipYOffset: -18.00,
            displacementX: -95.02,
            globalLeftUpperArmAngleDeg: 226
        },
        {
            // EXPANDED FRAME 225
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 208.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 74.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 115.00,
            rightThighAngleDeg: 96.00,
            leftKneeAngleDeg: -22.00,
            rightKneeAngleDeg: -121.00,
            hipYOffset: -18.80,
            displacementX: -96.94,
            globalLeftUpperArmAngleDeg: 225
        },
        {
            // EXPANDED FRAME 226
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 206.50,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 77.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 115.00,
            rightThighAngleDeg: 93.00,
            leftKneeAngleDeg: -23.50,
            rightKneeAngleDeg: -118.00,
            hipYOffset: -20.00,
            displacementX: -99.70,
            globalLeftUpperArmAngleDeg: 224
        },
        {
            // EXPANDED FRAME 227
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 205.50,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 79.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 115.00,
            rightThighAngleDeg: 91.00,
            leftKneeAngleDeg: -24.50,
            rightKneeAngleDeg: -116.00,
            hipYOffset: -20.80,
            displacementX: -101.50,
            globalLeftUpperArmAngleDeg: 223
        },
        {
            // EXPANDED FRAME 228
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 204.75,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 80.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 114.66,
            rightThighAngleDeg: 91.00,
            leftKneeAngleDeg: -24.75,
            rightKneeAngleDeg: -115.66,
            hipYOffset: -21.13,
            displacementX: -102.25,
            globalLeftUpperArmAngleDeg: 222
        },
        {
            // EXPANDED FRAME 229
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 204.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 81.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 114.33,
            rightThighAngleDeg: 91.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -115.33,
            hipYOffset: -21.47,
            displacementX: -102.99,
            globalLeftUpperArmAngleDeg: 221
        },
        {
            // EXPANDED FRAME 230
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 203.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 82.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 113.67,
            rightThighAngleDeg: 92.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -115.67,
            hipYOffset: -21.73,
            displacementX: -103.57,
            globalLeftUpperArmAngleDeg: 220
        },
        {
            // EXPANDED FRAME 231
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 202.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 83.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 113.00,
            rightThighAngleDeg: 93.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.00,
            hipYOffset: -22.00,
            displacementX: -104.16,
            globalLeftUpperArmAngleDeg: 219
        },
        {
            // EXPANDED FRAME 232
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 201.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 218
        },
        {
            // EXPANDED FRAME 233
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 202.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 219
        },
        {
            // EXPANDED FRAME 234
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 203.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 220
        },
        {
            // EXPANDED FRAME 235
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 204.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 221
        },
        {
            // EXPANDED FRAME 236
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 205.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 222
        },
        {
            // EXPANDED FRAME 237
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 206.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 223
        },
        {
            // EXPANDED FRAME 238
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 207.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 224
        },
        {
            // EXPANDED FRAME 239
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 208.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 225
        },
        {
            // EXPANDED FRAME 240
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 209.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 226
        },
        {
            // EXPANDED FRAME 241
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 210.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 227
        },
        {
            // EXPANDED FRAME 242
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 211.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 228
        },
        {
            // EXPANDED FRAME 243
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 212.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 229
        },
        {
            // EXPANDED FRAME 244
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 213.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 230
        },
        {
            // EXPANDED FRAME 245
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 214.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 231
        },
        {
            // EXPANDED FRAME 246
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 215.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 232
        },
        {
            // EXPANDED FRAME 247
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 216.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 233
        },
        {
            // EXPANDED FRAME 248
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 217.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 234
        },
        {
            // EXPANDED FRAME 249
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 218.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 235
        },
        {
            // EXPANDED FRAME 250
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 219.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 236
        },
        {
            // EXPANDED FRAME 251
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 220.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 237
        },
        {
            // EXPANDED FRAME 252
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 221.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 238
        },
        {
            // EXPANDED FRAME 253
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 222.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 239
        },
        {
            // EXPANDED FRAME 254
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 223.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 240
        },
        {
            // EXPANDED FRAME 255
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 224.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 241
        },
        {
            // EXPANDED FRAME 256
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 225.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 242
        },
        {
            // EXPANDED FRAME 257
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 226.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 243
        },
        {
            // EXPANDED FRAME 258
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 227.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 244
        },
        {
            // EXPANDED FRAME 259
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 228.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 245
        },
        {
            // EXPANDED FRAME 260
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 229.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 246
        },
        {
            // EXPANDED FRAME 261
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 230.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 247
        },
        {
            // EXPANDED FRAME 262
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 231.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 248
        },
        {
            // EXPANDED FRAME 263
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 232.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 249
        },
        {
            // EXPANDED FRAME 264
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 233.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 250
        },
        {
            // EXPANDED FRAME 265
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 234.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 251
        },
        {
            // EXPANDED FRAME 266
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 235.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 252
        },
        {
            // EXPANDED FRAME 267
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 236.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 253
        },
        {
            // EXPANDED FRAME 268
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 237.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 254
        },
        {
            // EXPANDED FRAME 269
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 238.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 255
        },
        {
            // EXPANDED FRAME 270
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 239.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 256
        },
        {
            // EXPANDED FRAME 271
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 240.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.33,
            rightThighAngleDeg: 94.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.33,
            hipYOffset: -22.27,
            displacementX: -104.75,
            globalLeftUpperArmAngleDeg: 257
        },
        {
            // EXPANDED FRAME 272
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 239.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.03,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.31,
            rightThighAngleDeg: 94.03,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.34,
            hipYOffset: -22.28,
            displacementX: -104.76,
            globalLeftUpperArmAngleDeg: 256
        },
        {
            // EXPANDED FRAME 273
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 238.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.05,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.30,
            rightThighAngleDeg: 94.05,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.35,
            hipYOffset: -22.28,
            displacementX: -104.78,
            globalLeftUpperArmAngleDeg: 255
        },
        {
            // EXPANDED FRAME 274
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 237.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.08,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.28,
            rightThighAngleDeg: 94.08,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.36,
            hipYOffset: -22.29,
            displacementX: -104.79,
            globalLeftUpperArmAngleDeg: 254
        },
        {
            // EXPANDED FRAME 275
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 236.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.10,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.26,
            rightThighAngleDeg: 94.10,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.36,
            hipYOffset: -22.30,
            displacementX: -104.81,
            globalLeftUpperArmAngleDeg: 253
        },
        {
            // EXPANDED FRAME 276
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 235.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.13,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.25,
            rightThighAngleDeg: 94.13,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.37,
            hipYOffset: -22.30,
            displacementX: -104.82,
            globalLeftUpperArmAngleDeg: 252
        },
        {
            // EXPANDED FRAME 277
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 234.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.15,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.23,
            rightThighAngleDeg: 94.15,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.38,
            hipYOffset: -22.31,
            displacementX: -104.84,
            globalLeftUpperArmAngleDeg: 251
        },
        {
            // EXPANDED FRAME 278
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 233.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.17,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.21,
            rightThighAngleDeg: 94.17,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.39,
            hipYOffset: -22.32,
            displacementX: -104.85,
            globalLeftUpperArmAngleDeg: 250
        },
        {
            // EXPANDED FRAME 279
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 232.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.20,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.20,
            rightThighAngleDeg: 94.20,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.40,
            hipYOffset: -22.32,
            displacementX: -104.87,
            globalLeftUpperArmAngleDeg: 249
        },
        {
            // EXPANDED FRAME 280
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 231.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.22,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.18,
            rightThighAngleDeg: 94.22,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.41,
            hipYOffset: -22.33,
            displacementX: -104.88,
            globalLeftUpperArmAngleDeg: 248
        },
        {
            // EXPANDED FRAME 281
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 230.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.25,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.16,
            rightThighAngleDeg: 94.25,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.41,
            hipYOffset: -22.34,
            displacementX: -104.89,
            globalLeftUpperArmAngleDeg: 247
        },
        {
            // EXPANDED FRAME 282
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 229.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.28,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.15,
            rightThighAngleDeg: 94.28,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.42,
            hipYOffset: -22.34,
            displacementX: -104.91,
            globalLeftUpperArmAngleDeg: 246
        },
        {
            // EXPANDED FRAME 283
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 228.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.30,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.13,
            rightThighAngleDeg: 94.30,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.43,
            hipYOffset: -22.35,
            displacementX: -104.92,
            globalLeftUpperArmAngleDeg: 245
        },
        {
            // EXPANDED FRAME 284
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 227.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.33,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.12,
            rightThighAngleDeg: 94.33,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.44,
            hipYOffset: -22.35,
            displacementX: -104.94,
            globalLeftUpperArmAngleDeg: 244
        },
        {
            // EXPANDED FRAME 285
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 226.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.35,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.10,
            rightThighAngleDeg: 94.35,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.45,
            hipYOffset: -22.36,
            displacementX: -104.95,
            globalLeftUpperArmAngleDeg: 243
        },
        {
            // EXPANDED FRAME 286
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 225.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.38,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.08,
            rightThighAngleDeg: 94.38,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.46,
            hipYOffset: -22.37,
            displacementX: -104.97,
            globalLeftUpperArmAngleDeg: 242
        },
        {
            // EXPANDED FRAME 287
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 224.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.40,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.07,
            rightThighAngleDeg: 94.40,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.47,
            hipYOffset: -22.37,
            displacementX: -104.98,
            globalLeftUpperArmAngleDeg: 241
        },
        {
            // EXPANDED FRAME 288
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 223.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.42,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.05,
            rightThighAngleDeg: 94.42,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.47,
            hipYOffset: -22.38,
            displacementX: -105.00,
            globalLeftUpperArmAngleDeg: 240
        },
        {
            // EXPANDED FRAME 289
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 222.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.45,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.03,
            rightThighAngleDeg: 94.45,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.48,
            hipYOffset: -22.39,
            displacementX: -105.01,
            globalLeftUpperArmAngleDeg: 239
        },
        {
            // EXPANDED FRAME 290
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 221.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.47,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.02,
            rightThighAngleDeg: 94.47,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.49,
            hipYOffset: -22.39,
            displacementX: -105.03,
            globalLeftUpperArmAngleDeg: 238
        },
        {
            // EXPANDED FRAME 291
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 220.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 112.00,
            rightThighAngleDeg: 94.50,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.50,
            hipYOffset: -22.40,
            displacementX: -105.04,
            globalLeftUpperArmAngleDeg: 237
        },
        {
            // EXPANDED FRAME 292
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 219.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.53,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.98,
            rightThighAngleDeg: 94.53,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.51,
            hipYOffset: -22.41,
            displacementX: -105.05,
            globalLeftUpperArmAngleDeg: 236
        },
        {
            // EXPANDED FRAME 293
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 218.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.55,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.97,
            rightThighAngleDeg: 94.55,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.52,
            hipYOffset: -22.41,
            displacementX: -105.07,
            globalLeftUpperArmAngleDeg: 235
        },
        {
            // EXPANDED FRAME 294
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 217.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.58,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.95,
            rightThighAngleDeg: 94.58,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.53,
            hipYOffset: -22.42,
            displacementX: -105.08,
            globalLeftUpperArmAngleDeg: 234
        },
        {
            // EXPANDED FRAME 295
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 216.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.60,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.93,
            rightThighAngleDeg: 94.60,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.53,
            hipYOffset: -22.43,
            displacementX: -105.10,
            globalLeftUpperArmAngleDeg: 233
        },
        {
            // EXPANDED FRAME 296
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 215.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.63,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.92,
            rightThighAngleDeg: 94.63,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.54,
            hipYOffset: -22.43,
            displacementX: -105.11,
            globalLeftUpperArmAngleDeg: 232
        },
        {
            // EXPANDED FRAME 297
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 214.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.65,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.90,
            rightThighAngleDeg: 94.65,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.55,
            hipYOffset: -22.44,
            displacementX: -105.13,
            globalLeftUpperArmAngleDeg: 231
        },
        {
            // EXPANDED FRAME 298
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 213.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.67,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.88,
            rightThighAngleDeg: 94.67,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.56,
            hipYOffset: -22.45,
            displacementX: -105.14,
            globalLeftUpperArmAngleDeg: 230
        },
        {
            // EXPANDED FRAME 299
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 212.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.70,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.87,
            rightThighAngleDeg: 94.70,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.57,
            hipYOffset: -22.45,
            displacementX: -105.16,
            globalLeftUpperArmAngleDeg: 229
        },
        {
            // EXPANDED FRAME 300
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 211.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.72,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.85,
            rightThighAngleDeg: 94.72,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.58,
            hipYOffset: -22.46,
            displacementX: -105.17,
            globalLeftUpperArmAngleDeg: 228
        },
        {
            // EXPANDED FRAME 301
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 210.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.75,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.84,
            rightThighAngleDeg: 94.75,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.59,
            hipYOffset: -22.46,
            displacementX: -105.19,
            globalLeftUpperArmAngleDeg: 227
        },
        {
            // EXPANDED FRAME 302
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 209.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.78,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.82,
            rightThighAngleDeg: 94.78,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.59,
            hipYOffset: -22.47,
            displacementX: -105.20,
            globalLeftUpperArmAngleDeg: 226
        },
        {
            // EXPANDED FRAME 303
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 208.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.80,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.80,
            rightThighAngleDeg: 94.80,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.60,
            hipYOffset: -22.48,
            displacementX: -105.21,
            globalLeftUpperArmAngleDeg: 225
        },
        {
            // EXPANDED FRAME 304
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 207.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.83,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.79,
            rightThighAngleDeg: 94.83,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.61,
            hipYOffset: -22.48,
            displacementX: -105.23,
            globalLeftUpperArmAngleDeg: 224
        },
        {
            // EXPANDED FRAME 305
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 206.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.85,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.77,
            rightThighAngleDeg: 94.85,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.62,
            hipYOffset: -22.49,
            displacementX: -105.24,
            globalLeftUpperArmAngleDeg: 223
        },
        {
            // EXPANDED FRAME 306
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 205.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.88,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.75,
            rightThighAngleDeg: 94.88,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.63,
            hipYOffset: -22.50,
            displacementX: -105.26,
            globalLeftUpperArmAngleDeg: 222
        },
        {
            // EXPANDED FRAME 307
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 204.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.90,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.74,
            rightThighAngleDeg: 94.90,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.64,
            hipYOffset: -22.50,
            displacementX: -105.27,
            globalLeftUpperArmAngleDeg: 221
        },
        {
            // EXPANDED FRAME 308
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 203.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.92,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.72,
            rightThighAngleDeg: 94.92,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.64,
            hipYOffset: -22.51,
            displacementX: -105.29,
            globalLeftUpperArmAngleDeg: 220
        },
        {
            // EXPANDED FRAME 309
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 202.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.95,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.70,
            rightThighAngleDeg: 94.95,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.65,
            hipYOffset: -22.52,
            displacementX: -105.30,
            globalLeftUpperArmAngleDeg: 219
        },
        {
            // EXPANDED FRAME 310
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 201.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 84.97,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.69,
            rightThighAngleDeg: 94.97,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.66,
            hipYOffset: -22.52,
            displacementX: -105.32,
            globalLeftUpperArmAngleDeg: 218
        },
        {
            // EXPANDED FRAME 311
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 200.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 85.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.67,
            rightThighAngleDeg: 95.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.67,
            hipYOffset: -22.53,
            displacementX: -105.33,
            globalLeftUpperArmAngleDeg: 217
        },
        {
            // EXPANDED FRAME 312
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 199.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 86.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 111.00,
            rightThighAngleDeg: 96.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -117.00,
            hipYOffset: -22.80,
            displacementX: -105.92,
            globalLeftUpperArmAngleDeg: 216
        },
        {
            // EXPANDED FRAME 313
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 198.00,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 87.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 110.33,
            rightThighAngleDeg: 97.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -117.33,
            hipYOffset: -23.07,
            displacementX: -106.51,
            globalLeftUpperArmAngleDeg: 215
        },
        {
            // EXPANDED FRAME 314
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 196.50,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 88.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 109.33,
            rightThighAngleDeg: 98.50,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -117.83,
            hipYOffset: -23.47,
            displacementX: -107.37,
            globalLeftUpperArmAngleDeg: 214
        },
        {
            // EXPANDED FRAME 315
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 195.50,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 89.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 108.67,
            rightThighAngleDeg: 99.50,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -118.17,
            hipYOffset: -23.73,
            displacementX: -107.95,
            globalLeftUpperArmAngleDeg: 213
        },
        {
            // EXPANDED FRAME 316
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 194.50,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 90.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 108.00,
            rightThighAngleDeg: 100.50,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -118.50,
            hipYOffset: -24.00,
            displacementX: -108.52,
            globalLeftUpperArmAngleDeg: 212
        },
        {
            // EXPANDED FRAME 317
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 193.50,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 91.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 107.33,
            rightThighAngleDeg: 101.50,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -118.83,
            hipYOffset: -24.27,
            displacementX: -109.09,
            globalLeftUpperArmAngleDeg: 211
        },
        {
            // EXPANDED FRAME 318
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 192.50,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 92.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 106.67,
            rightThighAngleDeg: 102.50,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -119.17,
            hipYOffset: -24.53,
            displacementX: -109.67,
            globalLeftUpperArmAngleDeg: 210
        },
        {
            // EXPANDED FRAME 319
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 191.50,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 93.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 106.00,
            rightThighAngleDeg: 103.50,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -119.50,
            hipYOffset: -24.80,
            displacementX: -110.24,
            globalLeftUpperArmAngleDeg: 209
        },
        {
            // EXPANDED FRAME 320
            spineAngleDeg: -88.00,
            shoulderJointDist: 50.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 190.50,
            leftElbowAngleDeg: 45.00,
            rightUpperArmAngleDeg: 94.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 105.33,
            rightThighAngleDeg: 104.50,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -119.83,
            hipYOffset: -25.07,
            displacementX: -110.81,
            globalLeftUpperArmAngleDeg: 208
        },
        {
            // EXPANDED FRAME 321
            spineAngleDeg: -88.00,
            shoulderJointDist: 49.69,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 189.75,
            leftElbowAngleDeg: 45.19,
            rightUpperArmAngleDeg: 94.94,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 105.08,
            rightThighAngleDeg: 104.96,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -119.91,
            hipYOffset: -25.14,
            displacementX: -111.06,
            globalLeftUpperArmAngleDeg: 207
        },
        {
            // EXPANDED FRAME 322
            spineAngleDeg: -88.00,
            shoulderJointDist: 49.38,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 189.00,
            leftElbowAngleDeg: 45.38,
            rightUpperArmAngleDeg: 95.38,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 104.83,
            rightThighAngleDeg: 105.42,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.22,
            displacementX: -111.30,
            globalLeftUpperArmAngleDeg: 206
        },
        {
            // EXPANDED FRAME 323
            spineAngleDeg: -88.00,
            shoulderJointDist: 48.75,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 188.00,
            leftElbowAngleDeg: 45.75,
            rightUpperArmAngleDeg: 95.75,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 104.65,
            rightThighAngleDeg: 105.85,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.25,
            displacementX: -111.50,
            globalLeftUpperArmAngleDeg: 205
        },
        {
            // EXPANDED FRAME 324
            spineAngleDeg: -88.00,
            shoulderJointDist: 48.13,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 187.00,
            leftElbowAngleDeg: 46.13,
            rightUpperArmAngleDeg: 96.13,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 104.47,
            rightThighAngleDeg: 106.28,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.27,
            displacementX: -111.70,
            globalLeftUpperArmAngleDeg: 204
        },
        {
            // EXPANDED FRAME 325
            spineAngleDeg: -88.00,
            shoulderJointDist: 47.50,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 186.00,
            leftElbowAngleDeg: 46.50,
            rightUpperArmAngleDeg: 96.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 104.30,
            rightThighAngleDeg: 106.70,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.30,
            displacementX: -111.90,
            globalLeftUpperArmAngleDeg: 203
        },
        {
            // EXPANDED FRAME 326
            spineAngleDeg: -88.00,
            shoulderJointDist: 46.88,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 185.00,
            leftElbowAngleDeg: 46.88,
            rightUpperArmAngleDeg: 96.88,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 104.13,
            rightThighAngleDeg: 107.13,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.32,
            displacementX: -112.10,
            globalLeftUpperArmAngleDeg: 202
        },
        {
            // EXPANDED FRAME 327
            spineAngleDeg: -88.00,
            shoulderJointDist: 46.25,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 184.00,
            leftElbowAngleDeg: 47.25,
            rightUpperArmAngleDeg: 97.25,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 103.95,
            rightThighAngleDeg: 107.55,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.35,
            displacementX: -112.30,
            globalLeftUpperArmAngleDeg: 201
        },
        {
            // EXPANDED FRAME 328
            spineAngleDeg: -88.00,
            shoulderJointDist: 45.63,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 183.00,
            leftElbowAngleDeg: 47.63,
            rightUpperArmAngleDeg: 97.63,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 103.78,
            rightThighAngleDeg: 107.97,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.38,
            displacementX: -112.50,
            globalLeftUpperArmAngleDeg: 200
        },
        {
            // EXPANDED FRAME 329
            spineAngleDeg: -88.00,
            shoulderJointDist: 45.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 182.00,
            leftElbowAngleDeg: 48.00,
            rightUpperArmAngleDeg: 98.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 103.60,
            rightThighAngleDeg: 108.40,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.40,
            displacementX: -112.70,
            globalLeftUpperArmAngleDeg: 199
        },
        {
            // EXPANDED FRAME 330
            spineAngleDeg: -88.00,
            shoulderJointDist: 44.38,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 181.00,
            leftElbowAngleDeg: 48.38,
            rightUpperArmAngleDeg: 98.38,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 103.42,
            rightThighAngleDeg: 108.83,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.43,
            displacementX: -112.90,
            globalLeftUpperArmAngleDeg: 198
        },
        {
            // EXPANDED FRAME 331
            spineAngleDeg: -88.00,
            shoulderJointDist: 43.75,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 180.00,
            leftElbowAngleDeg: 48.75,
            rightUpperArmAngleDeg: 98.75,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 103.25,
            rightThighAngleDeg: 109.25,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.45,
            displacementX: -113.10,
            globalLeftUpperArmAngleDeg: 197
        },
        {
            // EXPANDED FRAME 332
            spineAngleDeg: -88.00,
            shoulderJointDist: 43.13,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 179.00,
            leftElbowAngleDeg: 49.13,
            rightUpperArmAngleDeg: 99.13,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 103.08,
            rightThighAngleDeg: 109.67,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.47,
            displacementX: -113.30,
            globalLeftUpperArmAngleDeg: 196
        },
        {
            // EXPANDED FRAME 333
            spineAngleDeg: -88.00,
            shoulderJointDist: 42.50,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 178.00,
            leftElbowAngleDeg: 49.50,
            rightUpperArmAngleDeg: 99.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 102.90,
            rightThighAngleDeg: 110.10,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.50,
            displacementX: -113.50,
            globalLeftUpperArmAngleDeg: 195
        },
        {
            // EXPANDED FRAME 334
            spineAngleDeg: -88.00,
            shoulderJointDist: 41.88,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 177.00,
            leftElbowAngleDeg: 49.88,
            rightUpperArmAngleDeg: 99.88,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 102.72,
            rightThighAngleDeg: 110.53,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.52,
            displacementX: -113.70,
            globalLeftUpperArmAngleDeg: 194
        },
        {
            // EXPANDED FRAME 335
            spineAngleDeg: -88.00,
            shoulderJointDist: 41.25,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 176.00,
            leftElbowAngleDeg: 50.25,
            rightUpperArmAngleDeg: 100.25,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 102.55,
            rightThighAngleDeg: 110.95,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.55,
            displacementX: -113.90,
            globalLeftUpperArmAngleDeg: 193
        },
        {
            // EXPANDED FRAME 336
            spineAngleDeg: -88.00,
            shoulderJointDist: 40.63,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 175.00,
            leftElbowAngleDeg: 50.63,
            rightUpperArmAngleDeg: 100.63,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 102.38,
            rightThighAngleDeg: 111.38,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.57,
            displacementX: -114.10,
            globalLeftUpperArmAngleDeg: 192
        },
        {
            // EXPANDED FRAME 337
            spineAngleDeg: -88.00,
            shoulderJointDist: 40.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 174.00,
            leftElbowAngleDeg: 51.00,
            rightUpperArmAngleDeg: 101.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 102.20,
            rightThighAngleDeg: 111.80,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.60,
            displacementX: -114.30,
            globalLeftUpperArmAngleDeg: 191
        },
        {
            // EXPANDED FRAME 338
            spineAngleDeg: -88.00,
            shoulderJointDist: 39.38,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 173.00,
            leftElbowAngleDeg: 51.38,
            rightUpperArmAngleDeg: 101.38,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 102.03,
            rightThighAngleDeg: 112.22,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.63,
            displacementX: -114.50,
            globalLeftUpperArmAngleDeg: 190
        },
        {
            // EXPANDED FRAME 339
            spineAngleDeg: -88.00,
            shoulderJointDist: 38.75,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 172.00,
            leftElbowAngleDeg: 51.75,
            rightUpperArmAngleDeg: 101.75,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 101.85,
            rightThighAngleDeg: 112.65,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.65,
            displacementX: -114.70,
            globalLeftUpperArmAngleDeg: 189
        },
        {
            // EXPANDED FRAME 340
            spineAngleDeg: -88.00,
            shoulderJointDist: 38.13,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 171.00,
            leftElbowAngleDeg: 52.13,
            rightUpperArmAngleDeg: 102.13,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 101.67,
            rightThighAngleDeg: 113.08,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.68,
            displacementX: -114.90,
            globalLeftUpperArmAngleDeg: 188
        },
        {
            // EXPANDED FRAME 341
            spineAngleDeg: -88.00,
            shoulderJointDist: 37.50,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 170.00,
            leftElbowAngleDeg: 52.50,
            rightUpperArmAngleDeg: 102.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 101.50,
            rightThighAngleDeg: 113.50,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.70,
            displacementX: -115.10,
            globalLeftUpperArmAngleDeg: 187
        },
        {
            // EXPANDED FRAME 342
            spineAngleDeg: -88.00,
            shoulderJointDist: 36.88,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 169.00,
            leftElbowAngleDeg: 52.88,
            rightUpperArmAngleDeg: 102.88,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 101.33,
            rightThighAngleDeg: 113.92,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.72,
            displacementX: -115.30,
            globalLeftUpperArmAngleDeg: 186
        },
        {
            // EXPANDED FRAME 343
            spineAngleDeg: -88.00,
            shoulderJointDist: 36.25,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 168.00,
            leftElbowAngleDeg: 53.25,
            rightUpperArmAngleDeg: 103.25,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 101.15,
            rightThighAngleDeg: 114.35,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.75,
            displacementX: -115.50,
            globalLeftUpperArmAngleDeg: 185
        },
        {
            // EXPANDED FRAME 344
            spineAngleDeg: -88.00,
            shoulderJointDist: 35.63,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 167.00,
            leftElbowAngleDeg: 53.63,
            rightUpperArmAngleDeg: 103.63,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 100.97,
            rightThighAngleDeg: 114.78,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.77,
            displacementX: -115.70,
            globalLeftUpperArmAngleDeg: 184
        },
        {
            // EXPANDED FRAME 345
            spineAngleDeg: -88.00,
            shoulderJointDist: 35.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 166.00,
            leftElbowAngleDeg: 54.00,
            rightUpperArmAngleDeg: 104.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 100.80,
            rightThighAngleDeg: 115.20,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.80,
            displacementX: -115.90,
            globalLeftUpperArmAngleDeg: 183
        },
        {
            // EXPANDED FRAME 346
            spineAngleDeg: -88.00,
            shoulderJointDist: 34.38,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 165.00,
            leftElbowAngleDeg: 54.38,
            rightUpperArmAngleDeg: 104.38,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 100.63,
            rightThighAngleDeg: 115.63,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.82,
            displacementX: -116.10,
            globalLeftUpperArmAngleDeg: 182
        },
        {
            // EXPANDED FRAME 347
            spineAngleDeg: -88.00,
            shoulderJointDist: 33.75,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 164.00,
            leftElbowAngleDeg: 54.75,
            rightUpperArmAngleDeg: 104.75,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 100.45,
            rightThighAngleDeg: 116.05,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.85,
            displacementX: -116.30,
            globalLeftUpperArmAngleDeg: 181
        },
        {
            // EXPANDED FRAME 348
            spineAngleDeg: -88.00,
            shoulderJointDist: 33.13,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 163.00,
            leftElbowAngleDeg: 55.13,
            rightUpperArmAngleDeg: 105.13,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 100.28,
            rightThighAngleDeg: 116.47,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.88,
            displacementX: -116.50,
            globalLeftUpperArmAngleDeg: 180
        },
        {
            // EXPANDED FRAME 349
            spineAngleDeg: -88.00,
            shoulderJointDist: 32.50,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 162.00,
            leftElbowAngleDeg: 55.50,
            rightUpperArmAngleDeg: 105.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 100.10,
            rightThighAngleDeg: 116.90,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.90,
            displacementX: -116.70,
            globalLeftUpperArmAngleDeg: 179
        },
        {
            // EXPANDED FRAME 350
            spineAngleDeg: -88.00,
            shoulderJointDist: 31.88,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 161.00,
            leftElbowAngleDeg: 55.88,
            rightUpperArmAngleDeg: 105.88,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 99.92,
            rightThighAngleDeg: 117.33,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.93,
            displacementX: -116.90,
            globalLeftUpperArmAngleDeg: 178
        },
        {
            // EXPANDED FRAME 351
            spineAngleDeg: -88.00,
            shoulderJointDist: 31.25,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 160.00,
            leftElbowAngleDeg: 56.25,
            rightUpperArmAngleDeg: 106.25,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 99.75,
            rightThighAngleDeg: 117.75,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.95,
            displacementX: -117.10,
            globalLeftUpperArmAngleDeg: 177
        },
        {
            // EXPANDED FRAME 352
            spineAngleDeg: -88.00,
            shoulderJointDist: 30.63,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 159.00,
            leftElbowAngleDeg: 56.63,
            rightUpperArmAngleDeg: 106.63,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 99.58,
            rightThighAngleDeg: 118.17,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -25.97,
            displacementX: -117.30,
            globalLeftUpperArmAngleDeg: 176
        },
        {
            // EXPANDED FRAME 353
            spineAngleDeg: -88.00,
            shoulderJointDist: 30.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 158.00,
            leftElbowAngleDeg: 57.00,
            rightUpperArmAngleDeg: 107.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 99.40,
            rightThighAngleDeg: 118.60,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.00,
            displacementX: -117.50,
            globalLeftUpperArmAngleDeg: 175
        },
        {
            // EXPANDED FRAME 354
            spineAngleDeg: -88.00,
            shoulderJointDist: 29.38,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 157.00,
            leftElbowAngleDeg: 57.38,
            rightUpperArmAngleDeg: 107.38,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 99.22,
            rightThighAngleDeg: 119.03,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.02,
            displacementX: -117.70,
            globalLeftUpperArmAngleDeg: 174
        },
        {
            // EXPANDED FRAME 355
            spineAngleDeg: -88.00,
            shoulderJointDist: 28.75,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 156.00,
            leftElbowAngleDeg: 57.75,
            rightUpperArmAngleDeg: 107.75,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 99.05,
            rightThighAngleDeg: 119.45,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.05,
            displacementX: -117.90,
            globalLeftUpperArmAngleDeg: 173
        },
        {
            // EXPANDED FRAME 356
            spineAngleDeg: -88.00,
            shoulderJointDist: 28.13,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 155.00,
            leftElbowAngleDeg: 58.13,
            rightUpperArmAngleDeg: 108.13,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 98.88,
            rightThighAngleDeg: 119.88,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.07,
            displacementX: -118.10,
            globalLeftUpperArmAngleDeg: 172
        },
        {
            // EXPANDED FRAME 357
            spineAngleDeg: -88.00,
            shoulderJointDist: 27.50,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 154.00,
            leftElbowAngleDeg: 58.50,
            rightUpperArmAngleDeg: 108.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 98.70,
            rightThighAngleDeg: 120.30,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.10,
            displacementX: -118.30,
            globalLeftUpperArmAngleDeg: 171
        },
        {
            // EXPANDED FRAME 358
            spineAngleDeg: -88.00,
            shoulderJointDist: 26.88,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 153.00,
            leftElbowAngleDeg: 58.88,
            rightUpperArmAngleDeg: 108.88,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 98.53,
            rightThighAngleDeg: 120.72,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.13,
            displacementX: -118.50,
            globalLeftUpperArmAngleDeg: 170
        },
        {
            // EXPANDED FRAME 359
            spineAngleDeg: -88.00,
            shoulderJointDist: 26.25,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 152.00,
            leftElbowAngleDeg: 59.25,
            rightUpperArmAngleDeg: 109.25,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 98.35,
            rightThighAngleDeg: 121.15,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.15,
            displacementX: -118.70,
            globalLeftUpperArmAngleDeg: 169
        },
        {
            // EXPANDED FRAME 360
            spineAngleDeg: -88.00,
            shoulderJointDist: 25.63,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 151.00,
            leftElbowAngleDeg: 59.63,
            rightUpperArmAngleDeg: 109.63,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 98.17,
            rightThighAngleDeg: 121.58,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.18,
            displacementX: -118.90,
            globalLeftUpperArmAngleDeg: 168
        },
        {
            // EXPANDED FRAME 361
            spineAngleDeg: -88.00,
            shoulderJointDist: 25.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 150.00,
            leftElbowAngleDeg: 60.00,
            rightUpperArmAngleDeg: 110.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 98.00,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -119.10,
            globalLeftUpperArmAngleDeg: 167
        },
        {
            // EXPANDED FRAME 362
            spineAngleDeg: -88.00,
            shoulderJointDist: 24.75,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 149.00,
            leftElbowAngleDeg: 60.50,
            rightUpperArmAngleDeg: 109.75,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.25,
            leftThighAngleDeg: 97.80,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -119.28,
            globalLeftUpperArmAngleDeg: 166
        },
        {
            // EXPANDED FRAME 363
            spineAngleDeg: -88.00,
            shoulderJointDist: 24.50,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 148.00,
            leftElbowAngleDeg: 61.00,
            rightUpperArmAngleDeg: 109.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.50,
            leftThighAngleDeg: 97.60,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -119.47,
            globalLeftUpperArmAngleDeg: 165
        },
        {
            // EXPANDED FRAME 364
            spineAngleDeg: -88.00,
            shoulderJointDist: 24.25,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 147.00,
            leftElbowAngleDeg: 61.50,
            rightUpperArmAngleDeg: 109.25,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 90.75,
            leftThighAngleDeg: 97.40,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -119.66,
            globalLeftUpperArmAngleDeg: 164
        },
        {
            // EXPANDED FRAME 365
            spineAngleDeg: -88.00,
            shoulderJointDist: 24.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 146.00,
            leftElbowAngleDeg: 62.00,
            rightUpperArmAngleDeg: 109.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 91.00,
            leftThighAngleDeg: 97.20,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -119.84,
            globalLeftUpperArmAngleDeg: 163
        },
        {
            // EXPANDED FRAME 366
            spineAngleDeg: -88.00,
            shoulderJointDist: 23.75,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 145.00,
            leftElbowAngleDeg: 62.50,
            rightUpperArmAngleDeg: 108.75,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 91.25,
            leftThighAngleDeg: 97.00,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -120.02,
            globalLeftUpperArmAngleDeg: 162
        },
        {
            // EXPANDED FRAME 367
            spineAngleDeg: -88.00,
            shoulderJointDist: 23.50,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 144.00,
            leftElbowAngleDeg: 63.00,
            rightUpperArmAngleDeg: 108.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 91.50,
            leftThighAngleDeg: 96.80,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -120.21,
            globalLeftUpperArmAngleDeg: 161
        },
        {
            // EXPANDED FRAME 368
            spineAngleDeg: -88.00,
            shoulderJointDist: 23.25,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 143.00,
            leftElbowAngleDeg: 63.50,
            rightUpperArmAngleDeg: 108.25,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 91.75,
            leftThighAngleDeg: 96.60,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -120.39,
            globalLeftUpperArmAngleDeg: 160
        },
        {
            // EXPANDED FRAME 369
            spineAngleDeg: -88.00,
            shoulderJointDist: 23.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 142.00,
            leftElbowAngleDeg: 64.00,
            rightUpperArmAngleDeg: 108.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 92.00,
            leftThighAngleDeg: 96.40,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -120.58,
            globalLeftUpperArmAngleDeg: 159
        },
        {
            // EXPANDED FRAME 370
            spineAngleDeg: -88.00,
            shoulderJointDist: 22.75,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 141.00,
            leftElbowAngleDeg: 64.50,
            rightUpperArmAngleDeg: 107.75,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 92.25,
            leftThighAngleDeg: 96.20,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -120.77,
            globalLeftUpperArmAngleDeg: 158
        },
        {
            // EXPANDED FRAME 371
            spineAngleDeg: -88.00,
            shoulderJointDist: 22.50,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 140.00,
            leftElbowAngleDeg: 65.00,
            rightUpperArmAngleDeg: 107.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 92.50,
            leftThighAngleDeg: 96.00,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -120.95,
            globalLeftUpperArmAngleDeg: 157
        },
        {
            // EXPANDED FRAME 372
            spineAngleDeg: -88.00,
            shoulderJointDist: 22.25,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 139.00,
            leftElbowAngleDeg: 65.50,
            rightUpperArmAngleDeg: 107.25,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 92.75,
            leftThighAngleDeg: 95.80,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -121.13,
            globalLeftUpperArmAngleDeg: 156
        },
        {
            // EXPANDED FRAME 373
            spineAngleDeg: -88.00,
            shoulderJointDist: 22.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 138.00,
            leftElbowAngleDeg: 66.00,
            rightUpperArmAngleDeg: 107.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 93.00,
            leftThighAngleDeg: 95.60,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -121.32,
            globalLeftUpperArmAngleDeg: 155
        },
        {
            // EXPANDED FRAME 374
            spineAngleDeg: -88.00,
            shoulderJointDist: 21.75,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 137.00,
            leftElbowAngleDeg: 66.50,
            rightUpperArmAngleDeg: 106.75,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 93.25,
            leftThighAngleDeg: 95.40,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -121.50,
            globalLeftUpperArmAngleDeg: 154
        },
        {
            // EXPANDED FRAME 375
            spineAngleDeg: -88.00,
            shoulderJointDist: 21.50,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 136.00,
            leftElbowAngleDeg: 67.00,
            rightUpperArmAngleDeg: 106.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 93.50,
            leftThighAngleDeg: 95.20,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -121.69,
            globalLeftUpperArmAngleDeg: 153
        },
        {
            // EXPANDED FRAME 376
            spineAngleDeg: -88.00,
            shoulderJointDist: 21.25,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 135.00,
            leftElbowAngleDeg: 67.50,
            rightUpperArmAngleDeg: 106.25,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 93.75,
            leftThighAngleDeg: 95.00,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -121.88,
            globalLeftUpperArmAngleDeg: 152
        },
        {
            // EXPANDED FRAME 377
            spineAngleDeg: -88.00,
            shoulderJointDist: 21.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 134.00,
            leftElbowAngleDeg: 68.00,
            rightUpperArmAngleDeg: 106.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 94.00,
            leftThighAngleDeg: 94.80,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -122.06,
            globalLeftUpperArmAngleDeg: 151
        },
        {
            // EXPANDED FRAME 378
            spineAngleDeg: -88.00,
            shoulderJointDist: 20.75,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 133.00,
            leftElbowAngleDeg: 68.50,
            rightUpperArmAngleDeg: 105.75,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 94.25,
            leftThighAngleDeg: 94.60,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -122.24,
            globalLeftUpperArmAngleDeg: 150
        },
        {
            // EXPANDED FRAME 379
            spineAngleDeg: -88.00,
            shoulderJointDist: 20.50,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 132.00,
            leftElbowAngleDeg: 69.00,
            rightUpperArmAngleDeg: 105.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 94.50,
            leftThighAngleDeg: 94.40,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -122.43,
            globalLeftUpperArmAngleDeg: 149
        },
        {
            // EXPANDED FRAME 380
            spineAngleDeg: -88.00,
            shoulderJointDist: 20.25,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 131.00,
            leftElbowAngleDeg: 69.50,
            rightUpperArmAngleDeg: 105.25,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 94.75,
            leftThighAngleDeg: 94.20,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -122.61,
            globalLeftUpperArmAngleDeg: 148
        },
        {
            // EXPANDED FRAME 381
            spineAngleDeg: -88.00,
            shoulderJointDist: 20.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 130.00,
            leftElbowAngleDeg: 70.00,
            rightUpperArmAngleDeg: 105.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 95.00,
            leftThighAngleDeg: 94.00,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -122.80,
            globalLeftUpperArmAngleDeg: 147
        },
        {
            // EXPANDED FRAME 382
            spineAngleDeg: -88.00,
            shoulderJointDist: 19.75,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 129.00,
            leftElbowAngleDeg: 70.50,
            rightUpperArmAngleDeg: 104.75,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 95.25,
            leftThighAngleDeg: 93.80,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -122.98,
            globalLeftUpperArmAngleDeg: 146
        },
        {
            // EXPANDED FRAME 383
            spineAngleDeg: -88.00,
            shoulderJointDist: 19.50,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 128.00,
            leftElbowAngleDeg: 71.00,
            rightUpperArmAngleDeg: 104.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 95.50,
            leftThighAngleDeg: 93.60,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -123.17,
            globalLeftUpperArmAngleDeg: 145
        },
        {
            // EXPANDED FRAME 384
            spineAngleDeg: -88.00,
            shoulderJointDist: 19.25,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 127.00,
            leftElbowAngleDeg: 71.50,
            rightUpperArmAngleDeg: 104.25,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 95.75,
            leftThighAngleDeg: 93.40,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -123.36,
            globalLeftUpperArmAngleDeg: 144
        },
        {
            // EXPANDED FRAME 385
            spineAngleDeg: -88.00,
            shoulderJointDist: 19.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 126.00,
            leftElbowAngleDeg: 72.00,
            rightUpperArmAngleDeg: 104.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 96.00,
            leftThighAngleDeg: 93.20,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -123.54,
            globalLeftUpperArmAngleDeg: 143
        },
        {
            // EXPANDED FRAME 386
            spineAngleDeg: -88.00,
            shoulderJointDist: 18.75,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 125.00,
            leftElbowAngleDeg: 72.50,
            rightUpperArmAngleDeg: 103.75,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 96.25,
            leftThighAngleDeg: 93.00,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -123.72,
            globalLeftUpperArmAngleDeg: 142
        },
        {
            // EXPANDED FRAME 387
            spineAngleDeg: -88.00,
            shoulderJointDist: 18.50,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 124.00,
            leftElbowAngleDeg: 73.00,
            rightUpperArmAngleDeg: 103.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 96.50,
            leftThighAngleDeg: 92.80,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -123.91,
            globalLeftUpperArmAngleDeg: 141
        },
        {
            // EXPANDED FRAME 388
            spineAngleDeg: -88.00,
            shoulderJointDist: 18.25,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 123.00,
            leftElbowAngleDeg: 73.50,
            rightUpperArmAngleDeg: 103.25,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 96.75,
            leftThighAngleDeg: 92.60,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -124.09,
            globalLeftUpperArmAngleDeg: 140
        },
        {
            // EXPANDED FRAME 389
            spineAngleDeg: -88.00,
            shoulderJointDist: 18.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 122.00,
            leftElbowAngleDeg: 74.00,
            rightUpperArmAngleDeg: 103.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 97.00,
            leftThighAngleDeg: 92.40,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -124.28,
            globalLeftUpperArmAngleDeg: 139
        },
        {
            // EXPANDED FRAME 390
            spineAngleDeg: -88.00,
            shoulderJointDist: 17.75,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 121.00,
            leftElbowAngleDeg: 74.50,
            rightUpperArmAngleDeg: 102.75,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 97.25,
            leftThighAngleDeg: 92.20,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -124.47,
            globalLeftUpperArmAngleDeg: 138
        },
        {
            // EXPANDED FRAME 391
            spineAngleDeg: -88.00,
            shoulderJointDist: 17.50,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 120.00,
            leftElbowAngleDeg: 75.00,
            rightUpperArmAngleDeg: 102.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 97.50,
            leftThighAngleDeg: 92.00,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -124.65,
            globalLeftUpperArmAngleDeg: 137
        },
        {
            // EXPANDED FRAME 392
            spineAngleDeg: -88.00,
            shoulderJointDist: 17.25,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 119.00,
            leftElbowAngleDeg: 75.50,
            rightUpperArmAngleDeg: 102.25,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 97.75,
            leftThighAngleDeg: 91.80,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -124.83,
            globalLeftUpperArmAngleDeg: 136
        },
        {
            // EXPANDED FRAME 393
            spineAngleDeg: -88.00,
            shoulderJointDist: 17.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 118.00,
            leftElbowAngleDeg: 76.00,
            rightUpperArmAngleDeg: 102.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 98.00,
            leftThighAngleDeg: 91.60,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -125.02,
            globalLeftUpperArmAngleDeg: 135
        },
        {
            // EXPANDED FRAME 394
            spineAngleDeg: -88.00,
            shoulderJointDist: 16.75,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 117.00,
            leftElbowAngleDeg: 76.50,
            rightUpperArmAngleDeg: 101.75,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 98.25,
            leftThighAngleDeg: 91.40,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -125.20,
            globalLeftUpperArmAngleDeg: 134
        },
        {
            // EXPANDED FRAME 395
            spineAngleDeg: -88.00,
            shoulderJointDist: 16.50,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 116.00,
            leftElbowAngleDeg: 77.00,
            rightUpperArmAngleDeg: 101.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 98.50,
            leftThighAngleDeg: 91.20,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -125.39,
            globalLeftUpperArmAngleDeg: 133
        },
        {
            // EXPANDED FRAME 396
            spineAngleDeg: -88.00,
            shoulderJointDist: 16.25,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 115.00,
            leftElbowAngleDeg: 77.50,
            rightUpperArmAngleDeg: 101.25,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 98.75,
            leftThighAngleDeg: 91.00,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -125.58,
            globalLeftUpperArmAngleDeg: 132
        },
        {
            // EXPANDED FRAME 397
            spineAngleDeg: -88.00,
            shoulderJointDist: 16.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 114.00,
            leftElbowAngleDeg: 78.00,
            rightUpperArmAngleDeg: 101.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 99.00,
            leftThighAngleDeg: 90.80,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -125.76,
            globalLeftUpperArmAngleDeg: 131
        },
        {
            // EXPANDED FRAME 398
            spineAngleDeg: -88.00,
            shoulderJointDist: 15.75,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 113.00,
            leftElbowAngleDeg: 78.50,
            rightUpperArmAngleDeg: 100.75,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 99.25,
            leftThighAngleDeg: 90.60,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -125.94,
            globalLeftUpperArmAngleDeg: 130
        },
        {
            // EXPANDED FRAME 399
            spineAngleDeg: -88.00,
            shoulderJointDist: 15.50,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 112.00,
            leftElbowAngleDeg: 79.00,
            rightUpperArmAngleDeg: 100.50,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 99.50,
            leftThighAngleDeg: 90.40,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -126.13,
            globalLeftUpperArmAngleDeg: 129
        },
        {
            // EXPANDED FRAME 400
            spineAngleDeg: -88.00,
            shoulderJointDist: 15.25,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 111.00,
            leftElbowAngleDeg: 79.50,
            rightUpperArmAngleDeg: 100.25,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 99.75,
            leftThighAngleDeg: 90.20,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -126.31,
            globalLeftUpperArmAngleDeg: 128
        },
        {
            // EXPANDED FRAME 401
            spineAngleDeg: -88.00,
            shoulderJointDist: 15.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 110.00,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 100.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 90.00,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -120.00,
            hipYOffset: -26.20,
            displacementX: -126.50,
            globalLeftUpperArmAngleDeg: 127
        },
        {
            // EXPANDED FRAME 402
            spineAngleDeg: -87.33,
            shoulderJointDist: 15.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 108.33,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 100.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 88.33,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -118.75,
            hipYOffset: -26.12,
            displacementX: -127.07,
            globalLeftUpperArmAngleDeg: 126
        },
        {
            // EXPANDED FRAME 403
            spineAngleDeg: -86.67,
            shoulderJointDist: 15.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 106.67,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 100.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 86.67,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -117.50,
            hipYOffset: -26.03,
            displacementX: -127.63,
            globalLeftUpperArmAngleDeg: 125
        },
        {
            // EXPANDED FRAME 404
            spineAngleDeg: -86.00,
            shoulderJointDist: 15.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 105.00,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 100.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 85.00,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -116.25,
            hipYOffset: -25.95,
            displacementX: -128.20,
            globalLeftUpperArmAngleDeg: 124
        },
        {
            // EXPANDED FRAME 405
            spineAngleDeg: -85.33,
            shoulderJointDist: 15.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 103.33,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 100.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 83.33,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -115.00,
            hipYOffset: -25.87,
            displacementX: -128.77,
            globalLeftUpperArmAngleDeg: 123
        },
        {
            // EXPANDED FRAME 406
            spineAngleDeg: -84.67,
            shoulderJointDist: 15.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 101.67,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 100.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 81.67,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -113.75,
            hipYOffset: -25.78,
            displacementX: -129.33,
            globalLeftUpperArmAngleDeg: 122
        },
        {
            // EXPANDED FRAME 407
            spineAngleDeg: -84.00,
            shoulderJointDist: 15.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 100.00,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 100.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 80.00,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -112.50,
            hipYOffset: -25.70,
            displacementX: -129.90,
            globalLeftUpperArmAngleDeg: 121
        },
        {
            // EXPANDED FRAME 408
            spineAngleDeg: -83.33,
            shoulderJointDist: 15.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 98.33,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 100.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 78.33,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -111.25,
            hipYOffset: -25.62,
            displacementX: -130.47,
            globalLeftUpperArmAngleDeg: 120
        },
        {
            // EXPANDED FRAME 409
            spineAngleDeg: -82.67,
            shoulderJointDist: 15.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 96.67,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 100.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 76.67,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -110.00,
            hipYOffset: -25.53,
            displacementX: -131.03,
            globalLeftUpperArmAngleDeg: 119
        },
        {
            // EXPANDED FRAME 410
            spineAngleDeg: -82.00,
            shoulderJointDist: 15.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 95.00,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 100.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 75.00,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -108.75,
            hipYOffset: -25.45,
            displacementX: -131.60,
            globalLeftUpperArmAngleDeg: 118
        },
        {
            // EXPANDED FRAME 411
            spineAngleDeg: -81.33,
            shoulderJointDist: 15.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 93.33,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 100.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 73.33,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -107.50,
            hipYOffset: -25.37,
            displacementX: -132.17,
            globalLeftUpperArmAngleDeg: 117
        },
        {
            // EXPANDED FRAME 412
            spineAngleDeg: -80.67,
            shoulderJointDist: 15.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 91.67,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 100.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 71.67,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -106.25,
            hipYOffset: -25.28,
            displacementX: -132.73,
            globalLeftUpperArmAngleDeg: 116
        },
        {
            // EXPANDED FRAME 413
            spineAngleDeg: -80.00,
            shoulderJointDist: 15.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 90.00,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 100.00,
            rightElbowAngleDeg: 75.00,
            pelvisJointDist: -25.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 70.00,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -105.00,
            hipYOffset: -25.20,
            displacementX: -133.30,
            globalLeftUpperArmAngleDeg: 115
        },
        {
            // EXPANDED FRAME 414
            spineAngleDeg: -80.00,
            shoulderJointDist: 15.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 94.00,
            leftElbowAngleDeg: 88.00,
            rightUpperArmAngleDeg: 104.00,
            rightElbowAngleDeg: 79.00,
            pelvisJointDist: -27.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 68.00,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -104.00,
            hipYOffset: -25.20,
            displacementX: -134.58,
            globalLeftUpperArmAngleDeg: 114
        },
        {
            // EXPANDED FRAME 415
            spineAngleDeg: -80.00,
            shoulderJointDist: 15.00,
            shoulderJointAngleDeg: 95.00,
            leftUpperArmAngleDeg: 98.00,
            leftElbowAngleDeg: 96.00,
            rightUpperArmAngleDeg: 108.00,
            rightElbowAngleDeg: 83.00,
            pelvisJointDist: -29.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 66.00,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -103.00,
            hipYOffset: -25.20,
            displacementX: -135.86,
            globalLeftUpperArmAngleDeg: 113
        },
        {
            // EXPANDED FRAME 416
            spineAngleDeg: -80.00,
            shoulderJointDist: 15.00,
            shoulderJointAngleDeg: 87.50,
            leftUpperArmAngleDeg: 104.00,
            leftElbowAngleDeg: 108.00,
            rightUpperArmAngleDeg: 114.00,
            rightElbowAngleDeg: 89.00,
            pelvisJointDist: -32.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 63.00,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -101.50,
            hipYOffset: -25.20,
            displacementX: -137.70,
            globalLeftUpperArmAngleDeg: 112
        },
        {
            // EXPANDED FRAME 417
            spineAngleDeg: -80.00,
            shoulderJointDist: 15.00,
            shoulderJointAngleDeg: 82.50,
            leftUpperArmAngleDeg: 108.00,
            leftElbowAngleDeg: 116.00,
            rightUpperArmAngleDeg: 118.00,
            rightElbowAngleDeg: 93.00,
            pelvisJointDist: -34.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 61.00,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -100.50,
            hipYOffset: -25.20,
            displacementX: -138.90,
            globalLeftUpperArmAngleDeg: 111
        },
        {
            // EXPANDED FRAME 418
            spineAngleDeg: -79.94,
            shoulderJointDist: 14.72,
            shoulderJointAngleDeg: 81.25,
            leftUpperArmAngleDeg: 108.44,
            leftElbowAngleDeg: 117.78,
            rightUpperArmAngleDeg: 119.11,
            rightElbowAngleDeg: 94.11,
            pelvisJointDist: -34.50,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 60.45,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -99.91,
            hipYOffset: -25.24,
            displacementX: -139.26,
            globalLeftUpperArmAngleDeg: 110
        },
        {
            // EXPANDED FRAME 419
            spineAngleDeg: -79.89,
            shoulderJointDist: 14.44,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 108.89,
            leftElbowAngleDeg: 119.56,
            rightUpperArmAngleDeg: 120.22,
            rightElbowAngleDeg: 95.22,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 59.89,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -99.33,
            hipYOffset: -25.29,
            displacementX: -139.63,
            globalLeftUpperArmAngleDeg: 109
        },
        {
            // EXPANDED FRAME 420
            spineAngleDeg: -79.78,
            shoulderJointDist: 13.89,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 107.78,
            leftElbowAngleDeg: 119.11,
            rightUpperArmAngleDeg: 120.44,
            rightElbowAngleDeg: 95.44,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 59.78,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -98.67,
            hipYOffset: -25.38,
            displacementX: -139.76,
            globalLeftUpperArmAngleDeg: 108
        },
        {
            // EXPANDED FRAME 421
            spineAngleDeg: -79.67,
            shoulderJointDist: 13.33,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 106.67,
            leftElbowAngleDeg: 118.67,
            rightUpperArmAngleDeg: 120.67,
            rightElbowAngleDeg: 95.67,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 59.67,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -98.00,
            hipYOffset: -25.47,
            displacementX: -139.89,
            globalLeftUpperArmAngleDeg: 107
        },
        {
            // EXPANDED FRAME 422
            spineAngleDeg: -79.56,
            shoulderJointDist: 12.78,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 105.56,
            leftElbowAngleDeg: 118.22,
            rightUpperArmAngleDeg: 120.89,
            rightElbowAngleDeg: 95.89,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 59.56,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -97.33,
            hipYOffset: -25.56,
            displacementX: -140.02,
            globalLeftUpperArmAngleDeg: 106
        },
        {
            // EXPANDED FRAME 423
            spineAngleDeg: -79.44,
            shoulderJointDist: 12.22,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 104.44,
            leftElbowAngleDeg: 117.78,
            rightUpperArmAngleDeg: 121.11,
            rightElbowAngleDeg: 96.11,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 59.44,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -96.67,
            hipYOffset: -25.64,
            displacementX: -140.14,
            globalLeftUpperArmAngleDeg: 105
        },
        {
            // EXPANDED FRAME 424
            spineAngleDeg: -79.33,
            shoulderJointDist: 11.67,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 103.33,
            leftElbowAngleDeg: 117.33,
            rightUpperArmAngleDeg: 121.33,
            rightElbowAngleDeg: 96.33,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 59.33,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -96.00,
            hipYOffset: -25.73,
            displacementX: -140.27,
            globalLeftUpperArmAngleDeg: 104
        },
        {
            // EXPANDED FRAME 425
            spineAngleDeg: -79.22,
            shoulderJointDist: 11.11,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 102.22,
            leftElbowAngleDeg: 116.89,
            rightUpperArmAngleDeg: 121.56,
            rightElbowAngleDeg: 96.56,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 59.22,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -95.33,
            hipYOffset: -25.82,
            displacementX: -140.40,
            globalLeftUpperArmAngleDeg: 103
        },
        {
            // EXPANDED FRAME 426
            spineAngleDeg: -79.11,
            shoulderJointDist: 10.56,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 101.11,
            leftElbowAngleDeg: 116.44,
            rightUpperArmAngleDeg: 121.78,
            rightElbowAngleDeg: 96.78,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 59.11,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -94.67,
            hipYOffset: -25.91,
            displacementX: -140.53,
            globalLeftUpperArmAngleDeg: 102
        },
        {
            // EXPANDED FRAME 427
            spineAngleDeg: -79.00,
            shoulderJointDist: 10.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 100.00,
            leftElbowAngleDeg: 116.00,
            rightUpperArmAngleDeg: 122.00,
            rightElbowAngleDeg: 97.00,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 59.00,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -94.00,
            hipYOffset: -26.00,
            displacementX: -140.66,
            globalLeftUpperArmAngleDeg: 101
        },
        {
            // EXPANDED FRAME 428
            spineAngleDeg: -78.89,
            shoulderJointDist: 9.44,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 98.89,
            leftElbowAngleDeg: 115.56,
            rightUpperArmAngleDeg: 122.22,
            rightElbowAngleDeg: 97.22,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 58.89,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -93.33,
            hipYOffset: -26.09,
            displacementX: -140.79,
            globalLeftUpperArmAngleDeg: 100
        },
        {
            // EXPANDED FRAME 429
            spineAngleDeg: -78.78,
            shoulderJointDist: 8.89,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 97.78,
            leftElbowAngleDeg: 115.11,
            rightUpperArmAngleDeg: 122.44,
            rightElbowAngleDeg: 97.44,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 58.78,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -92.67,
            hipYOffset: -26.18,
            displacementX: -140.92,
            globalLeftUpperArmAngleDeg: 99
        },
        {
            // EXPANDED FRAME 430
            spineAngleDeg: -78.67,
            shoulderJointDist: 8.33,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 96.67,
            leftElbowAngleDeg: 114.67,
            rightUpperArmAngleDeg: 122.67,
            rightElbowAngleDeg: 97.67,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 58.67,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -92.00,
            hipYOffset: -26.27,
            displacementX: -141.05,
            globalLeftUpperArmAngleDeg: 98
        },
        {
            // EXPANDED FRAME 431
            spineAngleDeg: -78.56,
            shoulderJointDist: 7.78,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 95.56,
            leftElbowAngleDeg: 114.22,
            rightUpperArmAngleDeg: 122.89,
            rightElbowAngleDeg: 97.89,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 58.56,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -91.33,
            hipYOffset: -26.36,
            displacementX: -141.18,
            globalLeftUpperArmAngleDeg: 97
        },
        {
            // EXPANDED FRAME 432
            spineAngleDeg: -78.44,
            shoulderJointDist: 7.22,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 94.44,
            leftElbowAngleDeg: 113.78,
            rightUpperArmAngleDeg: 123.11,
            rightElbowAngleDeg: 98.11,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 58.44,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.67,
            hipYOffset: -26.44,
            displacementX: -141.30,
            globalLeftUpperArmAngleDeg: 96
        },
        {
            // EXPANDED FRAME 433
            spineAngleDeg: -78.33,
            shoulderJointDist: 6.67,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 93.33,
            leftElbowAngleDeg: 113.33,
            rightUpperArmAngleDeg: 123.33,
            rightElbowAngleDeg: 98.33,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 58.33,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -90.00,
            hipYOffset: -26.53,
            displacementX: -141.43,
            globalLeftUpperArmAngleDeg: 95
        },
        {
            // EXPANDED FRAME 434
            spineAngleDeg: -78.22,
            shoulderJointDist: 6.11,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 92.22,
            leftElbowAngleDeg: 112.89,
            rightUpperArmAngleDeg: 123.56,
            rightElbowAngleDeg: 98.56,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 58.22,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -89.33,
            hipYOffset: -26.62,
            displacementX: -141.56,
            globalLeftUpperArmAngleDeg: 94
        },
        {
            // EXPANDED FRAME 435
            spineAngleDeg: -78.11,
            shoulderJointDist: 5.56,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 91.11,
            leftElbowAngleDeg: 112.44,
            rightUpperArmAngleDeg: 123.78,
            rightElbowAngleDeg: 98.78,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 58.11,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -88.67,
            hipYOffset: -26.71,
            displacementX: -141.69,
            globalLeftUpperArmAngleDeg: 93
        },
        {
            // EXPANDED FRAME 436
            spineAngleDeg: -78.00,
            shoulderJointDist: 5.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 90.00,
            leftElbowAngleDeg: 112.00,
            rightUpperArmAngleDeg: 124.00,
            rightElbowAngleDeg: 99.00,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 58.00,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -88.00,
            hipYOffset: -26.80,
            displacementX: -141.82,
            globalLeftUpperArmAngleDeg: 92
        },
        {
            // EXPANDED FRAME 437
            spineAngleDeg: -77.89,
            shoulderJointDist: 4.44,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 88.89,
            leftElbowAngleDeg: 111.56,
            rightUpperArmAngleDeg: 124.22,
            rightElbowAngleDeg: 99.22,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 57.89,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -87.33,
            hipYOffset: -26.89,
            displacementX: -141.95,
            globalLeftUpperArmAngleDeg: 91
        },
        {
            // EXPANDED FRAME 438
            spineAngleDeg: -77.78,
            shoulderJointDist: 3.89,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 87.78,
            leftElbowAngleDeg: 111.11,
            rightUpperArmAngleDeg: 124.44,
            rightElbowAngleDeg: 99.44,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 57.78,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -86.67,
            hipYOffset: -26.98,
            displacementX: -142.08,
            globalLeftUpperArmAngleDeg: 90
        },
        {
            // EXPANDED FRAME 439
            spineAngleDeg: -77.67,
            shoulderJointDist: 3.33,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 86.67,
            leftElbowAngleDeg: 110.67,
            rightUpperArmAngleDeg: 124.67,
            rightElbowAngleDeg: 99.67,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 57.67,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -86.00,
            hipYOffset: -27.07,
            displacementX: -142.21,
            globalLeftUpperArmAngleDeg: 89
        },
        {
            // EXPANDED FRAME 440
            spineAngleDeg: -77.56,
            shoulderJointDist: 2.78,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 85.56,
            leftElbowAngleDeg: 110.22,
            rightUpperArmAngleDeg: 124.89,
            rightElbowAngleDeg: 99.89,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 57.56,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -85.33,
            hipYOffset: -27.16,
            displacementX: -142.34,
            globalLeftUpperArmAngleDeg: 88
        },
        {
            // EXPANDED FRAME 441
            spineAngleDeg: -77.39,
            shoulderJointDist: 1.94,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 83.89,
            leftElbowAngleDeg: 109.56,
            rightUpperArmAngleDeg: 125.22,
            rightElbowAngleDeg: 100.22,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 57.39,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -84.33,
            hipYOffset: -27.29,
            displacementX: -142.52,
            globalLeftUpperArmAngleDeg: 87
        },
        {
            // EXPANDED FRAME 442
            spineAngleDeg: -77.28,
            shoulderJointDist: 1.39,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 82.78,
            leftElbowAngleDeg: 109.11,
            rightUpperArmAngleDeg: 125.44,
            rightElbowAngleDeg: 100.44,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 57.28,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -83.67,
            hipYOffset: -27.38,
            displacementX: -142.65,
            globalLeftUpperArmAngleDeg: 86
        },
        {
            // EXPANDED FRAME 443
            spineAngleDeg: -77.17,
            shoulderJointDist: 0.83,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 81.67,
            leftElbowAngleDeg: 108.67,
            rightUpperArmAngleDeg: 125.67,
            rightElbowAngleDeg: 100.67,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 57.17,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -83.00,
            hipYOffset: -27.47,
            displacementX: -142.77,
            globalLeftUpperArmAngleDeg: 85
        },
        {
            // EXPANDED FRAME 444
            spineAngleDeg: -77.06,
            shoulderJointDist: 0.28,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 80.56,
            leftElbowAngleDeg: 108.22,
            rightUpperArmAngleDeg: 125.89,
            rightElbowAngleDeg: 100.89,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 57.06,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -82.33,
            hipYOffset: -27.56,
            displacementX: -142.90,
            globalLeftUpperArmAngleDeg: 84
        },
        {
            // EXPANDED FRAME 445
            spineAngleDeg: -76.94,
            shoulderJointDist: -0.28,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 79.44,
            leftElbowAngleDeg: 107.78,
            rightUpperArmAngleDeg: 126.11,
            rightElbowAngleDeg: 101.11,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 56.94,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -81.67,
            hipYOffset: -27.64,
            displacementX: -143.02,
            globalLeftUpperArmAngleDeg: 83
        },
        {
            // EXPANDED FRAME 446
            spineAngleDeg: -76.83,
            shoulderJointDist: -0.83,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 78.33,
            leftElbowAngleDeg: 107.33,
            rightUpperArmAngleDeg: 126.33,
            rightElbowAngleDeg: 101.33,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 56.83,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -81.00,
            hipYOffset: -27.73,
            displacementX: -143.15,
            globalLeftUpperArmAngleDeg: 82
        },
        {
            // EXPANDED FRAME 447
            spineAngleDeg: -76.72,
            shoulderJointDist: -1.39,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 77.22,
            leftElbowAngleDeg: 106.89,
            rightUpperArmAngleDeg: 126.56,
            rightElbowAngleDeg: 101.56,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 56.72,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -80.33,
            hipYOffset: -27.82,
            displacementX: -143.27,
            globalLeftUpperArmAngleDeg: 81
        },
        {
            // EXPANDED FRAME 448
            spineAngleDeg: -76.61,
            shoulderJointDist: -1.94,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 76.11,
            leftElbowAngleDeg: 106.44,
            rightUpperArmAngleDeg: 126.78,
            rightElbowAngleDeg: 101.78,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 56.61,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -79.67,
            hipYOffset: -27.91,
            displacementX: -143.40,
            globalLeftUpperArmAngleDeg: 80
        },
        {
            // EXPANDED FRAME 449
            spineAngleDeg: -76.50,
            shoulderJointDist: -2.50,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 75.00,
            leftElbowAngleDeg: 106.00,
            rightUpperArmAngleDeg: 127.00,
            rightElbowAngleDeg: 102.00,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 56.50,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -79.00,
            hipYOffset: -28.00,
            displacementX: -143.52,
            globalLeftUpperArmAngleDeg: 79
        },
        {
            // EXPANDED FRAME 450
            spineAngleDeg: -76.39,
            shoulderJointDist: -3.06,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 73.89,
            leftElbowAngleDeg: 105.56,
            rightUpperArmAngleDeg: 127.22,
            rightElbowAngleDeg: 102.22,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 56.39,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -78.33,
            hipYOffset: -28.09,
            displacementX: -143.64,
            globalLeftUpperArmAngleDeg: 78
        },
        {
            // EXPANDED FRAME 451
            spineAngleDeg: -76.28,
            shoulderJointDist: -3.61,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 72.78,
            leftElbowAngleDeg: 105.11,
            rightUpperArmAngleDeg: 127.44,
            rightElbowAngleDeg: 102.44,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 56.28,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -77.67,
            hipYOffset: -28.18,
            displacementX: -143.77,
            globalLeftUpperArmAngleDeg: 77
        },
        {
            // EXPANDED FRAME 452
            spineAngleDeg: -76.17,
            shoulderJointDist: -4.17,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 71.67,
            leftElbowAngleDeg: 104.67,
            rightUpperArmAngleDeg: 127.67,
            rightElbowAngleDeg: 102.67,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 56.17,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -77.00,
            hipYOffset: -28.27,
            displacementX: -143.89,
            globalLeftUpperArmAngleDeg: 76
        },
        {
            // EXPANDED FRAME 453
            spineAngleDeg: -76.06,
            shoulderJointDist: -4.72,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 70.56,
            leftElbowAngleDeg: 104.22,
            rightUpperArmAngleDeg: 127.89,
            rightElbowAngleDeg: 102.89,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 56.06,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -76.33,
            hipYOffset: -28.36,
            displacementX: -144.02,
            globalLeftUpperArmAngleDeg: 75
        },
        {
            // EXPANDED FRAME 454
            spineAngleDeg: -75.94,
            shoulderJointDist: -5.28,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 69.44,
            leftElbowAngleDeg: 103.78,
            rightUpperArmAngleDeg: 128.11,
            rightElbowAngleDeg: 103.11,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 55.94,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -75.67,
            hipYOffset: -28.44,
            displacementX: -144.14,
            globalLeftUpperArmAngleDeg: 74
        },
        {
            // EXPANDED FRAME 455
            spineAngleDeg: -75.83,
            shoulderJointDist: -5.83,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 68.33,
            leftElbowAngleDeg: 103.33,
            rightUpperArmAngleDeg: 128.33,
            rightElbowAngleDeg: 103.33,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 55.83,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -28.53,
            displacementX: -144.27,
            globalLeftUpperArmAngleDeg: 73
        },
        {
            // EXPANDED FRAME 456
            spineAngleDeg: -75.72,
            shoulderJointDist: -6.39,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 67.22,
            leftElbowAngleDeg: 102.89,
            rightUpperArmAngleDeg: 128.56,
            rightElbowAngleDeg: 103.56,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 55.72,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -74.33,
            hipYOffset: -28.62,
            displacementX: -144.39,
            globalLeftUpperArmAngleDeg: 72
        },
        {
            // EXPANDED FRAME 457
            spineAngleDeg: -75.61,
            shoulderJointDist: -6.94,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 66.11,
            leftElbowAngleDeg: 102.44,
            rightUpperArmAngleDeg: 128.78,
            rightElbowAngleDeg: 103.78,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 55.61,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -73.67,
            hipYOffset: -28.71,
            displacementX: -144.52,
            globalLeftUpperArmAngleDeg: 71
        },
        {
            // EXPANDED FRAME 458
            spineAngleDeg: -75.50,
            shoulderJointDist: -7.50,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 65.00,
            leftElbowAngleDeg: 102.00,
            rightUpperArmAngleDeg: 129.00,
            rightElbowAngleDeg: 104.00,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 55.50,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -73.00,
            hipYOffset: -28.80,
            displacementX: -144.64,
            globalLeftUpperArmAngleDeg: 70
        },
        {
            // EXPANDED FRAME 459
            spineAngleDeg: -75.39,
            shoulderJointDist: -8.06,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 63.89,
            leftElbowAngleDeg: 101.56,
            rightUpperArmAngleDeg: 129.22,
            rightElbowAngleDeg: 104.22,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 55.39,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -72.33,
            hipYOffset: -28.89,
            displacementX: -144.76,
            globalLeftUpperArmAngleDeg: 69
        },
        {
            // EXPANDED FRAME 460
            spineAngleDeg: -75.28,
            shoulderJointDist: -8.61,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 62.78,
            leftElbowAngleDeg: 101.11,
            rightUpperArmAngleDeg: 129.44,
            rightElbowAngleDeg: 104.44,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 55.28,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -71.67,
            hipYOffset: -28.98,
            displacementX: -144.89,
            globalLeftUpperArmAngleDeg: 68
        },
        {
            // EXPANDED FRAME 461
            spineAngleDeg: -75.17,
            shoulderJointDist: -9.17,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 61.67,
            leftElbowAngleDeg: 100.67,
            rightUpperArmAngleDeg: 129.67,
            rightElbowAngleDeg: 104.67,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 55.17,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -71.00,
            hipYOffset: -29.07,
            displacementX: -145.01,
            globalLeftUpperArmAngleDeg: 67
        },
        {
            // EXPANDED FRAME 462
            spineAngleDeg: -75.06,
            shoulderJointDist: -9.72,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 60.56,
            leftElbowAngleDeg: 100.22,
            rightUpperArmAngleDeg: 129.89,
            rightElbowAngleDeg: 104.89,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 55.06,
            rightThighAngleDeg: 122.00,
            leftKneeAngleDeg: -25.00,
            rightKneeAngleDeg: -70.33,
            hipYOffset: -29.16,
            displacementX: -145.14,
            globalLeftUpperArmAngleDeg: 66
        },
        {
            // EXPANDED FRAME 463
            spineAngleDeg: -75.00,
            shoulderJointDist: -14.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 62.00,
            leftElbowAngleDeg: 96.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 111.00,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 96.00,
            leftThighAngleDeg: 58.00,
            rightThighAngleDeg: 124.60,
            leftKneeAngleDeg: -26.00,
            rightKneeAngleDeg: -66.00,
            hipYOffset: -29.20,
            displacementX: -146.28,
            globalLeftUpperArmAngleDeg: 67
        },
        {
            // EXPANDED FRAME 464
            spineAngleDeg: -75.00,
            shoulderJointDist: -16.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 63.00,
            leftElbowAngleDeg: 94.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 114.00,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 94.00,
            leftThighAngleDeg: 59.50,
            rightThighAngleDeg: 125.90,
            leftKneeAngleDeg: -26.50,
            rightKneeAngleDeg: -64.00,
            hipYOffset: -29.20,
            displacementX: -146.82,
            globalLeftUpperArmAngleDeg: 68
        },
        {
            // EXPANDED FRAME 465
            spineAngleDeg: -75.00,
            shoulderJointDist: -18.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 64.00,
            leftElbowAngleDeg: 92.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 117.00,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 92.00,
            leftThighAngleDeg: 61.00,
            rightThighAngleDeg: 127.20,
            leftKneeAngleDeg: -27.00,
            rightKneeAngleDeg: -62.00,
            hipYOffset: -29.20,
            displacementX: -147.36,
            globalLeftUpperArmAngleDeg: 69
        },
        {
            // EXPANDED FRAME 466
            spineAngleDeg: -75.00,
            shoulderJointDist: -20.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 65.00,
            leftElbowAngleDeg: 90.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 120.00,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 90.00,
            leftThighAngleDeg: 62.50,
            rightThighAngleDeg: 128.50,
            leftKneeAngleDeg: -27.50,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -29.20,
            displacementX: -147.90,
            globalLeftUpperArmAngleDeg: 70
        },
        {
            // EXPANDED FRAME 467
            spineAngleDeg: -75.00,
            shoulderJointDist: -22.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 66.00,
            leftElbowAngleDeg: 88.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 123.00,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 88.00,
            leftThighAngleDeg: 64.00,
            rightThighAngleDeg: 129.80,
            leftKneeAngleDeg: -28.00,
            rightKneeAngleDeg: -58.00,
            hipYOffset: -29.20,
            displacementX: -148.40,
            globalLeftUpperArmAngleDeg: 71
        },
        {
            // EXPANDED FRAME 468
            spineAngleDeg: -75.00,
            shoulderJointDist: -24.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 67.00,
            leftElbowAngleDeg: 86.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 126.00,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 86.00,
            leftThighAngleDeg: 65.50,
            rightThighAngleDeg: 131.10,
            leftKneeAngleDeg: -28.50,
            rightKneeAngleDeg: -56.00,
            hipYOffset: -29.20,
            displacementX: -148.90,
            globalLeftUpperArmAngleDeg: 72
        },
        {
            // EXPANDED FRAME 469
            spineAngleDeg: -75.00,
            shoulderJointDist: -26.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 68.00,
            leftElbowAngleDeg: 84.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 129.00,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 84.00,
            leftThighAngleDeg: 67.00,
            rightThighAngleDeg: 132.40,
            leftKneeAngleDeg: -29.00,
            rightKneeAngleDeg: -54.00,
            hipYOffset: -29.20,
            displacementX: -149.40,
            globalLeftUpperArmAngleDeg: 73
        },
        {
            // EXPANDED FRAME 470
            spineAngleDeg: -75.00,
            shoulderJointDist: -28.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 69.00,
            leftElbowAngleDeg: 82.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 132.00,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 82.00,
            leftThighAngleDeg: 68.50,
            rightThighAngleDeg: 133.70,
            leftKneeAngleDeg: -29.50,
            rightKneeAngleDeg: -52.00,
            hipYOffset: -29.20,
            displacementX: -149.90,
            globalLeftUpperArmAngleDeg: 74
        },
        {
            // EXPANDED FRAME 471
            spineAngleDeg: -75.00,
            shoulderJointDist: -30.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 70.00,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 135.00,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 70.00,
            rightThighAngleDeg: 135.00,
            leftKneeAngleDeg: -30.00,
            rightKneeAngleDeg: -50.00,
            hipYOffset: -29.20,
            displacementX: -150.40,
            globalLeftUpperArmAngleDeg: 75
        },
        {
            // EXPANDED FRAME 472
            spineAngleDeg: -75.00,
            shoulderJointDist: -30.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 69.00,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 136.00,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 78.00,
            leftThighAngleDeg: 74.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -40.00,
            rightKneeAngleDeg: -50.00,
            hipYOffset: -29.20,
            displacementX: -151.36,
            globalLeftUpperArmAngleDeg: 74
        },
        {
            // EXPANDED FRAME 473
            spineAngleDeg: -75.00,
            shoulderJointDist: -30.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 68.00,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 137.00,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 76.00,
            leftThighAngleDeg: 78.00,
            rightThighAngleDeg: 145.00,
            leftKneeAngleDeg: -50.00,
            rightKneeAngleDeg: -50.00,
            hipYOffset: -29.20,
            displacementX: -152.32,
            globalLeftUpperArmAngleDeg: 73
        },
        {
            // EXPANDED FRAME 474
            spineAngleDeg: -75.00,
            shoulderJointDist: -30.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 66.50,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 138.50,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 73.00,
            leftThighAngleDeg: 84.00,
            rightThighAngleDeg: 152.50,
            leftKneeAngleDeg: -65.00,
            rightKneeAngleDeg: -50.00,
            hipYOffset: -29.20,
            displacementX: -153.72,
            globalLeftUpperArmAngleDeg: 72
        },
        {
            // EXPANDED FRAME 475
            spineAngleDeg: -75.00,
            shoulderJointDist: -30.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 65.50,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 139.50,
            pelvisJointDist: -35.00,
            pelvisJointAngleDeg: 71.00,
            leftThighAngleDeg: 88.00,
            rightThighAngleDeg: 157.50,
            leftKneeAngleDeg: -75.00,
            rightKneeAngleDeg: -50.00,
            hipYOffset: -29.20,
            displacementX: -154.64,
            globalLeftUpperArmAngleDeg: 71
        },
        {
            // EXPANDED FRAME 476
            spineAngleDeg: -76.00,
            shoulderJointDist: -34.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 68.00,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: -24.00,
            pelvisJointAngleDeg: 72.00,
            leftThighAngleDeg: 90.00,
            rightThighAngleDeg: 156.00,
            leftKneeAngleDeg: -84.00,
            rightKneeAngleDeg: -45.00,
            hipYOffset: -29.20,
            displacementX: -155.98,
            globalLeftUpperArmAngleDeg: 72
        },
        {
            // EXPANDED FRAME 477
            spineAngleDeg: -76.50,
            shoulderJointDist: -36.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 69.50,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: -18.50,
            pelvisJointAngleDeg: 73.00,
            leftThighAngleDeg: 90.00,
            rightThighAngleDeg: 154.00,
            leftKneeAngleDeg: -86.00,
            rightKneeAngleDeg: -42.50,
            hipYOffset: -29.20,
            displacementX: -156.42,
            globalLeftUpperArmAngleDeg: 73
        },
        {
            // EXPANDED FRAME 478
            spineAngleDeg: -77.00,
            shoulderJointDist: -38.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 71.00,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: -13.00,
            pelvisJointAngleDeg: 74.00,
            leftThighAngleDeg: 90.00,
            rightThighAngleDeg: 152.00,
            leftKneeAngleDeg: -88.00,
            rightKneeAngleDeg: -40.00,
            hipYOffset: -29.20,
            displacementX: -156.86,
            globalLeftUpperArmAngleDeg: 74
        },
        {
            // EXPANDED FRAME 479
            spineAngleDeg: -77.50,
            shoulderJointDist: -40.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 72.50,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: -7.50,
            pelvisJointAngleDeg: 75.00,
            leftThighAngleDeg: 90.00,
            rightThighAngleDeg: 150.00,
            leftKneeAngleDeg: -90.00,
            rightKneeAngleDeg: -37.50,
            hipYOffset: -29.20,
            displacementX: -157.30,
            globalLeftUpperArmAngleDeg: 75
        },
        {
            // EXPANDED FRAME 480
            spineAngleDeg: -78.00,
            shoulderJointDist: -42.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 74.00,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: -2.00,
            pelvisJointAngleDeg: 76.00,
            leftThighAngleDeg: 90.00,
            rightThighAngleDeg: 148.00,
            leftKneeAngleDeg: -92.00,
            rightKneeAngleDeg: -35.00,
            hipYOffset: -29.20,
            displacementX: -157.72,
            globalLeftUpperArmAngleDeg: 76
        },
        {
            // EXPANDED FRAME 481
            spineAngleDeg: -78.50,
            shoulderJointDist: -44.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 75.50,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 3.50,
            pelvisJointAngleDeg: 77.00,
            leftThighAngleDeg: 90.00,
            rightThighAngleDeg: 146.00,
            leftKneeAngleDeg: -94.00,
            rightKneeAngleDeg: -32.50,
            hipYOffset: -29.20,
            displacementX: -158.14,
            globalLeftUpperArmAngleDeg: 77
        },
        {
            // EXPANDED FRAME 482
            spineAngleDeg: -79.00,
            shoulderJointDist: -46.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 77.00,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 9.00,
            pelvisJointAngleDeg: 78.00,
            leftThighAngleDeg: 90.00,
            rightThighAngleDeg: 144.00,
            leftKneeAngleDeg: -96.00,
            rightKneeAngleDeg: -30.00,
            hipYOffset: -29.20,
            displacementX: -158.56,
            globalLeftUpperArmAngleDeg: 78
        },
        {
            // EXPANDED FRAME 483
            spineAngleDeg: -79.50,
            shoulderJointDist: -48.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 78.50,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 14.50,
            pelvisJointAngleDeg: 79.00,
            leftThighAngleDeg: 90.00,
            rightThighAngleDeg: 142.00,
            leftKneeAngleDeg: -98.00,
            rightKneeAngleDeg: -27.50,
            hipYOffset: -29.20,
            displacementX: -158.98,
            globalLeftUpperArmAngleDeg: 79
        },
        {
            // EXPANDED FRAME 484
            spineAngleDeg: -80.00,
            shoulderJointDist: -50.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 80.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 20.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 90.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -100.00,
            rightKneeAngleDeg: -25.00,
            hipYOffset: -29.20,
            displacementX: -159.40,
            globalLeftUpperArmAngleDeg: 80
        },
        {
            // EXPANDED FRAME 485
            spineAngleDeg: -80.00,
            shoulderJointDist: -50.50,
            shoulderJointAngleDeg: 81.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 79.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 20.75,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 91.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -101.50,
            rightKneeAngleDeg: -24.50,
            hipYOffset: -28.95,
            displacementX: -159.59,
            globalLeftUpperArmAngleDeg: 81
        },
        {
            // EXPANDED FRAME 486
            spineAngleDeg: -80.00,
            shoulderJointDist: -51.00,
            shoulderJointAngleDeg: 82.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 78.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 21.50,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 92.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -103.00,
            rightKneeAngleDeg: -24.00,
            hipYOffset: -28.70,
            displacementX: -159.78,
            globalLeftUpperArmAngleDeg: 82
        },
        {
            // EXPANDED FRAME 487
            spineAngleDeg: -80.00,
            shoulderJointDist: -51.50,
            shoulderJointAngleDeg: 83.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 77.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 22.25,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 93.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -104.50,
            rightKneeAngleDeg: -23.50,
            hipYOffset: -28.45,
            displacementX: -159.97,
            globalLeftUpperArmAngleDeg: 83
        },
        {
            // EXPANDED FRAME 488
            spineAngleDeg: -80.00,
            shoulderJointDist: -52.00,
            shoulderJointAngleDeg: 84.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 76.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 23.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 94.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -106.00,
            rightKneeAngleDeg: -23.00,
            hipYOffset: -28.20,
            displacementX: -160.16,
            globalLeftUpperArmAngleDeg: 84
        },
        {
            // EXPANDED FRAME 489
            spineAngleDeg: -80.00,
            shoulderJointDist: -52.50,
            shoulderJointAngleDeg: 85.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 75.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 23.75,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 95.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -107.50,
            rightKneeAngleDeg: -22.50,
            hipYOffset: -27.95,
            displacementX: -160.35,
            globalLeftUpperArmAngleDeg: 85
        },
        {
            // EXPANDED FRAME 490
            spineAngleDeg: -80.00,
            shoulderJointDist: -53.00,
            shoulderJointAngleDeg: 86.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 74.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 24.50,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 96.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -109.00,
            rightKneeAngleDeg: -22.00,
            hipYOffset: -27.70,
            displacementX: -160.54,
            globalLeftUpperArmAngleDeg: 86
        },
        {
            // EXPANDED FRAME 491
            spineAngleDeg: -80.00,
            shoulderJointDist: -53.50,
            shoulderJointAngleDeg: 87.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 73.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 25.25,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 97.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -110.50,
            rightKneeAngleDeg: -21.50,
            hipYOffset: -27.45,
            displacementX: -160.73,
            globalLeftUpperArmAngleDeg: 87
        },
        {
            // EXPANDED FRAME 492
            spineAngleDeg: -80.00,
            shoulderJointDist: -54.00,
            shoulderJointAngleDeg: 88.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 72.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 26.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 98.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -112.00,
            rightKneeAngleDeg: -21.00,
            hipYOffset: -27.20,
            displacementX: -160.92,
            globalLeftUpperArmAngleDeg: 88
        },
        {
            // EXPANDED FRAME 493
            spineAngleDeg: -80.00,
            shoulderJointDist: -54.50,
            shoulderJointAngleDeg: 89.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 71.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 26.75,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 99.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -113.50,
            rightKneeAngleDeg: -20.50,
            hipYOffset: -26.95,
            displacementX: -161.11,
            globalLeftUpperArmAngleDeg: 89
        },
        {
            // EXPANDED FRAME 494
            spineAngleDeg: -80.00,
            shoulderJointDist: -55.00,
            shoulderJointAngleDeg: 90.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 70.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 27.50,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 100.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -115.00,
            rightKneeAngleDeg: -20.00,
            hipYOffset: -26.70,
            displacementX: -161.30,
            globalLeftUpperArmAngleDeg: 90
        },
        {
            // EXPANDED FRAME 495
            spineAngleDeg: -80.00,
            shoulderJointDist: -55.50,
            shoulderJointAngleDeg: 91.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 69.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 28.25,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 101.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -116.50,
            rightKneeAngleDeg: -19.50,
            hipYOffset: -26.45,
            displacementX: -161.49,
            globalLeftUpperArmAngleDeg: 91
        },
        {
            // EXPANDED FRAME 496
            spineAngleDeg: -80.00,
            shoulderJointDist: -56.00,
            shoulderJointAngleDeg: 92.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 68.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 29.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 102.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -118.00,
            rightKneeAngleDeg: -19.00,
            hipYOffset: -26.20,
            displacementX: -161.68,
            globalLeftUpperArmAngleDeg: 92
        },
        {
            // EXPANDED FRAME 497
            spineAngleDeg: -80.00,
            shoulderJointDist: -56.50,
            shoulderJointAngleDeg: 93.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 67.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 29.75,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 103.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -119.50,
            rightKneeAngleDeg: -18.50,
            hipYOffset: -25.95,
            displacementX: -161.87,
            globalLeftUpperArmAngleDeg: 93
        },
        {
            // EXPANDED FRAME 498
            spineAngleDeg: -80.00,
            shoulderJointDist: -57.00,
            shoulderJointAngleDeg: 94.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 66.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 30.50,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 104.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -121.00,
            rightKneeAngleDeg: -18.00,
            hipYOffset: -25.70,
            displacementX: -162.06,
            globalLeftUpperArmAngleDeg: 94
        },
        {
            // EXPANDED FRAME 499
            spineAngleDeg: -80.00,
            shoulderJointDist: -57.50,
            shoulderJointAngleDeg: 95.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 65.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 31.25,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 105.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -122.50,
            rightKneeAngleDeg: -17.50,
            hipYOffset: -25.45,
            displacementX: -162.25,
            globalLeftUpperArmAngleDeg: 95
        },
        {
            // EXPANDED FRAME 500
            spineAngleDeg: -80.00,
            shoulderJointDist: -58.00,
            shoulderJointAngleDeg: 96.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 64.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 32.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 106.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -124.00,
            rightKneeAngleDeg: -17.00,
            hipYOffset: -25.20,
            displacementX: -162.44,
            globalLeftUpperArmAngleDeg: 96
        },
        {
            // EXPANDED FRAME 501
            spineAngleDeg: -80.00,
            shoulderJointDist: -58.50,
            shoulderJointAngleDeg: 97.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 63.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 32.75,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 107.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -125.50,
            rightKneeAngleDeg: -16.50,
            hipYOffset: -24.95,
            displacementX: -162.63,
            globalLeftUpperArmAngleDeg: 97
        },
        {
            // EXPANDED FRAME 502
            spineAngleDeg: -80.00,
            shoulderJointDist: -59.00,
            shoulderJointAngleDeg: 98.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 62.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 33.50,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 108.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -127.00,
            rightKneeAngleDeg: -16.00,
            hipYOffset: -24.70,
            displacementX: -162.82,
            globalLeftUpperArmAngleDeg: 98
        },
        {
            // EXPANDED FRAME 503
            spineAngleDeg: -80.00,
            shoulderJointDist: -59.50,
            shoulderJointAngleDeg: 99.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 61.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 34.25,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 109.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -128.50,
            rightKneeAngleDeg: -15.50,
            hipYOffset: -24.45,
            displacementX: -163.01,
            globalLeftUpperArmAngleDeg: 99
        },
        {
            // EXPANDED FRAME 504
            spineAngleDeg: -80.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 80.00,
            leftElbowAngleDeg: 60.00,
            rightUpperArmAngleDeg: 130.00,
            rightElbowAngleDeg: 140.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 110.00,
            rightThighAngleDeg: 140.00,
            leftKneeAngleDeg: -130.00,
            rightKneeAngleDeg: -15.00,
            hipYOffset: -24.20,
            displacementX: -163.20,
            globalLeftUpperArmAngleDeg: 100
        },
        {
            // EXPANDED FRAME 505
            spineAngleDeg: -95.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 104.00,
            leftUpperArmAngleDeg: 92.00,
            leftElbowAngleDeg: 54.00,
            rightUpperArmAngleDeg: 182.00,
            rightElbowAngleDeg: 92.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 112.00,
            leftThighAngleDeg: 161.00,
            rightThighAngleDeg: 106.00,
            leftKneeAngleDeg: -114.00,
            rightKneeAngleDeg: -25.00,
            hipYOffset: -29.20,
            displacementX: -172.68,
            globalLeftUpperArmAngleDeg: 101
        },
        {
            // EXPANDED FRAME 506
            spineAngleDeg: -95.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 108.00,
            leftUpperArmAngleDeg: 89.00,
            leftElbowAngleDeg: 48.00,
            rightUpperArmAngleDeg: 184.00,
            rightElbowAngleDeg: 84.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 114.00,
            leftThighAngleDeg: 162.00,
            rightThighAngleDeg: 102.00,
            leftKneeAngleDeg: -108.00,
            rightKneeAngleDeg: -25.00,
            hipYOffset: -29.20,
            displacementX: -173.16,
            globalLeftUpperArmAngleDeg: 102
        },
        {
            // EXPANDED FRAME 507
            spineAngleDeg: -95.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 111.00,
            leftUpperArmAngleDeg: 86.75,
            leftElbowAngleDeg: 43.50,
            rightUpperArmAngleDeg: 185.50,
            rightElbowAngleDeg: 78.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 115.50,
            leftThighAngleDeg: 162.75,
            rightThighAngleDeg: 99.00,
            leftKneeAngleDeg: -103.50,
            rightKneeAngleDeg: -25.00,
            hipYOffset: -29.20,
            displacementX: -173.50,
            globalLeftUpperArmAngleDeg: 103
        },
        {
            // EXPANDED FRAME 508
            spineAngleDeg: -95.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 114.00,
            leftUpperArmAngleDeg: 84.50,
            leftElbowAngleDeg: 39.00,
            rightUpperArmAngleDeg: 187.00,
            rightElbowAngleDeg: 72.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 117.00,
            leftThighAngleDeg: 163.50,
            rightThighAngleDeg: 96.00,
            leftKneeAngleDeg: -99.00,
            rightKneeAngleDeg: -25.00,
            hipYOffset: -29.20,
            displacementX: -173.84,
            globalLeftUpperArmAngleDeg: 104
        },
        {
            // EXPANDED FRAME 509
            spineAngleDeg: -95.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 118.00,
            leftUpperArmAngleDeg: 81.50,
            leftElbowAngleDeg: 33.00,
            rightUpperArmAngleDeg: 189.00,
            rightElbowAngleDeg: 64.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 119.00,
            leftThighAngleDeg: 164.50,
            rightThighAngleDeg: 92.00,
            leftKneeAngleDeg: -93.00,
            rightKneeAngleDeg: -25.00,
            hipYOffset: -29.20,
            displacementX: -174.28,
            globalLeftUpperArmAngleDeg: 105
        },
        {
            // EXPANDED FRAME 510
            spineAngleDeg: -94.67,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 119.33,
            leftUpperArmAngleDeg: 79.33,
            leftElbowAngleDeg: 66.00,
            rightUpperArmAngleDeg: 209.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 154.33,
            rightThighAngleDeg: 84.33,
            leftKneeAngleDeg: -23.33,
            rightKneeAngleDeg: -50.67,
            hipYOffset: -23.87,
            displacementX: -178.19,
            globalLeftUpperArmAngleDeg: 104
        },
        {
            // EXPANDED FRAME 511
            spineAngleDeg: -94.33,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 118.67,
            leftUpperArmAngleDeg: 78.67,
            leftElbowAngleDeg: 62.00,
            rightUpperArmAngleDeg: 208.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 153.67,
            rightThighAngleDeg: 83.67,
            leftKneeAngleDeg: -21.67,
            rightKneeAngleDeg: -51.33,
            hipYOffset: -23.53,
            displacementX: -178.29,
            globalLeftUpperArmAngleDeg: 103
        },
        {
            // EXPANDED FRAME 512
            spineAngleDeg: -94.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 118.00,
            leftUpperArmAngleDeg: 78.00,
            leftElbowAngleDeg: 58.00,
            rightUpperArmAngleDeg: 207.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 153.00,
            rightThighAngleDeg: 83.00,
            leftKneeAngleDeg: -20.00,
            rightKneeAngleDeg: -52.00,
            hipYOffset: -23.20,
            displacementX: -178.38,
            globalLeftUpperArmAngleDeg: 102
        },
        {
            // EXPANDED FRAME 513
            spineAngleDeg: -93.67,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 117.33,
            leftUpperArmAngleDeg: 77.33,
            leftElbowAngleDeg: 54.00,
            rightUpperArmAngleDeg: 206.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 152.33,
            rightThighAngleDeg: 82.33,
            leftKneeAngleDeg: -18.33,
            rightKneeAngleDeg: -52.67,
            hipYOffset: -22.87,
            displacementX: -178.47,
            globalLeftUpperArmAngleDeg: 101
        },
        {
            // EXPANDED FRAME 514
            spineAngleDeg: -93.33,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 116.67,
            leftUpperArmAngleDeg: 76.67,
            leftElbowAngleDeg: 50.00,
            rightUpperArmAngleDeg: 205.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 151.67,
            rightThighAngleDeg: 81.67,
            leftKneeAngleDeg: -16.67,
            rightKneeAngleDeg: -53.33,
            hipYOffset: -22.53,
            displacementX: -178.57,
            globalLeftUpperArmAngleDeg: 100
        },
        {
            // EXPANDED FRAME 515
            spineAngleDeg: -93.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 116.00,
            leftUpperArmAngleDeg: 76.00,
            leftElbowAngleDeg: 46.00,
            rightUpperArmAngleDeg: 204.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 151.00,
            rightThighAngleDeg: 81.00,
            leftKneeAngleDeg: -15.00,
            rightKneeAngleDeg: -54.00,
            hipYOffset: -22.20,
            displacementX: -178.66,
            globalLeftUpperArmAngleDeg: 99
        },
        {
            // EXPANDED FRAME 516
            spineAngleDeg: -92.67,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 115.33,
            leftUpperArmAngleDeg: 75.33,
            leftElbowAngleDeg: 42.00,
            rightUpperArmAngleDeg: 203.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 150.33,
            rightThighAngleDeg: 80.33,
            leftKneeAngleDeg: -13.33,
            rightKneeAngleDeg: -54.67,
            hipYOffset: -21.87,
            displacementX: -178.75,
            globalLeftUpperArmAngleDeg: 98
        },
        {
            // EXPANDED FRAME 517
            spineAngleDeg: -92.17,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 114.33,
            leftUpperArmAngleDeg: 74.33,
            leftElbowAngleDeg: 36.00,
            rightUpperArmAngleDeg: 201.50,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 149.33,
            rightThighAngleDeg: 79.33,
            leftKneeAngleDeg: -10.83,
            rightKneeAngleDeg: -55.67,
            hipYOffset: -21.37,
            displacementX: -178.89,
            globalLeftUpperArmAngleDeg: 97
        },
        {
            // EXPANDED FRAME 518
            spineAngleDeg: -91.83,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 113.67,
            leftUpperArmAngleDeg: 73.67,
            leftElbowAngleDeg: 32.00,
            rightUpperArmAngleDeg: 200.50,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 148.67,
            rightThighAngleDeg: 78.67,
            leftKneeAngleDeg: -9.17,
            rightKneeAngleDeg: -56.33,
            hipYOffset: -21.03,
            displacementX: -178.99,
            globalLeftUpperArmAngleDeg: 96
        },
        {
            // EXPANDED FRAME 519
            spineAngleDeg: -91.50,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 113.00,
            leftUpperArmAngleDeg: 73.00,
            leftElbowAngleDeg: 28.00,
            rightUpperArmAngleDeg: 199.50,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 148.00,
            rightThighAngleDeg: 78.00,
            leftKneeAngleDeg: -7.50,
            rightKneeAngleDeg: -57.00,
            hipYOffset: -20.70,
            displacementX: -179.08,
            globalLeftUpperArmAngleDeg: 95
        },
        {
            // EXPANDED FRAME 520
            spineAngleDeg: -91.17,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 112.33,
            leftUpperArmAngleDeg: 72.33,
            leftElbowAngleDeg: 24.00,
            rightUpperArmAngleDeg: 198.50,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 147.33,
            rightThighAngleDeg: 77.33,
            leftKneeAngleDeg: -5.83,
            rightKneeAngleDeg: -57.67,
            hipYOffset: -20.37,
            displacementX: -179.17,
            globalLeftUpperArmAngleDeg: 94
        },
        {
            // EXPANDED FRAME 521
            spineAngleDeg: -90.83,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 111.67,
            leftUpperArmAngleDeg: 71.67,
            leftElbowAngleDeg: 20.00,
            rightUpperArmAngleDeg: 197.50,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 146.67,
            rightThighAngleDeg: 76.67,
            leftKneeAngleDeg: -4.17,
            rightKneeAngleDeg: -58.33,
            hipYOffset: -20.03,
            displacementX: -179.27,
            globalLeftUpperArmAngleDeg: 93
        },
        {
            // EXPANDED FRAME 522
            spineAngleDeg: -90.50,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 111.00,
            leftUpperArmAngleDeg: 71.00,
            leftElbowAngleDeg: 16.00,
            rightUpperArmAngleDeg: 196.50,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 146.00,
            rightThighAngleDeg: 76.00,
            leftKneeAngleDeg: -2.50,
            rightKneeAngleDeg: -59.00,
            hipYOffset: -19.70,
            displacementX: -179.36,
            globalLeftUpperArmAngleDeg: 92
        },
        {
            // EXPANDED FRAME 523
            spineAngleDeg: -90.17,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 110.33,
            leftUpperArmAngleDeg: 70.33,
            leftElbowAngleDeg: 12.00,
            rightUpperArmAngleDeg: 195.50,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 110.00,
            leftThighAngleDeg: 145.33,
            rightThighAngleDeg: 75.33,
            leftKneeAngleDeg: -0.83,
            rightKneeAngleDeg: -59.67,
            hipYOffset: -19.37,
            displacementX: -179.45,
            globalLeftUpperArmAngleDeg: 91
        },
        {
            // EXPANDED FRAME 524
            spineAngleDeg: -90.09,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 110.00,
            leftUpperArmAngleDeg: 69.83,
            leftElbowAngleDeg: 10.66,
            rightUpperArmAngleDeg: 194.97,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 109.84,
            leftThighAngleDeg: 145.17,
            rightThighAngleDeg: 75.16,
            leftKneeAngleDeg: -0.41,
            rightKneeAngleDeg: -59.84,
            hipYOffset: -18.96,
            displacementX: -179.50,
            globalLeftUpperArmAngleDeg: 90
        },
        {
            // EXPANDED FRAME 525
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 109.67,
            leftUpperArmAngleDeg: 69.33,
            leftElbowAngleDeg: 9.33,
            rightUpperArmAngleDeg: 194.43,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 109.67,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -18.55,
            displacementX: -179.54,
            globalLeftUpperArmAngleDeg: 89
        },
        {
            // EXPANDED FRAME 526
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 109.33,
            leftUpperArmAngleDeg: 68.67,
            leftElbowAngleDeg: 8.67,
            rightUpperArmAngleDeg: 193.87,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 109.33,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -17.91,
            displacementX: -179.58,
            globalLeftUpperArmAngleDeg: 88
        },
        {
            // EXPANDED FRAME 527
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 109.00,
            leftUpperArmAngleDeg: 68.00,
            leftElbowAngleDeg: 8.00,
            rightUpperArmAngleDeg: 193.30,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 109.00,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -17.26,
            displacementX: -179.62,
            globalLeftUpperArmAngleDeg: 87
        },
        {
            // EXPANDED FRAME 528
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 108.67,
            leftUpperArmAngleDeg: 67.33,
            leftElbowAngleDeg: 7.33,
            rightUpperArmAngleDeg: 192.73,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 108.67,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -16.61,
            displacementX: -179.66,
            globalLeftUpperArmAngleDeg: 86
        },
        {
            // EXPANDED FRAME 529
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 108.33,
            leftUpperArmAngleDeg: 66.67,
            leftElbowAngleDeg: 6.67,
            rightUpperArmAngleDeg: 192.17,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 108.33,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -15.97,
            displacementX: -179.70,
            globalLeftUpperArmAngleDeg: 85
        },
        {
            // EXPANDED FRAME 530
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 108.00,
            leftUpperArmAngleDeg: 66.00,
            leftElbowAngleDeg: 6.00,
            rightUpperArmAngleDeg: 191.60,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 108.00,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -15.32,
            displacementX: -179.74,
            globalLeftUpperArmAngleDeg: 84
        },
        {
            // EXPANDED FRAME 531
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 107.67,
            leftUpperArmAngleDeg: 65.33,
            leftElbowAngleDeg: 5.33,
            rightUpperArmAngleDeg: 191.03,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 107.67,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -14.67,
            displacementX: -179.78,
            globalLeftUpperArmAngleDeg: 83
        },
        {
            // EXPANDED FRAME 532
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 107.33,
            leftUpperArmAngleDeg: 64.67,
            leftElbowAngleDeg: 4.67,
            rightUpperArmAngleDeg: 190.47,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 107.33,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -14.03,
            displacementX: -179.82,
            globalLeftUpperArmAngleDeg: 82
        },
        {
            // EXPANDED FRAME 533
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 107.00,
            leftUpperArmAngleDeg: 64.00,
            leftElbowAngleDeg: 4.00,
            rightUpperArmAngleDeg: 189.90,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 107.00,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -13.38,
            displacementX: -179.86,
            globalLeftUpperArmAngleDeg: 81
        },
        {
            // EXPANDED FRAME 534
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 106.67,
            leftUpperArmAngleDeg: 63.33,
            leftElbowAngleDeg: 3.33,
            rightUpperArmAngleDeg: 189.33,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 106.67,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -12.73,
            displacementX: -179.90,
            globalLeftUpperArmAngleDeg: 80
        },
        {
            // EXPANDED FRAME 535
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 106.33,
            leftUpperArmAngleDeg: 62.67,
            leftElbowAngleDeg: 2.67,
            rightUpperArmAngleDeg: 188.77,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 106.33,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -12.09,
            displacementX: -179.94,
            globalLeftUpperArmAngleDeg: 79
        },
        {
            // EXPANDED FRAME 536
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 106.00,
            leftUpperArmAngleDeg: 62.00,
            leftElbowAngleDeg: 2.00,
            rightUpperArmAngleDeg: 188.20,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 106.00,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -11.44,
            displacementX: -179.98,
            globalLeftUpperArmAngleDeg: 78
        },
        {
            // EXPANDED FRAME 537
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 105.67,
            leftUpperArmAngleDeg: 61.33,
            leftElbowAngleDeg: 1.33,
            rightUpperArmAngleDeg: 187.63,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 105.67,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -10.79,
            displacementX: -180.02,
            globalLeftUpperArmAngleDeg: 77
        },
        {
            // EXPANDED FRAME 538
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 105.33,
            leftUpperArmAngleDeg: 60.67,
            leftElbowAngleDeg: 0.67,
            rightUpperArmAngleDeg: 187.07,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 105.33,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -10.15,
            displacementX: -180.06,
            globalLeftUpperArmAngleDeg: 76
        },
        {
            // EXPANDED FRAME 539
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 105.00,
            leftUpperArmAngleDeg: 60.00,
            leftElbowAngleDeg: 0.00,
            rightUpperArmAngleDeg: 186.50,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 105.00,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -9.50,
            displacementX: -180.10,
            globalLeftUpperArmAngleDeg: 75
        },
        {
            // EXPANDED FRAME 540
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 104.67,
            leftUpperArmAngleDeg: 59.33,
            leftElbowAngleDeg: -0.67,
            rightUpperArmAngleDeg: 185.93,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 104.67,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -8.85,
            displacementX: -180.13,
            globalLeftUpperArmAngleDeg: 74
        },
        {
            // EXPANDED FRAME 541
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 104.33,
            leftUpperArmAngleDeg: 58.67,
            leftElbowAngleDeg: -1.33,
            rightUpperArmAngleDeg: 185.37,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 104.33,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -8.21,
            displacementX: -180.17,
            globalLeftUpperArmAngleDeg: 73
        },
        {
            // EXPANDED FRAME 542
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 104.00,
            leftUpperArmAngleDeg: 58.00,
            leftElbowAngleDeg: -2.00,
            rightUpperArmAngleDeg: 184.80,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 104.00,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -7.56,
            displacementX: -180.20,
            globalLeftUpperArmAngleDeg: 72
        },
        {
            // EXPANDED FRAME 543
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 103.67,
            leftUpperArmAngleDeg: 57.33,
            leftElbowAngleDeg: -2.67,
            rightUpperArmAngleDeg: 184.23,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 103.67,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -6.91,
            displacementX: -180.23,
            globalLeftUpperArmAngleDeg: 71
        },
        {
            // EXPANDED FRAME 544
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 103.33,
            leftUpperArmAngleDeg: 56.67,
            leftElbowAngleDeg: -3.33,
            rightUpperArmAngleDeg: 183.67,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 103.33,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -6.27,
            displacementX: -180.27,
            globalLeftUpperArmAngleDeg: 70
        },
        {
            // EXPANDED FRAME 545
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 103.00,
            leftUpperArmAngleDeg: 56.00,
            leftElbowAngleDeg: -4.00,
            rightUpperArmAngleDeg: 183.10,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 103.00,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -5.62,
            displacementX: -180.30,
            globalLeftUpperArmAngleDeg: 69
        },
        {
            // EXPANDED FRAME 546
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 102.67,
            leftUpperArmAngleDeg: 55.33,
            leftElbowAngleDeg: -4.67,
            rightUpperArmAngleDeg: 182.53,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 102.67,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -4.97,
            displacementX: -180.33,
            globalLeftUpperArmAngleDeg: 68
        },
        {
            // EXPANDED FRAME 547
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 102.33,
            leftUpperArmAngleDeg: 54.67,
            leftElbowAngleDeg: -5.33,
            rightUpperArmAngleDeg: 181.97,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 102.33,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -4.33,
            displacementX: -180.37,
            globalLeftUpperArmAngleDeg: 67
        },
        {
            // EXPANDED FRAME 548
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 102.00,
            leftUpperArmAngleDeg: 54.00,
            leftElbowAngleDeg: -6.00,
            rightUpperArmAngleDeg: 181.40,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 102.00,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -3.68,
            displacementX: -180.40,
            globalLeftUpperArmAngleDeg: 66
        },
        {
            // EXPANDED FRAME 549
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 101.67,
            leftUpperArmAngleDeg: 53.33,
            leftElbowAngleDeg: -6.67,
            rightUpperArmAngleDeg: 180.83,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 101.67,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -3.03,
            displacementX: -180.43,
            globalLeftUpperArmAngleDeg: 65
        },
        {
            // EXPANDED FRAME 550
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 101.33,
            leftUpperArmAngleDeg: 52.67,
            leftElbowAngleDeg: -7.33,
            rightUpperArmAngleDeg: 180.27,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 101.33,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -2.39,
            displacementX: -180.47,
            globalLeftUpperArmAngleDeg: 64
        },
        {
            // EXPANDED FRAME 551
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 101.00,
            leftUpperArmAngleDeg: 52.00,
            leftElbowAngleDeg: -8.00,
            rightUpperArmAngleDeg: 179.70,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 101.00,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -1.74,
            displacementX: -180.50,
            globalLeftUpperArmAngleDeg: 63
        },
        {
            // EXPANDED FRAME 552
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.67,
            leftUpperArmAngleDeg: 51.33,
            leftElbowAngleDeg: -8.67,
            rightUpperArmAngleDeg: 179.13,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 100.67,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -1.09,
            displacementX: -180.53,
            globalLeftUpperArmAngleDeg: 62
        },
        {
            // EXPANDED FRAME 553
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.33,
            leftUpperArmAngleDeg: 50.67,
            leftElbowAngleDeg: -9.33,
            rightUpperArmAngleDeg: 178.57,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 100.33,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: -0.45,
            displacementX: -180.57,
            globalLeftUpperArmAngleDeg: 61
        },
        {
            // EXPANDED FRAME 554
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 50.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 178.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 100.00,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 0.20,
            displacementX: -180.60,
            globalLeftUpperArmAngleDeg: 60
        },
        {
            // EXPANDED FRAME 555
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 49.00,
            leftElbowAngleDeg: -10.20,
            rightUpperArmAngleDeg: 176.88,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 99.40,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -0.60,
            rightKneeAngleDeg: -59.20,
            hipYOffset: 0.20,
            displacementX: -180.64,
            globalLeftUpperArmAngleDeg: 59
        },
        {
            // EXPANDED FRAME 556
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 48.00,
            leftElbowAngleDeg: -10.40,
            rightUpperArmAngleDeg: 175.76,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 98.80,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -1.20,
            rightKneeAngleDeg: -58.40,
            hipYOffset: 0.20,
            displacementX: -180.68,
            globalLeftUpperArmAngleDeg: 58
        },
        {
            // EXPANDED FRAME 557
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 47.00,
            leftElbowAngleDeg: -10.60,
            rightUpperArmAngleDeg: 174.64,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 98.20,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -1.80,
            rightKneeAngleDeg: -57.60,
            hipYOffset: 0.20,
            displacementX: -180.72,
            globalLeftUpperArmAngleDeg: 57
        },
        {
            // EXPANDED FRAME 558
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 46.00,
            leftElbowAngleDeg: -10.80,
            rightUpperArmAngleDeg: 173.52,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 97.60,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -2.40,
            rightKneeAngleDeg: -56.80,
            hipYOffset: 0.20,
            displacementX: -180.76,
            globalLeftUpperArmAngleDeg: 56
        },
        {
            // EXPANDED FRAME 559
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 45.00,
            leftElbowAngleDeg: -11.00,
            rightUpperArmAngleDeg: 172.40,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 97.00,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -3.00,
            rightKneeAngleDeg: -56.00,
            hipYOffset: 0.20,
            displacementX: -180.80,
            globalLeftUpperArmAngleDeg: 55
        },
        {
            // EXPANDED FRAME 560
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 44.00,
            leftElbowAngleDeg: -11.20,
            rightUpperArmAngleDeg: 171.28,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 96.40,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -3.60,
            rightKneeAngleDeg: -55.20,
            hipYOffset: 0.20,
            displacementX: -180.84,
            globalLeftUpperArmAngleDeg: 54
        },
        {
            // EXPANDED FRAME 561
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 43.00,
            leftElbowAngleDeg: -11.40,
            rightUpperArmAngleDeg: 170.16,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 95.80,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -4.20,
            rightKneeAngleDeg: -54.40,
            hipYOffset: 0.20,
            displacementX: -180.88,
            globalLeftUpperArmAngleDeg: 53
        },
        {
            // EXPANDED FRAME 562
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 42.00,
            leftElbowAngleDeg: -11.60,
            rightUpperArmAngleDeg: 169.04,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 95.20,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -4.80,
            rightKneeAngleDeg: -53.60,
            hipYOffset: 0.20,
            displacementX: -180.92,
            globalLeftUpperArmAngleDeg: 52
        },
        {
            // EXPANDED FRAME 563
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 41.00,
            leftElbowAngleDeg: -11.80,
            rightUpperArmAngleDeg: 167.92,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 94.60,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -5.40,
            rightKneeAngleDeg: -52.80,
            hipYOffset: 0.20,
            displacementX: -180.96,
            globalLeftUpperArmAngleDeg: 51
        },
        {
            // EXPANDED FRAME 564
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 40.00,
            leftElbowAngleDeg: -12.00,
            rightUpperArmAngleDeg: 166.80,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 94.00,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -6.00,
            rightKneeAngleDeg: -52.00,
            hipYOffset: 0.20,
            displacementX: -181.00,
            globalLeftUpperArmAngleDeg: 50
        },
        {
            // EXPANDED FRAME 565
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 39.00,
            leftElbowAngleDeg: -12.20,
            rightUpperArmAngleDeg: 165.68,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 93.40,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -6.60,
            rightKneeAngleDeg: -51.20,
            hipYOffset: 0.20,
            displacementX: -181.04,
            globalLeftUpperArmAngleDeg: 49
        },
        {
            // EXPANDED FRAME 566
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 38.00,
            leftElbowAngleDeg: -12.40,
            rightUpperArmAngleDeg: 164.56,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 92.80,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -7.20,
            rightKneeAngleDeg: -50.40,
            hipYOffset: 0.20,
            displacementX: -181.08,
            globalLeftUpperArmAngleDeg: 48
        },
        {
            // EXPANDED FRAME 567
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 36.50,
            leftElbowAngleDeg: -12.70,
            rightUpperArmAngleDeg: 162.88,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 91.90,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -8.10,
            rightKneeAngleDeg: -49.20,
            hipYOffset: 0.20,
            displacementX: -181.14,
            globalLeftUpperArmAngleDeg: 47
        },
        {
            // EXPANDED FRAME 568
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 35.50,
            leftElbowAngleDeg: -12.90,
            rightUpperArmAngleDeg: 161.76,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 91.30,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -8.70,
            rightKneeAngleDeg: -48.40,
            hipYOffset: 0.20,
            displacementX: -181.18,
            globalLeftUpperArmAngleDeg: 46
        },
        {
            // EXPANDED FRAME 569
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 34.50,
            leftElbowAngleDeg: -13.10,
            rightUpperArmAngleDeg: 160.64,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 90.70,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -9.30,
            rightKneeAngleDeg: -47.60,
            hipYOffset: 0.20,
            displacementX: -181.22,
            globalLeftUpperArmAngleDeg: 45
        },
        {
            // EXPANDED FRAME 570
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 33.50,
            leftElbowAngleDeg: -13.30,
            rightUpperArmAngleDeg: 159.52,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 90.10,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -9.90,
            rightKneeAngleDeg: -46.80,
            hipYOffset: 0.20,
            displacementX: -181.26,
            globalLeftUpperArmAngleDeg: 44
        },
        {
            // EXPANDED FRAME 571
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 32.50,
            leftElbowAngleDeg: -13.50,
            rightUpperArmAngleDeg: 158.40,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 89.50,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -10.50,
            rightKneeAngleDeg: -46.00,
            hipYOffset: 0.20,
            displacementX: -181.30,
            globalLeftUpperArmAngleDeg: 43
        },
        {
            // EXPANDED FRAME 572
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 31.50,
            leftElbowAngleDeg: -13.70,
            rightUpperArmAngleDeg: 157.28,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 88.90,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -11.10,
            rightKneeAngleDeg: -45.20,
            hipYOffset: 0.20,
            displacementX: -181.34,
            globalLeftUpperArmAngleDeg: 42
        },
        {
            // EXPANDED FRAME 573
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 30.50,
            leftElbowAngleDeg: -13.90,
            rightUpperArmAngleDeg: 156.16,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 88.30,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -11.70,
            rightKneeAngleDeg: -44.40,
            hipYOffset: 0.20,
            displacementX: -181.38,
            globalLeftUpperArmAngleDeg: 41
        },
        {
            // EXPANDED FRAME 574
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 29.50,
            leftElbowAngleDeg: -14.10,
            rightUpperArmAngleDeg: 155.04,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 87.70,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -12.30,
            rightKneeAngleDeg: -43.60,
            hipYOffset: 0.20,
            displacementX: -181.42,
            globalLeftUpperArmAngleDeg: 40
        },
        {
            // EXPANDED FRAME 575
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 28.50,
            leftElbowAngleDeg: -14.30,
            rightUpperArmAngleDeg: 153.92,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 87.10,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -12.90,
            rightKneeAngleDeg: -42.80,
            hipYOffset: 0.20,
            displacementX: -181.46,
            globalLeftUpperArmAngleDeg: 39
        },
        {
            // EXPANDED FRAME 576
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 27.50,
            leftElbowAngleDeg: -14.50,
            rightUpperArmAngleDeg: 152.80,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 86.50,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -13.50,
            rightKneeAngleDeg: -42.00,
            hipYOffset: 0.20,
            displacementX: -181.50,
            globalLeftUpperArmAngleDeg: 38
        },
        {
            // EXPANDED FRAME 577
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 26.50,
            leftElbowAngleDeg: -14.70,
            rightUpperArmAngleDeg: 151.68,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.90,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -14.10,
            rightKneeAngleDeg: -41.20,
            hipYOffset: 0.20,
            displacementX: -181.54,
            globalLeftUpperArmAngleDeg: 37
        },
        {
            // EXPANDED FRAME 578
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 100.00,
            leftUpperArmAngleDeg: 25.50,
            leftElbowAngleDeg: -14.90,
            rightUpperArmAngleDeg: 150.56,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.30,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -14.70,
            rightKneeAngleDeg: -40.40,
            hipYOffset: 0.20,
            displacementX: -181.58,
            globalLeftUpperArmAngleDeg: 36
        },
        {
            // EXPANDED FRAME 579
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 99.50,
            leftUpperArmAngleDeg: 25.25,
            leftElbowAngleDeg: -14.95,
            rightUpperArmAngleDeg: 150.28,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.15,
            leftThighAngleDeg: 145.33,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -14.85,
            rightKneeAngleDeg: -40.53,
            hipYOffset: 0.86,
            displacementX: -181.61,
            globalLeftUpperArmAngleDeg: 35
        },
        {
            // EXPANDED FRAME 580
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 99.00,
            leftUpperArmAngleDeg: 25.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 150.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 145.67,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -15.00,
            rightKneeAngleDeg: -40.67,
            hipYOffset: 1.52,
            displacementX: -181.64,
            globalLeftUpperArmAngleDeg: 34
        },
        {
            // EXPANDED FRAME 581
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 98.00,
            leftUpperArmAngleDeg: 25.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 150.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 146.33,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -15.00,
            rightKneeAngleDeg: -41.33,
            hipYOffset: 2.84,
            displacementX: -181.68,
            globalLeftUpperArmAngleDeg: 33
        },
        {
            // EXPANDED FRAME 582
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 97.00,
            leftUpperArmAngleDeg: 25.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 150.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 147.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -15.00,
            rightKneeAngleDeg: -42.00,
            hipYOffset: 4.16,
            displacementX: -181.72,
            globalLeftUpperArmAngleDeg: 32
        },
        {
            // EXPANDED FRAME 583
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 96.00,
            leftUpperArmAngleDeg: 25.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 150.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 147.67,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -15.00,
            rightKneeAngleDeg: -42.67,
            hipYOffset: 5.48,
            displacementX: -181.76,
            globalLeftUpperArmAngleDeg: 31
        },
        {
            // EXPANDED FRAME 584
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 95.00,
            leftUpperArmAngleDeg: 25.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 150.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 148.33,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -15.00,
            rightKneeAngleDeg: -43.33,
            hipYOffset: 6.80,
            displacementX: -181.80,
            globalLeftUpperArmAngleDeg: 30
        },
        {
            // EXPANDED FRAME 585
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 94.00,
            leftUpperArmAngleDeg: 25.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 150.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 149.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -15.00,
            rightKneeAngleDeg: -44.00,
            hipYOffset: 8.12,
            displacementX: -181.84,
            globalLeftUpperArmAngleDeg: 29
        },
        {
            // EXPANDED FRAME 586
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 93.00,
            leftUpperArmAngleDeg: 25.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 150.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 149.67,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -15.00,
            rightKneeAngleDeg: -44.67,
            hipYOffset: 9.44,
            displacementX: -181.88,
            globalLeftUpperArmAngleDeg: 28
        },
        {
            // EXPANDED FRAME 587
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 91.50,
            leftUpperArmAngleDeg: 25.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 150.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 150.67,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -15.00,
            rightKneeAngleDeg: -45.67,
            hipYOffset: 11.42,
            displacementX: -181.95,
            globalLeftUpperArmAngleDeg: 27
        },
        {
            // EXPANDED FRAME 588
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 90.50,
            leftUpperArmAngleDeg: 25.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 150.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 151.33,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -15.00,
            rightKneeAngleDeg: -46.33,
            hipYOffset: 12.74,
            displacementX: -182.01,
            globalLeftUpperArmAngleDeg: 26
        },
        {
            // EXPANDED FRAME 589
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 89.50,
            leftUpperArmAngleDeg: 25.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 150.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 152.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -15.00,
            rightKneeAngleDeg: -47.00,
            hipYOffset: 14.06,
            displacementX: -182.06,
            globalLeftUpperArmAngleDeg: 25
        },
        {
            // EXPANDED FRAME 590
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 88.50,
            leftUpperArmAngleDeg: 25.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 150.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 152.67,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -15.00,
            rightKneeAngleDeg: -47.67,
            hipYOffset: 15.38,
            displacementX: -182.11,
            globalLeftUpperArmAngleDeg: 24
        },
        {
            // EXPANDED FRAME 591
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 87.50,
            leftUpperArmAngleDeg: 25.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 150.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 153.33,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -15.00,
            rightKneeAngleDeg: -48.33,
            hipYOffset: 16.70,
            displacementX: -182.17,
            globalLeftUpperArmAngleDeg: 23
        },
        {
            // EXPANDED FRAME 592
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 86.50,
            leftUpperArmAngleDeg: 25.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 150.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 154.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -15.00,
            rightKneeAngleDeg: -49.00,
            hipYOffset: 18.02,
            displacementX: -182.22,
            globalLeftUpperArmAngleDeg: 22
        },
        {
            // EXPANDED FRAME 593
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 85.50,
            leftUpperArmAngleDeg: 25.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 150.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 154.67,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -15.00,
            rightKneeAngleDeg: -49.67,
            hipYOffset: 19.34,
            displacementX: -182.27,
            globalLeftUpperArmAngleDeg: 21
        },
        {
            // EXPANDED FRAME 594
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 85.50,
            leftUpperArmAngleDeg: 25.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 150.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 154.67,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -15.00,
            rightKneeAngleDeg: -49.67,
            hipYOffset: 19.34,
            displacementX: -182.27,
            globalLeftUpperArmAngleDeg: 20
        },
        {
            // EXPANDED FRAME 595
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 84.75,
            leftUpperArmAngleDeg: 24.25,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 149.25,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 154.25,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -14.25,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.33,
            globalLeftUpperArmAngleDeg: 19
        },
        {
            // EXPANDED FRAME 596
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 84.50,
            leftUpperArmAngleDeg: 23.50,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 148.50,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 153.50,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -13.50,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.36,
            globalLeftUpperArmAngleDeg: 18
        },
        {
            // EXPANDED FRAME 597
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 84.25,
            leftUpperArmAngleDeg: 22.75,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 147.75,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 152.75,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -12.75,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.39,
            globalLeftUpperArmAngleDeg: 17
        },
        {
            // EXPANDED FRAME 598
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 84.00,
            leftUpperArmAngleDeg: 22.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 147.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 152.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -12.00,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.42,
            globalLeftUpperArmAngleDeg: 16
        },
        {
            // EXPANDED FRAME 599
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 83.75,
            leftUpperArmAngleDeg: 21.25,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 146.25,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 151.25,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -11.25,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.45,
            globalLeftUpperArmAngleDeg: 15
        },
        {
            // EXPANDED FRAME 600
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 83.50,
            leftUpperArmAngleDeg: 20.50,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 145.50,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 150.50,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -10.50,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.48,
            globalLeftUpperArmAngleDeg: 14
        },
        {
            // EXPANDED FRAME 601
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 83.25,
            leftUpperArmAngleDeg: 19.75,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 144.75,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 149.75,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -9.75,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.51,
            globalLeftUpperArmAngleDeg: 13
        },
        {
            // EXPANDED FRAME 602
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 83.00,
            leftUpperArmAngleDeg: 19.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 144.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 149.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -9.00,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.54,
            globalLeftUpperArmAngleDeg: 12
        },
        {
            // EXPANDED FRAME 603
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 82.75,
            leftUpperArmAngleDeg: 18.25,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 143.25,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 148.25,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -8.25,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.57,
            globalLeftUpperArmAngleDeg: 11
        },
        {
            // EXPANDED FRAME 604
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 82.50,
            leftUpperArmAngleDeg: 17.50,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 142.50,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 147.50,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -7.50,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.60,
            globalLeftUpperArmAngleDeg: 10
        },
        {
            // EXPANDED FRAME 605
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 82.25,
            leftUpperArmAngleDeg: 16.75,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 141.75,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 146.75,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -6.75,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.62,
            globalLeftUpperArmAngleDeg: 9
        },
        {
            // EXPANDED FRAME 606
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 82.00,
            leftUpperArmAngleDeg: 16.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 141.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 146.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -6.00,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.64,
            globalLeftUpperArmAngleDeg: 8
        },
        {
            // EXPANDED FRAME 607
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 81.75,
            leftUpperArmAngleDeg: 15.25,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 140.25,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 145.25,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -5.25,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.66,
            globalLeftUpperArmAngleDeg: 7
        },
        {
            // EXPANDED FRAME 608
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 81.50,
            leftUpperArmAngleDeg: 14.50,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 139.50,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 144.50,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -4.50,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.68,
            globalLeftUpperArmAngleDeg: 6
        },
        {
            // EXPANDED FRAME 609
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 81.25,
            leftUpperArmAngleDeg: 13.75,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 138.75,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 143.75,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -3.75,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.70,
            globalLeftUpperArmAngleDeg: 5
        },
        {
            // EXPANDED FRAME 610
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 81.00,
            leftUpperArmAngleDeg: 13.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 138.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 143.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -3.00,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.72,
            globalLeftUpperArmAngleDeg: 4
        },
        {
            // EXPANDED FRAME 611
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 80.75,
            leftUpperArmAngleDeg: 12.25,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 137.25,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 142.25,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -2.25,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.74,
            globalLeftUpperArmAngleDeg: 3
        },
        {
            // EXPANDED FRAME 612
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 80.50,
            leftUpperArmAngleDeg: 11.50,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 136.50,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 141.50,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -1.50,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.76,
            globalLeftUpperArmAngleDeg: 2
        },
        {
            // EXPANDED FRAME 613
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 80.25,
            leftUpperArmAngleDeg: 10.75,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 135.75,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.75,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: -0.75,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.78,
            globalLeftUpperArmAngleDeg: 1
        },
        {
            // EXPANDED FRAME 614
            spineAngleDeg: -90.00,
            shoulderJointDist: -60.00,
            shoulderJointAngleDeg: 80.00,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -15.00,
            rightUpperArmAngleDeg: 135.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 35.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 75.00,
            leftKneeAngleDeg: 0.00,
            rightKneeAngleDeg: -50.00,
            hipYOffset: 20.00,
            displacementX: -182.80,
            globalLeftUpperArmAngleDeg: 0
        },
        {
            // EXPANDED FRAME 615
            spineAngleDeg: -90.40,
            shoulderJointDist: -60.40,
            shoulderJointAngleDeg: 79.40,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -14.60,
            rightUpperArmAngleDeg: 134.80,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 34.20,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 76.00,
            leftKneeAngleDeg: 0.08,
            rightKneeAngleDeg: -50.40,
            hipYOffset: 19.40,
            displacementX: -182.82,
            globalLeftUpperArmAngleDeg: 359
        },
        {
            // EXPANDED FRAME 616
            spineAngleDeg: -90.80,
            shoulderJointDist: -60.80,
            shoulderJointAngleDeg: 78.80,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -14.20,
            rightUpperArmAngleDeg: 134.60,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 33.40,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 77.00,
            leftKneeAngleDeg: 0.16,
            rightKneeAngleDeg: -50.80,
            hipYOffset: 18.80,
            displacementX: -182.85,
            globalLeftUpperArmAngleDeg: 358
        },
        {
            // EXPANDED FRAME 617
            spineAngleDeg: -91.20,
            shoulderJointDist: -61.20,
            shoulderJointAngleDeg: 78.20,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -13.80,
            rightUpperArmAngleDeg: 134.40,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 32.60,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 78.00,
            leftKneeAngleDeg: 0.24,
            rightKneeAngleDeg: -51.20,
            hipYOffset: 18.20,
            displacementX: -182.87,
            globalLeftUpperArmAngleDeg: 357
        },
        {
            // EXPANDED FRAME 618
            spineAngleDeg: -91.60,
            shoulderJointDist: -61.60,
            shoulderJointAngleDeg: 77.60,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -13.40,
            rightUpperArmAngleDeg: 134.20,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 31.80,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 79.00,
            leftKneeAngleDeg: 0.32,
            rightKneeAngleDeg: -51.60,
            hipYOffset: 17.60,
            displacementX: -182.90,
            globalLeftUpperArmAngleDeg: 356
        },
        {
            // EXPANDED FRAME 619
            spineAngleDeg: -92.00,
            shoulderJointDist: -62.00,
            shoulderJointAngleDeg: 77.00,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -13.00,
            rightUpperArmAngleDeg: 134.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 31.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 80.00,
            leftKneeAngleDeg: 0.40,
            rightKneeAngleDeg: -52.00,
            hipYOffset: 17.00,
            displacementX: -182.92,
            globalLeftUpperArmAngleDeg: 355
        },
        {
            // EXPANDED FRAME 620
            spineAngleDeg: -92.40,
            shoulderJointDist: -62.40,
            shoulderJointAngleDeg: 76.40,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -12.60,
            rightUpperArmAngleDeg: 133.80,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 30.20,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 81.00,
            leftKneeAngleDeg: 0.48,
            rightKneeAngleDeg: -52.40,
            hipYOffset: 16.40,
            displacementX: -182.94,
            globalLeftUpperArmAngleDeg: 354
        },
        {
            // EXPANDED FRAME 621
            spineAngleDeg: -92.80,
            shoulderJointDist: -62.80,
            shoulderJointAngleDeg: 75.80,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -12.20,
            rightUpperArmAngleDeg: 133.60,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 29.40,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 82.00,
            leftKneeAngleDeg: 0.56,
            rightKneeAngleDeg: -52.80,
            hipYOffset: 15.80,
            displacementX: -182.97,
            globalLeftUpperArmAngleDeg: 353
        },
        {
            // EXPANDED FRAME 622
            spineAngleDeg: -93.20,
            shoulderJointDist: -63.20,
            shoulderJointAngleDeg: 75.20,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -11.80,
            rightUpperArmAngleDeg: 133.40,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 28.60,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 83.00,
            leftKneeAngleDeg: 0.64,
            rightKneeAngleDeg: -53.20,
            hipYOffset: 15.20,
            displacementX: -182.99,
            globalLeftUpperArmAngleDeg: 352
        },
        {
            // EXPANDED FRAME 623
            spineAngleDeg: -93.60,
            shoulderJointDist: -63.60,
            shoulderJointAngleDeg: 74.60,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -11.40,
            rightUpperArmAngleDeg: 133.20,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 27.80,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 84.00,
            leftKneeAngleDeg: 0.72,
            rightKneeAngleDeg: -53.60,
            hipYOffset: 14.60,
            displacementX: -183.02,
            globalLeftUpperArmAngleDeg: 351
        },
        {
            // EXPANDED FRAME 624
            spineAngleDeg: -94.00,
            shoulderJointDist: -64.00,
            shoulderJointAngleDeg: 74.00,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -11.00,
            rightUpperArmAngleDeg: 133.00,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 27.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 85.00,
            leftKneeAngleDeg: 0.80,
            rightKneeAngleDeg: -54.00,
            hipYOffset: 14.00,
            displacementX: -183.04,
            globalLeftUpperArmAngleDeg: 350
        },
        {
            // EXPANDED FRAME 625
            spineAngleDeg: -94.40,
            shoulderJointDist: -64.40,
            shoulderJointAngleDeg: 73.40,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -10.60,
            rightUpperArmAngleDeg: 132.80,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 26.20,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 86.00,
            leftKneeAngleDeg: 0.88,
            rightKneeAngleDeg: -54.40,
            hipYOffset: 13.40,
            displacementX: -183.06,
            globalLeftUpperArmAngleDeg: 349
        },
        {
            // EXPANDED FRAME 626
            spineAngleDeg: -94.80,
            shoulderJointDist: -64.80,
            shoulderJointAngleDeg: 72.80,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -10.20,
            rightUpperArmAngleDeg: 132.60,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 25.40,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 87.00,
            leftKneeAngleDeg: 0.96,
            rightKneeAngleDeg: -54.80,
            hipYOffset: 12.80,
            displacementX: -183.09,
            globalLeftUpperArmAngleDeg: 348
        },
        {
            // EXPANDED FRAME 627
            spineAngleDeg: -95.40,
            shoulderJointDist: -65.40,
            shoulderJointAngleDeg: 71.90,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -9.60,
            rightUpperArmAngleDeg: 132.30,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 24.20,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 88.50,
            leftKneeAngleDeg: 1.08,
            rightKneeAngleDeg: -55.40,
            hipYOffset: 11.90,
            displacementX: -183.11,
            globalLeftUpperArmAngleDeg: 347
        },
        {
            // EXPANDED FRAME 628
            spineAngleDeg: -95.80,
            shoulderJointDist: -65.80,
            shoulderJointAngleDeg: 71.30,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -9.20,
            rightUpperArmAngleDeg: 132.10,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 23.40,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 89.50,
            leftKneeAngleDeg: 1.16,
            rightKneeAngleDeg: -55.80,
            hipYOffset: 11.30,
            displacementX: -183.12,
            globalLeftUpperArmAngleDeg: 346
        },
        {
            // EXPANDED FRAME 629
            spineAngleDeg: -96.20,
            shoulderJointDist: -66.20,
            shoulderJointAngleDeg: 70.70,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -8.80,
            rightUpperArmAngleDeg: 131.90,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 22.60,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 90.50,
            leftKneeAngleDeg: 1.24,
            rightKneeAngleDeg: -56.20,
            hipYOffset: 10.70,
            displacementX: -183.12,
            globalLeftUpperArmAngleDeg: 345
        },
        {
            // EXPANDED FRAME 630
            spineAngleDeg: -96.60,
            shoulderJointDist: -66.60,
            shoulderJointAngleDeg: 70.10,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -8.40,
            rightUpperArmAngleDeg: 131.70,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 21.80,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 91.50,
            leftKneeAngleDeg: 1.32,
            rightKneeAngleDeg: -56.60,
            hipYOffset: 10.10,
            displacementX: -183.13,
            globalLeftUpperArmAngleDeg: 344
        },
        {
            // EXPANDED FRAME 631
            spineAngleDeg: -97.00,
            shoulderJointDist: -67.00,
            shoulderJointAngleDeg: 69.50,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -8.00,
            rightUpperArmAngleDeg: 131.50,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 21.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 92.50,
            leftKneeAngleDeg: 1.40,
            rightKneeAngleDeg: -57.00,
            hipYOffset: 9.50,
            displacementX: -183.14,
            globalLeftUpperArmAngleDeg: 343
        },
        {
            // EXPANDED FRAME 632
            spineAngleDeg: -97.40,
            shoulderJointDist: -67.40,
            shoulderJointAngleDeg: 68.90,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -7.60,
            rightUpperArmAngleDeg: 131.30,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 20.20,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 93.50,
            leftKneeAngleDeg: 1.48,
            rightKneeAngleDeg: -57.40,
            hipYOffset: 8.90,
            displacementX: -183.15,
            globalLeftUpperArmAngleDeg: 342
        },
        {
            // EXPANDED FRAME 633
            spineAngleDeg: -97.80,
            shoulderJointDist: -67.80,
            shoulderJointAngleDeg: 68.30,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -7.20,
            rightUpperArmAngleDeg: 131.10,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 19.40,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 94.50,
            leftKneeAngleDeg: 1.56,
            rightKneeAngleDeg: -57.80,
            hipYOffset: 8.30,
            displacementX: -183.16,
            globalLeftUpperArmAngleDeg: 341
        },
        {
            // EXPANDED FRAME 634
            spineAngleDeg: -98.20,
            shoulderJointDist: -68.20,
            shoulderJointAngleDeg: 67.70,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -6.80,
            rightUpperArmAngleDeg: 130.90,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 18.60,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 95.50,
            leftKneeAngleDeg: 1.64,
            rightKneeAngleDeg: -58.20,
            hipYOffset: 7.70,
            displacementX: -183.16,
            globalLeftUpperArmAngleDeg: 340
        },
        {
            // EXPANDED FRAME 635
            spineAngleDeg: -98.60,
            shoulderJointDist: -68.60,
            shoulderJointAngleDeg: 67.10,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -6.40,
            rightUpperArmAngleDeg: 130.70,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 17.80,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 96.50,
            leftKneeAngleDeg: 1.72,
            rightKneeAngleDeg: -58.60,
            hipYOffset: 7.10,
            displacementX: -183.17,
            globalLeftUpperArmAngleDeg: 339
        },
        {
            // EXPANDED FRAME 636
            spineAngleDeg: -99.00,
            shoulderJointDist: -69.00,
            shoulderJointAngleDeg: 66.50,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -6.00,
            rightUpperArmAngleDeg: 130.50,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 17.00,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 97.50,
            leftKneeAngleDeg: 1.80,
            rightKneeAngleDeg: -59.00,
            hipYOffset: 6.50,
            displacementX: -183.18,
            globalLeftUpperArmAngleDeg: 338
        },
        {
            // EXPANDED FRAME 637
            spineAngleDeg: -99.40,
            shoulderJointDist: -69.40,
            shoulderJointAngleDeg: 65.90,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -5.60,
            rightUpperArmAngleDeg: 130.30,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 16.20,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 98.50,
            leftKneeAngleDeg: 1.88,
            rightKneeAngleDeg: -59.40,
            hipYOffset: 5.90,
            displacementX: -183.19,
            globalLeftUpperArmAngleDeg: 337
        },
        {
            // EXPANDED FRAME 638
            spineAngleDeg: -99.80,
            shoulderJointDist: -69.80,
            shoulderJointAngleDeg: 65.30,
            leftUpperArmAngleDeg: 10.00,
            leftElbowAngleDeg: -5.20,
            rightUpperArmAngleDeg: 130.10,
            rightElbowAngleDeg: 30.00,
            pelvisJointDist: 15.40,
            pelvisJointAngleDeg: 85.00,
            leftThighAngleDeg: 140.00,
            rightThighAngleDeg: 99.50,
            leftKneeAngleDeg: 1.96,
            rightKneeAngleDeg: -59.80,
            hipYOffset: 5.30,
            displacementX: -183.20,
            globalLeftUpperArmAngleDeg: 336
        },
        {
            // EXPANDED FRAME 639
            spineAngleDeg: -100.15,
            shoulderJointDist: -69.90,
            shoulderJointAngleDeg: 64.84,
            leftUpperArmAngleDeg: 10.07,
            leftElbowAngleDeg: -5.04,
            rightUpperArmAngleDeg: 130.18,
            rightElbowAngleDeg: 30.25,
            pelvisJointDist: 15.02,
            pelvisJointAngleDeg: 84.94,
            leftThighAngleDeg: 140.31,
            rightThighAngleDeg: 100.06,
            leftKneeAngleDeg: 1.89,
            rightKneeAngleDeg: -59.90,
            hipYOffset: 5.15,
            displacementX: -183.20,
            globalLeftUpperArmAngleDeg: 335
        },
        {
            // EXPANDED FRAME 640
            spineAngleDeg: -100.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 64.38,
            leftUpperArmAngleDeg: 10.13,
            leftElbowAngleDeg: -4.88,
            rightUpperArmAngleDeg: 130.25,
            rightElbowAngleDeg: 30.50,
            pelvisJointDist: 14.63,
            pelvisJointAngleDeg: 84.88,
            leftThighAngleDeg: 140.63,
            rightThighAngleDeg: 100.63,
            leftKneeAngleDeg: 1.82,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.21,
            globalLeftUpperArmAngleDeg: 334
        },
        {
            // EXPANDED FRAME 641
            spineAngleDeg: -101.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 63.75,
            leftUpperArmAngleDeg: 10.25,
            leftElbowAngleDeg: -4.75,
            rightUpperArmAngleDeg: 130.50,
            rightElbowAngleDeg: 31.00,
            pelvisJointDist: 14.25,
            pelvisJointAngleDeg: 84.75,
            leftThighAngleDeg: 141.25,
            rightThighAngleDeg: 101.25,
            leftKneeAngleDeg: 1.65,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.22,
            globalLeftUpperArmAngleDeg: 333
        },
        {
            // EXPANDED FRAME 642
            spineAngleDeg: -101.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 63.13,
            leftUpperArmAngleDeg: 10.38,
            leftElbowAngleDeg: -4.63,
            rightUpperArmAngleDeg: 130.75,
            rightElbowAngleDeg: 31.50,
            pelvisJointDist: 13.88,
            pelvisJointAngleDeg: 84.63,
            leftThighAngleDeg: 141.88,
            rightThighAngleDeg: 101.88,
            leftKneeAngleDeg: 1.48,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.23,
            globalLeftUpperArmAngleDeg: 332
        },
        {
            // EXPANDED FRAME 643
            spineAngleDeg: -102.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 62.50,
            leftUpperArmAngleDeg: 10.50,
            leftElbowAngleDeg: -4.50,
            rightUpperArmAngleDeg: 131.00,
            rightElbowAngleDeg: 32.00,
            pelvisJointDist: 13.50,
            pelvisJointAngleDeg: 84.50,
            leftThighAngleDeg: 142.50,
            rightThighAngleDeg: 102.50,
            leftKneeAngleDeg: 1.30,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.24,
            globalLeftUpperArmAngleDeg: 331
        },
        {
            // EXPANDED FRAME 644
            spineAngleDeg: -102.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 61.88,
            leftUpperArmAngleDeg: 10.63,
            leftElbowAngleDeg: -4.38,
            rightUpperArmAngleDeg: 131.25,
            rightElbowAngleDeg: 32.50,
            pelvisJointDist: 13.13,
            pelvisJointAngleDeg: 84.38,
            leftThighAngleDeg: 143.13,
            rightThighAngleDeg: 103.13,
            leftKneeAngleDeg: 1.13,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.25,
            globalLeftUpperArmAngleDeg: 330
        },
        {
            // EXPANDED FRAME 645
            spineAngleDeg: -103.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 61.25,
            leftUpperArmAngleDeg: 10.75,
            leftElbowAngleDeg: -4.25,
            rightUpperArmAngleDeg: 131.50,
            rightElbowAngleDeg: 33.00,
            pelvisJointDist: 12.75,
            pelvisJointAngleDeg: 84.25,
            leftThighAngleDeg: 143.75,
            rightThighAngleDeg: 103.75,
            leftKneeAngleDeg: 0.95,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.26,
            globalLeftUpperArmAngleDeg: 329
        },
        {
            // EXPANDED FRAME 646
            spineAngleDeg: -103.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 60.63,
            leftUpperArmAngleDeg: 10.88,
            leftElbowAngleDeg: -4.13,
            rightUpperArmAngleDeg: 131.75,
            rightElbowAngleDeg: 33.50,
            pelvisJointDist: 12.38,
            pelvisJointAngleDeg: 84.13,
            leftThighAngleDeg: 144.38,
            rightThighAngleDeg: 104.38,
            leftKneeAngleDeg: 0.78,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.27,
            globalLeftUpperArmAngleDeg: 328
        },
        {
            // EXPANDED FRAME 647
            spineAngleDeg: -104.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 60.00,
            leftUpperArmAngleDeg: 11.00,
            leftElbowAngleDeg: -4.00,
            rightUpperArmAngleDeg: 132.00,
            rightElbowAngleDeg: 34.00,
            pelvisJointDist: 12.00,
            pelvisJointAngleDeg: 84.00,
            leftThighAngleDeg: 145.00,
            rightThighAngleDeg: 105.00,
            leftKneeAngleDeg: 0.60,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.28,
            globalLeftUpperArmAngleDeg: 327
        },
        {
            // EXPANDED FRAME 648
            spineAngleDeg: -104.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 59.38,
            leftUpperArmAngleDeg: 11.13,
            leftElbowAngleDeg: -3.88,
            rightUpperArmAngleDeg: 132.25,
            rightElbowAngleDeg: 34.50,
            pelvisJointDist: 11.63,
            pelvisJointAngleDeg: 83.88,
            leftThighAngleDeg: 145.63,
            rightThighAngleDeg: 105.63,
            leftKneeAngleDeg: 0.43,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.29,
            globalLeftUpperArmAngleDeg: 326
        },
        {
            // EXPANDED FRAME 649
            spineAngleDeg: -105.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 58.75,
            leftUpperArmAngleDeg: 11.25,
            leftElbowAngleDeg: -3.75,
            rightUpperArmAngleDeg: 132.50,
            rightElbowAngleDeg: 35.00,
            pelvisJointDist: 11.25,
            pelvisJointAngleDeg: 83.75,
            leftThighAngleDeg: 146.25,
            rightThighAngleDeg: 106.25,
            leftKneeAngleDeg: 0.25,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.30,
            globalLeftUpperArmAngleDeg: 325
        },
        {
            // EXPANDED FRAME 650
            spineAngleDeg: -105.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 58.13,
            leftUpperArmAngleDeg: 11.38,
            leftElbowAngleDeg: -3.63,
            rightUpperArmAngleDeg: 132.75,
            rightElbowAngleDeg: 35.50,
            pelvisJointDist: 10.88,
            pelvisJointAngleDeg: 83.63,
            leftThighAngleDeg: 146.88,
            rightThighAngleDeg: 106.88,
            leftKneeAngleDeg: 0.07,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.31,
            globalLeftUpperArmAngleDeg: 324
        },
        {
            // EXPANDED FRAME 651
            spineAngleDeg: -106.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 57.50,
            leftUpperArmAngleDeg: 11.50,
            leftElbowAngleDeg: -3.50,
            rightUpperArmAngleDeg: 133.00,
            rightElbowAngleDeg: 36.00,
            pelvisJointDist: 10.50,
            pelvisJointAngleDeg: 83.50,
            leftThighAngleDeg: 147.50,
            rightThighAngleDeg: 107.50,
            leftKneeAngleDeg: -0.10,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.32,
            globalLeftUpperArmAngleDeg: 323
        },
        {
            // EXPANDED FRAME 652
            spineAngleDeg: -106.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 56.88,
            leftUpperArmAngleDeg: 11.63,
            leftElbowAngleDeg: -3.38,
            rightUpperArmAngleDeg: 133.25,
            rightElbowAngleDeg: 36.50,
            pelvisJointDist: 10.13,
            pelvisJointAngleDeg: 83.38,
            leftThighAngleDeg: 148.13,
            rightThighAngleDeg: 108.13,
            leftKneeAngleDeg: -0.27,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.33,
            globalLeftUpperArmAngleDeg: 322
        },
        {
            // EXPANDED FRAME 653
            spineAngleDeg: -107.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 56.25,
            leftUpperArmAngleDeg: 11.75,
            leftElbowAngleDeg: -3.25,
            rightUpperArmAngleDeg: 133.50,
            rightElbowAngleDeg: 37.00,
            pelvisJointDist: 9.75,
            pelvisJointAngleDeg: 83.25,
            leftThighAngleDeg: 148.75,
            rightThighAngleDeg: 108.75,
            leftKneeAngleDeg: -0.45,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.34,
            globalLeftUpperArmAngleDeg: 321
        },
        {
            // EXPANDED FRAME 654
            spineAngleDeg: -107.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 55.63,
            leftUpperArmAngleDeg: 11.88,
            leftElbowAngleDeg: -3.13,
            rightUpperArmAngleDeg: 133.75,
            rightElbowAngleDeg: 37.50,
            pelvisJointDist: 9.38,
            pelvisJointAngleDeg: 83.13,
            leftThighAngleDeg: 149.38,
            rightThighAngleDeg: 109.38,
            leftKneeAngleDeg: -0.63,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.35,
            globalLeftUpperArmAngleDeg: 320
        },
        {
            // EXPANDED FRAME 655
            spineAngleDeg: -108.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 55.00,
            leftUpperArmAngleDeg: 12.00,
            leftElbowAngleDeg: -3.00,
            rightUpperArmAngleDeg: 134.00,
            rightElbowAngleDeg: 38.00,
            pelvisJointDist: 9.00,
            pelvisJointAngleDeg: 83.00,
            leftThighAngleDeg: 150.00,
            rightThighAngleDeg: 110.00,
            leftKneeAngleDeg: -0.80,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.36,
            globalLeftUpperArmAngleDeg: 319
        },
        {
            // EXPANDED FRAME 656
            spineAngleDeg: -108.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 54.38,
            leftUpperArmAngleDeg: 12.13,
            leftElbowAngleDeg: -2.88,
            rightUpperArmAngleDeg: 134.25,
            rightElbowAngleDeg: 38.50,
            pelvisJointDist: 8.63,
            pelvisJointAngleDeg: 82.88,
            leftThighAngleDeg: 150.63,
            rightThighAngleDeg: 110.63,
            leftKneeAngleDeg: -0.98,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.37,
            globalLeftUpperArmAngleDeg: 318
        },
        {
            // EXPANDED FRAME 657
            spineAngleDeg: -109.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 53.75,
            leftUpperArmAngleDeg: 12.25,
            leftElbowAngleDeg: -2.75,
            rightUpperArmAngleDeg: 134.50,
            rightElbowAngleDeg: 39.00,
            pelvisJointDist: 8.25,
            pelvisJointAngleDeg: 82.75,
            leftThighAngleDeg: 151.25,
            rightThighAngleDeg: 111.25,
            leftKneeAngleDeg: -1.15,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.38,
            globalLeftUpperArmAngleDeg: 317
        },
        {
            // EXPANDED FRAME 658
            spineAngleDeg: -109.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 53.13,
            leftUpperArmAngleDeg: 12.38,
            leftElbowAngleDeg: -2.63,
            rightUpperArmAngleDeg: 134.75,
            rightElbowAngleDeg: 39.50,
            pelvisJointDist: 7.88,
            pelvisJointAngleDeg: 82.63,
            leftThighAngleDeg: 151.88,
            rightThighAngleDeg: 111.88,
            leftKneeAngleDeg: -1.32,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.39,
            globalLeftUpperArmAngleDeg: 316
        },
        {
            // EXPANDED FRAME 659
            spineAngleDeg: -110.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 52.50,
            leftUpperArmAngleDeg: 12.50,
            leftElbowAngleDeg: -2.50,
            rightUpperArmAngleDeg: 135.00,
            rightElbowAngleDeg: 40.00,
            pelvisJointDist: 7.50,
            pelvisJointAngleDeg: 82.50,
            leftThighAngleDeg: 152.50,
            rightThighAngleDeg: 112.50,
            leftKneeAngleDeg: -1.50,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.40,
            globalLeftUpperArmAngleDeg: 315
        },
        {
            // EXPANDED FRAME 660
            spineAngleDeg: -110.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 51.88,
            leftUpperArmAngleDeg: 12.63,
            leftElbowAngleDeg: -2.38,
            rightUpperArmAngleDeg: 135.25,
            rightElbowAngleDeg: 40.50,
            pelvisJointDist: 7.13,
            pelvisJointAngleDeg: 82.38,
            leftThighAngleDeg: 153.13,
            rightThighAngleDeg: 113.13,
            leftKneeAngleDeg: -1.68,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.41,
            globalLeftUpperArmAngleDeg: 314
        },
        {
            // EXPANDED FRAME 661
            spineAngleDeg: -111.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 51.25,
            leftUpperArmAngleDeg: 12.75,
            leftElbowAngleDeg: -2.25,
            rightUpperArmAngleDeg: 135.50,
            rightElbowAngleDeg: 41.00,
            pelvisJointDist: 6.75,
            pelvisJointAngleDeg: 82.25,
            leftThighAngleDeg: 153.75,
            rightThighAngleDeg: 113.75,
            leftKneeAngleDeg: -1.85,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.41,
            globalLeftUpperArmAngleDeg: 313
        },
        {
            // EXPANDED FRAME 662
            spineAngleDeg: -111.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 50.63,
            leftUpperArmAngleDeg: 12.88,
            leftElbowAngleDeg: -2.13,
            rightUpperArmAngleDeg: 135.75,
            rightElbowAngleDeg: 41.50,
            pelvisJointDist: 6.38,
            pelvisJointAngleDeg: 82.13,
            leftThighAngleDeg: 154.38,
            rightThighAngleDeg: 114.38,
            leftKneeAngleDeg: -2.02,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.41,
            globalLeftUpperArmAngleDeg: 312
        },
        {
            // EXPANDED FRAME 663
            spineAngleDeg: -112.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 50.00,
            leftUpperArmAngleDeg: 13.00,
            leftElbowAngleDeg: -2.00,
            rightUpperArmAngleDeg: 136.00,
            rightElbowAngleDeg: 42.00,
            pelvisJointDist: 6.00,
            pelvisJointAngleDeg: 82.00,
            leftThighAngleDeg: 155.00,
            rightThighAngleDeg: 115.00,
            leftKneeAngleDeg: -2.20,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.42,
            globalLeftUpperArmAngleDeg: 311
        },
        {
            // EXPANDED FRAME 664
            spineAngleDeg: -112.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 49.38,
            leftUpperArmAngleDeg: 13.13,
            leftElbowAngleDeg: -1.88,
            rightUpperArmAngleDeg: 136.25,
            rightElbowAngleDeg: 42.50,
            pelvisJointDist: 5.63,
            pelvisJointAngleDeg: 81.88,
            leftThighAngleDeg: 155.63,
            rightThighAngleDeg: 115.63,
            leftKneeAngleDeg: -2.38,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.43,
            globalLeftUpperArmAngleDeg: 310
        },
        {
            // EXPANDED FRAME 665
            spineAngleDeg: -113.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 48.75,
            leftUpperArmAngleDeg: 13.25,
            leftElbowAngleDeg: -1.75,
            rightUpperArmAngleDeg: 136.50,
            rightElbowAngleDeg: 43.00,
            pelvisJointDist: 5.25,
            pelvisJointAngleDeg: 81.75,
            leftThighAngleDeg: 156.25,
            rightThighAngleDeg: 116.25,
            leftKneeAngleDeg: -2.55,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.43,
            globalLeftUpperArmAngleDeg: 309
        },
        {
            // EXPANDED FRAME 666
            spineAngleDeg: -113.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 48.13,
            leftUpperArmAngleDeg: 13.38,
            leftElbowAngleDeg: -1.63,
            rightUpperArmAngleDeg: 136.75,
            rightElbowAngleDeg: 43.50,
            pelvisJointDist: 4.88,
            pelvisJointAngleDeg: 81.63,
            leftThighAngleDeg: 156.88,
            rightThighAngleDeg: 116.88,
            leftKneeAngleDeg: -2.72,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.44,
            globalLeftUpperArmAngleDeg: 308
        },
        {
            // EXPANDED FRAME 667
            spineAngleDeg: -114.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 47.50,
            leftUpperArmAngleDeg: 13.50,
            leftElbowAngleDeg: -1.50,
            rightUpperArmAngleDeg: 137.00,
            rightElbowAngleDeg: 44.00,
            pelvisJointDist: 4.50,
            pelvisJointAngleDeg: 81.50,
            leftThighAngleDeg: 157.50,
            rightThighAngleDeg: 117.50,
            leftKneeAngleDeg: -2.90,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.44,
            globalLeftUpperArmAngleDeg: 307
        },
        {
            // EXPANDED FRAME 668
            spineAngleDeg: -114.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 46.88,
            leftUpperArmAngleDeg: 13.63,
            leftElbowAngleDeg: -1.38,
            rightUpperArmAngleDeg: 137.25,
            rightElbowAngleDeg: 44.50,
            pelvisJointDist: 4.13,
            pelvisJointAngleDeg: 81.38,
            leftThighAngleDeg: 158.13,
            rightThighAngleDeg: 118.13,
            leftKneeAngleDeg: -3.08,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.44,
            globalLeftUpperArmAngleDeg: 306
        },
        {
            // EXPANDED FRAME 669
            spineAngleDeg: -115.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 46.25,
            leftUpperArmAngleDeg: 13.75,
            leftElbowAngleDeg: -1.25,
            rightUpperArmAngleDeg: 137.50,
            rightElbowAngleDeg: 45.00,
            pelvisJointDist: 3.75,
            pelvisJointAngleDeg: 81.25,
            leftThighAngleDeg: 158.75,
            rightThighAngleDeg: 118.75,
            leftKneeAngleDeg: -3.25,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.45,
            globalLeftUpperArmAngleDeg: 305
        },
        {
            // EXPANDED FRAME 670
            spineAngleDeg: -115.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 45.63,
            leftUpperArmAngleDeg: 13.88,
            leftElbowAngleDeg: -1.13,
            rightUpperArmAngleDeg: 137.75,
            rightElbowAngleDeg: 45.50,
            pelvisJointDist: 3.38,
            pelvisJointAngleDeg: 81.13,
            leftThighAngleDeg: 159.38,
            rightThighAngleDeg: 119.38,
            leftKneeAngleDeg: -3.43,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.46,
            globalLeftUpperArmAngleDeg: 304
        },
        {
            // EXPANDED FRAME 671
            spineAngleDeg: -116.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 45.00,
            leftUpperArmAngleDeg: 14.00,
            leftElbowAngleDeg: -1.00,
            rightUpperArmAngleDeg: 138.00,
            rightElbowAngleDeg: 46.00,
            pelvisJointDist: 3.00,
            pelvisJointAngleDeg: 81.00,
            leftThighAngleDeg: 160.00,
            rightThighAngleDeg: 120.00,
            leftKneeAngleDeg: -3.60,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.46,
            globalLeftUpperArmAngleDeg: 303
        },
        {
            // EXPANDED FRAME 672
            spineAngleDeg: -116.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 44.38,
            leftUpperArmAngleDeg: 14.13,
            leftElbowAngleDeg: -0.88,
            rightUpperArmAngleDeg: 138.25,
            rightElbowAngleDeg: 46.50,
            pelvisJointDist: 2.63,
            pelvisJointAngleDeg: 80.88,
            leftThighAngleDeg: 160.63,
            rightThighAngleDeg: 120.63,
            leftKneeAngleDeg: -3.77,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.47,
            globalLeftUpperArmAngleDeg: 302
        },
        {
            // EXPANDED FRAME 673
            spineAngleDeg: -117.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 43.75,
            leftUpperArmAngleDeg: 14.25,
            leftElbowAngleDeg: -0.75,
            rightUpperArmAngleDeg: 138.50,
            rightElbowAngleDeg: 47.00,
            pelvisJointDist: 2.25,
            pelvisJointAngleDeg: 80.75,
            leftThighAngleDeg: 161.25,
            rightThighAngleDeg: 121.25,
            leftKneeAngleDeg: -3.95,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.47,
            globalLeftUpperArmAngleDeg: 301
        },
        {
            // EXPANDED FRAME 674
            spineAngleDeg: -117.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 43.13,
            leftUpperArmAngleDeg: 14.38,
            leftElbowAngleDeg: -0.63,
            rightUpperArmAngleDeg: 138.75,
            rightElbowAngleDeg: 47.50,
            pelvisJointDist: 1.88,
            pelvisJointAngleDeg: 80.63,
            leftThighAngleDeg: 161.88,
            rightThighAngleDeg: 121.88,
            leftKneeAngleDeg: -4.13,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.47,
            globalLeftUpperArmAngleDeg: 300
        },
        {
            // EXPANDED FRAME 675
            spineAngleDeg: -118.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 42.50,
            leftUpperArmAngleDeg: 14.50,
            leftElbowAngleDeg: -0.50,
            rightUpperArmAngleDeg: 139.00,
            rightElbowAngleDeg: 48.00,
            pelvisJointDist: 1.50,
            pelvisJointAngleDeg: 80.50,
            leftThighAngleDeg: 162.50,
            rightThighAngleDeg: 122.50,
            leftKneeAngleDeg: -4.30,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.48,
            globalLeftUpperArmAngleDeg: 299
        },
        {
            // EXPANDED FRAME 676
            spineAngleDeg: -118.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 41.88,
            leftUpperArmAngleDeg: 14.63,
            leftElbowAngleDeg: -0.38,
            rightUpperArmAngleDeg: 139.25,
            rightElbowAngleDeg: 48.50,
            pelvisJointDist: 1.13,
            pelvisJointAngleDeg: 80.38,
            leftThighAngleDeg: 163.13,
            rightThighAngleDeg: 123.13,
            leftKneeAngleDeg: -4.47,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.49,
            globalLeftUpperArmAngleDeg: 298
        },
        {
            // EXPANDED FRAME 677
            spineAngleDeg: -119.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 41.25,
            leftUpperArmAngleDeg: 14.75,
            leftElbowAngleDeg: -0.25,
            rightUpperArmAngleDeg: 139.50,
            rightElbowAngleDeg: 49.00,
            pelvisJointDist: 0.75,
            pelvisJointAngleDeg: 80.25,
            leftThighAngleDeg: 163.75,
            rightThighAngleDeg: 123.75,
            leftKneeAngleDeg: -4.65,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.49,
            globalLeftUpperArmAngleDeg: 297
        },
        {
            // EXPANDED FRAME 678
            spineAngleDeg: -119.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 40.63,
            leftUpperArmAngleDeg: 14.88,
            leftElbowAngleDeg: -0.13,
            rightUpperArmAngleDeg: 139.75,
            rightElbowAngleDeg: 49.50,
            pelvisJointDist: 0.38,
            pelvisJointAngleDeg: 80.13,
            leftThighAngleDeg: 164.38,
            rightThighAngleDeg: 124.38,
            leftKneeAngleDeg: -4.82,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.50,
            globalLeftUpperArmAngleDeg: 296
        },
        {
            // EXPANDED FRAME 679
            spineAngleDeg: -120.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 40.00,
            leftUpperArmAngleDeg: 15.00,
            leftElbowAngleDeg: 0.00,
            rightUpperArmAngleDeg: 140.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 165.00,
            rightThighAngleDeg: 125.00,
            leftKneeAngleDeg: -5.00,
            rightKneeAngleDeg: -60.00,
            hipYOffset: 5.00,
            displacementX: -183.50,
            globalLeftUpperArmAngleDeg: 295
        },
        {
            // EXPANDED FRAME 680
            spineAngleDeg: -120.22,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 39.33,
            leftUpperArmAngleDeg: 14.89,
            leftElbowAngleDeg: 0.22,
            rightUpperArmAngleDeg: 141.11,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 165.22,
            rightThighAngleDeg: 125.56,
            leftKneeAngleDeg: -4.84,
            rightKneeAngleDeg: -60.22,
            hipYOffset: 4.91,
            displacementX: -183.50,
            globalLeftUpperArmAngleDeg: 294
        },
        {
            // EXPANDED FRAME 681
            spineAngleDeg: -120.44,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 38.67,
            leftUpperArmAngleDeg: 14.78,
            leftElbowAngleDeg: 0.44,
            rightUpperArmAngleDeg: 142.22,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 165.44,
            rightThighAngleDeg: 126.11,
            leftKneeAngleDeg: -4.69,
            rightKneeAngleDeg: -60.44,
            hipYOffset: 4.82,
            displacementX: -183.51,
            globalLeftUpperArmAngleDeg: 293
        },
        {
            // EXPANDED FRAME 682
            spineAngleDeg: -120.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 38.00,
            leftUpperArmAngleDeg: 14.67,
            leftElbowAngleDeg: 0.67,
            rightUpperArmAngleDeg: 143.33,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 165.67,
            rightThighAngleDeg: 126.67,
            leftKneeAngleDeg: -4.53,
            rightKneeAngleDeg: -60.67,
            hipYOffset: 4.73,
            displacementX: -183.51,
            globalLeftUpperArmAngleDeg: 292
        },
        {
            // EXPANDED FRAME 683
            spineAngleDeg: -120.89,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 37.33,
            leftUpperArmAngleDeg: 14.56,
            leftElbowAngleDeg: 0.89,
            rightUpperArmAngleDeg: 144.44,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 165.89,
            rightThighAngleDeg: 127.22,
            leftKneeAngleDeg: -4.38,
            rightKneeAngleDeg: -60.89,
            hipYOffset: 4.64,
            displacementX: -183.52,
            globalLeftUpperArmAngleDeg: 291
        },
        {
            // EXPANDED FRAME 684
            spineAngleDeg: -121.11,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 36.67,
            leftUpperArmAngleDeg: 14.44,
            leftElbowAngleDeg: 1.11,
            rightUpperArmAngleDeg: 145.56,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 166.11,
            rightThighAngleDeg: 127.78,
            leftKneeAngleDeg: -4.22,
            rightKneeAngleDeg: -61.11,
            hipYOffset: 4.56,
            displacementX: -183.52,
            globalLeftUpperArmAngleDeg: 290
        },
        {
            // EXPANDED FRAME 685
            spineAngleDeg: -121.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 36.00,
            leftUpperArmAngleDeg: 14.33,
            leftElbowAngleDeg: 1.33,
            rightUpperArmAngleDeg: 146.67,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 166.33,
            rightThighAngleDeg: 128.33,
            leftKneeAngleDeg: -4.07,
            rightKneeAngleDeg: -61.33,
            hipYOffset: 4.47,
            displacementX: -183.53,
            globalLeftUpperArmAngleDeg: 289
        },
        {
            // EXPANDED FRAME 686
            spineAngleDeg: -121.56,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 35.33,
            leftUpperArmAngleDeg: 14.22,
            leftElbowAngleDeg: 1.56,
            rightUpperArmAngleDeg: 147.78,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 166.56,
            rightThighAngleDeg: 128.89,
            leftKneeAngleDeg: -3.91,
            rightKneeAngleDeg: -61.56,
            hipYOffset: 4.38,
            displacementX: -183.53,
            globalLeftUpperArmAngleDeg: 288
        },
        {
            // EXPANDED FRAME 687
            spineAngleDeg: -121.78,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 34.67,
            leftUpperArmAngleDeg: 14.11,
            leftElbowAngleDeg: 1.78,
            rightUpperArmAngleDeg: 148.89,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 166.78,
            rightThighAngleDeg: 129.44,
            leftKneeAngleDeg: -3.76,
            rightKneeAngleDeg: -61.78,
            hipYOffset: 4.29,
            displacementX: -183.54,
            globalLeftUpperArmAngleDeg: 287
        },
        {
            // EXPANDED FRAME 688
            spineAngleDeg: -122.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 34.00,
            leftUpperArmAngleDeg: 14.00,
            leftElbowAngleDeg: 2.00,
            rightUpperArmAngleDeg: 150.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 167.00,
            rightThighAngleDeg: 130.00,
            leftKneeAngleDeg: -3.60,
            rightKneeAngleDeg: -62.00,
            hipYOffset: 4.20,
            displacementX: -183.54,
            globalLeftUpperArmAngleDeg: 286
        },
        {
            // EXPANDED FRAME 689
            spineAngleDeg: -122.22,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 33.33,
            leftUpperArmAngleDeg: 13.89,
            leftElbowAngleDeg: 2.22,
            rightUpperArmAngleDeg: 151.11,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 167.22,
            rightThighAngleDeg: 130.56,
            leftKneeAngleDeg: -3.44,
            rightKneeAngleDeg: -62.22,
            hipYOffset: 4.11,
            displacementX: -183.54,
            globalLeftUpperArmAngleDeg: 285
        },
        {
            // EXPANDED FRAME 690
            spineAngleDeg: -122.44,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 32.67,
            leftUpperArmAngleDeg: 13.78,
            leftElbowAngleDeg: 2.44,
            rightUpperArmAngleDeg: 152.22,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 167.44,
            rightThighAngleDeg: 131.11,
            leftKneeAngleDeg: -3.29,
            rightKneeAngleDeg: -62.44,
            hipYOffset: 4.02,
            displacementX: -183.55,
            globalLeftUpperArmAngleDeg: 284
        },
        {
            // EXPANDED FRAME 691
            spineAngleDeg: -122.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 32.00,
            leftUpperArmAngleDeg: 13.67,
            leftElbowAngleDeg: 2.67,
            rightUpperArmAngleDeg: 153.33,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 167.67,
            rightThighAngleDeg: 131.67,
            leftKneeAngleDeg: -3.13,
            rightKneeAngleDeg: -62.67,
            hipYOffset: 3.93,
            displacementX: -183.55,
            globalLeftUpperArmAngleDeg: 283
        },
        {
            // EXPANDED FRAME 692
            spineAngleDeg: -122.89,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 31.33,
            leftUpperArmAngleDeg: 13.56,
            leftElbowAngleDeg: 2.89,
            rightUpperArmAngleDeg: 154.44,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 167.89,
            rightThighAngleDeg: 132.22,
            leftKneeAngleDeg: -2.98,
            rightKneeAngleDeg: -62.89,
            hipYOffset: 3.84,
            displacementX: -183.56,
            globalLeftUpperArmAngleDeg: 282
        },
        {
            // EXPANDED FRAME 693
            spineAngleDeg: -123.11,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 30.67,
            leftUpperArmAngleDeg: 13.44,
            leftElbowAngleDeg: 3.11,
            rightUpperArmAngleDeg: 155.56,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 168.11,
            rightThighAngleDeg: 132.78,
            leftKneeAngleDeg: -2.82,
            rightKneeAngleDeg: -63.11,
            hipYOffset: 3.76,
            displacementX: -183.56,
            globalLeftUpperArmAngleDeg: 281
        },
        {
            // EXPANDED FRAME 694
            spineAngleDeg: -123.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 30.00,
            leftUpperArmAngleDeg: 13.33,
            leftElbowAngleDeg: 3.33,
            rightUpperArmAngleDeg: 156.67,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 168.33,
            rightThighAngleDeg: 133.33,
            leftKneeAngleDeg: -2.67,
            rightKneeAngleDeg: -63.33,
            hipYOffset: 3.67,
            displacementX: -183.57,
            globalLeftUpperArmAngleDeg: 280
        },
        {
            // EXPANDED FRAME 695
            spineAngleDeg: -123.56,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 29.33,
            leftUpperArmAngleDeg: 13.22,
            leftElbowAngleDeg: 3.56,
            rightUpperArmAngleDeg: 157.78,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 168.56,
            rightThighAngleDeg: 133.89,
            leftKneeAngleDeg: -2.51,
            rightKneeAngleDeg: -63.56,
            hipYOffset: 3.58,
            displacementX: -183.57,
            globalLeftUpperArmAngleDeg: 279
        },
        {
            // EXPANDED FRAME 696
            spineAngleDeg: -123.78,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 28.67,
            leftUpperArmAngleDeg: 13.11,
            leftElbowAngleDeg: 3.78,
            rightUpperArmAngleDeg: 158.89,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 168.78,
            rightThighAngleDeg: 134.44,
            leftKneeAngleDeg: -2.36,
            rightKneeAngleDeg: -63.78,
            hipYOffset: 3.49,
            displacementX: -183.58,
            globalLeftUpperArmAngleDeg: 278
        },
        {
            // EXPANDED FRAME 697
            spineAngleDeg: -124.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 28.00,
            leftUpperArmAngleDeg: 13.00,
            leftElbowAngleDeg: 4.00,
            rightUpperArmAngleDeg: 160.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 169.00,
            rightThighAngleDeg: 135.00,
            leftKneeAngleDeg: -2.20,
            rightKneeAngleDeg: -64.00,
            hipYOffset: 3.40,
            displacementX: -183.58,
            globalLeftUpperArmAngleDeg: 277
        },
        {
            // EXPANDED FRAME 698
            spineAngleDeg: -124.22,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 27.33,
            leftUpperArmAngleDeg: 12.89,
            leftElbowAngleDeg: 4.22,
            rightUpperArmAngleDeg: 161.11,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 169.22,
            rightThighAngleDeg: 135.56,
            leftKneeAngleDeg: -2.04,
            rightKneeAngleDeg: -64.22,
            hipYOffset: 3.31,
            displacementX: -183.58,
            globalLeftUpperArmAngleDeg: 276
        },
        {
            // EXPANDED FRAME 699
            spineAngleDeg: -124.44,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 26.67,
            leftUpperArmAngleDeg: 12.78,
            leftElbowAngleDeg: 4.44,
            rightUpperArmAngleDeg: 162.22,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 169.44,
            rightThighAngleDeg: 136.11,
            leftKneeAngleDeg: -1.89,
            rightKneeAngleDeg: -64.44,
            hipYOffset: 3.22,
            displacementX: -183.59,
            globalLeftUpperArmAngleDeg: 275
        },
        {
            // EXPANDED FRAME 700
            spineAngleDeg: -124.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 26.00,
            leftUpperArmAngleDeg: 12.67,
            leftElbowAngleDeg: 4.67,
            rightUpperArmAngleDeg: 163.33,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 169.67,
            rightThighAngleDeg: 136.67,
            leftKneeAngleDeg: -1.73,
            rightKneeAngleDeg: -64.67,
            hipYOffset: 3.13,
            displacementX: -183.59,
            globalLeftUpperArmAngleDeg: 274
        },
        {
            // EXPANDED FRAME 701
            spineAngleDeg: -124.89,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 25.33,
            leftUpperArmAngleDeg: 12.56,
            leftElbowAngleDeg: 4.89,
            rightUpperArmAngleDeg: 164.44,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 169.89,
            rightThighAngleDeg: 137.22,
            leftKneeAngleDeg: -1.58,
            rightKneeAngleDeg: -64.89,
            hipYOffset: 3.04,
            displacementX: -183.60,
            globalLeftUpperArmAngleDeg: 273
        },
        {
            // EXPANDED FRAME 702
            spineAngleDeg: -125.22,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 24.33,
            leftUpperArmAngleDeg: 12.39,
            leftElbowAngleDeg: 5.22,
            rightUpperArmAngleDeg: 166.11,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 170.22,
            rightThighAngleDeg: 138.06,
            leftKneeAngleDeg: -1.34,
            rightKneeAngleDeg: -65.22,
            hipYOffset: 2.91,
            displacementX: -183.60,
            globalLeftUpperArmAngleDeg: 272
        },
        {
            // EXPANDED FRAME 703
            spineAngleDeg: -125.44,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 23.67,
            leftUpperArmAngleDeg: 12.28,
            leftElbowAngleDeg: 5.44,
            rightUpperArmAngleDeg: 167.22,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 170.44,
            rightThighAngleDeg: 138.61,
            leftKneeAngleDeg: -1.19,
            rightKneeAngleDeg: -65.44,
            hipYOffset: 2.82,
            displacementX: -183.61,
            globalLeftUpperArmAngleDeg: 271
        },
        {
            // EXPANDED FRAME 704
            spineAngleDeg: -125.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 23.00,
            leftUpperArmAngleDeg: 12.17,
            leftElbowAngleDeg: 5.67,
            rightUpperArmAngleDeg: 168.33,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 170.67,
            rightThighAngleDeg: 139.17,
            leftKneeAngleDeg: -1.03,
            rightKneeAngleDeg: -65.67,
            hipYOffset: 2.73,
            displacementX: -183.61,
            globalLeftUpperArmAngleDeg: 270
        },
        {
            // EXPANDED FRAME 705
            spineAngleDeg: -125.89,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 22.33,
            leftUpperArmAngleDeg: 12.06,
            leftElbowAngleDeg: 5.89,
            rightUpperArmAngleDeg: 169.44,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 170.89,
            rightThighAngleDeg: 139.72,
            leftKneeAngleDeg: -0.88,
            rightKneeAngleDeg: -65.89,
            hipYOffset: 2.64,
            displacementX: -183.62,
            globalLeftUpperArmAngleDeg: 269
        },
        {
            // EXPANDED FRAME 706
            spineAngleDeg: -126.11,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 21.67,
            leftUpperArmAngleDeg: 11.94,
            leftElbowAngleDeg: 6.11,
            rightUpperArmAngleDeg: 170.56,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 171.11,
            rightThighAngleDeg: 140.28,
            leftKneeAngleDeg: -0.72,
            rightKneeAngleDeg: -66.11,
            hipYOffset: 2.56,
            displacementX: -183.62,
            globalLeftUpperArmAngleDeg: 268
        },
        {
            // EXPANDED FRAME 707
            spineAngleDeg: -126.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 21.00,
            leftUpperArmAngleDeg: 11.83,
            leftElbowAngleDeg: 6.33,
            rightUpperArmAngleDeg: 171.67,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 171.33,
            rightThighAngleDeg: 140.83,
            leftKneeAngleDeg: -0.57,
            rightKneeAngleDeg: -66.33,
            hipYOffset: 2.47,
            displacementX: -183.63,
            globalLeftUpperArmAngleDeg: 267
        },
        {
            // EXPANDED FRAME 708
            spineAngleDeg: -126.56,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 20.33,
            leftUpperArmAngleDeg: 11.72,
            leftElbowAngleDeg: 6.56,
            rightUpperArmAngleDeg: 172.78,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 171.56,
            rightThighAngleDeg: 141.39,
            leftKneeAngleDeg: -0.41,
            rightKneeAngleDeg: -66.56,
            hipYOffset: 2.38,
            displacementX: -183.63,
            globalLeftUpperArmAngleDeg: 266
        },
        {
            // EXPANDED FRAME 709
            spineAngleDeg: -126.78,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 19.67,
            leftUpperArmAngleDeg: 11.61,
            leftElbowAngleDeg: 6.78,
            rightUpperArmAngleDeg: 173.89,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 171.78,
            rightThighAngleDeg: 141.94,
            leftKneeAngleDeg: -0.26,
            rightKneeAngleDeg: -66.78,
            hipYOffset: 2.29,
            displacementX: -183.64,
            globalLeftUpperArmAngleDeg: 265
        },
        {
            // EXPANDED FRAME 710
            spineAngleDeg: -127.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 19.00,
            leftUpperArmAngleDeg: 11.50,
            leftElbowAngleDeg: 7.00,
            rightUpperArmAngleDeg: 175.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 172.00,
            rightThighAngleDeg: 142.50,
            leftKneeAngleDeg: -0.10,
            rightKneeAngleDeg: -67.00,
            hipYOffset: 2.20,
            displacementX: -183.64,
            globalLeftUpperArmAngleDeg: 264
        },
        {
            // EXPANDED FRAME 711
            spineAngleDeg: -127.22,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 18.33,
            leftUpperArmAngleDeg: 11.39,
            leftElbowAngleDeg: 7.22,
            rightUpperArmAngleDeg: 176.11,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 172.22,
            rightThighAngleDeg: 143.06,
            leftKneeAngleDeg: 0.06,
            rightKneeAngleDeg: -67.22,
            hipYOffset: 2.11,
            displacementX: -183.64,
            globalLeftUpperArmAngleDeg: 263
        },
        {
            // EXPANDED FRAME 712
            spineAngleDeg: -127.44,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 17.67,
            leftUpperArmAngleDeg: 11.28,
            leftElbowAngleDeg: 7.44,
            rightUpperArmAngleDeg: 177.22,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 172.44,
            rightThighAngleDeg: 143.61,
            leftKneeAngleDeg: 0.21,
            rightKneeAngleDeg: -67.44,
            hipYOffset: 2.02,
            displacementX: -183.65,
            globalLeftUpperArmAngleDeg: 262
        },
        {
            // EXPANDED FRAME 713
            spineAngleDeg: -127.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 17.00,
            leftUpperArmAngleDeg: 11.17,
            leftElbowAngleDeg: 7.67,
            rightUpperArmAngleDeg: 178.33,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 172.67,
            rightThighAngleDeg: 144.17,
            leftKneeAngleDeg: 0.37,
            rightKneeAngleDeg: -67.67,
            hipYOffset: 1.93,
            displacementX: -183.65,
            globalLeftUpperArmAngleDeg: 261
        },
        {
            // EXPANDED FRAME 714
            spineAngleDeg: -127.89,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 16.33,
            leftUpperArmAngleDeg: 11.06,
            leftElbowAngleDeg: 7.89,
            rightUpperArmAngleDeg: 179.44,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 172.89,
            rightThighAngleDeg: 144.72,
            leftKneeAngleDeg: 0.52,
            rightKneeAngleDeg: -67.89,
            hipYOffset: 1.84,
            displacementX: -183.66,
            globalLeftUpperArmAngleDeg: 260
        },
        {
            // EXPANDED FRAME 715
            spineAngleDeg: -128.11,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 15.67,
            leftUpperArmAngleDeg: 10.94,
            leftElbowAngleDeg: 8.11,
            rightUpperArmAngleDeg: 180.56,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 173.11,
            rightThighAngleDeg: 145.28,
            leftKneeAngleDeg: 0.68,
            rightKneeAngleDeg: -68.11,
            hipYOffset: 1.76,
            displacementX: -183.66,
            globalLeftUpperArmAngleDeg: 259
        },
        {
            // EXPANDED FRAME 716
            spineAngleDeg: -128.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 15.00,
            leftUpperArmAngleDeg: 10.83,
            leftElbowAngleDeg: 8.33,
            rightUpperArmAngleDeg: 181.67,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 173.33,
            rightThighAngleDeg: 145.83,
            leftKneeAngleDeg: 0.83,
            rightKneeAngleDeg: -68.33,
            hipYOffset: 1.67,
            displacementX: -183.67,
            globalLeftUpperArmAngleDeg: 258
        },
        {
            // EXPANDED FRAME 717
            spineAngleDeg: -128.56,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 14.33,
            leftUpperArmAngleDeg: 10.72,
            leftElbowAngleDeg: 8.56,
            rightUpperArmAngleDeg: 182.78,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 173.56,
            rightThighAngleDeg: 146.39,
            leftKneeAngleDeg: 0.99,
            rightKneeAngleDeg: -68.56,
            hipYOffset: 1.58,
            displacementX: -183.67,
            globalLeftUpperArmAngleDeg: 257
        },
        {
            // EXPANDED FRAME 718
            spineAngleDeg: -128.78,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 13.67,
            leftUpperArmAngleDeg: 10.61,
            leftElbowAngleDeg: 8.78,
            rightUpperArmAngleDeg: 183.89,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 173.78,
            rightThighAngleDeg: 146.94,
            leftKneeAngleDeg: 1.14,
            rightKneeAngleDeg: -68.78,
            hipYOffset: 1.49,
            displacementX: -183.68,
            globalLeftUpperArmAngleDeg: 256
        },
        {
            // EXPANDED FRAME 719
            spineAngleDeg: -129.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 13.00,
            leftUpperArmAngleDeg: 10.50,
            leftElbowAngleDeg: 9.00,
            rightUpperArmAngleDeg: 185.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 174.00,
            rightThighAngleDeg: 147.50,
            leftKneeAngleDeg: 1.30,
            rightKneeAngleDeg: -69.00,
            hipYOffset: 1.40,
            displacementX: -183.68,
            globalLeftUpperArmAngleDeg: 255
        },
        {
            // EXPANDED FRAME 720
            spineAngleDeg: -129.22,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 12.33,
            leftUpperArmAngleDeg: 10.39,
            leftElbowAngleDeg: 9.22,
            rightUpperArmAngleDeg: 186.11,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 174.22,
            rightThighAngleDeg: 148.06,
            leftKneeAngleDeg: 1.46,
            rightKneeAngleDeg: -69.22,
            hipYOffset: 1.31,
            displacementX: -183.68,
            globalLeftUpperArmAngleDeg: 254
        },
        {
            // EXPANDED FRAME 721
            spineAngleDeg: -129.44,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 11.67,
            leftUpperArmAngleDeg: 10.28,
            leftElbowAngleDeg: 9.44,
            rightUpperArmAngleDeg: 187.22,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 174.44,
            rightThighAngleDeg: 148.61,
            leftKneeAngleDeg: 1.61,
            rightKneeAngleDeg: -69.44,
            hipYOffset: 1.22,
            displacementX: -183.69,
            globalLeftUpperArmAngleDeg: 253
        },
        {
            // EXPANDED FRAME 722
            spineAngleDeg: -129.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 11.00,
            leftUpperArmAngleDeg: 10.17,
            leftElbowAngleDeg: 9.67,
            rightUpperArmAngleDeg: 188.33,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 174.67,
            rightThighAngleDeg: 149.17,
            leftKneeAngleDeg: 1.77,
            rightKneeAngleDeg: -69.67,
            hipYOffset: 1.13,
            displacementX: -183.69,
            globalLeftUpperArmAngleDeg: 252
        },
        {
            // EXPANDED FRAME 723
            spineAngleDeg: -129.89,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.33,
            leftUpperArmAngleDeg: 10.06,
            leftElbowAngleDeg: 9.89,
            rightUpperArmAngleDeg: 189.44,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 174.89,
            rightThighAngleDeg: 149.72,
            leftKneeAngleDeg: 1.92,
            rightKneeAngleDeg: -69.89,
            hipYOffset: 1.04,
            displacementX: -183.70,
            globalLeftUpperArmAngleDeg: 251
        },
        {
            // EXPANDED FRAME 724
            spineAngleDeg: -129.94,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.16,
            leftUpperArmAngleDeg: 9.53,
            leftElbowAngleDeg: 9.45,
            rightUpperArmAngleDeg: 189.72,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 174.94,
            rightThighAngleDeg: 150.11,
            leftKneeAngleDeg: 1.96,
            rightKneeAngleDeg: -70.07,
            hipYOffset: 1.02,
            displacementX: -183.70,
            globalLeftUpperArmAngleDeg: 250
        },
        {
            // EXPANDED FRAME 725
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: 9.00,
            leftElbowAngleDeg: 9.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 150.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -70.25,
            hipYOffset: 1.00,
            displacementX: -183.70,
            globalLeftUpperArmAngleDeg: 249
        },
        {
            // EXPANDED FRAME 726
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: 8.00,
            leftElbowAngleDeg: 8.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 151.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -70.50,
            hipYOffset: 1.00,
            displacementX: -183.70,
            globalLeftUpperArmAngleDeg: 248
        },
        {
            // EXPANDED FRAME 727
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: 7.00,
            leftElbowAngleDeg: 7.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 151.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -70.75,
            hipYOffset: 1.00,
            displacementX: -183.70,
            globalLeftUpperArmAngleDeg: 247
        },
        {
            // EXPANDED FRAME 728
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: 6.00,
            leftElbowAngleDeg: 6.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 152.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -71.00,
            hipYOffset: 1.00,
            displacementX: -183.70,
            globalLeftUpperArmAngleDeg: 246
        },
        {
            // EXPANDED FRAME 729
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: 5.00,
            leftElbowAngleDeg: 5.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 152.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -71.25,
            hipYOffset: 1.00,
            displacementX: -183.70,
            globalLeftUpperArmAngleDeg: 245
        },
        {
            // EXPANDED FRAME 730
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: 4.00,
            leftElbowAngleDeg: 4.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 153.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -71.50,
            hipYOffset: 1.00,
            displacementX: -183.70,
            globalLeftUpperArmAngleDeg: 244
        },
        {
            // EXPANDED FRAME 731
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: 3.00,
            leftElbowAngleDeg: 3.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 153.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -71.75,
            hipYOffset: 1.00,
            displacementX: -183.70,
            globalLeftUpperArmAngleDeg: 243
        },
        {
            // EXPANDED FRAME 732
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: 2.00,
            leftElbowAngleDeg: 2.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 154.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -72.00,
            hipYOffset: 1.00,
            displacementX: -183.70,
            globalLeftUpperArmAngleDeg: 242
        },
        {
            // EXPANDED FRAME 733
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: 1.00,
            leftElbowAngleDeg: 1.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 154.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -72.25,
            hipYOffset: 1.00,
            displacementX: -183.70,
            globalLeftUpperArmAngleDeg: 241
        },
        {
            // EXPANDED FRAME 734
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: 0.00,
            leftElbowAngleDeg: 0.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 155.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -72.50,
            hipYOffset: 1.00,
            displacementX: -183.70,
            globalLeftUpperArmAngleDeg: 240
        },
        {
            // EXPANDED FRAME 735
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -1.00,
            leftElbowAngleDeg: -1.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 155.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -72.75,
            hipYOffset: 1.00,
            displacementX: -183.71,
            globalLeftUpperArmAngleDeg: 239
        },
        {
            // EXPANDED FRAME 736
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -2.00,
            leftElbowAngleDeg: -2.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 156.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -73.00,
            hipYOffset: 1.00,
            displacementX: -183.72,
            globalLeftUpperArmAngleDeg: 238
        },
        {
            // EXPANDED FRAME 737
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -3.00,
            leftElbowAngleDeg: -3.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 156.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -73.25,
            hipYOffset: 1.00,
            displacementX: -183.73,
            globalLeftUpperArmAngleDeg: 237
        },
        {
            // EXPANDED FRAME 738
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -4.00,
            leftElbowAngleDeg: -4.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 157.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -73.50,
            hipYOffset: 1.00,
            displacementX: -183.74,
            globalLeftUpperArmAngleDeg: 236
        },
        {
            // EXPANDED FRAME 739
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -5.00,
            leftElbowAngleDeg: -5.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 157.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -73.75,
            hipYOffset: 1.00,
            displacementX: -183.75,
            globalLeftUpperArmAngleDeg: 235
        },
        {
            // EXPANDED FRAME 740
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -6.00,
            leftElbowAngleDeg: -6.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 158.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -74.00,
            hipYOffset: 1.00,
            displacementX: -183.76,
            globalLeftUpperArmAngleDeg: 234
        },
        {
            // EXPANDED FRAME 741
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -7.00,
            leftElbowAngleDeg: -7.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 158.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -74.25,
            hipYOffset: 1.00,
            displacementX: -183.77,
            globalLeftUpperArmAngleDeg: 233
        },
        {
            // EXPANDED FRAME 742
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -8.00,
            leftElbowAngleDeg: -8.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 159.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -74.50,
            hipYOffset: 1.00,
            displacementX: -183.78,
            globalLeftUpperArmAngleDeg: 232
        },
        {
            // EXPANDED FRAME 743
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -9.00,
            leftElbowAngleDeg: -9.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 159.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -74.75,
            hipYOffset: 1.00,
            displacementX: -183.79,
            globalLeftUpperArmAngleDeg: 231
        },
        {
            // EXPANDED FRAME 744
            spineAngleDeg: -130.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -10.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 160.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: 1.00,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 230
        },
        {
            // EXPANDED FRAME 745
            spineAngleDeg: -130.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -10.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 160.63,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: 0.60,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 229
        },
        {
            // EXPANDED FRAME 746
            spineAngleDeg: -131.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -11.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 161.25,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: 0.20,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 228
        },
        {
            // EXPANDED FRAME 747
            spineAngleDeg: -131.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -11.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 161.88,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -0.20,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 227
        },
        {
            // EXPANDED FRAME 748
            spineAngleDeg: -132.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -12.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 162.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -0.60,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 226
        },
        {
            // EXPANDED FRAME 749
            spineAngleDeg: -132.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -12.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 163.13,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -1.00,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 225
        },
        {
            // EXPANDED FRAME 750
            spineAngleDeg: -133.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -13.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 163.75,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -1.40,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 224
        },
        {
            // EXPANDED FRAME 751
            spineAngleDeg: -133.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -13.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 164.38,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -1.80,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 223
        },
        {
            // EXPANDED FRAME 752
            spineAngleDeg: -134.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -14.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 165.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -2.20,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 222
        },
        {
            // EXPANDED FRAME 753
            spineAngleDeg: -134.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -14.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 165.63,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -2.60,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 221
        },
        {
            // EXPANDED FRAME 754
            spineAngleDeg: -135.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -15.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 166.25,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -3.00,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 220
        },
        {
            // EXPANDED FRAME 755
            spineAngleDeg: -135.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -15.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 166.88,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -3.40,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 219
        },
        {
            // EXPANDED FRAME 756
            spineAngleDeg: -136.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -16.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 167.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -3.80,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 218
        },
        {
            // EXPANDED FRAME 757
            spineAngleDeg: -136.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -16.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 168.13,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -4.20,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 217
        },
        {
            // EXPANDED FRAME 758
            spineAngleDeg: -137.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -17.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 168.75,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -4.60,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 216
        },
        {
            // EXPANDED FRAME 759
            spineAngleDeg: -137.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -17.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 169.38,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -5.00,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 215
        },
        {
            // EXPANDED FRAME 760
            spineAngleDeg: -138.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -18.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 170.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -5.40,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 214
        },
        {
            // EXPANDED FRAME 761
            spineAngleDeg: -138.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -18.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 170.63,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -5.80,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 213
        },
        {
            // EXPANDED FRAME 762
            spineAngleDeg: -139.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -19.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 171.25,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -6.20,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 212
        },
        {
            // EXPANDED FRAME 763
            spineAngleDeg: -139.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -19.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 171.88,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -6.60,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 211
        },
        {
            // EXPANDED FRAME 764
            spineAngleDeg: -140.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -20.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 172.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -7.00,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 210
        },
        {
            // EXPANDED FRAME 765
            spineAngleDeg: -140.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -20.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 173.13,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -7.40,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 209
        },
        {
            // EXPANDED FRAME 766
            spineAngleDeg: -141.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -21.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 173.75,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -7.80,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 208
        },
        {
            // EXPANDED FRAME 767
            spineAngleDeg: -141.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -21.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 174.38,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -8.20,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 207
        },
        {
            // EXPANDED FRAME 768
            spineAngleDeg: -142.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -22.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 175.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -8.60,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 206
        },
        {
            // EXPANDED FRAME 769
            spineAngleDeg: -142.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -22.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 175.63,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -9.00,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 205
        },
        {
            // EXPANDED FRAME 770
            spineAngleDeg: -143.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -23.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 176.25,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -9.40,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 204
        },
        {
            // EXPANDED FRAME 771
            spineAngleDeg: -143.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -23.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 176.88,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -9.80,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 203
        },
        {
            // EXPANDED FRAME 772
            spineAngleDeg: -144.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -24.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 177.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -10.20,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 202
        },
        {
            // EXPANDED FRAME 773
            spineAngleDeg: -144.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -24.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 178.13,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -10.60,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 201
        },
        {
            // EXPANDED FRAME 774
            spineAngleDeg: -145.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -25.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 178.75,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -11.00,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 200
        },
        {
            // EXPANDED FRAME 775
            spineAngleDeg: -145.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -25.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 179.38,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -11.40,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 199
        },
        {
            // EXPANDED FRAME 776
            spineAngleDeg: -146.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -26.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 180.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -11.80,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 198
        },
        {
            // EXPANDED FRAME 777
            spineAngleDeg: -146.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -26.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 180.63,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -12.20,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 197
        },
        {
            // EXPANDED FRAME 778
            spineAngleDeg: -147.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -27.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 181.25,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -12.60,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 196
        },
        {
            // EXPANDED FRAME 779
            spineAngleDeg: -147.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -27.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 181.88,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -13.00,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 195
        },
        {
            // EXPANDED FRAME 780
            spineAngleDeg: -148.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -28.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 182.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -13.40,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 194
        },
        {
            // EXPANDED FRAME 781
            spineAngleDeg: -148.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -28.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 183.13,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -13.80,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 193
        },
        {
            // EXPANDED FRAME 782
            spineAngleDeg: -149.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -29.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 183.75,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -14.20,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 192
        },
        {
            // EXPANDED FRAME 783
            spineAngleDeg: -149.50,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -29.50,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 184.38,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -14.60,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 191
        },
        {
            // EXPANDED FRAME 784
            spineAngleDeg: -150.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -30.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.00,
            rightElbowAngleDeg: 50.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.00,
            rightThighAngleDeg: 185.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -15.00,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 190
        },
        {
            // EXPANDED FRAME 785
            spineAngleDeg: -150.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -30.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.17,
            rightElbowAngleDeg: 50.17,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.25,
            rightThighAngleDeg: 185.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -15.17,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 189
        },
        {
            // EXPANDED FRAME 786
            spineAngleDeg: -150.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -31.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.33,
            rightElbowAngleDeg: 50.33,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.50,
            rightThighAngleDeg: 186.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -15.33,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 188
        },
        {
            // EXPANDED FRAME 787
            spineAngleDeg: -151.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -32.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.50,
            rightElbowAngleDeg: 50.50,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 175.75,
            rightThighAngleDeg: 186.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -15.50,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 187
        },
        {
            // EXPANDED FRAME 788
            spineAngleDeg: -151.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -32.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.67,
            rightElbowAngleDeg: 50.67,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 176.00,
            rightThighAngleDeg: 187.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -15.67,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 186
        },
        {
            // EXPANDED FRAME 789
            spineAngleDeg: -151.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -33.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 190.83,
            rightElbowAngleDeg: 50.83,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 176.25,
            rightThighAngleDeg: 187.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -15.83,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 185
        },
        {
            // EXPANDED FRAME 790
            spineAngleDeg: -152.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -34.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 191.00,
            rightElbowAngleDeg: 51.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 176.50,
            rightThighAngleDeg: 188.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -16.00,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 184
        },
        {
            // EXPANDED FRAME 791
            spineAngleDeg: -152.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -34.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 191.17,
            rightElbowAngleDeg: 51.17,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 176.75,
            rightThighAngleDeg: 188.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -16.17,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 183
        },
        {
            // EXPANDED FRAME 792
            spineAngleDeg: -152.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -35.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 191.33,
            rightElbowAngleDeg: 51.33,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 177.00,
            rightThighAngleDeg: 189.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -16.33,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 182
        },
        {
            // EXPANDED FRAME 793
            spineAngleDeg: -153.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -36.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 191.50,
            rightElbowAngleDeg: 51.50,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 177.25,
            rightThighAngleDeg: 189.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -16.50,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 181
        },
        {
            // EXPANDED FRAME 794
            spineAngleDeg: -153.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -36.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 191.67,
            rightElbowAngleDeg: 51.67,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 177.50,
            rightThighAngleDeg: 190.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -16.67,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 180
        },
        {
            // EXPANDED FRAME 795
            spineAngleDeg: -153.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -37.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 191.83,
            rightElbowAngleDeg: 51.83,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 177.75,
            rightThighAngleDeg: 190.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -16.83,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 179
        },
        {
            // EXPANDED FRAME 796
            spineAngleDeg: -154.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -38.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 192.00,
            rightElbowAngleDeg: 52.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 178.00,
            rightThighAngleDeg: 191.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -17.00,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 178
        },
        {
            // EXPANDED FRAME 797
            spineAngleDeg: -154.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -38.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 192.17,
            rightElbowAngleDeg: 52.17,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 178.25,
            rightThighAngleDeg: 191.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -17.17,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 177
        },
        {
            // EXPANDED FRAME 798
            spineAngleDeg: -154.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -39.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 192.33,
            rightElbowAngleDeg: 52.33,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 178.50,
            rightThighAngleDeg: 192.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -17.33,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 176
        },
        {
            // EXPANDED FRAME 799
            spineAngleDeg: -155.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -40.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 192.50,
            rightElbowAngleDeg: 52.50,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 178.75,
            rightThighAngleDeg: 192.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -17.50,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 175
        },
        {
            // EXPANDED FRAME 800
            spineAngleDeg: -155.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -40.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 192.67,
            rightElbowAngleDeg: 52.67,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 179.00,
            rightThighAngleDeg: 193.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -17.67,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 174
        },
        {
            // EXPANDED FRAME 801
            spineAngleDeg: -155.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -41.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 192.83,
            rightElbowAngleDeg: 52.83,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 179.25,
            rightThighAngleDeg: 193.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -17.83,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 173
        },
        {
            // EXPANDED FRAME 802
            spineAngleDeg: -156.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -42.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 193.00,
            rightElbowAngleDeg: 53.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 179.50,
            rightThighAngleDeg: 194.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -18.00,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 172
        },
        {
            // EXPANDED FRAME 803
            spineAngleDeg: -156.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -42.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 193.17,
            rightElbowAngleDeg: 53.17,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 179.75,
            rightThighAngleDeg: 194.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -18.17,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 171
        },
        {
            // EXPANDED FRAME 804
            spineAngleDeg: -156.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -43.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 193.33,
            rightElbowAngleDeg: 53.33,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 180.00,
            rightThighAngleDeg: 195.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -18.33,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 170
        },
        {
            // EXPANDED FRAME 805
            spineAngleDeg: -157.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -44.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 193.50,
            rightElbowAngleDeg: 53.50,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 180.25,
            rightThighAngleDeg: 195.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -18.50,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 169
        },
        {
            // EXPANDED FRAME 806
            spineAngleDeg: -157.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -44.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 193.67,
            rightElbowAngleDeg: 53.67,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 180.50,
            rightThighAngleDeg: 196.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -18.67,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 168
        },
        {
            // EXPANDED FRAME 807
            spineAngleDeg: -157.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -45.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 193.83,
            rightElbowAngleDeg: 53.83,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 180.75,
            rightThighAngleDeg: 196.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -18.83,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 167
        },
        {
            // EXPANDED FRAME 808
            spineAngleDeg: -158.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -46.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 194.00,
            rightElbowAngleDeg: 54.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 181.00,
            rightThighAngleDeg: 197.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -19.00,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 166
        },
        {
            // EXPANDED FRAME 809
            spineAngleDeg: -158.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -46.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 194.17,
            rightElbowAngleDeg: 54.17,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 181.25,
            rightThighAngleDeg: 197.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -19.17,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 165
        },
        {
            // EXPANDED FRAME 810
            spineAngleDeg: -158.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -47.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 194.33,
            rightElbowAngleDeg: 54.33,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 181.50,
            rightThighAngleDeg: 198.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -19.33,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 164
        },
        {
            // EXPANDED FRAME 811
            spineAngleDeg: -159.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -48.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 194.50,
            rightElbowAngleDeg: 54.50,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 181.75,
            rightThighAngleDeg: 198.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -19.50,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 163
        },
        {
            // EXPANDED FRAME 812
            spineAngleDeg: -159.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -48.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 194.67,
            rightElbowAngleDeg: 54.67,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 182.00,
            rightThighAngleDeg: 199.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -19.67,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 162
        },
        {
            // EXPANDED FRAME 813
            spineAngleDeg: -159.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -49.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 194.83,
            rightElbowAngleDeg: 54.83,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 182.25,
            rightThighAngleDeg: 199.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -19.83,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 161
        },
        {
            // EXPANDED FRAME 814
            spineAngleDeg: -160.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -50.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 195.00,
            rightElbowAngleDeg: 55.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 182.50,
            rightThighAngleDeg: 200.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -20.00,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 160
        },
        {
            // EXPANDED FRAME 815
            spineAngleDeg: -160.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -50.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 195.17,
            rightElbowAngleDeg: 55.17,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 182.75,
            rightThighAngleDeg: 200.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -20.17,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 159
        },
        {
            // EXPANDED FRAME 816
            spineAngleDeg: -160.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -51.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 195.33,
            rightElbowAngleDeg: 55.33,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 183.00,
            rightThighAngleDeg: 201.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -20.33,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 158
        },
        {
            // EXPANDED FRAME 817
            spineAngleDeg: -161.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -52.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 195.50,
            rightElbowAngleDeg: 55.50,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 183.25,
            rightThighAngleDeg: 201.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -20.50,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 157
        },
        {
            // EXPANDED FRAME 818
            spineAngleDeg: -161.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -52.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 195.67,
            rightElbowAngleDeg: 55.67,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 183.50,
            rightThighAngleDeg: 202.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -20.67,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 156
        },
        {
            // EXPANDED FRAME 819
            spineAngleDeg: -161.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -53.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 195.83,
            rightElbowAngleDeg: 55.83,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 183.75,
            rightThighAngleDeg: 202.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -20.83,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 155
        },
        {
            // EXPANDED FRAME 820
            spineAngleDeg: -162.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -54.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 196.00,
            rightElbowAngleDeg: 56.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 184.00,
            rightThighAngleDeg: 203.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -21.00,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 154
        },
        {
            // EXPANDED FRAME 821
            spineAngleDeg: -162.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -54.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 196.17,
            rightElbowAngleDeg: 56.17,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 184.25,
            rightThighAngleDeg: 203.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -21.17,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 153
        },
        {
            // EXPANDED FRAME 822
            spineAngleDeg: -162.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -55.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 196.33,
            rightElbowAngleDeg: 56.33,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 184.50,
            rightThighAngleDeg: 204.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -21.33,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 152
        },
        {
            // EXPANDED FRAME 823
            spineAngleDeg: -163.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -56.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 196.50,
            rightElbowAngleDeg: 56.50,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 184.75,
            rightThighAngleDeg: 204.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -21.50,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 151
        },
        {
            // EXPANDED FRAME 824
            spineAngleDeg: -163.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -56.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 196.67,
            rightElbowAngleDeg: 56.67,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 185.00,
            rightThighAngleDeg: 205.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -21.67,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 150
        },
        {
            // EXPANDED FRAME 825
            spineAngleDeg: -163.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -57.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 196.83,
            rightElbowAngleDeg: 56.83,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 185.25,
            rightThighAngleDeg: 205.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -21.83,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 149
        },
        {
            // EXPANDED FRAME 826
            spineAngleDeg: -164.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -58.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 197.00,
            rightElbowAngleDeg: 57.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 185.50,
            rightThighAngleDeg: 206.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -22.00,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 148
        },
        {
            // EXPANDED FRAME 827
            spineAngleDeg: -164.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -58.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 197.17,
            rightElbowAngleDeg: 57.17,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 185.75,
            rightThighAngleDeg: 206.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -22.17,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 147
        },
        {
            // EXPANDED FRAME 828
            spineAngleDeg: -164.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -59.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 197.33,
            rightElbowAngleDeg: 57.33,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 186.00,
            rightThighAngleDeg: 207.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -22.33,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 146
        },
        {
            // EXPANDED FRAME 829
            spineAngleDeg: -165.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -60.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 197.50,
            rightElbowAngleDeg: 57.50,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 186.25,
            rightThighAngleDeg: 207.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -22.50,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 145
        },
        {
            // EXPANDED FRAME 830
            spineAngleDeg: -165.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -60.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 197.67,
            rightElbowAngleDeg: 57.67,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 186.50,
            rightThighAngleDeg: 208.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -22.67,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 144
        },
        {
            // EXPANDED FRAME 831
            spineAngleDeg: -165.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -61.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 197.83,
            rightElbowAngleDeg: 57.83,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 186.75,
            rightThighAngleDeg: 208.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -22.83,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 143
        },
        {
            // EXPANDED FRAME 832
            spineAngleDeg: -166.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -62.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 198.00,
            rightElbowAngleDeg: 58.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 187.00,
            rightThighAngleDeg: 209.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -23.00,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 142
        },
        {
            // EXPANDED FRAME 833
            spineAngleDeg: -166.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -62.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 198.17,
            rightElbowAngleDeg: 58.17,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 187.25,
            rightThighAngleDeg: 209.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -23.17,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 141
        },
        {
            // EXPANDED FRAME 834
            spineAngleDeg: -166.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -63.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 198.33,
            rightElbowAngleDeg: 58.33,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 187.50,
            rightThighAngleDeg: 210.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -23.33,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 140
        },
        {
            // EXPANDED FRAME 835
            spineAngleDeg: -167.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -64.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 198.50,
            rightElbowAngleDeg: 58.50,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 187.75,
            rightThighAngleDeg: 210.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -23.50,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 139
        },
        {
            // EXPANDED FRAME 836
            spineAngleDeg: -167.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -64.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 198.67,
            rightElbowAngleDeg: 58.67,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 188.00,
            rightThighAngleDeg: 211.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -23.67,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 138
        },
        {
            // EXPANDED FRAME 837
            spineAngleDeg: -167.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -65.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 198.83,
            rightElbowAngleDeg: 58.83,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 188.25,
            rightThighAngleDeg: 211.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -23.83,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 137
        },
        {
            // EXPANDED FRAME 838
            spineAngleDeg: -168.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -66.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 199.00,
            rightElbowAngleDeg: 59.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 188.50,
            rightThighAngleDeg: 212.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -24.00,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 136
        },
        {
            // EXPANDED FRAME 839
            spineAngleDeg: -168.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -66.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 199.17,
            rightElbowAngleDeg: 59.17,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 188.75,
            rightThighAngleDeg: 212.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -24.17,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 135
        },
        {
            // EXPANDED FRAME 840
            spineAngleDeg: -168.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -67.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 199.33,
            rightElbowAngleDeg: 59.33,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 189.00,
            rightThighAngleDeg: 213.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -24.33,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 134
        },
        {
            // EXPANDED FRAME 841
            spineAngleDeg: -169.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -68.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 199.50,
            rightElbowAngleDeg: 59.50,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 189.25,
            rightThighAngleDeg: 213.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -24.50,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 133
        },
        {
            // EXPANDED FRAME 842
            spineAngleDeg: -169.33,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -68.67,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 199.67,
            rightElbowAngleDeg: 59.67,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 189.50,
            rightThighAngleDeg: 214.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -24.67,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 132
        },
        {
            // EXPANDED FRAME 843
            spineAngleDeg: -169.67,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -69.33,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 199.83,
            rightElbowAngleDeg: 59.83,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 189.75,
            rightThighAngleDeg: 214.50,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -24.83,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 131
        },
        {
            // EXPANDED FRAME 844
            spineAngleDeg: -170.00,
            shoulderJointDist: -70.00,
            shoulderJointAngleDeg: 10.00,
            leftUpperArmAngleDeg: -70.00,
            leftElbowAngleDeg: -10.00,
            rightUpperArmAngleDeg: 200.00,
            rightElbowAngleDeg: 60.00,
            pelvisJointDist: 0.00,
            pelvisJointAngleDeg: 80.00,
            leftThighAngleDeg: 190.00,
            rightThighAngleDeg: 215.00,
            leftKneeAngleDeg: 2.00,
            rightKneeAngleDeg: -75.00,
            hipYOffset: -25.00,
            displacementX: -183.80,
            globalLeftUpperArmAngleDeg: 130
        }
    ];

// Ensure all 42 frames of PRE_DELIVERY_JUMP explicitly have normalizedDisplacementRatio assigned
    static {
        Bowler.PRE_DELIVERY_JUMP.forEach((pose, idx) => {
            if (pose.normalizedDisplacementRatio === undefined) {
                pose.normalizedDisplacementRatio = Bowler.getJumpKeyframeStrideRatio(idx);
            }
        });
    }

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
            hipYOffset: lerpVal(p1.hipYOffset, p2.hipYOffset, t),
            displacementX: lerpVal(p1.displacementX ?? 0, p2.displacementX ?? 0, t)
        };
    }

    public interpolatePoseAtDecimalFrame(decimalFrame: number): KeyframePose {
        const frames = Bowler.PRE_DELIVERY_JUMP;
        const maxIdx = frames.length - 1;
        const clampedFrame = Math.max(0, Math.min(maxIdx, decimalFrame));

        const lIdx = Math.floor(clampedFrame);
        const uIdx = Math.min(maxIdx, lIdx + 1);
        const t = clampedFrame - lIdx;

        return Bowler.interpolatePose(frames[lIdx], frames[uIdx], t);
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

        // 🏃 Non-Linear Athletic Gathering Deceleration Curve (100% -> runupGatheringEndSpeedFactor curve towards startJumpX)
        if (this.gatheringStartX !== null && this.gatheringTargetX !== null && this.gatheringStartX > this.gatheringTargetX) {
            const totalDist = this.gatheringStartX - this.gatheringTargetX;
            if (totalDist > 0) {
                const distRemaining = Math.max(0, this.currentHipPosition.x - this.gatheringTargetX);
                const alpha = Math.min(1.0, Math.max(0.0, 1.0 - (distRemaining / totalDist)));

                // Ease-Out Quadratic Deceleration Curve
                const easedAlpha = 1.0 - Math.pow(1.0 - alpha, 2);
                const speedDrop = 1.0 - this.runupGatheringEndSpeedFactor;
                const speedFactor = 1.0 - speedDrop * easedAlpha;

                horizontalSpeed *= speedFactor;
            }
        }
        this.lastRunupSpeedX = horizontalSpeed;

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
       // 🟢 Naya Fix: Screen se bahar jate hi bowler STOP ho jaye
        if (this.currentHipPosition.x <= 0) {
            this.isRunning = false;
            this.setInitialRunPose();
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

    public drawDebugSkeleton(ctx: CanvasRenderingContext2D, ball?: any): void {
        if (ball && ball.isHeldInHand && !this.isBallReleased) {
            ball.pos.x = this.leftWrist.x;
            ball.pos.y = this.leftWrist.y;
            ball.prevPos.x = this.leftWrist.x;
            ball.prevPos.y = this.leftWrist.y;
        }

        ctx.save();

        // ── Draw Muscular 3D Legs & Trousers Anatomy ────────────────────────
        this.drawMuscularLeg(ctx, this.currentRightHipPosition, this.rightKnee, this.rightAnkle, "#1d4ed8");
        this.drawMuscularLeg(ctx, this.currentLeftHipPosition, this.leftKnee, this.leftAnkle, "#dc2626");

        // ── Thick Bone lines ────────────────────────────────────────────────
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
        
        // Right Leg (White)
        ctx.strokeStyle = "#ffffff";
        line(this.currentRightHipPosition, this.rightKnee);
        line(this.rightKnee, this.rightAnkle);

        // Left Leg (Vibrant Red Skeleton)
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth   = 5.5;
        line(this.currentLeftHipPosition, this.leftKnee);
        line(this.leftKnee, this.leftAnkle);

        // Right Arm (White)
        ctx.strokeStyle = "#ffffff";
        line(this.backShoulder, this.rightElbow);
        line(this.rightElbow, this.rightWrist);

        // Left Arm (Vibrant Red Skeleton)
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth   = 5.5;
        line(this.frontShoulder, this.leftElbow);
        line(this.leftElbow, this.leftWrist);

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
        // Right Leg (White)
        ctx.strokeStyle = "#ffffff";
        line(rHip, rKnee); line(rKnee, rAnkle);

        // Left Leg (Vibrant Red Skeleton)
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth   = 5.0;
        line(lHip, lKnee); line(lKnee, lAnkle);

        // Right Arm (White)
        ctx.strokeStyle = "#ffffff";
        line(rShoulder, rElbow); line(rElbow, rWrist);

        // Left Arm (Vibrant Red Skeleton)
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth   = 5.0;
        line(lShoulder, lElbow); line(lElbow, lWrist);

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