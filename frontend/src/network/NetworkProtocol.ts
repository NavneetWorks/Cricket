
export const PacketType = {
    BOWLER_RELEASE: 0x01,        // 23 Bytes: Release Pos & Velocity (Reliable)
    BAT_SWING_STREAM: 0x02,      // 19 Bytes: 60Hz Bat pose (Unreliable)
    HIT_RESULT: 0x03,            // 31 Bytes: Collision outcome (Reliable)
    PING: 0x04,
    PONG: 0x05,
    BOWLER_POSITION: 0x06,       // 11 Bytes: Position updates (Reliable)
    BOWLER_START_RUN: 0x07,      // 7 Bytes: Space key runup start (Reliable)
    BOWLER_START_GATHER: 0x08,   // 11 Bytes: Left click gathering (Reliable)
    BOWLER_JOYSTICK_STREAM: 0x09 // 19 Bytes: 60Hz Bowler Arm Joystick (Unreliable)
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
// 2 making bolwer postion packet 



export function serializeBowlerPosition(senderId:number,tickNumber:number,currentHipX:number):ArrayBuffer{
    const buffer = new ArrayBuffer(11);
    const view = new DataView(buffer);

    view.setUint8(0,0x06);
    view.setUint32(1,senderId,true);
    view.setUint16(5,tickNumber,true);
    view.setFloat32(7,currentHipX,true);

    return buffer;
}

export function serializeBowlerStartRun(
    senderId: number,
    tickNumber: number
): ArrayBuffer {
    const buffer = new ArrayBuffer(7);
    const view = new DataView(buffer);
    
    view.setUint8(0, PacketType.BOWLER_START_RUN); // Opcode 0x07
    view.setUint32(1, senderId, true);
    view.setUint16(5, tickNumber, true);
    
    return buffer;
}

export function serializeBowlerJoystickStream(
    senderId: number,
    tickNumber: number,
    smoothAngleRad: number,
    smoothRadiusRatio: number
): ArrayBuffer {
    const buffer = new ArrayBuffer(19);
    const view = new DataView(buffer);
    
    view.setUint8(0, PacketType.BOWLER_JOYSTICK_STREAM); // Opcode 0x09
    view.setUint32(1, senderId, true);
    view.setUint16(5, tickNumber, true);
    view.setFloat32(7, smoothAngleRad, true);      // Exact Physics Arm Angle
    view.setFloat32(11, smoothRadiusRatio, true);  // Exact Arm Reach Ratio
    
    return buffer;
}


// 3. Serialize Bat Swing Packet (19 Bytes) - UNRELIABLE (60Hz UDP)
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

// 3. Serialize Hit Result Packet (31 Bytes) - RELIABLE

export function serializeHitResult(
    senderId: number,
    tickNumber: number,
    exitPosX: number,
    exitPosY: number,
    exitVelX: number,
    exitVelY: number,
    impactSpeed: number,
    hitPixelOffset: number
): ArrayBuffer {
    const buffer = new ArrayBuffer(31);
    const view = new DataView(buffer);

    view.setUint8(0, PacketType.HIT_RESULT);
    view.setUint32(1, senderId, true);
    view.setUint16(5, tickNumber, true);
    view.setFloat32(7, exitPosX, true);
    view.setFloat32(11, exitPosY, true);
    view.setFloat32(15, exitVelX, true);
    view.setFloat32(19, exitVelY, true);
    view.setFloat32(23, impactSpeed, true);
    view.setFloat32(27, hitPixelOffset, true);

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
export function serializeBowlerStartGather(
    senderId: number,
    tickNumber: number,
    clickX: number
): ArrayBuffer {
    const buffer = new ArrayBuffer(11);
    const view = new DataView(buffer);
    
    view.setUint8(0, PacketType.BOWLER_START_GATHER); // Opcode 0x08
    view.setUint32(1, senderId, true);
    view.setUint16(5, tickNumber, true);
    view.setFloat32(7, clickX, true);
    
    return buffer;
}