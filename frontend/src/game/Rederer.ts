import Bat from "../entities/Bat";
import Input from "./Input";
import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    GAME_COLORS,
    GROUND_HEIGHT
} from "./constants";

export default class Renderer{
    private ctx:CanvasRenderingContext2D;
    private input: Input;
    private bat:Bat;
    
    constructor(ctx:CanvasRenderingContext2D,bat:Bat,input:Input){
        this.ctx = ctx;
        this.bat = bat;
        this.input = input;
    }
    public render(){
        this.ctx.clearRect(
            0,0,CANVAS_WIDTH,CANVAS_HEIGHT
        );

        this.drawSky();
        this.drawGround();
        this.drawBat();
        this.drawDebug();
    }
    private drawSky(){
        this.ctx.fillStyle = GAME_COLORS.SKY;
        this.ctx.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
    }
    private drawGround(){
        this.ctx.fillStyle = GAME_COLORS.GROUND;
        this.ctx.fillRect(0,CANVAS_HEIGHT-GROUND_HEIGHT,CANVAS_WIDTH,GROUND_HEIGHT);
    }
    private drawBat(){
        this.bat.draw(this.ctx);
    }
    private drawDebug(){
        this.ctx.font = "20px Arial";
        this.ctx.fillStyle = "white";;
        this.ctx.fillText(`Mouse X: ${this.input.mouseX}, Mouse Y: ${this.input.mouseY}`, 10, 30);
    }
}