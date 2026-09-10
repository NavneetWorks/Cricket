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
            // FRAME 1: 
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
            // FRAME 2: 
            spineAngleDeg: -127,           
            shoulderJointDist: 45,
            shoulderJointAngleDeg: 102,     
            leftUpperArmAngleDeg: 94,     
            leftElbowAngleDeg: 75,        
            rightUpperArmAngleDeg: 28,    
            rightElbowAngleDeg: 73,        
            pelvisJointDist: 10,           
            pelvisJointAngleDeg: 100,       
            leftThighAngleDeg: 155,        
            rightThighAngleDeg: 83,        
            leftKneeAngleDeg: -40,          
            rightKneeAngleDeg: -45,         
            hipYOffset: -10
        },
          {
            // FRAME 3: 
            spineAngleDeg: -127,           
            shoulderJointDist: 45,
            shoulderJointAngleDeg: 102,     
            leftUpperArmAngleDeg: 94,     
            leftElbowAngleDeg: 60,        
            rightUpperArmAngleDeg: 28,    
            rightElbowAngleDeg: 73,        
            pelvisJointDist: 10,           
            pelvisJointAngleDeg: 100,       
            leftThighAngleDeg: 155,        
            rightThighAngleDeg: 83,        
            leftKneeAngleDeg: -35,          
            rightKneeAngleDeg: -45,         
            hipYOffset: -10
        },
        {
            // FRAME 4
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
            // FRAME 5
            spineAngleDeg: -122,           
            shoulderJointDist: 50,
            shoulderJointAngleDeg: 105,     
            leftUpperArmAngleDeg: 80,     
            leftElbowAngleDeg: 38,        
            rightUpperArmAngleDeg: 41,    
            rightElbowAngleDeg: 70,        
            pelvisJointDist: 0,           
            pelvisJointAngleDeg: 100,       
            leftThighAngleDeg: 140,        
            rightThighAngleDeg: 89,        
            leftKneeAngleDeg: -28,          
            rightKneeAngleDeg: -73,         
            hipYOffset: -12
        },
         {
            // FRAME 6
            spineAngleDeg: -122,           
            shoulderJointDist: 50,
            shoulderJointAngleDeg: 105,     
            leftUpperArmAngleDeg: 80,     
            leftElbowAngleDeg: 38,        
            rightUpperArmAngleDeg: 41,    
            rightElbowAngleDeg: 70,        
            pelvisJointDist: 0,           
            pelvisJointAngleDeg: 100,       
            leftThighAngleDeg: 140,        
            rightThighAngleDeg: 89,        
            leftKneeAngleDeg: -28,          
            rightKneeAngleDeg: -85,         
            hipYOffset: -14
        },
        {
            // FRAME 7
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
            // FRAME 8
            spineAngleDeg: -125,           
            shoulderJointDist: 50,
            shoulderJointAngleDeg: 105,     
            leftUpperArmAngleDeg: 70,     
            leftElbowAngleDeg: 27,        
            rightUpperArmAngleDeg: 55,    
            rightElbowAngleDeg: 70,        
            pelvisJointDist: -18,           
            pelvisJointAngleDeg: 100,       
            leftThighAngleDeg: 135,        
            rightThighAngleDeg: 101,        
            leftKneeAngleDeg: -27,          
            rightKneeAngleDeg: -102,         
            hipYOffset: -14
        },
        {
            // FRAME 9
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
            // FRAME 10
            spineAngleDeg: -133,           
            shoulderJointDist: 45,
            shoulderJointAngleDeg: 115,     
            leftUpperArmAngleDeg: 60,     
            leftElbowAngleDeg: 40, ///////       
            rightUpperArmAngleDeg: 65,    
            rightElbowAngleDeg: 72,        
            pelvisJointDist: -27,           
            pelvisJointAngleDeg: 110,     //  
            leftThighAngleDeg: 130,        //
            rightThighAngleDeg: 111,        
            leftKneeAngleDeg: -30,          
            rightKneeAngleDeg: -115,         
            hipYOffset: -13
        },
        {
            // FRAME 11
            spineAngleDeg: -133,           
            shoulderJointDist: 45,
            shoulderJointAngleDeg: 115,     
            leftUpperArmAngleDeg: 60,     
            leftElbowAngleDeg: 55, ///////       
            rightUpperArmAngleDeg: 65,    
            rightElbowAngleDeg: 72,        
            pelvisJointDist: -27,           
            pelvisJointAngleDeg: 120,     //  
            leftThighAngleDeg: 120,        //
            rightThighAngleDeg: 114,        
            leftKneeAngleDeg: -30,          
            rightKneeAngleDeg: -120,         
            hipYOffset: -15
        },
         {
            // FRAME 12
            spineAngleDeg: -133,           
            shoulderJointDist: 45,
            shoulderJointAngleDeg: 115,     
            leftUpperArmAngleDeg: 60,     
            leftElbowAngleDeg: 70, ///////       
            rightUpperArmAngleDeg: 65,    
            rightElbowAngleDeg: 72,        
            pelvisJointDist: -27,           
            pelvisJointAngleDeg: 120,     //  
            leftThighAngleDeg: 120,        //
            rightThighAngleDeg: 114,        
            leftKneeAngleDeg: -30,          
            rightKneeAngleDeg: -120,         
            hipYOffset: -15
        },
        {
            // FRAME 13
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
            // FRAME 14
             spineAngleDeg: -130,           
            shoulderJointDist: 35,
            shoulderJointAngleDeg: 127,     
            leftUpperArmAngleDeg: 45,     
            leftElbowAngleDeg: 95,        //
            rightUpperArmAngleDeg: 70,    
            rightElbowAngleDeg: 65,      //  
            pelvisJointDist: -30,           
            pelvisJointAngleDeg: 130,       
            leftThighAngleDeg: 100,   //     
            rightThighAngleDeg: 122,  //      
            leftKneeAngleDeg: -30,          
            rightKneeAngleDeg: -125,         
            hipYOffset: -16
        },
        {
            // FRAME 15
             spineAngleDeg: -130,           
            shoulderJointDist: 35,
            shoulderJointAngleDeg: 127,     
            leftUpperArmAngleDeg: 45,     
            leftElbowAngleDeg: 108,        //
            rightUpperArmAngleDeg: 70,    
            rightElbowAngleDeg: 57,      //  
            pelvisJointDist: -30,           
            pelvisJointAngleDeg: 130,       
            leftThighAngleDeg: 92,   //     
            rightThighAngleDeg: 126,  //      
            leftKneeAngleDeg: -30,          
            rightKneeAngleDeg: -125,         
            hipYOffset: -16
        },
        {
            // FRAME 16
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
            // FRAME 17
            spineAngleDeg: -125,           
            shoulderJointDist: 20,//
            shoulderJointAngleDeg: 130,     
            leftUpperArmAngleDeg: 40,     
            leftElbowAngleDeg: 120,        
            rightUpperArmAngleDeg: 55,  //  
            rightElbowAngleDeg: 70,  //      
            pelvisJointDist: -30,           
            pelvisJointAngleDeg: 130,       
            leftThighAngleDeg: 72, //       
            rightThighAngleDeg: 133,        
            leftKneeAngleDeg: -28,   //       
            rightKneeAngleDeg: -115,         
            hipYOffset: -10
        },
        {
            // FRAME 18
            spineAngleDeg: -125,           
            shoulderJointDist: 10,//
            shoulderJointAngleDeg: 130,     
            leftUpperArmAngleDeg: 40,     
            leftElbowAngleDeg: 120,        
            rightUpperArmAngleDeg: 40,  //  
            rightElbowAngleDeg: 90,  //      
            pelvisJointDist: -30,           
            pelvisJointAngleDeg: 130,       
            leftThighAngleDeg: 66, //       
            rightThighAngleDeg: 133,        
            leftKneeAngleDeg: -24,   //       
            rightKneeAngleDeg: -107,         
            hipYOffset: -5
        },
        {
            // FRAME 19
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
            // FRAME 20
            spineAngleDeg: -121,           
            shoulderJointDist: 7,
            shoulderJointAngleDeg: 110,     
            leftUpperArmAngleDeg: 60,     
            leftElbowAngleDeg: 120,        
            rightUpperArmAngleDeg: 40,    
            rightElbowAngleDeg: 102,        
            pelvisJointDist: -30,           
            pelvisJointAngleDeg: 125,       
            leftThighAngleDeg: 60,        
            rightThighAngleDeg: 135,        
            leftKneeAngleDeg: -20,          
            rightKneeAngleDeg: -80,         
            hipYOffset: -3
        },
        {
            // FRAME 21
            spineAngleDeg: -118,           
            shoulderJointDist: 10,
            shoulderJointAngleDeg: 90,     
            leftUpperArmAngleDeg: 80,     
            leftElbowAngleDeg: 120,        
            rightUpperArmAngleDeg: 60,    
            rightElbowAngleDeg: 97,        
            pelvisJointDist: -30,           
            pelvisJointAngleDeg: 120,       
            leftThighAngleDeg: 60,        
            rightThighAngleDeg: 131,        
            leftKneeAngleDeg: -20,          
            rightKneeAngleDeg: -65,         
            hipYOffset: -6
        },
        {
            // FRAME 22
            spineAngleDeg: -116,           
            shoulderJointDist: 13,
            shoulderJointAngleDeg: 75,     
            leftUpperArmAngleDeg: 100,     
            leftElbowAngleDeg: 120,        
            rightUpperArmAngleDeg: 75,    
            rightElbowAngleDeg: 94,        
            pelvisJointDist: -30,           
            pelvisJointAngleDeg: 115,       
            leftThighAngleDeg: 60,        
            rightThighAngleDeg: 127,        
            leftKneeAngleDeg: -20,          
            rightKneeAngleDeg: -57,         
            hipYOffset: -8
        },
        {
            // FRAME 23
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
            // FRAME 24
            spineAngleDeg: -117,            
            shoulderJointDist: 17, 
            shoulderJointAngleDeg: 75,     
            leftUpperArmAngleDeg: 102,     
            leftElbowAngleDeg: 110,        
            rightUpperArmAngleDeg: 80,    
            rightElbowAngleDeg: 90,        
            pelvisJointDist: -30,            
            pelvisJointAngleDeg: 110,       
            leftThighAngleDeg: 65,        
            rightThighAngleDeg: 122,        
            leftKneeAngleDeg: -33,          
            rightKneeAngleDeg: -35,         
            hipYOffset: -15
        },
        {
            // FRAME 25
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
            // FRAME 26
             spineAngleDeg: -120,           
            shoulderJointDist: 12,
            shoulderJointAngleDeg: 90,     
            leftUpperArmAngleDeg: 85,     
            leftElbowAngleDeg: 90,        
            rightUpperArmAngleDeg: 75,    
            rightElbowAngleDeg: 80,        
            pelvisJointDist: -30,           
            pelvisJointAngleDeg: 110,       
            leftThighAngleDeg: 75,        
            rightThighAngleDeg: 120,        
            leftKneeAngleDeg: -65,          
            rightKneeAngleDeg: -22,         
            hipYOffset: -20
        },
        {
            // FRAME 27
             spineAngleDeg: -120,           
            shoulderJointDist: 7,
            shoulderJointAngleDeg: 90,     
            leftUpperArmAngleDeg: 85,     
            leftElbowAngleDeg: 85,        
            rightUpperArmAngleDeg: 77,    
            rightElbowAngleDeg: 75,        
            pelvisJointDist: -30,           
            pelvisJointAngleDeg: 110,       
            leftThighAngleDeg: 78,        
            rightThighAngleDeg: 120,        
            leftKneeAngleDeg: -82,          
            rightKneeAngleDeg: -21,         
            hipYOffset: -20
        },
        {
            // FRAME 28
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
            // FRAME 29
            spineAngleDeg: -120,           
            shoulderJointDist: 12,
            shoulderJointAngleDeg: 90,     
            leftUpperArmAngleDeg: 92,     
            leftElbowAngleDeg: 80,        
            rightUpperArmAngleDeg: 77,    
            rightElbowAngleDeg: 60,        
            pelvisJointDist: -30,           
            pelvisJointAngleDeg: 110,       
            leftThighAngleDeg: 90,        
            rightThighAngleDeg: 117,        
            leftKneeAngleDeg: -110,           
            rightKneeAngleDeg: -25,         
            hipYOffset: -20
        },
        {
            // FRAME 30
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
            // FRAME 31
             spineAngleDeg: -120,           
            shoulderJointDist: 25,
            shoulderJointAngleDeg: 90,     
            leftUpperArmAngleDeg: 102,     
            leftElbowAngleDeg: 85,        
            rightUpperArmAngleDeg: 68,    
            rightElbowAngleDeg: 55,        
            pelvisJointDist: -25,           
            pelvisJointAngleDeg: 110,       
            leftThighAngleDeg: 105,        
            rightThighAngleDeg: 108,        
            leftKneeAngleDeg: -125,          
            rightKneeAngleDeg: -30,         
            hipYOffset: -20
        },
        {
            // FRAME 32
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
            // FRAME 33
            spineAngleDeg: -120,           
            shoulderJointDist: 35,
            shoulderJointAngleDeg: 90,     
            leftUpperArmAngleDeg: 107,     
            leftElbowAngleDeg: 98,        
            rightUpperArmAngleDeg: 52,    
            rightElbowAngleDeg: 65,        
            pelvisJointDist: -5,           
            pelvisJointAngleDeg: 110,       
            leftThighAngleDeg: 125,        
            rightThighAngleDeg: 100,        
            leftKneeAngleDeg: -130,          
            rightKneeAngleDeg: -30,         
            hipYOffset: -20
        },
        {
            // FRAME 34
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
            // FRAME 35
             spineAngleDeg: -117,           
            shoulderJointDist: 40,
            shoulderJointAngleDeg: 90,     
            leftUpperArmAngleDeg: 110,     
            leftElbowAngleDeg: 105,        
            rightUpperArmAngleDeg: 42,    
            rightElbowAngleDeg: 70,        
            pelvisJointDist: 5,           
            pelvisJointAngleDeg: 110,       
            leftThighAngleDeg: 150,        
            rightThighAngleDeg: 85,        
            leftKneeAngleDeg: -115,          
            rightKneeAngleDeg: -30,         
            hipYOffset: -20
        },
        {
            // FRAME 36
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
            hipYOffset: -16
        },
        {
            // FRAME 37: 
            spineAngleDeg: -122,           
            shoulderJointDist: 40,
            shoulderJointAngleDeg: 95,     
            leftUpperArmAngleDeg: 105,     
            leftElbowAngleDeg: 102,        
            rightUpperArmAngleDeg: 31,    
            rightElbowAngleDeg: 78.5,        
            pelvisJointDist: 7.5,           
            pelvisJointAngleDeg: 105,       
            leftThighAngleDeg: 150,        
            rightThighAngleDeg: 75,        
            leftKneeAngleDeg: -85,         // 
            rightKneeAngleDeg: -30,         
            hipYOffset: -14
        },
        {
            // FRAME 38: 
            spineAngleDeg: -122,           
            shoulderJointDist: 40,
            shoulderJointAngleDeg: 95,     
            leftUpperArmAngleDeg: 105,     
            leftElbowAngleDeg: 102,        
            rightUpperArmAngleDeg: 31,    
            rightElbowAngleDeg: 78.5,        
            pelvisJointDist: 7.5,           
            pelvisJointAngleDeg: 105,       
            leftThighAngleDeg: 150,        
            rightThighAngleDeg: 75,        
            leftKneeAngleDeg: -65,         // 
            rightKneeAngleDeg: -30,         
            hipYOffset: -12
        },
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