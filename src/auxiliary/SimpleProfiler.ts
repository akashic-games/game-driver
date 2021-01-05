"use strict";
import { Profiler, ProfilerValueType } from "../Profiler";
import * as g from "@akashic/akashic-engine";

export interface SimpleProfilerParameterObject {
	/**
	 * `SimpleProfilerValue` を取得する更新間隔 (ms)。
	 * この間隔で `getValueHandler` が呼び出される。
	 */
	interval: number;

	/**
	 * `SimpleProfilerValue` を通知するコールバック。
	 */
	getValueHandler: (value: SimpleProfilerValue) => void;

	/**
	 * `getValueHandler` を呼び出す場合に `this` として利用される値。
	 */
	getValueHandlerOwner?: any;

	/**
	 * このインスタンスが内部的に保持するキャッシュサイズの制限。
	 * `DEFAULT_LIMIT` 以上でなければならない。
	 */
	limit?: number;
}

export interface SimpleProfilerValue {
	/**
	 * ｀interval｀ の区間において、描画がスキップされたフレームの数。
	 */
	skippedFrameCount: SimpleProfilerValueResult;

	/**
	 * ｀interval｀ の区間における、フレーム描画間隔。
	 */
	rawFrameInterval: SimpleProfilerValueResult;

	/**
	 * ｀interval｀ の区間における、1秒あたりの描画回数 (FPS)。
	 */
	framePerSecond: SimpleProfilerValueResult;

	/**
	 * ｀interval｀ の区間において、フレームの実行に要した時間。
	 */
	frameTime: SimpleProfilerValueResult;

	/**
	 * ｀interval｀ の区間において、フレームの描画に要した時間。
	 */
	renderingTime: SimpleProfilerValueResult;
}

export interface SimpleProfilerValueResult {
	ave: number;
	max: number;
	min: number;
}

export class SimpleProfiler implements Profiler {
	static DEFAULT_INTERVAL: number = 1000;
	static DEFAULT_LIMIT: number = 1000;
	static BACKUP_MARGIN: number = 100;

	_interval: number;
	_limit: number;
	_startTime: number = 0;
	_beforeFlushTime: number = 0;
	_beforeTimes: {[type: number]: number} = [];
	_values: {[type: number]: {time: number, value: number}[]} = [];
	_calculateProfilerValueTrigger: g.Trigger<SimpleProfilerValue> = new g.Trigger();

	constructor(param: SimpleProfilerParameterObject) {
		this._interval = param.interval ?? SimpleProfiler.DEFAULT_INTERVAL;
		if (param.limit != null) {
			this._limit = param.limit >= SimpleProfiler.DEFAULT_LIMIT ? param.limit : SimpleProfiler.DEFAULT_LIMIT;
		} else {
			this._limit = SimpleProfiler.DEFAULT_LIMIT;
		}
		if (param.getValueHandler) {
			this._calculateProfilerValueTrigger.add(param.getValueHandler, param.getValueHandlerOwner);
		}
		this._reset();
	}

	time(type: ProfilerValueType): void {
		this._beforeTimes[type] = this._getCurrentTime();
	}

	timeEnd(type: ProfilerValueType): void {
		const now = this._getCurrentTime();
		const value = this._beforeTimes[type] != null ? now - this._beforeTimes[type] : 0;
		this._values[type].push({
			time: now,
			value: value
		});
	}

	flush(): void {
		const now = this._getCurrentTime();
		if (this._beforeFlushTime === 0) this._beforeFlushTime = now;
		if (this._beforeFlushTime + this._interval < now) {
			this._calculateProfilerValueTrigger.fire(this.getProfilerValue(this._interval));
			this._beforeFlushTime = now;
		}

		if (this._values[ProfilerValueType.RawFrameInterval].length > this._limit) {
			for (let i in this._values) {
				if (this._values.hasOwnProperty(i))
					this._values[i] = this._values[i].slice(-SimpleProfiler.BACKUP_MARGIN);
			}
		}
	}

	setValue(type: ProfilerValueType, value: number): void {
		this._values[type].push({
			time: this._getCurrentTime(),
			value: value
		});
	}

	/**
	 * 現在時刻から、指定した時間までを遡った期間の `SimpleProfilerValue` を取得する。
	 */
	getProfilerValue(time: number): SimpleProfilerValue {
		const rawFrameInterval = this._calculateProfilerValue(ProfilerValueType.RawFrameInterval, time);
		return {
			skippedFrameCount: this._calculateProfilerValue(ProfilerValueType.SkippedFrameCount, time),
			rawFrameInterval: rawFrameInterval,
			framePerSecond: {
				ave: 1000 / rawFrameInterval.ave,
				max: 1000 / rawFrameInterval.min,
				min: 1000 / rawFrameInterval.max
			},
			frameTime: this._calculateProfilerValue(ProfilerValueType.FrameTime, time),
			renderingTime: this._calculateProfilerValue(ProfilerValueType.RenderingTime, time)
		};
	}

	_reset(): void {
		this._startTime = this._getCurrentTime();
		this._beforeFlushTime = 0;
		this._beforeTimes = [];
		this._beforeTimes[ProfilerValueType.RawFrameInterval] = 0;
		this._beforeTimes[ProfilerValueType.FrameTime] = 0;
		this._beforeTimes[ProfilerValueType.RenderingTime] = 0;
		this._beforeTimes[ProfilerValueType.SkippedFrameCount] = 0;
		this._values = [];
		this._values[ProfilerValueType.RawFrameInterval] = [];
		this._values[ProfilerValueType.FrameTime] = [];
		this._values[ProfilerValueType.RenderingTime] = [];
		this._values[ProfilerValueType.SkippedFrameCount] = [];
	}

	_calculateProfilerValue(type: ProfilerValueType, time: number): SimpleProfilerValueResult {
		const limit = this._getCurrentTime() - time;
		let sum = 0;
		let num = 0;
		let max = 0;
		let min = Number.MAX_VALUE;
		for (let i = this._values[type].length - 1; i >= 0; --i) {
			if (0 < num && this._values[type][i].time < limit) break;
			const value = this._values[type][i].value;
			if (max < value) max = value;
			if (value < min) min = value;
			sum += value;
			++num;
		}
		return {
			ave: sum / num,
			max: max,
			min: min
		};
	}

	_getCurrentTime(): number {
		return +new Date();
	}
}
