"use strict";
import { EventIndex } from "@akashic/akashic-engine";
import * as amf from "@akashic/amflow";
import * as pl from "@akashic/playlog";

export interface MemoryAmflowClientParameterObject {
	playId: string;
	putStorageDataSyncFunc?: (key: pl.StorageKey, value: pl.StorageValue, options: any) => void;
	getStorageDataSyncFunc?: (keys: pl.StorageReadKey[]) => pl.StorageData[];

	tickList?: pl.TickList;
	startPoints?: amf.StartPoint[];
}

export interface AmflowDump {
	tickList: pl.TickList | null;
	startPoints: amf.StartPoint[];
}

export class MemoryAmflowClient implements amf.AMFlow {
	/**
	 * `writeTick` 権限を持つトークン。
	 * この値は authenticate() の挙動以外は変更しない。
	 * 他メソッド(sendEvent()など)の呼び出しは(権限に反していても)エラーを起こすとは限らない。
	 */
	static TOKEN_ACTIVE: string = "mamfc-token:active";
	/**
	 * `subscribeTick` 権限を持つトークン。
	 * この値は authenticate() の挙動以外は変更しない。
	 * 他メソッド(sendTick()など)の呼び出しは(権限に反していても)エラーを起こすとは限らない。
	 */
	static TOKEN_PASSIVE: string = "mamfc-token:passive";

	_playId: string;
	_putStorageDataSyncFunc: (key: pl.StorageKey, value: pl.StorageValue, options: any) => void;
	_getStorageDataSyncFunc: (keys: pl.StorageReadKey[]) => pl.StorageData[];

	_tickHandlers: ((tick: pl.Tick) => void)[] = [];
	_eventHandlers: ((ev: pl.Event) => void)[] = [];

	/**
	 * onEvent() 呼び出し前に sendEvent() されたものを保持しておくバッファ。
	 */
	_events: pl.Event[] = [];

	_tickList: pl.TickList | null = null;
	_startPoints: amf.StartPoint[];

	constructor(param: MemoryAmflowClientParameterObject) {
		this._playId = param.playId;
		this._putStorageDataSyncFunc = param.putStorageDataSyncFunc || ((): any => {
			throw new Error("Implementation not given");
		});
		this._getStorageDataSyncFunc = param.getStorageDataSyncFunc || ((): any => {
			throw new Error("Implementation not given");
		});

		if (param.startPoints) {
			if (param.tickList) {
				this._tickList = param.tickList;
			}
			this._startPoints = param.startPoints;
		} else {
			this._startPoints = [];
		}
	}

	dump(): AmflowDump {
		return {
			tickList: this._tickList,
			startPoints: this._startPoints
		};
	}

	open(playId: string, callback?: (error: Error | null) => void): void {
		setTimeout(() => {
			if (!callback) return;
			if (playId !== this._playId)
				return void callback(new Error("MemoryAmflowClient#open: unknown playId"));
			callback(null);
		}, 0);
	}

	close(callback?: (error: Error | null) => void): void {
		if (!callback) return;
		setTimeout(() => {
			callback(null);
		}, 0);
	}

	authenticate(token: string, callback: (error: Error | null, permission?: any) => void): void {
		setTimeout(() => {
			switch (token) {
				case MemoryAmflowClient.TOKEN_ACTIVE:
					callback(null, {
						writeTick: true,
						readTick: true,
						subscribeTick: false,
						sendEvent: false,
						subscribeEvent: true,
						maxEventPriority: 2
					});
					break;
				case MemoryAmflowClient.TOKEN_PASSIVE:
					callback(null, {
						writeTick: false,
						readTick: true,
						subscribeTick: true,
						sendEvent: true,
						subscribeEvent: false,
						maxEventPriority: 2
					});
					break;
				default:
					callback(null, {
						writeTick: true,
						readTick: true,
						subscribeTick: true,
						sendEvent: true,
						subscribeEvent: true,
						maxEventPriority: 2
					});
					break;
			}
		}, 0);
	}

	sendTick(tick: pl.Tick): void {
		tick = _cloneDeep(tick); // 元の値が後から変更されてもいいようにコピーしておく

		if (!this._tickList) {
			this._tickList = [tick[EventIndex.Tick.Age], tick[EventIndex.Tick.Age], []];
		} else {
			// 既に存在するTickListのfrom~to間にtickが挿入されることは無い
			if (
				this._tickList[EventIndex.TickList.From] <= tick[EventIndex.Tick.Age] &&
				tick[EventIndex.Tick.Age] <= this._tickList[EventIndex.TickList.To]
			)
				throw new Error("illegal age tick");

			this._tickList[EventIndex.TickList.To] = tick[EventIndex.Tick.Age];
		}

		const events = tick[EventIndex.Tick.Events];
		const storageData = tick[EventIndex.Tick.StorageData];
		if (events || storageData) {
			if (events) {
				tick[EventIndex.Tick.Events] = events.filter(
					event => !(event[EventIndex.General.EventFlags] & pl.EventFlagsMask.Transient)
				);
			}
			// @ts-ignore
			this._tickList[EventIndex.TickList.TicksWithEvents].push(tick);
		}

		this._tickHandlers.forEach((h: (t: pl.Tick) => void) => h(tick));
	}

	onTick(handler: (tick: pl.Tick) => void): void {
		this._tickHandlers.push(handler);
	}

	offTick(handler: (tick: pl.Tick) => void): void {
		this._tickHandlers = this._tickHandlers.filter((h: (tick: pl.Tick) => void) => (h !== handler));
	}

	sendEvent(pev: pl.Event): void {
		pev = _cloneDeep(pev); // 元の値が後から変更されてもいいようにコピーしておく

		if (this._eventHandlers.length === 0) {
			this._events.push(pev);
			return;
		}
		this._eventHandlers.forEach((h: (pev: pl.Event) => void) => h(pev));
	}

	onEvent(handler: (pev: pl.Event) => void): void {
		this._eventHandlers.push(handler);

		if (this._events.length > 0) {
			this._events.forEach(pev => {
				this._eventHandlers.forEach(h => h(pev));
			});
			this._events = [];
		}
	}

	offEvent(handler: (pev: pl.Event) => void): void {
		this._eventHandlers = this._eventHandlers.filter((h: (pev: pl.Event) => void) => (h !== handler));
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
			if (callback) {
				setTimeout(() => callback(null), 0);
			}
			return;
		}

		const from = Math.max(opts.begin, this._tickList[EventIndex.TickList.From]);
		const to = Math.min(opts.end, this._tickList[EventIndex.TickList.To]);
		// @ts-ignore
		const ticks = this._tickList[EventIndex.TickList.TicksWithEvents].filter((tick) => {
			const age = tick[EventIndex.Tick.Age];
			return from <= age && age <= to;
		});
		const tickList: pl.TickList = [from, to, ticks];
		setTimeout(() => callback(null, tickList), 0);
	}

	putStartPoint(startPoint: amf.StartPoint, callback: (error: Error | null) => void): void {
		setTimeout(() => {
			this._startPoints.push(startPoint);
			callback(null);
		}, 0);
	}

	getStartPoint(opts: amf.GetStartPointOptions, callback: (error: Error | null, startPoint?: amf.StartPoint) => void): void {
		setTimeout(() => {
			if (!this._startPoints || this._startPoints.length === 0) return void callback(new Error("no startpoint"));
			let index = 0;
			if (opts.frame != null) {
				let nearestFrame = this._startPoints[0].frame;
				for (let i = 1; i < this._startPoints.length; ++i) {
					var frame = this._startPoints[i].frame;
					if (frame <= opts.frame && nearestFrame < frame) {
						nearestFrame = frame;
						index = i;
					}
				}
			} else {
				let nearestTimestamp = this._startPoints[0].timestamp;
				for (let i = 1; i < this._startPoints.length; ++i) {
					var timestamp = this._startPoints[i].timestamp;
					// NOTE: opts.frame が null の場合は opts.timestamp が non-null であることが仕様上保証されている
					if (timestamp <= opts.timestamp! && nearestTimestamp < timestamp) {
						nearestTimestamp = timestamp;
						index = i;
					}
				}
			}
			callback(null, this._startPoints[index]);
		}, 0);
	}

	putStorageData(key: pl.StorageKey, value: pl.StorageValue, options: any, callback: (err: Error | null) => void): void {
		setTimeout(() => {
			try {
				this._putStorageDataSyncFunc(key, value, options);
				callback(null);
			} catch (e) {
				callback(e);
			}
		}, 0);
	}

	getStorageData(keys: pl.StorageReadKey[], callback: (error: Error | null, values?: pl.StorageData[]) => void): void {
		setTimeout(() => {
			try {
				const data = this._getStorageDataSyncFunc(keys);
				callback(null, data);
			} catch (e) {
				callback(e);
			}
		}, 0);
	}

	/**
	 * 与えられていたティックリストを部分的に破棄する。
	 * @param age ティックを破棄する基準のage(このageのティックも破棄される)
	 */
	dropAfter(age: number): void {
		if (!this._tickList) return;
		const from = this._tickList[EventIndex.TickList.From];
		const to = this._tickList[EventIndex.TickList.To];

		if (age <= from) {
			this._tickList = null;
			this._startPoints = [];
		} else if (age <= to) {
			this._tickList[EventIndex.TickList.To] = age - 1;
			// @ts-ignore
			this._tickList[EventIndex.TickList.TicksWithEvents] = this._tickList[EventIndex.TickList.TicksWithEvents].filter((tick) => {
				const ta = tick[EventIndex.Tick.Age];
				return from <= ta && ta <= (age - 1);
			});
			this._startPoints = this._startPoints.filter((sp) => sp.frame < age);
		}
	}
}

export function _cloneDeep(v: any): any {
	if (v && typeof v === "object") {
		if (Array.isArray(v)) {
			return v.map(_cloneDeep);
		} else {
			return Object.keys(v).reduce((acc: any, k) => (acc[k] = _cloneDeep(v[k]), acc), {});
		}
	}
	return v;
}
