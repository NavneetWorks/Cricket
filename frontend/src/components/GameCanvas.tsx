import { useEffect, useRef, useState } from "react";

import Bat from "../entities/Bat";
import GameLoop from "../game/GameLoop";
import Input from "../game/Input";

import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
} from "../game/constants";

interface GameCanvasProps {
    isOnline?:boolean;
    onBackToHome?: () => void;
}

function GameCanvas({ isOnline = false,onBackToHome }: GameCanvasProps) {

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gameLoopRef = useRef<GameLoop | null>(null);
    const [gameMode, setGameMode] = useState<'BATTING' | 'BOWLING' | 'NEW_BOWLER' | 'DEBUG_13_FRAMES'>('BATTING');

    useEffect(() => {

        const canvas = canvasRef.current;

        if (!canvas) return;

        const ctx = canvas.getContext("2d");

        if (!ctx) return;

        const input = new Input(canvas);

        const bat = new Bat();

        const gameLoop = new GameLoop(ctx, bat,input,isOnline);
        gameLoopRef.current = gameLoop;

        gameLoop.start();

    }, []);

    const handleModeSwitch = (mode: 'BATTING' | 'BOWLING' | 'NEW_BOWLER' | 'DEBUG_13_FRAMES') => {
        setGameMode(mode);
        if (gameLoopRef.current) {
            (gameLoopRef.current as any).setGameMode(mode);
        }
    };

    return (
        <div style={{ position: "relative", width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
            {/* Top-Left Back To Home Button */}
            {onBackToHome && (
                <div style={{ position: "absolute", top: "18px", left: "20px", zIndex: 10 }}>
                    <button
                        onClick={onBackToHome}
                        style={{
                            padding: "8px 16px",
                            backgroundColor: "rgba(15, 23, 42, 0.85)",
                            color: "#38bdf8",
                            border: "1.5px solid #38bdf8",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontWeight: "bold",
                            fontSize: "13px"
                        }}
                    >
                        ⬅️ HOME MENU
                    </button>
                </div>
            )}

            {/* Top-Right Mode Switcher Buttons */}
            {!isOnline && (
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

                    <button
                        onClick={() => handleModeSwitch('NEW_BOWLER')}
                        style={{
                            padding: "8px 16px",
                            backgroundColor: gameMode === 'NEW_BOWLER' ? "#10b981" : "rgba(15, 23, 42, 0.85)",
                            color: gameMode === 'NEW_BOWLER' ? "#ffffff" : "#94a3b8",
                            border: `1.5px solid ${gameMode === 'NEW_BOWLER' ? "#34d399" : "rgba(255,255,255,0.2)"}`,
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontWeight: "bold",
                            fontSize: "13px",
                            boxShadow: gameMode === 'NEW_BOWLER' ? "0 0 12px rgba(16, 185, 129, 0.5)" : "none",
                            transition: "all 0.2s ease"
                        }}
                    >
                        🏃 NEW BOWLER MODE
                    </button>

                    <button
                        onClick={() => handleModeSwitch('DEBUG_13_FRAMES')}
                        style={{
                            padding: "8px 16px",
                            backgroundColor: gameMode === 'DEBUG_13_FRAMES' ? "#8b5cf6" : "rgba(15, 23, 42, 0.85)",
                            color: gameMode === 'DEBUG_13_FRAMES' ? "#ffffff" : "#94a3b8",
                            border: `1.5px solid ${gameMode === 'DEBUG_13_FRAMES' ? "#c4b5fd" : "rgba(255,255,255,0.2)"}`,
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontWeight: "bold",
                            fontSize: "13px",
                            boxShadow: gameMode === 'DEBUG_13_FRAMES' ? "0 0 12px rgba(139, 92, 246, 0.5)" : "none",
                            transition: "all 0.2s ease"
                        }}
                    >
                        🐛 13 FRAMES DEBUG
                    </button>
                </div>
            )}

            <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
            />
        </div>
    );
}

export default GameCanvas;