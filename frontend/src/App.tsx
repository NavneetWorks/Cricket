import { useState } from "react";
import "./App.css";
import HomeScreen from "./components/HomeScreen";
import GameCanvas from "./components/GameCanvas";

type ScreenMode = "HOME" | "OFFLINE" | "ONLINE";

function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenMode>("HOME");

  return (
    <div style={{ width: "100vw", height: "100vh", backgroundColor: "#0b0f19", overflow: "hidden" }}>
      {currentScreen === "HOME" && (
        <HomeScreen
          onSelectMode={(mode) => setCurrentScreen(mode)}
        />
      )}

      {currentScreen === "OFFLINE" && (
        <div style={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <GameCanvas isOnline={false} onBackToHome={() => setCurrentScreen("HOME")} />
        </div>
      )}

      {currentScreen === "ONLINE" && (
        <div style={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <GameCanvas isOnline={true} onBackToHome={() => setCurrentScreen("HOME")} />
        </div>
      )}
    </div>
  );
}

export default App;