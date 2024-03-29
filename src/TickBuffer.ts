"use strict";
import * as g from "@akashic/akashic-engine";
import type { AMFlow } from "@akashic/amflow";
import * as pl from "@akashic/playlog";
import ExecutionMode from "./ExecutionMode";

const EventIndex = g.EventIndex; // eslint-disable-line @typescript-eslint/naming-convention

declare let window: undefined | {
	prompt: Function;
	confirm: Function;
};

export interface TickBufferParameterObject {
	/**
	 * この `TickBuffer` がTickを受け取るための `AMFlow` 。
	 */
	amflow: AMFlow;

	/**
	 * 実行モード。
	 * Passiveの場合、AMFlow からの受信を試みる。
	 */
	executionMode: ExecutionMode;

	/**
	 * プレイの開始時刻。
	 * 相対時刻を絶対時刻に変換する暫定処理用の引数。
	 */
	startedAt?: number;

	/**
	 * 先読み閾値。
	 *
	 * 欠けているTickのこの値分手前のTickを消化した時、先回りしてTickの取得を試みる。
	 * 省略された場合、 `TickBuffer.DEFAULT_PREFETCH_THRESHOLD` 。
	 */
	prefetchThreshold?: number;

	/**
	 * 先読み時、一度に要求するTickの数。
	 * 省略された場合、 `TickBuffer.DEFAULT_SIZE_REQUEST_ONCE` 。
	 */
	sizeRequestOnce?: number;
}

export interface TickRange {
	start: number;
	end: number;
	ticks: pl.Tick[];
}

/**
 * AMFlowから流れ込むTickを蓄積するバッファ。
 *
 * 主に以下を行う。
 * * 受信済みのTickの管理
 * * 現在age・既知の最新age・直近の欠けているTickの管理
 * * 足りなそうなTickの先行リクエスト
 * * 処理済みTickの破棄
 */
export class TickBuffer {
	static DEFAULT_PREFETCH_THRESHOLD: number = 30 * 60;    // 数字は適当に30FPSで1分間分。30FPS * 60秒。
	static DEFAULT_SIZE_REQUEST_ONCE: number = 30 * 60 * 5; // 数字は適当に30FPSで5分間分。

	/**
	 * 現在のage。
	 * 次に `consume()` した時、このageのTickを返す。
	 */
	currentAge: number = 0;

	/**
	 * 既知の最新age。
	 * AMFlow から受け取った、または setCurrentAge() で外部から存在を示された最新の age 。
	 */
	knownLatestAge: number = -1;

	/**
	 * 現在ageのTickを新たに取得したときにfireされる `g.Trigger` 。
	 * Tick取得待ちを解除する契機として使える。
	 */
	gotNextTickTrigger: g.Trigger<void> = new g.Trigger();

	/**
	 * 最新Tick取得した結果、新たに消化すべきTickが存在しないときにfireされる `g.Trigger` 。
	 * 取得済みのTickの消化待ちにかかわらず発火されることに注意。
	 */
	gotNoTickTrigger: g.Trigger<void> = new g.Trigger();

	_amflow: AMFlow;
	_prefetchThreshold: number;
	_sizeRequestOnce: number;
	_executionMode: ExecutionMode;

	/**
	 * プレイ開始時刻。ただし暫定処理用の数値としてしか使っていないので、0になることもある点に注意。
	 */
	_startedAt: number;
	_oldTimestampThreshold: number;

	_receiving: boolean = false;
	_skipping: boolean = false;

	/**
	 * 取得したTick。
	 */
	_tickRanges: TickRange[] = [];

	/**
	 * `currentAge` からもっとも近い、Tickを取得していないage。
	 */
	_nearestAbsentAge: number;

	/**
	 * `readNextTickTime()` の値のキャッシュ。
	 * ティック時刻に到達するまでループの度に確認されるのでキャッシュしておく。
	 *
	 * 旧仕様(相対時刻)用の暫定対応のため、この値をティックのタイムスタンプと直接比較してはならない(cf. readNextTickTime())。
	 */
	_nextTickTimeCache: number | null = null;

	_addTick_bound: (tick: pl.Tick) => void;
	_onTicks_bound: (err: Error | null, ticks?: pl.TickList) => void;

	constructor(param: TickBufferParameterObject) {
		this._amflow = param.amflow;
		this._prefetchThreshold = param.prefetchThreshold || TickBuffer.DEFAULT_PREFETCH_THRESHOLD;
		this._sizeRequestOnce = param.sizeRequestOnce || TickBuffer.DEFAULT_SIZE_REQUEST_ONCE;
		this._executionMode = param.executionMode;
		this._startedAt = param.startedAt || 0;
		this._oldTimestampThreshold = (param.startedAt != null) ? (param.startedAt - (86400 * 1000 * 10)) : 0; // 数字は適当な値(10日分)。
		this._nearestAbsentAge = this.currentAge;
		this._addTick_bound = this.addTick.bind(this);
		this._onTicks_bound = this._onTicks.bind(this);
	}

	start(): void {
		this._receiving = true;
		this._updateAmflowReceiveState();
	}

	stop(): void {
		this._receiving = false;
		this._updateAmflowReceiveState();
	}

	setExecutionMode(execMode: ExecutionMode): void {
		// TODO: getTickList()中にauthenticate()しなおした場合の挙動確認
		if (this._executionMode === execMode)
			return;
		this._dropUntil(this.knownLatestAge + 1);  // 既存データは捨てる(特にPassive->Activeで既存Tickを上書きする必要がありうる)
		this.knownLatestAge = this.currentAge;
		this._nextTickTimeCache = null;
		this._nearestAbsentAge = this.currentAge;
		this._executionMode = execMode;
		this._updateAmflowReceiveState();
	}

	/**
	 * currentAge を設定する。
	 *
	 * 引数は存在することがわかっている age でなければならない。
	 * (Realtime モードの tick/StartPoint 取得の基準となる knownLatestAge も更新するため)
	 */
	setCurrentAge(age: number): void {
		this._dropUntil(age);
		this._nextTickTimeCache = null;
		this.currentAge = age;
		if (this.knownLatestAge < age - 1)
			this.knownLatestAge = age - 1;
		this._nearestAbsentAge = this._findNearestAbscentAge(age);
	}

	startSkipping(): void {
		this._skipping = true;
	}

	endSkipping(): void {
		this._skipping = false;
	}

	hasNextTick(): boolean {
		return this.currentAge !== this._nearestAbsentAge;
	}

	consume(): pl.Tick | number | null {
		if (this.currentAge === this._nearestAbsentAge)
			return null;
		const age = this.currentAge;
		const range = this._tickRanges[0];

		if (age === range.start) {
			this._nextTickTimeCache = null;
			++this.currentAge;
			++range.start;

			if (age + this._prefetchThreshold === this._nearestAbsentAge) {
				this.requestTicks(this._nearestAbsentAge, this._sizeRequestOnce);
			}
			if (range.start === range.end)
				this._tickRanges.shift();
			return (range.ticks.length > 0 && range.ticks[0][EventIndex.Tick.Age] === age) ? range.ticks.shift()! : age;
		}

		// range.start < age。外部から前に追加された場合。破棄してリトライする。
		this._dropUntil(this.currentAge);
		return this.consume();
	}

	readNextTickTime(): number | null {
		if (this._nextTickTimeCache != null)
			return this._nextTickTimeCache;
		if (this.currentAge === this._nearestAbsentAge)
			return null;
		const age = this.currentAge;
		const range = this._tickRanges[0];

		if (age === range.start) {
			if (range.ticks.length === 0)
				return null;
			const tick = range.ticks[0];
			if (tick[EventIndex.Tick.Age] !== age)
				return null;
			const pevs = tick[EventIndex.Tick.Events];
			if (!pevs)
				return null;
			for (let i = 0; i < pevs.length; ++i) {
				if (pevs[i][EventIndex.General.Code] === pl.EventCode.Timestamp) {
					let nextTickTime = pevs[i][EventIndex.Timestamp.Timestamp];

					// 暫定処理: 旧仕様(相対時刻)用ワークアラウンド。小さすぎる時刻は相対とみなす
					if (nextTickTime < this._oldTimestampThreshold)
						nextTickTime += this._startedAt;

					this._nextTickTimeCache = nextTickTime;
					return nextTickTime;
				}
			}
			return null;
		}

		// range.start < age。外部から前に追加された場合。破棄してリトライする。
		this._dropUntil(this.currentAge);
		return this.readNextTickTime();
	}

	/**
	 * 既知の最新tickが「近い」かどうか判定する。
	 * ここで「近い」とは、既知最新 tick の消化までに必要なゲーム内時間が timeThreshold より短いことである。
	 * tick をトラバースするので最悪の場合の実行時間は timeThreshold に比例する点に注意。
	 */
	isKnownLatestTickTimeNear(timeThreshold: number, baseTime: number, frameTime: number): boolean {
		// TODO コード整理して baseTime と frameTime の引数をなくす。
		// 両者は GameLoop#_frameTime, _currentTickTime にそれぞれ対応している。このクラスがそれらを管理する方が自然。
		return this._calcKnownLatestTickTimeDelta(timeThreshold, baseTime, frameTime) < timeThreshold;
	}

	requestTicks(from: number = this.currentAge, len: number = this._sizeRequestOnce): void {
		if (this._skipping) {
			this.requestNonIgnorableTicks(from, len);
		} else {
			this.requestAllTicks(from, len);
		}
	}

	requestAllTicks(from: number = this.currentAge, len: number = this._sizeRequestOnce): void {
		if (this._executionMode !== ExecutionMode.Passive)
			return;

		// NOTE: 移行期のため一部特殊な環境では旧インターフェイスを利用する
		// TODO: このパスを削除する
		if (typeof window !== "undefined" && window.prompt === window.confirm) {
			this._amflow.getTickList(from, from + len, this._onTicks_bound);
			return;
		}

		this._amflow.getTickList({ begin: from, end: from + len }, this._onTicks_bound);
	}

	requestNonIgnorableTicks(from: number = this.currentAge, len: number = this._sizeRequestOnce): void {
		if (this._executionMode !== ExecutionMode.Passive)
			return;

		// NOTE: 移行期のため一部特殊な環境では旧インターフェイスを利用する。ignorable には対応しない。
		// TODO: このパスを削除する
		if (typeof window !== "undefined" && window.prompt === window.confirm) {
			this._amflow.getTickList(from, from + len, this._onTicks_bound);
			return;
		}

		this._amflow.getTickList({ begin: from, end: from + len, excludeEventFlags: { ignorable: true } }, this._onTicks_bound);
	}

	addTick(tick: pl.Tick): void {
		const age = tick[EventIndex.Tick.Age];
		const gotNext = (this.currentAge === age) && (this._nearestAbsentAge === age);
		if (this.knownLatestAge < age) {
			this.knownLatestAge = age;
		}

		let i = this._tickRanges.length - 1;
		for (; i >= 0; --i) {
			const range = this._tickRanges[i];
			if (age >= range.start)
				break;
		}

		const nextRange = this._tickRanges[i + 1];
		if (i < 0) {
			// 既知のどの tick よりも過去、または単に既知の tick がない。
			// NOTE: _tickRanges[0]を過去方向に拡張できるかもしれないが、
			//       addTickはほぼ最新フレームしか受信しないので気にせず新たにTickRangeを作る。
			this._tickRanges.unshift(this._createTickRangeFromTick(tick));

		} else {
			const range = this._tickRanges[i];
			if (age === range.end) {
				// 直近の TickRange のすぐ後に続く tick だった。
				++range.end;
				if (tick[EventIndex.Tick.Events]) {
					range.ticks.push(tick);
				}
			} else if (age > range.end) {
				// 既存 TickList に続かない tick だった。新規に TickList を作って挿入
				this._tickRanges.splice(i + 1, 0, this._createTickRangeFromTick(tick));
			} else {
				// (start <= age < end) 既存 tick と重複している。何もしない。
			}
		}

		if (this._nearestAbsentAge === age) {
			++this._nearestAbsentAge;

			if (nextRange && this._nearestAbsentAge === nextRange.start) {
				// 直近の欠けているageを追加したら前後のrangeが繋がってしまった。諦めて_nearestAbsentAgeを求め直す。
				this._nearestAbsentAge = this._findNearestAbscentAge(this._nearestAbsentAge);
			}
		}

		if (gotNext)
			this.gotNextTickTrigger.fire();
	}

	addTickList(tickList: pl.TickList): TickRange {
		let start = tickList[EventIndex.TickList.From];
		let end = tickList[EventIndex.TickList.To] + 1;
		let ticks = tickList[EventIndex.TickList.TicksWithEvents];
		const origStart = start;
		const origEnd = end;

		if (this.knownLatestAge < end - 1) {
			this.knownLatestAge = end - 1;
		}

		// 今回挿入分の開始ageよりも「後」に開始される最初のrangeを探す
		let i = 0;
		const len = this._tickRanges.length;
		for (i = 0; i < len; ++i) {
			const range = this._tickRanges[i];
			if (start < range.start)
				break;
		}
		const insertPoint = i;

		// 左側が重複しうるrangeを探して重複を除く
		if (i > 0) {
			// 左側が重複しうるrangeは、今回挿入分の開始ageの直前に始まるもの
			--i;
			const leftEndAge = this._tickRanges[i].end;
			if (start < leftEndAge)
				start = leftEndAge;
		}

		// 右側で重複しうるrangeを探して重複を除く
		for (; i < len; ++i) {
			const range = this._tickRanges[i];
			if (end <= range.end)
				break;
		}
		if (i < len) {
			const rightStartAge = this._tickRanges[i].start;
			if (end > rightStartAge)
				end = rightStartAge;
		}

		if (start >= end) {
			// 今回挿入分はすべて重複だった。何もせずreturn
			return { start: start, end: start, ticks: [] };
		}

		if (!ticks)
			ticks = [];

		if (origStart !== start || origEnd !== end) {
			ticks = ticks.filter((tick: pl.Tick) => {
				const age = tick[EventIndex.Tick.Age];
				return start <= age && age < end;
			});
		}

		const tickRange = { start: start, end: end, ticks: ticks };
		const delLen = Math.max(0, i - insertPoint);
		this._tickRanges.splice(insertPoint, delLen, tickRange);

		if (start <= this._nearestAbsentAge && this._nearestAbsentAge < end) {
			this._nearestAbsentAge = this._findNearestAbscentAge(this._nearestAbsentAge);
		}
		return tickRange;
	}

	dropAll(): void {
		this._tickRanges = [];
		this._nearestAbsentAge = this.currentAge;
		this._nextTickTimeCache = null;
	}

	_updateAmflowReceiveState(): void {
		if (this._receiving && this._executionMode === ExecutionMode.Passive) {
			this._amflow.onTick(this._addTick_bound);
		} else {
			this._amflow.offTick(this._addTick_bound);
		}
	}

	_onTicks(err: Error | null, ticks?: pl.TickList): void {
		if (err)
			throw err;
		if (!ticks) {
			this.gotNoTickTrigger.fire();
			return;
		}
		const mayGotNext = (this.currentAge === this._nearestAbsentAge);
		const inserted = this.addTickList(ticks);
		if (mayGotNext && (inserted.start <= this.currentAge && this.currentAge < inserted.end)) {
			this.gotNextTickTrigger.fire();
		}
		if (inserted.start === inserted.end) {
			this.gotNoTickTrigger.fire();
		}
	}

	_findNearestAbscentAge(age: number): number {
		let i = 0;
		const len = this._tickRanges.length;
		for (; i < len; ++i) {
			if (age <= this._tickRanges[i].end)
				break;
		}

		for (; i < len; ++i) {
			const range = this._tickRanges[i];
			if (age < range.start)
				break;
			age = range.end;
		}
		return age;
	}

	_dropUntil(age: number): void {
		// [start,end) が全部 age 以前のものを削除
		let i: number;
		for (i = 0; i < this._tickRanges.length; ++i) {
			if (age < this._tickRanges[i].end)
				break;
		}
		this._tickRanges = this._tickRanges.slice(i);
		if (this._tickRanges.length === 0)
			return;

		// start を書き換えることで、[start, age) の範囲を削除
		const range = this._tickRanges[0];
		if (age < range.start)
			return;
		range.start = age;
		for (i = 0; i < range.ticks.length; ++i) {
			if (age <= range.ticks[i][EventIndex.Tick.Age])
				break;
		}
		range.ticks = range.ticks.slice(i);
	}

	/**
	 * 既知最新 Tick の時刻までの所要時間を求める。
	 * ただし timeThreshold を超える場合、処理を打ち切って timeThreshold を返す。
	 * また間隙がある (途中に欠けた Tick がある) 場合、Infinity を返す。
	 *
	 * _tickRanges をトラバースするので、最悪の場合の実行時間は timeThreshold に比例する。
	 */
	_calcKnownLatestTickTimeDelta(timeThreshold: number, baseTime: number, frameTime: number): number {
		const tickRanges = this._tickRanges;
		if (tickRanges.length === 0)
			return 0;

		let timeDelta = 0;
		let lastRangeStart = tickRanges[tickRanges.length - 1].end;
		let lastAgeWithEvents = lastRangeStart;
		for (let i = tickRanges.length - 1; i >= 0; --i) {
			const range = tickRanges[i];
			if (range.end !== lastRangeStart) // 既知tickに間隙がある場合
				return Infinity;
			lastRangeStart = range.start;

			const ticksWithEvents = range.ticks;
			for (let j = ticksWithEvents.length - 1; j >= 0; --j) {
				const tick = ticksWithEvents[j];
				const pevs = tick[EventIndex.Tick.Events];
				if (!pevs) // tick がストレージ情報を持っていた時期との互換性のためのチェック。現在の game-driver が生成する tick ではこの条件を満たすことはない
					continue;

				// この tick までの時間を加算
				const age = tick[EventIndex.Tick.Age];
				timeDelta += (lastAgeWithEvents - age) * frameTime;
				if (timeDelta > timeThreshold) // timestamp なしの tick だけで timeThreshold 分の時間を超過した
					return timeThreshold;
				lastAgeWithEvents = age;

				// timestamp が見つかれば時間が確定する
				for (let k = 0; k < pevs.length; ++k) {
					if (pevs[k][EventIndex.General.Code] === pl.EventCode.Timestamp) {
						const timestamp = pevs[k][EventIndex.Timestamp.Timestamp];
						const duration = (timestamp - baseTime) + timeDelta; // 計算順に注意。先に時刻を減算して値を小さくする(小数部の誤差を軽減する)
						return Math.min(duration, timeThreshold);
					}
				}
			}
		}
		timeDelta += (lastAgeWithEvents - tickRanges[0].start) * frameTime;
		return Math.min(timeDelta, timeThreshold);
	}

	private _createTickRangeFromTick(tick: pl.Tick): TickRange {
		const age = tick[EventIndex.Tick.Age];
		const range = {
			start: age,
			end: age + 1,
			ticks: <pl.Tick[]>[]
		};
		if (tick[EventIndex.Tick.Events]) {
			range.ticks.push(tick);
		}
		return range;
	}
}
