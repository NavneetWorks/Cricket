
// 🟢 FIXED CODE (Replace export enum with export const):
export const PacketType = {
    BOWLER_RELEASE: 0x01,   // 23 Bytes: Release Pos & Velocity
    BAT_SWING_STREAM: 0x02, // 19 Bytes: 60Hz Bat pose
    HIT_RESULT: 0x03,
    PING:0x04,
    PONG:0x05        
} as const;

export type PacketType = typeof PacketType[keyof typeof PacketType];

// 1. Serialize Bowler Release Packet (23 Bytes) - RELIABLE
export function serializeBowlerRelease(
    senderId: number,
    tickNumber: number,
    startX: number,
    startY: number,
    startVx: number,
    startVy: number
): ArrayBuffer {
    const buffer = new ArrayBuffer(23);
    const view = new DataView(buffer);
    
    view.setUint8(0, PacketType.BOWLER_RELEASE);
    view.setUint32(1, senderId, true);   // Little-Endian (C++ compatible)
    view.setUint16(5, tickNumber, true); // Little-Endian
    view.setFloat32(7, startX, true);
    view.setFloat32(11, startY, true);
    view.setFloat32(15, startVx, true);
    view.setFloat32(19, startVy, true);
    
    return buffer;
}

// 2. Serialize Bat Swing Packet (19 Bytes) - UNRELIABLE (60Hz UDP)
export function serializeBatSwing(
    senderId: number,
    tickNumber: number,
    handleX: number,
    handleY: number,
    batAngle: number
): ArrayBuffer {
    const buffer = new ArrayBuffer(19);
    const view = new DataView(buffer);
    
    view.setUint8(0, PacketType.BAT_SWING_STREAM);
    view.setUint32(1, senderId, true);
    view.setUint16(5, tickNumber, true);
    view.setFloat32(7, handleX, true);
    view.setFloat32(11, handleY, true);
    view.setFloat32(15, batAngle, true);
    
    return buffer;
}

// 3. Serialize Hit Result Packet (23 Bytes) - RELIABLE
export function serializeHitResult(
    senderId: number,
    tickNumber: number,
    exitPosX: number,
    exitPosY: number,
    exitVelX: number,
    exitVelY: number
): ArrayBuffer {
    const buffer = new ArrayBuffer(23);
    const view = new DataView(buffer);
    
    view.setUint8(0, PacketType.HIT_RESULT);
    view.setUint32(1, senderId, true);
    view.setUint16(5, tickNumber, true);
    view.setFloat32(7, exitPosX, true);
    view.setFloat32(11, exitPosY, true);
    view.setFloat32(15, exitVelX, true);
    view.setFloat32(19, exitVelY, true);
    
    return buffer;
}

export function serializePing(senderId:number,sequeneceNumber:number):ArrayBuffer{
    const buffer = new ArrayBuffer(7);
    const view = new DataView(buffer);
    view.setUint8(0,PacketType.PING);
    view.setUint32(1,senderId,true);
    view.setUint16(5,sequeneceNumber,true);
    return buffer;
}

export function serializePong(senderId:number,sequeneceNumber:number):ArrayBuffer{
    const buffer  = new ArrayBuffer(7);
    const view = new DataView(buffer);
    view.setUint8(0,PacketType.PONG);
    view.setUint32(1,senderId,true);
    view.setUint16(5,sequeneceNumber,true);
    return buffer;
}