import Bat from "../entities/Bat";
import Ball from "../entities/Ball";
import Renderer from "./Rederer";
import Input from "./Input";
import NetworkManager from "../network/NetworkManager";
import { CANVAS_HEIGHT, CANVAS_WIDTH, GROUND_HEIGHT ,k_values, SERVER_CONFIG} from "./constants";

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
                // 🟢 Bowler screen par Mouse coordinates se poora body skeleton update ho jayega:
                this.bat.setBatPoseFromMouse(mouseX, mouseY);
            };
            this.network.onHitResult = (exitX,exitY,exitVx,exitVy) =>{
                this.ball.pos.x = exitX;
                this.ball.pos.y = exitY;
                this.ball.vel.x = exitVx;
                this.ball.vel.y = exitVy;
            }
        }
        const throwNewBall = () => {
            const minSpeed = 3000;
            const maxSpeed = 4000;
            const randomSpeed = minSpeed + Math.random() * (maxSpeed - minSpeed);
            
            const minAngle = 2;
            const maxAngle = 22;
            
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

        this.update(dt);
        this.render();
        requestAnimationFrame(this.loop);
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
        this.renderer.render();
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