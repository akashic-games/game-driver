var game = g.game;
module.exports = function() {
	var scene = new g.Scene({ game: game });
	scene.loaded.handle(function() {
		var r1 = new g.FilledRect({
			scene: scene,
			cssColor: "#ff0000",
			x: 100,
			y: 100,
			width: 50,
			height: 50,
			touchable: true
		});
		scene.append(r1);
		r1.modified();

		var r2 = new g.FilledRect({
			scene: scene,
			cssColor: "#0000ff",
			x: 130,
			y: 130,
			width: 50,
			height: 50,
			local: true,
			touchable: true
		});
		scene.append(r2);
		r2.modified();
	});
	return scene;
}
