import { useEffect, useRef, useState } from "react";

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
    const [gameMode, setGameMode] = useState<'BATTING' | 'BOWLING'>('BATTING');

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

    const handleModeSwitch = (mode: 'BATTING' | 'BOWLING') => {
        setGameMode(mode);
        if (gameLoopRef.current) {
            (gameLoopRef.current as any).setGameMode(mode);
        }
    };

    return (
        <div style={{ position: "relative", width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
            {/* Top-Right Mode Switcher Buttons */}
            <div style={{
                position: "absolute",
                top: "18px",
                right: "20px",
                display: "flex",
                gap: "10px",
                zIndex: 10
            }}>
                <button
                    onClick={() => handleModeSwitch('BATTING')}
                    style={{
                        padding: "8px 16px",
                        backgroundColor: gameMode === 'BATTING' ? "#0ea5e9" : "rgba(15, 23, 42, 0.85)",
                        color: gameMode === 'BATTING' ? "#ffffff" : "#94a3b8",
                        border: `1.5px solid ${gameMode === 'BATTING' ? "#38bdf8" : "rgba(255,255,255,0.2)"}`,
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontWeight: "bold",
                        fontSize: "13px",
                        boxShadow: gameMode === 'BATTING' ? "0 0 12px rgba(14, 165, 233, 0.5)" : "none",
                        transition: "all 0.2s ease"
                    }}
                >
                    🏏 BATTING MODE
                </button>

                <button
                    onClick={() => handleModeSwitch('BOWLING')}
                    style={{
                        padding: "8px 16px",
                        backgroundColor: gameMode === 'BOWLING' ? "#0ea5e9" : "rgba(15, 23, 42, 0.85)",
                        color: gameMode === 'BOWLING' ? "#ffffff" : "#94a3b8",
                        border: `1.5px solid ${gameMode === 'BOWLING' ? "#38bdf8" : "rgba(255,255,255,0.2)"}`,
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontWeight: "bold",
                        fontSize: "13px",
                        boxShadow: gameMode === 'BOWLING' ? "0 0 12px rgba(14, 165, 233, 0.5)" : "none",
                        transition: "all 0.2s ease"
                    }}
                >
                    ⚾ BOWLING MODE
                </button>
            </div>

            <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
            />
        </div>
    );
}

export default GameCanvas;