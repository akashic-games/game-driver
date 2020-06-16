import * as amf from "@akashic/amflow";
import * as pdi from "@akashic/akashic-pdi";
import * as g from "@akashic/akashic-engine";

export class Looper implements pdi.Looper {
	fun: (deltaTime: number) => number;
	detach: () => void;
	running: boolean;

	constructor(fun: (deltaTime: number) => number, detach: () => void) {
		this.fun = fun;
		this.running = false;
		this.detach = detach || (() => {/* nothing to do */});
	}

	start(): void {
		this.running = true;
	}

	stop(): void {
		this.running = false;
	}
}

export interface MockPlatformParameterObject {
	amflow?: amf.AMFlow;
	configurations?: { [key: string]: any };
}

export class Platform {
	static INEXISTENT_GAME_CONFIGURATION: string = "HELPER-MOCKPLATFORM-INEXISTENT-CONFIGURATION-URL";

	amflow: amf.AMFlow;
	loopers: Looper[];
	configurations: { [key: string]: any };

	constructor(param: MockPlatformParameterObject) {
		this.amflow = param.amflow || <amf.AMFlow>{};
		this.loopers = [];
		this.configurations = param.configurations || {};
	}

	setPlatformEventHandler(handler: pdi.PlatformEventHandler): void {
		// TODO implement
	}

	loadGameConfiguration(url: string, callback: (err: any, configuration: any) => void): void {
		setImmediate(() => {
			if (url === Platform.INEXISTENT_GAME_CONFIGURATION) {
				callback(new Error("Platform#loadGameConfiguration: not found"), null);
				return;
			}
			callback(null, JSON.parse(JSON.stringify(this.configurations[url]))); // stringify->parse で雑にクローンしておく
		});
	}

	setRendererRequirement(requirement?: pdi.RendererRequirement): void {
		// do nothing
	}

	getPrimarySurface(): pdi.Surface {
		return null;
	}

	getResourceFactory(): pdi.ResourceFactory {
		return null;
	}

	createLooper(fun: (deltaTime: number) => number): pdi.Looper {
		var ret: Looper;
		var detach = () => {
			this.loopers = this.loopers.filter((l: Looper) => { return l !== ret; });
		};
		ret = new Looper(fun, detach);
		this.loopers.push(ret);
		return ret;
	}

	sendToExternal(playId: string, data: any): void {
		// do nothing
	}

	destroy(): void {
		// do nothing
	}
}

