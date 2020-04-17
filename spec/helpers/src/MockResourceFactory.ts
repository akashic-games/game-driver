import * as fs from "fs";
import * as path from "path";
import * as g from "@akashic/akashic-engine";

export interface MethodCallParam {
	methodName: string;
	params?: any;
}

export class Renderer extends g.Renderer {
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

	drawImage(surface: g.Surface, offsetX: number, offsetY: number, width: number, height: number,
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

	setCompositeOperation(operation: g.CompositeOperationString): void {
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

	drawSprites(surface: g.Surface,
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

	drawSystemText(text: string, x: number, y: number, maxWidth: number, fontSize: number,
	               textAlign: g.TextAlign, textBaseline: g.TextBaseline, textColor: string, fontFamily: g.FontFamily,
	               strokeWidth: number, strokeColor: string, strokeOnly: boolean): void {
		this.methodCallHistoryWithParams.push({
			methodName: "drawSystemText",
			params: {
				text: text,
				x: x,
				y: y,
				maxWidth: maxWidth,
				fontSize: fontSize,
				textAlign: textAlign,
				textBaseline: textBaseline,
				textColor: textColor,
				fontFamily: fontFamily,
				strokeWidth: strokeWidth,
				strokeColor: strokeColor,
				strokeOnly: strokeOnly
			}
		});
	}

	isSupportedShaderProgram(): boolean {
		throw new Error("not implemented: mock renderer isSupportedShaderProgram()");
	}

	setOpacity(opacity: number): void {
		throw new Error("not implemented: mock renderer setOpacity()");
	}

	setShaderProgram(shaderProgram: g.ShaderProgram | null): void {
		throw new Error("not implemented: mock renderer setShaderProgram()");
	}

	setTransform(matrix: number[]): void {
		throw new Error("not implemented: mock renderer setTransform()");
	}

	_getImageData(sx: number, sy: number, sw: number, sh: number): g.ImageData {
		throw new Error("not implemented: mock renderer _getImageData()");
	}

	_putImageData(imageData: g.ImageData, dx: number, dy: number, dw: number, dh: number): void {
		throw new Error("not implemented: mock renderer _putImageData()");
	}
}

class Surface extends g.Surface {
	createdRenderer: g.Renderer;

	constructor(width: number, height: number, drawable?: any) {
		super(width, height, drawable);
	}

	renderer(): g.Renderer {
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

	tryLoad(asset: g.Asset, loader: g.AssetLoadHandler): boolean {
		if (this.necessaryRetryCount < 0) {
			setTimeout(() => {
				if (!asset.destroyed())
					loader._onAssetError(asset, g.ExceptionFactory.createAssetLoadError("FatalErrorForAssetLoad", false));
			}, 0);
			return false;
		}
		if (this.failureCount++ < this.necessaryRetryCount) {
			setTimeout(() => {
				if (!asset.destroyed())
					loader._onAssetError(asset, g.ExceptionFactory.createAssetLoadError("RetriableErrorForAssetLoad"));
			}, 0);
			return false;
		}
		return true;
	}
}

export class ImageAsset extends g.ImageAsset {
	_failureController: LoadFailureController;

	constructor(necessaryRetryCount: number, id: string, assetPath: string, width: number, height: number) {
		super(id, assetPath, width, height);
		this._failureController = new LoadFailureController(necessaryRetryCount);
	}

	_load(loader: g.AssetLoadHandler): void {
		if (this._failureController.tryLoad(this, loader)) {
			setTimeout(() => {
				if (!this.destroyed())
					loader._onAssetLoad(this);
			}, 0);
		}
	}

	asSurface(): g.Surface {
		return new Surface(0, 0);
	}
}

class AudioAsset extends g.AudioAsset {
	_failureController: LoadFailureController;

	constructor(necessaryRetryCount: number, id: string, assetPath: string, duration: number,
	            system: g.AudioSystem, loop: boolean, hint: g.AudioAssetHint) {
		super(id, assetPath, duration, system, loop, hint);
		this._failureController = new LoadFailureController(necessaryRetryCount);
	}

	_load(loader: g.AssetLoadHandler): void {
		if (this._failureController.tryLoad(this, loader)) {
			setTimeout(() => {
				if (!this.destroyed())
					loader._onAssetLoad(this);
			}, 0);
		}
	}
}

class TextAsset extends g.TextAsset {
	resourceFactory: ResourceFactory;
	_failureController: LoadFailureController;

	constructor(resourceFactory: ResourceFactory, necessaryRetryCount: number, id: string, assetPath: string) {
		super(id, assetPath);
		this.resourceFactory = resourceFactory;
		this._failureController = new LoadFailureController(necessaryRetryCount);
	}

	_load(loader: g.AssetLoadHandler): void {
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

class ScriptAsset extends g.ScriptAsset {
	resourceFactory: ResourceFactory;
	_failureController: LoadFailureController;
	_content: string;

	constructor(resourceFactory: ResourceFactory, necessaryRetryCount: number, id: string, assetPath: string) {
		super(id, assetPath);
		this.resourceFactory = resourceFactory;
		this._failureController = new LoadFailureController(necessaryRetryCount);
		this._content = null;
	}

	_load(loader: g.AssetLoadHandler): void {
		if (this._failureController.tryLoad(this, loader)) {
			fs.readFile( path.resolve(this.path), "utf8", (err: any, data: string) => {
				if (err) {
					loader._onAssetError(this, g.ExceptionFactory.createAssetLoadError("FatalErrorForAssetLoad", false));
					return;
				}
				this._content = data;
				if (!this.destroyed())
					loader._onAssetLoad(this);
			});
		}
	}

	execute(env: g.ScriptAssetRuntimeValue): any {
		var prefix = "(function(exports, require, module, __filename, __dirname) {";
		var suffix = "})(g.module.exports, g.module.require, g.module, g.filename, g.dirname);";
		var f = new Function("g", prefix + this._content + suffix);
		f(env);
		return env.module.exports;
	}
}

export class AudioPlayer extends g.AudioPlayer {
	supportsPlaybackRateValue: boolean;
	canHandleStoppedValue: boolean;

	constructor(system: g.AudioSystem) {
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

export class ResourceFactory extends g.ResourceFactory {
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

	createImageAsset(id: string, assetPath: string, width: number, height: number): g.ImageAsset {
		return new ImageAsset(this._necessaryRetryCount, id, assetPath, width, height);
	}

	createAudioAsset(id: string, assetPath: string, duration: number,
	                 system: g.AudioSystem, loop: boolean, hint: g.AudioAssetHint): g.AudioAsset {
		return new AudioAsset(this._necessaryRetryCount, id, assetPath, duration, system, loop, hint);
	}

	createTextAsset(id: string, assetPath: string): g.TextAsset {
		return new TextAsset(this, this._necessaryRetryCount, id, assetPath);
	}

	createScriptAsset(id: string, assetPath: string): g.ScriptAsset {
		return new ScriptAsset(this, this._necessaryRetryCount, id, assetPath);
	}

	createSurface(width: number, height: number): g.Surface {
		return new Surface(width, height);
	}

	createAudioPlayer(system: g.AudioSystem): g.AudioPlayer {
		return new AudioPlayer(system);
	}

	createVideoAsset(id: string, assetPath: string, width: number, height: number,
	                 system: g.VideoSystem, loop: boolean, useRealSize: boolean): g.VideoAsset {
		throw new Error("not implemented: mock resourceFactory createVideoAsset()");
	}

	createGlyphFactory(fontFamily: string | string[], fontSize: number,
	                   baselineHeight?: number, fontColor?: string, strokeWidth?: number,
	                   strokeColor?: string, strokeOnly?: boolean, fontWeight?: g.FontWeightString): g.GlyphFactory {
		throw new Error("not implemented: mock resourceFactory createGlyphFactory()");
	}
}

