import type { ClockFrameTriggerParameterObject } from "../Clock";
import { Clock } from "../Clock";
import * as mockpf from "./helpers/MockPlatform";

describe("Clock", function() {

	it("can be instantiated", function() {
		const pf = new mockpf.Platform({});
		const target = {
			count: 0,
			inc: function () {
				++this.count;
			}
		};

		const clock = new Clock({
			fps: 35,
			platform: pf,
			maxFramePerOnce: 8,
			frameHandler: target.inc,
			frameHandlerOwner: target
		});

		expect(clock.fps).toBe(35);
		expect(clock.running).toBe(false);
		expect(clock._platform).toBe(pf);
		expect(clock._maxFramePerOnce).toBe(8);
		expect(clock.frameTrigger.contains(target.inc, target)).toBe(true);

		expect(pf.loopers.length).toBe(1);
		expect(pf.loopers[0].fun).toBe(clock._onLooperCall_bound);
	});

	it("can change frameHandler", function() {
		const pf = new mockpf.Platform({});
		const target = {
			count: 0,
			inc: function () {
				++this.count;
			}
		};

		const clock = new Clock({
			fps: 30,
			platform: pf,
			maxFramePerOnce: 10
		});
		expect(clock.frameTrigger.length).toBe(0);
		clock.frameTrigger.add(target.inc, target);
		expect(clock.frameTrigger.contains(target.inc, target)).toBe(true);
	});

	it("calls frameHandler after start()", function() {
		const pf = new mockpf.Platform({});
		const target = {
			count: 0,
			inc: function () {
				++this.count;
			}
		};

		const fps = 50;
		const waitTime = 1000 / 50;
		const clock = new Clock({
			fps: fps,
			platform: pf,
			maxFramePerOnce: 8,
			frameHandler: target.inc,
			frameHandlerOwner: target,
			deltaTimeBrokenThreshold: (1000 / fps) * 100
		});

		const l = pf.loopers[0];
		expect(l.fun).toBe(clock._onLooperCall_bound);
		expect(target.count).toBe(0);
		expect(clock.running).toBe(false);

		clock.start();
		expect(clock.running).toBe(true);
		expect(clock._waitTime).toBe(waitTime);
		expect(l.fun(0)).toBe(waitTime);
		expect(target.count).toBe(0);

		expect(l.fun(10)).toBe(waitTime - 10);
		expect(target.count).toBe(0);
		expect(l.fun(5)).toBe(waitTime - 15);
		expect(target.count).toBe(0);
		expect(l.fun(0)).toBe(waitTime - 15);   // 0ms 経過時は前と同じ戻り値になる
		expect(l.fun(2)).toBe(waitTime + 3);    // 20ms * 0.8(Clock.ANTICIPATE_RATE) = 16ms 経過時点で次のコールをしてしまう。その分次までのwait(戻り値)が延びる
		expect(target.count).toBe(1);
		expect(l.fun(4)).toBe(waitTime - 1);
		expect(target.count).toBe(1);

		expect(l.fun(waitTime * 5 + 1)).toBe(waitTime - 2);
		expect(target.count).toBe(6);

		// eslint-disable-next-line max-len
		expect(l.fun(waitTime * 10 + 1)).toBe((waitTime - 2) - (2 * waitTime) - 1); // (waitTime - 2):前回の値, (2 * waitTime):maxFramePerOnceを超過する分
		expect(target.count).toBe(14);  // waitTimeの10倍進めても8(=== maxFramePerOnce)しか呼ばれない

		// 複数回呼んでもクラッシュなどしないことを確認
		expect(() => {
			clock.start();
		}).not.toThrow();
		expect(() => {
			clock.stop();
		}).not.toThrow();
		expect(() => {
			clock.stop();
		}).not.toThrow();
	});

	it("ignores deltaTime greater than _deltaTimeBrokenThreshold", function() {
		const pf = new mockpf.Platform({});
		const target = {
			count: 0,
			inc: function () {
				++this.count;
			}
		};

		const fps = 50;
		const waitTime = 1000 / 50;
		const clock = new Clock({
			fps: fps,
			platform: pf,
			maxFramePerOnce: 8,
			frameHandler: target.inc,
			frameHandlerOwner: target
		});

		const l = pf.loopers[0];
		expect(l.fun).toBe(clock._onLooperCall_bound);
		expect(target.count).toBe(0);
		expect(clock.running).toBe(false);

		clock.start();
		expect(l.fun(0)).toBe(waitTime);
		expect(target.count).toBe(0);
		expect(l.fun(2)).toBe(waitTime - 2);
		expect(target.count).toBe(0);

		expect(clock._deltaTimeBrokenThreshold > 2 * waitTime).toBe(true); // _deltaTimeBrokenThreshold はとにかく大きいことだけ確認しておく
		expect(l.fun(clock._deltaTimeBrokenThreshold + 10)).toBe(waitTime - 2);
		expect(target.count).toBe(1);
	});

	it("stops immediately after stop() is called", function() {
		const pf = new mockpf.Platform({});
		const target = {
			count: 0,
			inc: function () {
				++this.count;
				clock.stop();
			}
		};

		const fps = 50;
		const waitTime = 1000 / 50;
		const clock = new Clock({
			fps: fps,
			platform: pf,
			maxFramePerOnce: 10,
			frameHandler: target.inc,
			frameHandlerOwner: target,
			deltaTimeBrokenThreshold: (1000 / fps) * 100
		});

		const l = pf.loopers[0];
		expect(l.fun).toBe(clock._onLooperCall_bound);
		expect(target.count).toBe(0);
		expect(clock.running).toBe(false);

		clock.start();
		expect(clock.running).toBe(true);
		expect(l.fun(0)).toBe(waitTime);
		expect(target.count).toBe(0);
		expect(l.fun(1000)).toBe(waitTime - (1000 - waitTime * 1));  // target.inc() が 1 回呼び出されるから * 1
		expect(target.count).toBe(1);   // 1000ms 経過していても target.inc() が stop() するので1回しか呼ばれない
		expect(clock.running).toBe(false);
	});

	it("stops immediately after interrupted", function() {
		const pf = new mockpf.Platform({});
		const target = {
			count: 0,
			inc: function (arg: ClockFrameTriggerParameterObject) {
				++this.count;
				arg.interrupt = true;
			}
		};

		const fps = 50;
		const waitTime = 1000 / 50;
		const clock = new Clock({
			fps: fps,
			platform: pf,
			maxFramePerOnce: 10,
			frameHandler: target.inc,
			frameHandlerOwner: target,
			deltaTimeBrokenThreshold: (1000 / fps) * 100
		});

		const l = pf.loopers[0];
		clock.start();
		expect(l.fun(0)).toBe(waitTime);
		expect(target.count).toBe(0);
		expect(l.fun(1000)).toBe(waitTime - (1000 - waitTime * 1));  // target.inc() が 1 回呼び出されるから * 1
		expect(target.count).toBe(1);   // 1000ms 経過していても target.inc() が interrupt するので1回しか呼ばれない
		expect(clock.running).toBe(true);
	});


	it("can change scaleFactor", function() {
		const pf = new mockpf.Platform({});
		const target = {
			count: 0,
			inc: function () {
				++this.count;
			}
		};

		const clock = new Clock({
			fps: 10,
			platform: pf,
			maxFramePerOnce: 8,
			frameHandler: target.inc,
			frameHandlerOwner: target
		});
		const l = pf.loopers[0];

		expect(clock.fps).toBe(10);
		expect(clock.scaleFactor).toBe(1);
		clock.changeScaleFactor(5);
		expect(clock.fps).toBe(10);
		expect(clock.scaleFactor).toBe(5);

		clock.start();
		l.fun(0);
		expect(clock.running).toBe(true);
		expect(clock._waitTime).toBe(20); // === 1000 / (10 * 5)

		expect(l.fun(25)).toBe(15);
		expect(target.count).toBe(1);

		clock.changeScaleFactor(2);
		expect(clock.running).toBe(true);
		expect(clock._waitTime).toBe(50); // === 1000 / (10 * 2)
		l.fun(0);
		expect(l.fun(30)).toBe(20);   // changeScaleFactor() すると _totalDeltaTime はリセットされる。
		expect(target.count).toBe(1); // FPSが変わったので30ms経過ではcountが増えない。

		clock.changeScaleFactor(100);
		expect(l.fun(0)).toBe(1);     // === 1000 / (10 * 100)
		target.count = 0;
		expect(l.fun(100)).toBe(1);
		expect(target.count).toBe(100); // maxFramePerOnceは8倍だが100倍にしているので100回fireしてしまう
	});

	it("If the argument of _onLooperCall() is NaN, advance next frame", function () {
		const pf = new mockpf.Platform({});
		const target = {
			count: 0,
			inc: function () {
				++this.count;
			}
		};

		const fps = 50;
		const waitTime = 1000 / 50;
		const clock = new Clock({
			fps: fps,
			platform: pf,
			maxFramePerOnce: 8,
			frameHandler: target.inc,
			frameHandlerOwner: target,
			deltaTimeBrokenThreshold: (1000 / fps) * 100
		});

		const l = pf.loopers[0];
		expect(target.count).toBe(0);
		expect(clock.running).toBe(false);

		clock.start();
		expect(clock.running).toBe(true);
		expect(target.count).toBe(0);

		expect(l.fun(NaN)).toBe(waitTime); // NaN で次のフレームまで進む
		expect(target.count).toBe(1);
		expect(l.fun(10)).toBe(waitTime - 10);
		expect(target.count).toBe(1);
		expect(l.fun(NaN)).toBe(waitTime);
		expect(target.count).toBe(2);
		expect(l.fun(16)).toBe(waitTime - 16);
		expect(target.count).toBe(2);
		expect(l.fun(1)).toBe(waitTime + 3); // 20ms * 0.8(Clock.ANTICIPATE_RATE) = 16ms 経過時点で次のコールをしてしまう。その分次までのwait(戻り値)が延びる
		expect(target.count).toBe(3);
		expect(l.fun(NaN)).toBe(waitTime);
		expect(target.count).toBe(4);

		clock.stop();
	});
});
