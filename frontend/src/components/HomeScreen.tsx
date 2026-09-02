import React from "react";

interface HomeScreenProps {
    onSelectMode: (mode: "OFFLINE" | "ONLINE") => void;
}

export default function HomeScreen({ onSelectMode }: HomeScreenProps) {
    return (
        <div style={{
            width: "100vw",
            height: "100vh",
            backgroundColor: "#0b0f19",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
            color: "#ffffff",
            backgroundImage: "radial-gradient(circle at 50% 30%, #1e293b 0%, #0b0f19 70%)"
        }}>
            {/* Header / Game Title */}
            <div style={{ textAlign: "center", marginBottom: "50px" }}>
                <h1 style={{
                    fontSize: "48px",
                    fontWeight: "900",
                    letterSpacing: "3px",
                    margin: "0 0 10px 0",
                    background: "linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    textShadow: "0 10px 25px rgba(56, 189, 248, 0.3)"
                }}>
                    🏏 PRO CRICKET 2D
                </h1>
                <p style={{
                    fontSize: "16px",
                    color: "#94a3b8",
                    margin: 0,
                    letterSpacing: "1px",
                    textTransform: "uppercase"
                }}>
                    Real-Time WebRTC Multiplayer Physics Engine
                </p>
            </div>

            {/* Mode Selection Cards Container */}
            <div style={{
                display: "flex",
                gap: "24px",
                flexWrap: "wrap",
                justifyContent: "center"
            }}>
                {/* 🎮 OFFLINE PRACTICE MODE CARD */}
                <div 
                    onClick={() => onSelectMode("OFFLINE")}
                    style={{
                        width: "280px",
                        padding: "30px 24px",
                        backgroundColor: "rgba(30, 41, 59, 0.7)",
                        border: "1.5px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "16px",
                        backdropFilter: "blur(12px)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        textAlign: "center",
                        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)"
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-6px)";
                        e.currentTarget.style.borderColor = "#38bdf8";
                        e.currentTarget.style.boxShadow = "0 12px 40px rgba(56, 189, 248, 0.25)";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
                        e.currentTarget.style.boxShadow = "0 8px 32px rgba(0, 0, 0, 0.3)";
                    }}
                >
                    <div style={{ fontSize: "44px", marginBottom: "16px" }}>🎮</div>
                    <h2 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 8px 0", color: "#f8fafc" }}>
                        OFFLINE PRACTICE
                    </h2>
                    <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 20px 0", lineHeight: "1.5" }}>
                        Practice batting & bowling mechanics locally with instant resets.
                    </p>
                    <button style={{
                        padding: "10px 20px",
                        width: "100%",
                        backgroundColor: "#0284c7",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "8px",
                        fontWeight: "700",
                        fontSize: "14px",
                        cursor: "pointer",
                        transition: "background-color 0.2s"
                    }}>
                        PLAY OFFLINE
                    </button>
                </div>

                {/* 🌐 1v1 ONLINE MULTIPLAYER CARD */}
                <div 
                    onClick={() => onSelectMode("ONLINE")}
                    style={{
                        width: "280px",
                        padding: "30px 24px",
                        backgroundColor: "rgba(30, 41, 59, 0.7)",
                        border: "1.5px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "16px",
                        backdropFilter: "blur(12px)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        textAlign: "center",
                        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)"
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-6px)";
                        e.currentTarget.style.borderColor = "#22c55e";
                        e.currentTarget.style.boxShadow = "0 12px 40px rgba(34, 197, 94, 0.25)";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
                        e.currentTarget.style.boxShadow = "0 8px 32px rgba(0, 0, 0, 0.3)";
                    }}
                >
                    <div style={{ fontSize: "44px", marginBottom: "16px" }}>🌐</div>
                    <h2 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 8px 0", color: "#f8fafc" }}>
                        1v1 MULTIPLAYER
                    </h2>
                    <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 20px 0", lineHeight: "1.5" }}>
                        Play real-time 1v1 matches via C++ Server & WebRTC UDP stream.
                    </p>
                    <button style={{
                        padding: "10px 20px",
                        width: "100%",
                        backgroundColor: "#16a34a",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "8px",
                        fontWeight: "700",
                        fontSize: "14px",
                        cursor: "pointer",
                        transition: "background-color 0.2s"
                    }}>
                        PLAY ONLINE
                    </button>
                </div>
            </div>
        </div>
    );
}
