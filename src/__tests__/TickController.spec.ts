"use strict";
import { Clock } from "../Clock";
import { EventBuffer } from "../EventBuffer";
import ExecutionMode from "../ExecutionMode";
import type { Game } from "../Game";
import { TickBuffer } from "../TickBuffer";
import { TickController } from "../TickController";
import { TickGenerator } from "../TickGenerator";
import { MockAmflow } from "./helpers/MockAmflow";
import * as mockpf from "./helpers/MockPlatform";
import { prepareGame, FixtureGame } from "./helpers/prepareGame";

describe("TickController", function () {
	class ErrorCollector {
		errors: any[] = [];

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
		const errorCollector = new ErrorCollector();
		const errorHandler = errorCollector.add;
		const errorHandlerOwner = errorCollector;

		const executionMode = active ? ExecutionMode.Active : ExecutionMode.Passive;
		const pf = new mockpf.Platform({});
		const amflow = new MockAmflow();
		const game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		const clock = new Clock({ fps: 30, platform: pf, maxFramePerOnce: 5 });
		const eventBuffer = new EventBuffer({ amflow, game });
		const tickController = new TickController({ amflow, clock, eventBuffer, executionMode, errorHandler, errorHandlerOwner });
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
		const prepared = prepareTickController(true);
		const self = prepared.tickController;

		expect(self.errorTrigger.contains(prepared.errorCollector.add, prepared.errorCollector)).toBe(true);
		expect(self._amflow).toBe(prepared.amflow);
		expect(self._clock).toBe(prepared.clock);
		expect(self._started).toBe(false);
		expect(self._executionMode).toBe(ExecutionMode.Active);
		expect(self._generator instanceof TickGenerator).toBe(true);
		expect(self._buffer instanceof TickBuffer).toBe(true);
	});
});
