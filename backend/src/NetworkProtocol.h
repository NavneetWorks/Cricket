#pragma once
#include <cstdint>

// Enforce tight 1-byte memory alignment (Zero compiler memory padding!)
#pragma pack(push, 1)

// 1. Packet Types / Opcodes (1 Byte Tag)
enum class PacketType : uint8_t {
    BOWLER_RELEASE   = 0x01, // Reliable Event: Bowler release initial state
    BAT_SWING_STREAM = 0x02, // Unreliable 60Hz UDP Stream: Bat pose
    HIT_RESULT       = 0x03  // Reliable Event: Ball-Bat collision exit
};

// 2. Common Packet Header (7 Bytes Total)
struct PacketHeader {
    uint8_t opcode;      // 1 Byte  (0x01, 0x02, 0x03)
    uint32_t senderId;   // 4 Bytes (Player ID)
    uint16_t tickNumber; // 2 Bytes (60Hz Tick Counter: 0 to 65535)
};

// 3. Bowler Release Packet (23 Bytes Total) - RELIABLE EVENT
struct BowlerReleasePacket {
    PacketHeader header; // 7 Bytes
    float startX;        // 4 Bytes
    float startY;        // 4 Bytes
    float startVx;       // 4 Bytes
    float startVy;       // 4 Bytes
};

// 4. Bat Swing Stream Packet (19 Bytes Total) - UNRELIABLE (60Hz UDP)
struct BatSwingPacket {
    PacketHeader header; // 7 Bytes
    float handleX;       // 4 Bytes
    float handleY;       // 4 Bytes
    float batAngle;      // 4 Bytes (Clockwise angle)
};

// 5. Collision Hit Result Packet (23 Bytes Total) - RELIABLE EVENT
struct HitResultPacket {
    PacketHeader header; // 7 Bytes
    float exitPosX;      // 4 Bytes
    float exitPosY;      // 4 Bytes
    float exitVelX;      // 4 Bytes
    float exitVelY;      // 4 Bytes
};

#pragma pack(pop)