"use strict";
import * as pl from "@akashic/playlog";
import { AMFlow } from "@akashic/amflow";
import * as pdi from "@akashic/akashic-pdi";
import * as g from "@akashic/akashic-engine";
import { Game } from "./Game";

export interface EventBufferMode {
	/**
	 * ローカルイベントの受信者であるか。
	 * 真である場合、PDI実装などから与えられたローカルイベントを蓄える。
	 * 指定されなかった場合、真。歴史的経緯のため他の値と初期値が異なる点に注意。
	 */
	isLocalReceiver?: boolean;

	/**
	 * 受信者であるか。
	 * 真である場合、 `AMFlow#onEvent()` でイベントを受信して蓄える。
	 * 指定されなかった場合、偽。
	 */
	isReceiver?: boolean;

	/**
	 * 送信者であるか。
	 * 真である場合、受け取った(非ローカル)イベントを `AMFlow` 経由で送信する。
	 * 指定されなかった場合、偽。
	 */
	isSender?: boolean;

	/**
	 * 受け取ったイベントを削除するかどうか。
	 * 真である場合、受け取ったイベントを破棄する。`isReceiver` との差異に注意。
	 * `isReceiver` が偽の場合 `AMFlow` 経由で「受信しない」。
	 * `(isReceiver && isDiscarder)` の場合「受信するが破棄する」。
	 * 指定されなかった場合、偽。
	 */
	isDiscarder?: boolean;

	/**
	 * 優先度要求が省略されたイベントに与える優先度要求。
	 * isSender に真を与える時、指定せねばならない。
	 */
	defaultEventPriority?: number;
}

export interface EventBufferParameterObject {
	amflow: AMFlow;
	game: Game;
}

export interface EventFilterEntry {
	func: g.EventFilter;
	handleEmpty: boolean;
}

/**
 * AMFlowとPDIから流れ込むイベントを蓄積するバッファ。
 *
 * AMFLowから受信するかどうか、AMFlowに送るかどうかは外部から切り替えることができる。
 * 状態によっては、`_amflow` の認証で `subscribeEvent` と `sendEvent` のいずれかまたは両方の権限を取得している必要がある。
 * 詳細は `setMode()` のコメントを参照。
 */
export class EventBuffer implements pdi.PlatformEventHandler {
	_amflow: AMFlow;
	_isLocalReceiver: boolean;
	_isReceiver: boolean;
	_isSender: boolean;
	_isDiscarder: boolean;
	_defaultEventPriority: number;

	_buffer: pl.Event[];
	_joinLeaveBuffer: pl.Event[];
	_localBuffer: pl.Event[];

	_filters: EventFilterEntry[];
	_unfilteredLocalEvents: pl.Event[];
	_unfilteredEvents: pl.Event[];

	_resolvePointEvent_bound: (e: pdi.PlatformPointEvent) => pl.Event | null;
	_onEvent_bound: (pev: pl.Event) => void;

	static isEventLocal(pev: pl.Event): boolean {
		switch (pev[g.EventIndex.General.Code]) {
		case pl.EventCode.Join:
			return pev[g.EventIndex.Join.Local];
		case pl.EventCode.Leave:
			return pev[g.EventIndex.Leave.Local];
		case pl.EventCode.Timestamp:
			return pev[g.EventIndex.Timestamp.Local];
		case pl.EventCode.Message:
			return pev[g.EventIndex.Message.Local];
		case pl.EventCode.PointDown:
			return pev[g.EventIndex.PointDown.Local];
		case pl.EventCode.PointMove:
			return pev[g.EventIndex.PointMove.Local];
		case pl.EventCode.PointUp:
			return pev[g.EventIndex.PointUp.Local];
		case pl.EventCode.Operation:
			return pev[g.EventIndex.Operation.Local];
		default:
			throw new Error("EventBuffer.isEventLocal");
		}
	}

	constructor(param: EventBufferParameterObject) {
		this._amflow = param.amflow;
		this._isLocalReceiver = true;
		this._isReceiver = false;
		this._isSender = false;
		this._isDiscarder = false;
		this._defaultEventPriority = 0;

		this._buffer = [];
		this._joinLeaveBuffer = [];
		this._localBuffer = [];

		this._filters = null;
		this._unfilteredLocalEvents = [];
		this._unfilteredEvents = [];

		this._resolvePointEvent_bound = param.game.resolvePointEvent.bind(param.game);
		this._onEvent_bound = this.onEvent.bind(this);
	}

	/**
	 * モードを切り替える。
	 *
	 * この関数の呼び出す場合、最後に呼び出された _amflow#authenticate() から得た Permission は次の条件を満たさねばならない:
	 * * 引数 `param.isReceiver` に真を渡す場合、次に偽を渡すまでの間、 `subscribeEvent` が真であること。
	 * * 引数 `param.isSender` に真を渡す場合、次に偽を渡すまでの間、 `sendEvent` が真であること。
	 */
	setMode(param: EventBufferMode): void {
		if (param.isLocalReceiver != null) {
			this._isLocalReceiver = param.isLocalReceiver;
		}
		if (param.isReceiver != null) {
			if (this._isReceiver !== param.isReceiver) {
				this._isReceiver = param.isReceiver;
				if (param.isReceiver) {
					this._amflow.onEvent(this._onEvent_bound);
				} else {
					this._amflow.offEvent(this._onEvent_bound);
				}
			}
		}
		if (param.isSender != null) {
			this._isSender = param.isSender;
		}
		if (param.isDiscarder != null) {
			this._isDiscarder = param.isDiscarder;
		}
		if (param.defaultEventPriority != null) {
			this._defaultEventPriority = param.defaultEventPriority;
		}
	}

	getMode(): EventBufferMode {
		return {
			isLocalReceiver: this._isLocalReceiver,
			isReceiver: this._isReceiver,
			isSender: this._isSender,
			isDiscarder: this._isDiscarder,
			defaultEventPriority: this._defaultEventPriority
		};
	}

	onEvent(pev: pl.Event): void {
		if (EventBuffer.isEventLocal(pev)) {
			if (this._isLocalReceiver && !this._isDiscarder) {
				this._unfilteredLocalEvents.push(pev);
			}
			return;
		}
		if (this._isReceiver && !this._isDiscarder) {
			this._unfilteredEvents.push(pev);
		}
		if (this._isSender) {
			if (pev[g.EventIndex.General.Priority] == null) {
				pev[g.EventIndex.General.Priority] = this._defaultEventPriority;
			}
			this._amflow.sendEvent(pev);
		}
	}

	onPointEvent(e: pdi.PlatformPointEvent): void {
		const pev = this._resolvePointEvent_bound(e);
		if (pev) this.onEvent(pev);
	}

	/**
	 * filterを無視してイベントを追加する。
	 */
	addEventDirect(pev: pl.Event): void {
		if (EventBuffer.isEventLocal(pev)) {
			if (!this._isLocalReceiver || this._isDiscarder)
				return;
			this._localBuffer.push(pev);
			return;
		}
		if (this._isReceiver && !this._isDiscarder) {
			if (pev[g.EventIndex.General.Code] === pl.EventCode.Join || pev[g.EventIndex.General.Code] === pl.EventCode.Leave) {
				this._joinLeaveBuffer.push(pev);
			} else {
				this._buffer.push(pev);
			}
		}
		if (this._isSender) {
			if (pev[g.EventIndex.General.Priority] == null) {
				pev[g.EventIndex.General.Priority] = this._defaultEventPriority;
			}
			this._amflow.sendEvent(pev);
		}
	}

	readEvents(): pl.Event[] {
		let ret = this._buffer;
		if (ret.length === 0)
			return null;
		this._buffer = [];
		return ret;
	}

	readJoinLeaves(): pl.Event[] {
		let ret = this._joinLeaveBuffer;
		if (ret.length === 0)
			return null;
		this._joinLeaveBuffer = [];
		return ret;
	}

	readLocalEvents(): pl.Event[] {
		let ret = this._localBuffer;
		if (ret.length === 0)
			return null;
		this._localBuffer = [];
		return ret;
	}

	addFilter(filter: g.EventFilter, handleEmpty?: boolean): void {
		if (!this._filters)
			this._filters = [];
		this._filters.push({ func: filter, handleEmpty: !!handleEmpty });
	}

	removeFilter(filter?: g.EventFilter): void {
		if (!this._filters)
			return;
		if (!filter) {
			this._filters = null;
			return;
		}
		for (let i = this._filters.length - 1; i >= 0; --i) {
			if (this._filters[i].func === filter)
				this._filters.splice(i, 1);
		}
	}

	processEvents(isLocal?: boolean): void {
		const ulpevs = this._unfilteredLocalEvents;
		const upevs = this._unfilteredEvents;

		this._unfilteredLocalEvents = [];
		let pevs = ulpevs;
		if (!isLocal && upevs.length > 0) {
			pevs = (pevs.length > 0) ? pevs.concat(upevs) : upevs;
			this._unfilteredEvents = [];
		}

		if (this._filters) {
			for (let i = 0; i < this._filters.length; ++i) {
				const filter = this._filters[i];
				if (pevs.length > 0 || filter.handleEmpty)
					pevs = this._filters[i].func(pevs) || [];
			}
		}

		for (let i = 0; i < pevs.length; ++i) {
			const pev = pevs[i];
			if (EventBuffer.isEventLocal(pev)) {
				this._localBuffer.push(pev);
			} else if (pev[g.EventIndex.General.Code] === pl.EventCode.Join || pev[g.EventIndex.General.Code] === pl.EventCode.Leave) {
				this._joinLeaveBuffer.push(pev);
			} else {
				this._buffer.push(pev);
			}
		}
	}
}
