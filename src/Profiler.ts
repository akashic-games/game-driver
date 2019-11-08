"use strict";

/**
 * プロファイラーが収集する値の種類。
 *
 *  |                RawFrameInterval                |
 *  +------------------------------------------------+
 *  | FrameTime | .. | RenderingTime |     Idle      |
 */
export const enum ProfilerValueType {
	/**
	 * ある区間において、描画がスキップされたフレームの数。
	 */
	SkippedFrameCount,

	/**
	 * ある区間におけるフレーム描画間隔。
	 */
	RawFrameInterval,

	/**
	 * ある区間のフレームの実行に要した時間。
	 */
	FrameTime,

	/**
	 * ある区間のフレーム描画に要した時間。
	 */
	RenderingTime
}

/**
 * プロファイラークラス。
 */
export interface Profiler {
	/**
	 * 指定した ProfilerValueType における、処理時間の計測を始める。
	 */
	time(type: ProfilerValueType): void;
	/**
	 * `this.time()` により開始された計測を終了する。
	 * 対応する ProfilerValueType の `this.time()` が呼び出されていなかった場合、0 となる。
	 */
	timeEnd(type: ProfilerValueType): void;

	/**
	 * ある一定期間で呼ばれる。
	 */
	flush(): void;

	/**
	 * 指定した ProfilerValueType に値をセットする。
	 */
	setValue(type: ProfilerValueType, value: number): void;
}
