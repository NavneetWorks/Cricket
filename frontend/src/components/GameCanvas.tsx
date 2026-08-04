import {useEffect,useRef} from "react";
import {GAME_COLORS} from "../game/constants";
import Bat from "../entities/Bat";
import Input from "../game/Input";

function GameCanvas(){
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(()=>{
        const bat = new Bat();
        const canvas = canvasRef.current;
        
        if(!canvas) return;

        const input = new Input(canvas);

        const ctx = canvas.getContext("2d");
        if(!ctx) return;

        ctx.fillStyle = GAME_COLORS.SKY;
        ctx.fillRect(0,0,canvas.width,canvas.height);

        ctx.fillStyle = GAME_COLORS.GROUND;
        ctx.fillRect(0,canvas.height-120,canvas.width,120);

        bat.draw(ctx);

        ctx.font = "24px Arial";
        ctx.fillStyle = "black";

        ctx.fillText(`Mouse X: ${input.mouseX}`, 20, 40);
        ctx.fillText(`Mouse Y: ${input.mouseY}`, 20, 80);

    },[]);

    return (<canvas ref={canvasRef} width={1200} height={700} />);
}

export default GameCanvas;