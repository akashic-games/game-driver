"use strict";
import LoopMode from "./LoopMode";
import LoopRenderMode from "./LoopRenderMode";

interface LoopConfiguration {
	/**
	 * ループ制御のモード。
	 */
	loopMode: LoopMode;

	/**
	 * 目標のフレームからの遅れと判断する閾値。
	 *
	 * 初期値は6(`DEFAULT_DELAY_IGNORE_THERSHOLD`)。
	 * 目標のフレームからこの値分遅れているとわかった場合に、`skipTicksAtOnce` 倍速で実行する。
	 */
	delayIgnoreThreshold?: number;

	/**
	 * 早送り倍率。
	 *
	 * 初期値は100(`DEFAULT_SKIP_TICKS_AT_ONCE`)。正の整数でなければならない。
	 * 目標のフレームから `delayIgnoreThreshold` 分遅れているとわかった場合に、この倍率で実行する。
	 */
	skipTicksAtOnce?: number;

	/**
	 * `Game` 側で早送りとして取り扱う閾値。
	 *
	 * 初期値は100(`DEFAULT_SKIP_THRESHOLD`)。
	 * 実行開始直後(第0フレーム)と、このフレーム以上遅れた時「早送り」に入る。
	 * (早送り状態への遷移を通知し、早送り時倍率で再生する)
	 *
	 * 早送りの間、早送り中であることは `Game` に通知する必要がある(音声再生速度が変わりうるので)。
	 * しかし瞬間的な遅れが生じる度にいちいち通知すると、早送りが頻発してユーザ体験が悪化する可能性がある。
	 * 瞬間的な早送りでごまかせないほどの遅れが生じた時にのみ、早送りを通知するためにこの値が利用できる。
	 */
	skipThreshold?: number;

	/**
	 * ゲーム開発者に早送りを通知するか。
	 *
	 * 初期値は真。
	 * 真である場合、早送り状態の変化は `g.Game#skippingChanged` でコンテンツに通知される。
	 * 組み込み側向けの `Game#skippingChangedTrigger` は、この値と関係なく常にfireされることに注意。
	 */
	skipAwareGame?: boolean;

	/**
	 * スナップショットジャンプを試みるフレーム遅れの閾値。
	 * 初期値は30000(仮; DEFAULT_JUMP_TRY_THRESHOLD)。
	 * 目標のフレームからこの値分遅れているとわかった場合に、スナップショットジャンプを試みる(それを行うモードであれば)。
	 */
	jumpTryThreshold?: number;

	/**
	 * 取得したスナップショットを無視する閾値。
	 *
	 * 初期値は15000(仮; DEFAULT_JUMP_IGNORE_THRESHOLD)。
	 * 取得したスナップショットが現在ageからこの値以上未来のものでなければ、有効なスナップショットであっても無視する。
	 *
	 * スナップショットからの復元はコストの低い処理ではない。取得したスナップショットが現在ageにあまりに近ければ、
	 * スナップショットでジャンプするより普通に早送りを進めた方が高速だと考えられる。
	 * この値はその判断(あまりに近いか否か)の閾値として使われる。
	 */
	jumpIgnoreThreshold?: number;

	/**
	 * 最新ティックの取得を要求する間隔(ms)。
	 * 初期値は10000(仮; DEFAULT_TICK_POLLING_THRESHOLD)
	 */
	_pollingTickThreshold?: number;

	/**
	 * 再生速度。
	 *
	 * 初期値は1。0より大きい数でなければならない。
	 * PDI実装がサポートする場合、この値に応じて音声などの再生速度も変化する。
	 *
	 * この値は `Clock#frameTrigger` のfire頻度ごと変える点に注意。
	 * すなわち(`skipTicksAtOnce` と異なり) `Active` で動作している場合でも機能し、 `Tick` の生成速度そのものが変化する。
	 */
	playbackRate?: number;

	/**
	 * 描画要求のモード。
	 * 初期値は `AfterRawFrame` 。
	 */
	loopRenderMode?: LoopRenderMode;

	/**
	 * Replay時の目標age。
	 *
	 * ここにたどり着くまで早送りやスナップショットジャンプを行う。たどり着いた後は等倍速実行になる。
	 * `loopMode` が `Replay` でない場合、この値は無視される。
	 */
	targetAge?: number;

	/**
	 * Replay時の目標時刻関数。
	 *
	 * 指定された場合、この値を毎フレーム呼び出し、その戻り値を目標時刻として扱う。
	 * すなわち、この関数の戻り値を超えない最大のティック時刻を持つティックが消化されるよう早送りやスナップショットジャンプを行う。
	 *
	 * この値が指定されている場合、ローカルティック補間シーンにおけるローカルティック補間はティック時刻に基づいた形でのみ行われる。
	 * (ティックやスタートポイントの受信待ちなどによる、不定回のティック補間は行われない。)
	 * この値が指定されている場合、 `targetAge` は無視される。
	 * `loopMode` が `Replay` でない場合、この値は無視される。
	 */
	targetTimeFunc?: () => number;

	/**
	 * Replay時の目標時刻に対するオフセット。
	 * 指定された場合、 `targetTimeFunc()` の戻り値にこの値が加算される。
	 * `originDate` が指定されている場合、この値は無視される。
	 */
	targetTimeOffset?: number;

	/**
	 * Replay時の基準日時。
	 *
	 * 指定された場合、「指定値から、このプレイの第0スタートポイントに記録された時刻を引いた値」が `targetTimeOffset` に指定されたかのように扱われる。
	 * `loopMode` が `Replay` でない場合、この値は無視される。
	 */
	originDate?: number;

	/**
	 * Replay時、ローカルティック補間による待ちを省略するか否か。
	 *
	 * 初期値は偽。
	 * 真である場合、次ティックのタイムスタンプに対するローカルティック補間を行わない。
	 * 詳細は LoopConfiguration の説明を参照のこと。
	 *
	 * 自動ティックのコンテンツでは動作に影響しない点に注意(ティックにタイムスタンプがない＝次ティック時刻が常に次フレーム時刻と一致するため)。
	 * 真である場合、非ローカルティックが生じさせるローカル処理はオーバーラップする(非ローカルティックを連続消化するので)ため、
	 * そのことを意識して作成されたコンテンツでのみこの値を真にすべきである。
	 */
	omitInterpolatedTickOnReplay?: boolean;
}

export default LoopConfiguration;
