import * as pl from "@akashic/playlog";
import * as g from "@akashic/akashic-engine";
import { prepareGame, FixtureGame } from "../helpers/lib/prepareGame";
import EventPriority from "../../lib/EventPriority";
import { EventConverter } from "../../lib/EventConverter";

describe("EventConverter", function () {
	it("can be instantiated", function () {
		var game = prepareGame({ title: FixtureGame.SimpleGame, playerId: "dummyPlayerId" });
		var self = new EventConverter({ game: game });
		expect(self._game).toBe(game);
		expect(self._playerTable).toEqual({});
	});

	it("encode/decode events", function (done: () => void) {
		// このテストは simple_game のエンティティに依存している点に注意。
		var game = prepareGame({ title: FixtureGame.SimpleGame, player: { id: "dummyPlayerId", name: "dummy-name" } });
		var self = new EventConverter({ game: game });

		game.loadAndDo(() => {
			// Join: Code, Priority, PlayerId, PlayerName, StorageData, Local
			var sds = [{ readKey: { region: g.StorageRegion.Slots, regionKey: "reg-key" }, values: [{ data: 100 }] }];
			var pjoin: pl.JoinEvent = [ pl.EventCode.Join, EventPriority.System, "dummyPlayerId", "dummy-name", sds];
			var join = new g.JoinEvent(game.player, new g.StorageValueStore([sds[0].readKey], [sds[0].values]), EventPriority.System);
			var join2 = self.toGameEvent(pjoin);
			expect<g.Event>(join).toEqual(join2);
			expect(() => { self.toPlaylogEvent(join2); }).toThrow();

			// (110, 120) の位置 (50x50の赤いFilledRectが(100, 100)にある)
			var source = game.findPointSource({ x: 110, y: 120 });
			expect(source.target.id > 0).toBe(true);
			expect(source.point).toEqual({ x: 10, y: 20 });
			var pd = new g.PointDownEvent(1, source.target, source.point, game.player, false, EventPriority.Joined);
			var pd2 = self.toGameEvent(self.toPlaylogEvent(pd));
			expect<g.Event>(pd).toEqual(pd2);
			var pm = new g.PointMoveEvent(1, source.target, source.point, { x: 2, y: 3 }, { x: 2, y: 3 }, game.player, false, EventPriority.Lowest);
			var pm2 = self.toGameEvent(self.toPlaylogEvent(pm));
			expect<g.Event>(pm).toEqual(pm2);
			var pu = new g.PointUpEvent(1, source.target, source.point, { x: 4, y: 1 }, { x: 6, y: 4 }, game.player, false, EventPriority.Joined);
			var pu2 = self.toGameEvent(self.toPlaylogEvent(pu));
			expect<g.Event>(pu).toEqual(pu2);

			// (10, 10) の位置 (何もエンティティがない)
			var point = { x: 10, y: 10 };
			var nonjoined_player = { id: "nonjoined-dummy-id" };
			source = game.findPointSource(point);
			expect(source.target).toBe(undefined);
			expect(source.point).toEqual(undefined);
			expect(source.local).toEqual(false);
			var lpd = new g.PointDownEvent(1, source.target, point, nonjoined_player, false, EventPriority.System);
			var lpd2 = self.toGameEvent(self.toPlaylogEvent(lpd, true));
			expect<g.Event>(lpd).toEqual(lpd2);
			var lpm = new g.PointMoveEvent(1, source.target, point, { x: 2, y: 3 }, { x: 2, y: 3 }, nonjoined_player, false, EventPriority.Unjoined);
			var lpm2 = self.toGameEvent(self.toPlaylogEvent(lpm, true));
			expect<g.Event>(lpm).toEqual(lpm2);
			var lpu = new g.PointUpEvent(1, source.target, point, { x: 4, y: 1 }, { x: 6, y: 4 }, nonjoined_player, false);
			var lpu2 = self.toGameEvent(self.toPlaylogEvent(lpu, true));
			expect<g.Event>(lpu).toEqual(lpu2);

			var msg = new g.MessageEvent({ value: "data" }, game.player, true, EventPriority.Joined);
			var msg2 = self.toGameEvent(self.toPlaylogEvent(msg));
			expect<g.Event>(msg).toEqual(msg2);

			var op = new g.OperationEvent(42, { value: "op" }, game.player, false, EventPriority.Joined);
			var op2 = self.toGameEvent(self.toPlaylogEvent(op));
			expect<g.Event>(op).toEqual(op2);

			// Timestamp: Code, Priority, PlayerId, Timestamp
			var timestamp = new g.TimestampEvent(4201, game.player, EventPriority.System);
			var timestamp2 = self.toGameEvent(self.toPlaylogEvent(timestamp));
			expect<g.Event>(timestamp).toEqual(timestamp2);

			// Leave: Code, Priority, PlayerId
			var pleave: pl.LeaveEvent = [pl.EventCode.Leave, EventPriority.System, "dummyPlayerId"];
			var leave = new g.LeaveEvent(game.player, EventPriority.System);
			var leave2 = self.toGameEvent(pleave);
			expect<g.Event>(leave).toEqual(leave2);
			expect(() => { self.toPlaylogEvent(leave2); }).toThrow();
			done();
		});
	});

});
