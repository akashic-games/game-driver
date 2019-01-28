"use strict";
import * as pl from "@akashic/playlog";
import * as amf from "@akashic/amflow";
import * as g from "@akashic/akashic-engine";
import ExecutionMode from "./ExecutionMode";
import { StorageFunc } from "./StorageFunc";
import { Game } from "./Game";
import { EventBuffer } from "./EventBuffer";
import { Clock } from "./Clock";
import { TickBuffer } from "./TickBuffer";
import { TickGenerator } from "./TickGenerator";
import * as sr from "./StorageResolver";

export interface TickControllerParameterObject {
	amflow: amf.AMFlow;
	clock: Clock;
	game: Game;  // TODO: sr.StorageResolverに必要なだけ。なくすべき。
	eventBuffer: EventBuffer;
	executionMode: ExecutionMode;
	errorHandler?: (err: Error) => void;
	errorHandlerOwner?: any;
}

/**
 * `GameLoop` に流れるTickを管理するクラス。
 *
 * `GameLoop` に対して `TickGenerator` と `AMFlow` を隠蔽し、
 * Active/Passiveに(ほぼ)関係なくTickを扱えるようにする。
 */
export class TickController {
	errorTrigger: g.Trigger<any>;

	_buffer: TickBuffer;
	_amflow: amf.AMFlow;
	_clock: Clock;
	_started: boolean;
	_executionMode: ExecutionMode;
	_generator: TickGenerator;
	_storageResolver: sr.StorageResolver;

	constructor(param: TickControllerParameterObject) {
		this.errorTrigger = new g.Trigger<any>();

		if (param.errorHandler)
			this.errorTrigger.handle(param.errorHandlerOwner, param.errorHandler);

		this._amflow = param.amflow;
		this._clock = param.clock;
		this._started = false;
		this._executionMode = param.executionMode;
		this._generator = new TickGenerator({
			amflow: param.amflow,
			eventBuffer: param.eventBuffer,
			errorHandler: this.errorTrigger.fire,
			errorHandlerOwner: this.errorTrigger
		});
		this._buffer = new TickBuffer({
			amflow: param.amflow,
			executionMode: param.executionMode
		});
		this._storageResolver = new sr.StorageResolver({
			game: param.game,
			amflow: param.amflow,
			tickGenerator: this._generator,
			tickBuffer: this._buffer,
			executionMode: param.executionMode,
			errorHandler: this.errorTrigger.fire,
			errorHandlerOwner: this.errorTrigger
		});

		this._generator.tickTrigger.handle(this, this._onTickGenerated);
		this._clock.frameTrigger.handle(this._generator, this._generator.next);
	}

	startTick(): void {
		this._started = true;
		this._updateGeneratorState();
	}

	stopTick(): void {
		this._started = false;
		this._updateGeneratorState();
	}

	startTickOnce(): void {
		this._started = true;
		this._generator.tickTrigger.handle(this, this._stopTriggerOnTick);
		this._updateGeneratorState();
	}

	setNextAge(age: number): void {
		this._generator.setNextAge(age);
	}

	forceGenerateTick(): void {
		this._generator.forceNext();
	}

	getBuffer(): TickBuffer {
		return this._buffer;
	}

	storageFunc(): StorageFunc {
		return {
			storageGetFunc: this._storageResolver.getStorageFunc,
			storagePutFunc: this._storageResolver.putStorageFunc,
			requestValuesForJoinFunc: this._storageResolver.requestValuesForJoinFunc
		};
	}

	setExecutionMode(execMode: ExecutionMode): void {
		if (this._executionMode === execMode)
			return;
		this._executionMode = execMode;
		this._updateGeneratorState();
		this._buffer.setExecutionMode(execMode);
		this._storageResolver.setExecutionMode(execMode);
	}

	_stopTriggerOnTick(): boolean {
		this.stopTick();
		return true;
	}

	_updateGeneratorState(): void {
		var toGenerate = (this._started && this._executionMode === ExecutionMode.Active);
		this._generator.startStopGenerate(toGenerate);
	}

	_onTickGenerated(tick: pl.Tick): void {
		this._amflow.sendTick(tick);
		this._buffer.addTick(tick);
	}
}
