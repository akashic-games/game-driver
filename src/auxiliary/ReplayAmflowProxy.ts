"use strict";
import { EventIndex } from "@akashic/akashic-engine";
import * as amf from "@akashic/amflow";
import * as pl from "@akashic/playlog";

export interface ReplayAmflowProxyParameterObject {
	amflow: amf.AMFlow;
	tickList: pl.TickList;
	startPoints: amf.StartPoint[];
}

export class ReplayAmflowProxy implements amf.AMFlow {
	_amflow: amf.AMFlow;
	_tickList: pl.TickList | null;
	_startPoints: amf.StartPoint[];

	constructor(param: ReplayAmflowProxyParameterObject) {
		this._amflow = param.amflow;
		this._tickList = param.tickList;
		this._startPoints = param.startPoints;
	}

	/**
	 * 与えられていたティックリストを部分的に破棄する。
	 * ReplayAmflowProxy の独自メソッド。
	 * @param age ティックを破棄する基準のage(このageのティックも破棄される)
	 */
	dropAfter(age: number): void {
		if (!this._tickList)
			return;

		const givenFrom = this._tickList[EventIndex.TickList.From];
		const givenTo = this._tickList[EventIndex.TickList.To];
		const givenTicksWithEvents = this._tickList[EventIndex.TickList.TicksWithEvents] || [];

		if (age <= givenFrom) {
			this._tickList = null;
			this._startPoints = [];
		} else if (age <= givenTo) {
			this._tickList[EventIndex.TickList.To] = age - 1;
			this._tickList[EventIndex.TickList.TicksWithEvents] = this._sliceTicks(givenTicksWithEvents, givenTo, age - 1);
			this._startPoints = this._startPoints.filter((sp) => sp.frame < age);
		}
	}

	open(playId: string, callback?: (error: Error | null) => void): void {
		this._amflow.open(playId, callback);
	}
	close(callback?: (error: Error | null) => void): void {
		this._amflow.close(callback);
	}
	authenticate(token: string, callback: (error: Error | null, permission?: any) => void): void {
		this._amflow.authenticate(token, callback);
	}

	sendTick(tick: pl.Tick): void {
		this._amflow.sendTick(tick);
	}
	onTick(handler: (tick: pl.Tick) => void): void {
		this._amflow.onTick(handler);
	}
	offTick(handler: (tick: pl.Tick) => void): void {
		this._amflow.offTick(handler);
	}

	sendEvent(event: pl.Event): void {
		this._amflow.sendEvent(event);
	}
	onEvent(handler: (event: pl.Event) => void): void {
		this._amflow.onEvent(handler);
	}
	offEvent(handler: (event: pl.Event) => void): void {
		this._amflow.offEvent(handler);
	}

	getTickList(
		optsOrBegin: number | amf.GetTickListOptions,
		endOrCallback: number | ((error: Error | null, tickList?: pl.TickList) => void),
		callbackOrUndefined?: (error: Error | null, tickList?: pl.TickList) => void
	): void {
		let opts: amf.GetTickListOptions;
		let callback: ((error: Error | null, tickList?: pl.TickList) => void);

		if (typeof optsOrBegin === "number") {
			// NOTE: optsOrBegin === "number" であれば必ず amflow@2 以前の引数だとみなしてキャストする
			opts = {
				begin: optsOrBegin,
				end: endOrCallback as number
			};
			callback = callbackOrUndefined as (error: Error | null, tickList?: pl.TickList) => void;
		} else {
			// NOTE: optsOrBegin !== "number" であれば必ず amflow@3 以降の引数だとみなしてキャストする
			opts = optsOrBegin;
			callback = endOrCallback as (error: Error | null, tickList?: pl.TickList) => void;
		}

		if (!this._tickList) {
			this._amflow.getTickList(opts, callback);
			return;
		}

		const from = opts.begin;
		const to = opts.end;
		const givenFrom = this._tickList[EventIndex.TickList.From];
		const givenTo = this._tickList[EventIndex.TickList.To];
		const givenTicksWithEvents = this._tickList[EventIndex.TickList.TicksWithEvents] || [];
		const fromInGiven = givenFrom <= from && from <= givenTo;
		const toInGiven = givenFrom <= to && to <= givenTo;

		if (fromInGiven && toInGiven) { // 手持ちが要求範囲を包含
			setTimeout(() => {
				callback(null, [from, to, this._sliceTicks(givenTicksWithEvents, from, to)]);
			}, 0);
		} else {
			this._amflow.getTickList({ begin: from, end: to }, (err: Error | null, tickList?: pl.TickList) => {
				if (err) return void callback(err);
				if (!tickList) {
					// 何も得られなかった。手持ちの重複範囲を返すだけ。
					if (!fromInGiven && !toInGiven) {
						if (to < givenFrom || givenTo < from) { // 重複なし
							callback(null, tickList);
						} else { // 要求範囲が手持ちを包含
							callback(null, [givenFrom, givenTo, this._sliceTicks(givenTicksWithEvents, from, to)]);
						}
					} else if (fromInGiven) { // 前半重複
						callback(null, [from, givenTo, this._sliceTicks(givenTicksWithEvents, from, to)]);
					} else { // 後半重複
						callback(null, [givenFrom, to, this._sliceTicks(givenTicksWithEvents, from, to)]);
					}
				} else {
					// 何かは得られた。手持ちとマージする。
					if (!fromInGiven && !toInGiven) {
						if (to < givenFrom || givenTo < from) { // 重複なし
							callback(null, tickList);
						} else { // 要求範囲が手持ちを包含
							let ticksWithEvents = tickList[EventIndex.TickList.TicksWithEvents];
							if (ticksWithEvents) {
								const beforeGiven = this._sliceTicks(ticksWithEvents, from, givenFrom - 1);
								const afterGiven = this._sliceTicks(ticksWithEvents, givenTo + 1, to);
								ticksWithEvents = beforeGiven.concat(givenTicksWithEvents, afterGiven);
							} else {
								ticksWithEvents = givenTicksWithEvents;
							}
							callback(null, [from, to, ticksWithEvents]);
						}
					} else if (fromInGiven) { // 前半重複
						let ticksWithEvents = this._sliceTicks(givenTicksWithEvents, from, to)
							.concat(tickList[EventIndex.TickList.TicksWithEvents] || []);
						callback(null, [from, tickList[EventIndex.TickList.To], ticksWithEvents]);

					} else { // 後半重複
						let ticksWithEvents = (tickList[EventIndex.TickList.TicksWithEvents] || [])
							.concat(this._sliceTicks(givenTicksWithEvents, from, to));
						callback(null, [tickList[EventIndex.TickList.From], to, ticksWithEvents]);
					}
				}
			});
		}
	}

	putStartPoint(startPoint: amf.StartPoint, callback: (error: Error | null) => void): void {
		this._amflow.putStartPoint(startPoint, callback);
	}

	getStartPoint(opts: amf.GetStartPointOptions, callback: (error: Error | null, startPoint?: amf.StartPoint) => void): void {
		let index = 0;
		if (this._startPoints.length > 0) {
			if (opts.frame != null) {
				let nearestFrame = this._startPoints[0].frame;
				for (let i = 1; i < this._startPoints.length; ++i) {
					const frame = this._startPoints[i].frame;
					if (frame <= opts.frame && nearestFrame < frame) {
						nearestFrame = frame;
						index = i;
					}
				}
			} else {
				let nearestTimestamp = this._startPoints[0].timestamp;
				for (let i = 1; i < this._startPoints.length; ++i) {
					const timestamp = this._startPoints[i].timestamp;
					// NOTE: opts.frame が null の場合は opts.timestamp が non-null であることが仕様上保証されている
					if (timestamp <= opts.timestamp! && nearestTimestamp < timestamp) {
						nearestTimestamp = timestamp;
						index = i;
					}
				}
			}
		}

		const givenTo = this._tickList ? this._tickList[EventIndex.TickList.To] : -1;
		if (typeof opts.frame === "number" && opts.frame > givenTo) {
			this._amflow.getStartPoint(opts, (err: Error | null, startPoint?: amf.StartPoint) => {
				if (err) {
					callback(err);
					return;
				}
				if (startPoint && givenTo < startPoint.frame) {
					callback(null, startPoint);
				} else {
					// 与えられたティックリストの範囲内のスタートポイントが見つかったとしてもなかったかのように振る舞う
					callback(null, this._startPoints[index]);
				}
			});
		} else {
			setTimeout(() => {
				callback(null, this._startPoints[index]);
			}, 0);
		}
	}

	putStorageData(key: pl.StorageKey, value: pl.StorageValue, options: any, callback: (err: Error | null) => void): void {
		this._amflow.putStorageData(key, value, options, callback);
	}
	getStorageData(keys: pl.StorageReadKey[], callback: (error: Error | null, values?: pl.StorageData[]) => void): void {
		this._amflow.getStorageData(keys, callback);
	}

	_sliceTicks(ticks: pl.Tick[], from: number, to: number): pl.Tick[] {
		return ticks.filter((t) => {
			const age = t[EventIndex.Tick.Age];
			return from <= age && age <= to;
		});
	}
}
