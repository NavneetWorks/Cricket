import Bat from "../entities/Bat";
import Renderer from "./Rederer";
import Input from "./Input";

export default class GameLoop{
    private ctx:CanvasRenderingContext2D;
    private bat:Bat;
    private renderer:Renderer;
    private input: Input;
    private lastFrameTime = 0;

    constructor(ctx:CanvasRenderingContext2D,bat:Bat,input:Input){
        this.ctx = ctx;
        this.bat = bat;
        this.renderer = new Renderer(ctx, bat, input);
        this.input = input;
    }
    public start(){
        this.lastFrameTime = performance.now();
        //this.bat.initializePhysics(this.input.getHistory());
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
    }

    private render(){
        this.renderer.render();
    }
}