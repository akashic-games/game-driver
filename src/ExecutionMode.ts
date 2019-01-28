"use strict";
/**
 * `GameLoop` の実行モード。
 */
enum ExecutionMode {
	/**
	 * `GameLoop` がactiveである。
	 *
	 * `GameLoop#_executionMode` がこの値である場合、そのインスタンスは:
	 *  - playlog.Eventを外部から受け付ける
	 *  - playlog.Tickを生成し外部へ送信する
	 */
	Active,
	/**
	 * `GameLoop` がpassiveである。
	 *
	 * `GameLoop#_executionMode` がこの値である場合、そのインスタンスは:
	 *  - playlog.Eventを外部に送信する
	 *  - playlog.Tickを受信し、それに基づいて `g.Game#tick()` を呼び出す
	 */
	Passive
}

export default ExecutionMode;
