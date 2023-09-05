"use strict";
import * as g from "@akashic/akashic-engine";
import type * as amf from "@akashic/amflow";
import type * as pl from "@akashic/playlog";

export class JoinLeaveRequest {
	joinResolver: JoinResolver;
	pev: pl.Event;

	constructor(pev: pl.Event, joinResolver: JoinResolver) {
		this.joinResolver = joinResolver;
		this.pev = pev;
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
	_requested: JoinLeaveRequest[] = [];

	constructor(param: JoinResolverParameterObject) {
		this.errorTrigger = new g.Trigger<any>();

		if (param.errorHandler)
			this.errorTrigger.add(param.errorHandler, param.errorHandlerOwner);

		this._amflow = param.amflow;
	}

	request(pev: pl.Event): void {
		this._requested.push(new JoinLeaveRequest(pev, this));
	}

	readResolved(): pl.Event[] | null {
		const len = this._requested.length;
		if (len === 0)
			return null;

		const ret: pl.Event[] = [];
		let i: number;
		for (i = 0; i < len; ++i) {
			const req = this._requested[i];
			ret.push(req.pev);
		}
		this._requested.splice(0, i);
		return ret;
	}
}
