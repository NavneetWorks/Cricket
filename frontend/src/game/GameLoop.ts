import Bat from "../entities/Bat";
import Ball from "../entities/Ball";
import Renderer from "./Rederer";
import Input from "./Input";
import { CANVAS_HEIGHT, CANVAS_WIDTH, GROUND_HEIGHT } from "./constants";

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
            const maxSpeed = 4000;
            const randomSpeed = minSpeed + Math.random() * (maxSpeed - minSpeed);
            
            const minAngle = 8;
            const maxAngle = 21;
            
            // RIGHT se LEFT fenkne ke liye changes:
            
            // 1. Bowler screen ke Right side (jaise X = 1200) se fenkega
            const startX = CANVAS_WIDTH;
            const startY = (CANVAS_HEIGHT - GROUND_HEIGHT) - 350;
            
            // 2. Angle ko Left ki taraf modne ke liye (180 degree mein se minus karna)
            // Isse ball right ki jagah left ki taraf travel karegi
            const randomAngle = 180 - (minAngle + Math.random() * (maxAngle - minAngle));
            
            // Ball ko naye X aur naye Angle ke sath release karein
            this.ball.throwBall(startX, startY, randomSpeed, randomAngle); 
        };
         // 1. Mouse Click (Left Click) par ball fenkna
        window.addEventListener("mousedown", throwNewBall);
        // 2. Keyboard par 'Backspace' button dabane par ball fenkna
        window.addEventListener("keydown", (event) => {
            if (event.code === "Space") {
                throwNewBall();
            }
        });

        this.render();
        requestAnimationFrame(this.loop);
    }

    private loop = (currentTime: number) => {
       //console.log("Frame");
        const dt = (currentTime - this.lastFrameTime) / 1000;
        this.lastFrameTime = currentTime;
        this.update(dt);
        this.render();
        requestAnimationFrame(this.loop);
    }
    private update(dt: number){
        const currentCommand = this.input.getHistory().peek();
        if(currentCommand === null){
            console.log("No mouse history available to update bat.");
            return;
        }
        //console.log(`Mouse Position: (${currentCommand.x}, ${currentCommand.y})`);
        this.bat.update(this.input.mouseX, this.input.mouseY, dt);
        this.ball.update(dt);
        this.bat.checkHit(this.ball)
    }

    private render(){
        this.renderer.render();
    }
}