"use strict";
import * as pl from "@akashic/playlog";
import { AMFlow } from "@akashic/amflow";
import * as pdi from "@akashic/akashic-pdi";
import * as g from "@akashic/akashic-engine";
import * as EventIndex from "./EventIndex";
import { PointEventResolver } from "./PointEventResolver";
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
	_unfilteredJoinLeaves: pl.Event[];

	_pointEventResolver: PointEventResolver;
	_onEvent_bound: (pev: pl.Event) => void;

	static isEventLocal(pev: pl.Event): boolean {
		switch (pev[EventIndex.General.Code]) {
		case pl.EventCode.Join:
			return pev[EventIndex.Join.Local];
		case pl.EventCode.Leave:
			return pev[EventIndex.Leave.Local];
		case pl.EventCode.Timestamp:
			return pev[EventIndex.Timestamp.Local];
		case pl.EventCode.Message:
			return pev[EventIndex.Message.Local];
		case pl.EventCode.PointDown:
			return pev[EventIndex.PointDown.Local];
		case pl.EventCode.PointMove:
			return pev[EventIndex.PointMove.Local];
		case pl.EventCode.PointUp:
			return pev[EventIndex.PointUp.Local];
		case pl.EventCode.Operation:
			return pev[EventIndex.Operation.Local];
		default:
			throw g.ExceptionFactory.createAssertionError("EventBuffer.isEventLocal");
		}
	}

	constructor(param: EventBufferParameterObject) {
		this._amflow = param.amflow;
		this._isLocalReceiver = true;
		this._isReceiver = false;
		this._isSender = false;
		this._isDiscarder = false;
		this._defaultEventPriority = 0;

		this._buffer = null;
		this._joinLeaveBuffer = null;
		this._localBuffer = null;

		this._filters = null;
		this._unfilteredLocalEvents = [];
		this._unfilteredEvents = [];
		this._unfilteredJoinLeaves = [];

		this._pointEventResolver = new PointEventResolver({ game: param.game });
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
			if (this._isLocalReceiver && !this._isDiscarder)
				this._unfilteredLocalEvents.push(pev);
			return;
		}
		if (this._isReceiver && !this._isDiscarder) {
			if (pev[EventIndex.General.Code] === pl.EventCode.Join || pev[EventIndex.General.Code] === pl.EventCode.Leave) {
				this._unfilteredJoinLeaves.push(pev);
			} else {
				this._unfilteredEvents.push(pev);
			}
		}
		if (this._isSender) {
			if (pev[EventIndex.General.Priority] == null) {
				pev[EventIndex.General.Priority] = this._defaultEventPriority;
			}
			this._amflow.sendEvent(pev);
		}
	}

	onPointEvent(e: pdi.PointEvent): void {
		let pev: pl.Event;
		switch (e.type) {
		case pdi.PointType.Down:
			pev = this._pointEventResolver.pointDown(e);
			break;
		case pdi.PointType.Move:
			pev = this._pointEventResolver.pointMove(e);
			break;
		case pdi.PointType.Up:
			pev = this._pointEventResolver.pointUp(e);
			break;
		}
		if (!pev)
			return;
		this.onEvent(pev);
	}

	/**
	 * filterを無視してイベントを追加する。
	 */
	addEventDirect(pev: pl.Event): void {
		if (EventBuffer.isEventLocal(pev)) {
			if (!this._isLocalReceiver || this._isDiscarder)
				return;
			if (this._localBuffer) {
				this._localBuffer.push(pev);
			} else {
				this._localBuffer = [pev];
			}
			return;
		}
		if (this._isReceiver && !this._isDiscarder) {
			if (pev[EventIndex.General.Code] === pl.EventCode.Join || pev[EventIndex.General.Code] === pl.EventCode.Leave) {
				if (this._joinLeaveBuffer) {
					this._joinLeaveBuffer.push(pev);
				} else {
					this._joinLeaveBuffer = [pev];
				}
			} else {
				if (this._buffer) {
					this._buffer.push(pev);
				} else {
					this._buffer = [pev];
				}
			}
		}
		if (this._isSender) {
			if (pev[EventIndex.General.Priority] == null) {
				pev[EventIndex.General.Priority] = this._defaultEventPriority;
			}
			this._amflow.sendEvent(pev);
		}
	}

	readEvents(): pl.Event[] {
		let ret = this._buffer;
		this._buffer = null;
		return ret;
	}

	readJoinLeaves(): pl.Event[] {
		let ret = this._joinLeaveBuffer;
		this._joinLeaveBuffer = null;
		return ret;
	}

	readLocalEvents(): pl.Event[] {
		let ret = this._localBuffer;
		this._localBuffer = null;
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

	processEvents(): void {
		let lpevs = this._unfilteredLocalEvents;
		let pevs = this._unfilteredEvents;
		let joins = this._unfilteredJoinLeaves;

		if (!this._filters) {
			if (lpevs.length > 0) {
				this._unfilteredLocalEvents = [];
				this._localBuffer = this._localBuffer ? this._localBuffer.concat(lpevs) : lpevs;
			}
			if (pevs.length > 0) {
				this._unfilteredEvents = [];
				this._buffer = this._buffer ? this._buffer.concat(pevs) : pevs;
			}
			if (joins.length > 0) {
				this._unfilteredJoinLeaves = [];
				this._joinLeaveBuffer = this._joinLeaveBuffer ? this._joinLeaveBuffer.concat(joins) : joins;
			}
			return;
		}

		if (lpevs.length === 0 && pevs.length === 0 && joins.length === 0) {
			for (let i = 0; i < this._filters.length; ++i) {
				if (!this._filters[i].handleEmpty)
					continue;
				const gpevs = this._filters[i].func([]);
				if (!gpevs)
					continue;
				for (let j = 0; j < gpevs.length; ++j) {
					const pev = gpevs[j];
					if (EventBuffer.isEventLocal(pev)) {
						lpevs.push(pev);
					} else if (pev[EventIndex.General.Code] === pl.EventCode.Join || pev[EventIndex.General.Code] === pl.EventCode.Leave) {
						joins.push(pev);
					} else {
						pevs.push(pev);
					}
				}
			}
		}

		if (lpevs.length > 0) {
			this._unfilteredLocalEvents = [];
			for (let i = 0; i < this._filters.length; ++i) {
				lpevs = this._filters[i].func(lpevs);
				if (!lpevs)
					break;
			}
			if (lpevs && lpevs.length > 0)
				this._localBuffer = this._localBuffer ? this._localBuffer.concat(lpevs) : lpevs;
		}
		if (pevs.length > 0) {
			this._unfilteredEvents = [];
			for (let i = 0; i < this._filters.length; ++i) {
				pevs = this._filters[i].func(pevs);
				if (!pevs)
					break;
			}
			if (pevs && pevs.length > 0)
				this._buffer = this._buffer ? this._buffer.concat(pevs) : pevs;
		}
		if (joins.length > 0) {
			this._unfilteredJoinLeaves = [];
			for (let i = 0; i < this._filters.length && joins && joins.length > 0; ++i) {
				joins = this._filters[i].func(joins);
				if (!joins)
					break;
			}
			if (joins && joins.length > 0)
				this._joinLeaveBuffer = this._joinLeaveBuffer ? this._joinLeaveBuffer.concat(joins) : joins;
		}
	}
}
