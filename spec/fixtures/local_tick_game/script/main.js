function main(param) {
	const scene = new g.Scene({
		game: g.game,
		tickGenerationMode: "manual",  // このコンテンツはraiseTick()をしないのでActiveでは動かない
		local: "interpolate-local"
	});

	scene.onLoad.add(function() {
		g.game.vars.count = 0;
		scene.onUpdate.add(function () {
			if (g.game.vars.onUpdate) {
				g.game.vars.onUpdate();
			}
			++g.game.vars.count;
		});
	});

	g.game.pushScene(scene);
}

module.exports = main;
