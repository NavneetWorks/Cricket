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
    const [gameMode, setGameMode] = useState<'BATTING' | 'BOWLING' | 'NEW_BOWLER' | 'DEBUG_13_FRAMES' | 'ANIMATION_PLAY'>('BATTING');
    
    const [sensitivity, setSensitivity] = useState<number>(() => {
        const saved = localStorage.getItem("cricket_sensitivity");
        return saved ? parseInt(saved, 10) : 50;
    });
    const [showSettings, setShowSettings] = useState<boolean>(false);

    useEffect(() => {

        const canvas = canvasRef.current;

        if (!canvas) return;

        const ctx = canvas.getContext("2d");

        if (!ctx) return;

        const input = new Input(canvas);
        input.userSensitivity = sensitivity;

        const bat = new Bat();

        const gameLoop = new GameLoop(ctx, bat,input,isOnline);
        gameLoopRef.current = gameLoop;

        gameLoop.start();

    }, []);

    useEffect(() => {
        if (gameLoopRef.current && (gameLoopRef.current as any).input) {
            (gameLoopRef.current as any).input.userSensitivity = sensitivity;
        }
    }, [sensitivity]);

    const handleSensitivityChange = (val: number) => {
        const clamped = Math.max(0, Math.min(100, val));
        setSensitivity(clamped);
        localStorage.setItem("cricket_sensitivity", clamped.toString());
        if (gameLoopRef.current && (gameLoopRef.current as any).input) {
            (gameLoopRef.current as any).input.userSensitivity = clamped;
        }
    };

    const [debugFilterText, setDebugFilterText] = useState<string>("3, 6, 7");
    const [debugSource, setDebugSource] = useState<'RUNUP' | 'JUMP'>('RUNUP');

    const handleModeSwitch = (mode: 'BATTING' | 'BOWLING' | 'NEW_BOWLER' | 'DEBUG_13_FRAMES' | 'ANIMATION_PLAY') => {
        setGameMode(mode);
        if (gameLoopRef.current) {
            (gameLoopRef.current as any).setGameMode(mode);
            if (mode === 'DEBUG_13_FRAMES') {
                applyDebugFrames(debugFilterText, debugSource);
            }
        }
    };

    const applyDebugFrames = (text: string, source: 'RUNUP' | 'JUMP') => {
        setDebugFilterText(text);
        setDebugSource(source);
        if (gameLoopRef.current && (gameLoopRef.current as any).renderer) {
            const renderer = (gameLoopRef.current as any).renderer;
            renderer.debugFrameSource = source;
            const numbers = text
                .split(/[\s,]+/)
                .map(s => parseInt(s.trim(), 10))
                .filter(n => !isNaN(n) && n > 0);
            renderer.debugSelectedFrames = numbers;
        }
    };

    const toggleFrameChip = (frameNum: number) => {
        const currentNums = debugFilterText
            .split(/[\s,]+/)
            .map(s => parseInt(s.trim(), 10))
            .filter(n => !isNaN(n) && n > 0);

        let updated: number[];
        if (currentNums.includes(frameNum)) {
            updated = currentNums.filter(n => n !== frameNum);
        } else {
            updated = [...currentNums, frameNum].sort((a, b) => a - b);
        }
        applyDebugFrames(updated.join(", "), debugSource);
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
                            backgroundColor: gameMode === 'BOWLING' ? "#e11d48" : "rgba(15, 23, 42, 0.85)",
                            color: gameMode === 'BOWLING' ? "#ffffff" : "#94a3b8",
                            border: `1.5px solid ${gameMode === 'BOWLING' ? "#fb7185" : "rgba(255,255,255,0.2)"}`,
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontWeight: "bold",
                            fontSize: "13px",
                            boxShadow: gameMode === 'BOWLING' ? "0 0 12px rgba(225, 29, 72, 0.5)" : "none",
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
                        onClick={() => handleModeSwitch('ANIMATION_PLAY')}
                        style={{
                            padding: "8px 16px",
                            backgroundColor: gameMode === 'ANIMATION_PLAY' ? "#f59e0b" : "rgba(15, 23, 42, 0.85)",
                            color: gameMode === 'ANIMATION_PLAY' ? "#ffffff" : "#94a3b8",
                            border: `1.5px solid ${gameMode === 'ANIMATION_PLAY' ? "#fbbf24" : "rgba(255,255,255,0.2)"}`,
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontWeight: "bold",
                            fontSize: "13px",
                            boxShadow: gameMode === 'ANIMATION_PLAY' ? "0 0 12px rgba(245, 158, 11, 0.5)" : "none",
                            transition: "all 0.2s ease"
                        }}
                    >
                        🎬 ANIMATION PLAY
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

                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        style={{
                            padding: "8px 16px",
                            backgroundColor: showSettings ? "#eab308" : "rgba(15, 23, 42, 0.85)",
                            color: showSettings ? "#000000" : "#facc15",
                            border: "1.5px solid #facc15",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontWeight: "bold",
                            fontSize: "13px",
                            boxShadow: showSettings ? "0 0 12px rgba(234, 179, 8, 0.5)" : "none",
                            transition: "all 0.2s ease"
                        }}
                    >
                        ⚙️ SETTINGS ({sensitivity})
                    </button>
                </div>
            )}

            {/* ⚙️ BATTING SENSITIVITY SETTINGS MODAL */}
            {showSettings && (
                <div style={{
                    position: "absolute",
                    top: "65px",
                    right: "20px",
                    width: "320px",
                    backgroundColor: "rgba(15, 23, 42, 0.95)",
                    backdropFilter: "blur(12px)",
                    border: "1.5px solid rgba(234, 179, 8, 0.5)",
                    borderRadius: "12px",
                    padding: "20px",
                    boxShadow: "0 16px 36px rgba(0, 0, 0, 0.6)",
                    zIndex: 100,
                    color: "#ffffff"
                }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "#facc15" }}>⚙️ BATTING SETTINGS</h3>
                        <button
                            onClick={() => setShowSettings(false)}
                            style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "18px" }}
                        >
                            ✕
                        </button>
                    </div>

                    <div style={{ marginBottom: "20px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                            <label style={{ fontSize: "14px", fontWeight: "600", color: "#f8fafc" }}>Bat Sensitivity</label>
                            <span style={{ fontSize: "14px", fontWeight: "700", color: "#facc15" }}>{sensitivity} / 100</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={sensitivity}
                            onChange={(e) => handleSensitivityChange(parseInt(e.target.value, 10))}
                            style={{
                                width: "100%",
                                height: "6px",
                                accentColor: "#facc15",
                                cursor: "pointer"
                            }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                            <span>0 (Slow)</span>
                            <span>50 (Default)</span>
                            <span>100 (Max)</span>
                        </div>
                    </div>

                    {/* Quick Presets */}
                    <div style={{ display: "flex", gap: "8px", justifyContent: "space-between" }}>
                        {[25, 50, 75, 100].map((preset) => (
                            <button
                                key={preset}
                                onClick={() => handleSensitivityChange(preset)}
                                style={{
                                    flex: 1,
                                    padding: "6px 0",
                                    backgroundColor: sensitivity === preset ? "#facc15" : "rgba(255, 255, 255, 0.05)",
                                    color: sensitivity === preset ? "#000000" : "#94a3b8",
                                    border: `1px solid ${sensitivity === preset ? "#facc15" : "rgba(255, 255, 255, 0.1)"}`,
                                    borderRadius: "6px",
                                    fontSize: "12px",
                                    fontWeight: "bold",
                                    cursor: "pointer"
                                }}
                            >
                                {preset}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* DEBUG FRAME FILTER TOOLBAR OVERLAY */}
            {gameMode === 'DEBUG_13_FRAMES' && (
                <div style={{
                    position: "absolute",
                    top: "65px",
                    left: "20px",
                    right: "20px",
                    backgroundColor: "rgba(15, 23, 42, 0.92)",
                    backdropFilter: "blur(8px)",
                    border: "1.5px solid rgba(139, 92, 246, 0.4)",
                    borderRadius: "10px",
                    padding: "10px 16px",
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "12px",
                    zIndex: 10,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.4)"
                }}>
                    {/* Source Selector */}
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <span style={{ color: "#c4b5fd", fontSize: "12px", fontWeight: "bold" }}>SOURCE:</span>
                        <button
                            onClick={() => applyDebugFrames(debugFilterText, 'RUNUP')}
                            style={{
                                padding: "4px 10px",
                                backgroundColor: debugSource === 'RUNUP' ? "#8b5cf6" : "rgba(255,255,255,0.08)",
                                color: "#ffffff",
                                border: "1px solid #8b5cf6",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: "bold",
                                cursor: "pointer"
                            }}
                        >
                            🏃 RUNUP (STATIC)
                        </button>
                        <button
                            onClick={() => applyDebugFrames(debugFilterText, 'JUMP')}
                            style={{
                                padding: "4px 10px",
                                backgroundColor: debugSource === 'JUMP' ? "#e11d48" : "rgba(255,255,255,0.08)",
                                color: "#ffffff",
                                border: "1px solid #e11d48",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: "bold",
                                cursor: "pointer"
                            }}
                        >
                            🦘 JUMP & LANDING
                        </button>
                    </div>

                    {/* Text Filter Input */}
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexGrow: 1 }}>
                        <span style={{ color: "#38bdf8", fontSize: "12px", fontWeight: "bold" }}>SHOW FRAMES:</span>
                        <input
                            type="text"
                            value={debugFilterText}
                            placeholder="Type frame numbers e.g. 3, 6, 7"
                            onChange={(e) => applyDebugFrames(e.target.value, debugSource)}
                            style={{
                                padding: "5px 12px",
                                width: "180px",
                                backgroundColor: "rgba(30, 41, 59, 0.9)",
                                color: "#f8fafc",
                                border: "1px solid #38bdf8",
                                borderRadius: "6px",
                                fontSize: "13px",
                                fontWeight: "600",
                                outline: "none"
                            }}
                        />
                    </div>

                    {/* Presets */}
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: "bold" }}>PRESETS:</span>
                        <button
                            onClick={() => applyDebugFrames("3, 6, 7", debugSource)}
                            style={{
                                padding: "4px 8px",
                                backgroundColor: "rgba(56, 189, 248, 0.15)",
                                color: "#38bdf8",
                                border: "1px solid #38bdf8",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: "bold",
                                cursor: "pointer"
                            }}
                        >
                            3, 6, 7
                        </button>
                        <button
                            onClick={() => applyDebugFrames("1, 6, 13", debugSource)}
                            style={{
                                padding: "4px 8px",
                                backgroundColor: "rgba(56, 189, 248, 0.15)",
                                color: "#38bdf8",
                                border: "1px solid #38bdf8",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: "bold",
                                cursor: "pointer"
                            }}
                        >
                            1, 6, 13
                        </button>
                        <button
                            onClick={() => applyDebugFrames("", debugSource)}
                            style={{
                                padding: "4px 8px",
                                backgroundColor: "rgba(148, 163, 184, 0.2)",
                                color: "#cbd5e1",
                                border: "1px solid #94a3b8",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: "bold",
                                cursor: "pointer"
                            }}
                        >
                            SHOW ALL
                        </button>
                    </div>

                    {/* Quick Frame Toggle Chips (1 to 14) */}
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", width: "100%", paddingTop: "4px" }}>
                        {Array.from({ length: debugSource === 'JUMP' ? 6 : 14 }, (_, i) => i + 1).map((fNum) => {
                            const isSelected = debugFilterText
                                .split(/[\s,]+/)
                                .map(s => parseInt(s.trim(), 10))
                                .includes(fNum);
                            return (
                                <button
                                    key={fNum}
                                    onClick={() => toggleFrameChip(fNum)}
                                    style={{
                                        padding: "2px 8px",
                                        backgroundColor: isSelected ? "#8b5cf6" : "rgba(30, 41, 59, 0.6)",
                                        color: isSelected ? "#ffffff" : "#64748b",
                                        border: `1px solid ${isSelected ? "#c4b5fd" : "rgba(255,255,255,0.1)"}`,
                                        borderRadius: "4px",
                                        fontSize: "11px",
                                        fontWeight: isSelected ? "bold" : "normal",
                                        cursor: "pointer"
                                    }}
                                >
                                    F{fNum}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                style={{ cursor: "none" }}
            />
        </div>
    );
}

export default GameCanvas;