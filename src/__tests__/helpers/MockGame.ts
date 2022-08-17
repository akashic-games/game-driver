import * as g from "@akashic/akashic-engine";
import type { GameParameterObject } from "../../Game";
import { Game } from "../../Game";

export class MockGame extends Game {
	_timerId: any;
	autoTickForSceneChange: boolean;
	onResetTrigger!: g.Trigger<void>;

	constructor(param: GameParameterObject) {
		super(param);
		this.autoTickForSceneChange = false;
	}

	_reset(param?: g.GameResetParameterObject): void {
		super._reset(param);
		if (!this.onResetTrigger) {
			// _reset() は g.Game のコンストラクタから呼ばれ、 MockGameのコンストラクタで初期化するのでは間に合わないのでここで初期化
			this.onResetTrigger = new g.Trigger<void>();
		}
		this.onResetTrigger.fire();
	}

	loadAndDo(func: () => void): void {
		this.autoTickForSceneChange = true;
		this._reset();
		this._sceneChanged.handle((scene: g.Scene) => {
			if (scene.local === "non-local") {
				if (scene._loadingState === "loaded-fired") {
					setTimeout(func, 0);
					this.autoTickForSceneChange = false;
				} else {
					scene.onLoad.handle(() => {
						setTimeout(func, 0);
						this.autoTickForSceneChange = false;
					});
				}
				return true;
			}
		});
		this._loadAndStart();
	}

	_pushPostTickTask(fun: () => void, owner: any): void {
		super._pushPostTickTask(fun, owner);
		if (this.autoTickForSceneChange) {
			setTimeout(() => {
				this.tick(false);
			}, 0);
		}
	}
}
