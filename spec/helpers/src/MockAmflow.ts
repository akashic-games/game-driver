import * as pl from "@akashic/playlog";
import { AMFlow, StartPoint } from "@akashic/amflow";

export interface GetTicksRequest {
	from: number;
	to: number;
	respond: (error: Error, ticks: pl.Tick[]) => void;
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

	open(playId: string, callback?: (error: Error | null) => void): void {
		setTimeout(() => { callback(null); }, 0);
	}

	close(callback?: (error: Error | null) => void): void {
		setTimeout(() => { callback(null); }, 0);
	}

	authenticate(token: string, callback: (error: Error | null, permission: any) => void): void {
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

	sendTick(tick: pl.Tick): void {
		// do nothing
	}

	onTick(handler: (tick: pl.Tick) => void): void {
		this.tickHandlers.push(handler);
	}
	offTick(handler: (tick: pl.Tick) => void): void {
		this.tickHandlers = this.tickHandlers.filter((h) => { return h !== handler; });
	}

	sendEvent(event: pl.Event): void {
		this.eventHandlers.forEach((h: (pev: pl.Event) => void) => { h(event); });
	}

	onEvent(handler: (event: pl.Event) => void): void {
		this.eventHandlers.push(handler);
	}
	offEvent(handler: (event: pl.Event) => void): void {
		this.eventHandlers = this.eventHandlers.filter((h) => { return h !== handler; });
	}

	getTickList(from: number, to: number, callback: (error: Error | null, tickList?: pl.TickList) => void): void {
		var req: GetTicksRequest;
		var wrap = (error: Error, tickArray: pl.Tick[]) => {
			this.requestsGetTicks = this.requestsGetTicks.filter((r: GetTicksRequest) => { return r !== req; });
			if (!tickArray || tickArray.length === 0) {
				callback(null, null);
				return;
			}
			var ret: pl.TickList = [
				tickArray[0][0],
				tickArray[tickArray.length - 1][0],
				tickArray.filter((t: pl.Tick) => !!(t[1] || t[2]))
			];
			callback(error, ret);
		};
		req = { from: from, to: to, respond: wrap };
		this.requestsGetTicks.push(req);
	}

	putStartPoint(startPoint: StartPoint, callback: (error: Error | null) => void): void {
		// do nothing
	}
	getStartPoint(opts: { frame?: number; }, callback: (error: Error | null, startPoint?: StartPoint) => void): void {
		setTimeout(() => { callback(null, { frame: 0, timestamp: 0, data: { seed: 0 } }); }, 0);
	}

	// StorageReadKeyはregionKeyしか見ない + StorageValueは一つしか持たない簡易実装なので注意
	putStorageData(key: pl.StorageKey, value: pl.StorageValue, options: any, callback: (err: Error | null) => void): void {
		var wrap = (err?: any) => {
			this.requestsPutStorageData = this.requestsPutStorageData.filter((r: any) => { return r !== wrap; });
			this.storage[key.regionKey] = value;
			callback(err);
		};
		this.requestsPutStorageData.push(wrap);
	}
	getStorageData(keys: pl.StorageReadKey[], callback: (error: Error | null, values?: pl.StorageData[]) => void): void {
		var wrap = (err?: any) => {
			this.requestsGetStorageData = this.requestsGetStorageData.filter((r: any) => { return r !== wrap; });
			var data = keys.map((k: pl.StorageReadKey) => {
				return { readKey: k, values: [this.storage[k.regionKey]] };
			});
			callback(err, data);
		};
		this.requestsGetStorageData.push(wrap);
	}
}
