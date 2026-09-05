import Bat from "../entities/Bat";
import Ball from "../entities/Ball";
import Renderer from "./Rederer";
import Input from "./Input";
import NetworkManager from "../network/NetworkManager";
import { CANVAS_HEIGHT, CANVAS_WIDTH, GROUND_HEIGHT ,k_values, SERVER_CONFIG, BAT_SNAPSHOT_QUEUE_SIZE, BAT_INTERP_BUFFER_TICKS, BAT_MAX_EXTRAPOLATION_TICKS } from "./constants";

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
    private renderer:Renderer;
    private input: Input;
    private lastFrameTime = 0;

    public isOnlineMode: boolean = false;
    public network: NetworkManager | null = null;
    private networkTickNumber: number = 0;
    private networkTimer: number = 0;
    private readonly NETWORK_INTERVAL = 1 / 60;
    private hasSentReleasePacket: boolean = false;

    // ===== FIXED-STEP PHYSICS (accumulator pattern) =====
    // Physics ka apna clock: hamesha FIXED_DT (16.67ms) ke exact steps me chalta hai,
    // display fps (60/144/240) se bilkul independent. Isse friction/bounce/gravity
    // dono machines par identical hote hain → ball same distance jaati hai.
    private physicsAccumulator: number = 0;
    private renderAlpha: number = 0;                 // 0..1 — pichle physics step se kitna aage render karna hai

    // ===== STEP 2: REMOTE BAT SNAPSHOT INTERPOLATION (jitter buffer) =====
    // Batter 60Hz snapshots bhejta hai (uniform tick grid). Bowler playhead ko
    // latest se BAT_INTERP_BUFFER_TICKS peeche rakh kar do snapshots ke beech
    // LERP karta hai → network jitter render me pahunch hi nahi pata.
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
            };
            this.network.onBowlerRelease = (startX,startY,speed,angleDegrees) =>{
                this.renderer.wicket.reset();
                this.ball.throwBall(startX,startY,speed,angleDegrees);
            }
            // this.network.onOpponentBatSwing = (tick,handleX,handleY,batAngle) =>{
            //     this.bat.setBatPose(handleX, handleY, batAngle);

            // }
            // GameLoop.ts start() me:
            this.network.onOpponentBatSwing = (tick, mouseX, mouseY, angle) => {
                // 🟢 STEP 2: Snapshot QUEUE me daalo, apply abhi NAHI.
                // Pehle wala direct setBatPoseFromMouse() har packet par jump karata tha
                // (packet kabhi 10ms me aata kabhi 40ms me) → bat stutter karti thi.
                // Ab updateRemoteBatPose() har render frame par playhead ke hisaab se
                // do snapshots ke beech LERP karke smooth pose lagayega.
                const q = this.batPoseQueue;
                // Out-of-order/duplicate packets ignore karo (UDP reorder ho sakta hai)
                if (q.length > 0 && tick <= q[q.length - 1].tick) return;
                q.push({ tick, mouseX, mouseY });
                if (q.length > BAT_SNAPSHOT_QUEUE_SIZE) {
                    q.shift(); // Sabse purana snapshot phenko (queue size cap)
                }
            };
            this.network.onHitResult = (exitX,exitY,exitVx,exitVy) =>{
                this.ball.pos.x = exitX;
                this.ball.pos.y = exitY;
                this.ball.vel.x = exitVx;
                this.ball.vel.y = exitVy;
                // prevPos bhi sync karo — warna render interpolation ball ko purani
                // position se naye hit position tak 1 frame me "smear" karke dikhayega
                this.ball.prevPos.x = exitX;
                this.ball.prevPos.y = exitY;

                // Bowler screen par bhi mini-screen ka dotted trajectory arc dikhane ke liye
                // lastHitStats manually set karte hain. Ye object wahi shape hai jo Bat.checkHit()
                // batter ke client par banata hai — Renderer (drawMiniScreen) isi ko padhta hai.
                // checkHit() sirf BATTING branch me chalta hai, isliye bowler ke client par
                // ye data kabhi banta hi nahi tha — HIT_RESULT ke exit values se khud bana dete hain.
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
        const throwNewBall = () => {
            const minSpeed = 3000;
            const maxSpeed = 4000;
            const randomSpeed = minSpeed + Math.random() * (maxSpeed - minSpeed);
            
            const minAngle = 0;
            const maxAngle = 12;
            
            // RIGHT se LEFT fenkne ke liye changes:
            
            // 1. Bowler screen ke Right side (jaise X = 1200) se fenkega
            const startX = CANVAS_WIDTH;
            const startY = (CANVAS_HEIGHT - GROUND_HEIGHT) - 350;
             
            // 2. Angle ko Left ki taraf modne ke liye (180 degree mein se minus karna)
            // Isse ball right ki jagah left ki taraf travel karegi
            const randomAngle = 180 - (minAngle + Math.random() * (maxAngle - minAngle));
            
            // Ball ko naye X aur naye Angle ke sath release karein
            this.renderer.wicket.reset();
            this.ball.throwBall(startX, startY, randomSpeed, randomAngle); 
        };
        // 1. Mouse Click (Left Click) par ball fenkna (Only in OFFLINE BATTING mode)
        window.addEventListener("mousedown", () => {
            if (!this.isOnlineMode && this.renderer.gameMode === 'BATTING') {
                throwNewBall();
            }
        });

        // 2. Keyboard par 'Space' button dabane par ball fenkna (Only in OFFLINE BATTING mode)
        window.addEventListener("keydown", (event) => {
            if (!this.isOnlineMode && event.code === "Space" && this.renderer.gameMode === 'BATTING') {
                throwNewBall();
            }
        });

        // 3. Keyboard par 'R' button dabane par Bowling ball & Wickets reset karna
        window.addEventListener("keydown", (event) => {
            if (event.code === "KeyR" || event.key.toLowerCase() === 'r') {
                this.renderer.bowlingArea.reset(this.ball);
                this.renderer.wicket.reset();
                this.hasSentReleasePacket = false;
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

        // ===== FIXED-STEP ACCUMULATOR (industry standard: Unity FixedUpdate, CS tickrate) =====
        // Display frame ka time piggy-bank (accumulator) me jama karo. Jaise hi 16.67ms
        // ka poora coin jama ho → ek physics step chalao. Adhoora coin agle frame ke liye bacha.
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

    // ============================================================
    // STEP 2: REMOTE BAT SNAPSHOT INTERPOLATION (jitter buffer)
    // ============================================================
    // Har render frame par chalta hai (fixed steps se INDEPENDENT — smoothness
    // display-fps ke hisaab se hi to chahiye). Playhead sender-tick space me
    // local dt se aage badhta hai, aur us tick ko wrap karne wale 2 snapshots
    // ke beech LERP karke bat pose lagata hai.
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

        // 1. Playhead hamesha REAL-TIME speed se aage badhega (60 ticks/sec).
        //    🐛 FIX: pehle drift correction dono taraf kheenchta tha — bursty arrival me
        //    latest stale rehta hai → desired peeche → correction playhead SLOW kar deta
        //    tha = SLOW MOTION BUG. Ab playback clock kabhi slow nahi hogi.
        this.batInterpTick += frameDt * SERVER_CONFIG.TARGET_TICK_RATE;

        // 2. CATCH-UP-ONLY drift correction:
        //    Agar playhead desired se kaafi PEECHE hai (clock drift / stall recovery),
        //    to thoda FAST chalao taaki buffer wapas ban jaye. KABHI SLOW MAT KARO —
        //    slow-down ka ilaaj kabhi playback slow karna nahi hota.
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
            // 5a. EXTRAPOLATION: playhead last snapshot ke AAGE hai — matlab agla packet
            //     abhi tak nahi aaya (jitter/loss). Last 2 snapshots se velocity estimate
            //     karke aage guess karo, MAX_EXTRAP ticks tak hi (uske baad hold).
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
    private update(dt: number){
        if (this.renderer.gameMode === 'BATTING') {
            const currentCommand = this.input.getHistory().peek();
            if(currentCommand === null){
                console.log("No mouse history available to update bat.");
                return;
            }
            this.bat.update(this.input.mouseX, this.input.mouseY, dt, this.input);
            this.ball.update(dt);
            this.renderer.wicket.update(dt);
            
            if(this.isOnlineMode && this.network && this.network.isConnected){
                this.networkTimer += dt;
                if(this.networkTimer >= this.NETWORK_INTERVAL){
                    this.networkTimer -= this.NETWORK_INTERVAL;
                    this.networkTickNumber++;

                    // 60Hz UDP par Bat pose bhejo:
                    // this.network.sendBatSwingUDP(
                    //     this.networkTickNumber,
                    //     this.bat.getHandleTop().x,
                    //     this.bat.getHandleTop().y,
                    //     this.bat.getBatAngle()
                    // );   
                    this.network.sendBatSwingUDP(
                        this.networkTickNumber,
                        this.input.mouseX,
                        this.input.mouseY,
                        0
                    );           
                
                }
            }
            const batHitResult = this.bat.checkHit(this.ball, dt);
             if (batHitResult.hit && this.isOnlineMode && this.network && this.network.isConnected) {
                this.network.sendHitResult(
                    this.networkTickNumber,
                    this.ball.pos.x,
                    this.ball.pos.y,
                    this.ball.vel.x,
                    this.ball.vel.y
                );
            }
            this.renderer.wicket.checkHit(this.ball, batHitResult.hit, batHitResult.hitSubStep);
        } else {
            // BOWLING MODE: Update bowling area, ball & wicket
            this.renderer.bowlingArea.releaseDelaySeconds = (this.isOnlineMode && this.network) ? this.network.getRTT() / 1000 : 0;
            this.renderer.bowlingArea.update(dt, this.input.mouseX, this.input.mouseY, this.ball);
            this.ball.update(dt); // Integrate ball velocity into position for flight!
            this.renderer.wicket.update(dt);
            this.renderer.wicket.checkHit(this.ball, false);

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

    public setGameMode(mode: 'BATTING' | 'BOWLING') {
        this.renderer.gameMode = mode;
        console.log("Game Mode set to:", mode);
    }

    public toggleGround() {
        this.renderer.useImageGround = !this.renderer.useImageGround;
        console.log("Image Ground toggled:", this.renderer.useImageGround);
    }
}