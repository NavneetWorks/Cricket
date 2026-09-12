import Bat from "../entities/Bat";
import Ball from "../entities/Ball";
import { Bowler } from "../entities/Bowler";
import BowlingArea from "../entities/BowlingArea";
import Renderer from "./Rederer";
import Input from "./Input";
import NetworkManager from "../network/NetworkManager";
import { SoundManager } from "../audio/SoundManager";
import {GRAVITY,RESTITUTION_GROUND, CANVAS_HEIGHT, CANVAS_WIDTH, GROUND_HEIGHT ,k_values, SERVER_CONFIG, BAT_SNAPSHOT_QUEUE_SIZE, BAT_INTERP_BUFFER_TICKS, BAT_MAX_EXTRAPOLATION_TICKS } from "./constants";

// Ek remote bat snapshot: batter ke client par kya pose tha, kis tick par
interface BatSnapshot {
    tick: number;      // batter ke networkTickNumber ka value (uniform 60Hz grid)
    mouseX: number;
    mouseY: number;
}

export default class GameLoop{
    private ctx:CanvasRenderingContext2D;
    private bat:Bat;
    private ball: Ball;
    public renderer:Renderer;
    private input: Input;
    private lastFrameTime = 0;

    public isOnlineMode: boolean = false;
    public network: NetworkManager | null = null;
    private networkTickNumber: number = 0;
    private networkTimer: number = 0;
    private readonly NETWORK_INTERVAL = 1 / 60;
    private hasSentReleasePacket: boolean = false;

   
    private physicsAccumulator: number = 0;
    private renderAlpha: number = 0;                 // 0..1 — pichle physics step se kitna aage render karna hai

    
    private localPredictedHit: boolean = false;      // Kya is ball par local hit fire hua?
    private suppressNextPacketSound: boolean = false; // 🟢 MULTI-HIT FIX (one-shot): local
  
    private hasAuthoritativeResult: boolean = false; // 🐛 DOUBLE-COLLISION FIX: HIT_RESULT
   
    private currentDeliverySpeed: number = 3000;
    private currentDeliveryAngle: number = 180;
    private targetReleasePhase: number = 37.5 / 41.0;

    private currentArmAngleRad: number = -Math.PI * 0.7;
    private armAngularVelRad: number = 0;
    private currentArmDist: number = 140;
    private armDistVel: number = 0;
    private wasMouseDownInJump: boolean = false;
    private prevWorldMouseX: number = 0;
    private prevWorldMouseY: number = 0;
    private targetHandWorldX: number = 0;
    private targetHandWorldY: number = 0;
    private armVelX: number = 0;
    private armVelY: number = 0;
    private isHandTargetInitialized: boolean = false;

    private batPoseQueue: BatSnapshot[] = [];        // time-sorted snapshots (naye end me)
    private batInterpTick: number = 0;               // playhead (float tick-space me)
    private readonly FIXED_DT: number = 1 / 60;      // Physics tick = 16.67ms
    private readonly MAX_PHYSICS_STEPS: number = 5;  // Spiral-of-death guard: slow machine par accumulator kabhi grow nahi karega

    constructor(ctx:CanvasRenderingContext2D,bat:Bat,input:Input,isOnline:boolean = false){
        this.ctx = ctx;
        this.bat = bat;
        this.ball = new Ball();
        this.renderer = new Renderer(ctx, bat, input,this.ball);
        this.input = input;
        this.isOnlineMode = isOnline;
    }
    public start(){
        this.lastFrameTime = performance.now();

        if(this.isOnlineMode){
            this.network = new NetworkManager();
            this.network.connect(SERVER_CONFIG.SIGNALING_URL);
            this.network.onMatchStart = (role) =>{
                console.log("match started assigned role : ",role);
                this.setGameMode(role === 'BATSMAN' ? 'BATTING' : 'BOWLING');
                this.networkTickNumber = 0;
                // Naya match — purane snapshots/playhead clear karo (Step 2)
                this.batPoseQueue = [];
                this.batInterpTick = 0;
                // Step 3: prediction flags bhi fresh
                this.localPredictedHit = false;
                this.suppressNextPacketSound = false;
                this.hasAuthoritativeResult = false;
            };
            this.network.onBowlerRelease = (startX,startY,speed,angleDegrees) =>{
                this.renderer.wicket.reset();
                this.ball.throwBall(startX,startY,speed,angleDegrees);
                // 🟢 STEP 3: naya ball aaya — per-ball prediction flags reset
                // (nayi ball par sound dobara baj sakti hai, isliye guard refresh)
                this.localPredictedHit = false;
                this.suppressNextPacketSound = false;
                this.hasAuthoritativeResult = false;
            }
        
            this.network.onOpponentBatSwing = (tick, mouseX, mouseY, angle) => {
               
                const q = this.batPoseQueue;
                // Out-of-order/duplicate packets ignore karo (UDP reorder ho sakta hai)
                if (q.length > 0 && tick <= q[q.length - 1].tick) return;
                q.push({ tick, mouseX, mouseY });
                if (q.length > BAT_SNAPSHOT_QUEUE_SIZE) {
                    q.shift(); // Sabse purana snapshot phenko (queue size cap)
                }
            };
            this.network.onHitResult = (exitX,exitY,exitVx,exitVy,impactSpeed,hitPixelOffset,tick) =>{
                const elapsedTicks = Math.max(0, this.networkTickNumber - tick);
                const { finalX, finalY, finalVx, finalVy } = this.getProjectileStateWithBounce(
                    exitX,
                    exitY,
                    exitVx,
                    exitVy,
                    elapsedTicks
                );
                // dikhata hai — perfect.
                this.ball.pos.x = finalX;
                this.ball.pos.y = finalY;
                this.ball.vel.x = finalVx;
                this.ball.vel.y = finalVy;
      
                this.ball.prevPos.x = exitX;
                this.ball.prevPos.y = exitY;
    
                this.bat.clearStuckState();
                this.ball.isStuck = false;
      
                this.hasAuthoritativeResult = true;
                this.localPredictedHit = false;

                if (this.suppressNextPacketSound) {
                    this.suppressNextPacketSound = false; // Echo consume — one-shot
                } else {
                  
                    SoundManager.getInstance().playBatHit(impactSpeed, hitPixelOffset);
                }

                (this.bat as any).lastHitStats = {
                    regionIndex: -1,
                    batAngle: 0,
                    batSpeedX: 0,
                    batSpeedY: 0,
                    ballSpeedBeforeX: 0,
                    ballSpeedBeforeY: 0,
                    ballSpeedAfterX: exitVx,
                    ballSpeedAfterY: exitVy,
                    relativeImpactSpeed: 0,
                    predictedRange: this.bat.calculatePredictedRange(this.ball.pos, this.ball.vel),
                    hitPosX: exitX,
                    hitPosY: exitY
                };
            }
        }
        const startBowlerDelivery = () => {
            const bowler = this.renderer.bowler;
            bowler.resetToIdle();
            bowler.currentHipPosition.x = 1.4*CANVAS_WIDTH;
            bowler.startRunning();

            const minSpeed = 2500;
            const maxSpeed = 3500;
            this.currentDeliverySpeed = minSpeed + Math.random() * (maxSpeed - minSpeed);

            const minAngle = 1;
            const maxAngle = 14;
            const randomAngleOffset = minAngle + Math.random() * (maxAngle - minAngle);
            this.currentDeliveryAngle = 180 - randomAngleOffset;

            // Lower angle -> Release near Keyframe 38 (index 37.0)
            // Higher angle -> Release near Keyframe 39 (index 38.0)
            const angleRatio = (randomAngleOffset - minAngle) / (maxAngle - minAngle);
            const releaseKeyframe = 37.0 + angleRatio * 1.0;
            this.targetReleasePhase = releaseKeyframe / 41.0;

            this.ball.isHeldInHand = true;
            this.ball.isActive = true;
            this.ball.pos.x = bowler.leftWrist.x;
            this.ball.pos.y = bowler.leftWrist.y;
            this.ball.prevPos.x = bowler.leftWrist.x;
            this.ball.prevPos.y = bowler.leftWrist.y;
        };

        // 1. Mouse Click (Left Click): Only triggers pre-jump IF bowler is ALREADY running via Space key!
        window.addEventListener("mousedown", (event) => {
            if (event.button !== 0) return; // Only Left Click
            const bowler = this.renderer.bowler;
            if (!this.isOnlineMode && this.renderer.gameMode === 'BATTING') {
                startBowlerDelivery();
            } else if (this.renderer.gameMode === 'NEW_BOWLER') {
                // Left click before Space does NOTHING! Only triggers jump during active runup.
                if (bowler.isRunning && !bowler.isExecutingJump && !bowler.isPreJumpTransitioning) {
                    bowler.triggerPreJump();
                }
            }
        });

        // 2. Keyboard Space Key: Starts automatic 400+ frame runup in NEW_BOWLER mode
        window.addEventListener("keydown", (event) => {
            if (event.code === "Space") {
                const bowler = this.renderer.bowler;
                if (!this.isOnlineMode && this.renderer.gameMode === 'BATTING') {
                    startBowlerDelivery();
                } else if (this.renderer.gameMode === 'NEW_BOWLER') {
                    if (!bowler.isRunning && !bowler.isExecutingJump && !bowler.isPreJumpTransitioning) {
                        const startX = bowler.currentHipPosition.x < 2000 ? 2600 : bowler.currentHipPosition.x;
                        bowler.resetToIdle();
                        bowler.currentHipPosition.x = startX;
                        bowler.startRunning();
                        this.ball.isHeldInHand = true;
                        this.ball.isActive = true;
                    }
                }
            }
        });

        // 3. Keyboard par 'R' button dabane par Bowling ball, Bowler, Joystick & Wickets reset karna
        window.addEventListener("keydown", (event) => {
            if (event.code === "KeyR" || event.key.toLowerCase() === 'r') {
                if (this.renderer.gameMode === 'NEW_BOWLER') {
                    const bowler = this.renderer.bowler;
                    bowler.resetToIdle();
                    bowler.resetProceduralUpperBodyState();
                    bowler.currentHipPosition.x = 2600;
                    bowler.preJumpStartX = 2600;
                    bowler.isExecutingJump = false;
                    bowler.isPreJumpTransitioning = false;
                    bowler.isPreJumpFrozen = false;
                    bowler.isRunning = false;
                    bowler.isCycleCompleted = false;

                    this.currentArmAngleRad = Math.PI;
                    this.isHandTargetInitialized = false;

                    if (this.renderer.joystick) {
                        this.renderer.joystick.reset();
                    }

                    const initialPose = bowler.getProceduralUpperBodyPose(Math.PI);
                    bowler.applyKeyframePose(initialPose, 2600);

                    this.ball.isHeldInHand = true;
                    this.ball.isActive = true;
                    this.ball.pos.x = bowler.leftWrist.x;
                    this.ball.pos.y = bowler.leftWrist.y;
                    this.ball.prevPos.x = bowler.leftWrist.x;
                    this.ball.prevPos.y = bowler.leftWrist.y;

                    this.renderer.wicket.reset();
                } else {
                    this.renderer.bowlingArea.reset(this.ball);
                    this.renderer.wicket.reset();
                    this.hasSentReleasePacket = false;
                    this.localPredictedHit = false;
                    this.suppressNextPacketSound = false;
                    this.hasAuthoritativeResult = false;
                }
            }
        });

        // Tab Visibility Change handler: Reset clock on tab focus to prevent dt spike
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) {
                this.lastFrameTime = performance.now();
            }
        });

        this.render();
        requestAnimationFrame(this.loop);
    }

    private loop = (currentTime: number) => {
        let rawDt = (currentTime - this.lastFrameTime) / 1000;
        this.lastFrameTime = currentTime;

        // Clamp dt to max 0.05s (50ms) to prevent physics explosion when switching tabs
        const dt = Math.min(Math.max(0.001, rawDt), 0.05);

        
        this.physicsAccumulator += dt;

        let steps = 0;
        while (this.physicsAccumulator >= this.FIXED_DT && steps < this.MAX_PHYSICS_STEPS) {
            this.update(this.FIXED_DT);              // Physics HAMESHA exact 1/60 dt ke saath
            this.physicsAccumulator -= this.FIXED_DT;
            steps++;
        }
        if (steps === this.MAX_PHYSICS_STEPS) {
            // Slow machine guard: backlog phenko, warna spiral of death (freeze) ho jata
            this.physicsAccumulator = 0;
        }

        // Interpolation factor: physics steps ke beech ke display frames me
        // prevPos↔pos blend ka hisaab (144Hz par ball smooth slide karegi)
        this.renderAlpha = Math.min(1, this.physicsAccumulator / this.FIXED_DT);

        // STEP 2: Remote bat pose har RENDER frame par interpolate karke apply karo
        // (60Hz snapshots ke beech ki 144fps frames smooth bharti hain)
        this.updateRemoteBatPose(dt);

        this.render();
        requestAnimationFrame(this.loop);
    }


    private updateRemoteBatPose(frameDt: number){
        if (!this.isOnlineMode || !this.network) return;
        const q = this.batPoseQueue;
        if (q.length === 0) return; // Batter client / match start se pehle — no-op

        // Sirf 1 snapshot hai → hold karo (buffer abhi bhar raha hai)
        if (q.length === 1) {
            this.bat.setBatPoseFromMouse(q[0].mouseX, q[0].mouseY);
            return;
        }

        const latest = q[q.length - 1].tick;
        const oldest = q[0].tick;

        this.batInterpTick += frameDt * SERVER_CONFIG.TARGET_TICK_RATE;

        const desired = latest - BAT_INTERP_BUFFER_TICKS;
        const lag = desired - this.batInterpTick;
        if (lag > 0.5) {
            this.batInterpTick += lag * Math.min(0.5, frameDt * 3); // max ~2x speed catch-up
        }

        // 3. Safety clamps:
        //    (a) Playhead kabhi oldest snapshot se peeche na jaye (queue ne usse evict kar diya)
        if (this.batInterpTick < oldest) this.batInterpTick = oldest;
        //    (b) Kabhi latest + MAX_EXTRAP se aage na jaye — underrun par bat HOLD hogi
        //        (freeze), slow motion NAHI. Jaise hi naye packets aayenge, resume.
        const maxTick = latest + BAT_MAX_EXTRAPOLATION_TICKS;
        if (this.batInterpTick > maxTick) this.batInterpTick = maxTick;

        // 4. Playhead ko wrap karne wale do snapshots dhoondo (queue sorted hai)
        let a = q[0];
        let b = q[q.length - 1];
        for (let i = 0; i < q.length - 1; i++) {
            if (q[i].tick <= this.batInterpTick && q[i + 1].tick >= this.batInterpTick) {
                a = q[i];
                b = q[i + 1];
                break;
            }
        }

        let x: number, y: number;
        if (this.batInterpTick >= b.tick) {
           
            const prev = q[q.length - 2];
            const tickSpan = Math.max(1, b.tick - prev.tick);
            const vx = (b.mouseX - prev.mouseX) / tickSpan;
            const vy = (b.mouseY - prev.mouseY) / tickSpan;
            const over = this.batInterpTick - b.tick;
            x = b.mouseX + vx * over;
            y = b.mouseY + vy * over;
        } else {
            // 5b. INTERPOLATION: dono endpoints KNOWN hain — koi guess nahi, pure math.
            //     alpha = playhead is tick-interval me kitna aage hai (0..1)
            const tickSpan = Math.max(1e-6, b.tick - a.tick);
            const alpha = (this.batInterpTick - a.tick) / tickSpan;
            x = a.mouseX + (b.mouseX - a.mouseX) * alpha;
            y = a.mouseY + (b.mouseY - a.mouseY) * alpha;
        }

        // 6. Smooth pose ko poore skeleton par apply karo (jaise pehle hota tha,
        //    bas ab values raw packets se nahi — LERP se aayi hui hain)
        this.bat.setBatPoseFromMouse(x, y);
    }

private getProjectileStateWithBounce(
    initialX: number, 
    initialY: number, 
    initialVx: number, 
    initialVy: number, 
    t: number,
    ballRadius: number = 10
) {
    
    let currX = initialX;
    let currY = initialY;
    let currVx = initialVx;
    let currVy = initialVy;

    const groundY = CANVAS_HEIGHT - GROUND_HEIGHT - ballRadius;
    const stepDt = 0.001; // 1ms precision step
    let elapsedTime = 0;

    while (elapsedTime < t/60) {
        const dt = Math.min(stepDt, t - elapsedTime);

        // Gravity & Velocity update
        currVy += GRAVITY * dt;
        currX += currVx * dt;
        currY += currVy * dt;

        // Ground Bounce check
        if (currY >= groundY) {
            currY = groundY;
            currVy = -currVy * RESTITUTION_GROUND;
            currVx *= 0.98; // Friction
        }

        elapsedTime += dt;
    }

    return { 
        finalX: currX, 
        finalY: currY, 
        finalVx: currVx, 
        finalVy: currVy 
    };
}
    private update(dt: number){
        if (this.renderer.gameMode === 'BATTING') {
            const currentCommand = this.input.getHistory().peek();
            if(currentCommand === null){
                console.log("No mouse history available to update bat.");
                return;
            }
            this.bat.update(this.input.mouseX, this.input.mouseY, dt, this.input);

            // 🏃 Bowler & Ball Attachment / Release logic in BATTING Mode
            const bowler = this.renderer.bowler;
            bowler.update(dt);

            if (this.ball.isHeldInHand && (bowler.isRunning || bowler.isPreJumpTransitioning || bowler.isExecutingJump)) {
                this.ball.pos.x = bowler.leftWrist.x;
                this.ball.pos.y = bowler.leftWrist.y;
                this.ball.prevPos.x = bowler.leftWrist.x;
                this.ball.prevPos.y = bowler.leftWrist.y;
                this.ball.isActive = true;

                // Auto pre-jump trigger near crease (x <= 750)
                if (bowler.isRunning && bowler.currentHipPosition.x <= 1.2*CANVAS_WIDTH && !bowler.isPreJumpTransitioning && !bowler.isExecutingJump) {
                    bowler.triggerPreJump();
                }

                // Release ball dynamically synchronized between Keyframe 38 and 39 based on delivery angle!
                if (bowler.isExecutingJump && bowler.jumpPhase >= this.targetReleasePhase && !bowler.hasReleasedBall) {
                    bowler.hasReleasedBall = true;
                    this.ball.isHeldInHand = false;

                    this.renderer.wicket.reset();
                    this.ball.throwBall(
                        bowler.leftWrist.x,
                        bowler.leftWrist.y,
                        this.currentDeliverySpeed,
                        this.currentDeliveryAngle
                    );
                }
            }

            this.ball.update(dt);
            this.renderer.wicket.update(dt);
            
            this.networkTimer += dt;
            if (this.networkTimer >= this.NETWORK_INTERVAL) {
                this.networkTimer -= this.NETWORK_INTERVAL;
                this.networkTickNumber++;
            }

            if (this.isOnlineMode && this.network && this.network.isConnected) {
                this.network.sendBatSwingUDP(
                    this.networkTickNumber,
                    this.input.mouseX,
                    this.input.mouseY,
                    0
                );
             }
            
            // if(this.isOnlineMode && this.network && this.network.isConnected){
            //     this.networkTimer += dt;
            //     if(this.networkTimer >= this.NETWORK_INTERVAL){
            //         this.networkTimer -= this.NETWORK_INTERVAL;
            //         this.networkTickNumber++;

            //         // 60Hz UDP par Bat pose bhejo:
            //         // this.network.sendBatSwingUDP(
            //         //     this.networkTickNumber,
            //         //     this.bat.getHandleTop().x,
            //         //     this.bat.getHandleTop().y,
            //         //     this.bat.getBatAngle()
            //         // );   
            //         this.network.sendBatSwingUDP(
            //             this.networkTickNumber,
            //             this.input.mouseX,
            //             this.input.mouseY,
            //             0
            //         );           
                
            //     }
            // }
            const batHitResult = this.bat.checkHit(this.ball, dt);
           
            if (batHitResult.hit && !this.ball.isStuck && this.isOnlineMode && this.network && this.network.isConnected) {
           
                const si = this.bat.lastSoundImpact;
                this.network.sendHitResult(
                    this.networkTickNumber,
                    this.ball.pos.x,
                    this.ball.pos.y,
                    this.ball.vel.x,
                    this.ball.vel.y,
                    si?.speed ?? 1000,      // fallback: threshold-ke-paas default
                    si?.offset ?? 100       // fallback: mid-blade
                );
            }
            this.renderer.wicket.checkHit(this.ball, batHitResult.hit, batHitResult.hitSubStep);
        } else if (this.renderer.gameMode === 'NEW_BOWLER') {
            const bowler = this.renderer.bowler;

            // 🏃 A/D or Arrow keys move bowler character Left / Right when idle
            if (!bowler.isRunning && !bowler.isExecutingJump && !bowler.isPreJumpTransitioning) {
                const moveSpeed = 450; // px/sec movement speed
                let moved = false;
                if (this.input.isKeyPressed("a") || this.input.isKeyPressed("KeyA") || this.input.isKeyPressed("ArrowLeft")) {
                    bowler.currentHipPosition.x -= moveSpeed * dt;
                    moved = true;
                }
                if (this.input.isKeyPressed("d") || this.input.isKeyPressed("KeyD") || this.input.isKeyPressed("ArrowRight")) {
                    bowler.currentHipPosition.x += moveSpeed * dt;
                    moved = true;
                }
                if (moved) {
                    bowler.setInitialRunPose();
                }
            }

            // 🟢 AUTOMATIC RUN-UP PHASE (Space Key): Native 400+ frame leg & body runup animation
            if (bowler.isRunning && !bowler.isExecutingJump && !bowler.isPreJumpTransitioning && !bowler.isCycleCompleted) {
                bowler.update(dt);
            } 
            // 🟢 MANUAL JUMP & DELIVERY PHASE (Left Click during runup OR Idle)
            else {
                const joystick = this.renderer.joystick;
                this.currentArmAngleRad = joystick.angleRad;

                const interpolatedPose = bowler.getProceduralUpperBodyPose(this.currentArmAngleRad);

                if (bowler.isExecutingJump || bowler.isPreJumpTransitioning || bowler.isCycleCompleted) {
                    if (bowler.preJumpStartX === 0 || bowler.preJumpStartX === undefined) {
                        bowler.preJumpStartX = bowler.currentHipPosition.x;
                    }
                    const manualStepX = bowler.preJumpStartX - bowler.currentProceduralJumpXOffset;
                    bowler.applyKeyframePose(interpolatedPose, manualStepX);
                } else {
                    bowler.applyKeyframePose(interpolatedPose, bowler.currentHipPosition.x);
                }

                const totalArmLen = bowler.FRONT_UPPER_ARM + bowler.FRONT_LOWER_ARM;
                const minReach = Math.abs(bowler.FRONT_UPPER_ARM - bowler.FRONT_LOWER_ARM) + 5;
                const reachRatio = joystick.distanceRatio > 0.05 ? joystick.distanceRatio : 1.0;
                const armReach = minReach + (totalArmLen - minReach - 1.0) * reachRatio;

                bowler.overrideLeftArmWithIK(this.currentArmAngleRad, armReach);
            }

            // Sync ball position with left wrist (ALWAYS held in hand in NEW_BOWLER mode, NO release!)
            this.ball.isHeldInHand = true;
            this.ball.isActive = true;
            this.ball.pos.x = bowler.leftWrist.x;
            this.ball.pos.y = bowler.leftWrist.y;
            this.ball.prevPos.x = bowler.leftWrist.x;
            this.ball.prevPos.y = bowler.leftWrist.y;

            // Auto pre-jump trigger near crease (x <= 750) if still running
            if (bowler.isRunning && bowler.currentHipPosition.x <= 750 && !bowler.isPreJumpTransitioning && !bowler.isExecutingJump) {
                bowler.triggerPreJump();
            }
            this.ball.update(dt);
            this.renderer.wicket.update(dt);
        } else {
            // BOWLING MODE: Update bowling area, ball & wicket
            this.renderer.bowlingArea.releaseDelaySeconds = (this.isOnlineMode && this.network) ? this.network.getRTT() / 1000 : 0;
            this.renderer.bowlingArea.update(dt, this.input.mouseX, this.input.mouseY, this.ball);
            this.ball.update(dt); // Integrate ball velocity into position for flight!
            this.renderer.wicket.update(dt);
            this.renderer.wicket.checkHit(this.ball, false);

         
            if (this.isOnlineMode && this.ball.isActive && !this.hasAuthoritativeResult) {
                const predicted = this.bat.checkHit(this.ball, dt);
                if (predicted.hit && !this.ball.isStuck) {
              
                    this.localPredictedHit = true;
                    this.suppressNextPacketSound = true;
                }
            }

            if (this.isOnlineMode && this.renderer.bowlingArea.isBallReleased && !this.hasSentReleasePacket && this.renderer.bowlingArea.lastReleaseInfo) {
                const info = this.renderer.bowlingArea.lastReleaseInfo;
                if (this.network && this.network.isConnected) {
                    this.network.sendBowlerRelease(
                        this.networkTickNumber,
                        info.posX,
                        info.posY,
                        info.speed,
                        info.angle
                    );
                    this.hasSentReleasePacket = true;
                }
            }
        }
    }

    private render(){
        this.renderer.render(this.renderAlpha);
    }

    public setGameMode(mode: 'BATTING' | 'BOWLING' | 'NEW_BOWLER' | 'DEBUG_13_FRAMES') {
        this.renderer.gameMode = mode;
        if (mode === 'NEW_BOWLER') {
            this.renderer.bowler.resetToIdle();
            this.ball.isHeldInHand = true;
            this.ball.isActive = true;
        }
        console.log("Game Mode set to:", mode);
    }

    public toggleGround() {
        this.renderer.useImageGround = !this.renderer.useImageGround;
        console.log("Image Ground toggled:", this.renderer.useImageGround);
    }
}