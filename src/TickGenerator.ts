"use strict";
import * as g from "@akashic/akashic-engine";
import type * as amf from "@akashic/amflow";
import type * as pl from "@akashic/playlog";
import type { EventBuffer } from "./EventBuffer";

export interface TickGeneratorParameterObject {
	amflow: amf.AMFlow;
	eventBuffer: EventBuffer;
	errorHandler?: (err: Error) => void;
	errorHandlerOwner?: any;
}

/**
 * `playlog.Tick` の生成器。
 * `next()` が呼ばれる度に、EventBuffer に蓄積されたイベントを集めてtickを生成、`tickTrigger` で通知する。
 */
export class TickGenerator {
	tickTrigger: g.Trigger<pl.Tick> = new g.Trigger();
	errorTrigger: g.Trigger<Error> = new g.Trigger();

	_amflow: amf.AMFlow;
	_eventBuffer: EventBuffer;

	_nextAge: number = 0;
	_generatingTick: boolean = false;

	constructor(param: TickGeneratorParameterObject) {
		if (param.errorHandler)
			this.errorTrigger.add(param.errorHandler, param.errorHandlerOwner);

		this._amflow = param.amflow;
		this._eventBuffer = param.eventBuffer;
	}

	next(): void {
		if (!this._generatingTick)
			return;

		// NOTE: readEvents() と readJoinEventLeaves() は歴史的経緯により分離しているもので、現在は統合することもできる。
		// ただし統合するとフレーム内のイベントの順序が変化する。この順序が問題になるケースは知られていないが、念のため分離したままにしている。
		const normalEvents = this._eventBuffer.readEvents();
		const joinLeaves = this._eventBuffer.readJoinLeaves();
		const evs = (normalEvents && joinLeaves) ? normalEvents.concat(joinLeaves) : (normalEvents ?? joinLeaves);

		this.tickTrigger.fire([
			this._nextAge++,  // 0: フレーム番号
			evs               // 1?: イベント
		]);
	}

	forceNext(): void {
		const origValue = this._generatingTick;
		this._generatingTick = true;
		this.next();
		this._generatingTick = origValue;
	}

	startStopGenerate(toGenerate: boolean): void {
		this._generatingTick = toGenerate;
	}

	startTick(): void {
		this._generatingTick = true;
	}

	stopTick(): void {
		this._generatingTick = false;
	}

	setNextAge(age: number): void {
		this._nextAge = age;
	}
}
