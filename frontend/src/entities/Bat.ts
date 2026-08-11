import { BAT_CENTER_OF_MASS_RATIO } from "../game/constants";
import Input from "../game/Input";
import outerArcJson from "../config/outer_handle_arc.json";
import innerArcJson from "../config/inner_handle_arc.json";
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
    k_values
} from "../game/constants";

type Vec2 = { x: number; y: number };

export interface BatRegion {
    restitution: number;
    history: { x: number; y: number; time: number }[];
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
    
    private comTarget: Vec2 = { x: 300, y: 550 };   // where mouse wants it
    private comActual: Vec2 = { x: 700, y: 350 }; // where it PHYSICALLY is (start near shoulder)
    private comVelocity: Vec2 = { x: 0, y: 0 };

    private batAngleActual = 0;
    private prevBatAngle = 0;
    private prevHandleTop: Vec2 = { x: 700, y: 350 };
    private prevComTarget: Vec2 | null = null;
    private handleActual: Vec2 = { x: 700, y: 350 };
    private handleVelocity: Vec2 = { x: 0, y: 0 };
    private readonly HANDLE_STIFFNESS_Y = 30; // Increased so it hits speed limit!for now
    // --- BAT BREAKDOWN ---
    private readonly HANDLE_LENGTH = 56;  // 33% of the bat
    private readonly BLADE_LENGTH = 112; // 67% of the bat
    private readonly TOTAL_BAT_LENGTH = 168;
    private readonly TOTAL_RIGHT_ARM_LENGTH  =  this.TOTAL_BAT_LENGTH*0.7;
    private readonly TOTAL_LEFT_ARM_LENGTH = this.TOTAL_BAT_LENGTH*0.7;
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

    private readonly FULL_LEG_LENGTH = 160; // 43 % thigh;

    private readonly THIGH_LENGTH = this.FULL_LEG_LENGTH*.53;// 43 % thigh;
    private readonly SHIN_LENGTH = this.FULL_LEG_LENGTH-this.THIGH_LENGTH;


    private readonly NECT_TO_HIP_LENGTH = 97;

  


        
    private readonly MAX_HIP_POSITION : Vec2 = { x: 450, y: CANVAS_HEIGHT - GROUND_HEIGHT-this.FULL_LEG_LENGTH-20 };
    private readonly MIN_HIP_POSITION : Vec2 = { x: 350, y: CANVAS_HEIGHT - GROUND_HEIGHT-this.FULL_LEG_LENGTH+80 };

    private readonly ORIGINAL_HIP_POSITION : Vec2 = { x: 350, y: CANVAS_HEIGHT - GROUND_HEIGHT-this.FULL_LEG_LENGTH-20 };

    private CURRENT_HIP_POSITION : Vec2 = this.ORIGINAL_HIP_POSITION;

    private readonly LEG_WIDTH_AT_HIP = 30;

    private CURRENT_LEFT_HIP_POSITION : Vec2  = {x:this.CURRENT_HIP_POSITION.x-this.LEG_WIDTH_AT_HIP/2,y:this.CURRENT_HIP_POSITION.y};
    private CURRENT_RIGHT_HIP_POSITION : Vec2  = {x:this.CURRENT_HIP_POSITION.x+this.LEG_WIDTH_AT_HIP/2,y:this.CURRENT_HIP_POSITION.y};



    private readonly ORIGINAL_ANGLE_OF_SPINE = 95 * (Math.PI / 180);

    private readonly MAX_ANGLE_OF_SPINE = 110 * (Math.PI / 180);

    private readonly MIN_ANGLE_OF_SPINE = 95 * (Math.PI / 180);

    private CURRENT_ANGLE_OF_SPINE = this.ORIGINAL_ANGLE_OF_SPINE;

    private readonly MAX_LEG_WIDTH_AT_GROUND = 120;

    private readonly MIN_LEG_WIDTH_AT_GROUND = 80;

    private CURRENT_LEG_WIDTH_AT_GROUND = 80;

    private CURRENT_LEFT_LEG_POSTION_AT_GROUND : Vec2 = {x:this.ORIGINAL_HIP_POSITION.x-40,y:CANVAS_HEIGHT - GROUND_HEIGHT}

    private CURRENT_RIGHT_LEG_POSTION_AT_GROUND : Vec2 = {x:this.CURRENT_LEFT_LEG_POSTION_AT_GROUND.x + this.CURRENT_LEG_WIDTH_AT_GROUND,y:CANVAS_HEIGHT-GROUND_HEIGHT}

    private readonly SHOULDER_HEIGHT = CANVAS_HEIGHT - GROUND_HEIGHT - 168 * 1.2; // Y position of the shoulder joints
    private readonly SHOULDER_JOINT_OFFSET = 50;



    // Joint Positions
    private SHOULDER_MID: Vec2 = { 
        x: this.CURRENT_HIP_POSITION.x - Math.cos(this.CURRENT_ANGLE_OF_SPINE) * this.NECT_TO_HIP_LENGTH,
        y: this.CURRENT_HIP_POSITION.y - Math.sin(this.CURRENT_ANGLE_OF_SPINE) * this.NECT_TO_HIP_LENGTH 
    };  
    
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
    private lastHitStats: {
        regionIndex: number;
        batAngle: number;
        batSpeedX: number;
        batSpeedY: number;
        ballSpeedBeforeX: number;
        ballSpeedBeforeY: number;
        ballSpeedAfterX: number;
        ballSpeedAfterY: number;
        relativeImpactSpeed: number;
    } | null = null;

    // 1-Frame Dwell/Stick Collision State
    private isBallStuck: boolean = false;
    private stuckInfo: {
        ball: any;
        tRatio: number;
        normalSign: number;
        originalBallVelX: number;
        originalBallVelY: number;
        regionIndex: number;
    } | null = null;

    private stanceOffsetY: number = 0;

    public regions: BatRegion[] = [];

    constructor() {
        for (let i = 0; i < 42; i++) {
            this.regions.push({
                restitution: ((BAT_REGIONS_RESTITUTION[i] || 30) * GLOBAL_RESTITUTION_SCALE) / 100,
                history: []
            });
        }
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

        // 3. Move the hips in that same direction (Both X & Y axis movements set to 0.4)
        this.CURRENT_HIP_POSITION.x += handleDeltaX * 0.4;
        this.CURRENT_HIP_POSITION.y += handleDeltaY * 0.2;

        // 4. Add subtle COM movement influence on Hips if COM is right of Hip or left by at most 10px
        if (!(this as any).prevComActualForHip) {
            (this as any).prevComActualForHip = { x: this.comActual.x, y: this.comActual.y };
        }
        const comDeltaX = this.comActual.x - (this as any).prevComActualForHip.x;
        const comDeltaY = this.comActual.y - (this as any).prevComActualForHip.y;

        const comHipDistX = this.comActual.x - this.CURRENT_HIP_POSITION.x;
        if (comHipDistX >= -10) {
            this.CURRENT_HIP_POSITION.x += comDeltaX * 0.075;
            this.CURRENT_HIP_POSITION.y += comDeltaY * 0.075;
        } else {
            // When COM is >10px to the left of hips:
            if (comDeltaY < 0) {
                // Moving UP: 3x of right part (0.075 * 3 = 0.225)
                this.CURRENT_HIP_POSITION.y += comDeltaY * 0.1125;
            } else if (comDeltaY > 0) {
                // Moving DOWN: Half of upward momentum (0.225 / 2 = 0.1125)
                this.CURRENT_HIP_POSITION.y += comDeltaY * 0.1125;
            }
        }

        // Save for the next frame
        (this as any).prevHandleActualForHip = { x: this.handleActual.x, y: this.handleActual.y };
        (this as any).prevComActualForHip = { x: this.comActual.x, y: this.comActual.y };

        // 5. Manual Stance Height Adjustment (W = UP, S = DOWN) - Speed halved to 75
        if (input) {
            const stanceSpeedY = 75; // Halved speed px/s
            if (input.isKeyPressed("w") || input.isKeyPressed("KeyW")) {
                this.CURRENT_HIP_POSITION.y -= stanceSpeedY * dt; // UP
                this.stanceOffsetY -= stanceSpeedY * dt;
            }
            if (input.isKeyPressed("s") || input.isKeyPressed("KeyS")) {
                this.CURRENT_HIP_POSITION.y += stanceSpeedY * dt; // DOWN
                this.stanceOffsetY += stanceSpeedY * dt;
            }
        }

        // 6. Clamp the final hip position to ensure it stays within physical limits
        this.CURRENT_HIP_POSITION.x = Math.max(this.MIN_HIP_POSITION.x, Math.min(this.MAX_HIP_POSITION.x, this.CURRENT_HIP_POSITION.x));
        const highestHipY = this.MAX_HIP_POSITION.y; // smaller value
        const lowestHipY = this.MIN_HIP_POSITION.y;  // larger value
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
        
        // --- 42 REGIONS QUEUE UPDATE ---
        const px = this.handleTop.x;
        const py = this.handleTop.y;
        for (let i = 0; i < 42; i++) {
            const L = (i + 1) * 4; // 4th pixel of the region
            const regionX = px + Math.cos(this.batAngle) * L;
            const regionY = py + Math.sin(this.batAngle) * L;
            
            const queue = this.regions[i].history;
            queue.push({ x: regionX, y: regionY, time: this.currentTime });
            if (queue.length > QUEUE_SIZE) {
                queue.shift(); // Remove oldest
            }
        }

        // --- UPDATE SHOULDERS ALONG THE DEBUG ELLIPSE BASED ON HAND CONTACT POINTS ---
        const shoulderRx = this.SHOULDER_JOINT_OFFSET / 2;
        const shoulderRy = shoulderRx * 0.3;

        // Front hand contact point (left hand) offset relative to Hip Y-axis line (0.7x of previous speed)
        const frontDx = this.frontWristTarget.x - this.CURRENT_HIP_POSITION.x;
        const frontDy = this.frontWristTarget.y - this.CURRENT_HIP_POSITION.y;
        const frontShiftAngle = (frontDx * 0.0147) + (frontDy * 0.0098); // 0.7x rate of change
        const frontAngle = Math.PI - frontShiftAngle;

        this.FRONT_SHOULDER.x = this.SHOULDER_MID.x + shoulderRx * Math.cos(frontAngle);
        this.FRONT_SHOULDER.y = this.SHOULDER_MID.y + shoulderRy * Math.sin(frontAngle);

        // Back hand contact point (right hand) offset relative to Hip Y-axis line (0.7x of previous speed)
        const backDx = this.backWristTarget.x - this.CURRENT_HIP_POSITION.x;
        const backDy = this.backWristTarget.y - this.CURRENT_HIP_POSITION.y;
        const backShiftAngle = (backDx * 0.0147) + (backDy * 0.0098); // 0.7x rate of change
        const backAngle = 0 - backShiftAngle;

        this.BACK_SHOULDER.x = this.SHOULDER_MID.x + shoulderRx * Math.cos(backAngle);
        this.BACK_SHOULDER.y = this.SHOULDER_MID.y + shoulderRy * Math.sin(backAngle);

        // --- UPDATE LEG / HIP JOINTS ALONG THE HIP DEBUG ELLIPSE (0.5x speed of shoulders, SAME direction) ---
        const hipRx = this.LEG_WIDTH_AT_HIP / 2;
        const hipRy = hipRx * 0.3;

        const leftHipAngle = Math.PI - (frontShiftAngle * 0.5);
        this.CURRENT_LEFT_HIP_POSITION.x = this.CURRENT_HIP_POSITION.x + hipRx * Math.cos(leftHipAngle);
        this.CURRENT_LEFT_HIP_POSITION.y = this.CURRENT_HIP_POSITION.y + hipRy * Math.sin(leftHipAngle);

        const rightHipAngle = 0 - (backShiftAngle * 0.5);
        this.CURRENT_RIGHT_HIP_POSITION.x = this.CURRENT_HIP_POSITION.x + hipRx * Math.cos(rightHipAngle);
        this.CURRENT_RIGHT_HIP_POSITION.y = this.CURRENT_HIP_POSITION.y + hipRy * Math.sin(rightHipAngle);

        // Dynamic Right Foot Ground Position (moves 2x of hip X displacement)
        const originalRightFootX = (this.ORIGINAL_HIP_POSITION.x - 40) + this.CURRENT_LEG_WIDTH_AT_GROUND;
        const hipShiftX = this.CURRENT_HIP_POSITION.x - this.ORIGINAL_HIP_POSITION.x;
        this.CURRENT_RIGHT_LEG_POSTION_AT_GROUND.x = originalRightFootX + (hipShiftX * 2.0);

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

        if (!this.prevComTarget) {
            this.prevComTarget = { x: this.comTarget.x, y: this.comTarget.y };
        }
        const targetVelocityX = (this.comTarget.x - this.prevComTarget.x) / dt;
        this.prevComTarget = { x: this.comTarget.x, y: this.comTarget.y };

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
            let armDx = this.handleActual.x - this.SHOULDER_MID.x;
            let armDy = this.handleActual.y - this.SHOULDER_MID.y;
            let armAngleDeg = Math.atan2(armDy, armDx) * (180 / Math.PI);
           // if (armAngleDeg < 0) armAngleDeg = 0; 

            let index = Math.floor((armAngleDeg+30) / 3);

            index = Math.max(0, Math.min(69, index));

            let k = k_values[index];


            let tiltSpeed = comUpSpeed * this.WRIST_TILT_SPEED_SCALE;
            // Straight up is -PI/2. Tilting right means angle increases towards 0.
            currentAngle += tiltSpeed * dtClamp*k; 
        } 
        
        // Horizontal tilt based on smooth Target (Mouse) X velocity (0.7x scaled)
        let horizontalTiltSpeed = targetVelocityX * HORIZONTAL_TILT_SPEED_SCALE * 0.7;
        
        // Clamp tilt speed so it doesn't spin wildly on very fast mouse flicks
        const maxTiltSpeed = 10.0;
        if (horizontalTiltSpeed > maxTiltSpeed) horizontalTiltSpeed = maxTiltSpeed;
        if (horizontalTiltSpeed < -maxTiltSpeed) horizontalTiltSpeed = -maxTiltSpeed;

        currentAngle += horizontalTiltSpeed * dtClamp;

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
        }
    }
    // Check karega ki ball Bat se takrai ya nahi
    public checkHit(ball: any, dt: number = 0.016): void {
        if (!ball.isActive) return;

        // --- FRAME 2: RELEASE & LAUNCH STUCK BALL ---
        if (this.isBallStuck && this.stuckInfo) {
            const info = this.stuckInfo;
            const regionIndex = info.regionIndex;
            const region = this.regions[regionIndex];
            const queue = region.history;

            let batHitSpeedX = 0;
            let batHitSpeedY = 0;

            if (queue.length > 1) {
                const oldest = queue[0];
                const latest = queue[queue.length - 1];
                const secondOldest = queue.length > 2 ? queue[1] : queue[0];

                const dx_q = latest.x - oldest.x;
                const dy_q = latest.y - oldest.y;
                const dist_q = Math.sqrt(dx_q * dx_q + dy_q * dy_q);
                const time_q = latest.time - oldest.time;
                
                if (time_q > 0.0001 && dist_q > 0.0001) {
                    const speed = dist_q / time_q;

                    // Latest direction calculated using latest - secondOldest
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
                const L = info.tRatio * this.TOTAL_BAT_LENGTH;
                batHitSpeedX = this.handleVelocity.x - (this.angularVelocity * L * Math.sin(this.batAngle));
                batHitSpeedY = this.handleVelocity.y + (this.angularVelocity * L * Math.cos(this.batAngle));
            }

            const relativeVx = info.originalBallVelX - batHitSpeedX;
            const relativeVy = info.originalBallVelY - batHitSpeedY;

            let normalX = -Math.sin(this.batAngle);
            let normalY = Math.cos(this.batAngle);

            if (info.normalSign < 0) {
                normalX = -normalX;
                normalY = -normalY;
            }

            const v_normal = relativeVx * normalX + relativeVy * normalY;

            const pushOutDist = ball.radius + (this.HANDLE_WIDTH / 2) + 0.1;
            const L = info.tRatio * this.TOTAL_BAT_LENGTH;
            ball.pos.x = this.handleTop.x + Math.cos(this.batAngle) * L + (normalX * pushOutDist);
            ball.pos.y = this.handleTop.y + Math.sin(this.batAngle) * L + (normalY * pushOutDist);

            const v_tangentX = relativeVx - v_normal * normalX;
            const v_tangentY = relativeVy - v_normal * normalY;

            const v_normal_after = -v_normal * region.restitution;

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
            };

            // Release ball!
            ball.isStuck = false;
            this.isBallStuck = false;
            this.stuckInfo = null;
            return;
        }

        let hit = false;
        let t = 0;
        let hitSubStep = 0;
        const subSteps = 30;
        
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

            if (queue.length > 1) {
                const oldest = queue[0];
                const latest = queue[queue.length - 1];
                const secondOldest = queue.length > 2 ? queue[1] : queue[0];

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

            // --- FRAME 1: IF RELATIVE IMPACT SPEED > 2000, STICK BALL TO BAT FOR 1 FRAME DWELL ---
            if (relativeImpactSpeed > 2000) {
                this.isBallStuck = true;
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

                this.lastHitStats = {
                    regionIndex,
                    batAngle: (this.batAngle * 180) / Math.PI,
                    batSpeedX: batHitSpeedX,
                    batSpeedY: batHitSpeedY,
                    ballSpeedBeforeX: originalBallVelX,
                    ballSpeedBeforeY: originalBallVelY,
                    ballSpeedAfterX: 0,
                    ballSpeedAfterY: 0,
                    relativeImpactSpeed,
                };
                return;
            }

            // Normal immediate bounce if batSpeed <= 1000
            const v_normal = relativeVx * normalX + relativeVy * normalY;
            if (v_normal > 0) return;

            // FIX: PROPER PUSH-OUT
            const pushOutDist = ball.radius + (this.HANDLE_WIDTH / 2) + 0.1;
            ball.pos.x = finalBx + (normalX * pushOutDist);
            ball.pos.y = finalBy + (normalY * pushOutDist);

            const v_tangentX = relativeVx - v_normal * normalX;
            const v_tangentY = relativeVy - v_normal * normalY;

            const v_normal_after = -v_normal * region.restitution;

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
                relativeImpactSpeed: relativeImpactSpeed
            };

            // Glitch se bachne ke liye ball ko bat se thoda bahar dhakel dena
            ball.pos.x += 10; 
            
            console.log(`HIT! Region: ${regionIndex}, Bounce: ${region.restitution}, Speed X: ${Math.floor(batHitSpeedX)}, Y: ${Math.floor(batHitSpeedY)}`);
        }
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

        const knee = this.sideOfLine(hip, clampedTarget, candidateA) === bendSide
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
        
        this.drawArms(ctx);
        this.drawDebug(ctx);
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

        const hl = this.HANDLE_LENGTH;
        const tl = this.TOTAL_BAT_LENGTH;
        const bl = tl - hl; // Blade length

        const hr = this.HANDLE_WIDTH / 2;
        const frontY = -hr;
        const toeBackY = hr * 0.5;

        // Sweet spot position
        const swellX = hl + bl * 0.75; // Moved down closer to toe to match photo
        const maxSpineY = 14; // Thicker sweet spot to match photo curve

        // Pre-calculate the back spine curve using a lookup table to perfectly match the original bezier shape
        const backYTable: number[] = new Array(Math.ceil(tl) + 2).fill(0);
        
        // Handle part
        for (let x = 0; x <= hl; x++) {
            backYTable[x] = hr;
        }

        // Spine Bezier part
        const P0x = tl, P0y = toeBackY;
        const P1x = swellX, P1y = maxSpineY + 5;
        const P2x = hl + bl * 0.2, P2y = maxSpineY * 0.4;
        const P3x = hl, P3y = hr;

        for (let t = 0; t <= 1; t += 0.002) { // 500 steps for smooth mapping
            const u = 1 - t;
            const tt = t * t;
            const uu = u * u;
            const uuu = uu * u;
            const ttt = tt * t;

            const bx = uuu * P0x + 3 * uu * t * P1x + 3 * u * tt * P2x + ttt * P3x;
            const by = uuu * P0y + 3 * uu * t * P1y + 3 * u * tt * P2y + ttt * P3y;
            
            const roundedX = Math.round(bx);
            if (roundedX >= hl && roundedX <= tl + 1) {
                if (!backYTable[roundedX] || by > backYTable[roundedX]) {
                    backYTable[roundedX] = by;
                }
            }
        }
        
        // Fill any gaps
        for (let x = hl + 1; x <= tl; x++) {
            if (!backYTable[x]) backYTable[x] = backYTable[x - 1] || hr;
        }

        const getBackY = (x: number) => {
            let idx = Math.floor(x);
            if (idx < 0) return hr;
            if (idx > tl) return toeBackY;
            return backYTable[idx];
        };

        const isInsideBat = (x: number, y: number) => {
            if (x < 0 || x > tl) return false;
            if (y < frontY) return false;
            
            let backY = getBackY(x);
            if (x > tl - 3) {
                let toeT = (x - (tl - 3)) / 3;
                return y <= backY * (1 - toeT);
            }
            return y <= backY;
        };

        // Light setup (Sun at -135 deg: top-left)
        const sunAngleGlobal = -135 * Math.PI / 180;
        const sunAngleLocal = sunAngleGlobal - this.batAngle;
        const lx = Math.cos(sunAngleLocal);
        const ly = Math.sin(sunAngleLocal);

        const startX = 0;
        const endX = Math.ceil(tl);
        const startY = Math.floor(frontY);
        const endY = Math.ceil(maxSpineY);

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                if (isInsideBat(x, y)) {
                    // Fully 1-pixel blocks now (no sx/sy 2x2 snapping)
                    
                    let color = "#fdf5e6"; // Very light creamy willow
                    let spineY = getBackY(x);

                    if (x < hl) {
                        color = "#ffffff"; // White handle
                        // Rounded rubber texture rings
                        if (x % 5 === 0 || x % 5 === 1) {
                            color = "#e8e8e8"; // Slight shadow for ring gaps
                        }
                        // Add black rubber grip base
                        if (x > hl - 5 && x <= hl) color = "#1a1a1a"; 
                    } else {
                        // Flat front face shadow
                        if (y >= frontY && y < frontY + 2) {
                            color = "#e3d5c1"; 
                        }

                        // MRF Sticker Geometry (Continuous Red Strip along spine)
                        if (x > hl + 15 && x < tl - 20) {
                            // Sticker covers the top/spine area
                            if (y > spineY - 7 && y <= spineY - 1) {
                                color = "#d32f2f"; // MRF Red
                                
                                // White gaps to simulate "MRF" letters
                                if (x > hl + 35 && x < hl + 38) color = "#ffffff";
                                if (x > hl + 55 && x < hl + 58) color = "#ffffff";
                                if (x > hl + 75 && x < hl + 78) color = "#ffffff";
                                
                                // Thin white border to the red sticker
                                if (y === Math.floor(spineY - 7) || y === Math.floor(spineY - 1)) {
                                    color = "#ffffff";
                                }
                            }
                        }
                        
                        // MRF Black Text Hint (near the flat front edge)
                        if (x > hl + 50 && x < hl + 75) {
                            if (y >= frontY && y < frontY + 3) {
                                color = "#111111"; // Black text
                                if ((x % 8) < 3) color = color === "#111111" ? "#fdf5e6" : color; // Gaps for letters
                            }
                        }

                        // Wood Grain Noise (Extremely Subtle)
                        if (color === "#fdf5e6" && (Math.floor(x/4) + Math.floor(y/2)) % 8 === 0) {
                            color = "#f2e6d5"; 
                        }
                    }

                    // Compute Shading Normal
                    let midY = (frontY + spineY) / 2;
                    let ny = (y - midY) / ((spineY - frontY) / 2); // Ranges roughly -1 to 1
                    let nx = (x > tl - 3) ? 1 : 0; // Toe faces right
                    
                    let mag = Math.hypot(nx, ny);
                    if (mag > 0) { nx /= mag; ny /= mag; }

                    // Dot product with sun light vector
                    let diffuse = (nx * lx + ny * ly);
                    
                    // Artificial highlight on the very top edge of the spine (like in photo)
                    if (ny > 0.8) {
                        diffuse += 0.4;
                    }
                    
                    // Apply dynamic shading
                    ctx.fillStyle = this.shadeColor(color, diffuse * 40);
                    
                    // Overlap pixels slightly (1.4x1.4) to seal sub-pixel gaps caused by canvas rotation anti-aliasing
                    ctx.fillRect(x - 0.2, y - 0.2, 1.4, 1.4);
                }
            }
        }
        
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
        ctx.font = "24px Arial";
        ctx.fillStyle = "yellow";
        ctx.textAlign = "right";
        ctx.fillText(`Handle Angle 'd': ${handleAngleDeg}°`, CANVAS_WIDTH - 20, 40);
        ctx.restore();

        // Arm Angle Debug Print
        const armDx = this.handleActual.x - this.SHOULDER_MID.x;
        const armDy = this.handleActual.y - this.SHOULDER_MID.y;
        let armAngleDeg = Math.atan2(armDy, armDx) * (180 / Math.PI);
       // if (armAngleDeg < 0) armAngleDeg = 0; 

        ctx.save();
        ctx.font = "24px Arial";
        ctx.fillStyle = "black";
        ctx.textAlign = "right";
        ctx.fillText(`Arm Angle: ${Math.round(armAngleDeg)}°`, CANVAS_WIDTH - 20, 70); 
        ctx.restore();

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

        // Debug draw shoulder ellipse
        const shoulderMaxRadius = this.SHOULDER_JOINT_OFFSET / 2;
        const shoulderMinRadius = shoulderMaxRadius * 0.3;
        ctx.beginPath();
        ctx.ellipse(shoulderMid.x, shoulderMid.y, shoulderMaxRadius, shoulderMinRadius, 0, 0, 2 * Math.PI);
        ctx.strokeStyle = "yellow";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw line between hips and shoulder mid (Spine)
        ctx.beginPath();
        ctx.moveTo(this.CURRENT_HIP_POSITION.x, this.CURRENT_HIP_POSITION.y);
        ctx.lineTo(this.SHOULDER_MID.x, this.SHOULDER_MID.y);
        ctx.strokeStyle = "orange";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw circle at hips
        ctx.beginPath();
        ctx.arc(this.CURRENT_HIP_POSITION.x, this.CURRENT_HIP_POSITION.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = "cyan";
        ctx.fill();

        // Debug draw hip ellipse
        const hipMaxRadius = this.LEG_WIDTH_AT_HIP / 2;
        const hipMinRadius = hipMaxRadius * 0.3;
        ctx.beginPath();
        ctx.ellipse(this.CURRENT_HIP_POSITION.x, this.CURRENT_HIP_POSITION.y, hipMaxRadius, hipMinRadius, 0, 0, 2 * Math.PI);
        ctx.strokeStyle = "magenta";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw left leg (thigh + shin)
        this.drawLimb(ctx, this.CURRENT_LEFT_HIP_POSITION, this.leftKnee, this.CURRENT_LEFT_LEG_POSTION_AT_GROUND, "red");
        
        // Draw right leg (thigh + shin)
        this.drawLimb(ctx, this.CURRENT_RIGHT_HIP_POSITION, this.rightKnee, this.CURRENT_RIGHT_LEG_POSTION_AT_GROUND, "blue");

        // Draw line from left hip to right hip
        ctx.beginPath();
        ctx.moveTo(this.CURRENT_LEFT_HIP_POSITION.x, this.CURRENT_LEFT_HIP_POSITION.y);
        ctx.lineTo(this.CURRENT_RIGHT_HIP_POSITION.x, this.CURRENT_RIGHT_HIP_POSITION.y);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw line from left hip to front shoulder
        ctx.beginPath();
        ctx.moveTo(this.CURRENT_LEFT_HIP_POSITION.x, this.CURRENT_LEFT_HIP_POSITION.y);
        ctx.lineTo(this.FRONT_SHOULDER.x, this.FRONT_SHOULDER.y);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw line from right hip to back shoulder
        ctx.beginPath();
        ctx.moveTo(this.CURRENT_RIGHT_HIP_POSITION.x, this.CURRENT_RIGHT_HIP_POSITION.y);
        ctx.lineTo(this.BACK_SHOULDER.x, this.BACK_SHOULDER.y);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();

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
        ctx.lineWidth = 1;
        ctx.stroke();

        // Debug text for Spine Angle
        ctx.fillStyle = "black";
        ctx.font = "bold 18px monospace";
        ctx.textAlign = "center";
        const currentSpineDeg = this.CURRENT_ANGLE_OF_SPINE * (180 / Math.PI);
        ctx.fillText(`SPINE ANGLE: ${currentSpineDeg.toFixed(1)}°`, ctx.canvas.width / 4, 30);

        // Debug text for Collision Stats
        if (this.lastHitStats) {
            ctx.fillStyle = "black";
            ctx.font = "bold 18px monospace";
            ctx.textAlign = "center";
            
            const stats = this.lastHitStats;
            const totalBatSpeed = Math.hypot(stats.batSpeedX, stats.batSpeedY);
            ctx.fillText(`HIT REGION: ${stats.regionIndex}`, ctx.canvas.width / 2, 30);
            ctx.fillText(`BAT ANGLE: ${stats.batAngle.toFixed(1)}°`, ctx.canvas.width / 2, 55);
            ctx.fillText(`BAT SPEED: X=${stats.batSpeedX.toFixed(1)} Y=${stats.batSpeedY.toFixed(1)}`, ctx.canvas.width / 2, 80);
            ctx.fillText(`BALL BEFORE: X=${stats.ballSpeedBeforeX.toFixed(1)} Y=${stats.ballSpeedBeforeY.toFixed(1)}`, ctx.canvas.width / 2, 105);
            ctx.fillText(`BALL AFTER: X=${stats.ballSpeedAfterX.toFixed(1)} Y=${stats.ballSpeedAfterY.toFixed(1)}`, ctx.canvas.width / 2, 130);
            ctx.fillText(`BAT SPEED AT COLLISION: ${totalBatSpeed.toFixed(1)}`, ctx.canvas.width / 2, 155);
            ctx.fillText(`RELATIVE IMPACT SPEED: ${stats.relativeImpactSpeed.toFixed(1)}`, ctx.canvas.width / 2, 180);
            
            ctx.textAlign = "left"; // Reset alignment
        }
    }
}