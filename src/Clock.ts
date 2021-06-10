"use strict";
import * as g from "@akashic/akashic-engine";
import * as pdi from "@akashic/pdi-types";

/**
 * `Clock#frameTrigger` のfire時に渡される値。
 */
export interface ClockFrameTriggerParameterObject {
	/**
	 * 前回からの呼び出し時間 (ms)
	 */
	deltaTime: number;

	/**
	 * frameTriggerのfireを強制的に中断するか。
	 * frameTriggerは経過時間に応じて複数回連続で呼び出される。
	 * この値を真にすると、条件に関わらず連続呼び出しを止めることができる。
	 * 初期値は偽。
	 */
	interrupt: boolean;
}

export interface ClockParameterObject {
	/**
	 * FPS。このクロックが一秒あたりに `frameTrigger` をfireする回数。
	 */
	fps: number;

	/**
	 * 倍率。
	 *
	 * この値にNを設定すると、概ね `fps` をN倍したのと同じ動作が得られる。
	 * (`fps` をN倍した場合と異なり、 `scaleFactor` は `maxFramePerOnce` の設ける閾値もN倍することに注意。)
	 * 指定されなかった場合、1。
	 */
	scaleFactor?: number;

	/**
	 * この `Clock` の使う `Looper` を生成する `Platform` 。
	 */
	platform: pdi.Platform;

	/**
	 * `Looper` の1回の呼び出し (raw clock frame) ごとに最大何フレーム進めるか。
	 *
	 * (このフレーム分進めても経過時間 (deltaTime) を消化しきれない場合、
	 * 次回呼び出しまでのウェイト時間として、Looperには負の値が渡される。)
	 */
	maxFramePerOnce: number;

	/**
	 * 異常値とみなして無視する `Looper` の呼び出し間隔(単位はms)。
	 * この時間が経過していた場合、無視して1フレーム時間進んだものと解釈する。
	 * 指定されなかった場合、150(`DEFAULT_DELTA_TIME_BROKEN_THRESHOLD`)。
	 */
	deltaTimeBrokenThreshold?: number;

	/**
	 * 1フレーム時間経過時に呼び出されるコールバック。
	 */
	frameHandler?: (arg: ClockFrameTriggerParameterObject) => void;

	/**
	 * `frameHandler` の呼び出し時に `this` として使われる値。
	 */
	frameHandlerOwner?: any;
}

/**
 * FPS管理用のクロック。
 *
 * `pdi.Looper` の定期または不定期の呼び出しを受け付け、指定されたFPSから求めた
 * 1フレーム分の時間(1フレーム時間)が経過するたびに `frameTrigger` をfireする。
 */
export class Clock {
	/**
	 * 経過時間先取りの比率。
	 *
	 * FPSから定まる「1フレーム」の経過時間が経っていなくても、この割合の時間が経過していれば1フレーム分の計算を進めてしまう。
	 * その代わりに次フレームまでの所要時間を長くする。
	 * 例えば20FPSであれば50msで1フレームだが、50*0.8 = 40ms 時点で1フレーム進めてしまい、次フレームまでの時間を60msにする。
	 */
	static ANTICIPATE_RATE: number = 0.8;

	/**
	 * 異常値とみなして無視する `Looper` の呼び出し間隔[ms]のデフォルト値。
	 */
	static DEFAULT_DELTA_TIME_BROKEN_THRESHOLD: number = 150;

	/**
	 * このクロックが一秒あたりに `frameTrigger' をfireする回数(正確にはこの `scaleFactor` 倍)。
	 * この値は参照のために公開される。
	 * 外部からのこの値の変更は許容されるが、反映は次の `start()` まで遅延される。
	 */
	fps: number;

	/**
	 * 倍率。
	 *
	 * この値にNを設定すると、概ね `fps` をN倍するのと同じ動作が得られる。
	 * (`fps` をN倍した場合と異なり、 `scaleFactor` は `maxFramePerOnce` の設ける閾値もN倍することに注意。)
	 *
	 * 初期値は1。
	 * この値は参照のために公開される。この値の変更には `changeScaleFactor()` を用いること。
	 */
	scaleFactor: number;

	/**
	 * クロックが実行中か。
	 * start() された後、stop() されるまでの間、またその時のみ真。
	 * 外部からこの値を変更してはならない。
	 */
	running: boolean;

	/**
	 * 1フレーム時間が経過した時にfireされる `g.Trigger` 。
	 */
	frameTrigger: g.Trigger<ClockFrameTriggerParameterObject>;

	/**
	 * 1生フレーム時間が経過した場合、一連の `frameTrigger` fireの直後にfireされる `g.Trigger` 。
	 *
	 * (注意: フレーム(frame)と生フレーム(raw frame)の違いに気をつけること。
	 * `Looper` の呼び出しにより、1フレーム時間以上経過した時「1生フレーム時間が経過した」と呼ぶ。
	 * 処理遅れなどにより、上述のとおり1生フレーム経過の間に複数フレーム経過することがありうる。)
	 */
	rawFrameTrigger: g.Trigger<void>;

	_platform: pdi.Platform;
	_maxFramePerOnce: number;
	_deltaTimeBrokenThreshold: number;

	_totalDeltaTime: number;
	_onLooperCall_bound: (deltaTime: number) => number;
	_looper: pdi.Looper;

	// this.fps と this.scaleFactor から定まる値のキャッシュ。
	_waitTime: number;             // 1/(FPS * scaleFactor)
	_waitTimeDoubled: number;      // 1/(FPS * scaleFactor) * 2
	_waitTimeMax: number;          // 1/(FPS * scaleFactor) * (maxFramePerOnce * scaleFactor)
	_skipFrameWaitTime: number;    // 1/(FPS * scaleFactor) * ANTICIPATE_RATE
	_realMaxFramePerOnce: number;  // maxFramePerOnce * scaleFactor

	constructor(param: ClockParameterObject) {
		this.fps = param.fps;
		this.scaleFactor = param.scaleFactor || 1;
		this.frameTrigger = new g.Trigger<ClockFrameTriggerParameterObject>();
		this.rawFrameTrigger = new g.Trigger<void>();

		this._platform = param.platform;
		this._maxFramePerOnce = param.maxFramePerOnce;
		this._deltaTimeBrokenThreshold = param.deltaTimeBrokenThreshold || Clock.DEFAULT_DELTA_TIME_BROKEN_THRESHOLD;
		if (param.frameHandler) {
			this.frameTrigger.add(param.frameHandler, param.frameHandlerOwner);
		}

		this.running = false;
		this._totalDeltaTime = 0;
		this._onLooperCall_bound = this._onLooperCall.bind(this);
		this._looper = this._platform.createLooper(this._onLooperCall_bound);

		this._waitTime = 0;
		this._waitTimeDoubled = 0;
		this._waitTimeMax = 0;
		this._skipFrameWaitTime = 0;
		this._realMaxFramePerOnce = 0;
	}

	start(): void {
		if (this.running)
			return;
		this._totalDeltaTime = 0;
		this._updateWaitTimes(this.fps, this.scaleFactor);
		this._looper.start();
		this.running = true;
	}

	stop(): void {
		if (!this.running)
			return;
		this._looper.stop();
		this.running = false;
	}

	/**
	 * `scaleFactor` を変更する。
	 * start()した後にも呼び出せるが、1フレーム以下の経過時間情報はリセットされる点に注意。
	 */
	changeScaleFactor(scaleFactor: number): void {
		if (this.running) {
			this.stop();
			this.scaleFactor = scaleFactor;
			this.start();
		} else {
			this.scaleFactor = scaleFactor;
		}
	}

	_onLooperCall(deltaTime: number): number {
		if (isNaN(deltaTime)) {
			// NaN が渡された場合 次のフレームまで進行する。
			deltaTime = this._waitTime;
			this._totalDeltaTime = 0;
		}
		const rawDeltaTime = deltaTime;

		if (deltaTime <= 0) {
			// 時間が止まっているか巻き戻っている。初回呼び出しか、あるいは何かがおかしい。時間経過0と見なす。
			return this._waitTime - this._totalDeltaTime;
		}
		if (deltaTime > this._deltaTimeBrokenThreshold) {
			// 間隔が長すぎる。何かがおかしい。時間経過を1フレーム分とみなす。
			deltaTime = this._waitTime;
		}

		var totalDeltaTime = this._totalDeltaTime;
		totalDeltaTime += deltaTime;
		if (totalDeltaTime <= this._skipFrameWaitTime) {
			// 1フレーム分消化するほどの時間が経っていない。
			this._totalDeltaTime = totalDeltaTime;
			return this._waitTime - totalDeltaTime;
		}

		var frameCount = (totalDeltaTime < this._waitTimeDoubled) ? 1
		                   : (totalDeltaTime > this._waitTimeMax) ? this._realMaxFramePerOnce
		                                                          : (totalDeltaTime / this._waitTime) | 0;
		var fc = frameCount;
		var arg: ClockFrameTriggerParameterObject = {
			deltaTime: rawDeltaTime,
			interrupt: false
		};
		while (fc > 0 && this.running && !arg.interrupt) {
			--fc;
			this.frameTrigger.fire(arg);
			arg.deltaTime = 0; // 同ループによる2度目以降の呼び出しは差分を0とみなす。
		}
		totalDeltaTime -= ((frameCount - fc) * this._waitTime);
		this.rawFrameTrigger.fire();
		this._totalDeltaTime = totalDeltaTime;
		return this._waitTime - totalDeltaTime;
	}

	private _updateWaitTimes(fps: number, scaleFactor: number): void {
		var realFps = fps * scaleFactor;
		this._waitTime = 1000 / realFps;
		this._waitTimeDoubled = Math.max((2000 / realFps) | 0, 1);
		this._waitTimeMax = Math.max(scaleFactor * (1000 * this._maxFramePerOnce / realFps) | 0, 1);
		this._skipFrameWaitTime = (this._waitTime * Clock.ANTICIPATE_RATE) | 0;
		this._realMaxFramePerOnce = this._maxFramePerOnce * scaleFactor;
	}
}
