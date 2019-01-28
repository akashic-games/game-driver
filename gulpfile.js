var gulp = require("gulp");
var fs = require("fs");
var exec = require("child_process").exec;
var browserify = require("browserify");
var source = require("vinyl-source-stream");
var buffer = require("vinyl-buffer");
var gutil = require("gulp-util");
var sourcemaps = require("gulp-sourcemaps");
var jasmine = require("gulp-jasmine");
var istanbul = require("gulp-istanbul");
var shell = require("gulp-shell");
var uglify = require("gulp-uglify");
var rename = require("gulp-rename");
var reporters = require("jasmine-reporters");
var Reporter = require("jasmine-terminal-reporter");

gulp.task("clean", shell.task("npm run clean"));
gulp.task("clean:ts", shell.task("npm run clean-ts"));
gulp.task("clean:test", shell.task("npm run clean-test"));

gulp.task("compile:ts", ["clean:ts"], shell.task("npm run compile-ts"));
gulp.task("compile:test", ["compile:ts", "clean:test"], shell.task("npm run compile-test"));

gulp.task("compile:browserify-akashic-engine", function () {
	var b = browserify({ debug: true });
	return b.require('./node_modules/@akashic/akashic-engine/lib/main.node.js', {expose: '@akashic/akashic-engine'})
		.bundle()
		.pipe(source('akashic-engine.js'))
		.pipe(buffer())
		.pipe(sourcemaps.init({loadMaps: true}))
		.on('error', gutil.log)
		.pipe(sourcemaps.write('./'))
		.pipe(gulp.dest("build"));
});

gulp.task("compile:browserify", ["compile:ts", "compile:browserify-akashic-engine"], function () {
	var b = browserify({ debug: true });
	b.require('./lib/index.js', { expose: "@akashic/game-driver" })
		.external('@akashic/akashic-engine');
	return b.bundle()
		.pipe(source('game-driver.js'))
		.pipe(buffer())
		.pipe(sourcemaps.init({loadMaps: true}))
		.on('error', gutil.log)
		.pipe(sourcemaps.write('./'))
		.pipe(gulp.dest("build"));
});

gulp.task("compile", ["compile:browserify"]);

gulp.task("minify", ["compile"], function() {
	return gulp.src("build/game-driver.js")
		.pipe(uglify())
		.pipe(rename({extname: ".min.js"}))
		.pipe(gulp.dest("build"));
});

gulp.task("test", ["compile", "compile:test"], function(cb) {
	var jasmineReporters = [ new Reporter({
			isVerbose: true,
			showColors: true,
			includeStackTrace: true
		}),
		new reporters.JUnitXmlReporter()
	];
	gulp.src("lib/**/*.js")
		.pipe(istanbul())
		.pipe(istanbul.hookRequire())
		.on("finish", function() {
			gulp.src("spec/**/*[sS]pec.js")
				.pipe(jasmine({ reporter: jasmineReporters}))
				.pipe(istanbul.writeReports({ reporters: ["text", "cobertura", "lcov"] }))
				.on("end", cb);
		});
});

gulp.task("default", ["compile"]);
