# 🏏 Pro Cricket 2D — Real-Time WebRTC Multiplayer Game Engine

![C++20](https://img.shields.io/badge/C++-20-00599C?style=for-the-badge&logo=cplusplus&logoColor=white)
![WebRTC](https://img.shields.io/badge/WebRTC-UDP_DataChannel-333333?style=for-the-badge&logo=webrtc&logoColor=white)
![uWebSockets](https://img.shields.io/badge/uWebSockets-Linux_epoll-black?style=for-the-badge)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-Bundler-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![CMake](https://img.shields.io/badge/CMake-Build_System-064F8C?style=for-the-badge&logo=cmake&logoColor=white)

A high-performance, ultra-low latency 2D multiplayer cricket game powered by a custom **C++20 server engine** and a **React 19 + HTML5 Canvas frontend**. Engineered for sub-millisecond network synchronization using **WebSockets (Linux kernel `epoll`)**, **WebRTC DataChannels over UDP**, and a **custom zero-padding binary wire protocol**.

---

## ⚡ Architecture & Real-Time Highlights

* **Linux Kernel `epoll` Multiplexing**: Built on `uWebSockets` / `uSockets` utilizing OS-level `epoll` to achieve high-throughput non-blocking asynchronous I/O with minimal CPU and memory footprints.
* **Dual-Channel WebRTC UDP Transport (`libdatachannel`)**:
  * **Unreliable UDP DataChannel**: Streams high-frequency 60Hz telemetry (bat swing angles, bowler runup/arm positions) where packet loss is preferred over latency/buffering.
  * **Reliable DataChannel**: Guarantees delivery for critical state changes (`MATCH_START`, `BOWLER_RELEASE`, and ball-bat `HIT_RESULT`).
* **Zero-Padding Custom Binary Wire Protocol (`#pragma pack(push, 1)`)**:
  * Eliminates compiler memory padding to achieve tight 1-byte struct alignment.
  * Replaces bloated JSON payloads with micro-sized binary packets (e.g., 19-byte bat swing packets), delivering an **~85% bandwidth reduction**.
* **Deterministic 60Hz Physics Tick Loop**:
  * Implemented using `std::chrono::steady_clock` to enforce strict 16.66ms tick intervals.
  * Includes automated tick-drop calculation and drift compensation to prevent physics desynchronization.
* **STUN/TURN NAT Traversal**: Integrates Google STUN and authenticated TURN relay fallbacks (`openrelay.metered.ca`) to bypass symmetric NATs and restrictive ISP firewalls.
* **Canvas Physics & Spatial Audio**: Features realistic bat swing inertia, ball trajectories, dynamic camera tracking, and a 16-region field audio system with ball-hit and crowd feedback.

---

## 📐 System Architecture & Network Flow

```text
 ┌─────────────────────────┐                           ┌─────────────────────────┐
 │   Browser A (BATSMAN)   │                           │   Browser B (BOWLER)    │
 │ React 19 + Canvas Engine│                           │ React 19 + Canvas Engine│
 └────────────┬────────────┘                           └────────────┬────────────┘
              │                                                     │
   WebSocket  │ 1. Signaling (SDP Offer / Answer / ICE Candidates)  │  WebSocket
   (TCP)      │                                                     │  (TCP)
              ▼                                                     ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │              C++20 Game Server (uWebSockets + epoll)                │
    │  - Player Matchmaking Queue (Batter vs Bowler Role Assignment)      │
    │  - Tick Synchronization (60Hz / 16.66ms intervals)                  │
    └─────────────────────────────────┬───────────────────────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              │ WebRTC PeerConnection (libdatachannel / UDP)  │
              └───────────────────────┬───────────────────────┘
                                      │
          ┌───────────────────────────┴───────────────────────────┐
          │                                                       │
          ▼                                                       ▼
┌───────────────────────────────┐               ┌───────────────────────────────┐
│     Unreliable UDP Stream     │               │     Reliable Event Stream     │
│  - 60Hz Bat Swing (19 Bytes)  │               │  - Match Start / Sync State   │
│  - 60Hz Bowler Arm (15 Bytes) │               │  - Bowler Release (23 Bytes)  │
│  - Bowler Runup Pos (11 Bytes)│               │  - Ball Hit Collision (31 B)  │
└───────────────────────────────┘               └───────────────────────────────┘
```

---

## 📡 Binary Wire Protocol Specification

All network packets share a common 7-byte header encoded in **Little-Endian** format (matching standard x86-64 memory layout).

### Packet Header (7 Bytes)
| Byte Offset | Field | Type | Description |
| :--- | :--- | :--- | :--- |
| `0` | `opcode` | `uint8_t` | Packet Type Identifier (`0x01` – `0x09`) |
| `1 – 4` | `senderId` | `uint32_t` | Unique Player ID |
| `5 – 6` | `tickNumber` | `uint16_t` | 60Hz Sequence Tick Counter (`0` to `65535`) |

### Packet Definitions
| Opcode | Packet Name | Total Size | Transport | Payload Fields |
| :---: | :--- | :---: | :---: | :--- |
| `0x01` | `BOWLER_RELEASE` | **23 Bytes** | Reliable | `startX (f32)`, `startY (f32)`, `startVx (f32)`, `startVy (f32)` |
| `0x02` | `BAT_SWING_STREAM` | **19 Bytes** | Unreliable UDP | `handleX (f32)`, `handleY (f32)`, `batAngle (f32)` |
| `0x03` | `HIT_RESULT` | **31 Bytes** | Reliable | `exitPosX (f32)`, `exitPosY (f32)`, `exitVelX (f32)`, `exitVelY (f32)` |
| `0x06` | `BOWLER_POSITION` | **11 Bytes** | Reliable | `currentHipX (f32)` |
| `0x07` | `BOWLER_START_RUN` | **7 Bytes** | Reliable | *(Header only)* |
| `0x09` | `BOWLER_JOYSTICK_STREAM` | **15 Bytes** | Unreliable UDP | `screenX (f32)`, `screenY (f32)` |

---

## 📁 Repository Structure

```text
Cricket/
├── backend/                       # C++20 High-Performance Game Server
│   ├── libs/
│   │   ├── json/                  # nlohmann/json for WebSocket signaling
│   │   └── uWebSockets/           # epoll-backed WebSocket & networking engine
│   ├── src/
│   │   ├── Config.h               # Server ports, tick rates (60Hz / 16.66ms)
│   │   ├── GameServer.h / .cpp    # 60Hz monotonic physics tick loop
│   │   ├── MatchState.h           # Lobby, In-Match, and State Enums
│   │   ├── NetworkManager.h / .cpp# uWebSockets server & matchmaking pairing
│   │   ├── NetworkProtocol.h      # Packed binary packet structs (#pragma pack)
│   │   ├── Player.h               # Player state, role (Batter/Bowler), opponent link
│   │   ├── RTCManager.h           # libdatachannel WebRTC UDP peer connection
│   │   └── main.cpp               # Server entry point
│   └── CMakeLists.txt             # Modern CMake build configuration
│
└── frontend/                      # React 19 + TypeScript + Vite Client
    ├── public/
    │   ├── assets/                # Pitch textures, grass ground, cricket ball
    │   └── sounds/                # 16-region audio commentary, bat hits, handles
    └── src/
        ├── components/
        │   ├── HomeScreen.tsx     # Mode selection (Offline Practice vs Online)
        │   └── GameCanvas.tsx     # Main canvas game viewport
        ├── game/
        │   ├── GameLoop.ts        # Client-side 60Hz physics & rendering loop
        │   ├── GroundRenderer.ts  # Field boundary, grass, and pitch rendering
        │   ├── Camera.ts          # Smooth dynamic ball & player tracking
        │   ├── Joystick.ts        # Analog bat/bowler controls
        │   └── constants.ts       # Physics constraints, speeds, dimensions
        ├── network/
        │   ├── NetworkManager.ts  # WebSocket signaling & WebRTC DataChannel client
        │   └── NetworkProtocol.ts # DataView binary serialization (ArrayBuffer)
        ├── App.tsx                # Application shell
        └── main.tsx               # Client entry point
```

---

## 🛠️ Build & Installation

### Prerequisites
* **C++ Compiler**: GCC 11+ or Clang 13+ with C++20 support
* **CMake**: Version 3.15 or higher
* **Make / Ninja**: Build tool
* **Node.js**: v18.0.0 or higher
* **npm**: v9.0.0 or higher
* **Operating System**: Linux recommended (Ubuntu / Debian / Fedora / Arch) for native `epoll` support

---

### 1. Build & Run C++ Backend Server

```bash
cd backend

# Create build directory
mkdir -p build && cd build

# Configure with CMake (automatically fetches libdatachannel via FetchContent)
cmake ..

# Compile server binary
cmake --build . -j$(nproc)

# Start Game Server (runs on port 8080 by default)
./CricketServer
```

---

### 2. Run React Frontend Client

In a separate terminal:

```bash
cd frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```

*Open your browser at `http://localhost:5173` to launch the game.*

---

## 🎮 How to Play

### 1. Game Modes
* **Offline Practice**: Test batting swings, timing, and ball physics against automated bowling trajectories.
* **Online Multiplayer**: Connects two players via the C++ server. Player 1 is assigned **BATSMAN**, and Player 2 is assigned **BOWLER**.

### 2. Controls
* **Batter**:
  * **Mouse / On-Screen Joystick**: Move bat handle and adjust swing angle.
  * **Timing**: Strike the ball near the center of the bat blade for maximum boundary exit velocity.
* **Bowler**:
  * **Spacebar**: Initiate bowler run-up towards the crease.
  * **Left Click / Mouse Drag**: Aim release trajectory angle and pitch point before the bowling crease line.

---

## 🔬 Performance Comparison: Binary Protocol vs JSON

| Metric | Traditional JSON WebSocket | Pro Cricket 2D Custom Protocol | Improvement |
| :--- | :---: | :---: | :---: |
| **Bat Swing Packet Size** | ~140 – 180 Bytes | **19 Bytes** | **~88% Smaller** |
| **Release Packet Size** | ~190 – 240 Bytes | **23 Bytes** | **~89% Smaller** |
| **Serialization Overhead** | JSON stringify / parse parsing | Direct memory copy (`memcpy` / `DataView`) | **Near Zero CPU Overhead** |
| **Transport Layer** | TCP (Head-of-Line blocking) | **WebRTC UDP DataChannel** | **Zero Queuing Delay** |
| **Tick Budget** | Uncontrolled | **Strict 16.66ms (60Hz)** | **Zero Micro-Stutter** |

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.
