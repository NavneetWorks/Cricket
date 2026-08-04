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
        console.clear();
        console.log(`Mouse X: ${this.input.mouseX}, Mouse Y: ${this.input.mouseY}`);
    }

    private render(){
        this.renderer.render();
    }
}