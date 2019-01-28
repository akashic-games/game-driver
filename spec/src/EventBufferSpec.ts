import * as pl from "@akashic/playlog";
import * as pdi from "@akashic/akashic-pdi";
import EventPriority from "../../lib/EventPriority";
import * as EventIndex from "../../lib/EventIndex";
import { MockAmflow } from "../helpers/lib/MockAmflow";
import { prepareGame, FixtureGame } from "../helpers/lib/prepareGame";
import { EventBuffer } from "../../lib/EventBuffer";

describe("EventBuffer", function () {
	it("can be instantiated", function () {
		var amflow = new MockAmflow();
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var self = new EventBuffer({ amflow: amflow, game: game });

		expect(self._amflow).toBe(amflow);
		expect(self._isLocalReceiver).toBe(true);
		expect(self._isReceiver).toBe(false);
		expect(self._isSender).toBe(false);
		expect(self._isDiscarder).toBe(false);
	});

	it("can change mode", function () {
		var amflow = new MockAmflow();
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var self = new EventBuffer({ amflow: amflow, game: game });

		expect(amflow.hasEventHandler(self._onEvent_bound)).toBe(false);
		self.setMode({ isReceiver: true });
		self.setMode({ isReceiver: true }); // ただの通過パス稼ぎ
		expect(self.getMode()).toEqual({
			isSender: false,
			isReceiver: true,
			isLocalReceiver: true,
			isDiscarder: false,
			defaultEventPriority: 0
		});
		expect(amflow.hasEventHandler(self._onEvent_bound)).toBe(true);
		self.setMode({ isSender: true, isReceiver: false, isLocalReceiver: false, defaultEventPriority: 2 });
		self.setMode({ isSender: true, isDiscarder: true});
		expect(self.getMode()).toEqual({
			isSender: true,
			isReceiver: false,
			isLocalReceiver: false,
			isDiscarder: true,
			defaultEventPriority: 2
		});
		expect(amflow.hasEventHandler(self._onEvent_bound)).toBe(false);
	});

	it("drops local events unless isLocalReceiver", function () {
		var amflow = new MockAmflow();
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var self = new EventBuffer({ amflow: amflow, game: game });

		// Message: Code, Priority, PlayerId, Message, Local
		var msge: pl.MessageEvent = [ pl.EventCode.Message, 0, "dummyPid", "Message", true];

		var sent: pl.Event[] = [];
		amflow.onEvent(sent.push.bind(sent));

		self.onEvent(msge);
		self.processEvents();
		expect(sent.length).toBe(0);
		expect(self.readLocalEvents()).toEqual([msge]);

		self.setMode({ isLocalReceiver: false });

		self.onEvent(msge);
		self.processEvents();
		expect(sent.length).toBe(0);
		expect(self.readLocalEvents()).toEqual(null);

		self.addEventDirect(msge);
		expect(sent.length).toBe(0);
		expect(self.readLocalEvents()).toEqual(null);

		self.setMode({ isLocalReceiver: true });

		self.addEventDirect(msge);
		self.addEventDirect(msge); // パス稼ぎ
		expect(sent.length).toBe(0);
		expect(self.readLocalEvents()).toEqual([msge, msge]);
	});

	it("drops received events if isDiscarder", function () {
		var amflow = new MockAmflow();
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var self = new EventBuffer({ amflow: amflow, game: game });

		self.setMode({ isReceiver: true, isDiscarder: true });

		// ローカルイベント
		// Message: Code, Priority, PlayerId, Message, Local
		var msge: pl.MessageEvent = [ pl.EventCode.Message, 0, "dummyPid", "Message", true];
		self.onEvent(msge);
		self.processEvents();
		expect(self.readLocalEvents()).toBe(null);

		self.addEventDirect(msge);
		expect(self.readLocalEvents()).toBe(null);

		// 非ローカルイベント
		// Message: Code, Priority, PlayerId, Message, Local
		var msge2: pl.MessageEvent = [ pl.EventCode.Message, 0, "dummyPid", "Message"];
		self.onEvent(msge2);
		self.onEvent(msge2);
		self.processEvents();
		expect(self.readEvents()).toBe(null);

		self.addEventDirect(msge2);
		expect(self.readEvents()).toBe(null);

		self.setMode({ isDiscarder: false });
		self.onEvent(msge);
		self.processEvents();
		expect(self.readLocalEvents()).toEqual([msge]);
		self.addEventDirect(msge2);
		expect(self.readEvents()).toEqual([msge2]);
	});

	it("can handle events - receiver", function () {
		var amflow = new MockAmflow();
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var self = new EventBuffer({ amflow: amflow, game: game });

		var sent: pl.Event[] = [];
		amflow.onEvent(sent.push.bind(sent));

		self.setMode({ isReceiver: true });

		// ローカルイベント
		// Message: Code, Priority, PlayerId, Message, Local
		var msge: pl.MessageEvent = [ pl.EventCode.Message, 0, "dummyPid", "Message", true];
		self.onEvent(msge);
		self.processEvents();
		expect(sent.length).toBe(0);
		expect(self._localBuffer).toEqual([msge]);
		expect(self._buffer).toEqual(null);
		expect(self._joinLeaveBuffer).toEqual(null);

		// 非ローカルイベント
		// Message: Code, Priority, PlayerId, Message, Local
		var msge2: pl.MessageEvent = [ pl.EventCode.Message, 0, "dummyPid", "Message"];
		self.onEvent(msge2);
		self.onEvent(msge2);
		self.processEvents();
		expect(sent.length).toBe(0);
		expect(self._localBuffer).toEqual([msge]);
		expect(self._buffer).toEqual([msge2, msge2]);
		expect(self._joinLeaveBuffer).toEqual(null);

		// Joinイベント
		// Join: Code, Priority, PlayerId, PlayerName, StorageData, Local
		var je: pl.JoinEvent = [ pl.EventCode.Join, 0, "dummyPid", "dummy-name", null];
		self.onEvent(je);
		self.processEvents();
		expect(sent.length).toBe(0);
		expect(self._localBuffer).toEqual([msge]);
		expect(self._buffer).toEqual([msge2, msge2]);
		expect(self._joinLeaveBuffer).toEqual([je]);

		// AMFlow経由
		// PointDown: Code, Priority, PlayerId, PointerId, X, Y, EntityId, Local
		var pde: pl.PointDownEvent = [ pl.EventCode.PointDown, 0, "dummyPid", 1, 100, 10, null];
		amflow.sendEvent(pde);
		self.processEvents();
		expect(sent).toEqual([pde]);
		expect(self._localBuffer).toEqual([msge]);
		expect(self._buffer).toEqual([msge2, msge2, pde]);
		expect(self._joinLeaveBuffer).toEqual([je]);

		expect(self.readLocalEvents()).toEqual([msge]);
		expect(self.readEvents()).toEqual([msge2, msge2, pde]);
		expect(self.readJoinLeaves()).toEqual([je]);
		expect(self._localBuffer).toEqual(null);
		expect(self._buffer).toEqual(null);
		expect(self._joinLeaveBuffer).toEqual(null);
	});

	it("manages event filters", function () {
		var amflow = new MockAmflow();
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var self = new EventBuffer({ amflow: amflow, game: game });

		var anyPassFilter = ((pevs: any[]): any[] => pevs);
		var noPassFilter = ((pevs: any[]): any[] => null);
		var nonMessagePassFilter = (pevs: any[]) => (pevs.filter((pev: any) => (pev[EventIndex.General.Code] !== pl.EventCode.Message)));
		var count = 0;
		var handleEmptyFilter = (pevs: any[]) => (pevs.length === 0 && ++count, pevs);

		self.removeFilter(noPassFilter);  // 未追加のフィルタを削除しても何も起きないことを確認するパス

		self.addFilter(anyPassFilter);
		self.addFilter(noPassFilter);
		self.addFilter(nonMessagePassFilter, false);
		self.addFilter(handleEmptyFilter, true);
		self.removeFilter(noPassFilter);
		expect(self._filters.length).toBe(3);
		expect(self._filters[0].func).toBe(anyPassFilter);
		expect(self._filters[0].handleEmpty).toBe(false);
		expect(self._filters[1].func).toBe(nonMessagePassFilter);
		expect(self._filters[1].handleEmpty).toBe(false);
		expect(self._filters[2].func).toBe(handleEmptyFilter);
		expect(self._filters[2].handleEmpty).toBe(true);

		self.removeFilter();
		expect(self._filters).toBe(null);
	});

	it("filters events", function () {
		var amflow = new MockAmflow();
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var self = new EventBuffer({ amflow: amflow, game: game });

		var anyPassFilter = ((pevs: any[]): any[] => pevs);
		var nonMessagePassFilter = (pevs: any[]) => {
			expect(pevs).not.toBe(null);
			var filtered = pevs.filter((pev: any) => (pev[EventIndex.General.Code] !== pl.EventCode.Message));
			return filtered.length > 0 ? filtered : null;
		};

		var count = 0;
		var handleEmptyFilter = (pevs: any[]) => (pevs.length === 0 && ++count, pevs);

		self.addFilter(anyPassFilter);
		self.addFilter(nonMessagePassFilter);
		self.addFilter(handleEmptyFilter, true);
		self.setMode({ isReceiver: true });

		// ローカルイベント
		// Message: Code, Priority, PlayerId, Message, Local
		var msge: pl.MessageEvent = [ pl.EventCode.Message, 0, "dummyPid", "Message", true];
		self.onEvent(msge);
		self.processEvents();
		expect(self._localBuffer).toEqual(null);
		expect(count).toBe(0);

		// 非ローカルイベント
		// Message: Code, Priority, PlayerId, Message, Local
		var msge2: pl.MessageEvent = [ pl.EventCode.Message, 0, "dummyPid", "Message"];
		self.onEvent(msge2);
		self.onEvent(msge2);
		self.processEvents();
		expect(self._joinLeaveBuffer).toEqual(null);

		// Joinイベント
		// Join: Code, Priority, PlayerId, PlayerName, StorageData, Local
		var je: pl.JoinEvent = [ pl.EventCode.Join, 0, "dummyPid", "dummy-name", null];
		self.onEvent(je);
		self.processEvents();
		expect(self._joinLeaveBuffer).toEqual([je]);

		// Leaveイベント
		// Leave: Code, Priority, PlayerId, PlayerName, StorageData, Local
		var le: pl.JoinEvent = [ pl.EventCode.Leave, 0, "dummyPid", null];
		self.onEvent(le);
		self.processEvents();
		expect(self._joinLeaveBuffer).toEqual([je, le]);

		// AMFlow経由
		// PointDown: Code, Priority, PlayerId, PointerId, X, Y, EntityId, Local
		var pde: pl.PointDownEvent = [ pl.EventCode.PointDown, 0, "dummyPid", 1, 100, 10, null];
		amflow.sendEvent(pde);
		self.processEvents();
		expect(self._localBuffer).toEqual(null);
		expect(self._buffer).toEqual([pde]);
		expect(self._joinLeaveBuffer).toEqual([je, le]);

		// 直接追加
		self.addEventDirect(msge);
		self.addEventDirect(msge2);
		self.addEventDirect(le);
		expect(self._localBuffer).toEqual([msge]);
		expect(self._buffer).toEqual([pde, msge2]);
		expect(self._joinLeaveBuffer).toEqual([je, le, le]);

		expect(self.readLocalEvents()).toEqual([msge]);
		expect(self.readEvents()).toEqual([pde, msge2]);
		expect(self.readJoinLeaves()).toEqual([je, le, le]);
		expect(self._localBuffer).toEqual(null);
		expect(self._buffer).toEqual(null);
		expect(self._joinLeaveBuffer).toEqual(null);

		expect(count).toBe(0);
		self.processEvents();
		self.processEvents();
		expect(count).toBe(2);
	});

	it("handle events generated by filters ", function () {
		var amflow = new MockAmflow();
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var self = new EventBuffer({ amflow: amflow, game: game });

		var msge: pl.MessageEvent = [ pl.EventCode.Message, 0, "dummyPid", "Message", true]; // ローカルイベント
		var msge2: pl.MessageEvent = [ pl.EventCode.Message, null, "dummyPid", "Message"]; // 非ローカルイベント
		var je: pl.JoinEvent = [ pl.EventCode.Join, 0, "dummyPid", "dummy-name", null]; // Joinイベント
		var pde: pl.PointDownEvent = [ pl.EventCode.PointDown, 0, "dummyPid", 1, 100, 10, null];
		var ope: pl.OperationEvent = [ pl.EventCode.Operation, 0, "dummyPid", 3, [42]];

		self.addFilter((pevs: any[]) => {
			if (pevs.length) return pevs;
			return [msge, msge2, je];
		}, true);
		self.addFilter((pevs: any[]) => {
			if (pevs.length) return pevs;
			return [ope];
		}, true);
		self.setMode({ isReceiver: true });

		self.onEvent(pde);
		self.processEvents();
		expect(self.readLocalEvents()).toEqual(null);
		expect(self.readEvents()).toEqual([pde]);
		expect(self.readJoinLeaves()).toEqual(null);

		self.processEvents();
		expect(self.readLocalEvents()).toEqual([msge]);
		expect(self.readEvents()).toEqual([msge2, ope]);
		expect(self.readJoinLeaves()).toEqual([je]);

		self.processEvents();
		expect(self.readLocalEvents()).toEqual([msge]);
		expect(self.readEvents()).toEqual([msge2, ope]);
		expect(self.readJoinLeaves()).toEqual([je]);
	});

	it("can handle events - sender", function () {
		var amflow = new MockAmflow();
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var self = new EventBuffer({ amflow: amflow, game: game });

		var sent: pl.Event[] = [];
		amflow.onEvent(sent.push.bind(sent));

		self.setMode({ isSender: true, defaultEventPriority: 1 });

		// ローカルイベント
		// Message: Code, Priority, PlayerId, Message, Local
		var msge: pl.MessageEvent = [ pl.EventCode.Message, 0, "dummyPid", "Message", true];
		self.onEvent(msge);
		self.processEvents();
		expect(sent.length).toBe(0);
		expect(self._localBuffer).toEqual([msge]);
		expect(self._buffer).toEqual(null);
		expect(self._joinLeaveBuffer).toEqual(null);

		// 非ローカルイベント
		// Message: Code, Priority, PlayerId, Message, Local
		var msge2: pl.MessageEvent = [ pl.EventCode.Message, null, "dummyPid", "Message"];
		self.onEvent(msge2);
		self.onEvent(msge2);
		self.processEvents();
		expect(sent).toEqual([msge2, msge2]);
		expect(self._localBuffer).toEqual([msge]);
		expect(self._buffer).toEqual(null);
		expect(self._joinLeaveBuffer).toEqual(null);
		expect(msge2[EventIndex.Message.Priority]).toBe(1);  // 優先度省略 (null) が onEvent() で上書きされた

		// Joinイベント
		// Join: Code, Priority, PlayerId, PlayerName, StorageData, Local
		var je: pl.JoinEvent = [ pl.EventCode.Join, 0, "dummyPid", "dummy-name", null];
		self.onEvent(je);
		self.processEvents();
		expect(sent).toEqual([msge2, msge2, je]);
		expect(self._localBuffer).toEqual([msge]);
		expect(self._buffer).toEqual(null);
		expect(self._joinLeaveBuffer).toEqual(null);

		// AMFlow経由 - receiver ではないので何も起きない
		// PointDown: Code, Priority, PlayerId, PointerId, X, Y, EntityId, Local
		var pde: pl.PointDownEvent = [ pl.EventCode.PointDown, 0, "dummyPid", 1, 100, 10, null];
		amflow.sendEvent(pde);
		self.processEvents();
		expect(sent).toEqual([msge2, msge2, je, pde]);
		expect(self._localBuffer).toEqual([msge]);
		expect(self._buffer).toEqual(null);
		expect(self._joinLeaveBuffer).toEqual(null);

		expect(self.readLocalEvents()).toEqual([msge]);
		expect(self.readEvents()).toEqual(null);
		expect(self.readJoinLeaves()).toEqual(null);
		expect(self._localBuffer).toEqual(null);
		expect(self._buffer).toEqual(null);
		expect(self._joinLeaveBuffer).toEqual(null);
	});

	it("can handle point events", function (done: () => void) {
		// このテストは simple_game のエンティティに依存している点に注意。
		var amflow = new MockAmflow();
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var self = new EventBuffer({ amflow: amflow, game: game });
		self.setMode({ isReceiver: true });

		game.loadAndDo(() => {
			var pd: pdi.PointEvent = {
				type: pdi.PointType.Down,
				identifier: 2,
				offset: { x: 140, y: 140 }
			};
			self.onPointEvent(pd);
			self.processEvents();
			expect(self._localBuffer.length).toBe(1);
			expect(self._buffer).toEqual(null);
			expect(self._joinLeaveBuffer).toEqual(null);
			expect(self._localBuffer[0][EventIndex.General.Code]).toBe(pl.EventCode.PointDown);
			expect(self._localBuffer[0][EventIndex.PointDown.Priority]).toBe(EventPriority.Joined);
			expect(self._localBuffer[0][EventIndex.PointDown.PlayerId]).toBe("dummyPlayerId");
			expect(self._localBuffer[0][EventIndex.PointDown.PointerId]).toBe(2);
			expect(self._localBuffer[0][EventIndex.PointDown.X]).toBe(10);
			expect(self._localBuffer[0][EventIndex.PointDown.Y]).toBe(10);
			expect(self._localBuffer[0][EventIndex.PointDown.EntityId] < 0).toBe(true);
			expect(self._localBuffer[0][EventIndex.PointDown.Local]).toBe(true);

			var pm: pdi.PointEvent = {
				type: pdi.PointType.Move,
				identifier: 2,
				offset: { x: 120, y: 120 }
			};
			self.onPointEvent(pm);
			self.processEvents();
			expect(self._localBuffer.length).toEqual(2);
			expect(self._localBuffer[1][EventIndex.General.Code]).toBe(pl.EventCode.PointMove);
			expect(self._localBuffer[1][EventIndex.PointMove.Priority]).toBe(EventPriority.Joined);
			expect(self._localBuffer[1][EventIndex.PointMove.PlayerId]).toBe("dummyPlayerId");
			expect(self._localBuffer[1][EventIndex.PointMove.PointerId]).toBe(2);
			expect(self._localBuffer[1][EventIndex.PointMove.X]).toBe(10);
			expect(self._localBuffer[1][EventIndex.PointMove.Y]).toBe(10);
			expect(self._localBuffer[1][EventIndex.PointMove.StartDeltaX]).toBe(-20);
			expect(self._localBuffer[1][EventIndex.PointMove.StartDeltaY]).toBe(-20);
			expect(self._localBuffer[1][EventIndex.PointMove.PrevDeltaX]).toBe(-20);
			expect(self._localBuffer[1][EventIndex.PointMove.PrevDeltaY]).toBe(-20);
			expect(self._localBuffer[1][EventIndex.PointMove.EntityId] < 0).toBe(true);
			expect(self._localBuffer[1][EventIndex.PointMove.Local]).toBe(true);

			var pu: pdi.PointEvent = {
				type: pdi.PointType.Up,
				identifier: 2,
				offset: { x: 10, y: 15 }
			};
			self.onPointEvent(pu);
			self.processEvents();
			expect(self._localBuffer.length).toEqual(3);
			expect(self._localBuffer[2][EventIndex.General.Code]).toBe(pl.EventCode.PointUp);
			expect(self._localBuffer[2][EventIndex.PointMove.Priority]).toBe(EventPriority.Joined);
			expect(self._localBuffer[2][EventIndex.PointMove.PlayerId]).toBe("dummyPlayerId");
			expect(self._localBuffer[2][EventIndex.PointMove.PointerId]).toBe(2);
			expect(self._localBuffer[2][EventIndex.PointMove.X]).toBe(10);
			expect(self._localBuffer[2][EventIndex.PointMove.Y]).toBe(10);
			expect(self._localBuffer[2][EventIndex.PointMove.StartDeltaX]).toBe(-130);
			expect(self._localBuffer[2][EventIndex.PointMove.StartDeltaY]).toBe(-125);
			expect(self._localBuffer[2][EventIndex.PointMove.PrevDeltaX]).toBe(-110);
			expect(self._localBuffer[2][EventIndex.PointMove.PrevDeltaY]).toBe(-105);
			expect(self._localBuffer[2][EventIndex.PointMove.EntityId] < 0).toBe(true);
			expect(self._localBuffer[2][EventIndex.PointMove.Local]).toBe(true);
			done();
		});
	});

	it("can detect whether or not an event is local", function () {
		// Join: Code, Priority, PlayerId, PlayerName, StorageData, Local
		var je: pl.JoinEvent = [ pl.EventCode.Join, 0, "dummyPid", "dummy-name", null];
		expect(!!EventBuffer.isEventLocal(je)).toBe(false);
		je.push(true);
		expect(!!EventBuffer.isEventLocal(je)).toBe(true);

		// Leave: Code, Priority, PlayerId, Local
		var le: pl.LeaveEvent = [ pl.EventCode.Leave, 0, "dummyPid"];
		expect(!!EventBuffer.isEventLocal(le)).toBe(false);
		le.push(true);
		expect(!!EventBuffer.isEventLocal(le)).toBe(true);

		// Message: Code, Priority, PlayerId, Message, Local
		var msge: pl.MessageEvent = [ pl.EventCode.Message, 0, "dummyPid", "Message"];
		expect(!!EventBuffer.isEventLocal(msge)).toBe(false);
		msge.push(true);
		expect(!!EventBuffer.isEventLocal(msge)).toBe(true);

		// PointDown: Code, Priority, PlayerId, PointerId, X, Y, EntityId, Local
		var pde: pl.PointDownEvent = [ pl.EventCode.PointDown, 0, "dummyPid", 1, 100, 10, null];
		expect(!!EventBuffer.isEventLocal(pde)).toBe(false);
		pde.push(true);
		expect(!!EventBuffer.isEventLocal(pde)).toBe(true);

		// PointMove: Code, Priority, PlayerId, PointerId, X, Y, StartDeltaX, StartDeltaY, PrevDeltaX, PrevDeltaY, EntityId, Local
		var pme: pl.PointMoveEvent = [ pl.EventCode.PointMove, 0, "dummyPid", 1, 100, 0, 0, 0, 0, 10, null];
		expect(!!EventBuffer.isEventLocal(pme)).toBe(false);
		pme.push(true);
		expect(!!EventBuffer.isEventLocal(pme)).toBe(true);

		// PointUp: Code, Priority, PlayerId, PointerId, X, Y, StartDeltaX, StartDeltaY, PrevDeltaX, PrevDeltaY, EntityId, Local
		var pue: pl.PointUpEvent = [ pl.EventCode.PointUp, 0, "dummyPid", 1, 100, 10, 0, 0, 0, 0, null];
		expect(!!EventBuffer.isEventLocal(pue)).toBe(false);
		pue.push(true);
		expect(!!EventBuffer.isEventLocal(pue)).toBe(true);

		// Operation: Code, Priority, PlayerId, OperationCode, OperationData, Local
		var ope: pl.OperationEvent = [ pl.EventCode.Operation, 0, "dummyPid", 42, []];
		expect(!!EventBuffer.isEventLocal(ope)).toBe(false);
		ope.push(true);
		expect(!!EventBuffer.isEventLocal(ope)).toBe(true);

		var invalidEvent: pl.Event = [ -1, 0, "dummyPid" ];
		expect(() => { EventBuffer.isEventLocal(invalidEvent); }).toThrow();
	});
});
