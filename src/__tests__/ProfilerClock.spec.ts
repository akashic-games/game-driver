import type { SimpleProfilerValue } from "../auxiliary/SimpleProfiler";
import { SimpleProfiler } from "../auxiliary/SimpleProfiler";
import { ProfilerClock } from "../ProfilerClock";
import * as mockpf from "./helpers/MockPlatform";

describe("ProfilerClock", () => {

	it("can be instantiated", () => {
		const pf = new mockpf.Platform({});
		const target = {
			count: 0,
			inc: function() {
				++this.count;
			}
		};

		const profiler = new SimpleProfiler({
			interval: 100,
			getValueHandler: () => {
				// nothing to do.
			}
		});
		expect(profiler._interval).toBe(100);

		const clock = new ProfilerClock({
			fps: 35,
			platform: pf,
			maxFramePerOnce: 8,
			frameHandler: target.inc,
			frameHandlerOwner: target,
			profiler: profiler,
			deltaTimeBrokenThreshold: 150
		});

		expect(clock.fps).toBe(35);
		expect(clock.running).toBe(false);
		expect(clock._platform).toBe(pf);
		expect(clock._maxFramePerOnce).toBe(8);
		expect(clock.frameTrigger.contains(target.inc, target)).toBe(true);
		expect(clock._profiler).toEqual(profiler);

		expect(pf.loopers.length).toBe(1);
		expect(pf.loopers[0].fun).toBe(clock._onLooperCall_bound);
	});

	it("can get profiler value data", (done: Function) => {
		const pf = new mockpf.Platform({});
		const target = {
			count: 0,
			inc: function () {
				++this.count;
			}
		};

		const profiler = new SimpleProfiler({
			interval: 100,
			getValueHandler: (value: SimpleProfilerValue) => {
				// 値が何かしら代入されていることだけを確認
				expect(value.skippedFrameCount).toBeDefined();
				expect(value.rawFrameInterval).toBeDefined();
				expect(value.framePerSecond).toBeDefined();
				expect(value.frameTime).toBeDefined();
				expect(value.renderingTime).toBeDefined();
				done();
			}
		});

		const clock = new ProfilerClock({
			fps: 10,
			platform: pf,
			maxFramePerOnce: 8,
			frameHandler: target.inc,
			frameHandlerOwner: target,
			profiler: profiler,
			deltaTimeBrokenThreshold: 150
		});
		const l = pf.loopers[0];

		clock.start();
		l.fun(100);
		setTimeout(() => {
			l.fun(100); // 2回以上のrawFrameTriggerが発火されないとgetValueHandlerが呼ばれない
			clock.stop();
		}, 200);
	});
});
