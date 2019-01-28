function main(param) {
	const scene = new g.Scene({
		game: g.game,
		tickGenerationMode: g.TickGenerationMode.Manual,  // このコンテンツはraiseTick()をしないのでActiveでは動かない
		local: g.LocalTickMode.InterpolateLocal
	});

	scene.loaded.handle(function() {
		g.game.vars.count = 0;
		scene.update.handle(function () {
			if (g.game.vars.onUpdate) {
				g.game.vars.onUpdate();
			}
			++g.game.vars.count;
		});
	});

	g.game.pushScene(scene);
}

module.exports = main;
