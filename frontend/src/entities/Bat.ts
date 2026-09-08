import { BAT_CENTER_OF_MASS_RATIO } from "../game/constants";
import Input from "../game/Input";
import { SoundManager } from "../audio/SoundManager";
import outerArcJson from "../config/outer_handle_arc.json";
import innerArcJson from "../config/inner_handle_arc.json";
import BowlingArea from "./BowlingArea";
import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    GROUND_HEIGHT,
    GRAVITY,
    QUEUE_SIZE,
    BAT_REGIONS_RESTITUTION,
    GLOBAL_RESTITUTION_SCALE,
    NORMAL_DIRECTION_ASSIST,
    NECT_TO_HIP_RATIO,
    OUTER_ARC_SCALE,
    INNER_ARC_SCALE,
    HORIZONTAL_TILT_SPEED_SCALE,
    k_values,
    PLAYER_LENGTH_FACTOR
} from "../game/constants";

type Vec2 = { x: number; y: number };

export interface BatRegion {
    history: { x: number; y: number; time: number }[];
    front: number;
    rear: number;
    count: number;
}

export default class Bat {

    private readonly BAT_MASS = 1.0;
    private readonly SPRING_STIFFNESS = 260;
    private readonly DAMPING = 22;
    // --- Wrist Rotation Physics ---
    private readonly WRIST_TILT_SPEED_SCALE: number = 0.0014; // Scaled down to 0.7x per user request

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
    
    private comTarget: Vec2 = { x: 300, y: 300 };   // where mouse wants it
    private comActual: Vec2 = { x: 300, y: 300 }; // where it PHYSICALLY is (start near stance)
    private comVelocity: Vec2 = { x: 0, y: 0 };

    private batAngleActual = 0;
    private prevBatAngle = 0;
    private prevHandleTop: Vec2 = { x: 300, y: 300 };
    private prevComTarget: Vec2 | null = null;
    private handleActual: Vec2 = { x: 300, y: 300 };
    private handleVelocity: Vec2 = { x: 0, y: 0 };
    private readonly HANDLE_STIFFNESS_Y = 30; // Increased so it hits speed limit!for now
    // --- BAT BREAKDOWN ---
    private readonly HANDLE_LENGTH = 1.5 * PLAYER_LENGTH_FACTOR; // 1.5x of player length factor
    private readonly BLADE_LENGTH = 3*PLAYER_LENGTH_FACTOR;
    private readonly TOTAL_BAT_LENGTH = 4.7*PLAYER_LENGTH_FACTOR;
    private readonly TOTAL_RIGHT_ARM_LENGTH  =  3.4*PLAYER_LENGTH_FACTOR;
    private readonly TOTAL_LEFT_ARM_LENGTH = 3.5*PLAYER_LENGTH_FACTOR;
    // --- WIDTHS ---

    private readonly HANDLE_WIDTH = this.TOTAL_BAT_LENGTH*.0388888888;

    // --- FRONT ARM ---
    private readonly FRONT_UPPER_ARM = this.TOTAL_LEFT_ARM_LENGTH*.4366;
    private readonly FRONT_LOWER_ARM = this.TOTAL_LEFT_ARM_LENGTH-this.FRONT_UPPER_ARM;

    // --- BACK ARM ---
    private readonly BACK_UPPER_ARM = this.TOTAL_RIGHT_ARM_LENGTH*.4366;
    private readonly BACK_LOWER_ARM = this.TOTAL_RIGHT_ARM_LENGTH-this.BACK_UPPER_ARM;

    // --- SHOULDER ANCHORS (Removed unused variables) ---

    // How far the bat's center of mass sits from the raw cursor point,
    // perpendicular to the bat's own axis. Purely a feel/tuning constant —
    // increase it if the bat should trail further from the actual cursor.
    private readonly GRIP_OFFSET_FROM_CURSOR = 20;

    // Minimum elbow bend angles (degrees). 0 means completely folded, 180 means completely straight.


    // Bend-side flags. Both -1 makes the elbows bend naturally in parallel (fixes the diamond shape).
    private readonly BACK_ARM_BEND: 1 | -1 = -1;   // must bend to the right
    private readonly FRONT_ARM_BEND: 1 | -1 = 1; // must bend to the right

    private readonly EPS = 0.01;

    private readonly FULL_LEG_LENGTH = 5.2*PLAYER_LENGTH_FACTOR; 

    private readonly THIGH_LENGTH = this.FULL_LEG_LENGTH * 0.5;
    private readonly SHIN_LENGTH = this.FULL_LEG_LENGTH - this.THIGH_LENGTH;


    private readonly NECT_TO_HIP_LENGTH = 3.4*PLAYER_LENGTH_FACTOR;

  


        
    private readonly MAX_HIP_POSITION : Vec2 = { x: 350, y: CANVAS_HEIGHT - GROUND_HEIGHT-this.FULL_LEG_LENGTH };
    private readonly MIN_HIP_POSITION : Vec2 = { x: 250, y: CANVAS_HEIGHT - GROUND_HEIGHT-this.FULL_LEG_LENGTH+30 };

    public readonly ORIGINAL_HIP_POSITION : Vec2 = { x: 250, y: CANVAS_HEIGHT - GROUND_HEIGHT-this.FULL_LEG_LENGTH };

    private CURRENT_HIP_POSITION : Vec2 = { ...this.ORIGINAL_HIP_POSITION };
    private targetHipPos : Vec2 = { ...this.ORIGINAL_HIP_POSITION };
    private hipVel : Vec2 = { x: 0, y: 0 };

    private readonly SHOULDER_JOINT_OFFSET = 68;
    private readonly LEG_WIDTH_AT_HIP = 44;

    private CURRENT_LEFT_HIP_POSITION : Vec2  = {x:this.CURRENT_HIP_POSITION.x-this.LEG_WIDTH_AT_HIP/2,y:this.CURRENT_HIP_POSITION.y};
    private CURRENT_RIGHT_HIP_POSITION : Vec2  = {x:this.CURRENT_HIP_POSITION.x+this.LEG_WIDTH_AT_HIP/2,y:this.CURRENT_HIP_POSITION.y};



    private readonly ORIGINAL_ANGLE_OF_SPINE = 95 * (Math.PI / 180);

    private readonly MAX_ANGLE_OF_SPINE = 110 * (Math.PI / 180);

    private readonly MIN_ANGLE_OF_SPINE = 95 * (Math.PI / 180);

    private CURRENT_ANGLE_OF_SPINE = this.ORIGINAL_ANGLE_OF_SPINE;

    private readonly MAX_LEG_WIDTH_AT_GROUND = 120;

    private readonly MIN_LEG_WIDTH_AT_GROUND = 80;

    private CURRENT_LEG_WIDTH_AT_GROUND = 2.8*PLAYER_LENGTH_FACTOR;

    private CURRENT_LEFT_LEG_POSTION_AT_GROUND : Vec2 = {x:this.ORIGINAL_HIP_POSITION.x-40,y:CANVAS_HEIGHT - GROUND_HEIGHT}

    private CURRENT_RIGHT_LEG_POSTION_AT_GROUND : Vec2 = {x:this.CURRENT_LEFT_LEG_POSTION_AT_GROUND.x + this.CURRENT_LEG_WIDTH_AT_GROUND,y:CANVAS_HEIGHT-GROUND_HEIGHT}

    private readonly SHOULDER_HEIGHT = CANVAS_HEIGHT - GROUND_HEIGHT - 168 * 1.2; // Y position of the shoulder joints
    //private readonly SHOULDER_JOINT_OFFSET = 50;



    // Joint Positions
    private SHOULDER_MID: Vec2 = { 
        x: this.CURRENT_HIP_POSITION.x - Math.cos(this.CURRENT_ANGLE_OF_SPINE) * this.NECT_TO_HIP_LENGTH,
        y: this.CURRENT_HIP_POSITION.y - Math.sin(this.CURRENT_ANGLE_OF_SPINE) * this.NECT_TO_HIP_LENGTH 
    };  
    private HEAD_CENTER: Vec2 = { x: 0, y: 0 };
    public shoulderRx: number = 25;
    public shoulderRy: number = 17.5;
    public hipRx: number = 20;
    public hipRy: number = 14;
    // 🟢 PAPER-DOLL HEAD: real head.png skeleton ke HEAD_CENTER par skin hoti hai
    private headImage: HTMLImageElement = new Image();
    private headImageLoaded: boolean = false;
    
    private FRONT_SHOULDER: Vec2 = { 
        x: this.SHOULDER_MID.x - this.SHOULDER_JOINT_OFFSET / 2, 
        y: this.SHOULDER_MID.y 
    };
    private BACK_SHOULDER: Vec2 = {
        x: this.SHOULDER_MID.x + this.SHOULDER_JOINT_OFFSET / 2,
        y: this.SHOULDER_MID.y
    };

    // Computed each frame
    private batAngle = 0;
    
    // Real Physics - Bat ki swing speed track karne ke liye

    private angularVelocity: number = 0;
    private centerOfMass: Vec2 = { x: 0, y: 0 };
    private handleTop: Vec2 = { x: 0, y: 0 };
    private bladeTip: Vec2 = { x: 0, y: 0 };

    private frontWristTarget: Vec2 = { x: 0, y: 0 };
    private backWristTarget: Vec2 = { x: 0, y: 0 };

    private frontElbow: Vec2 = { x: 0, y: 0 };
    private backElbow: Vec2 = { x: 0, y: 0 };
    private leftKnee: Vec2 = { x: 0, y: 0 };
    private rightKnee: Vec2 = { x: 0, y: 0 };
    private frontWrist: Vec2 = { x: 0, y: 0 }; // actual (possibly clamped) wrist
    private backWrist: Vec2 = { x: 0, y: 0 };

    private mouse: Vec2 = { x: 0, y: 0 };
    private currentTime: number = 0;
    
    // For rendering hit text
    public lastHitStats: {
        regionIndex: number;
        batAngle: number;
        batSpeedX: number;
        batSpeedY: number;
        ballSpeedBeforeX: number;
        ballSpeedBeforeY: number;
        ballSpeedAfterX: number;
        ballSpeedAfterY: number;
        relativeImpactSpeed: number;
        predictedRange?: number;
        hitPosX?: number;
        hitPosY?: number;
    } | null = null;

    // 144Hz Adaptive Multi-Tier Dwell State
    private isBallStuck: boolean = false;
    private dwellFramesRemaining: number = 0;
    private stuckInfo: {
        ball: any;
        tRatio: number;
        normalSign: number;
        originalBallVelX: number;
        originalBallVelY: number;
        regionIndex: number;
    } | null = null;

    public lastSoundImpact: { speed: number; offset: number } | null = null;


    public clearStuckState(): void {
        this.isBallStuck = false;
        this.dwellFramesRemaining = 0;
        this.stuckInfo = null;
    }

    // Bat.ts ke class ke andar public getters add karein:
    public getHandleTop(): { x: number; y: number } {
        return this.handleTop;
    }

    public getBatAngle(): number {
        return this.batAngle;
    }

    // Dynamic Swing Arc Accumulator (Long Swing = Massive Acceleration & Velocity)
    private accumulatedSwingAngle: number = 0;

    private stanceOffsetY: number = 0;

    public regions: BatRegion[] = [];

    constructor() {
        for (let i = 0; i < 42; i++) {
            const historySlots: { x: number; y: number; time: number }[] = [];
            for (let q = 0; q < QUEUE_SIZE; q++) {
                historySlots.push({ x: 0, y: 0, time: 0 });
            }
            this.regions.push({
                history: historySlots,
                front: 0,
                rear: 0,
                count: 0
            });
        }

        // 🟢 PAPER-DOLL HEAD: sprite load karo (load hone tak fallback: cyan ellipse head)
        // Pivot = neck bottom (image ke neeche-center ke paas) — head neck se judkar
        // spine ke saath ghumega. Scale: image 1344x896 hai → game me ~2x PLAYER_LENGTH_FACTOR tall
        this.headImage.src = '/assets/head.png';
        this.headImage.onload = () => {
            this.headImageLoaded = true;
        };

        // Initialize full body skeleton & bat pose to resting stance (300, 300) on frame 0
        this.update(300, 300, 0.016);
    }

    private getRegionRestitution(regionIndex: number): number {
        return ((BAT_REGIONS_RESTITUTION[regionIndex] || 30) * GLOBAL_RESTITUTION_SCALE) / 100;
    }

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

    update(mouseX: number, mouseY: number, dt: number, input?: Input): void {
        // --- DYNAMIC WEIGHT SHIFTING (Relative Delta-Based Hips) ---
        // 1. Initialize previous tracking if not present
        if (!(this as any).prevHandleActualForHip) {
            (this as any).prevHandleActualForHip = { x: this.handleActual.x, y: this.handleActual.y };
        }

        // 2. Calculate how much the handle moved compared to the LAST frame
        const handleDeltaX = this.handleActual.x - (this as any).prevHandleActualForHip.x;
        const handleDeltaY = this.handleActual.y - (this as any).prevHandleActualForHip.y;

        // 3. Calculate clockwise angle of line connecting SHOULDER_MID to handleActual relative to positive X-axis
        const shoulderToHandleDx = this.handleActual.x - this.SHOULDER_MID.x;
        const shoulderToHandleDy = this.handleActual.y - this.SHOULDER_MID.y;
        const shoulderHandleAngleRad = Math.atan2(shoulderToHandleDy, shoulderToHandleDx); // clockwise angle from +X axis

        // Linearly decreases from 2.0x at 0° down to 1.0x at 180° (Math.PI)
        const normalizedAngle = Math.max(0, Math.min(Math.PI, shoulderHandleAngleRad));
        const angleAttenuation = 2.0 - (normalizedAngle / Math.PI);

        // Update TARGET hip position (X follow: Forward = 0.4, Backward = 0.70 for faster snappy retreat)
        const hipXFollowScale = handleDeltaX < 0 ? 0.70 : 0.4;
        this.targetHipPos.x += handleDeltaX * hipXFollowScale;
        this.targetHipPos.y += handleDeltaY * 0.35 * angleAttenuation;

        // 3b. Inverse Speed Horizontal-to-Vertical Hip Coupling (Slowed down 3.5x):
        // Handle Right (handleDeltaX > 0) -> Hip DOWN (+Y)
        // Handle Left (handleDeltaX < 0) -> Hip UP (-Y)
        const MIN_SPEED_THRESHOLD = 0.05;
        const speedX = Math.abs(handleDeltaX);
        if (speedX >= MIN_SPEED_THRESHOLD) {
            const MAX_RATIO = 0.35;  // Slow movement max ratio (Slowed down 3.5x)
            const MIN_RATIO = 0.04;  // Fast movement min ratio
            const DAMPING = 0.005;
            const ratio = MIN_RATIO + (MAX_RATIO - MIN_RATIO) / (1 + speedX * DAMPING);
            this.targetHipPos.y += handleDeltaX * ratio;
        }

        // 4. Add subtle COM movement influence on Target Hip
        if (!(this as any).prevComActualForHip) {
            (this as any).prevComActualForHip = { x: this.comActual.x, y: this.comActual.y };
        }
        const comDeltaX = this.comActual.x - (this as any).prevComActualForHip.x;
        const comDeltaY = this.comActual.y - (this as any).prevComActualForHip.y;

        const comHipDistX = this.comActual.x - this.targetHipPos.x;
        if (comHipDistX >= -10) {
            this.targetHipPos.x += comDeltaX * 0.075;
            this.targetHipPos.y += comDeltaY * 0.03;
        } else {
            if (comDeltaY < 0) {
                this.targetHipPos.y += comDeltaY * 0.045;
            } else if (comDeltaY > 0) {
                this.targetHipPos.y += comDeltaY * 0.045;
            }
        }

        // Save for the next frame
        (this as any).prevHandleActualForHip = { x: this.handleActual.x, y: this.handleActual.y };
        (this as any).prevComActualForHip = { x: this.comActual.x, y: this.comActual.y };

        // 5. Manual Stance Height Adjustment (W = UP, S = DOWN) - Speed slowed to 35 px/s
        if (input) {
            const stanceSpeedY = 35; // Slowed stance speed px/s
            if (input.isKeyPressed("w") || input.isKeyPressed("KeyW")) {
                this.targetHipPos.y -= stanceSpeedY * dt; // UP
                this.stanceOffsetY -= stanceSpeedY * dt;
            }
            if (input.isKeyPressed("s") || input.isKeyPressed("KeyS")) {
                this.targetHipPos.y += stanceSpeedY * dt; // DOWN
                this.stanceOffsetY += stanceSpeedY * dt;
            }
        }

        // 6. Clamp Target Hip position
        this.targetHipPos.x = Math.max(this.MIN_HIP_POSITION.x, Math.min(this.MAX_HIP_POSITION.x, this.targetHipPos.x));
        const highestHipY = this.MAX_HIP_POSITION.y; // smaller value
        const lowestHipY = this.MIN_HIP_POSITION.y;  // larger value
        this.targetHipPos.y = Math.max(highestHipY, Math.min(lowestHipY, this.targetHipPos.y));

        // 🟢 7. TIGHT SPRING-DAMPING PHYSICS (Mass-Spring-Damper for human body inertia)
        const springStiffness = 240; // Responsive body spring
        const springDamping = 28;    // Tight critical damping (smooth, no oscillations)

        const forceX = springStiffness * (this.targetHipPos.x - this.CURRENT_HIP_POSITION.x) - springDamping * this.hipVel.x;
        const forceY = springStiffness * (this.targetHipPos.y - this.CURRENT_HIP_POSITION.y) - springDamping * this.hipVel.y;

        this.hipVel.x += forceX * dt;
        this.hipVel.y += forceY * dt;

        this.CURRENT_HIP_POSITION.x += this.hipVel.x * dt;
        this.CURRENT_HIP_POSITION.y += this.hipVel.y * dt;

        // Final Clamp on Actual CURRENT_HIP_POSITION
        this.CURRENT_HIP_POSITION.x = Math.max(this.MIN_HIP_POSITION.x, Math.min(this.MAX_HIP_POSITION.x, this.CURRENT_HIP_POSITION.x));
        this.CURRENT_HIP_POSITION.y = Math.max(highestHipY, Math.min(lowestHipY, this.CURRENT_HIP_POSITION.y));
        
        // 6. Calculate Spine Angle based on Hip displacement and stretch (halved again per request)
        const RESTING_HANDLE_OFFSET_X = 50; 
        const batOffsetX = (this.handleActual.x - this.ORIGINAL_HIP_POSITION.x) - RESTING_HANDLE_OFFSET_X;
        const batOffsetY = this.handleActual.y - this.ORIGINAL_HIP_POSITION.y;
        const stretchX = this.mouse.x - this.handleActual.x;
        const stretchY = this.mouse.y - this.handleActual.y;

        let targetSpineAngle = this.CURRENT_ANGLE_OF_SPINE + (batOffsetX * 0.00425);
        if (stretchX < 0) {
            targetSpineAngle += (stretchX * 0.0009375); // Halved: Extra lean forward when reaching outer arc horizontally
        }
        if (stretchY > 0 && batOffsetY > 0) {
            targetSpineAngle += (stretchY * 0.00025); // Halved: Extra lean forward when reaching outer arc vertically
        }
        
        // Clamp spine angle so the player doesn't bend backward or forward too much
        targetSpineAngle = Math.max(this.MIN_ANGLE_OF_SPINE, Math.min(this.MAX_ANGLE_OF_SPINE, targetSpineAngle));
        
        // 7. Smooth Interpolation (Lerp) towards targets
        const lerpSpeed = 8 * (dt || 0.016); // Heavy inertia feel
        this.CURRENT_ANGLE_OF_SPINE += (targetSpineAngle - this.CURRENT_ANGLE_OF_SPINE) * lerpSpeed;
        
        // Update Dependent Joints dynamically
        this.CURRENT_LEFT_HIP_POSITION.x = this.CURRENT_HIP_POSITION.x - this.LEG_WIDTH_AT_HIP / 2;
        this.CURRENT_LEFT_HIP_POSITION.y = this.CURRENT_HIP_POSITION.y;
        this.CURRENT_RIGHT_HIP_POSITION.x = this.CURRENT_HIP_POSITION.x + this.LEG_WIDTH_AT_HIP / 2;
        this.CURRENT_RIGHT_HIP_POSITION.y = this.CURRENT_HIP_POSITION.y;
        
        this.SHOULDER_MID.x = this.CURRENT_HIP_POSITION.x - Math.cos(this.CURRENT_ANGLE_OF_SPINE) * this.NECT_TO_HIP_LENGTH;
        this.SHOULDER_MID.y = this.CURRENT_HIP_POSITION.y - Math.sin(this.CURRENT_ANGLE_OF_SPINE) * this.NECT_TO_HIP_LENGTH;

        const neckLength = 35;
        this.HEAD_CENTER.x = this.SHOULDER_MID.x - Math.cos(this.CURRENT_ANGLE_OF_SPINE) * neckLength;
        this.HEAD_CENTER.y = this.SHOULDER_MID.y - Math.sin(this.CURRENT_ANGLE_OF_SPINE) * neckLength;
        
        this.FRONT_SHOULDER.x = this.SHOULDER_MID.x - this.SHOULDER_JOINT_OFFSET / 2;
        this.FRONT_SHOULDER.y = this.SHOULDER_MID.y;
        this.BACK_SHOULDER.x = this.SHOULDER_MID.x + this.SHOULDER_JOINT_OFFSET / 2;
        this.BACK_SHOULDER.y = this.SHOULDER_MID.y;

        this.prevHandleTop = { x: this.handleTop.x, y: this.handleTop.y };
        this.prevBatAngle = this.batAngle;
        
        this.mouse.x = mouseX;
        this.mouse.y = mouseY;
        this.currentTime += dt;
        
        let targetShoulderMid = {
            x: this.CURRENT_HIP_POSITION.x - Math.cos(targetSpineAngle) * this.NECT_TO_HIP_LENGTH,
            y: this.CURRENT_HIP_POSITION.y - Math.sin(targetSpineAngle) * this.NECT_TO_HIP_LENGTH
        };

        this.updateBatPose(dt, targetShoulderMid);
        
        // --- 42 REGIONS CIRCULAR QUEUE OVERWRITE (0 Memory Allocations) ---
        const px = this.handleTop.x;
        const py = this.handleTop.y;
        for (let i = 0; i < 42; i++) {
            const L = (i + 1) * 4; // 4th pixel of the region
            const regionX = px + Math.cos(this.batAngle) * L;
            const regionY = py + Math.sin(this.batAngle) * L;
            
            const region = this.regions[i];
            if (region.count < QUEUE_SIZE) {
                const slot = region.history[region.count];
                slot.x = regionX;
                slot.y = regionY;
                slot.time = this.currentTime;

                region.front = region.count;
                region.count++;
            } else {
                const slot = region.history[region.rear];
                slot.x = regionX;
                slot.y = regionY;
                slot.time = this.currentTime;
                
                region.front = region.rear;
                region.rear = (region.rear + 1) % QUEUE_SIZE;
            }
        }

        // --- DYNAMIC CORE STRETCH PHYSICS (Stance vs. Shot Extension) ---
        const handDist = Math.hypot(this.comActual.x - this.SHOULDER_MID.x, this.comActual.y - this.SHOULDER_MID.y);
        const stretchFrac = Math.max(0, Math.min(1, (handDist - 110) / 110));

        this.shoulderRx = 36; // Broad masculine athletic chest
        this.shoulderRy = this.shoulderRx * 0.65;

        // Waist/Hip width strictly driven by LEG_WIDTH_AT_HIP variable
        const baseHipRx = this.LEG_WIDTH_AT_HIP / 2;
        this.hipRx = baseHipRx * (1 - stretchFrac * 0.15); // Narrows slightly on shot extension relative to LEG_WIDTH_AT_HIP
        this.hipRy = this.hipRx * 0.65;

        // Front hand contact point (left hand) offset relative to Hip Y-axis line
        const frontDx = this.frontWristTarget.x - this.CURRENT_HIP_POSITION.x;
        const frontDy = this.frontWristTarget.y - this.CURRENT_HIP_POSITION.y;
        const frontShiftAngle = (frontDx * 0.0147) + (frontDy * 0.0098);
        const scale = 1;
        
        // Strict constraints for Left (Front) Shoulder rotation
        const rawFrontAngle = Math.PI - frontShiftAngle * scale;
        const MIN_FRONT_SHOULDER_ANGLE = Math.PI * 0.75; // ~135 deg (prevents going too far back/down)
        const MAX_FRONT_SHOULDER_ANGLE = Math.PI * 1.25; // ~225 deg (prevents going too far forward/up)
        const frontAngle = Math.max(MIN_FRONT_SHOULDER_ANGLE, Math.min(MAX_FRONT_SHOULDER_ANGLE, rawFrontAngle));

        this.FRONT_SHOULDER.x = this.SHOULDER_MID.x + this.shoulderRx * Math.cos(frontAngle);
        this.FRONT_SHOULDER.y = this.SHOULDER_MID.y + this.shoulderRy * Math.sin(frontAngle);

        // Back hand contact point (right hand) offset relative to Hip Y-axis line
        const backDx = this.backWristTarget.x - this.CURRENT_HIP_POSITION.x;
        const backDy = this.backWristTarget.y - this.CURRENT_HIP_POSITION.y;
        const backShiftAngle = (backDx * 0.0147) + (backDy * 0.0098);
        
        // Unclamped back/right shoulder angle
        const backAngle = 0 - backShiftAngle * scale;

        this.BACK_SHOULDER.x = this.SHOULDER_MID.x + this.shoulderRx * Math.cos(backAngle);
        this.BACK_SHOULDER.y = this.SHOULDER_MID.y + this.shoulderRy * Math.sin(backAngle);

        // --- UPDATE LEG / HIP JOINTS ALONG THE HIP DEBUG ELLIPSE ---
        const leftHipAngle = Math.PI - (frontShiftAngle * 0.3);
        this.CURRENT_LEFT_HIP_POSITION.x = this.CURRENT_HIP_POSITION.x + this.hipRx * Math.cos(leftHipAngle);
        this.CURRENT_LEFT_HIP_POSITION.y = this.CURRENT_HIP_POSITION.y + this.hipRy * Math.sin(leftHipAngle);

        const rightHipAngle = 0 - (backShiftAngle * 0.5);
        this.CURRENT_RIGHT_HIP_POSITION.x = this.CURRENT_HIP_POSITION.x + this.hipRx * Math.cos(rightHipAngle);
        this.CURRENT_RIGHT_HIP_POSITION.y = this.CURRENT_HIP_POSITION.y + this.hipRy * Math.sin(rightHipAngle);

        // 1. Left foot stays 100% FIXED on ground (Stationary back-foot anchor)
        this.CURRENT_LEFT_LEG_POSTION_AT_GROUND.x = this.ORIGINAL_HIP_POSITION.x - 55;

        // 2. Right foot moves forward, constrained by exact leg length (Pythagorean reach limit)
        const dyRight = (CANVAS_HEIGHT - GROUND_HEIGHT) - this.CURRENT_RIGHT_HIP_POSITION.y;
        const maxLegReach = this.FULL_LEG_LENGTH - 10; // Natural knee bend headroom
        const maxDxAllowed = Math.sqrt(Math.max(0, maxLegReach ** 2 - dyRight ** 2));

        const MIN_FEET_DISTANCE = 50; // Minimum allowed gap between Left and Right feet on ground
        const minRightFootX = this.CURRENT_LEFT_LEG_POSTION_AT_GROUND.x + MIN_FEET_DISTANCE;

        const desiredRightFootX = this.CURRENT_RIGHT_HIP_POSITION.x + 35;
        const maxRightFootX = this.CURRENT_RIGHT_HIP_POSITION.x + maxDxAllowed;
        
        // Clamp Right Foot target between MIN_FEET_DISTANCE and maxLegReach
        const targetRightFootX = Math.max(minRightFootX, Math.min(maxRightFootX, desiredRightFootX));

        const legSpeedFactor = 0.25;
        this.CURRENT_RIGHT_LEG_POSTION_AT_GROUND.x += 
            (targetRightFootX - this.CURRENT_RIGHT_LEG_POSTION_AT_GROUND.x) * legSpeedFactor;

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

        this.updateLeg(
            this.CURRENT_LEFT_HIP_POSITION,
            this.CURRENT_LEFT_LEG_POSTION_AT_GROUND,
            this.THIGH_LENGTH,
            this.SHIN_LENGTH,
            1,
            "left"
        );
        this.updateLeg(
            this.CURRENT_RIGHT_HIP_POSITION,
            this.CURRENT_RIGHT_LEG_POSTION_AT_GROUND,
            this.THIGH_LENGTH,
            this.SHIN_LENGTH,
            -1,
            "right"
        );
    }
        public setBatPoseFromMouse(mouseX: number, mouseY: number) {
            // 🚀 Built-in IK solver se Full Body Hips, Spine, Shoulders, Arms & Legs update:
            this.update(mouseX, mouseY, 0.016);
        }
    // ---------------------------------------------------------------
    // STEP 1: bat orientation + COM + wrist targets, driven by mouse
    // ---------------------------------------------------------------
    private updateBatPose(dt: number, targetShoulderMid: Vec2): void {
        const shoulderMid = targetShoulderMid; // Evaluate constraints based on future body position!
        const FRONT_MAX = this.FRONT_UPPER_ARM + this.FRONT_LOWER_ARM;
        const BACK_MAX = this.BACK_UPPER_ARM + this.BACK_LOWER_ARM;
        const comOffsetFromTop = this.TOTAL_BAT_LENGTH * BAT_CENTER_OF_MASS_RATIO;
        
        // 1. Mouse Target Clamping (Safe Zone)
        const rawMouseX = this.mouse.x + this.GRIP_OFFSET_FROM_CURSOR;
        const rawMouseY = this.mouse.y + this.stanceOffsetY;

        // 🟢 60 FPS LOCKED DELTA-TIME DISTANCE SMOOTHING (Multi-Frame Average Catchup)
        if (!(this as any).laggingTarget) {
            (this as any).laggingTarget = { x: rawMouseX, y: rawMouseY };
            (this as any).prevMousePos = { x: rawMouseX, y: rawMouseY };
            (this as any).prevStepPx = 0;
        }

        const lt = (this as any).laggingTarget;
        const prevM = (this as any).prevMousePos;

        // Calculate actual mouse displacement in pixels
        const mouseDx = rawMouseX - prevM.x;
        const mouseDy = rawMouseY - prevM.y;
        const mouseDistPx = Math.hypot(mouseDx, mouseDy);

        // Normalize distance to exact 60 FPS reference frame scale (1 frame = 0.01667s)
        const frameDt = Math.max(0.001, dt || 0.01667);
        const fpsScale = frameDt / 0.01667;
        const currentNormDist = mouseDistPx / fpsScale;

        // Distance between lagging point and current mouse position
        const gapX = rawMouseX - lt.x;
        const gapY = rawMouseY - lt.y;
        const gapDist = Math.hypot(gapX, gapY);

        const prevStep = (this as any).prevStepPx || 0;
        let effectiveStep = 0;

        // Threshold for rest (stationary state)
        const REST_THRESHOLD = 0.8; // Normalized pixels

        // Denominator Divisor for Tuning Acceleration Lag Rate (e.g. 2, 3, 4, 5)
        const accelDivisor = 6;

        if (currentNormDist < REST_THRESHOLD && gapDist < 2.0) {
            // State 1: At Rest -> Reset step size to 0 for heavy initial breakout feel on next move
            effectiveStep = 0;
        } else if (prevStep === 0 && currentNormDist >= REST_THRESHOLD) {
            // State 2: Initial Breakout from Rest -> Move 50% of the initial gap/distance (Heavy start)
            effectiveStep = currentNormDist * 0.5;
        } else if (gapDist > 3.0 || currentNormDist > prevStep) {
            // State 3: Accelerating / Catching Up Phase -> (Current - Prev) / accelDivisor + Prev
            effectiveStep = ((currentNormDist - prevStep) / accelDivisor) + prevStep;
        } else {
            // State 4: Decelerating Phase (currentNormDist <= prevStep) -> Instant 100% full movement
            effectiveStep = currentNormDist;
        }

        // Save states for next frame
        (this as any).prevMousePos = { x: rawMouseX, y: rawMouseY };
        (this as any).prevStepPx = effectiveStep;

        // Scale step back to frame time and move laggingTarget WITHOUT overwriting laggingTarget position
        const frameStepPx = effectiveStep * fpsScale;

        if (gapDist > 0.001) {
            const stepPx = Math.min(gapDist, frameStepPx);
            lt.x += (gapX / gapDist) * stepPx;
            lt.y += (gapY / gapDist) * stepPx;
        }

        // Use persistent lagging target point as effective mouse input
        const effectiveMouseX = lt.x;
        const effectiveMouseY = lt.y;
        
        const dxMouse = effectiveMouseX - shoulderMid.x;
        const dyMouse = effectiveMouseY - shoulderMid.y;
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
            this.comTarget = { x: effectiveMouseX, y: effectiveMouseY };
        }

        if (!this.prevComTarget) {
            this.prevComTarget = { x: this.comTarget.x, y: this.comTarget.y };
        }
        const targetVelocityX = (this.comTarget.x - this.prevComTarget.x) / dt;
        this.prevComTarget = { x: this.comTarget.x, y: this.comTarget.y };

        // 🟢 DYNAMIC SWING ARC MOMENTUM & CENTRIFUGAL OVERTAKE ACCELERATION
        if (targetVelocityX !== 0) {
            const isSameDirection = (targetVelocityX > 0 && this.accumulatedSwingAngle >= 0) || 
                                    (targetVelocityX < 0 && this.accumulatedSwingAngle <= 0);
            if (isSameDirection) {
                this.accumulatedSwingAngle += targetVelocityX * dt * 0.005;
            } else {
                this.accumulatedSwingAngle = targetVelocityX * dt * 0.005;
            }
        } else {
            this.accumulatedSwingAngle *= 0.90; // Natural momentum decay when stationary
        }

        // Clamp max accumulated swing arc angle (approx ±180 degrees equivalent in radians factor)
        const maxArcLimit = 2.2;
        this.accumulatedSwingAngle = Math.max(-maxArcLimit, Math.min(maxArcLimit, this.accumulatedSwingAngle));

        // Centrifugal lead offset: Bat accelerates ahead of raw cursor during long continuous swings
        const swingLeadMultiplier = 38; // Pixels ahead of cursor at full swing momentum
        const swingLeadX = Math.sin(this.accumulatedSwingAngle) * swingLeadMultiplier;
        this.comTarget.x += swingLeadX;

        this.simulateComPhysics(dt);

        const dtClamp = Math.min(dt, 0.05);

        // Calculate COM movement
        let comUpSpeed = -this.comVelocity.y;

        // Current relative vector between Handle and COM
        let dxAngle = this.handleActual.x - this.comActual.x;
        let dyAngle = this.handleActual.y - this.comActual.y;
        
        // Find current angle
        let currentAngle = Math.atan2(dyAngle, dxAngle); 
        // 1. Arm angle k-lookup for wrist tilt scaling
        let armDx = this.handleActual.x - this.SHOULDER_MID.x;
        let armDy = this.handleActual.y - this.SHOULDER_MID.y;
        let armAngleDeg = Math.atan2(armDy, armDx) * (180 / Math.PI);
        let index = Math.floor((armAngleDeg + 30) / 3);
        index = Math.max(0, Math.min(69, index));
        let k = k_values[index];

        // 2. Upward Swing -> Tilt Forward
        if (comUpSpeed > 0) {
            let tiltSpeed = comUpSpeed * this.WRIST_TILT_SPEED_SCALE;
            currentAngle += tiltSpeed * dtClamp * k;
        }

        // 🟢 EXACT MIRROR SYMMETRICAL UN-BEND: Reverse tilt with identical instant feel on backward movement
        let horizontalTiltSpeed = targetVelocityX * HORIZONTAL_TILT_SPEED_SCALE * 0.7;
        
        // Clamp tilt speed so it doesn't spin wildly on very fast mouse flicks
        const maxTiltSpeed = 10.0;
        if (horizontalTiltSpeed > maxTiltSpeed) horizontalTiltSpeed = maxTiltSpeed;
        if (horizontalTiltSpeed < -maxTiltSpeed) horizontalTiltSpeed = -maxTiltSpeed;

        if (targetVelocityX < 0) {
            // Apply identical instantaneous mirror un-bend scaling
            currentAngle += horizontalTiltSpeed * dtClamp * (1.0 + k * 0.5);
        } else {
            currentAngle += horizontalTiltSpeed * dtClamp;
        }

        // Clamp minimum/maximum wrist tilt angle to prevent unnatural inward curl under body
        const MIN_WRIST_ANGLE = -Math.PI * 0.58; // approx -104 degrees
        const MAX_WRIST_ANGLE = Math.PI * 0.15;   // approx 27 degrees
        currentAngle = Math.max(MIN_WRIST_ANGLE, Math.min(MAX_WRIST_ANGLE, currentAngle));

        // 2. Set desired handle position using the angle (Locks the angle if not moving UP)
        let desiredHandleX = this.comActual.x + Math.cos(currentAngle) * comOffsetFromTop;
        let desiredHandleY = this.comActual.y + Math.sin(currentAngle) * comOffsetFromTop;

        this.handleActual.x = desiredHandleX;
        this.handleActual.y = desiredHandleY;

        const frontHandPosition = 0.8;
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
            
            let hdx = this.handleActual.x - shoulderMid.x;
            let hdy = this.handleActual.y - shoulderMid.y;
            let hDist = Math.hypot(hdx, hdy);

            if (hDist > 0.01) {
                let angleDeg = (Math.atan2(hdy, hdx) * 180) / Math.PI;
                
                // 1. Angle Ceiling (-30 degree se upar roknna)
                const MIN_ANGLE = -30; 
                
                // Agar angle -30 se aur chota (-40, -90) hai, toh usey -30 par lock kar do
                if (angleDeg < MIN_ANGLE && angleDeg >= -180) {
                    angleDeg = MIN_ANGLE;
                    const rad = (angleDeg * Math.PI) / 180;
                    hdx = Math.cos(rad) * hDist;
                    hdy = Math.sin(rad) * hDist;
                    this.handleActual.x = shoulderMid.x + hdx;
                    this.handleActual.y = shoulderMid.y + hdy;
                }

                // 2. Radial Arc Constraints (JSON se radius check karna)
                let maxRadius = this.getInterpolatedRadius(outerArcJson, angleDeg, 200) * OUTER_ARC_SCALE;
                let minRadius = this.getInterpolatedRadius(innerArcJson, angleDeg, 400) * INNER_ARC_SCALE;

                if (hDist >= maxRadius - 2) {
                    this.handleActual.x = shoulderMid.x + (hdx / hDist) * maxRadius;
                    this.handleActual.y = shoulderMid.y + (hdy / hDist) * maxRadius;

                    // 🟢 OUTER ARC DHAKA IMPULSE: Active ONLY between 0° and 80° angle range
                    if (angleDeg >= 0 && angleDeg <= 80) {
                        const pushDirX = hdx / hDist;
                        const pushDirY = hdy / hDist;
                        
                        // Add continuous target displacement
                        this.targetHipPos.x += pushDirX * 1.8;
                        this.targetHipPos.y += pushDirY * 0.9;

                        // Direct impulse velocity kick to hipVel for a realistic physical "Dhaka" momentum
                        this.hipVel.x += pushDirX * 35;
                        this.hipVel.y += pushDirY * 18;
                    }
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
            x: this.handleTop.x + dir.x * this.TOTAL_BAT_LENGTH,
            y: this.handleTop.y + dir.y * this.TOTAL_BAT_LENGTH,
        };

        const backHandPosition = 0.3;
        
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

        // --- REAL PHYSICS UPDATE ---
        if (dt > 0) {
            this.handleVelocity.x = (this.handleTop.x - this.prevHandleTop.x) / dt;
            this.handleVelocity.y = (this.handleTop.y - this.prevHandleTop.y) / dt;
            this.angularVelocity = (this.batAngle - this.prevBatAngle) / dt;

            // Track continuous swing arc angle
            const dAngle = Math.abs(this.batAngle - this.prevBatAngle);
            if (Math.abs(this.angularVelocity) > 0.4) {
                this.accumulatedSwingAngle += dAngle;
            } else {
                this.accumulatedSwingAngle *= 0.94; // Decay slowly when bat slows down
            }
        }
    }
    // Check karega ki ball Bat se takrai ya nahi
    public checkHit(ball: any, dt: number = 0.016): { hit: boolean; hitSubStep: number } {
        if (!ball.isActive) return { hit: false, hitSubStep: 30 };

        // --- DWELL HOLD & RELEASE SYSTEM (Multi-Tier 144Hz) ---
        if (this.isBallStuck && this.stuckInfo) {
            const info = this.stuckInfo;
            const regionIndex = info.regionIndex;

            // Keep ball attached to moving bat face during dwell hold
            let normalX = -Math.sin(this.batAngle);
            let normalY = Math.cos(this.batAngle);
            if (info.normalSign < 0) {
                normalX = -normalX;
                normalY = -normalY;
            }
            const pushOutDist = ball.radius + (this.HANDLE_WIDTH / 2) + 0.1;
            const L = info.tRatio * this.TOTAL_BAT_LENGTH;
            ball.pos.x = this.handleTop.x + Math.cos(this.batAngle) * L + (normalX * pushOutDist);
            ball.pos.y = this.handleTop.y + Math.sin(this.batAngle) * L + (normalY * pushOutDist);

            this.dwellFramesRemaining--;

            // If dwell frames remaining, keep holding ball on bat face
            if (this.dwellFramesRemaining > 0) {
                return { hit: true, hitSubStep: 1 };
            }

            // --- FINAL FRAME: RELEASE BALL WITH FULL ACCUMULATED MOMENTUM ---
            const region = this.regions[regionIndex];
            const queue = region.history;

            let batHitSpeedX = 0;
            let batHitSpeedY = 0;

            if (region.count > 1) {
                const oldest = queue[region.rear];
                const latest = queue[region.front];
                const secondOldestIndex = (region.rear + 1) % QUEUE_SIZE;
                const secondOldest = region.count > 2 ? queue[secondOldestIndex] : queue[region.rear];

                const dx_q = latest.x - oldest.x;
                const dy_q = latest.y - oldest.y;
                const dist_q = Math.sqrt(dx_q * dx_q + dy_q * dy_q);
                const time_q = latest.time - oldest.time;
                
                if (time_q > 0.0001 && dist_q > 0.0001) {
                    const speed = dist_q / time_q;

                    const dx_dir = latest.x - secondOldest.x;
                    const dy_dir = latest.y - secondOldest.y;
                    const dist_dir = Math.hypot(dx_dir, dy_dir);

                    let dirX = dx_q / dist_q;
                    let dirY = dy_q / dist_q;
                    if (dist_dir > 0.0001) {
                        dirX = dx_dir / dist_dir;
                        dirY = dy_dir / dist_dir;
                    }

                    batHitSpeedX = dirX * speed;
                    batHitSpeedY = dirY * speed;
                }
            } else {
                batHitSpeedX = this.handleVelocity.x - (this.angularVelocity * L * Math.sin(this.batAngle));
                batHitSpeedY = this.handleVelocity.y + (this.angularVelocity * L * Math.cos(this.batAngle));
            }

            const relativeVx = info.originalBallVelX - batHitSpeedX;
            const relativeVy = info.originalBallVelY - batHitSpeedY;

            const v_normal = relativeVx * normalX + relativeVy * normalY;

            const v_tangentX = relativeVx - v_normal * normalX;
            const v_tangentY = relativeVy - v_normal * normalY;

            const v_normal_after = -v_normal * this.getRegionRestitution(regionIndex);

            const physicsVelX = (v_normal_after * normalX) + v_tangentX;
            const physicsVelY = (v_normal_after * normalY) + v_tangentY;
            const speed_after = Math.hypot(physicsVelX, physicsVelY);

            // Scale exit speed based on cumulative swing arc length & angular speed (Reduced 3x again)
            const arcDegrees = (this.accumulatedSwingAngle * 180) / Math.PI;
            const swingArcMultiplier = 1 + Math.min(0.09, (arcDegrees / 90) * 0.07) + Math.min(0.07, (Math.abs(this.angularVelocity) / 10) * 0.05);

            if (speed_after > 0.001) {
                const physicsAngle = Math.atan2(physicsVelY, physicsVelX);
                const normalAngle = Math.atan2(normalY, normalX);

                let angleDiff = physicsAngle - normalAngle;
                
                while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

                const assistFactor = Math.max(0, Math.min(100, NORMAL_DIRECTION_ASSIST)) / 100;
                const newAngle = normalAngle + angleDiff * (1 - assistFactor);

                ball.vel.x = (batHitSpeedX + Math.cos(newAngle) * speed_after) * swingArcMultiplier;
                ball.vel.y = (batHitSpeedY + Math.sin(newAngle) * speed_after) * swingArcMultiplier;
            } else {
                ball.vel.x = (batHitSpeedX + physicsVelX) * swingArcMultiplier;
                ball.vel.y = (batHitSpeedY + physicsVelY) * swingArcMultiplier;
            }

            this.lastHitStats = {
                regionIndex,
                batAngle: (this.batAngle * 180) / Math.PI,
                batSpeedX: batHitSpeedX,
                batSpeedY: batHitSpeedY,
                ballSpeedBeforeX: info.originalBallVelX,
                ballSpeedBeforeY: info.originalBallVelY,
                ballSpeedAfterX: ball.vel.x,
                ballSpeedAfterY: ball.vel.y,
                relativeImpactSpeed: Math.hypot(relativeVx, relativeVy),
                predictedRange: this.calculatePredictedRange(ball.pos, ball.vel),
                hitPosX: ball.pos.x,
                hitPosY: ball.pos.y
            };

            // Release ball!
            ball.isStuck = false;
            this.isBallStuck = false;
            this.stuckInfo = null;
            return { hit: true, hitSubStep: 1 };
        }

        let hit = false;
        let t = 0;
        let hitSubStep = 0;
        const subSteps = 15;
        
        let finalBx = ball.pos.x;
        let finalBy = ball.pos.y;
        let finalAngle = this.batAngle;

        for (let step = 1; step <= subSteps; step++) {
            const fraction = step / subSteps;
            const prevFraction = (step - 1) / subSteps;

            const px = this.prevHandleTop.x + (this.handleTop.x - this.prevHandleTop.x) * fraction;
            const py = this.prevHandleTop.y + (this.handleTop.y - this.prevHandleTop.y) * fraction;
            const angle = this.prevBatAngle + (this.batAngle - this.prevBatAngle) * fraction;
            
            const tipX = px + Math.cos(angle) * this.TOTAL_BAT_LENGTH;
            const tipY = py + Math.sin(angle) * this.TOTAL_BAT_LENGTH;

            const bx = ball.prevPos.x + (ball.pos.x - ball.prevPos.x) * fraction;
            const by = ball.prevPos.y + (ball.pos.y - ball.prevPos.y) * fraction;
            
            const prevBx = ball.prevPos.x + (ball.pos.x - ball.prevPos.x) * prevFraction;
            const prevBy = ball.prevPos.y + (ball.pos.y - ball.prevPos.y) * prevFraction;
            
            const prevPx = this.prevHandleTop.x + (this.handleTop.x - this.prevHandleTop.x) * prevFraction;
            const prevPy = this.prevHandleTop.y + (this.handleTop.y - this.prevHandleTop.y) * prevFraction;

            // CCD at sub-step
            const ballMoveX = bx - prevBx;
            const ballMoveY = by - prevBy;
            const batMoveX = px - prevPx;
            const batMoveY = py - prevPy;
            
            const effAx = bx - (ballMoveX - batMoveX);
            const effAy = by - (ballMoveY - batMoveY);

            const r_x = bx - effAx;
            const r_y = by - effAy;
            const s_x = tipX - px;
            const s_y = tipY - py;

            const cross = r_x * s_y - r_y * s_x;
            if (Math.abs(cross) > 0.0001) {
                const u_t = ((px - effAx) * s_y - (py - effAy) * s_x) / cross;
                const u_u = ((px - effAx) * r_y - (py - effAy) * r_x) / cross;

                if (u_t >= 0 && u_t <= 1 && u_u >= 0 && u_u <= 1) {
                    hit = true;
                    t = u_u;
                    hitSubStep = step;
                    finalBx = ball.prevPos.x + u_t * (ball.pos.x - ball.prevPos.x);
                    finalBy = ball.prevPos.y + u_t * (ball.pos.y - ball.prevPos.y);
                    finalAngle = angle;
                    break;
                }
            }

            // Distance fallback at sub-step
            if (!hit) {
                const dx = tipX - px;
                const dy = tipY - py;

                let temp_t = ((bx - px) * dx + (by - py) * dy) / (dx * dx + dy * dy);
                temp_t = Math.max(0, Math.min(1, temp_t));

                const closestX = px + temp_t * dx;
                const closestY = py + temp_t * dy;

                const distX = bx - closestX;
                const distY = by - closestY;
                const distance = Math.sqrt(distX * distX + distY * distY);

                if (distance <= ball.radius + (this.HANDLE_WIDTH / 2)) {
                    hit = true;
                    t = temp_t;
                    hitSubStep = step;
                    finalBx = bx;
                    finalBy = by;
                    finalAngle = angle;
                    break;
                }
            }
        }

        if (hit) {
            const hitDistance = t * this.TOTAL_BAT_LENGTH;
            let regionIndex = Math.floor(hitDistance / 4);
            regionIndex = Math.max(0, Math.min(41, regionIndex));

            const region = this.regions[regionIndex];
            const queue = region.history;

            const originalBallVelX = ball.vel.x;
            const originalBallVelY = ball.vel.y;

            let batHitSpeedX = 0;
            let batHitSpeedY = 0;

            if (region.count > 1) {
                const oldest = queue[region.rear];
                const latest = queue[region.front];
                const secondOldestIndex = (region.rear + 1) % QUEUE_SIZE;
                const secondOldest = region.count > 2 ? queue[secondOldestIndex] : queue[region.rear];

                const dx_q = latest.x - oldest.x;
                const dy_q = latest.y - oldest.y;
                const dist_q = Math.sqrt(dx_q * dx_q + dy_q * dy_q);
                const time_q = latest.time - oldest.time;
                
                if (time_q > 0.0001 && dist_q > 0.0001) {
                    const speed = dist_q / time_q;

                    // Direction calculated using latest - secondOldest
                    const dx_dir = latest.x - secondOldest.x;
                    const dy_dir = latest.y - secondOldest.y;
                    const dist_dir = Math.hypot(dx_dir, dy_dir);

                    let dirX = dx_q / dist_q;
                    let dirY = dy_q / dist_q;
                    if (dist_dir > 0.0001) {
                        dirX = dx_dir / dist_dir;
                        dirY = dy_dir / dist_dir;
                    }

                    batHitSpeedX = dirX * speed;
                    batHitSpeedY = dirY * speed;
                }
            } else {
                const L = t * this.TOTAL_BAT_LENGTH;
                batHitSpeedX = this.handleVelocity.x - (this.angularVelocity * L * Math.sin(finalAngle));
                batHitSpeedY = this.handleVelocity.y + (this.angularVelocity * L * Math.cos(finalAngle));
            }

            const relativeVx = ball.vel.x - batHitSpeedX;
            const relativeVy = ball.vel.y - batHitSpeedY;

            let normalX = -Math.sin(finalAngle);
            let normalY = Math.cos(finalAngle);

            let normalSign = 1;
            if (relativeVx * normalX + relativeVy * normalY > 0) {
                normalX = -normalX;
                normalY = -normalY;
                normalSign = -1;
            }

            const relativeImpactSpeed = Math.hypot(relativeVx, relativeVy);
            const isBladeRegion = (t * this.TOTAL_BAT_LENGTH) >= 56; // Entire wooden blade (excluding 56px handle)

            // CRITICAL PHYSICAL GUARD: Unconditionally exit if ball is separating / passing past (v_normal > 0)
            const v_normal = relativeVx * normalX + relativeVy * normalY;
            if (v_normal > 0) return { hit: false, hitSubStep: 30 }; // No physical impact -> NO sound! NO stick! NO deflection!

            // --- MULTI-TIER DWELL FRAME INITIALIZATION (at 144Hz) ---
            if (isBladeRegion) {
                const v_normal_abs = Math.abs(v_normal);
                let dwellFrames = 1; // Default < 1000 px/s (1 frame)

                if (v_normal_abs >= 5000) {
                    dwellFrames = 3; // 5000+ -> 5 frames
                } else if (v_normal_abs >= 3000) {
                    dwellFrames = 2; // 3000..4999 -> 4 frames
                } else if (v_normal_abs >= 2000) {
                    dwellFrames = 2; // 2000..2999 -> 3 frames
                } else if (v_normal_abs >= 1000) {
                    dwellFrames = 1; // 1000..1999 -> 2 frames
                }

                // Single-shot sound on confirmed physical collision
                SoundManager.getInstance().playBatHit(v_normal_abs, t * this.TOTAL_BAT_LENGTH);
                // 🟢 EXACT sound params capture — HIT_RESULT packet me jayenge (sound sync)
                this.lastSoundImpact = { speed: v_normal_abs, offset: t * this.TOTAL_BAT_LENGTH };

                this.isBallStuck = true;
                this.dwellFramesRemaining = dwellFrames;
                ball.isStuck = true;
                this.stuckInfo = {
                    ball,
                    tRatio: t,
                    normalSign,
                    originalBallVelX,
                    originalBallVelY,
                    regionIndex
                };

                const pushOutDist = ball.radius + (this.HANDLE_WIDTH / 2) + 0.1;
                const L = t * this.TOTAL_BAT_LENGTH;
                ball.pos.x = this.handleTop.x + Math.cos(this.batAngle) * L + (normalX * pushOutDist);
                ball.pos.y = this.handleTop.y + Math.sin(this.batAngle) * L + (normalY * pushOutDist);
                ball.vel.x = batHitSpeedX;
                ball.vel.y = batHitSpeedY;

                return { hit: true, hitSubStep: hitSubStep };
            }

            // --- BRANCH 2: NORMAL IMMEDIATE BOUNCE COLLISION ---
            // Single-shot sound on confirmed physical bounce deflection
            SoundManager.getInstance().playBatHit(Math.abs(v_normal), t * this.TOTAL_BAT_LENGTH);
            // 🟢 EXACT sound params capture — HIT_RESULT packet me jayenge (sound sync)
            this.lastSoundImpact = { speed: Math.abs(v_normal), offset: t * this.TOTAL_BAT_LENGTH };

            // FIX: PROPER PUSH-OUT
            const pushOutDist = ball.radius + (this.HANDLE_WIDTH / 2) + 0.1;
            ball.pos.x = finalBx + (normalX * pushOutDist);
            ball.pos.y = finalBy + (normalY * pushOutDist);

            const v_tangentX = relativeVx - v_normal * normalX;
            const v_tangentY = relativeVy - v_normal * normalY;

            const v_normal_after = -v_normal * this.getRegionRestitution(regionIndex);
            

            const physicsVelX = (v_normal_after * normalX) + v_tangentX;
            const physicsVelY = (v_normal_after * normalY) + v_tangentY;
            const speed_after = Math.hypot(physicsVelX, physicsVelY);

            if (speed_after > 0.001) {
                const physicsAngle = Math.atan2(physicsVelY, physicsVelX);
                const normalAngle = Math.atan2(normalY, normalX);

                let angleDiff = physicsAngle - normalAngle;
                
                while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

                const assistFactor = Math.max(0, Math.min(100, NORMAL_DIRECTION_ASSIST)) / 100;
                const newAngle = normalAngle + angleDiff * (1 - assistFactor);

                ball.vel.x = batHitSpeedX + Math.cos(newAngle) * speed_after;
                ball.vel.y = batHitSpeedY + Math.sin(newAngle) * speed_after;
            } else {
                ball.vel.x = batHitSpeedX + physicsVelX;
                ball.vel.y = batHitSpeedY + physicsVelY;
            }

            // FIX: REMAINING TIME PROJECTION
            const remainingFraction = (subSteps - hitSubStep) / subSteps;
            const remainingDt = remainingFraction * dt;
            ball.pos.x += ball.vel.x * remainingDt;
            ball.pos.y += ball.vel.y * remainingDt;
            
            // Capture for persistent debug text
            this.lastHitStats = {
                regionIndex: regionIndex,
                batAngle: this.batAngle * (180 / Math.PI), // Convert to degrees
                batSpeedX: batHitSpeedX,
                batSpeedY: batHitSpeedY,
                ballSpeedBeforeX: originalBallVelX,
                ballSpeedBeforeY: originalBallVelY,
                ballSpeedAfterX: ball.vel.x,
                ballSpeedAfterY: ball.vel.y,
                relativeImpactSpeed: relativeImpactSpeed,
                predictedRange: this.calculatePredictedRange(ball.pos, ball.vel),
                hitPosX: ball.pos.x,
                hitPosY: ball.pos.y
            };

            // Glitch se bachne ke liye ball ko bat se thoda bahar dhakel dena
            ball.pos.x += 10; 
            
            console.log(`HIT! Region: ${regionIndex}, Bounce: ${this.getRegionRestitution(regionIndex)}, Speed X: ${Math.floor(batHitSpeedX)}, Y: ${Math.floor(batHitSpeedY)}`);
        }

        return { hit: hit, hitSubStep: hitSubStep };
    }
    // public kiya gaya (pehle private tha): bowler ke client par checkHit() chalta hi nahi,
    // isliye GameLoop onHitResult me predictedRange khud calculate karne ke liye isko call karta hai
    public calculatePredictedRange(pos: { x: number; y: number }, vel: { x: number; y: number }): number {
        const groundY = CANVAS_HEIGHT - GROUND_HEIGHT;
        const dy = groundY - pos.y;
        const g = GRAVITY; // Real game physics gravity (3566 px/s^2)
        const vy = vel.y;
        const vx = vel.x;
        const disc = (vy * vy) + (2 * g * dy);
        if (disc >= 0) {
            const flightTime = (-vy + Math.sqrt(disc)) / g;
            return Math.abs(vx) * flightTime;
        }
        return 0;
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
        const gravityForceY = GRAVITY * this.BAT_MASS * gravityScale;

        const totalForceX = springForceX + dampingForceX;
        const totalForceY = springForceY + dampingForceY + gravityForceY;

        let accelX = totalForceX / this.BAT_MASS;
        let accelY = totalForceY / this.BAT_MASS;

        // Dynamic Swing Arc Acceleration Scaling (Tuned down 3x again)
        const arcDegrees = (this.accumulatedSwingAngle * 180) / Math.PI;
        const arcBonus = 1 + Math.min(0.25, (arcDegrees / 90) * 0.13);
        const angularBonus = 1 + Math.min(0.20, (Math.abs(this.angularVelocity) / 10) * 0.11);

        const DYNAMIC_MAX_ACCEL = 14000 * arcBonus * angularBonus;

        const accelMag = Math.hypot(accelX, accelY);
        if (accelMag > DYNAMIC_MAX_ACCEL) {
            const scale = DYNAMIC_MAX_ACCEL / accelMag;
            accelX *= scale;
            accelY *= scale;
        }

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

    private updateLeg(
        hip: Vec2,
        target: Vec2,
        upperLen: number,
        lowerLen: number,
        bendSide: 1 | -1,
        which: "left" | "right"
    ): void {
        const dx = target.x - hip.x;
        const dy = target.y - hip.y;
        const rawDist = Math.hypot(dx, dy);

        const minReach = Math.abs(upperLen - lowerLen) + this.EPS;
        const maxReach = upperLen + lowerLen - this.EPS;
        const dist = Math.min(Math.max(rawDist, minReach), maxReach);

        const clampedTarget: Vec2 =
            rawDist === 0
                ? { x: hip.x + dist, y: hip.y }
                : {
                      x: hip.x + (dx / rawDist) * dist,
                      y: hip.y + (dy / rawDist) * dist,
                  };

        const baseAngle = Math.atan2(
            clampedTarget.y - hip.y,
            clampedTarget.x - hip.x
        );

        const cosAngle = (upperLen ** 2 + dist ** 2 - lowerLen ** 2) / (2 * upperLen * dist);
        const hipAngle = Math.acos(Math.min(1, Math.max(-1, cosAngle)));

        const candidateA = this.pointOnCircle(hip, upperLen, baseAngle + hipAngle);
        const candidateB = this.pointOnCircle(hip, upperLen, baseAngle - hipAngle);

        let knee = this.sideOfLine(hip, clampedTarget, candidateA) === bendSide
            ? candidateA
            : candidateB;

        if (which === "left") {
            this.leftKnee = knee;
        } else {
            this.rightKnee = knee;
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
        this.drawLegs(ctx);
        this.drawTorsoCylinder(ctx);
        this.drawBackArm(ctx);
        this.drawHead(ctx);
        this.drawFrontArm(ctx);
        this.drawBat(ctx);
    }

    // private drawBat(ctx: CanvasRenderingContext2D): void {
    //     ctx.save();
        
    //     // Transform to bat's local space. 
    //     // In local space, (0,0) is handleTop, X-axis points down the length of the bat.
    //     ctx.translate(this.handleTop.x, this.handleTop.y);
    //     ctx.rotate(this.batAngle);

    //     const hl = this.HANDLE_LENGTH;
    //     const tl = this.TOTAL_BAT_LENGTH;
    //     const bl = tl - hl; // Blade length

    //     // Positive local Y points LEFT (back of the bat). Negative local Y points RIGHT (front hitting face).
    //     const hr = this.HANDLE_WIDTH / 2; 
    //     const frontY = -hr; // Perfectly flat front face matching the handle
    //     const toeBackY = hr * 0.5; // Toe tapers to be a bit thin at the very bottom
    //     const maxSpineY = this.BLADE_WIDTH * 0.9; // Max thickness of the sweet spot
    //     const swellX = hl + bl * 0.65; // Position of the sweet spot along the length

    //     // 1. Draw Bat Body (Wood Blade)
    //     ctx.beginPath();
    //     ctx.moveTo(hl, frontY); // Start at handle junction (front)
    //     ctx.lineTo(tl - 3, frontY); // Flat front face all the way down
        
    //     // Rounded Toe
    //     ctx.quadraticCurveTo(tl, frontY, tl, 0); 
    //     ctx.lineTo(tl, toeBackY); 

    //     // Curved Spine (Back of the bat)
    //     ctx.bezierCurveTo(
    //         swellX, maxSpineY + 5,          // CP1: Pulls the curve out to form the sweet spot
    //         hl + bl * 0.2, maxSpineY * 0.4, // CP2: Tapers back in towards the handle
    //         hl, hr                          // End at handle junction (back)
    //     );
    //     ctx.closePath();

    //     // Fill wood color
    //     ctx.fillStyle = "#e6cba8"; // Light English Willow
    //     ctx.fill();
    //     ctx.strokeStyle = "#8a5a2b"; // Darker wood outline
    //     ctx.lineWidth = 1.5;
    //     ctx.stroke();

    //     // 2. Draw Handle / Grip
    //     ctx.beginPath();
    //     ctx.moveTo(0, -hr);
    //     ctx.lineTo(hl, -hr);
    //     ctx.lineTo(hl, hr);
    //     ctx.lineTo(0, hr);
    //     ctx.closePath();
        
    //     ctx.fillStyle = "#d32f2f"; // MRF Red Grip
    //     ctx.fill();
    //     ctx.stroke();

    //     // 3. Draw Details (MRF Sticker)
    //     ctx.save();
    //     ctx.fillStyle = "#d32f2f"; // Red sticker
    //     ctx.font = "bold 16px Arial";
    //     ctx.textAlign = "center";
    //     ctx.restore();
    // }
    private shadeColor(color: string, percent: number): string {
        let R = parseInt(color.substring(1,3), 16);
        let G = parseInt(color.substring(3,5), 16);
        let B = parseInt(color.substring(5,7), 16);

        R = Math.floor(R * (100 + percent) / 100);
        G = Math.floor(G * (100 + percent) / 100);
        B = Math.floor(B * (100 + percent) / 100);

        R = (R < 255) ? R : 255;  
        G = (G < 255) ? G : 255;  
        B = (B < 255) ? B : 255;
        
        R = (R > 0) ? R : 0;
        G = (G > 0) ? G : 0;
        B = (B > 0) ? B : 0;

        let RR = ((R.toString(16).length == 1) ? "0" + R.toString(16) : R.toString(16));
        let GG = ((G.toString(16).length == 1) ? "0" + G.toString(16) : G.toString(16));
        let BB = ((B.toString(16).length == 1) ? "0" + B.toString(16) : B.toString(16));

        return "#" + RR + GG + BB;
    }

    private drawBat(ctx: CanvasRenderingContext2D): void {
        ctx.save();
        ctx.translate(this.handleTop.x, this.handleTop.y);
        ctx.rotate(this.batAngle);

        const hl = this.HANDLE_LENGTH; // 56
        const tl = this.TOTAL_BAT_LENGTH; // 168
        const bl = tl - hl; // 112

        const hr = this.HANDLE_WIDTH / 2;
        const frontY = -hr;
        const toeBackY = hr * 0.5;

        // Sweet spot position and spine geometry matching exact original shape
        const swellX = hl + bl * 0.75;
        const maxSpineY = 14;

        // 1. DRAW WOODEN BLADE (Solid English Willow Wood without gradients)
        ctx.beginPath();
        ctx.moveTo(hl, frontY); // Start at handle junction (front edge)
        ctx.lineTo(tl - 3, frontY); // Flat front hitting face
        ctx.quadraticCurveTo(tl, frontY, tl, 0); // Rounded toe front
        ctx.lineTo(tl, toeBackY); // Toe bottom

        // Curved Spine (Back profile matching exact sweet spot bezier curve)
        ctx.bezierCurveTo(
            swellX, maxSpineY + 5,          // CP1: Swell peak
            hl + bl * 0.2, maxSpineY * 0.4, // CP2: Taper back to handle
            hl, hr                          // End at handle junction
        );
        ctx.closePath();

        ctx.fillStyle = "#e6cba8"; // Solid light English Willow wood
        ctx.fill();
        ctx.strokeStyle = "#8a5a2b"; // Clean dark wood outline
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 2. DRAW HANDLE GRIP (Greyish-white rubber grip without gradients)
        ctx.beginPath();
        ctx.moveTo(0, -hr);
        ctx.lineTo(hl, -hr);
        ctx.lineTo(hl, hr);
        ctx.lineTo(0, hr);
        ctx.closePath();

        ctx.fillStyle = "#e8e8e8"; // Greyish-white grip
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    public drawBackArm(ctx: CanvasRenderingContext2D): void {
        this.drawRealisticArmWithSleeve(ctx, this.BACK_SHOULDER, this.backElbow, this.backWrist, "back");
    }

    public drawFrontArm(ctx: CanvasRenderingContext2D): void {
        this.drawRealisticArmWithSleeve(ctx, this.FRONT_SHOULDER, this.frontElbow, this.frontWrist, "front");
    }

    private drawRealisticArmWithSleeve(
        ctx: CanvasRenderingContext2D,
        shoulder: Vec2,
        elbow: Vec2,
        wrist: Vec2,
        armSide: "front" | "back"
    ): void {
        // Upper Arm Vector (Shoulder -> Elbow)
        const uDx = elbow.x - shoulder.x;
        const uDy = elbow.y - shoulder.y;
        const uLen = Math.hypot(uDx, uDy) || 1;
        const uUx = uDx / uLen;
        const uUy = uDy / uLen;
        const uNx = -uUy;
        const uNy = uUx;

        // Muscular arm dimensions
        const shoulderRadius = 8.0;
        const bicepBulgeRadius = 10.0;
        const sleeveCuffRadius = 9.0;
        const elbowRadius = 7.5;

        // Sleeve ends at ~55% down the upper arm
        const sleeveFrac = 0.55;
        const sleeveCutX = shoulder.x + uUx * (uLen * sleeveFrac);
        const sleeveCutY = shoulder.y + uUy * (uLen * sleeveFrac);

        const midUpperX = shoulder.x + uUx * (uLen * 0.28);
        const midUpperY = shoulder.y + uUy * (uLen * 0.28);

        ctx.save();

        // --- 1. SHORT SLEEVE (Jersey Shirt Color) ---
        ctx.beginPath();
        ctx.moveTo(shoulder.x + uNx * shoulderRadius, shoulder.y + uNy * shoulderRadius);
        ctx.lineTo(midUpperX + uNx * bicepBulgeRadius, midUpperY + uNy * bicepBulgeRadius);
        ctx.lineTo(sleeveCutX + uNx * sleeveCuffRadius, sleeveCutY + uNy * sleeveCuffRadius);
        ctx.lineTo(sleeveCutX - uNx * sleeveCuffRadius, sleeveCutY - uNy * sleeveCuffRadius);
        ctx.lineTo(midUpperX - uNx * bicepBulgeRadius, midUpperY - uNy * bicepBulgeRadius);
        ctx.lineTo(shoulder.x - uNx * shoulderRadius, shoulder.y - uNy * shoulderRadius);
        ctx.closePath();

        // Fill Shirt Sleeve (India Blue)
        const sleeveGrad = ctx.createLinearGradient(shoulder.x, shoulder.y, sleeveCutX, sleeveCutY);
        sleeveGrad.addColorStop(0, "#1d4ed8");
        sleeveGrad.addColorStop(0.6, "#2563eb");
        sleeveGrad.addColorStop(1, "#3b82f6");
        ctx.fillStyle = sleeveGrad;
        ctx.fill();

        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Sleeve Cuff Seam Ring
        ctx.beginPath();
        ctx.moveTo(sleeveCutX + uNx * sleeveCuffRadius, sleeveCutY + uNy * sleeveCuffRadius);
        ctx.lineTo(sleeveCutX - uNx * sleeveCuffRadius, sleeveCutY - uNy * sleeveCuffRadius);
        ctx.strokeStyle = "#1e3a8a";
        ctx.lineWidth = 2.2;
        ctx.stroke();

        // --- 2. EXPOSED BICEP & FOREARM (Muscular Skin Tone) ---
        const midLowerBicepX = shoulder.x + uUx * (uLen * 0.78);
        const midLowerBicepY = shoulder.y + uUy * (uLen * 0.78);

        // Lower Bicep Skin segment (from sleeve cut to elbow)
        ctx.beginPath();
        ctx.moveTo(sleeveCutX + uNx * (sleeveCuffRadius * 0.95), sleeveCutY + uNy * (sleeveCuffRadius * 0.95));
        ctx.lineTo(midLowerBicepX + uNx * (bicepBulgeRadius * 0.9), midLowerBicepY + uNy * (bicepBulgeRadius * 0.9));
        ctx.lineTo(elbow.x + uNx * elbowRadius, elbow.y + uNy * elbowRadius);
        ctx.lineTo(elbow.x - uNx * elbowRadius, elbow.y - uNy * elbowRadius);
        ctx.lineTo(midLowerBicepX - uNx * (bicepBulgeRadius * 0.9), midLowerBicepY - uNy * (bicepBulgeRadius * 0.9));
        ctx.lineTo(sleeveCutX - uNx * (sleeveCuffRadius * 0.95), sleeveCutY - uNy * (sleeveCuffRadius * 0.95));
        ctx.closePath();

        // Skin Tone Gradient
        const skinGrad = ctx.createLinearGradient(shoulder.x, shoulder.y, wrist.x, wrist.y);
        skinGrad.addColorStop(0, "#e0ac69");
        skinGrad.addColorStop(0.5, "#d19c67");
        skinGrad.addColorStop(1, "#c68b59");
        ctx.fillStyle = skinGrad;
        ctx.fill();

        // Smooth Rounded Elbow Joint Cap
        ctx.beginPath();
        ctx.arc(elbow.x, elbow.y, elbowRadius, 0, 2 * Math.PI);
        ctx.fillStyle = skinGrad;
        ctx.fill();
        ctx.strokeStyle = "#78350f";
        ctx.lineWidth = 1.0;
        ctx.stroke();

        // Lower Arm / Forearm (Elbow -> Wrist) - FIXED TYPO & MUSCULAR BULGE
        const lDx = wrist.x - elbow.x;
        const lDy = wrist.y - elbow.y;
        const lLen = Math.hypot(lDx, lDy) || 1;
        const lUx = lDx / lLen;
        const lUy = lDy / lLen;
        const lNx = -lUy;
        const lNy = lUx;

        const forearmBulgeRadius = 9.0; // Muscular forearm bulge
        const wristRadius = 6.0;

        const midLowerX = elbow.x + lUx * (lLen * 0.42);
        const midLowerY = elbow.y + lUy * (lLen * 0.42);

        ctx.beginPath();
        ctx.moveTo(elbow.x + lNx * elbowRadius, elbow.y + lNy * elbowRadius);
        ctx.lineTo(midLowerX + lNx * forearmBulgeRadius, midLowerY + lNy * forearmBulgeRadius);
        ctx.lineTo(wrist.x + lNx * wristRadius, wrist.y + lNy * wristRadius);
        ctx.lineTo(wrist.x - lNx * wristRadius, wrist.y - lNy * wristRadius);
        ctx.lineTo(midLowerX - lNx * forearmBulgeRadius, midLowerY - lNy * forearmBulgeRadius);
        ctx.lineTo(elbow.x - lNx * elbowRadius, elbow.y - lNy * elbowRadius);
        ctx.closePath();

        ctx.fillStyle = skinGrad;
        ctx.fill();

        ctx.strokeStyle = "#78350f";
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // --- 3. BATTING GLOVE AT WRIST ---
        this.drawBattingGlove(ctx, wrist, lUx, lUy, lNx, lNy);

        ctx.restore();
    }

    private drawBattingGlove(
        ctx: CanvasRenderingContext2D,
        wrist: Vec2,
        dirX: number,
        dirY: number,
        normX: number,
        normY: number
    ): void {
        const gloveLen = 18;
        const gloveWidth = 12;

        const gloveTipX = wrist.x + dirX * gloveLen;
        const gloveTipY = wrist.y + dirY * gloveLen;

        ctx.save();

        // 1. Elastic Wrist Band Cuff with White & Blue stripes
        ctx.beginPath();
        ctx.moveTo(wrist.x + normX * (gloveWidth * 0.9), wrist.y + normY * (gloveWidth * 0.9));
        ctx.lineTo(wrist.x - normX * (gloveWidth * 0.9), wrist.y - normY * (gloveWidth * 0.9));
        ctx.strokeStyle = "#1d4ed8"; // Blue wrist band
        ctx.lineWidth = 4.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(wrist.x + normX * (gloveWidth * 0.85), wrist.y + normY * (gloveWidth * 0.85));
        ctx.lineTo(wrist.x - normX * (gloveWidth * 0.85), wrist.y - normY * (gloveWidth * 0.85));
        ctx.strokeStyle = "#ffffff"; // White stripe
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 2. Main Padded Glove Palm & Back Body
        const gloveMidX = wrist.x + dirX * (gloveLen * 0.5);
        const gloveMidY = wrist.y + dirY * (gloveLen * 0.5);

        ctx.beginPath();
        ctx.moveTo(wrist.x + normX * gloveWidth, wrist.y + normY * gloveWidth);
        ctx.lineTo(gloveMidX + normX * (gloveWidth * 1.1), gloveMidY + normY * (gloveWidth * 1.1));
        ctx.lineTo(gloveTipX + normX * (gloveWidth * 0.75), gloveTipY + normY * (gloveWidth * 0.75));
        ctx.lineTo(gloveTipX - normX * (gloveWidth * 0.75), gloveTipY - normY * (gloveWidth * 0.75));
        ctx.lineTo(gloveMidX - normX * (gloveWidth * 1.1), gloveMidY - normY * (gloveWidth * 1.1));
        ctx.lineTo(wrist.x - normX * gloveWidth, wrist.y - normY * gloveWidth);
        ctx.closePath();

        const gloveGrad = ctx.createLinearGradient(wrist.x, wrist.y, gloveTipX, gloveTipY);
        gloveGrad.addColorStop(0, "#ffffff");
        gloveGrad.addColorStop(0.5, "#f8fafc");
        gloveGrad.addColorStop(1, "#cbd5e1");
        ctx.fillStyle = gloveGrad;
        ctx.fill();

        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // 3. Individual Padded Sausage Finger Rolls (Index, Middle, Ring, Pinky)
        const numFingers = 4;
        for (let i = 0; i < numFingers; i++) {
            const fOffset = ((i - 1.5) * (gloveWidth * 1.6)) / numFingers;
            const fingerStartX = gloveMidX + normX * fOffset;
            const fingerStartY = gloveMidY + normY * fOffset;
            const fingerEndX = gloveTipX + normX * (fOffset * 0.8);
            const fingerEndY = gloveTipY + normY * (fOffset * 0.8);

            ctx.beginPath();
            ctx.moveTo(fingerStartX, fingerStartY);
            ctx.lineTo(fingerEndX, fingerEndY);
            ctx.strokeStyle = "#2563eb"; // Blue flex break line between finger rolls
            ctx.lineWidth = 1.8;
            ctx.stroke();

            // Padded finger roll cap (rounded sausage padding)
            ctx.beginPath();
            ctx.arc(fingerEndX, fingerEndY, 3.2, 0, 2 * Math.PI);
            ctx.fillStyle = "#ffffff";
            ctx.fill();
            ctx.strokeStyle = "#475569";
            ctx.lineWidth = 1.0;
            ctx.stroke();
        }

        // 4. Thumb Guard Roll
        const thumbX = wrist.x + dirX * 6 + normX * (gloveWidth * 1.15);
        const thumbY = wrist.y + dirY * 6 + normY * (gloveWidth * 1.15);
        ctx.beginPath();
        ctx.ellipse(thumbX, thumbY, 5.0, 3.5, Math.atan2(dirY, dirX), 0, 2 * Math.PI);
        ctx.fillStyle = "#f1f5f9";
        ctx.fill();
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();
    }

    private drawSegment(ctx: CanvasRenderingContext2D, s: Vec2, e: Vec2, color: string): void {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(e.x, e.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 8;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
    }

    private drawRealisticLegWithPad(
        ctx: CanvasRenderingContext2D,
        hip: Vec2,
        knee: Vec2,
        ankle: Vec2,
        legSide: "left" | "right"
    ): void {
        // --- 1. VECTOR MATH FOR CONTOURS ---
        // Thigh vector (Hip -> Knee)
        const tDx = knee.x - hip.x;
        const tDy = knee.y - hip.y;
        const tLen = Math.hypot(tDx, tDy) || 1;
        const tUx = tDx / tLen; // Unit vector along thigh
        const tUy = tDy / tLen;
        const tNx = -tUy; // Normal perpendicular vector
        const tNy = tUx;

        // Shin vector (Knee -> Ankle)
        const sDx = ankle.x - knee.x;
        const sDy = ankle.y - knee.y;
        const sLen = Math.hypot(sDx, sDy) || 1;
        const sUx = sDx / sLen; // Unit vector along shin
        const sUy = sDy / sLen;
        const sNx = -sUy; // Normal perpendicular vector
        const sNy = sUx;

        // --- 2. TAPERED MUSCULAR THIGH DIMENSIONS (Thick upper hip, tapering to normal knee) ---
        const hipRadius = 18.0;       // Thick upper thigh base near hip
        const quadBulgeRadius = 16.0; // Muscular upper-mid thigh taper
        const kneeRadius = 10.0;      // Normal slim lower thigh near knee

        const midThighX = hip.x + tUx * (tLen * 0.5);
        const midThighY = hip.y + tUy * (tLen * 0.5);

        const calfBulgeRadius = 12.5; // Muscular calf bulge
        const ankleRadius = 7.5;

        const midShinX = knee.x + sUx * (sLen * 0.4);
        const midShinY = knee.y + sUy * (sLen * 0.4);

        ctx.save();

        // Shift hip fill base upward by 10px so blue trouser cloth extends higher above red hip joint dots
        const upOffset = 20;
        const hipUpX = hip.x - tUx * upOffset;
        const hipUpY = hip.y - tUy * upOffset;

        // --- 1. SMOOTH THIGH BASE (Blue Lower Trousers Body Extended Upward) ---
        const thighGrad = ctx.createLinearGradient(hipUpX, hipUpY, knee.x, knee.y);
        thighGrad.addColorStop(0, "#1d4ed8");
        thighGrad.addColorStop(0.5, "#2563eb");
        thighGrad.addColorStop(1, "#1e40af");

        ctx.beginPath();
        ctx.arc(hipUpX, hipUpY, hipRadius, 0, 2 * Math.PI);
        ctx.fillStyle = thighGrad;
        ctx.fill();

        // --- 2. DRAW FULL MUSCULAR THIGH POLYGON (EXTENDED ABOVE HIP DOT) ---
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
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // --- 3. DRAW SHIN / CALF (Lower Leg Trousers Base) ---
        ctx.beginPath();
        ctx.moveTo(knee.x + sNx * kneeRadius, knee.y + sNy * kneeRadius);
        ctx.lineTo(midShinX + sNx * calfBulgeRadius, midShinY + sNy * calfBulgeRadius);
        ctx.lineTo(ankle.x + sNx * ankleRadius, ankle.y + sNy * ankleRadius);
        ctx.lineTo(ankle.x - sNx * ankleRadius, ankle.y - sNy * ankleRadius);
        ctx.lineTo(midShinX - sNx * calfBulgeRadius, midShinY - sNy * calfBulgeRadius);
        ctx.lineTo(knee.x - sNx * kneeRadius, knee.y - sNy * kneeRadius);
        ctx.closePath();

        ctx.fillStyle = "#1e40af";
        ctx.fill();

        ctx.strokeStyle = "#091e42";
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // --- 4. GRAYISH-WHITE CRICKET BATTING PADS (Ends above ankle for shoe visibility) ---
        const padWidth = 16;
        const padTopExtension = 14; // Pad wing above knee
        const padKneeRollRadiusX = 11;
        const padKneeRollRadiusY = 8;

        const padTopX = knee.x - sUx * padTopExtension;
        const padTopY = knee.y - sUy * padTopExtension;
        const padBotX = ankle.x - sUx * 6; // Ends 6px above ankle so shoe is 100% visible
        const padBotY = ankle.y - sUy * 6;

        // Main Pad Shield Body
        ctx.beginPath();
        ctx.moveTo(padTopX + sNx * (padWidth * 0.7), padTopY + sNy * (padWidth * 0.7));
        ctx.lineTo(knee.x + sNx * padWidth, knee.y + sNy * padWidth);
        ctx.lineTo(padBotX + sNx * (padWidth * 0.85), padBotY + sNy * (padWidth * 0.85));
        ctx.lineTo(padBotX - sNx * (padWidth * 0.85), padBotY - sNy * (padWidth * 0.85));
        ctx.lineTo(knee.x - sNx * padWidth, knee.y - sNy * padWidth);
        ctx.lineTo(padTopX - sNx * (padWidth * 0.7), padTopY - sNy * (padWidth * 0.7));
        ctx.closePath();

        const padGrad = ctx.createLinearGradient(knee.x + sNx * padWidth, knee.y, knee.x - sNx * padWidth, knee.y);
        padGrad.addColorStop(0, "#f8fafc");
        padGrad.addColorStop(0.3, "#ffffff");
        padGrad.addColorStop(0.7, "#e2e8f0");
        padGrad.addColorStop(1, "#cbd5e1");
        ctx.fillStyle = padGrad;
        ctx.fill();

        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Vertical Ribbed Padding Lines
        for (let i = -1; i <= 1; i += 1) {
            const offset = (i * padWidth) / 3.2;
            const ribStartX = knee.x + sUx * 10 + sNx * offset;
            const ribStartY = knee.y + sUy * 10 + sNy * offset;
            const ribEndX = ankle.x - sUx * 3 + sNx * offset;
            const ribEndY = ankle.y - sUy * 3 + sNy * offset;

            ctx.beginPath();
            ctx.moveTo(ribStartX, ribStartY);
            ctx.lineTo(ribEndX, ribEndY);
            ctx.strokeStyle = "rgba(71, 85, 105, 0.45)";
            ctx.lineWidth = 2.0;
            ctx.stroke();
        }

        // Horizontal Flex Ridge Rolls below knee
        for (let r = 1; r <= 3; r++) {
            const rollDist = 8 + r * 5;
            const rx = knee.x + sUx * rollDist;
            const ry = knee.y + sUy * rollDist;

            ctx.beginPath();
            ctx.moveTo(rx + sNx * (padWidth * 0.85), ry + sNy * (padWidth * 0.85));
            ctx.lineTo(rx - sNx * (padWidth * 0.85), ry - sNy * (padWidth * 0.85));
            ctx.strokeStyle = "#94a3b8";
            ctx.lineWidth = 2.0;
            ctx.stroke();
        }

        // Knee Roll Oval Cap
        ctx.beginPath();
        const padAngle = Math.atan2(sDy, sDx);
        ctx.ellipse(knee.x, knee.y, padKneeRollRadiusX, padKneeRollRadiusY, padAngle, 0, 2 * Math.PI);
        const kneeGrad = ctx.createRadialGradient(knee.x, knee.y, 2, knee.x, knee.y, padKneeRollRadiusX);
        kneeGrad.addColorStop(0, "#ffffff");
        kneeGrad.addColorStop(0.7, "#f1f5f9");
        kneeGrad.addColorStop(1, "#cbd5e1");
        ctx.fillStyle = kneeGrad;
        ctx.fill();
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // --- 4. WHITE CRICKET BATTING SHOES WITH SPIKES ---
        this.drawCricketShoe(ctx, ankle, sUx, sUy, sNx, sNy);

        ctx.restore();
    }

    private drawCricketShoe(
        ctx: CanvasRenderingContext2D,
        ankle: Vec2,
        sUx: number,
        sUy: number,
        sNx: number,
        sNy: number
    ): void {
        const shoeLen = 22;
        const shoeHeight = 10;
        
        const toeX = ankle.x + shoeLen;
        const toeY = ankle.y;
        const heelX = ankle.x - 6;
        const heelY = ankle.y;

        ctx.save();

        // 1. White Cricket Shoe Upper Body
        ctx.beginPath();
        ctx.moveTo(heelX, heelY - shoeHeight * 0.6);
        ctx.lineTo(ankle.x, ankle.y - shoeHeight);
        ctx.lineTo(toeX - 5, ankle.y - shoeHeight * 0.7);
        ctx.lineTo(toeX, ankle.y - 2);
        ctx.lineTo(toeX, ankle.y);
        ctx.lineTo(heelX, ankle.y);
        ctx.closePath();

        const shoeGrad = ctx.createLinearGradient(heelX, ankle.y - shoeHeight, toeX, ankle.y);
        shoeGrad.addColorStop(0, "#ffffff");
        shoeGrad.addColorStop(0.7, "#f8fafc");
        shoeGrad.addColorStop(1, "#e2e8f0");
        ctx.fillStyle = shoeGrad;
        ctx.fill();

        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // 2. Metallic Blue & Gold Puma Side Stripe Accent
        ctx.beginPath();
        ctx.moveTo(ankle.x - 2, ankle.y - shoeHeight * 0.6);
        ctx.lineTo(ankle.x + 8, ankle.y - shoeHeight * 0.4);
        ctx.lineTo(ankle.x + 14, ankle.y - 3);
        ctx.strokeStyle = "#2563eb";
        ctx.lineWidth = 2.2;
        ctx.stroke();

        // 3. Dark Outsole & Silver Spike Studs
        ctx.beginPath();
        ctx.rect(heelX, ankle.y - 1, shoeLen + 6, 2.5);
        ctx.fillStyle = "#1e293b";
        ctx.fill();

        // Spikes under sole
        for (let sp = 0; sp < 4; sp++) {
            const spX = heelX + 4 + sp * 6;
            ctx.beginPath();
            ctx.arc(spX, ankle.y + 2, 1.2, 0, Math.PI, false);
            ctx.fillStyle = "#94a3b8";
            ctx.fill();
        }

        ctx.restore();
    }

    private drawDebug(ctx: CanvasRenderingContext2D): void {
        // Vector B->C (Handle to Shoulder)
        const bc_dx = this.SHOULDER_MID.x - this.handleActual.x;
        const bc_dy = this.SHOULDER_MID.y - this.handleActual.y;
        const angleBC = Math.atan2(bc_dy, bc_dx);
        
        // Vector B->A (Handle to Tip) is batAngleActual
        let dRadians = this.batAngleActual - angleBC;
        
        while (dRadians > Math.PI) dRadians -= 2 * Math.PI;
        while (dRadians < -Math.PI) dRadians += 2 * Math.PI;
        
        const handleAngleDeg = Math.round(Math.abs(dRadians * (180 / Math.PI)));

        ctx.save();
        /* DEBUG PRINT - DISABLED FOR NOW
        ctx.font = "24px Arial";
        ctx.fillStyle = "yellow";
        ctx.textAlign = "right";
        ctx.fillText(`Handle Angle 'd': ${handleAngleDeg}°`, CANVAS_WIDTH - 20, 40);
        ctx.restore();

        // Arm Angle Debug Print
        const armDx = this.handleActual.x - this.SHOULDER_MID.x;
        const armDy = this.handleActual.y - this.SHOULDER_MID.y;
        let armAngleDeg = Math.atan2(armDy, armDx) * (180 / Math.PI);

        ctx.save();
        ctx.font = "24px Arial";
        ctx.fillStyle = "black";
        ctx.textAlign = "right";
        ctx.fillText(`Arm Angle: ${Math.round(armAngleDeg)}°`, CANVAS_WIDTH - 20, 70); 
        ctx.restore();
        */

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
        const shoulderMid = this.SHOULDER_MID;
        ctx.beginPath();
        ctx.arc(shoulderMid.x, shoulderMid.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = "lime";
        ctx.fill();

    }

    private drawTorsoCylinder(ctx: CanvasRenderingContext2D): void {
        const hip = this.CURRENT_HIP_POSITION;

        ctx.save();
        // 🔵 HIP ELLIPSE OUTLINE AT WAIST / HIP LEVEL
        ctx.beginPath();
        ctx.ellipse(hip.x, hip.y, this.hipRx + 4, this.hipRy, 0, 0, 2 * Math.PI);
        ctx.strokeStyle = "#38bdf8"; // Bright cyan hip ellipse outline
        ctx.lineWidth = 2.0;
        ctx.stroke();

        ctx.restore();
    }

    private drawLegs(ctx: CanvasRenderingContext2D): void {
        const leftHip = this.CURRENT_LEFT_HIP_POSITION;
        const rightHip = this.CURRENT_RIGHT_HIP_POSITION;
        const leftAnkle = this.CURRENT_LEFT_LEG_POSTION_AT_GROUND;
        const rightAnkle = this.CURRENT_RIGHT_LEG_POSTION_AT_GROUND;

        // Draw left leg (thigh + shin)
        this.drawRealisticLegWithPad(ctx, leftHip, this.leftKnee, leftAnkle, "left");

        // Draw right leg (thigh + shin)
        this.drawRealisticLegWithPad(ctx, rightHip, this.rightKnee, rightAnkle, "right");

        ctx.save();
        // 🔴 RED DEBUG SKELETON BONE LINES & JOINTS FOR LEGS
        ctx.strokeStyle = "#ef4444"; // Vivid red skeleton line
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";

        // Left Leg Bones (Hip -> Knee -> Ankle)
        ctx.beginPath();
        ctx.moveTo(leftHip.x, leftHip.y);
        ctx.lineTo(this.leftKnee.x, this.leftKnee.y);
        ctx.lineTo(leftAnkle.x, leftAnkle.y);
        ctx.stroke();

        // Right Leg Bones (Hip -> Knee -> Ankle)
        ctx.beginPath();
        ctx.moveTo(rightHip.x, rightHip.y);
        ctx.lineTo(this.rightKnee.x, this.rightKnee.y);
        ctx.lineTo(rightAnkle.x, rightAnkle.y);
        ctx.stroke();

        // Red Joint Dots (Hips, Knees, Ankles)
        const joints = [leftHip, rightHip, this.leftKnee, this.rightKnee, leftAnkle, rightAnkle];
        ctx.fillStyle = "#ff0000";
        for (const j of joints) {
            ctx.beginPath();
            ctx.arc(j.x, j.y, 3.5, 0, 2 * Math.PI);
            ctx.fill();
        }

        // 🟢 LEFT SIDE GREEN DOTS & CONNECTING GUIDELINE
        // 1. Upper Left Green Dot: Left major axis tangent of shoulder ellipse
        const upperLeftGreenDot = {
            x: this.SHOULDER_MID.x - this.shoulderRx,
            y: this.SHOULDER_MID.y
        };

        // 2. Lower Left Green Dot: Extended along left leg thigh bone and offset by half thigh width
        const leftThighDx = this.leftKnee.x - leftHip.x;
        const leftThighDy = this.leftKnee.y - leftHip.y;
        const leftThighLen = Math.hypot(leftThighDx, leftThighDy) || 1;
        const leftThighUx = leftThighDx / leftThighLen;
        const leftThighUy = leftThighDy / leftThighLen;
        // Perpendicular vector pointing outward to back of left thigh
        const leftPerpUx = -leftThighUy;
        const leftPerpUy = leftThighUx;

        const leftExtLen = 12; // Extend left leg skeleton line upper past hip
        const leftHalfThighThick = (this.LEG_WIDTH_AT_HIP || 38) / 8;

        const lowerLeftGreenDot = {
            x: leftHip.x - leftThighUx * leftExtLen + leftPerpUx * leftHalfThighThick,
            y: leftHip.y - leftThighUy * leftExtLen + leftPerpUy * leftHalfThighThick
        };

        // 3. Dark connecting line joining left green dots
        ctx.beginPath();
        ctx.moveTo(upperLeftGreenDot.x, upperLeftGreenDot.y);
        ctx.lineTo(lowerLeftGreenDot.x, lowerLeftGreenDot.y);
        ctx.strokeStyle = "#4b5563"; // Dark grey line
        ctx.lineWidth = 5.0;
        ctx.lineCap = "round";
        ctx.stroke();

        // 🔴 RIGHT SIDE GREEN DOTS & CONNECTING GUIDELINE (Dynamic displacement based on bat handle)
        // 1. Upper Right Green Dot: Right shoulder joint, but if it goes below the right shoulder ellipse level, stick to the right tangent point of shoulder ellipse
        const rightTangentX = this.SHOULDER_MID.x + this.shoulderRx;
        const rightTangentY = this.SHOULDER_MID.y;

        const upperRightGreenDot = {
            x: (this.BACK_SHOULDER.y > rightTangentY) ? rightTangentX : this.BACK_SHOULDER.x,
            y: (this.BACK_SHOULDER.y > rightTangentY) ? rightTangentY : this.BACK_SHOULDER.y
        };

        // 2. Lower Right Green Dot: Extended along right leg thigh bone and offset outward,
        // dynamically shrinking with bat handle X-displacement from hip midpoint
        const rightThighDx = this.rightKnee.x - rightHip.x;
        const rightThighDy = this.rightKnee.y - rightHip.y;
        const rightThighLen = Math.hypot(rightThighDx, rightThighDy) || 1;
        const rightThighUx = rightThighDx / rightThighLen;
        const rightThighUy = rightThighDy / rightThighLen;
        // Perpendicular vector pointing outward (front side) for right thigh
        const rightPerpUx = rightThighUy;
        const rightPerpUy = -rightThighUx;

        // Calculate absolute X-displacement between Bat Handle and Hip Midpoint
        const hipMidX = (leftHip.x + rightHip.x) / 2;
        const handleDisplacementX = Math.abs(this.handleActual.x - hipMidX);

        // Maximum normal offset (perpendicular distance from right thigh bone line)
        const normalRightOffset = (this.LEG_WIDTH_AT_HIP || 38) / 3.8;
        const MIN_RIGHT_OFFSET = -10; // Allows shrinking towards left lower green dot safely
        const DISPLACEMENT_SHRINK_FACTOR = 0.25; // Rate at which perpendicular offset shrinks per pixel of handle displacement

        // Any displacement (left or right) reduces dynamic offset so right green dot moves closer to left green dot
        const dynamicRightOffset = Math.max(MIN_RIGHT_OFFSET, normalRightOffset - handleDisplacementX * DISPLACEMENT_SHRINK_FACTOR);

        const rightExtLen = 10; // Independent extension length for right leg

        const lowerRightGreenDot = {
            x: rightHip.x - rightThighUx * rightExtLen + rightPerpUx * dynamicRightOffset,
            y: rightHip.y - rightThighUy * rightExtLen + rightPerpUy * dynamicRightOffset
        };

        // 3. Dark connecting line joining right green dots
        ctx.beginPath();
        ctx.moveTo(upperRightGreenDot.x, upperRightGreenDot.y);
        ctx.lineTo(lowerRightGreenDot.x, lowerRightGreenDot.y);
        ctx.strokeStyle = "#4b5563"; // Dark grey line
        ctx.lineWidth = 5.0;
        ctx.lineCap = "round";
        ctx.stroke();

        // 4. Draw all 4 Green Dots (2 Left, 2 Right)
        ctx.fillStyle = "#22c55e"; // Bright green dot
        const allGreenDots = [upperLeftGreenDot, lowerLeftGreenDot, upperRightGreenDot, lowerRightGreenDot];
        for (const dot of allGreenDots) {
            ctx.beginPath();
            ctx.arc(dot.x, dot.y, 5, 0, 2 * Math.PI);
            ctx.fill();
        }

        // 🟡 SHOULDER ROTATION LIMIT DEBUG DOTS (Yellow = Left limit, Magenta = Right limit)
        const MIN_BACK_SHOULDER_ANGLE = -Math.PI * 0.25;
        const MAX_BACK_SHOULDER_ANGLE = Math.PI * 0.35;

        const backMinDot = {
            x: this.SHOULDER_MID.x + this.shoulderRx * Math.cos(MIN_BACK_SHOULDER_ANGLE),
            y: this.SHOULDER_MID.y + this.shoulderRy * Math.sin(MIN_BACK_SHOULDER_ANGLE)
        };
        const backMaxDot = {
            x: this.SHOULDER_MID.x + this.shoulderRx * Math.cos(MAX_BACK_SHOULDER_ANGLE),
            y: this.SHOULDER_MID.y + this.shoulderRy * Math.sin(MAX_BACK_SHOULDER_ANGLE)
        };

        // Draw Right Shoulder Angle Limit Debug Dots (Magenta)
        ctx.fillStyle = "#ec4899";
        for (const dot of [backMinDot, backMaxDot]) {
            ctx.beginPath();
            ctx.arc(dot.x, dot.y, 4, 0, 2 * Math.PI);
            ctx.fill();
        }

        ctx.restore();
    }

    private drawHead(ctx: CanvasRenderingContext2D): void {
        const shoulderMid = this.SHOULDER_MID;

        // 🟢 SHOULDER CAP ELLIPSE: Outline only (Level horizontal)
        ctx.beginPath();
        ctx.ellipse(shoulderMid.x, shoulderMid.y, this.shoulderRx, this.shoulderRy, 0, 0, 2 * Math.PI);
        ctx.strokeStyle = "#38bdf8"; // Bright cyan outline
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner shoulder ellipse (Yellow collar ring - Level horizontal)
        ctx.beginPath();
        ctx.ellipse(shoulderMid.x, shoulderMid.y, this.shoulderRx, this.shoulderRy / 2, 0, 0, 2 * Math.PI);
        ctx.strokeStyle = "#facc15"; // Bright yellow inner ellipse
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // --- HEAD & NECK DRAWING ---
        const headCenterX = this.HEAD_CENTER.x;
        const headCenterY = this.HEAD_CENTER.y;

        // 🟢 PAPER-DOLL HEAD: real head.png (image load hone tak fallback ellipse neeche)
        if (this.headImageLoaded) {
            const HEAD_DRAW_H = 60;      // head image ki screen height (px)
            const ANCHOR_X_FRAC = 0.42;  // image me neck-bottom-center ka X fraction
            const ANCHOR_Y_FRAC = 0.8;  // image me neck-bottom-center ka Y fraction
            const LEAN_FOLLOW = 0.5;     // spine lean kitna follow kare (0-1)

            const imgW = this.headImage.naturalWidth || 1344;
            const imgH = this.headImage.naturalHeight || 896;
            const drawH = HEAD_DRAW_H;
            const drawW = drawH * (imgW / imgH);

            const pivotX = (shoulderMid.x + headCenterX) / 2;
            const pivotY = (shoulderMid.y + headCenterY) / 2 - 10; // Shifted head slightly upward

            const lean = (this.CURRENT_ANGLE_OF_SPINE - Math.PI / 2) * LEAN_FOLLOW;

            ctx.save();
            ctx.translate(pivotX, pivotY);
            ctx.rotate(lean);
            ctx.drawImage(
                this.headImage,
                -drawW * ANCHOR_X_FRAC,
                -drawH * ANCHOR_Y_FRAC,
                drawW,
                drawH
            );
            ctx.restore();
        } else {
            ctx.beginPath();
            ctx.arc(headCenterX, headCenterY, 3.5, 0, 2 * Math.PI);
            ctx.fillStyle = "yellow";
            ctx.fill();

            const headRadiusX = .6*PLAYER_LENGTH_FACTOR;
            const headRadiusY = .9*PLAYER_LENGTH_FACTOR;
            ctx.beginPath();
            ctx.ellipse(headCenterX, headCenterY, headRadiusX, headRadiusY, 0, 0, 2 * Math.PI);
            ctx.strokeStyle = "cyan";
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }

        // Debug draw outer arc
        ctx.beginPath();
        for (let a = -30; a <= 180; a += 5) {
            let maxRadius = this.getInterpolatedRadius(outerArcJson, a, 200) * OUTER_ARC_SCALE;
            let px = shoulderMid.x + Math.cos(a * Math.PI / 180) * maxRadius;
            let py = shoulderMid.y + Math.sin(a * Math.PI / 180) * maxRadius;
            if (a === -30) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Debug draw inner arc
        ctx.beginPath();
        for (let a = -30; a <= 180; a += 5) {
            let minRadius = this.getInterpolatedRadius(innerArcJson, a, 400) * INNER_ARC_SCALE;
            let px = shoulderMid.x + Math.cos(a * Math.PI / 180) * minRadius;
            let py = shoulderMid.y + Math.sin(a * Math.PI / 180) * minRadius;
            if (a === -30) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = "rgba(255, 100, 100, 0.3)";
        ctx.stroke();
    }
}
