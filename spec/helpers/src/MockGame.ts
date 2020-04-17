import * as g from "@akashic/akashic-engine";
import { Game, GameParameterObject } from "../../../lib/Game";

export class MockGame extends Game {
	_timerId: any;
	autoTickForSceneChange: boolean;
	onResetTrigger: g.Trigger<void>;

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

	_fireSceneReady(scene: g.Scene): void {
		super._fireSceneReady(scene);
		if (this.autoTickForSceneChange) {
			setTimeout(() => { this.tick(false); }, 0);
		}
	}

	_fireSceneLoaded(scene: g.Scene): void {
		super._fireSceneLoaded(scene);
		if (this.autoTickForSceneChange) {
			setTimeout(() => { this.tick(false); }, 0);
		}
	}
}
