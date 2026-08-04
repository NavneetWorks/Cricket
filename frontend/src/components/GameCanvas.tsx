import {useEffect,useRef} from "react";
import {GAME_COLORS} from "../game/constants";
function GameCanvas(){
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(()=>{
        const canvas = canvasRef.current;
        if(!canvas) return;

        const ctx = canvas.getContext("2d");
        if(!ctx) return;

        ctx.fillStyle = GAME_COLORS.SKY;
        ctx.fillRect(0,0,canvas.width,canvas.height);

        ctx.fillStyle = GAME_COLORS.GROUND;
        ctx.fillRect(0,canvas.height-120,canvas.width,120);

    },[]);

    return (<canvas ref={canvasRef} width={1200} height={700} />);
}

export default GameCanvas;