import type { AMFlow, StartPoint, GetTickListOptions } from "@akashic/amflow";
import type * as pl from "@akashic/playlog";

export interface GetTicksRequest {
	from: number;
	to: number;
	respond: (error: Error | null, ticks: pl.Tick[]) => void;
}

export class MockAmflow implements AMFlow {
	ticks: pl.Tick[];

	tickHandlers: ((tick: pl.Tick) => void)[];
	eventHandlers: ((ev: pl.Event) => void)[];

	requestsGetTicks: GetTicksRequest[];
	requestsPutStorageData: ((err?: any) => void)[];
	requestsGetStorageData: ((err?: any) => void)[];
	storage: { [key: string]: pl.StorageValue };

	constructor() {
		this.ticks = [];
		this.tickHandlers = [];
		this.eventHandlers = [];
		this.requestsGetTicks = [];
		this.requestsPutStorageData = [];
		this.requestsGetStorageData = [];
		this.storage = <any>Object.create(null);
	}

	hasEventHandler(h: (pev: pl.Event) => void): boolean {
		return this.eventHandlers.indexOf(h) !== -1;
	}

	open(_playId: string, callback?: (error: Error | null) => void): void {
		setTimeout(() => {
			callback?.(null);
		}, 0);
	}

	close(callback?: (error: Error | null) => void): void {
		setTimeout(() => {
			callback?.(null);
		}, 0);
	}

	authenticate(_token: string, callback: (error: Error | null, permission: any) => void): void {
		setTimeout(() => {
			callback(null, {
				writeTick: true,
				readTick: true,
				subscribeTick: true,
				subscribeEvent: true,
				sendEvent: true,
				maxEventPrioryt: 0
			});
		}, 0);
	}

	sendTick(_tick: pl.Tick): void {
		// do nothing
	}

	onTick(handler: (tick: pl.Tick) => void): void {
		this.tickHandlers.push(handler);
	}
	offTick(handler: (tick: pl.Tick) => void): void {
		this.tickHandlers = this.tickHandlers.filter((h) => {
			return h !== handler;
		});
	}

	sendEvent(event: pl.Event): void {
		this.eventHandlers.forEach((h: (pev: pl.Event) => void) => {
			h(event);
		});
	}

	onEvent(handler: (event: pl.Event) => void): void {
		this.eventHandlers.push(handler);
	}
	offEvent(handler: (event: pl.Event) => void): void {
		this.eventHandlers = this.eventHandlers.filter((h) => {
			return h !== handler;
		});
	}

	getTickList(
		optsOrBegin: number | GetTickListOptions,
		endOrCallback: number | ((error: Error | null, tickList?: pl.TickList) => void),
		callbackOrUndefined?: (error: Error | null, tickList?: pl.TickList) => void
	): void {
		let opts: GetTickListOptions;
		let callback: ((error: Error | null, tickList?: pl.TickList) => void);

		if (typeof optsOrBegin === "number") {
			// NOTE: optsOrBegin === "number" であれば必ず amflow@2 以前の引数だとみなしてキャストする
			opts = {
				begin: optsOrBegin,
				end: endOrCallback as number
			};
			callback = callbackOrUndefined!;
		} else {
			// NOTE: optsOrBegin !== "number" であれば必ず amflow@3 以降の引数だとみなしてキャストする
			opts = optsOrBegin;
			callback = endOrCallback as (error: Error | null, tickList?: pl.TickList) => void;
		}

		const wrap = (error: Error | null, tickArray: pl.Tick[]): void => {
			this.requestsGetTicks = this.requestsGetTicks.filter((r: GetTicksRequest) => {
				return r !== req;
			});
			if (!tickArray || tickArray.length === 0) {
				callback(null);
				return;
			}
			const ret: pl.TickList = [
				tickArray[0][0],
				tickArray[tickArray.length - 1][0],
				tickArray.filter((t: pl.Tick) => !!(t[1] || t[2]))
			];
			callback(error, ret);
		};
		const req: GetTicksRequest = { from: opts.begin, to: opts.end, respond: wrap };
		this.requestsGetTicks.push(req);
	}

	putStartPoint(_startPoint: StartPoint, _callback: (error: Error | null) => void): void {
		// do nothing
	}
	getStartPoint(_opts: { frame?: number }, callback: (error: Error | null, startPoint?: StartPoint) => void): void {
		setTimeout(() => {
			callback(null, { frame: 0, timestamp: 0, data: { seed: 0 } });
		}, 0);
	}

	// StorageReadKeyはregionKeyしか見ない + StorageValueは一つしか持たない簡易実装なので注意
	putStorageData(key: pl.StorageKey, value: pl.StorageValue, _options: any, callback: (err: Error | null) => void): void {
		const wrap = (err?: any): void => {
			this.requestsPutStorageData = this.requestsPutStorageData.filter((r: any) => {
				return r !== wrap;
			});
			this.storage[key.regionKey] = value;
			callback(err);
		};
		this.requestsPutStorageData.push(wrap);
	}
	getStorageData(keys: pl.StorageReadKey[], callback: (error: Error | null, values?: pl.StorageData[]) => void): void {
		const wrap = (err?: any): void => {
			this.requestsGetStorageData = this.requestsGetStorageData.filter((r: any) => {
				return r !== wrap;
			});
			const data = keys.map((k: pl.StorageReadKey) => {
				return { readKey: k, values: [this.storage[k.regionKey]] };
			});
			callback(err, data);
		};
		this.requestsGetStorageData.push(wrap);
	}
}
