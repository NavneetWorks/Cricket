import Bat from "../entities/Bat";
import Ball from "../entities/Ball";
import {
  Bowler,
  DECEL_MIN_SWING_SPEED,
  DECEL_DROP_RATIO,
  JUMP_RELEASE_FRAME_MIN,
  JUMP_RELEASE_FRAME_MAX,
} from "../entities/Bowler";
import BowlingArea from "../entities/BowlingArea";
import Renderer from "./Rederer";
import Input from "./Input";
import NetworkManager from "../network/NetworkManager";
import { SoundManager } from "../audio/SoundManager";
import {
  GRAVITY,
  RESTITUTION_GROUND,
  FRICTION_GROUND,
  AIR_DRAG_COEFF,
  BOWLER_WICKET_X,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  GROUND_HEIGHT,
  k_values,
  SERVER_CONFIG,
  BAT_SNAPSHOT_QUEUE_SIZE,
  BAT_INTERP_BUFFER_TICKS,
  BAT_MAX_EXTRAPOLATION_TICKS,
  BOWLER_START_X,
} from "./constants";

// Ek remote bat snapshot: batter ke client par kya pose tha, kis tick par
interface BatSnapshot {
  tick: number; // batter ke networkTickNumber ka value (uniform 60Hz grid)
  mouseX: number;
  mouseY: number;
}



export default class GameLoop {

  private ctx: CanvasRenderingContext2D;
  private bat: Bat;
  private ball: Ball;
  public renderer: Renderer;
  private input: Input;
  private lastFrameTime = 0;
  private preJumpDistance = 1000;
  private hasLocalPredictedRelease: boolean = false;
  private localReleaseTick: number = 0;

  public isOnlineMode: boolean = false;
  public network: NetworkManager | null = null;
  private networkTickNumber: number = 0;
  private networkTimer: number = 0;
  private readonly NETWORK_INTERVAL = 1 / 60;
  private hasSentReleasePacket: boolean = false;
  private hitPacketCooldownTimer: number = 0; // ⏱️ Cooldown timer (400ms) to prevent duplicate consecutive frame HIT_RESULT packets
  private offlineResetTimer: number = 0; // ⏱️ Auto-reset timer (1.5s) for offline batting mode deliveries

  private physicsAccumulator: number = 0;
  private renderAlpha: number = 0; // 0..1 — pichle physics step se kitna aage render karna hai

  private localPredictedHit: boolean = false; // Kya is ball par local hit fire hua?
  private suppressNextPacketSound: boolean = false; // 🟢 MULTI-HIT FIX (one-shot): local

  private hasAuthoritativeResult: boolean = false; // 🐛 DOUBLE-COLLISION FIX: HIT_RESULT

  private lastJoystickSendTime: number = 0; // 🕹️ Bowler joystick UDP send rate limit (60Hz)
  private reconcileBlendTicksRemaining: number = 0;
  private reconcileOffsetX: number = 0;
  private reconcileOffsetY: number = 0;
  private readonly RECONCILE_BLEND_TICKS: number = 5; // ~5 ticks ≈ 83ms glide

  // 🛡️ DEDUP GUARD: last received HIT_RESULT packet tick — same tick ka duplicate packet
  // ignore karne ke liye (reliable channel duplicates nahi bhejta, par defensive safety).
  private lastHitResultTick: number = -1;


  private ticksSinceLocalPredictedHit: number = 0;

  private currentDeliverySpeed: number = 3000;
  private currentAnimationSpeed: number = 600.0;
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

  private batPoseQueue: BatSnapshot[] = []; // time-sorted snapshots (naye end me)
  private batInterpTick: number = 0; // playhead (float tick-space me)
  private readonly FIXED_DT: number = 1 / 60; // Physics tick = 16.67ms
  private readonly MAX_PHYSICS_STEPS: number = 5; // Spiral-of-death guard: slow machine par accumulator kabhi grow nahi karega

  constructor(
    ctx: CanvasRenderingContext2D,
    bat: Bat,
    input: Input,
    isOnline: boolean = false,
  ) {
    this.ctx = ctx;
    this.bat = bat;
    this.ball = new Ball();
    this.renderer = new Renderer(ctx, bat, input, this.ball);
    this.input = input;
    this.isOnlineMode = isOnline;
  }
  public start() {
    this.lastFrameTime = performance.now();

    // Check if the game is running in multiplayer online mode
    if (this.isOnlineMode) {
      this.network = new NetworkManager();
      this.network.connect(SERVER_CONFIG.SIGNALING_URL);
      this.network.onMatchStart = (role) => {
        console.log("match started assigned role : ", role);
        this.setGameMode(role === "BATSMAN" ? "BATTING" : "NEW_BOWLER");
        this.networkTickNumber = 0;
        this.hasSentReleasePacket = false;

        this.renderer.bowler.resetToIdle();
        // Check condition: role !== "BATSMAN" && this.network &&...
        if (role !== "BATSMAN" && this.network && this.network.isConnected) {
          this.network.sendBowlerPosition(
            0,
            this.renderer.bowler.currentHipPosition.x,
          );
        }
        // Naya match — purane snapshots/playhead clear karo
        this.resetPerBallState();
      };
      this.network.onBowlerRelease = (
        tick,
        releaseX,
        releaseY,
        vReleaseX,
        vReleaseY,
      ) => {
        console.log(
          "📩 Batter Received Authoritative Release Event! Packet Tick:",
          tick,
          "Current Tick:",
          this.networkTickNumber,
        );
      
        const deltaTicks = this.getOneWayTicks();
        const authState = this.getProjectileStateWithBounce(
          releaseX,
          releaseY,
          vReleaseX,
          vReleaseY,
          deltaTicks,
        );
        console.log(
          `⏩ Roll-Forward by ${deltaTicks} ticks -> Target Pos: (${authState.finalX.toFixed(1)}, ${authState.finalY.toFixed(1)}) Vel: (${authState.finalVx.toFixed(1)}, ${authState.finalVy.toFixed(1)})`,
        );
        this.renderer.bowler.debugReconciliationPoint = {
          x: authState.finalX,
          y: authState.finalY,
        };

        this.ball.isHeldInHand = false;
        this.ball.isActive = true;
        this.ball.vel.x = authState.finalVx;
        this.ball.vel.y = authState.finalVy;

        this.ball.pos.x = authState.finalX;
        this.ball.pos.y = authState.finalY;
        this.ball.prevPos.x = authState.finalX;
        this.ball.prevPos.y = authState.finalY;
        this.hasLocalPredictedRelease = true;

        this.renderer.wicket.reset();
        this.ball.throwBallWithVelocity(
          this.ball.pos.x,
          this.ball.pos.y,
          this.ball.vel.x,
          this.ball.vel.y,
        );
        
        // 🔴 BATTER SCREEN: The batter must see the ball at 100% normal speed.
        // Time dilation is only used on the Bowler's screen to mask latency.
        this.ball.timeDilationFactor = 1.0;

        // 🟢 Per-ball prediction flags reset on new ball release
        this.localPredictedHit = false;
        this.suppressNextPacketSound = false;
        this.hasAuthoritativeResult = false;
      };

      this.network.onOpponentBatSwing = (tick, mouseX, mouseY, angle) => {
        const last = this.bat.joystickQueue.peek();
        // Out-of-order/duplicate packets ignore karo
        if (last && tick <= last.tick) return;
        this.bat.joystickQueue.enqueue({
          tick,
          mouseX,
          mouseY,
          receivedTime: performance.now()
        });
      };
      this.network.onHitResult = (
        exitX,
        exitY,
        exitVx,
        exitVy,
        impactSpeed,
        hitPixelOffset,
        tick,
      ) => {
     
        // Check condition: tick === this.lastHitResultTick
        if (tick === this.lastHitResultTick) return;
        this.lastHitResultTick = tick;

        const oneWayTicks = this.getOneWayTicks();
        const totalElapsedTicks = Math.max(
          oneWayTicks,
          this.ticksSinceLocalPredictedHit,
        );
        // Check condition: this.ticksSinceLocalPredictedHit > on...
        if (this.ticksSinceLocalPredictedHit > oneWayTicks) {
          console.log(
            `🏁 RACE-FIX: local predicted hit ${this.ticksSinceLocalPredictedHit} ticks pehle fire hua (oneWay=${oneWayTicks}) — fast-forward clamp applied`,
          );
        }

        const { finalX, finalY, finalVx, finalVy } =
          this.getProjectileStateWithBounce(
            exitX,
            exitY,
            exitVx,
            exitVy,
            totalElapsedTicks,
          );

        console.log(
          `%c 📥 RELIABLE HIT_RESULT RECEIVED ON BOWLER SCREEN! `,
          "background: #0284c7; color: #ffffff; font-weight: bold; font-size: 12px; padding: 4px; border-radius: 4px;",
          `\n - Packet Tick: ${tick} | Current Bowler Tick: ${this.networkTickNumber}`,
          `\n - RTT: ${(this.network && this.isOnlineMode ? this.network.getRTT() : 40.0).toFixed(1)}ms | ElapsedTicks(one-way): ${totalElapsedTicks}`,
          `\n - Raw Contact Pos (exitX, exitY): (${exitX.toFixed(1)}, ${exitY.toFixed(1)})`,
          `\n - Fast-Forwarded Pos (finalX, finalY): (${finalX.toFixed(1)}, ${finalY.toFixed(1)})`,
          `\n - Exit Velocity: (${exitVx.toFixed(1)}, ${exitVy.toFixed(1)}) -> Final Velocity: (${finalVx.toFixed(1)}, ${finalVy.toFixed(1)})`,
        );

        this.ball.pos.x = finalX;
        this.ball.pos.y = finalY;
        this.ball.prevPos.x = finalX;
        this.ball.prevPos.y = finalY;
        this.ball.vel.x = finalVx;
        this.ball.vel.y = finalVy;
        this.ball.timeDilationFactor = 1.0; // Ensure normal speed upon authoritative hit result
        this.hasAuthoritativeResult = true;
        
        // 🔵 Color the trail from this point onwards as dark blue
        if (this.renderer.bowler) {
            this.renderer.bowler.authoritativeHitTrailIndex = this.renderer.bowler.ballTrailPoints.length;
        }

        this.reconcileOffsetX = 0;
        this.reconcileOffsetY = 0;
        this.reconcileBlendTicksRemaining = 0;

        // const exitSpeed = Math.hypot(finalVx, finalVy);
        // const alongVel =
        //   exitSpeed > 1
        //     ? ((oldVisualX - finalX) * finalVx +
        //         (oldVisualY - finalY) * finalVy) /
        //       exitSpeed
        //     : 0;
        // if (alongVel > 4.0) {
        //   // Ball target se AAGE hai — pull-back SKIP (ball ko kabhi peeche nahi khinchte)
        //   this.reconcileOffsetX = 0;
        //   this.reconcileOffsetY = 0;
        //   this.reconcileBlendTicksRemaining = 0;
        //   console.log(
        //     `⏭️ BACKWARD-GUARD: ball target se ${alongVel.toFixed(1)}px aage already hai — pull-back skipped (no teleport-back)`,
        //   );
        // } else {
        //   this.reconcileOffsetX = oldVisualX - finalX; // total error jo blend me khatam karni hai
        //   this.reconcileOffsetY = oldVisualY - finalY;
        //   this.reconcileBlendTicksRemaining = this.RECONCILE_BLEND_TICKS;
        // }

        // 🟢 Clean Trail Reconstruction: Remove local prediction noise & connect exitX,exitY -> finalX,finalY
        const bowler = this.renderer.bowler;
        if (bowler && bowler.ballTrailPoints) {
          const splitIdx = bowler.localHitTrailIndex > 0 ? bowler.localHitTrailIndex : (bowler.localReleaseTrailIndex || 0);
          if (splitIdx > 0 && splitIdx < bowler.ballTrailPoints.length) {
            bowler.ballTrailPoints = bowler.ballTrailPoints.slice(
              0,
              splitIdx,
            );
          }
          // The line below ensures we have the actual hit point on the trail
          bowler.ballTrailPoints.push({ x: exitX, y: exitY });
          // And now teleporting forward, the next points will just be the ball's finalX, finalY
        }

        this.bat.clearStuckState();
        this.ball.isStuck = false;
        this.ball.hasBeenHit = true;

        this.hasAuthoritativeResult = true;
        this.localPredictedHit = false;
        // 🎯 RACE-FIX: authoritative result aa gaya — local-flight counter ab zaroori
        // nahi (use ho chuka fast-forward clamp me), isko zero kar do.
        this.ticksSinceLocalPredictedHit = 0;

        // Check condition: this.suppressNextPacketSound
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
          predictedRange: this.bat.calculatePredictedRange(
            this.ball.pos,
            this.ball.vel,
          ),
          hitPosX: exitX,
          hitPosY: exitY,
        };
      };
      this.network.onOpponentBowlerPosition = (tick, hipX) => {
        console.log("📩 Batter Received Bowler Reset Position:", hipX);

        const bowler = this.renderer.bowler;
        bowler.resetToIdle();
      };
    //   this.network.onOpponentBowlerStartRun = (tick) => {
    //     const bowler = this.renderer.bowler;
    //     console.log("🟢 Opponent Bowler Start Run Received!");
    //     // 1. Reset bowler & ball to fresh runup state
    //     const delaySec = (bowler.playheadDelayMs || 30.0) / 1000.0;

    //     this.ball.isHeldInHand = true;
    //     this.ball.isActive = true;
    //     this.hasLocalPredictedRelease = false;
    //     bowler.ballTrailPoints = [];

    //     // 2. Trigger local runup animation
    //     bowler.startRunning();
    //   };
    this.network.onOpponentBowlerStartRun = (tick) => {
        const bowler = this.renderer.bowler;
        bowler.pendingRunupDelaySec = (bowler.playheadDelayMs || 30.0) / 30000.0;
    };
    //   this.network.onOpponentBowlerStartGather = (tick, clickX) => {
    //     const bowler = this.renderer.bowler;
    //     const targetX = clickX - this.preJumpDistance;
    //     bowler.startJumpX = Math.max(BOWLER_WICKET_X, targetX);
    //     bowler.gatheringStartX = clickX;
    //     bowler.gatheringTargetX = bowler.startJumpX;
    //     bowler.isGatheringArmActive = true;
    //     bowler.gatheringAngleTraveledDeg = 0.0;
    //     bowler.accumulatedJoystickAngleDeg = 0.0;
    //     bowler.maxObservedOmegaRad = 0.0;
    //     bowler.prevLeftWristY = 0.0;
    //     bowler.lastReceivedJoystickTick = -1;
    //     bowler.targetNetworkJoystickAngleRad = null;
    //     bowler.targetNetworkJoystickRadiusRatio = 1.0;
    //     bowler.debugReconciliationPoint = null;
    //     bowler.localReleaseTrailIndex = 0;
    //     bowler.ballTrailPoints = [];
    //   };
    this.network.onOpponentBowlerStartGather = (tick, clickX) => {
        const bowler = this.renderer.bowler;
        bowler.pendingGatherDelaySec = (bowler.playheadDelayMs || 30.0) / 30000.0;
        bowler.pendingGatherClickX = clickX;
    };
    
      this.network.onOpponentBowlerJoystick = (
        tick,
        screenX,
        screenY,
      ) => {
            const bowler = this.renderer.bowler;
            // Check condition: tick <= bowler.lastReceivedJoystickTick
            if (tick <= bowler.lastReceivedJoystickTick) return;
            bowler.lastReceivedJoystickTick = tick;
            console.log("enqueing screenX,screenY for bowler joystick");
            bowler.joystickQueue.enqueue({
                tick: tick,
                 screenX: screenX,
                screenY: screenY,
                receivedTime: performance.now()
            });
            bowler.lastReceivedPacketTime = performance.now();
      };
      // GameLoop.ts me setup code ke andar:
        this.renderer.joystick.onJoystickMove = (screenX, screenY) => {
            // Check if the game is running in multiplayer online mode
            if (this.isOnlineMode && this.network && this.network.isConnected) {
                const now = performance.now();
                // 60Hz limit: Agar 16.6ms se pehle next signal aaya toh ignore karo
                if (now - this.lastJoystickSendTime < 16.6) return; 
                this.lastJoystickSendTime = now;
                const bowler = this.renderer.bowler;
                // Sirf tab bhejenge jab Bowler runup/gathering phase me ho
                if (!bowler.isBallReleased && (bowler.isGatheringArmActive || bowler.isExecutingJump || bowler.isRunning)) {
                    this.network.sendBowlerJoystickUDP(
                        this.networkTickNumber,
                        screenX, // 👈 Raw screenX mouse coordinate
                        screenY  // 👈 Raw screenY mouse coordinate
                    );
                }
            }
        };

      this.network.onBowlerRelease = (
        tick,
        releaseX,
        releaseY,
        vReleaseX,
        vReleaseY,
      ) => {
        console.log(
          "📩 Batter Received Authoritative Release Event! Packet Tick:",
          tick,
          "Current Tick:",
          this.networkTickNumber,
        );

        const deltaTicks = this.getOneWayTicks();

        // Fast-Forward real release values by elapsed deltaTicks (including Gravity, Air Drag, Bounce & Friction)
        const realMomentState = this.getProjectileStateWithBounce(
          releaseX,
          releaseY,
          vReleaseX,
          vReleaseY,
          deltaTicks,
        );

        console.log(
          `⏩ Roll-Forward by ${deltaTicks} ticks -> Target Pos: (${realMomentState.finalX.toFixed(1)}, ${realMomentState.finalY.toFixed(1)}) Vel: (${realMomentState.finalVx.toFixed(1)}, ${realMomentState.finalVy.toFixed(1)})`,
        );

        // 🟢 Capture Debug Green Reconciliation Point
        this.renderer.bowler.debugReconciliationPoint = {
          x: realMomentState.finalX,
          y: realMomentState.finalY,
        };

        // Check if local release prediction has already fired
        if (this.hasLocalPredictedRelease) {
          const bowler = this.renderer.bowler;
          // Smoothly shift existing trail points by (dx, dy) to eliminate V-shape diagonal snap artifact!
          const oldX = this.ball.pos.x;
          const oldY = this.ball.pos.y;
          const dx = realMomentState.finalX - oldX;
          const dy = realMomentState.finalY - oldY;

          // Check condition: Math.hypot(dx, dy
          if (Math.hypot(dx, dy) > 0.1 && bowler.ballTrailPoints) {
            const startIdx = bowler.localReleaseTrailIndex || 0;
            for (let i = startIdx; i < bowler.ballTrailPoints.length; i++) {
              bowler.ballTrailPoints[i].x += dx;
              bowler.ballTrailPoints[i].y += dy;
            }
          }

          // Direct state update at current tick moment (No double-launch re-initialization)
          this.ball.isHeldInHand = false;
          this.ball.isActive = true;
          this.ball.pos.x = realMomentState.finalX;
          this.ball.pos.y = realMomentState.finalY;
          this.ball.prevPos.x = realMomentState.finalX;
          this.ball.prevPos.y = realMomentState.finalY;
          this.ball.vel.x = realMomentState.finalVx;
          this.ball.vel.y = realMomentState.finalVy;
        } else {
          // Fallback launch if local prediction hasn't fired
          this.ball.throwBallWithVelocity(
            realMomentState.finalX,
            realMomentState.finalY,
            realMomentState.finalVx,
            realMomentState.finalVy,
          );
          
          // 🔴 BATTER SCREEN: The batter must see the ball at 100% normal speed.
          this.ball.timeDilationFactor = 1.0;
          
          this.hasLocalPredictedRelease = true;
        }
      };
    }
    // 1. Mouse Click (Left Click): Only triggers pre-jump IF bowler is ALREADY running via Space key!
    window.addEventListener("mousedown", (event) => {
      // Check condition: event.button !== 0
      if (event.button !== 0) return; // Only Left Click
      const bowler = this.renderer.bowler;
      // Check if the game is running in multiplayer online mode
      if (!this.isOnlineMode && this.renderer.gameMode === "BATTING") {
        this.startBowlerDelivery();
      }
      // Check condition: this.renderer.gameMode === "NEW_BOWLER"
      else if (this.renderer.gameMode === "NEW_BOWLER") {
        // Left click sets startJumpX preJumpDistance (1000px) to the left of current bowler position!
        if (
          bowler.isRunning &&
          !bowler.isExecutingJump &&
          !bowler.isPreJumpTransitioning
        ) {
          const clickX = bowler.currentHipPosition.x;
          const targetX = clickX - this.preJumpDistance;
          bowler.startJumpX = Math.max(BOWLER_WICKET_X, targetX);
          bowler.gatheringStartX = clickX;
          bowler.gatheringTargetX = bowler.startJumpX;
          bowler.isGatheringArmActive = true;
          bowler.gatheringAngleTraveledDeg = 0.0;
          bowler.accumulatedJoystickAngleDeg = 0.0;
          bowler.ballTrailPoints = [];

          // 📡 Send Left-Click Gathering Event to Opponent!
          if (this.isOnlineMode && this.network && this.network.isConnected) {
            this.network.sendBowlerStartGather(this.networkTickNumber, clickX);
          }
        }
      }
    });

    // 2. Keyboard Space Key: Starts automatic 400+ frame runup in NEW_BOWLER mode
    window.addEventListener("keydown", (event) => {
      // Check condition: event.code === "Space"
      if (event.code === "Space") {
        const bowler = this.renderer.bowler;
        // Check if the game is running in multiplayer online mode
        if (!this.isOnlineMode && this.renderer.gameMode === "BATTING") {
          this.startBowlerDelivery();
        }
        // Check condition: this.renderer.gameMode === "NEW_BOWLER"
        else if (this.renderer.gameMode === "NEW_BOWLER") {
          // Check game state condition
          if (
            !bowler.isRunning &&
            !bowler.isExecutingJump &&
            !bowler.isPreJumpTransitioning
          ) {
            this.resetPerBallState();
            const startX =
              bowler.currentHipPosition.x < BOWLER_START_X - 600
                ? BOWLER_START_X
                : bowler.currentHipPosition.x;
            bowler.resetToIdle();
            bowler.currentHipPosition.x = startX;
            bowler.startRunning();
            // Check if the game is running in multiplayer online mode
            if (this.isOnlineMode && this.network && this.network.isConnected) {
              console.log("🟢 Opponent Bowler Start Run Sent!");
              this.network.sendBowlerStartRun(this.networkTickNumber);
            }
            this.ball.isHeldInHand = true;
            this.ball.isActive = true;
          }
        }
      }
    });

    // 3. Keyboard par 'R' button dabane par Bowling ball, Bowler, Joystick & Wickets reset karna
    window.addEventListener("keydown", (event) => {
      // Check condition: event.code === "KeyR" || event.key.to...
      if (event.code === "KeyR" || event.key.toLowerCase() === "r") {
        this.resetPerBallState();
        // Check condition: this.renderer.gameMode === "NEW_BOWLER"
        if (this.renderer.gameMode === "NEW_BOWLER") {
          const bowler = this.renderer.bowler;
          bowler.resetToIdle();
          bowler.resetProceduralUpperBodyState();
          bowler.currentHipPosition.x = BOWLER_START_X;
          bowler.preJumpStartX = BOWLER_START_X;
          bowler.isExecutingJump = false;
          bowler.isPreJumpTransitioning = false;
          bowler.isPreJumpFrozen = false;
          bowler.isBallReleased = false;
          bowler.isRunning = false;
          bowler.isCycleCompleted = false;
          bowler.ballTrailPoints = [];
          bowler.authoritativeHitTrailIndex = -1;
          bowler.localHitTrailIndex = -1;

          this.currentArmAngleRad = Math.PI;
          this.isHandTargetInitialized = false;

          // Check condition: this.renderer.joystick
          if (this.renderer.joystick) {
            this.renderer.joystick.reset();
          }
          // Check if the game is running in multiplayer online mode
          if (this.isOnlineMode && this.network && this.network.isConnected) {
            console.log(
              "🚀 'R' Key Pressed: Sending Bowler Position Reset:",
              bowler.currentHipPosition.x,
            );
            this.network.sendBowlerPosition(
              this.networkTickNumber,
              bowler.currentHipPosition.x,
            );
          }

          const initialPose = bowler.getProceduralUpperBodyPose(Math.PI);
          bowler.applyKeyframePose(initialPose, BOWLER_START_X);

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
        }
      }
    });

    // Tab Visibility Change handler: Reset clock on tab focus to prevent dt spike
    document.addEventListener("visibilitychange", () => {
      // Check condition: !document.hidden
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
    while (
      this.physicsAccumulator >= this.FIXED_DT &&
      steps < this.MAX_PHYSICS_STEPS
    ) {
      this.update(this.FIXED_DT); // Physics HAMESHA exact 1/60 dt ke saath
      this.physicsAccumulator -= this.FIXED_DT;
      steps++;
    }
    // Check condition: steps === this.MAX_PHYSICS_STEPS
    if (steps === this.MAX_PHYSICS_STEPS) {
      // Slow machine guard: backlog phenko, warna spiral of death (freeze) ho jata
      this.physicsAccumulator = 0;
    }

    // Interpolation factor: physics steps ke beech ke display frames me
    // prevPos↔pos blend ka hisaab (144Hz par ball smooth slide karegi)
    this.renderAlpha = Math.min(1, this.physicsAccumulator / this.FIXED_DT);

    // CCD sweep = miss khatam.
    this.render();
    requestAnimationFrame(this.loop);
  };

  private updateRemoteBatPose(frameDt: number) {
    if (!this.isOnlineMode || !this.network) return;

    const queue = this.bat.joystickQueue;
    if (queue.isEmpty()) return;

    // Use playheadDelayMs (RTT/2) as the Jitter Buffer duration
    // This dynamically adjusts based on network latency
    const delayMs = this.bat.playheadDelayMs || 50.0; 
    const now = performance.now();

    // 1. Jitter Buffer Fill Phase: 
    // Wait until the oldest packet has aged by delayMs before starting playback.
    // This ensures we always have a few packets (2-3) queued up before starting.
    const oldest = queue.peek();
    if (oldest && (now - oldest.receivedTime) < delayMs) {
        return; // Buffer is filling, hold the bat steady
    }

    // 2. Playback Phase: Dequeue the aged packet
    let snap = queue.dequeue();
    
    // If multiple packets have aged past the delay (e.g., network spike delivered a bunch at once), 
    // fast-forward by dequeuing them to catch up to the correct present-delayed time.
    while (!queue.isEmpty()) {
        const next = queue.peek();
        if (next && (now - next.receivedTime) > delayMs) {
            snap = queue.dequeue(); // Catch up
        } else {
            break;
        }
    }

    // 3. Apply the delayed, jitter-buffered pose
    if (snap) {
        // Apply the mouse position to the bat with exact physics dt
        this.bat.setBatPoseFromMouse(snap.mouseX, snap.mouseY, frameDt);
    }
  }

  private startBowlerDelivery(): void {
    const bowler = this.renderer.bowler;
    bowler.resetToIdle();
    bowler.currentHipPosition.x = BOWLER_WICKET_X+150;
    bowler.startRunning();

    const minSpeed = 3000;
    const maxSpeed = 3500;
    this.currentDeliverySpeed =
      minSpeed + Math.random() * (maxSpeed - minSpeed);

    const minAnimSpeed = 450;
    const maxAnimSpeed = 750;
    const speedRatio = (this.currentDeliverySpeed - minSpeed) / (maxSpeed - minSpeed);
    this.currentAnimationSpeed = minAnimSpeed + speedRatio * (maxAnimSpeed - minAnimSpeed);

    const minAngle = 8;
    const maxAngle = 25;
    
    // Slow ball (ratio 0) -> More offset (lofted). Fast ball (ratio 1) -> Less offset (flat).
    const calculatedAngleOffset = maxAngle - speedRatio * (maxAngle - minAngle);
    // Add small random noise for variety
    const noise = (Math.random() - 0.5) * 4.0; 
    const randomAngleOffset = Math.max(minAngle, Math.min(maxAngle, calculatedAngleOffset + noise));
    
    this.currentDeliveryAngle = 180 - randomAngleOffset;

    const angleRatio = (randomAngleOffset - minAngle) / (maxAngle - minAngle);
    const releaseKeyframe = 540.0 + angleRatio * 20.0;
    this.targetReleasePhase = releaseKeyframe / Bowler.PRE_DELIVERY_JUMP.length;


    this.ball.isHeldInHand = true;
    this.ball.isActive = true;
    this.ball.pos.x = bowler.leftWrist.x;
    this.ball.pos.y = bowler.leftWrist.y;
    this.ball.prevPos.x = bowler.leftWrist.x;
    this.ball.prevPos.y = bowler.leftWrist.y;
    this.offlineResetTimer = 0;
  }

  private resetPerBallState(): void {
    this.localPredictedHit = false;
    this.suppressNextPacketSound = false;
    this.hasAuthoritativeResult = false;
    this.hasSentReleasePacket = false;
    this.hitPacketCooldownTimer = 0;
    this.hasLocalPredictedRelease = false;
    this.batPoseQueue = [];
    this.batInterpTick = 0;
    // 🎯 Reconciliation + dedup state bhi reset karo — naya ball = clean slate.
    // Kyun: agar purane ball ka blend-offset/lastHitTick agle ball me carry-over hua,
    // to naya ball galat position offset se start hogi / pehla HIT_RESULT dedup ho sakta hai.
    this.lastHitResultTick = -1;
    this.reconcileBlendTicksRemaining = 0;
    this.reconcileOffsetX = 0;
    this.reconcileOffsetY = 0;
    // 🎯 RACE-FIX: local-flight tick counter bhi naye ball par zero karo
    this.ticksSinceLocalPredictedHit = 0;
    // Check condition: this.ball
    if (this.ball) {
      this.ball.hasBeenHit = false;
    }
    // Check condition: this.renderer && this.renderer.bowler
    if (this.renderer && this.renderer.bowler) {
      this.renderer.bowler.pendingVisualThrow = null;
      this.renderer.bowler.releaseDelayTimer = 0;
    }
  }


  private getOneWayTicks(): number {
    const rttMs =
      this.isOnlineMode && this.network ? this.network.getRTT() : 40.0;
    return Math.max(1, Math.round((rttMs * 0.5) / 16.67));
  }

  private getProjectileStateWithBounce(
    initialX: number,
    initialY: number,
    initialVx: number,
    initialVy: number,
    t: number,
  ) {
    let currX = initialX;
    let currY = initialY;
    let currVx = initialVx;
    let currVy = initialVy;

    const targetY = CANVAS_HEIGHT - GROUND_HEIGHT - this.ball.radius;

    const totalTicks = Math.max(0, t); // t = kitne 60Hz ticks aage fast-forward karna hai
    const SUB_STEPS = 10;
    const subDt = 1 / 60 / SUB_STEPS;

    for (let tick = 0; tick < totalTicks; tick++) {
      for (let step = 0; step < SUB_STEPS; step++) {
        const stepPrevX = currX;
        const stepPrevY = currY;

        // Aerodynamic Quadratic Air Drag (same as Ball.ts)
        const speed = Math.hypot(currVx, currVy);
        const dragForceX = -AIR_DRAG_COEFF * speed * currVx;
        const dragForceY = -AIR_DRAG_COEFF * speed * currVy;

        currVx += dragForceX * subDt;
        currVy += (GRAVITY + dragForceY) * subDt;

        const nextX = currX + currVx * subDt;
        const nextY = currY + currVy * subDt;

        // Continuous Collision Check against ground (exact fractional intersection, same as Ball.ts)
        if (stepPrevY < targetY && nextY >= targetY) {
          const f = Math.min(
            1.0,
            Math.max(
              0.0,
              (targetY - stepPrevY) / Math.max(0.001, nextY - stepPrevY),
            ),
          );
          currX = stepPrevX + f * (nextX - stepPrevX);
          currY = targetY;
          currVy = -Math.abs(currVy) * RESTITUTION_GROUND;
          currVx *= FRICTION_GROUND;
          // Check condition: Math.abs(currVy
          if (Math.abs(currVy) < 20) currVy = 0;
          const remainingSubDt = subDt * (1.0 - f);
          currX += currVx * remainingSubDt;
          currY += currVy * remainingSubDt;
        } else {
          currX = nextX;
          currY = nextY;
          // Check condition: currY >= targetY
          if (currY >= targetY) {
            currY = targetY;
            // Check condition: currVy > 0
            if (currVy > 0) currVy = -currVy * RESTITUTION_GROUND;
          }
        }
      }
    }

    return {
      finalX: currX,
      finalY: currY,
      finalVx: currVx,
      finalVy: currVy,
    };
  }
  private update(dt: number) {
    // ⏱️ Global 60Hz Network Tick Timer (Runs for all Modes)
    this.networkTimer += dt;
    let isTickAdvanced = false;
    // Check condition: this.networkTimer >= this.NETWORK_INT...
    if (this.networkTimer >= this.NETWORK_INTERVAL) {
      this.networkTimer -= this.NETWORK_INTERVAL;
      this.networkTickNumber++;
      isTickAdvanced = true;
    }
  
    

    this.updateRemoteBatPose(dt);

    // Check condition: this.renderer.gameMode === "BATTING"
    if (this.renderer.gameMode === "BATTING") {
      const currentCommand = this.input.getHistory().peek();
      // Check if the game is running in multiplayer online mode
      if (!this.isOnlineMode && currentCommand === null) {
        console.log("No mouse history available to update bat.");
        return;
      }
      this.bat.update(this.input.mouseX, this.input.mouseY, dt, this.input);

      // 🏃 Bowler & Ball Attachment / Release logic in BATTING Mode
        const bowler = this.renderer.bowler;


        // =========================================================
        // 🏏 EVENT TIMERS & NETWORK QUEUE PROCESSING
        // =========================================================

        // 🏃 1. Pending Runup Countdown
        if (bowler.pendingRunupDelaySec > 0) {
            bowler.pendingRunupDelaySec -= dt;
            // Check condition: bowler.pendingRunupDelaySec <= 0
            if (bowler.pendingRunupDelaySec <= 0) {
                console.log("🟢 Opponent Bowler started running ");
                bowler.pendingRunupDelaySec = 0;
                this.ball.isHeldInHand = true;
                this.ball.isActive = true;
                this.hasLocalPredictedRelease = false;
                bowler.ballTrailPoints = [];
                bowler.startRunning();
            }
        }

        // 🤾 2. Pending Gather Countdown
        if (bowler.pendingGatherDelaySec > 0) {
            bowler.pendingGatherDelaySec -= dt;
            // Check condition: bowler.pendingGatherDelaySec <= 0 && ...
            if (bowler.pendingGatherDelaySec <= 0 && bowler.pendingGatherClickX !== null) {
                console.log("🟢 Opponent Bowler started gathering");
                bowler.pendingGatherDelaySec = 0;
                const clickX = bowler.pendingGatherClickX;
                bowler.pendingGatherClickX = null;

                const targetX = clickX - this.preJumpDistance;
                bowler.startJumpX = Math.max(BOWLER_WICKET_X, targetX);
                bowler.gatheringStartX = clickX;
                bowler.gatheringTargetX = bowler.startJumpX;
                bowler.isGatheringArmActive = true;
                bowler.gatheringAngleTraveledDeg = 0.0;
                bowler.accumulatedJoystickAngleDeg = 0.0;
                bowler.maxObservedOmegaRad = 0.0;
                bowler.prevLeftWristY = 0.0;
                bowler.lastReceivedJoystickTick = -1;
                bowler.targetNetworkJoystickAngleRad = null;
                bowler.targetNetworkJoystickRadiusRatio = 1.0;
                bowler.debugReconciliationPoint = null;
                bowler.localReleaseTrailIndex = 0;
                bowler.ballTrailPoints = [];
            }
        }
                // 🎯 3. Network Joystick Queue Draining (1-by-1 processing)
        if (
          bowler.isGatheringArmActive || 
          bowler.isExecutingJump || 
          bowler.isPreJumpTransitioning || 
          bowler.isPreJumpFrozen
        ) {
            console.log("dequeueing joystick packet for bowler");
            // Sirf ek packet nikalenge (no while loop)
            const latestSnap = bowler.joystickQueue.dequeue();
            
            if (latestSnap) {
                this.renderer.joystick.updateKnobPosition(latestSnap.screenX, latestSnap.screenY);
                bowler.targetNetworkJoystickAngleRad = this.renderer.joystick.angleRad;
                bowler.targetNetworkJoystickRadiusRatio = this.renderer.joystick.distanceRatio;
            }
        }
        // =========================================================
      // Dynamic End-to-End Playhead Delay Buffer (Clamped strictly between 25ms and 75ms)
      const endToEndRTT = this.network && this.network.isConnected ? this.network.getRTT() : 50.0;
      const oneWayDelayMs   = endToEndRTT * 0.5;
      const MAX_ALLOWED_DELAY_MS = 60.0;
      const MIN_ALLOWED_DELAY_MS = 15.0;
      bowler.playheadDelayMs = Math.min(MAX_ALLOWED_DELAY_MS, Math.max(MIN_ALLOWED_DELAY_MS, oneWayDelayMs));
      this.bat.playheadDelayMs = bowler.playheadDelayMs;

      // 🌐 Batter Screen Input-Driven Spring-Damper Physics Replication & Dead-Reckoning Extrapolation
      if (this.isOnlineMode && bowler.targetNetworkJoystickAngleRad !== null) {
        // Check if the ball has been released from the bowler's hand
        if (bowler.isBallReleased || this.hasLocalPredictedRelease) {
          // 🟢 POST-RELEASE AUTOMATIC FOLLOW-THROUGH PHASE: Detach user mouse input (Identical to Bowler screen)
          if (bowler.postReleaseDelaySec > 0) {
            bowler.postReleaseDelaySec -= dt;
            bowler.smoothJoystickAngleRad += bowler.joystickAngularVelRad * dt;
          } else {
            const frictionDecay = Math.pow(0.96, dt * 60);
            bowler.joystickAngularVelRad *= frictionDecay;
            bowler.smoothJoystickAngleRad += bowler.joystickAngularVelRad * dt;
          }
        } else {
          // 🏋️ PRE-RELEASE USER CONTROLLED PHASE: Input-Driven Spring-Damper Physics
          const now = performance.now();
          const timeSinceLastUDP = now - bowler.lastReceivedPacketTime;

          // 🛡️ Dead-Reckoning Extrapolation if UDP packet is delayed > 22ms
          if (bowler.lastReceivedPacketTime > 0 && timeSinceLastUDP > 22.0) {
            bowler.isExtrapolating = true;
            bowler.smoothJoystickAngleRad += bowler.joystickAngularVelRad * dt;
            bowler.joystickAngularVelRad *= Math.pow(0.98, dt * 60);
          } else {
            bowler.isExtrapolating = false;
            const rawTargetRad = bowler.targetNetworkJoystickAngleRad;
            const targetRadiusRatio = bowler.targetNetworkJoystickRadiusRatio;

            let angleDiffRad = rawTargetRad - bowler.smoothJoystickAngleRad;
            while (angleDiffRad > Math.PI) angleDiffRad -= Math.PI * 2;
            while (angleDiffRad < -Math.PI) angleDiffRad += Math.PI * 2;

            const springForceAngle =
              angleDiffRad * bowler.JOYSTICK_ANGLE_STIFFNESS;
            const dampingForceAngle =
              -bowler.joystickAngularVelRad * bowler.JOYSTICK_ANGLE_DAMPING;
            bowler.joystickAngularVelRad +=
              (springForceAngle + dampingForceAngle) * dt;
            bowler.smoothJoystickAngleRad += bowler.joystickAngularVelRad * dt;

            const radiusDiff =
              targetRadiusRatio - bowler.smoothJoystickRadiusRatio;
            const springForceRadius =
              radiusDiff * bowler.JOYSTICK_RADIUS_STIFFNESS;
            const dampingForceRadius =
              -bowler.joystickRadiusVelRatio * bowler.JOYSTICK_RADIUS_DAMPING;
            bowler.joystickRadiusVelRatio +=
              (springForceRadius + dampingForceRadius) * dt;
            bowler.smoothJoystickRadiusRatio +=
              bowler.joystickRadiusVelRatio * dt;
          }
        }

        const currentOmega = Math.abs(bowler.joystickAngularVelRad);
        // Check condition: currentOmega > bowler.maxObservedOmeg...
        if (currentOmega > bowler.maxObservedOmegaRad) {
          bowler.maxObservedOmegaRad = currentOmega;
        }

        // 🎯 CRITICAL BUGFIX: Only accumulate jump progress angle during JUMP phase!
        if (bowler.isExecutingJump || bowler.isPreJumpTransitioning) {
          // Check condition: bowler.lastJoystickAngleRad !== null
          if (bowler.lastJoystickAngleRad !== null) {
            let deltaRad =
              bowler.smoothJoystickAngleRad - bowler.lastJoystickAngleRad;
            while (deltaRad > Math.PI) deltaRad -= Math.PI * 2;
            while (deltaRad < -Math.PI) deltaRad += Math.PI * 2;
            let deltaDeg = (deltaRad * 180) / Math.PI;
            bowler.accumulatedJoystickAngleDeg += Math.abs(deltaDeg);
          }
        }
        bowler.lastJoystickAngleRad = bowler.smoothJoystickAngleRad;
      }

      // Check game state condition
      if (
        bowler.isRunning &&
        !bowler.isExecutingJump &&
        !bowler.isPreJumpTransitioning &&
        !bowler.isPreJumpFrozen &&
        !bowler.isCycleCompleted
      ) {
        bowler.update(dt);
      }
      // Check if bowler is currently executing the jump animation
      if (bowler.isExecutingJump || bowler.isPreJumpTransitioning) {
        // Check if the game is running in multiplayer online mode
        if (!this.isOnlineMode) {
          bowler.accumulatedJoystickAngleDeg += this.currentAnimationSpeed * dt;
        }
        const totalJumpFrames = Bowler.PRE_DELIVERY_JUMP.length;
        const decimalFrameIndex = Math.min(
          totalJumpFrames - 1,
          Math.max(0.0, bowler.accumulatedJoystickAngleDeg)
        );
        const interpolatedPose =
          bowler.interpolatePoseAtDecimalFrame(decimalFrameIndex);

        const currDisplacementX = interpolatedPose.displacementX ?? -20.0;
        const manualStepX = Math.max(
          0,
          -(currDisplacementX - bowler.lastInterpolatedDisplacementX),
        );
        bowler.lastInterpolatedDisplacementX = currDisplacementX;

        const fadeLimitFrames = totalJumpFrames / 2.5;
        const decayRatio = Math.max(
          0,
          1.0 - decimalFrameIndex / fadeLimitFrames,
        );
        const transferFactor = bowler.momentumTransferFactor ?? 0.5;
        const runupStepX =
          bowler.initialRunupSpeedX * transferFactor * dt * decayRatio;

        const effectiveStepX = Math.max(runupStepX, manualStepX);
        bowler.accumulatedDisplacementX += effectiveStepX;

        const effectiveHipX =
          bowler.preJumpStartX - bowler.accumulatedDisplacementX;
        bowler.currentHipPosition.x = effectiveHipX;
        bowler.applyKeyframePose(interpolatedPose, effectiveHipX);

        // IK override removed as per user request to let arm follow frames
        // if (this.isOnlineMode) { ... overrideLeftArmWithIK ... }

        const isFollowThroughFinished =
          bowler.isBallReleased && bowler.postReleaseDelaySec <= 0;
        // Check condition: decimalFrameIndex >= totalJumpFrames - 1 || isFollowThro...
        if (decimalFrameIndex >= totalJumpFrames - 1 || isFollowThroughFinished) {
          bowler.isCycleCompleted = true;
        }
      }
      // Check condition: bowler.isCycleCompleted
      else if (bowler.isCycleCompleted) {
        const totalJumpFrames = Bowler.PRE_DELIVERY_JUMP.length;
        const lastPose = Bowler.PRE_DELIVERY_JUMP[totalJumpFrames - 1];
        const effectiveHipX =
          bowler.preJumpStartX - bowler.accumulatedDisplacementX;
        bowler.currentHipPosition.x = effectiveHipX;
        bowler.applyKeyframePose(lastPose, effectiveHipX);
        bowler.isRunning = false;
        bowler.isExecutingJump = false;
        bowler.isPreJumpTransitioning = false;
        bowler.isPreJumpFrozen = false;
      }
      // Check if bowler's arm gathering phase is active
      else if (bowler.isGatheringArmActive) {
        // 🟢 IK override removed to let arm follow natural animation frames
      }
      // 🎯 Batter Screen par Red Line (startJumpX) reach hote hi Jump Stance Physics me switch karo!
          if (
        bowler.isRunning &&
        bowler.startJumpX &&
        bowler.currentHipPosition.x <= bowler.startJumpX &&
        !bowler.isPreJumpTransitioning &&
        !bowler.isExecutingJump
      ) {
        bowler.isGatheringArmActive = false;
        bowler.preJumpStartX = bowler.currentHipPosition.x;
        bowler.initialRunupSpeedX =
          bowler.lastRunupSpeedX > 0 ? bowler.lastRunupSpeedX : 800.0;
        bowler.lastInterpolatedDisplacementX =
          Bowler.PRE_DELIVERY_JUMP[0].displacementX ?? -20.0;
        bowler.accumulatedDisplacementX = Math.abs(
          bowler.lastInterpolatedDisplacementX,
        );
        bowler.isExecutingJump = true;
        bowler.triggerPreJump();

        const joystickRad = this.renderer.joystick
          ? this.renderer.joystick.angleRad
          : Math.PI;
        
        let currentJoystickDeg = (joystickRad * 180) / Math.PI;
        currentJoystickDeg = (currentJoystickDeg + 360) % 360; // Normalize 0-360
        
        // 6 o'clock (90 deg) should map to 0 (Frame 0)
        let mappedAngle = currentJoystickDeg - 90.0;
        if (mappedAngle < 0) mappedAngle += 360.0;

        bowler.targetInitialAngleDeg = mappedAngle;
        bowler.accumulatedJoystickAngleDeg = 0.0;
        bowler.isInitialAngleTransitioning = true;
        
        // Capture the running pose right before we jump, so we don't teleport the legs!
        bowler.initialTransitionStartPose = bowler.lastPoseSnapshot 
            ? { ...bowler.lastPoseSnapshot } 
            : { ...Bowler.STATIC_FRAMES[0] };
        
        bowler.smoothJoystickAngleRad = joystickRad;
        bowler.joystickAngularVelRad = 0.0;
        bowler.lastJoystickAngleRad = joystickRad;
      }

      // Check game state condition
      if (
        this.ball.isHeldInHand &&
        bowler &&
        !bowler.isBallReleased
      ) {
        const prevWristY =
          bowler.prevLeftWristY > 0
            ? bowler.prevLeftWristY
            : bowler.leftWrist.y;
        bowler.prevLeftWristY = bowler.leftWrist.y;

        this.ball.pos.x = bowler.leftWrist.x;
        this.ball.pos.y = bowler.leftWrist.y;
        
        this.ball.prevPos.x = bowler.leftWrist.x;
        this.ball.prevPos.y = bowler.leftWrist.y;
        this.ball.isActive = true;

        // ⚡ ONLINE MODE LOCAL PREDICTIVE BALL RELEASE (Exact Bowler Release Physics)
        if (
          this.isOnlineMode &&
          !this.hasLocalPredictedRelease &&
          bowler.isExecutingJump
        ) {
          const totalJumpFrames = Bowler.PRE_DELIVERY_JUMP.length;
          const currentFrame = Math.min(
            totalJumpFrames - 1,
            Math.max(0.0, bowler.accumulatedJoystickAngleDeg)
          );

          // Frame 63 to 66: Top release arc par local prediction launch (Identical Trigger Condition as Bowler)
          if (currentFrame >= JUMP_RELEASE_FRAME_MIN) {
            let releaseTriggered = false;

            // 🚀 1. Track Peak Angular Velocity during active arm swing
            const currentOmega = Math.abs(bowler.joystickAngularVelRad);
            // Check condition: currentOmega > bowler.maxObservedOmeg...
            if (currentOmega > bowler.maxObservedOmegaRad) {
              bowler.maxObservedOmegaRad = currentOmega;
            }

            // 🚀 2. Check Significant Deceleration Trigger (High Swing Speed + Speed Drop in Top Arc)
            if (
              bowler.maxObservedOmegaRad >= DECEL_MIN_SWING_SPEED &&
              currentOmega <=
                bowler.maxObservedOmegaRad * (1.0 - DECEL_DROP_RATIO)
            ) {
              let normAngle = bowler.smoothJoystickAngleRad % (Math.PI * 2);
              // Check condition: normAngle < 0
              if (normAngle < 0) normAngle += Math.PI * 2;
              // Check condition: normAngle >= 3.7 && normAngle <= 5.4
              if (normAngle >= 3.7 && normAngle <= 5.4) {
                releaseTriggered = true;
              }
            }

            // 🚀 3. Max Frame Boundary (Frame 66 out of 71): Force release if reached without earlier deceleration
            if (!releaseTriggered && currentFrame >= JUMP_RELEASE_FRAME_MAX) {
              releaseTriggered = true;
            }

            // Check condition: releaseTriggered
            if (releaseTriggered) {
              const releaseX = bowler.leftWrist.x;
              const releaseY = bowler.leftWrist.y;

              // 📐 Exact 100% Bowler Screen Release Velocity Math
              const sign = bowler.joystickAngularVelRad >= 0 ? 1 : -1;
              const peakOmega = Math.max(
                Math.abs(bowler.joystickAngularVelRad),
                bowler.maxObservedOmegaRad,
              );
              const releaseOmega = peakOmega * sign;

              const totalArmLen =
                bowler.FRONT_UPPER_ARM + bowler.FRONT_LOWER_ARM;
              const minReach =
                Math.abs(bowler.FRONT_UPPER_ARM - bowler.FRONT_LOWER_ARM) + 5;
              const armR =
                minReach +
                (totalArmLen - minReach - 1.0) *
                  bowler.smoothJoystickRadiusRatio;
              const theta = bowler.smoothJoystickAngleRad;

              const vArmX = -armR * Math.sin(theta) * releaseOmega;
              const dt = 1 / 60;
              const vWristY = (releaseY - prevWristY) / dt;
              const polarVArmY = armR * Math.cos(theta) * releaseOmega;
              const vArmY =
                Math.abs(releaseOmega) > 0.5
                  ? polarVArmY * 0.5 + vWristY * 0.5
                  : vWristY;

              let vBodyX = -Math.abs(
                bowler.lastRunupSpeedX > 0 ? bowler.lastRunupSpeedX : 800.0,
              );
              vBodyX = -Math.abs(vBodyX * 1.5);

              const vReleaseX = -Math.abs(vBodyX + vArmX);
              const vReleaseY = vArmY;

              this.ball.throwBallWithVelocity(
                releaseX,
                releaseY,
                vReleaseX,
                vReleaseY,
              );

              this.hasLocalPredictedRelease = true;
              this.localReleaseTick = this.networkTickNumber;
              bowler.localReleaseTrailIndex = bowler.ballTrailPoints.length;
              console.log(
                "⚡ Batter Local Predicted Release (Exact Trigger + Formula) at Frame:",
                currentFrame.toFixed(1),
                "Tick:",
                this.localReleaseTick,
                "Vel:",
                vReleaseX,
                vReleaseY,
              );
            }
          }
        }

        // Exact ff7a366 Offline Batting Mode Behavior
        if (!this.isOnlineMode) {
          // 1. Auto pre-jump trigger as bowler enters screen at 1.2 * CANVAS_WIDTH (1920px)
          if (
            bowler.isRunning &&
            bowler.currentHipPosition.x <= 1.05 * CANVAS_WIDTH &&
            !bowler.isPreJumpTransitioning &&
            !bowler.isExecutingJump
          ) {
            bowler.triggerPreJump();
          }

          // 2. Release ball dynamically at targetReleasePhase (Keyframe 37-38)
          if (
            (bowler.isExecutingJump || bowler.isPreJumpTransitioning) &&
            !bowler.hasReleasedBall
          ) {
            const progressRatio = Math.min(
              1.0,
              Math.max(0.0, bowler.accumulatedJoystickAngleDeg / (Bowler.PRE_DELIVERY_JUMP.length - 1)),
            );
            bowler.jumpPhase = progressRatio;

            // Check condition: bowler.jumpPhase >= (this.targetRelea...
            if (bowler.jumpPhase >= (this.targetReleasePhase || 0.53)) {
              bowler.hasReleasedBall = true;
              bowler.isBallReleased = true;
              this.ball.isHeldInHand = false;

              this.renderer.wicket.reset();
              this.ball.throwBall(
                bowler.leftWrist.x,
                bowler.leftWrist.y,
                this.currentDeliverySpeed,
                this.currentDeliveryAngle,
              );
              console.log(
                `🚀 Offline Bowler Released Ball! Speed: ${this.currentDeliverySpeed.toFixed(0)} px/s, Angle: ${this.currentDeliveryAngle.toFixed(1)}°`
              );
              bowler.lastReleaseSpeed = this.currentDeliverySpeed;
              bowler.lastReleaseAngleDeg = this.currentDeliveryAngle;
            }
          }
        }
      }

      // 🔴 BATTER SCREEN FORCE NORMAL SPEED:
      // Time dilation is only used on the Bowler's screen to mask latency.
      if (this.renderer.gameMode === "BATTING") {
          this.ball.timeDilationFactor = 1.0;
      }
      this.ball.update(dt);
      this.renderer.wicket.update(dt);

      // 🔴 Record Ball Trail Points for smooth trajectory rendering on Batter Screen
      if (
        bowler.isGatheringArmActive ||
        bowler.isExecutingJump ||
        bowler.isPreJumpTransitioning ||
        bowler.isPreJumpFrozen ||
        bowler.isCycleCompleted ||
        bowler.isBallReleased ||
        this.hasLocalPredictedRelease
      ) {
        const pts = bowler.ballTrailPoints;
        const currX = this.ball.pos.x;
        const currY = this.ball.pos.y;
        // Check condition: pts.length > 0
        if (pts.length > 0) {
          const lastPt = pts[pts.length - 1];
          const dist = Math.hypot(currX - lastPt.x, currY - lastPt.y);
          // Check condition: dist > 6
          if (dist > 6) {
            const steps = Math.min(10, Math.ceil(dist / 3));
            for (let s = 1; s < steps; s++) {
              const ratio = s / steps;
              pts.push({
                x: lastPt.x + (currX - lastPt.x) * ratio,
                y: lastPt.y + (currY - lastPt.y) * ratio,
              });
            }
          }
        }
        pts.push({ x: currX, y: currY });
      }

      // Check game state condition
      if (
        isTickAdvanced &&
        this.isOnlineMode &&
        this.network &&
        this.network.isConnected
      ) {
        this.network.sendBatSwingUDP(
          this.networkTickNumber,
          this.input.mouseX,
          this.input.mouseY,
          0,
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
      if (this.hitPacketCooldownTimer > 0) {
        this.hitPacketCooldownTimer -= dt;
      }

      const batHitResult = this.bat.checkHit(this.ball, dt);

      // Check game state condition
      if (
        batHitResult.hit &&
        !this.ball.isStuck &&
        this.hitPacketCooldownTimer <= 0 &&
        this.isOnlineMode &&
        this.network &&
        this.network.isConnected
      ) {
        this.hitPacketCooldownTimer = 0.4; // ⏱️ 400ms Cooldown: Prevents duplicate consecutive frame packets on the same hit!
        const si = this.bat.lastSoundImpact;
        this.network.sendHitResult(
          this.networkTickNumber,
          this.ball.pos.x,
          this.ball.pos.y,
          this.ball.vel.x,
          this.ball.vel.y,
          si?.speed ?? 1000, // fallback: threshold-ke-paas default
          si?.offset ?? 100, // fallback: mid-blade
        );
        console.log(
          "🚀 Batter Sent HIT_RESULT Packet (400ms Cooldown) at Tick:",
          this.networkTickNumber,
        );
      }
      this.renderer.wicket.checkHit(
        this.ball,
        batHitResult.hit,
        batHitResult.hitSubStep,
      );
    }
    // Check condition: (this.renderer.gameMode as any
    else if ((this.renderer.gameMode as any) === "NEW_BOWLER") {
      const bowler = this.renderer.bowler;

    //   if (
    //     isTickAdvanced &&
    //     this.isOnlineMode &&
    //     this.network &&
    //     this.network.isConnected
    //   ) {
    //     if (
    //       !bowler.isBallReleased &&
    //       (bowler.isGatheringArmActive ||
    //         bowler.isExecutingJump ||
    //         bowler.isRunning)
    //     ) {
    //       const joystick = this.renderer.joystick;
    //       const rawTargetRad = joystick.angleRad;
    //       const targetRadiusRatio =
    //         joystick.distanceRatio > 0.05 ? joystick.distanceRatio : 1.0;
    //       this.network.sendBowlerJoystickUDP(
    //         this.networkTickNumber,
    //         rawTargetRad,
    //         targetRadiusRatio,
    //       );
    //     }
    //   }

      // 🏃 A/D or Arrow keys move bowler character Left / Right when idle
      if (
        !bowler.isRunning &&
        !bowler.isExecutingJump &&
        !bowler.isPreJumpTransitioning
      ) {
        const moveSpeed = 500; // Smooth 180 px/sec movement speed
        let moved = false;
        // Check game state condition
        if (
          this.input.isKeyPressed("a") ||
          this.input.isKeyPressed("KeyA") ||
          this.input.isKeyPressed("ArrowLeft")
        ) {
          bowler.currentHipPosition.x -= moveSpeed * dt;
          bowler.preJumpStartX = bowler.currentHipPosition.x;
          moved = true;
        }
        // Check game state condition
        if (
          this.input.isKeyPressed("d") ||
          this.input.isKeyPressed("KeyD") ||
          this.input.isKeyPressed("ArrowRight")
        ) {
          bowler.currentHipPosition.x += moveSpeed * dt;
          bowler.preJumpStartX = bowler.currentHipPosition.x;
          moved = true;
        }
        // Check condition: moved
        if (moved) {
          bowler.setInitialRunPose();
          // Check if the game is running in multiplayer online mode
          if (this.isOnlineMode && this.network && this.network.isConnected) {
            this.network.sendBowlerPosition(
              this.networkTickNumber,
              bowler.currentHipPosition.x,
            );
          }
        }
      }

      // 🟢 AUTOMATIC RUN-UP PHASE (Space Key): Native 400+ frame leg & body runup animation
      if (
        bowler.isRunning &&
        !bowler.isExecutingJump &&
        !bowler.isPreJumpTransitioning &&
        !bowler.isPreJumpFrozen &&
        !bowler.isCycleCompleted
      ) {
        bowler.update(dt);

        // 🎯 High Drag Resistance Bowling Arm Control during Gathering Phase (Left Click to startJumpX)
        if (bowler.isGatheringArmActive) {
          const joystick = this.renderer.joystick;
          const rawJoystickRad = joystick.angleRad;

          // Check condition: bowler.lastJoystickAngleRad === null
          if (bowler.lastJoystickAngleRad === null) {
            bowler.smoothJoystickAngleRad = rawJoystickRad;
            bowler.joystickAngularVelRad = 0.0;
          }

          // 🏋️ Angle & Radius Physical Resistance Drag during Gathering Phase
          let angleDiffRad = rawJoystickRad - bowler.smoothJoystickAngleRad;
          while (angleDiffRad > Math.PI) angleDiffRad -= Math.PI * 2;
          while (angleDiffRad < -Math.PI) angleDiffRad += Math.PI * 2;

          const springForceAngle =
            angleDiffRad * bowler.GATHERING_ANGLE_STIFFNESS;
          const dampingForceAngle =
            -bowler.joystickAngularVelRad * bowler.GATHERING_ANGLE_DAMPING;
          bowler.joystickAngularVelRad +=
            (springForceAngle + dampingForceAngle) * dt;
          bowler.smoothJoystickAngleRad += bowler.joystickAngularVelRad * dt;

          // Radius Spring-Damper Simulation (Resistance when changing arm reach)
          const targetRadiusRatio =
            joystick.distanceRatio > 0.05 ? joystick.distanceRatio : 1.0;
          const radiusDiff =
            targetRadiusRatio - bowler.smoothJoystickRadiusRatio;
          const springForceRadius =
            radiusDiff * bowler.GATHERING_RADIUS_STIFFNESS;
          const dampingForceRadius =
            -bowler.joystickRadiusVelRatio * bowler.GATHERING_RADIUS_DAMPING;
          bowler.joystickRadiusVelRatio +=
            (springForceRadius + dampingForceRadius) * dt;
          bowler.smoothJoystickRadiusRatio +=
            bowler.joystickRadiusVelRatio * dt;

          this.currentArmAngleRad = bowler.smoothJoystickAngleRad;

          // IK override removed as per user request to let arm follow frames
          bowler.lastJoystickAngleRad = bowler.smoothJoystickAngleRad;
        }
      }
      // 🟢 MANUAL JUMP & DELIVERY PHASE (Option 2: Dynamic Progress Ratio & Sub-frame Interpolation)
      else {
        const joystick = this.renderer.joystick;
        const rawJoystickRad = joystick.angleRad;

        // Check condition: bowler.lastJoystickAngleRad === null
        if (bowler.lastJoystickAngleRad === null) {
          bowler.smoothJoystickAngleRad = rawJoystickRad;
          bowler.joystickAngularVelRad = 0.0;
        }

        // 🏃 Angle & Follow-Through Physics Simulation
        if (bowler.isBallReleased) {
          // Check condition: bowler.postReleaseDelaySec > 0
          if (bowler.postReleaseDelaySec > 0) {
            // ⏳ POST-RELEASE GRACE PERIOD: Allow ball to clear hand completely before follow-through engages
            bowler.postReleaseDelaySec -= dt;
            bowler.smoothJoystickAngleRad += bowler.joystickAngularVelRad * dt;
          } else {
            // 🟢 AUTOMATIC FOLLOW-THROUGH PHASE: Detach user input and maintain release angular velocity
            const frictionDecay = Math.pow(0.96, dt * 60);
            bowler.joystickAngularVelRad *= frictionDecay;
            bowler.smoothJoystickAngleRad += bowler.joystickAngularVelRad * dt;
          }
        } else {
          // 🏋️ USER CONTROLLED PHASE: Angle Spring-Damper Physics
          let angleDiffRad = rawJoystickRad - bowler.smoothJoystickAngleRad;
          while (angleDiffRad > Math.PI) angleDiffRad -= Math.PI * 2;
          while (angleDiffRad < -Math.PI) angleDiffRad += Math.PI * 2;

          const springForceAngle =
            angleDiffRad * bowler.JOYSTICK_ANGLE_STIFFNESS;
          const dampingForceAngle =
            -bowler.joystickAngularVelRad * bowler.JOYSTICK_ANGLE_DAMPING;
          bowler.joystickAngularVelRad +=
            (springForceAngle + dampingForceAngle) * dt;
          bowler.smoothJoystickAngleRad += bowler.joystickAngularVelRad * dt;

          // Radius Spring-Damper Physics Simulation (Resistance when changing arm reach)
          const targetRadiusRatio =
            joystick.distanceRatio > 0.05 ? joystick.distanceRatio : 1.0;
          const radiusDiff =
            targetRadiusRatio - bowler.smoothJoystickRadiusRatio;
          const springForceRadius =
            radiusDiff * bowler.JOYSTICK_RADIUS_STIFFNESS;
          const dampingForceRadius =
            -bowler.joystickRadiusVelRatio * bowler.JOYSTICK_RADIUS_DAMPING;
          bowler.joystickRadiusVelRatio +=
            (springForceRadius + dampingForceRadius) * dt;
          bowler.smoothJoystickRadiusRatio +=
            bowler.joystickRadiusVelRatio * dt;
        }

        this.currentArmAngleRad = bowler.smoothJoystickAngleRad;

        // 🎯 Smooth Catch-Up Interpolation OR Normal Forward Tracking
        let currentJoystickDeg = (bowler.smoothJoystickAngleRad * 180) / Math.PI;
        currentJoystickDeg = (currentJoystickDeg + 360) % 360;
        let currentMappedAngle = currentJoystickDeg - 90.0;
        if (currentMappedAngle < 0) currentMappedAngle += 360.0;
        bowler.targetInitialAngleDeg = currentMappedAngle;

        if (bowler.isInitialAngleTransitioning) {
          const diff = bowler.targetInitialAngleDeg - bowler.accumulatedJoystickAngleDeg;
          
          if (Math.abs(diff) > 1.0) {
            // Constant speed approach (slower and visibly smooth)
            const catchUpSpeed = 360.0; // degrees per second (increased speed)
            const step = catchUpSpeed * dt;
            
            if (Math.abs(diff) <= step) {
                console.log("🏁 Transition Finished! Diff small:", diff);
                bowler.accumulatedJoystickAngleDeg = bowler.targetInitialAngleDeg;
                bowler.isInitialAngleTransitioning = false;
            } else {
                bowler.accumulatedJoystickAngleDeg += Math.sign(diff) * step;
                if (Math.random() < 0.05) console.log("⏳ Transitioning... target:", bowler.targetInitialAngleDeg, "accum:", bowler.accumulatedJoystickAngleDeg, "diff:", diff);
            }
          } else {
            console.log("🏁 Transition Finished! Diff <= 1.0:", diff);
            bowler.accumulatedJoystickAngleDeg = bowler.targetInitialAngleDeg;
            bowler.isInitialAngleTransitioning = false;
          }
        } else {
          // Track accumulated angle movement using the physically smooth simulated angle
          if (bowler.lastJoystickAngleRad !== null) {
            let deltaRad =
              bowler.smoothJoystickAngleRad - bowler.lastJoystickAngleRad;
            while (deltaRad > Math.PI) deltaRad -= Math.PI * 2;
            while (deltaRad < -Math.PI) deltaRad += Math.PI * 2;
  
            let deltaDeg = (deltaRad * 180) / Math.PI;
            bowler.accumulatedJoystickAngleDeg += Math.abs(deltaDeg);
          }
        }
        
        bowler.lastJoystickAngleRad = bowler.smoothJoystickAngleRad;

        // 📐 Option 2 Formula: progressRatio = accumulatedAngle / 370.6
        const totalJumpFrames = Bowler.PRE_DELIVERY_JUMP.length;

        // 🛑 Clamp at Last Frame (Frame 71): Stop follow-through rotation at end of jump animation
        // 🛑 Clamp at Last Frame OR Finish when Ball Released and Follow-Through Slows Down:
        const isFollowThroughFinished =
          bowler.isBallReleased &&
          bowler.postReleaseDelaySec <= 0 &&
          Math.abs(bowler.joystickAngularVelRad) < 0.1;

        // Check game state condition
        if (
          bowler.accumulatedJoystickAngleDeg >= totalJumpFrames - 1 ||
          isFollowThroughFinished
        ) {
          bowler.accumulatedJoystickAngleDeg = Math.min(
            totalJumpFrames - 1,
            bowler.accumulatedJoystickAngleDeg,
          );
          bowler.joystickAngularVelRad = 0.0;
          bowler.isCycleCompleted = true;
        }

        const decimalFrameIndex = Math.min(
          totalJumpFrames - 1,
          Math.max(0.0, bowler.accumulatedJoystickAngleDeg)
        );

        // 60 FPS Sub-frame interpolation for body joints & displacementX
        let interpolatedPose =
          bowler.interpolatePoseAtDecimalFrame(decimalFrameIndex);

        // 🎯 Smoothly blend the entire body from the running pose into the jump pose!
        if (bowler.isInitialAngleTransitioning && bowler.initialTransitionStartPose) {
            let ratio = 1.0;
            if (bowler.targetInitialAngleDeg > 0) {
                ratio = bowler.accumulatedJoystickAngleDeg / bowler.targetInitialAngleDeg;
            }
            ratio = Math.max(0.0, Math.min(1.0, ratio)); // clamp 0 to 1
            interpolatedPose = Bowler.interpolatePose(bowler.initialTransitionStartPose, interpolatedPose, ratio);
        }

        // Check game state condition
        if (
          bowler.isExecutingJump ||
          bowler.isPreJumpTransitioning ||
          bowler.isPreJumpFrozen
        ) {
          // Check game state condition
          if (
            bowler.preJumpStartX === 0 ||
            bowler.preJumpStartX === undefined
          ) {
            bowler.preJumpStartX = bowler.currentHipPosition.x;
          }

          // 🏃 X-Axis Displacement Momentum Transfer: Compare per dt runup momentum vs manual control displacement
          const currDisplacementX = interpolatedPose.displacementX ?? -20.0;
          const manualStepX = Math.max(
            0,
            -(currDisplacementX - bowler.lastInterpolatedDisplacementX),
          );
          bowler.lastInterpolatedDisplacementX = currDisplacementX;

          // Linearly decay scaled runup momentum X displacement over totalJumpFrames / 2.5 frames (~28.4 frames)
          const fadeLimitFrames = totalJumpFrames / 2.5;
          const decayRatio = Math.max(
            0,
            1.0 - decimalFrameIndex / fadeLimitFrames,
          );
          const transferFactor = bowler.momentumTransferFactor ?? 0.5;
          const runupStepX =
            bowler.initialRunupSpeedX * transferFactor * dt * decayRatio;

          // Pick the larger displacement per frame (dt)
          const effectiveStepX = Math.max(runupStepX, manualStepX);
          bowler.accumulatedDisplacementX += effectiveStepX;

          const effectiveHipX =
            bowler.preJumpStartX - bowler.accumulatedDisplacementX;
            
          // Track physical linear momentum
          if (bowler.lastHipPositionX !== null) {
            bowler.currentBodyVelocityX = (effectiveHipX - bowler.lastHipPositionX) / dt;
          }
          bowler.lastHipPositionX = effectiveHipX;
            
          bowler.currentHipPosition.x = effectiveHipX;
          bowler.applyKeyframePose(interpolatedPose, effectiveHipX);

          // Check condition: decimalFrameIndex >= totalJumpFrames - 1
          if (decimalFrameIndex >= totalJumpFrames - 1) {
            bowler.isCycleCompleted = true;
          }
        }
        // Check condition: bowler.isCycleCompleted
        else if (bowler.isCycleCompleted) {
          const lastPose = Bowler.PRE_DELIVERY_JUMP[totalJumpFrames - 1];
          const effectiveHipX =
            bowler.preJumpStartX - bowler.accumulatedDisplacementX;
          bowler.currentHipPosition.x = effectiveHipX;
          bowler.applyKeyframePose(lastPose, effectiveHipX);
          bowler.isRunning = false;
          bowler.isExecutingJump = false;
          bowler.isPreJumpTransitioning = false;
          bowler.isPreJumpFrozen = false;
        } else {
          bowler.applyKeyframePose(
            interpolatedPose,
            bowler.currentHipPosition.x,
          );
        }

        // IK override removed as per user request to let arm follow frames
      }

      // 🟢 FRAME RANGE WINDOW (63 to 66) & DECELERATION SNAP BALL RELEASE ENGINE
      if (
        !bowler.isBallReleased &&
        (bowler.isExecutingJump ||
          bowler.isPreJumpTransitioning ||
          bowler.currentHipPosition.x <= bowler.startJumpX)
      ) {
        // ⏱️ Compute current jump animation frame index (0 to 70 out of 71 total frames)
        const totalJumpFrames = Bowler.PRE_DELIVERY_JUMP.length;
        const currentJumpFrameIndex = Math.min(
          totalJumpFrames - 1,
          Math.max(0.0, bowler.accumulatedJoystickAngleDeg)
        );

        // 🛑 Block release if current frame is before Frame 63 (out of 71 total frames)
        if (currentJumpFrameIndex >= JUMP_RELEASE_FRAME_MIN) {
          const prevWristX =
            this.ball.prevPos.x > 0 ? this.ball.prevPos.x : bowler.leftWrist.x;
          const currWristX = bowler.leftWrist.x;
          const prevWristY =
            this.ball.prevPos.y > 0 ? this.ball.prevPos.y : bowler.leftWrist.y;
          const currWristY = bowler.leftWrist.y;

          let releaseTriggered = false;

          // 🚀 1. Track Peak Angular Velocity during active arm swing
          const currentOmega = Math.abs(bowler.joystickAngularVelRad);
          // Check condition: currentOmega > bowler.maxObservedOmeg...
          if (currentOmega > bowler.maxObservedOmegaRad) {
            bowler.maxObservedOmegaRad = currentOmega;
          }

          // 🚀 2. Check Significant Deceleration Trigger (High Swing Speed + Speed Drop in Top Arc)
          if (
            bowler.maxObservedOmegaRad >= DECEL_MIN_SWING_SPEED &&
            currentOmega <=
              bowler.maxObservedOmegaRad * (1.0 - DECEL_DROP_RATIO)
          ) {
            // Verify arm is in the valid top release arc by checking if the frame is in the release window
            if (currentJumpFrameIndex >= JUMP_RELEASE_FRAME_MIN && currentJumpFrameIndex <= JUMP_RELEASE_FRAME_MAX) {
              releaseTriggered = true;
            }
          }

          // 🚀 3. Max Frame Boundary (Frame 66 out of 71): Force release if reached without earlier deceleration
          if (
            !releaseTriggered &&
            currentJumpFrameIndex >= JUMP_RELEASE_FRAME_MAX
          ) {
            releaseTriggered = true;
          }

          // Check condition: releaseTriggered
          if (releaseTriggered) {
            const releaseX = currWristX;
            const releaseY = currWristY;

            // 📐 Peak Whip Angular Velocity for Full Release Speed (Preserves max flick effort)
            const sign = bowler.joystickAngularVelRad >= 0 ? 1 : -1;
            let peakOmega = Math.max(
              Math.abs(bowler.joystickAngularVelRad),
              bowler.maxObservedOmegaRad,
            );

            // 🏋️ Diminishing Returns (Soft Cap) for Extreme Speeds
            // Normal 1:1 scaling up to ~2000 px/s (approx 8.5 rad/s)
            const SOFT_CAP_THRESHOLD = 8.5; 
            if (peakOmega > SOFT_CAP_THRESHOLD) {
              const excessSpeed = peakOmega - SOFT_CAP_THRESHOLD;
              // Very slow growth after 2000 px/s (multiplier reduced to 2.0)
              peakOmega = SOFT_CAP_THRESHOLD + Math.sqrt(excessSpeed) * 2.0;
            }

            const releaseOmega = peakOmega * sign;

            const totalArmLen = bowler.FRONT_UPPER_ARM + bowler.FRONT_LOWER_ARM;
            const minReach =
              Math.abs(bowler.FRONT_UPPER_ARM - bowler.FRONT_LOWER_ARM) + 5;
            const armR =
              minReach +
              (totalArmLen - minReach - 1.0) * bowler.smoothJoystickRadiusRatio;
            const theta = bowler.smoothJoystickAngleRad;

            // Exact 2D Circular Tangential Velocity Derivative with Peak Whip Power
            const vArmX = -armR * Math.sin(theta) * releaseOmega;
            const vArmY = armR * Math.cos(theta) * releaseOmega;

            // 🏃 Forward Body Horizontal Velocity Component (True physical linear momentum from frame displacement)
            // Fallback to lastRunupSpeedX if currentBodyVelocityX is near 0 for some reason
            let vBodyX = Math.abs(bowler.currentBodyVelocityX) > 10 ? 
                bowler.currentBodyVelocityX : 
                -Math.abs(bowler.lastRunupSpeedX > 0 ? bowler.lastRunupSpeedX : 800.0);
                
            // Ensure vBodyX is negative (towards pitch)
            vBodyX = -Math.abs(vBodyX);

            // 🚀 Combined Natural Launch Velocity Vector (Guaranteed Forward -X Flight)
            // vReleaseX = Linear Runup Momentum + Tangential Arm Momentum
            const vReleaseX = -Math.abs(vBodyX + vArmX);
            // vReleaseY = Tangential Arm Momentum (pure physics, no blending)
            const vReleaseY = vArmY;
            
            const totalSpeed = Math.hypot(vReleaseX, vReleaseY);
            const launchAngleDeg =
              (Math.atan2(vReleaseY, vReleaseX) * 180) / Math.PI;

            // Store Release Speed Debug Info
            bowler.lastReleaseVx = vReleaseX;
            bowler.lastReleaseVy = vReleaseY;
            bowler.lastReleaseVBodyX = vBodyX;
            bowler.lastReleaseVArmX = vArmX;
            bowler.lastReleaseSpeed = totalSpeed;
            bowler.lastReleaseAngleDeg = launchAngleDeg;

            // Detach ball from hand and set up release state!
            bowler.isBallReleased = true;
            bowler.postReleaseDelaySec = bowler.POST_RELEASE_DELAY_SEC;
            bowler.debugReleasePoint = { x: releaseX, y: releaseY };

            // 1. Send network release packet immediately to Batter over DataChannel!
            if (
              this.isOnlineMode &&
              !this.hasSentReleasePacket &&
              this.network &&
              this.network.isConnected
            ) {
              console.log(
                "🚀 Bowler Sent Release Event! Tick:",
                this.networkTickNumber,
                "Pos:",
                releaseX,
                releaseY,
                "Vel:",
                vReleaseX,
                vReleaseY,
              );
              this.network.sendBowlerRelease(
                this.networkTickNumber,
                releaseX,
                releaseY,
                vReleaseX,
                vReleaseY,
              );
              this.hasSentReleasePacket = true;
            }

                        // 2. Set Visual Release Delay directly using the calculated playhead delay 
            //    (this matches the hand movement visual delay to prevent teleportation)
            const releaseDelaySec = 3*(this.isOnlineMode && this.network  ? (bowler.playheadDelayMs || 0) / 1000 : 0)

            bowler.releaseDelayTimer = releaseDelaySec;
            bowler.pendingVisualThrow = {
              releaseX,
              releaseY,
              vReleaseX,
              vReleaseY,
            };

            // Check condition: releaseDelaySec <= 0
            if (releaseDelaySec <= 0) {
              // Offline mode or 0ms RTT: launch immediately
              this.ball.isHeldInHand = false;
              this.ball.isActive = true;
              this.ball.throwBallWithVelocity(
                releaseX,
                releaseY,
                vReleaseX,
                vReleaseY,
              );
              bowler.pendingVisualThrow = null;
              this.ball.update(dt * 0.5);
            } else {
              // Hold ball at release position during RTT/2 delay while arm follow-through animates
              this.ball.isHeldInHand = false;
              this.ball.isActive = true;
              this.ball.pos.x = releaseX;
              this.ball.pos.y = releaseY;
              this.ball.prevPos.x = releaseX;
              this.ball.prevPos.y = releaseY;
              this.ball.vel.x = 0;
              this.ball.vel.y = 0;
            }
          } else {
            // Ball is still held in hand before crossing Green Line:
            this.ball.isHeldInHand = true;
            this.ball.isActive = true;
            this.ball.pos.x = bowler.leftWrist.x;
            this.ball.pos.y = bowler.leftWrist.y;
            this.ball.prevPos.x = bowler.leftWrist.x;
            this.ball.prevPos.y = bowler.leftWrist.y;
          }
        } else {
          // Ball is locked in hand before Frame 63:
          this.ball.isHeldInHand = true;
          this.ball.isActive = true;
          this.ball.pos.x = bowler.leftWrist.x;
          this.ball.pos.y = bowler.leftWrist.y;
          this.ball.prevPos.x = bowler.leftWrist.x;
          this.ball.prevPos.y = bowler.leftWrist.y;
        }
      }
      // Check if the ball has been released from the bowler's hand
      else if (bowler.isBallReleased) {
        // Check condition: bowler.pendingVisualThrow
        if (bowler.pendingVisualThrow) {
          bowler.releaseDelayTimer -= dt;
          // Check condition: bowler.releaseDelayTimer <= 0
          if (bowler.releaseDelayTimer <= 0) {
            const throwInfo = bowler.pendingVisualThrow;
            this.ball.isHeldInHand = false;
            this.ball.isActive = true;
            this.ball.throwBallWithVelocity(
              throwInfo.releaseX,
              throwInfo.releaseY,
              throwInfo.vReleaseX,
              throwInfo.vReleaseY,
            );
            bowler.pendingVisualThrow = null;
            console.log(
              "🚀 Visual Release Delay (RTT/2) Expired -> Ball Flight Launched on Bowler Screen!",
            );
          } else {
            // Anchor ball at release position during RTT/2 delay
            this.ball.isHeldInHand = false;
            this.ball.isActive = true;
            this.ball.pos.x = bowler.pendingVisualThrow.releaseX;
            this.ball.pos.y = bowler.pendingVisualThrow.releaseY;
            this.ball.prevPos.x = bowler.pendingVisualThrow.releaseX;
            this.ball.prevPos.y = bowler.pendingVisualThrow.releaseY;
            this.ball.vel.x = 0;
            this.ball.vel.y = 0;
          }
        } else {
          // Ball has been released: update flight physics (Gravity, Air Drag, Friction & Pitch Bounce!)
          this.ball.update(dt);

          
          // Check condition: this.reconcileBlendTicksRemaining > 0
          if (this.reconcileBlendTicksRemaining > 0) {
            const blendStepX =
              this.reconcileOffsetX / this.reconcileBlendTicksRemaining;
            const blendStepY =
              this.reconcileOffsetY / this.reconcileBlendTicksRemaining;
            this.ball.pos.x -= blendStepX;
            this.ball.pos.y -= blendStepY;
            this.reconcileOffsetX -= blendStepX;
            this.reconcileOffsetY -= blendStepY;
            this.reconcileBlendTicksRemaining--;
            // Check condition: this.reconcileBlendTicksRemaining === 0
            if (this.reconcileBlendTicksRemaining === 0) {
              // Blend complete — offsets zero karo (next ball ke liye clean state)
              this.reconcileOffsetX = 0;
              this.reconcileOffsetY = 0;
            }
          }

          // 🎯 RACE-FIX COUNTER: local predicted hit fire hone ke baad har physics
          // tick gin-te hain (jab tak authoritative result nahi aata). Kyun: HIT_RESULT
          // aane par fast-forward is counter se CLAMP hota hai — taaki fast-forwarded
          // target ball ke current position se KABHI PEECHE na ho (warna ball wapas
          // hit-location me khinchti = "teleport back + dobara hit" bug).
          if (this.localPredictedHit && !this.hasAuthoritativeResult) {
            this.ticksSinceLocalPredictedHit++;
          }

        // ⚡ ONLINE MODE LOCAL PREDICTIVE COLLISION CHECK ON BOWLER SCREEN (0ms Audio Feedback + Instant Local Launch)
        if (
          1
        ) {
          const predicted = this.bat.checkHit(this.ball, dt);
          if (predicted.hit && !this.ball.isStuck) {
            this.localPredictedHit = true;
            this.ball.timeDilationFactor = 1.0; // Immediately resume normal speed
            if (this.renderer.bowler) {
                this.renderer.bowler.localHitTrailIndex = this.renderer.bowler.ballTrailPoints.length;
            }
            this.suppressNextPacketSound = true;
            const si = this.bat.lastSoundImpact;
            // SoundManager.getInstance().playBatHit(
            //   si?.speed ?? 1000,
            //   si?.offset ?? 100,
            // );
            console.log(
              "⚡ Bowler Local Hit Prediction Triggered! (Instant Local Launch)",
            );
          }
        }
        }
      } else {
        this.ball.isHeldInHand = true;
        this.ball.isActive = true;
        this.ball.pos.x = bowler.leftWrist.x;
        this.ball.pos.y = bowler.leftWrist.y;
        this.ball.prevPos.x = bowler.leftWrist.x;
        this.ball.prevPos.y = bowler.leftWrist.y;
      }

      // 🔴 Record Ball Trail Points for smooth trajectory rendering
      if (
        bowler.isGatheringArmActive ||
        bowler.isExecutingJump ||
        bowler.isPreJumpTransitioning ||
        bowler.isPreJumpFrozen ||
        bowler.isCycleCompleted ||
        bowler.isBallReleased
      ) {
        const pts = bowler.ballTrailPoints;
        const currX = this.ball.pos.x;
        const currY = this.ball.pos.y;
        // Check condition: pts.length > 0
        if (pts.length > 0) {
          const lastPt = pts[pts.length - 1];
          const dist = Math.hypot(currX - lastPt.x, currY - lastPt.y);
          // Check condition: dist > 6
          if (dist > 6) {
            const steps = Math.min(10, Math.ceil(dist / 3));
            for (let s = 1; s < steps; s++) {
              const ratio = s / steps;
              pts.push({
                x: lastPt.x + (currX - lastPt.x) * ratio,
                y: lastPt.y + (currY - lastPt.y) * ratio,
              });
            }
          }
        }
        pts.push({ x: currX, y: currY });
      }

      // Dynamic Pre-Jump Trigger Check when bowler reaches startJumpX
      if (
        bowler.isRunning &&
        bowler.currentHipPosition.x <= bowler.startJumpX &&
        !bowler.isPreJumpTransitioning &&
        !bowler.isExecutingJump
      ) {
        bowler.isGatheringArmActive = false;
        bowler.preJumpStartX = bowler.currentHipPosition.x;
        bowler.initialRunupSpeedX =
          bowler.lastRunupSpeedX > 0 ? bowler.lastRunupSpeedX : 800.0;
        bowler.lastInterpolatedDisplacementX =
          Bowler.PRE_DELIVERY_JUMP[0].displacementX ?? -20.0;
        bowler.accumulatedDisplacementX = Math.abs(
          bowler.lastInterpolatedDisplacementX,
        );
        bowler.isExecutingJump = true;
        bowler.triggerPreJump();

        const joystickRad = this.renderer.joystick
          ? this.renderer.joystick.angleRad
          : Math.PI;
          
        let currentJoystickDeg = (joystickRad * 180) / Math.PI;
        currentJoystickDeg = (currentJoystickDeg + 360) % 360; // Normalize 0-360
        
        let mappedAngle = currentJoystickDeg - 90.0;
        if (mappedAngle < 0) mappedAngle += 360.0;

        bowler.targetInitialAngleDeg = mappedAngle;
        bowler.accumulatedJoystickAngleDeg = 0.0;
        bowler.isInitialAngleTransitioning = true;
        
        // Capture the running pose right before we jump, so we don't teleport the legs!
        bowler.initialTransitionStartPose = bowler.lastPoseSnapshot 
            ? { ...bowler.lastPoseSnapshot } 
            : { ...Bowler.STATIC_FRAMES[0] };

        bowler.smoothJoystickAngleRad = joystickRad;
        bowler.joystickAngularVelRad = 0.0;
        bowler.lastJoystickAngleRad = joystickRad;
      }
      this.ball.update(dt);
      this.renderer.wicket.update(dt);
    }
    // Check condition: (this.renderer.gameMode as any
    else if ((this.renderer.gameMode as any) === "ANIMATION_PLAY") {
      const bowler = this.renderer.bowler;
      bowler.update(dt);

      // Check game state condition
      if (
        this.ball.isHeldInHand &&
        bowler &&
        !bowler.isBallReleased
      ) {
        this.ball.pos.x = bowler.leftWrist.x;
        this.ball.pos.y = bowler.leftWrist.y;
        this.ball.prevPos.x = bowler.leftWrist.x;
        this.ball.prevPos.y = bowler.leftWrist.y;
        this.ball.isActive = true;

        // Auto pre-jump trigger at middle of screen (x <= CANVAS_WIDTH / 2)
        if (
          bowler.isRunning &&
          bowler.currentHipPosition.x <= CANVAS_WIDTH / 2 &&
          !bowler.isPreJumpTransitioning &&
          !bowler.isExecutingJump
        ) {
          bowler.preJumpStartX = bowler.currentHipPosition.x;
          bowler.triggerPreJump();
        }
      }

      // Stop bowler cleanly when cycle finishes
      if (bowler.isCycleCompleted) {
        bowler.isRunning = false;
        bowler.isExecutingJump = false;
      }

      this.ball.update(dt);
      this.renderer.wicket.update(dt);
    } else {
      // BOWLING MODE: Update bowling area, ball & wicket
        this.renderer.bowlingArea.releaseDelaySeconds = this.isOnlineMode && this.network ? (this.network.getRTT() / 2) / 1000 : 0;
      this.renderer.bowlingArea.update(
        dt,
        this.input.mouseX,
        this.input.mouseY,
        this.ball,
      );
      this.ball.update(dt); // Integrate ball velocity into position for flight!
      this.renderer.wicket.update(dt);
      this.renderer.wicket.checkHit(this.ball, false);

      // Check game state condition
      if (
        this.isOnlineMode &&
        this.ball.isActive &&
        !this.hasAuthoritativeResult
      ) {
        const predicted = this.bat.checkHit(this.ball, dt);
        if (predicted.hit && !this.ball.isStuck) {
          this.localPredictedHit = true;
          if (this.renderer.bowler) {
              this.renderer.bowler.localHitTrailIndex = this.renderer.bowler.ballTrailPoints.length;
          }
          this.suppressNextPacketSound = true;
        }
      }

      // 🎯 RACE-FIX COUNTER (BOWLING mode branch): NEW_BOWLER branch jaisa hi —
      // local predicted hit ke baad flight ticks gino taaki HIT_RESULT fast-forward
      // ball ke current position se peeche na ho (backward pull / teleport-back bug).
      if (this.localPredictedHit && !this.hasAuthoritativeResult) {
        this.ticksSinceLocalPredictedHit++;
      }

      // Check game state condition
      if (
        this.isOnlineMode &&
        !this.hasSentReleasePacket &&
        this.network &&
        this.network.isConnected
      ) {
        const bowler = this.renderer.bowler;
        // Check game state condition
        if (
          bowler.isBallReleased &&
          bowler.lastReleaseVx !== null &&
          bowler.lastReleaseVy !== null
        ) {
          const relX = bowler.debugReleasePoint?.x ?? bowler.leftWrist.x;
          const relY = bowler.debugReleasePoint?.y ?? bowler.leftWrist.y;
          this.network.sendBowlerRelease(
            this.networkTickNumber,
            relX,
            relY,
            bowler.lastReleaseVx,
            bowler.lastReleaseVy,
          );
          this.hasSentReleasePacket = true;
        }
        // Check game state condition
        else if (
          this.renderer.bowlingArea.isBallReleased &&
          this.renderer.bowlingArea.lastReleaseInfo
        ) {
          const info = this.renderer.bowlingArea.lastReleaseInfo;
          this.network.sendBowlerRelease(
            this.networkTickNumber,
            info.posX,
            info.posY,
            info.velX,
            info.velY,
          );
          this.hasSentReleasePacket = true;
        }
      }
    }
  }
  private render() {
    this.renderer.render(this.renderAlpha);
  }

  public setGameMode(
    mode:
      | "BATTING"
      | "BOWLING"
      | "NEW_BOWLER"
      | "DEBUG_13_FRAMES"
      | "ANIMATION_PLAY",
  ) {
    this.renderer.gameMode = mode;
    // Check if the game is running in multiplayer online mode
    if (mode === "BATTING" && !this.isOnlineMode) {
      this.startBowlerDelivery();
    }
    // Check condition: mode === "NEW_BOWLER"
    else if (mode === "NEW_BOWLER") {
      const bowler = this.renderer.bowler;
      bowler.resetToIdle();
      bowler.currentHipPosition.x = BOWLER_START_X;
      bowler.preJumpStartX = BOWLER_START_X;
      this.ball.isHeldInHand = true;
      this.ball.isActive = true;
    }
    // Check condition: mode === "ANIMATION_PLAY"
    else if (mode === "ANIMATION_PLAY") {
      const bowler = this.renderer.bowler;
      bowler.resetToIdle();
      bowler.resetProceduralUpperBodyState();
      bowler.currentHipPosition.x = 1.4 * CANVAS_WIDTH;
      bowler.startRunning();
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
