import * as g from "@akashic/akashic-engine";
import * as amf from "@akashic/amflow";
import * as pl from "@akashic/playlog";

export interface GameEventFilterFuncs {
	addFilter: (filter: g.EventFilter, handleEmpty?: boolean) => void;
	removeFilter: (filter?: g.EventFilter) => void;
}

export interface GameHandlerSetParameterObject {
	isSnapshotSaver?: boolean;
}

export class GameHandlerSet implements g.GameHandlerSet {
	raiseEventTrigger: g.Trigger<pl.Event> = new g.Trigger();
	raiseTickTrigger: g.Trigger<pl.Event[] | undefined> = new g.Trigger();
	snapshotTrigger: g.Trigger<amf.StartPoint> = new g.Trigger();
	changeSceneModeTrigger: g.Trigger<g.SceneMode> = new g.Trigger();
	isSnapshotSaver: boolean;
	_getCurrentTimeFunc: (() => number) | null = null;
	_eventFilterFuncs: GameEventFilterFuncs | null = null;
	_local: g.LocalTickModeString | null = null;
	_tickGenerationMode: g.TickGenerationModeString | null = null;

	constructor(param: GameHandlerSetParameterObject) {
		this.isSnapshotSaver = !!param.isSnapshotSaver;
	}

	/**
	 * `Game` が利用する時刻取得関数をセットする。
	 * このメソッドは `Game#_load()` 呼び出しに先行して呼び出されていなければならない。
	 */
	setCurrentTimeFunc(fun: () => number): void {
		this._getCurrentTimeFunc = fun;
	}

	/**
	 * `Game` のイベントフィルタ関連実装をセットする。
	 * このメソッドは `Game#_load()` 呼び出しに先行して呼び出されていなければならない。
	 */
	setEventFilterFuncs(funcs: GameEventFilterFuncs): void {
		this._eventFilterFuncs = funcs;
	}

	removeAllEventFilters(): void {
		if (this._eventFilterFuncs)
			this._eventFilterFuncs.removeFilter();
	}

	changeSceneMode(mode: g.SceneMode): void {
		this._local = mode.local;
		this._tickGenerationMode = mode.tickGenerationMode;
		this.changeSceneModeTrigger.fire(mode);
	}

	getCurrentTime(): number {
		// GameLoopの同名メソッドとは戻り値が異なるが、 `Game.getCurrentTime()` は `Date.now()` の代替として使用されるため、整数値を返す。
		return Math.floor(this._getCurrentTimeFunc!());
	}

	raiseEvent(event: pl.Event): void {
		this.raiseEventTrigger.fire(event);
	}

	raiseTick(events?: pl.Event[]): void {
		this.raiseTickTrigger.fire(events);
	}

	addEventFilter(filter: g.EventFilter, handleEmpty?: boolean): void {
		if (this._eventFilterFuncs)
			this._eventFilterFuncs.addFilter(filter, handleEmpty);
	}

	removeEventFilter(filter: g.EventFilter): void {
		if (this._eventFilterFuncs)
			this._eventFilterFuncs.removeFilter(filter);
	}

	shouldSaveSnapshot(): boolean {
		return this.isSnapshotSaver;
	}

	getInstanceType(): "active" | "passive" {
		// NOTE: Active かどうかは `shouldSaveSnapshot()` と等価なので、簡易対応としてこの実装を用いる。
		return this.shouldSaveSnapshot() ? "active" : "passive";
	}

	saveSnapshot(
		frame: number,
		gameSnapshot: any,
		randGenSer: any,
		nextEntityId: number,
		timestamp: number = this._getCurrentTimeFunc!()
	): void {
		if (!this.shouldSaveSnapshot())
			return;
		this.snapshotTrigger.fire({
			frame,
			timestamp,
			data: {
				randGenSer,
				nextEntityId,
				gameSnapshot
			}
		});
	}
}
