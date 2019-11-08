"use strict";
import { Clock, ClockParameterObject } from "./Clock";
import { Profiler, ProfilerValueType } from "./Profiler";

export interface ProfileClockParameterObject extends ClockParameterObject {
	/**
	 * 利用するプロファイラー。
	 */
	profiler: Profiler;
}

/**
 * プロファイラーを有するクロック。
 *
 * note: _onLooperCall()のみをオーバーライドし、 `this._profiler.~~` を追加しただけとなっています。
 */
export class ProfilerClock extends Clock {
	_profiler: Profiler;

	constructor(param: ProfileClockParameterObject) {
		super(param);
		this._profiler = param.profiler;
	}

	_onLooperCall(deltaTime: number): number {
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

		this._profiler.timeEnd(ProfilerValueType.RawFrameInterval);
		this._profiler.time(ProfilerValueType.RawFrameInterval);

		var frameCount = (totalDeltaTime < this._waitTimeDoubled) ? 1
		                   : (totalDeltaTime > this._waitTimeMax) ? this._realMaxFramePerOnce
		                                                          : (totalDeltaTime / this._waitTime) | 0;

		var fc = frameCount;
		var arg = { interrupt: false };
		this._profiler.setValue(ProfilerValueType.SkippedFrameCount, fc - 1);
		while (fc > 0 && this.running && !arg.interrupt) {
			--fc;
			this._profiler.time(ProfilerValueType.FrameTime);
			this.frameTrigger.fire(arg);
			this._profiler.timeEnd(ProfilerValueType.FrameTime);
		}

		totalDeltaTime -= ((frameCount - fc) * this._waitTime);
		this._profiler.time(ProfilerValueType.RenderingTime);
		this.rawFrameTrigger.fire();
		this._profiler.timeEnd(ProfilerValueType.RenderingTime);
		this._totalDeltaTime = totalDeltaTime;

		this._profiler.flush();
		return this._waitTime - totalDeltaTime;
	}
}
