import * as fs from "fs";
import * as path from "path";
import * as pdi from "@akashic/pdi-types";
import * as pci from "@akashic/pdi-common-impl";

export interface MethodCallParam {
	methodName: string;
	params?: any;
}

export class Renderer extends pci.Renderer {
	methodCallHistoryWithParams: MethodCallParam[];

	constructor() {
		super();
		this.methodCallHistoryWithParams = [];
	}

	clearMethodCallHistory(): void {
		this.methodCallHistoryWithParams = [];
	}

	clear(): void {
		this.methodCallHistoryWithParams.push({
			methodName: "clear"
		});
	}

	get methodCallHistory() {
		var ret: string[] = [];
		for (var i = 0; i < this.methodCallHistoryWithParams.length; ++i)
			ret.push(this.methodCallHistoryWithParams[i].methodName);
		return ret;
	}

	// 指定したメソッド名のパラメータを配列にして返す
	methodCallParamsHistory(name: string): any[] {
		var params: any[] = [];
		for (var i = 0; i < this.methodCallHistoryWithParams.length; ++i) {
			if (this.methodCallHistoryWithParams[i].methodName === name) params.push(this.methodCallHistoryWithParams[i].params);
		}
		return params;
	}

	drawImage(surface: pdi.Surface, offsetX: number, offsetY: number, width: number, height: number,
	          canvasOffsetX: number, canvasOffsetY: number): void {
		this.methodCallHistoryWithParams.push({
			methodName: "drawImage",
			params: {
				surface: surface,
				offsetX: offsetX,
				offsetY: offsetY,
				width: width,
				height: height,
				canvasOffsetX: canvasOffsetX,
				canvasOffsetY: canvasOffsetY
			}
		});
	}

	translate(x: number, y: number): void {
		this.methodCallHistoryWithParams.push({
			methodName: "translate",
			params: {
				x: x,
				y: y
			}
		});
	}

	transform(matrix: number[]): void {
		this.methodCallHistoryWithParams.push({
			methodName: "transform",
			params: {
				matrix: matrix
			}
		});
	}

	opacity(opacity: number): void {
		this.methodCallHistoryWithParams.push({
			methodName: "opacity",
			params: {
				opacity: opacity
			}
		});
	}

	setCompositeOperation(operation: pdi.CompositeOperationString): void {
		this.methodCallHistoryWithParams.push({
			methodName: "setCompositeOperation",
			params: {
				operation: operation
			}
		});
	}

	fillRect(x: number, y: number, width: number, height: number, cssColor: string): void {
		this.methodCallHistoryWithParams.push({
			methodName: "fillRect",
			params: {
				x: x,
				y: y,
				width: width,
				height: height,
				cssColor: cssColor
			}
		});
	}

	save(): void {
		this.methodCallHistoryWithParams.push({
			methodName: "save"
		});
	}

	restore(): void {
		this.methodCallHistoryWithParams.push({
			methodName: "restore"
		});
	}

	drawSprites(surface: pdi.Surface,
	            offsetX: number[], offsetY: number[],
	            width: number[], height: number[],
	            canvasOffsetX: number[], canvasOffsetY: number[],
	            count: number): void {
		this.methodCallHistoryWithParams.push({
			methodName: "drawSprites",
			params: {
				surface: surface,
				offsetX: offsetX,
				offsetY: offsetY,
				width: width,
				height: height,
				canvasOffsetX: canvasOffsetX,
				canvasOffsetY: canvasOffsetY,
				count: count
			}
		});
	}

	isSupportedShaderProgram(): boolean {
		throw new Error("not implemented: mock renderer isSupportedShaderProgram()");
	}

	setOpacity(opacity: number): void {
		throw new Error("not implemented: mock renderer setOpacity()");
	}

	setShaderProgram(shaderProgram: pdi.ShaderProgram | null): void {
		throw new Error("not implemented: mock renderer setShaderProgram()");
	}

	setTransform(matrix: number[]): void {
		throw new Error("not implemented: mock renderer setTransform()");
	}

	_getImageData(sx: number, sy: number, sw: number, sh: number): pdi.ImageData {
		throw new Error("not implemented: mock renderer _getImageData()");
	}

	_putImageData(imageData: pdi.ImageData, dx: number, dy: number, dw: number, dh: number): void {
		throw new Error("not implemented: mock renderer _putImageData()");
	}
}

class Surface extends pci.Surface {
	createdRenderer: pdi.Renderer;

	constructor(width: number, height: number, drawable?: any) {
		super(width, height, drawable);
	}

	renderer(): pdi.Renderer {
		var r = new Renderer();
		this.createdRenderer = r;
		return r;
	}

	isPlaying(): boolean {
		throw new Error("not implemented: mock surface isPlaying()");
	}
}

export class LoadFailureController {
	necessaryRetryCount: number;
	failureCount: number;

	constructor(necessaryRetryCount: number) {
		this.necessaryRetryCount = necessaryRetryCount;
		this.failureCount = 0;
	}

	tryLoad(asset: pdi.Asset, loader: pdi.AssetLoadHandler): boolean {
		if (this.necessaryRetryCount < 0) {
			setTimeout(() => {
				if (!asset.destroyed())
					loader._onAssetError(asset, { name: "AssetLoadError", message: "FatalErrorForAssetLoad", retriable: false });
			}, 0);
			return false;
		}
		if (this.failureCount++ < this.necessaryRetryCount) {
			setTimeout(() => {
				if (!asset.destroyed())
					loader._onAssetError(asset, { name: "AssetLoadError", message: "RetriableErrorForAssetLoad", retriable: true });
			}, 0);
			return false;
		}
		return true;
	}
}

export class ImageAsset extends pci.ImageAsset {
	_failureController: LoadFailureController;

	constructor(necessaryRetryCount: number, id: string, assetPath: string, width: number, height: number) {
		super(id, assetPath, width, height);
		this._failureController = new LoadFailureController(necessaryRetryCount);
	}

	_load(loader: pdi.AssetLoadHandler): void {
		if (this._failureController.tryLoad(this, loader)) {
			setTimeout(() => {
				if (!this.destroyed())
					loader._onAssetLoad(this);
			}, 0);
		}
	}

	asSurface(): pdi.Surface {
		return new Surface(0, 0);
	}
}

class AudioAsset extends pci.AudioAsset {
	_failureController: LoadFailureController;

	constructor(necessaryRetryCount: number, id: string, assetPath: string, duration: number,
	            system: pdi.AudioSystem, loop: boolean, hint: pdi.AudioAssetHint) {
		super(id, assetPath, duration, system, loop, hint);
		this._failureController = new LoadFailureController(necessaryRetryCount);
	}

	_load(loader: pdi.AssetLoadHandler): void {
		if (this._failureController.tryLoad(this, loader)) {
			setTimeout(() => {
				if (!this.destroyed())
					loader._onAssetLoad(this);
			}, 0);
		}
	}
}

class TextAsset extends pci.TextAsset {
	resourceFactory: ResourceFactory;
	_failureController: LoadFailureController;

	constructor(resourceFactory: ResourceFactory, necessaryRetryCount: number, id: string, assetPath: string) {
		super(id, assetPath);
		this.resourceFactory = resourceFactory;
		this._failureController = new LoadFailureController(necessaryRetryCount);
	}

	_load(loader: pdi.AssetLoadHandler): void {
		if (this._failureController.tryLoad(this, loader)) {
			setTimeout(() => {
				if ((this.resourceFactory).scriptContents.hasOwnProperty(this.path)) {
					this.data = (this.resourceFactory).scriptContents[this.path];
				} else {
					this.data = "";
				}
				if (!this.destroyed())
					loader._onAssetLoad(this);
			}, 0);
		}
	}
}

class ScriptAsset extends pci.ScriptAsset {
	resourceFactory: ResourceFactory;
	_failureController: LoadFailureController;
	_content: string;

	constructor(resourceFactory: ResourceFactory, necessaryRetryCount: number, id: string, assetPath: string) {
		super(id, assetPath);
		this.resourceFactory = resourceFactory;
		this._failureController = new LoadFailureController(necessaryRetryCount);
		this._content = null;
	}

	_load(loader: pdi.AssetLoadHandler): void {
		if (this._failureController.tryLoad(this, loader)) {
			fs.readFile( path.resolve(this.path), "utf8", (err: any, data: string) => {
				if (err) {
					loader._onAssetError(this, { name: "AssetLoadError", message: "FatalErrorForAssetLoad", retriable: false });
					return;
				}
				this._content = data;
				if (!this.destroyed())
					loader._onAssetLoad(this);
			});
		}
	}

	execute(env: pdi.ScriptAssetRuntimeValue): any {
		var prefix = "(function(exports, require, module, __filename, __dirname) {";
		var suffix = "})(g.module.exports, g.module.require, g.module, g.filename, g.dirname);";
		var f = new Function("g", prefix + this._content + suffix);
		f(env);
		return env.module.exports;
	}
}

export class AudioPlayer extends pci.AudioPlayer {
	supportsPlaybackRateValue: boolean;
	canHandleStoppedValue: boolean;

	constructor(system: pdi.AudioSystem) {
		super(system);
		this.supportsPlaybackRateValue = true;
		this.canHandleStoppedValue = true;
	}

	canHandleStopped(): boolean {
		return this.canHandleStoppedValue;
	}

	_supportsPlaybackRate(): boolean {
		return this.supportsPlaybackRateValue;
	}
}

export class ResourceFactory extends pci.ResourceFactory {
	scriptContents: {[key: string]: string};

	_necessaryRetryCount: number;

	constructor() {
		super();
		this.scriptContents = {};
		this._necessaryRetryCount = 0;
	}

	// func が呼び出されている間だけ this._necessaryRetryCount を変更する。
	// func() とその呼び出し先で生成されたアセットは、指定回数だけロードに失敗したのち成功する。
	// -1を指定した場合、ロードは retriable が偽に設定された AssetLoadFatalError で失敗する。
	withNecessaryRetryCount(necessaryRetryCount: number, func: () => void) {
		var originalValue = this._necessaryRetryCount;
		try {
			this._necessaryRetryCount = necessaryRetryCount;
			func();
		} finally {
			this._necessaryRetryCount = originalValue;
		}
	}

	createImageAsset(id: string, assetPath: string, width: number, height: number): ImageAsset {
		return new ImageAsset(this._necessaryRetryCount, id, assetPath, width, height);
	}

	createAudioAsset(id: string, assetPath: string, duration: number,
	                 system: pdi.AudioSystem, loop: boolean, hint: pdi.AudioAssetHint): AudioAsset {
		return new AudioAsset(this._necessaryRetryCount, id, assetPath, duration, system, loop, hint);
	}

	createTextAsset(id: string, assetPath: string): TextAsset {
		return new TextAsset(this, this._necessaryRetryCount, id, assetPath);
	}

	createScriptAsset(id: string, assetPath: string): ScriptAsset {
		return new ScriptAsset(this, this._necessaryRetryCount, id, assetPath);
	}

	createSurface(width: number, height: number): Surface {
		return new Surface(width, height);
	}

	createAudioPlayer(system: pdi.AudioSystem): AudioPlayer {
		return new AudioPlayer(system);
	}

	createVideoAsset(id: string, assetPath: string, width: number, height: number,
	                 system: pdi.VideoSystem, loop: boolean, useRealSize: boolean): pci.VideoAsset {
		throw new Error("not implemented: mock resourceFactory createVideoAsset()");
	}

	createGlyphFactory(fontFamily: string | string[], fontSize: number,
	                   baselineHeight?: number, fontColor?: string, strokeWidth?: number,
	                   strokeColor?: string, strokeOnly?: boolean, fontWeight?: pdi.FontWeightString): pci.GlyphFactory {
		throw new Error("not implemented: mock resourceFactory createGlyphFactory()");
	}
}

