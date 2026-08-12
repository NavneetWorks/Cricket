export const GAME_COLORS = {
    SKY: "#87CEEB",
    GROUND: "#3CB043",
   PITCH: "#D8C28A",
    STUMP: "#F5F5DC",
    BAT: "#8B5A2B",
    BALL: "#B22222",
};
export const PITCH_WIDTH = 180;
export const QUEUE_SIZE = 3;
export const NORMAL_DIRECTION_ASSIST = 50; // 0 to 100 scale. E.g. 10 = bends 10% towards Normal

export const GLOBAL_RESTITUTION_SCALE = 1.5;
export const REGION1 = 2;
export const REGION2 = REGION1;
export const REGION3 = REGION1;
export const REGION4 = REGION1;
export const REGION5 = REGION1;
export const REGION6 = REGION1;
export const REGION7 = REGION1;
export const REGION8 = REGION1;
export const REGION9 = REGION1;
export const REGION10 = REGION1;
export const REGION11 = REGION1;
export const REGION12 = REGION1;
export const REGION13 = REGION1;
export const REGION14 = REGION1;
export const REGION15 = 6;
export const REGION16 = 8; // Start Sweet Spot
export const REGION17 = 10;
export const REGION18 = 12;
export const REGION19 = 14;
export const REGION20 = 15;
export const REGION21 = 16;
export const REGION22 = 18;
export const REGION23 = 20;
export const REGION24 = 22;
export const REGION25 = 24;
export const REGION26 = 26;
export const REGION27 = 28;
export const REGION28 = 29;
export const REGION29 = 30;
export const REGION30 = 30; // End Sweet Spot
export const REGION31 = 30;
export const REGION32 = 30;
export const REGION33 = 30;
export const REGION34 = 30;
export const REGION35 = 30;
export const REGION36 = 27;
export const REGION37 = 24;
export const REGION38 = 21;
export const REGION39 = 17;
export const REGION40 = 15;
export const REGION41 = 8;
export const REGION42 = 1;

export const BAT_REGIONS_RESTITUTION = [
    REGION1, REGION2, REGION3, REGION4, REGION5, REGION6, REGION7, REGION8, REGION9, REGION10,
    REGION11, REGION12, REGION13, REGION14, REGION15, REGION16, REGION17, REGION18, REGION19, REGION20,
    REGION21, REGION22, REGION23, REGION24, REGION25, REGION26, REGION27, REGION28, REGION29, REGION30,
    REGION31, REGION32, REGION33, REGION34, REGION35, REGION36, REGION37, REGION38, REGION39, REGION40,
    REGION41, REGION42
];
export const PITCH_HEIGHT = 18;

export const CANVAS_WIDTH = 1800;

export const CANVAS_HEIGHT = 825;

export const GROUND_HEIGHT = 72;

export const BAT_CENTER_OF_MASS_RATIO = 0.75;

export const GRAVITY = 3966;

//export const RESTITUTION_BAT = 0.1; // Bat aur Ball ki takkar ka bounce
export const RESTITUTION_GROUND = 0.6; // Zameen aur Ball ki takkar ka bounce

export const TARGET_ANGLE_THRESHOLD = 0.02;

export const TARGET_ANGULAR_VELOCITY_THRESHOLD = 0.02;

//neck to hip 

export const NECT_TO_HIP_RATIO = 100

//legs

export const FULL_LEG_LENGTH = 185; // 43 % thigh;

export const THIGH_LENGTH = 80; // 43 % thigh;

export const SHIN_LENGTH = 105;

export const LEG_WIDTH_AT_GROUND = 100;

export const LEG_WIDTH_AT_HIP = 40;

export const OUTER_ARC_SCALE = 1;
export const INNER_ARC_SCALE = 1.2;
export const HORIZONTAL_TILT_SPEED_SCALE = 0.002;





export const k_values: number[] = new Array(70);
k_values[0] = -0.2;  // -30
k_values[1] =  -0.2; // -27
k_values[2] =  -0.2;  // -24
k_values[3] =  -0.2;  // -21
k_values[4] = -0.2;  // -18
k_values[5] = -0.2;  // -15
k_values[6] = -0.2;  // -12
k_values[7] = -0.2;  // -9
k_values[8] = -0.2;  // -6
k_values[9] = -0.2;  // -3
k_values[10] = -0.2; // 0
k_values[11] = -0.2; // 3
k_values[12] = -0.2; // 6
k_values[13] = -0.2; // 9
k_values[14] = -0.2;// 12
k_values[15] = -0.2; // 15
k_values[16] = -0.2; // 18
k_values[17] = -0.15;  // 21
k_values[18] = -0.15;  // 24 
k_values[19] =  -0.125;  // 27
k_values[20] = -0.125;  // 30
k_values[21] = -0.1;  // 33 
k_values[22] = -0.1;  // 36
k_values[23] = -0.0;  // 39
k_values[24] =  0.0;  // 42
k_values[25] = 0.0;  // 45
k_values[26] = 0.0;  // 48
k_values[27] = 0.0;  // 51
k_values[28] = 0.1;  // 54
k_values[29] = 0.2;  // 57
k_values[30] = 0.3;  // 60
k_values[31] = 0.4; // 63
k_values[32] = 0.45; // 66
k_values[33] = 0.5; // 69
k_values[34] = 0.55; // 72
k_values[35] = 0.6; // 75
k_values[36] = 0.65; // 78
k_values[37] = 0.7;  // 81
k_values[38] = 2.75;  // 84
k_values[39] = 2.8;  // 87
k_values[40] = 2.85;  // 90
k_values[41] = 2.0;  // 93
k_values[42] = 2.0;  // 96
k_values[43] = 2.0;  // 99
k_values[44] = 2.0;  // 102
k_values[45] = 1.0;  // 105
k_values[46] = 1.0;  // 108
k_values[47] = 1.0;  // 111
k_values[48] = 1.0;  // 114
k_values[49] = 1.0;  // 117
k_values[50] = 0.95;  // 120
k_values[51] = 0.9;  // 123
k_values[52] = 0.85;  // 126
k_values[53] = 0.8;  // 129
k_values[54] = 0.75;  // 132
k_values[55] = 0.7;  // 135
k_values[56] = 0.65;  // 138
k_values[57] = 0.6;  // 141
k_values[58] = 0.55;  // 144
k_values[59] = 0.5;  // 147
k_values[60] = 0.5;  // 150
k_values[61] = 0.5;  // 153
k_values[62] = 0.5;  // 156
k_values[63] = 0.5;  // 159
k_values[64] = 0.5;  // 162
k_values[65] = 0.5;  // 165
k_values[66] = 0.5;  // 168
k_values[67] = 0.5;  // 171
k_values[68] = 0.5;  // 174
k_values[69] = 0.5;  // 177

// 84 Regions (2 pixels per region for 168px total bat length)
// Indices 0..27: 56px Handle & Grip (thickness = 12mm)
// Indices 28..83: 112px Blade wood profile (thickness 14mm -> 42mm sweetspot -> 18mm toe)
export const BAT_THICKNESS_PROFILE: number[] = [
    // 0..9 (Handle Top & Upper Grip)
    12, 12, 12, 12, 12, 12, 12, 12, 12, 12,
    // 10..19 (Handle Mid Grip)
    12, 12, 12, 12, 12, 12, 12, 12, 12, 12,
    // 20..27 (Handle Lower Grip - End of 56px Handle)
    12, 12, 12, 12, 12, 12, 12, 12,
    // 28..37 (Shoulder Transition: 14mm to 23mm)
    14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    // 38..47 (Upper Blade: 24mm to 33mm)
    24, 25, 26, 27, 28, 29, 30, 31, 32, 33,
    // 48..57 (Sweetspot Swell Start: 34mm to 42mm)
    34, 35, 36, 37, 38, 39, 40, 41, 42, 42,
    // 58..67 (Sweetspot Swell Peak & Spine: 42mm to 35mm)
    42, 42, 42, 42, 41, 40, 39, 38, 37, 35,
    // 68..77 (Lower Blade Taper: 34mm to 22mm)
    34, 33, 32, 31, 30, 28, 26, 25, 24, 22,
    // 78..83 (Toe End: 20mm to 18mm)
    20, 19, 18, 18, 18, 18
];