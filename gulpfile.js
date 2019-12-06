"use strict"
var gulp = require('gulp');
var rename = require('gulp-rename');
var install = require('gulp-install');
var tslint = require('gulp-tslint');
var filter = require('gulp-filter');
var ts = require('gulp-typescript');
var tsProject = ts.createProject('tsconfig.json');
var del = require('del');
var srcmap = require('gulp-sourcemaps');
var config = require('./tasks/config');
var request = require('request');
var fs = require('fs');
var gutil = require('gulp-util');
var through = require('through2');
var cproc = require('child_process');
var os = require('os');
var jeditor = require("gulp-json-editor");
var path = require('path');
var nls = require('vscode-nls-dev');

require('./tasks/packagetasks')

const languages = [ /* for example { folderName: 'ru', id: 'ru' } */ ];

gulp.task('ext:lint', () => {
    return gulp.src([
        config.paths.project.root + '/src/**/*.ts',
        '!' + config.paths.project.root + '/src/**/*.d.ts',
        config.paths.project.root + '/test/**/*.ts'
    ])
    .pipe((tslint({
        formatter: "verbose"
    })))
    .pipe(tslint.report());
});

gulp.task('localization:process-package-json', function () {
    return gulp.src(['package.nls.json'])
        .pipe(nls.createAdditionalLanguageFiles(languages, 'i18n'))
        .pipe(gulp.dest('.'));
});

gulp.task('ext:compile-src', (done) => {
    return gulp.src([
                config.paths.project.root + '/src/**/*.ts',
                config.paths.project.root + '/src/**/*.js'])
                .pipe(srcmap.init())
                .pipe(tsProject())
                .on('error', function() {
                    if (process.env.BUILDMACHINE) {
                        done('Extension Tests failed to build. See Above.');
                        process.exit(1);
                    }
                })
                .pipe(nls.rewriteLocalizeCalls())
                .pipe(nls.createAdditionalLanguageFiles(languages, 'i18n', 'out'))
                .pipe(srcmap.write('.', {
                   sourceRoot: function(file){ return file.cwd + '/src'; }
                }))
                .pipe(gulp.dest('out/'));
});

gulp.task('ext:compile-tests', (done) => {
    return gulp.src([
                config.paths.project.root + '/test/**/*.ts',
                config.paths.project.root + '/typings/**/*.ts'])
                .pipe(srcmap.init())
                .pipe(tsProject())
                .on('error', function() {
                    if (process.env.BUILDMACHINE) {
                        done('Extension Tests failed to build. See Above.');
                        process.exit(1);
                    }
                })
                .pipe(srcmap.write('.', {
                   sourceRoot: function(file){ return file.cwd + '/test'; }
                }))
                .pipe(gulp.dest('out/test/'));

});

gulp.task('ext:compile', gulp.series('ext:compile-src', 'ext:compile-tests'));

gulp.task('ext:copy-tests', () => {
    return gulp.src(config.paths.project.root + '/test/resources/**/*')
            .pipe(gulp.dest(config.paths.project.root + '/out/test/resources/'))
});

gulp.task('ext:copy-config', () => {
    var env = process.env.VsMsSqlEnv;
    env = env == undefined ? "dev" : env;
    return gulp.src(config.paths.project.root + '/src/config.json')
            .pipe(rename('config.json'))
            .pipe(gulp.dest(config.paths.project.root + '/out/'));
});

gulp.task('ext:copy-js', () => {
    return gulp.src([
            config.paths.project.root + '/src/**/*.js',
            '!' + config.paths.project.root + '/src/views/htmlcontent/**/*'])
        .pipe(gulp.dest(config.paths.project.root + '/out/'))
});

// The version of applicationinsights the extension needs is 0.15.19 but the version vscode-telemetry dependns on is 0.15.6
// so we need to manually overwrite the version in package.json inside vscode-extension-telemetry module.
gulp.task('ext:appinsights-version', () => {
    return gulp.src("./node_modules/vscode-extension-telemetry/package.json")
     .pipe(gulp.dest("./node_modules/vscode-extension-telemetry", {'overwrite':true}));
});

gulp.task('ext:copy-appinsights', () => {
    var filesToMove = [
        './node_modules/applicationinsights/**/*.*',
        './node_modules/applicationinsights/*.*'
    ];
    return gulp.src(filesToMove, { base: './' })
     .pipe(gulp.dest("./node_modules/vscode-extension-telemetry", {'overwrite':true}));
});

gulp.task('ext:copy', gulp.series('ext:copy-tests', 'ext:copy-js', 'ext:copy-config'));

gulp.task('ext:build', gulp.series('ext:compile', 'ext:copy'));

gulp.task('ext:test', (done) => {
    let workspace = process.env['WORKSPACE'];
    if (!workspace) {
        workspace = process.cwd();
    }
    process.env.JUNIT_REPORT_PATH = workspace + '/test-reports/ext_xunit.xml';
    cproc.exec(`code --extensionDevelopmentPath="${workspace}" --extensionTestsPath="${workspace}/out/test" --verbose`, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            process.exit(1);
        }
        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);
        done();
    });
});

gulp.task('test', gulp.series('ext:test'));

require('./tasks/covertasks');

gulp.task('clean', function (done) {
    return del('out', done);
});

gulp.task('build', gulp.series('clean', 'ext:build', 'localization:process-package-json', 'ext:appinsights-version'));

gulp.task('watch', function(){
    return gulp.watch(config.paths.project.root + '/src/**/*', gulp.series('build'))
});
