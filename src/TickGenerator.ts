"use strict";
import * as g from "@akashic/akashic-engine";
import type * as amf from "@akashic/amflow";
import type * as pl from "@akashic/playlog";
import type { EventBuffer } from "./EventBuffer";
import { JoinResolver } from "./JoinResolver";

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
	_joinResolver: JoinResolver;

	_nextAge: number = 0;
	_generatingTick: boolean = false;

	constructor(param: TickGeneratorParameterObject) {
		if (param.errorHandler)
			this.errorTrigger.add(param.errorHandler, param.errorHandlerOwner);

		this._amflow = param.amflow;
		this._eventBuffer = param.eventBuffer;
		this._joinResolver = new JoinResolver({
			amflow: param.amflow,
			errorHandler: this.errorTrigger.fire,
			errorHandlerOwner: this.errorTrigger
		});
	}

	next(): void {
		if (!this._generatingTick)
			return;

		const joinLeaves = this._eventBuffer.readJoinLeaves();
		if (joinLeaves) {
			for (let i = 0; i < joinLeaves.length; ++i)
				this._joinResolver.request(joinLeaves[i]);
		}

		let evs = this._eventBuffer.readEvents();
		const resolvedJoinLeaves = this._joinResolver.readResolved();
		if (resolvedJoinLeaves) {
			if (evs) {
				evs.push.apply(evs, resolvedJoinLeaves);
			} else {
				evs = resolvedJoinLeaves;
			}
		}

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
