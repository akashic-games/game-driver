"use strict";
import { Clock } from "../../lib/Clock";
import { EventBuffer } from "../../lib/EventBuffer";
import ExecutionMode from "../../lib/ExecutionMode";
import { Game } from "../../lib/Game";
import { StorageResolver } from "../../lib/StorageResolver";
import { TickBuffer } from "../../lib/TickBuffer";
import { TickController } from "../../lib/TickController";
import { TickGenerator } from "../../lib/TickGenerator";
import { MockAmflow } from "../helpers/lib/MockAmflow";
import * as mockpf from "../helpers/lib/MockPlatform";
import { prepareGame, FixtureGame } from "../helpers/lib/prepareGame";

describe("TickController", function () {
	class ErrorCollector {
		errors: any[];
		constructor() {
			this.reset();
		}
		add(e: any): void {
			this.errors.push(e);
		}
		reset(): void {
			this.errors = [];
		}
	}

	interface PrepareTickControllerResult {
		tickController: TickController;
		errorCollector: ErrorCollector;
		game: Game;
		amflow: MockAmflow;
		eventBuffer: EventBuffer;
		clock: Clock;
		looper: mockpf.Looper;
	}

	function prepareTickController(active: boolean): PrepareTickControllerResult {
		var errorCollector = new ErrorCollector();
		var errorHandler = errorCollector.add;
		var errorHandlerOwner = errorCollector;

		var executionMode = active ? ExecutionMode.Active : ExecutionMode.Passive;
		var pf = new mockpf.Platform({});
		var amflow = new MockAmflow();
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var clock = new Clock({ fps: 30, platform: pf, maxFramePerOnce: 5 });
		var eventBuffer = new EventBuffer({ amflow, game });
		var tickController = new TickController({ amflow, clock, game, eventBuffer, executionMode, errorHandler, errorHandlerOwner });
		return {
			tickController,
			errorCollector,
			game,
			amflow,
			eventBuffer,
			clock,
			looper: pf.loopers[0]
		};
	}

	it("can be instantiated", function () {
		var prepared = prepareTickController(true);
		var self = prepared.tickController;

		expect(self.errorTrigger.contains(prepared.errorCollector.add, prepared.errorCollector)).toBe(true);
		expect(self._amflow).toBe(prepared.amflow);
		expect(self._clock).toBe(prepared.clock);
		expect(self._started).toBe(false);
		expect(self._executionMode).toBe(ExecutionMode.Active);
		expect(self._generator instanceof TickGenerator).toBe(true);
		expect(self._buffer instanceof TickBuffer).toBe(true);
		expect(self._storageResolver instanceof StorageResolver).toBe(true);
	});
});
