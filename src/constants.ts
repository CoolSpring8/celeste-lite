// ============================================================
//  游戏分辨率 & 瓦片
// ============================================================
export const TILE = 16;
export const COLS = 52;
export const ROWS = 30;
export const GAME_W = COLS * TILE; // 832
export const GAME_H = ROWS * TILE; // 480

// ============================================================
//  玩家碰撞箱 (比视觉略小 → 手感宽容)
// ============================================================
export const PW = 8; // hitbox width
export const PH = 14; // hitbox height
export const P_DRAW_W = 10; // visual width
export const P_DRAW_H = 16; // visual height

// ============================================================
//  水平移动
// ============================================================
export const MAX_RUN = 160; // 最大水平速度 px/s
export const RUN_ACCEL = 1400; // 地面加速度
export const RUN_DECEL = 1800; // 地面减速度（松手时快速停下）
export const AIR_ACCEL = 1100; // 空中加速度（略低 → 空中更飘）
export const AIR_DECEL = 700; // 空中减速度

// ============================================================
//  重力（非对称 —— 操控手感的灵魂）
// ============================================================
export const GRAVITY = 1200; // 正常重力
export const GRAVITY_PEAK = 500; // 跳跃顶点附近的重力（更轻 → 滞空感）
export const PEAK_THRESHOLD = 50; // |vy| 低于此值视为"顶点区间"
export const MAX_FALL = 300; // 终端下落速度

// ============================================================
//  跳跃
// ============================================================
export const JUMP_SPEED = -310; // 起跳瞬间的 vy（负数 = 向上）
export const JUMP_H_BOOST = 20; // 跳跃时给予额外水平速度加成
export const JUMP_CUT = 0.45; // 松开跳跃键时 vy 乘以此系数（短按 = 小跳）
export const COYOTE_TIME = 0.08; // 土狼时间（秒）
export const JUMP_BUFFER = 0.1; // 跳跃缓冲（秒）

// ============================================================
//  墙壁交互
// ============================================================
export const WALL_SLIDE_MAX = 60; // 滑墙最大下落速度
export const WALL_JUMP_H = 200; // 蹬墙跳水平速度
export const WALL_JUMP_V = -280; // 蹬墙跳垂直速度
export const WALL_JUMP_LOCK = 0.13; // 蹬墙跳后锁定水平输入的时间
export const WALL_STICK = 0.06; // 离墙后仍可蹬墙跳的宽容时间

// ============================================================
//  冲刺 (Dash)
// ============================================================
export const DASH_SPEED = 320; // 冲刺速度
export const DASH_TIME = 0.13; // 冲刺持续时间
export const DASH_FREEZE = 0.04; // 冲刺前的短暂冻结帧（蓄力感）
export const MAX_DASHES = 1; // 落地前可冲刺次数

// ============================================================
//  超级冲刺 (Hyperdash): 向下冲刺中按跳
// ============================================================
export const HYPER_H_BOOST = 325; // 水平速度保留
export const HYPER_V_SPEED = -200; // 向上弹起

// ============================================================
//  墙壁弹跳 (Wallbounce): 贴墙冲刺中按跳
// ============================================================
export const WALLBOUNCE_H = 280;
export const WALLBOUNCE_V = -260;

// ============================================================
//  颜色
// ============================================================
export const COLOR_PLAYER = 0x5bcefa; // 玩家 - 浅蓝
export const COLOR_PLAYER_DASH = 0xf5a9b8; // 冲刺中 - 粉色
export const COLOR_PLAYER_NO_DASH = 0x4466aa; // 无冲刺可用 - 暗蓝
export const COLOR_TILE = 0x3a3a5c; // 地砖
export const COLOR_TILE_EDGE = 0x5a5a8c; // 地砖边缘高光
export const COLOR_BG = 0x16213e; // 背景