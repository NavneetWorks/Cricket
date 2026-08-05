import Bat from "../entities/Bat";
import Renderer from "./Rederer";
import Input from "./Input";

export default class GameLoop{
    private ctx:CanvasRenderingContext2D;
    private bat:Bat;
    private renderer:Renderer;
    private input: Input;

    constructor(ctx:CanvasRenderingContext2D,bat:Bat,input:Input){
        this.ctx = ctx;
        this.bat = bat;
        this.renderer = new Renderer(ctx, bat, input);
        this.input = input;
    }
    public start(){
        requestAnimationFrame(this.loop);
    }

    private loop = () => {
        console.log("Frame");
        this.update();
        this.render();
        requestAnimationFrame(this.loop);
    }
    private update(){
        const currentCommand = this.input.getHistory().peek();
        if(currentCommand === null){
            return;
        }
        console.log(`Mouse Position: (${currentCommand.x}, ${currentCommand.y})`);
        this.bat.update(currentCommand.x,currentCommand.y);
    }

    private render(){
        this.renderer.render();
    }
}