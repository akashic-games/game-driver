import type * as amf from "@akashic/amflow";
import { GameDriver } from "../GameDriver";
import { MockAmflow } from "./helpers/MockAmflow";
import { Platform } from "./helpers/MockPlatform";

describe("GameDriver", () => {
	const seed = 100;
	const globalArgs = {a: 1, b: 2, c: 3};
	const startedAt = 1496056872250;
	const fps = 45;
	let platform: Platform;

	beforeEach(() => {
		platform = new Platform({});
		platform.amflow = new MockAmflow();
	});

	afterEach(() => {
		platform = undefined!;
	});

	it("can be destroyed", (done: () => void) => {
		const gameDriver = new GameDriver({platform, player: null!});
		gameDriver.destroy().then(() => {
			// TODO game生成後の破棄テスト
			expect(gameDriver.errorTrigger).toBe(null);
			done();
		});
	});

	describe("_putZerothStartPoint", () => {
		it("should write the StartPointData on amflow", (done: () => void) => {
			const gameDriver = new GameDriver({platform, player: null!});
			jest.spyOn(platform.amflow, "putStartPoint").mockImplementation(
				(startPoint: amf.StartPoint, callback: (error: Error | null) => void): void => {
					expect(startPoint).toEqual({
						frame: 0,
						timestamp: startedAt,
						data: {seed, globalArgs, startedAt, fps}
					});
					callback(null);
				}
			);
			gameDriver._putZerothStartPoint({seed, globalArgs, startedAt, fps})
				.then(() => {
					expect(platform.amflow.putStartPoint).toHaveBeenCalled();
					done();
				});
		});

		it("should report amflow error", (done: () => void) => {
			const gameDriver = new GameDriver({platform, player: null!});
			jest.spyOn(platform.amflow, "putStartPoint").mockImplementation(
				(_startPoint: amf.StartPoint, callback: (error: Error) => void): void => {
					callback(new Error());
				}
			);
			gameDriver._putZerothStartPoint({seed, globalArgs, startedAt, fps}).catch(_err => done());
		});
	});

	describe("_getStartPoint", () => {
		it("should get a StartPointData from amflow", (done: () => void) => {
			const gameDriver = new GameDriver({platform, player: null!});
			jest.spyOn(platform.amflow, "getStartPoint").mockImplementation(
				(opts: amf.GetStartPointOptions, callback: (error: Error | null, startPoint: amf.StartPoint) => void): void => {
					expect(opts.frame).toBe(0);
					callback(null, {frame: 0, timestamp: 0, data: {seed, globalArgs, startedAt, fps}});
				}
			);
			gameDriver._getStartPoint(0)
				.then((sp: amf.StartPoint) => {
					expect(sp.data).toEqual({seed, globalArgs, startedAt, fps});
					expect(platform.amflow.getStartPoint).toHaveBeenCalled();
					done();
				});
		});

		it("should report amflow error", (done: () => void) => {
			const gameDriver = new GameDriver({platform, player: null!});
			jest.spyOn(platform.amflow, "getStartPoint").mockImplementation(
				(_opts: amf.GetStartPointOptions, callback: (error: Error, startPoint?: amf.StartPoint) => void): void => {
					callback(new Error());
				}
			);
			gameDriver._getStartPoint(0).catch(_err => done());
		});
	});
});
