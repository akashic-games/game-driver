/**
 * 遅延を無視する域値のデフォルト。
 * `LoopConfiguration#delayIgnoreThreshold` のデフォルト値。
 * このフレーム以下の遅延は遅れてないものとみなす(常時コマが飛ぶのを避けるため)。
 */
export var DEFAULT_DELAY_IGNORE_THRESHOLD: number = 6;

/**
 * 「早送り」時倍率のデフォルト値。
 * `LoopConfiguration#skipTicksAtOnce` のデフォルト値。
 */
export var DEFAULT_SKIP_TICKS_AT_ONCE: number = 100;

/**
 * 「早送り」状態に移る域値のデフォルト。
 * `LoopConfiguration#skipThreshold` のデフォルト値。
 */
export var DEFAULT_SKIP_THRESHOLD: number = 100;

/**
 * スナップショットジャンプを試みる域値のデフォルト。
 * `LoopConfiguration#jumpTryThreshold` のデフォルト値。
 */
export var DEFAULT_JUMP_TRY_THRESHOLD: number = 30000;  // 30FPSの100倍早送りで換算3000FPSで進めても10秒かかる閾値

/**
 * 取得したスナップショットを無視する域値のデフォルト。
 * `LoopConfiguration#jumpIgnoreThreshold` のデフォルト値。
 */
export var DEFAULT_JUMP_IGNORE_THRESHOLD: number = 15000;  // 30FPSの100倍早送りで換算3000FPSで進めて5秒で済む閾値

/**
 * 最新ティックをポーリングする間隔(ms)のデフォルト。
 */
export var DEFAULT_POLLING_TICK_THRESHOLD: number = 10000;

/**
 * 擬似的に無限未来として扱うage。
 */
export var PSEUDO_INFINITE_AGE = 365 * 86400 * 60; // 60FPSで一年分のage。(特に制限ではないが32bit signed intに収まる)
