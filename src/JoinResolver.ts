"use strict";
import * as pl from "@akashic/playlog";
import * as amf from "@akashic/amflow";
import * as g from "@akashic/akashic-engine";
import * as EventIndex from "./EventIndex";

export class JoinLeaveRequest {
	joinResolver: JoinResolver;
	pev: pl.Event;
	resolved: boolean;

	constructor(pev: pl.Event, joinResolver: JoinResolver, amflow?: amf.AMFlow, keys?: g.StorageKey[]) {
		this.joinResolver = joinResolver;
		this.pev = pev;
		if (pev[EventIndex.General.Code] === pl.EventCode.Join && keys) {
			this.resolved = false;
			amflow.getStorageData(keys, this._onGotStorageData.bind(this));
		} else {
			this.resolved = true;
		}
	}

	_onGotStorageData(err: Error, sds: pl.StorageData[]): void {
		this.resolved = true;
		if (err) {
			this.joinResolver.errorTrigger.fire(err);
			return;
		}
		this.pev[EventIndex.Join.StorageData] = sds;
	}
}

export interface JoinResolverParameterObject {
	amflow: amf.AMFlow;
	errorHandler?: (err: any) => void;
	errorHandlerOwner?: any;
}

export class JoinResolver {
	errorTrigger: g.Trigger<any>;

	_amflow: amf.AMFlow;
	_keysForJoin: pl.StorageKey[];
	_requested: JoinLeaveRequest[];

	constructor(param: JoinResolverParameterObject) {
		this.errorTrigger = new g.Trigger<any>();

		if (param.errorHandler)
			this.errorTrigger.add(param.errorHandler, param.errorHandlerOwner);

		this._amflow = param.amflow;
		this._keysForJoin = null;
		this._requested = [];
	}

	request(pev: pl.Event): void {
		this._requested.push(new JoinLeaveRequest(pev, this, this._amflow, this._keysForJoin));
	}

	readResolved(): pl.Event[] {
		var len = this._requested.length;
		if (len === 0 || !this._requested[0].resolved)
			return null;

		var ret: pl.Event[] = [];
		for (var i = 0; i < len; ++i) {
			var req = this._requested[i];
			if (!req.resolved)
				break;
			ret.push(req.pev);
		}
		this._requested.splice(0, i);
		return ret;
	}

	setRequestValuesForJoin(keys: pl.StorageKey[]): void {
		this._keysForJoin = keys;
	}
}
