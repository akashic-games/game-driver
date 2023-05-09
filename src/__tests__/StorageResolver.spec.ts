"use strict";
import * as g from "@akashic/akashic-engine";
import { EventBuffer } from "../EventBuffer";
import ExecutionMode from "../ExecutionMode";
import type { Game } from "../Game";
import { StorageResolver } from "../StorageResolver";
import { TickBuffer } from "../TickBuffer";
import { TickGenerator } from "../TickGenerator";
import { MockAmflow } from "./helpers/MockAmflow";
import { prepareGame, FixtureGame } from "./helpers/prepareGame";

describe("StorageResolver", function () {
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

	interface PrepareStorageResolverResult {
		storageResolver: StorageResolver;
		errorCollector: ErrorCollector;
		game: Game;
		amflow: MockAmflow;
		eventBuffer: EventBuffer;
		tickGenerator: TickGenerator;
		tickBuffer: TickBuffer;
	}

	function prepareStorageResolver(active: boolean): PrepareStorageResolverResult {
		const executionMode = active ? ExecutionMode.Active : ExecutionMode.Passive;
		const errorCollector = new ErrorCollector();
		const errorHandler = errorCollector.add;
		const errorHandlerOwner = errorCollector;
		const game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		const amflow = new MockAmflow();
		const eventBuffer = new EventBuffer({ amflow, game });
		const tickGenerator = new TickGenerator({ amflow, eventBuffer, errorHandler, errorHandlerOwner });
		const tickBuffer = new TickBuffer({ amflow, executionMode });
		const storageResolver = new StorageResolver({
			game, amflow, tickGenerator, tickBuffer, executionMode, errorHandler, errorHandlerOwner
		});
		game.setStorageFunc({
			storageGetFunc: storageResolver.getStorageFunc,
			storagePutFunc: storageResolver.putStorageFunc,
			requestValuesForJoinFunc: storageResolver.requestValuesForJoinFunc
		});
		return { storageResolver, errorCollector, game, amflow, eventBuffer, tickGenerator, tickBuffer };
	}

	it("can be instantiated", function () {
		const prepared = prepareStorageResolver(true);
		const self = prepared.storageResolver;

		expect(self.errorTrigger.contains(prepared.errorCollector.add, prepared.errorCollector)).toBe(true);
		expect(typeof self.getStorageFunc).toBe("function");
		expect(typeof self.putStorageFunc).toBe("function");
		expect(typeof self.requestValuesForJoinFunc).toBe("function");

		expect(self._game).toBe(prepared.game);
		expect(self._amflow).toBe(prepared.amflow);
		expect(self._tickGenerator).toBe(prepared.tickGenerator);
		expect(self._tickBuffer).toBe(prepared.tickBuffer);
		expect(self._executionMode).toBe(ExecutionMode.Active);
		expect(self._unresolvedLoaders).toEqual({});
		expect(self._unresolvedStorages).toEqual({});
	});

	it("can switch execution mode", function () {
		const prepared = prepareStorageResolver(true);
		const self = prepared.storageResolver;

		expect(self._executionMode).toBe(ExecutionMode.Active);
		expect(self._tickGenerator.gotStorageTrigger.contains(self._onGotStorageOnTick, self)).toBe(true);
		expect(self._tickBuffer.gotStorageTrigger.contains(self._onGotStorageOnTick, self)).toBe(false);

		self.setExecutionMode(ExecutionMode.Passive);
		expect(self._executionMode).toBe(ExecutionMode.Passive);
		expect(self._tickGenerator.gotStorageTrigger.contains(self._onGotStorageOnTick, self)).toBe(false);
		expect(self._tickBuffer.gotStorageTrigger.contains(self._onGotStorageOnTick, self)).toBe(true);

		self.setExecutionMode(ExecutionMode.Active);
		expect(self._executionMode).toBe(ExecutionMode.Active);
		expect(self._tickGenerator.gotStorageTrigger.contains(self._onGotStorageOnTick, self)).toBe(true);
		expect(self._tickBuffer.gotStorageTrigger.contains(self._onGotStorageOnTick, self)).toBe(false);

		self.setExecutionMode(ExecutionMode.Active); // ただの実行パス稼ぎ
	});

	it("holds given storage data until requested", function (done: any) {
		const prepared = prepareStorageResolver(true);
		const self = prepared.storageResolver;
		const storageData = [{
			readKey: { region: g.StorageRegion.Counts, regionKey: "dummy" },
			values: [{ data: "dummyData0", tag: "dummyTag" }, { data: "dummyData1" }]
		}];
		self._tickGenerator.gotStorageTrigger.fire({ age: 1, storageData: storageData });
		expect(self._unresolvedStorages[1]).toBe(storageData);

		const loader = prepared.game.storage._createLoader([storageData[0].readKey], 1);
		loader._load({
			_onStorageLoadError: done.fail,
			_onStorageLoaded: function () {
				expect(self._unresolvedLoaders[1]).toBe(undefined);  // 1 は _createLoader() の引数に由来。詳細は StorageResolver のコメントを参照。
				expect(self._unresolvedStorages[1]).toBe(undefined);
				expect(loader._valueStore._values).toEqual(storageData.map(sd => sd.values));
				done();
			}
		});
	});

	it("reports the requested storage data", function (done: any) {
		const prepared = prepareStorageResolver(true);
		const self = prepared.storageResolver;
		const storageData = [{
			readKey: { region: g.StorageRegion.Counts, regionKey: "dummy" },
			values: [{ data: "dummyData0", tag: "dummyTag" }, { data: "dummyData1" }]
		}];

		const loader = prepared.game.storage._createLoader([storageData[0].readKey]);
		loader._load({
			_onStorageLoadError: done.fail,
			_onStorageLoaded: function () {
				expect(self._unresolvedLoaders[0]).toBe(undefined);  // 0 は TickGenerator の次の生成ageに由来
				expect(self._unresolvedStorages[0]).toBe(undefined);
				expect(loader._valueStore._values).toEqual(storageData.map(sd => sd.values));
				done();
			}
		});
		expect(self._unresolvedLoaders[0]).toBe(loader);  // 0 は TickGenerator の次の生成ageに由来
	 self._tickGenerator.gotStorageTrigger.fire({ age: 0, storageData: storageData });
	});

	it("puts storage through amflow", function () {
		const prepared = prepareStorageResolver(true);
		const self = prepared.storageResolver;
		self.putStorageFunc({ region: g.StorageRegion.Slots, regionKey: "foostoragekey" }, { data: 42 });
		prepared.amflow.requestsPutStorageData[0]();
		expect(prepared.amflow.storage.foostoragekey).toEqual({ data: 42 });
	});

	it("handles storage writing failure", function () {
		const err = new Error("Test Error");
		const prepared = prepareStorageResolver(true);
		const self = prepared.storageResolver;
		self.putStorageFunc({ region: g.StorageRegion.Slots, regionKey: "foostoragekey" }, { data: 42 });
		prepared.amflow.requestsPutStorageData[0](err);
		expect(prepared.errorCollector.errors[0]).toBe(err);
	});
});
