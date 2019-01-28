import * as pl from "@akashic/playlog";
import { MockAmflow } from "../helpers/lib/MockAmflow";
import { ErrorCollector } from "../helpers/lib/ErrorCollector";
import * as EventIndex from "../../lib/EventIndex";
import EventPriority from "../../lib/EventPriority";
import { JoinResolver } from "../../lib/JoinResolver";

describe("JoinResolver", function() {
	it("can be instantiated", function() {
		var amflow = new MockAmflow();
		var collector = new ErrorCollector();
		var self = new JoinResolver({ amflow: amflow, errorHandler: collector.onError, errorHandlerOwner: collector });
		expect(self.errorTrigger.isHandled(collector.onError));
		expect(self._amflow).toBe(amflow);
		expect(self._keysForJoin).toBe(null);
		expect(self._requested).toEqual([]);
	});

	it("resolves join/leaves when no stroage requested", function () {
		var amflow = new MockAmflow();
		var self = new JoinResolver({ amflow: amflow });

		expect(self.readResolved()).toBe(null);
		var pjoin: pl.JoinEvent = [ pl.EventCode.Join, EventPriority.System, "dummyPlayerId", "dummy-name"];
		self.request(pjoin);
		expect(self._requested.length).toBe(1);
		expect(self._requested[0].joinResolver).toBe(self);
		expect(self._requested[0].pev).toBe(pjoin);
		expect(self._requested[0].resolved).toBe(true);

		var pleave: pl.LeaveEvent = [ pl.EventCode.Leave, EventPriority.System, "dummyPlayerId"];
		self.request(pleave);
		expect(self._requested.length).toBe(2);
		expect(self._requested[1].joinResolver).toBe(self);
		expect(self._requested[1].pev).toBe(pleave);
		expect(self._requested[1].resolved).toBe(true);

		var resolved = self.readResolved();
		expect(resolved.length).toBe(2);
		expect(resolved[0]).toBe(pjoin);
		expect(resolved[1]).toBe(pleave);

	});

	it("reports error when storage access fail", function () {
		var amflow = new MockAmflow();
		var collector = new ErrorCollector();
		var self = new JoinResolver({ amflow: amflow, errorHandler: collector.onError, errorHandlerOwner: collector });

		amflow.storage["foo"] = { data: 100 };
		self.setRequestValuesForJoin([{ region: 0, regionKey: "foo" }]);   // MockAMFlowはregionを無視する点に注意

		var pjoin: pl.JoinEvent = [ pl.EventCode.Join, EventPriority.System, "dummyPlayerId", "dummy-name"];
		self.request(pjoin);

		amflow.requestsGetStorageData.forEach((r: (err?: any) => void) => r(new Error("test error")));
		expect(collector.errors[0].message).toBe("test error");
	});

	it("resolves join/leaves with stroage request", function () {
		var amflow = new MockAmflow();
		var self = new JoinResolver({ amflow: amflow });

		amflow.storage["foo"] = { data: 100 };
		self.setRequestValuesForJoin([{ region: 0, regionKey: "foo" }]);   // MockAMFlowはregionを無視する点に注意

		var pleave: pl.LeaveEvent = [ pl.EventCode.Leave, EventPriority.System, "dummyPlayerId"];
		self.request(pleave);
		expect(self._requested.length).toBe(1);
		expect(self._requested[0].joinResolver).toBe(self);
		expect(self._requested[0].pev).toBe(pleave);
		expect(self._requested[0].resolved).toBe(true);

		var pjoin: pl.JoinEvent = [ pl.EventCode.Join, EventPriority.System, "dummyPlayerId", "dummy-name"];
		self.request(pjoin);
		expect(self._requested.length).toBe(2);
		expect(self._requested[1].joinResolver).toBe(self);
		expect(self._requested[1].pev).toBe(pjoin);
		expect(self._requested[1].resolved).toBe(false);

		var resolved = self.readResolved();
		expect(resolved.length).toBe(1);
		expect(resolved[0]).toBe(pleave);

		amflow.requestsGetStorageData.forEach((r: () => void) => r());
		expect(self._requested.length).toBe(1);
		expect(self._requested[0].pev).toBe(pjoin);
		expect(self._requested[0].resolved).toBe(true);

		var resolved2 = self.readResolved();
		expect(resolved2.length).toBe(1);
		expect(resolved2[0]).toBe(pjoin);
		expect(pjoin[EventIndex.Join.StorageData]).toEqual([
			{
				readKey: { region: 0, regionKey: "foo" },
				values: [{ data: 100 }]
			}
		]);
	});
});
