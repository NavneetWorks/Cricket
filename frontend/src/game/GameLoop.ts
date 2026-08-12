import Bat from "../entities/Bat";
import Ball from "../entities/Ball";
import Renderer from "./Rederer";
import Input from "./Input";
import { CANVAS_HEIGHT, CANVAS_WIDTH, GROUND_HEIGHT ,k_values} from "./constants";

export default class GameLoop{
    private ctx:CanvasRenderingContext2D;
    private bat:Bat;
    private ball: Ball;
    private renderer:Renderer;
    private input: Input;
    private lastFrameTime = 0;

    constructor(ctx:CanvasRenderingContext2D,bat:Bat,input:Input){
        this.ctx = ctx;
        this.bat = bat;
        this.ball = new Ball();
        this.renderer = new Renderer(ctx, bat, input,this.ball);
        this.input = input;
    }
    public start(){
        this.lastFrameTime = performance.now();
        const throwNewBall = () => {
            
            const minSpeed = 3000;
            const maxSpeed = 4500;
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
          // 1. Mouse Click (Left Click) par ball fenkna (Only in BATTING mode)
        window.addEventListener("mousedown", () => {
            if (this.renderer.gameMode === 'BATTING') {
                throwNewBall();
            }
        });
        // 2. Keyboard par 'Space' button dabane par ball fenkna (Only in BATTING mode)
        window.addEventListener("keydown", (event) => {
            if (event.code === "Space" && this.renderer.gameMode === 'BATTING') {
                throwNewBall();
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
            const batHitResult = this.bat.checkHit(this.ball, dt);
            this.renderer.wicket.checkHit(this.ball, batHitResult.hit, batHitResult.hitSubStep);
        } else {
            // BOWLING MODE: Update bowling area, ball & wicket
            this.renderer.bowlingArea.update(dt, this.input.mouseX, this.input.mouseY);
            this.ball.update(dt);
            this.renderer.wicket.update(dt);
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