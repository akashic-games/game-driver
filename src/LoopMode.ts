"use strict";
/**
 * `GameLoop` のループ制御のモード。
 * `GameLoop` は、この値に応じて `g.Game#tick()` の呼び出し方法を変える。
 */
enum LoopMode {
	/**
	 * 最新フレームに最大限追いつくモード。
	 *
	 * Passiveである場合、自分の現在フレームが取得済みの最新フレームから大きく遅れているなら、
	 * 早送りやスナップショットによるジャンプを行う。
	 */
	Realtime,
	/**
	 * 追いつこうとするフレームを自分で制御するモード。
	 *
	 * `Realtime` と同様早送りやスナップショットによるジャンプを行うが、
	 * その基準フレームとして `LoopConfiguration#targetAge` (を保持する `GameLoop#_targetAge`) を使う。
	 * 早送りやスナップショットによるジャンプを行う。
	 */
	Replay,
	/**
	 * 正しく使っていない。削除する予定。
	 *
	 * コマ送りモード。
	 * `GameLoop#step()` 呼び出し時に1フレーム進む。それ以外の方法では進まない。
	 * 早送りやスナップショットによるジャンプは行わない。
	 */
	FrameByFrame
}

export default LoopMode;
