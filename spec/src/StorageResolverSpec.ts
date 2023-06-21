"use strict";
import * as g from "@akashic/akashic-engine";
import { MockAmflow } from "../helpers/lib/MockAmflow";
import { prepareGame, FixtureGame } from "../helpers/lib/prepareGame";
import ExecutionMode from "../../lib/ExecutionMode";
import { Game } from "../../lib/Game";
import { EventBuffer } from "../../lib/EventBuffer";
import { TickGenerator } from "../../lib/TickGenerator";
import { TickBuffer } from "../../lib/TickBuffer";
import { StorageResolver } from "../../lib/StorageResolver";

describe("StorageResolver", function () {
	class ErrorCollector {
		errors: any[];
		constructor() { this.reset(); }
		add(e: any): void { this.errors.push(e); }
		reset(): void { this.errors = []; }
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
		var executionMode = active ? ExecutionMode.Active : ExecutionMode.Passive;
		var errorCollector = new ErrorCollector();
		var errorHandler = errorCollector.add;
		var errorHandlerOwner = errorCollector;
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var amflow = new MockAmflow();
		var eventBuffer = new EventBuffer({ amflow, game });
		var tickGenerator = new TickGenerator({ amflow, eventBuffer, errorHandler, errorHandlerOwner });
		var tickBuffer = new TickBuffer({ amflow, executionMode });
		var storageResolver = new StorageResolver({ game, amflow, tickGenerator, tickBuffer, executionMode, errorHandler, errorHandlerOwner });
		game.setStorageFunc({
			storageGetFunc: storageResolver.getStorageFunc,
			storagePutFunc: storageResolver.putStorageFunc,
			requestValuesForJoinFunc: storageResolver.requestValuesForJoinFunc
		});
		return { storageResolver, errorCollector, game, amflow, eventBuffer, tickGenerator, tickBuffer };
	}

	it("can be instantiated", function () {
		var prepared = prepareStorageResolver(true);
		var self = prepared.storageResolver;

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
		var prepared = prepareStorageResolver(true);
		var self = prepared.storageResolver;

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
		var prepared = prepareStorageResolver(true);
		var self = prepared.storageResolver;
		var storageData = [{
			readKey: { region: g.StorageRegion.Counts, regionKey: "dummy" },
			values: [{ data: "dummyData0", tag: "dummyTag" }, { data: "dummyData1" }]
		}];
		self._tickGenerator.gotStorageTrigger.fire({ age: 1, storageData: storageData });
		expect(self._unresolvedStorages[1]).toBe(storageData);

		var loader = prepared.game.storage._createLoader([storageData[0].readKey], 1);
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
		var prepared = prepareStorageResolver(true);
		var self = prepared.storageResolver;
		var storageData = [{
			readKey: { region: g.StorageRegion.Counts, regionKey: "dummy" },
			values: [{ data: "dummyData0", tag: "dummyTag" }, { data: "dummyData1" }]
		}];

		var loader = prepared.game.storage._createLoader([storageData[0].readKey]);
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
		var prepared = prepareStorageResolver(true);
		var self = prepared.storageResolver;
		self.putStorageFunc({ region: 0 as g.StorageRegion, regionKey: "foostoragekey" }, { data: 42 }, null);
		prepared.amflow.requestsPutStorageData[0]();
		expect(prepared.amflow.storage["foostoragekey"]).toEqual({ data: 42 });
	});

	it("handles storage writing failure", function () {
		var err = new Error("Test Error");
		var prepared = prepareStorageResolver(true);
		var self = prepared.storageResolver;
		self.putStorageFunc({ region: 0 as g.StorageRegion, regionKey: "foostoragekey" }, { data: 42 }, null);
		prepared.amflow.requestsPutStorageData[0](err);
		expect(prepared.errorCollector.errors[0]).toBe(err);
	});
});
