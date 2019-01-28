"use strict";

/**
 * `GameLoop` が描画を行う基準。
 */
enum LoopRenderMode {
	/**
	 * 毎raw frame後に描画する。
	 * raw frameの詳細についてはClock.tsのコメントを参照。
	 */
	AfterRawFrame,

	/**
	 * 描画をまったく行わない。
	 */
	None
}

export default LoopRenderMode;
