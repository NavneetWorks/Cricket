import { useEffect, useRef } from "react";

import Bat from "../entities/Bat";
import GameLoop from "../game/GameLoop";
import Input from "../game/Input";

import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
} from "../game/constants";

function GameCanvas() {

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gameLoopRef = useRef<GameLoop | null>(null);

    useEffect(() => {

        const canvas = canvasRef.current;

        if (!canvas) return;

        const ctx = canvas.getContext("2d");

        if (!ctx) return;

        const input = new Input(canvas);

        const bat = new Bat();

        const gameLoop = new GameLoop(ctx, bat,input);
        gameLoopRef.current = gameLoop;

        gameLoop.start();

    }, []);

    return (
        <div style={{ position: "relative", width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
            <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
            />
        </div>
    );
}

export default GameCanvas;