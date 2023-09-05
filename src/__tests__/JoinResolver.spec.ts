import { EventIndex, EventPriority } from "@akashic/akashic-engine";
import * as pl from "@akashic/playlog";
import { JoinResolver } from "../JoinResolver";
import { ErrorCollector } from "./helpers/ErrorCollector";
import { MockAmflow } from "./helpers/MockAmflow";

describe("JoinResolver", function() {
	it("can be instantiated", function() {
		const amflow = new MockAmflow();
		const collector = new ErrorCollector();
		const self = new JoinResolver({ amflow: amflow, errorHandler: collector.onError, errorHandlerOwner: collector });
		expect(self.errorTrigger.contains(collector.onError));
		expect(self._amflow).toBe(amflow);
		expect(self._requested).toEqual([]);
	});

	it("resolves join/leaves", function () {
		const amflow = new MockAmflow();
		const self = new JoinResolver({ amflow: amflow });

		expect(self.readResolved()).toBe(null);
		const pjoin: pl.JoinEvent = [ pl.EventCode.Join, EventPriority.System, "dummyPlayerId", "dummy-name"];
		self.request(pjoin);
		expect(self._requested.length).toBe(1);
		expect(self._requested[0].joinResolver).toBe(self);
		expect(self._requested[0].pev).toBe(pjoin);

		const pleave: pl.LeaveEvent = [ pl.EventCode.Leave, EventPriority.System, "dummyPlayerId"];
		self.request(pleave);
		expect(self._requested.length).toBe(2);
		expect(self._requested[1].joinResolver).toBe(self);
		expect(self._requested[1].pev).toBe(pleave);

		const resolved = self.readResolved()!;
		expect(resolved.length).toBe(2);
		expect(resolved[0]).toBe(pjoin);
		expect(resolved[1]).toBe(pleave);
	});
});
