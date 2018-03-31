var gulp = require('gulp');
var fs = require('fs');
var gutil = require('gulp-util');
var cproc = require('child_process');
var os = require('os');
var del = require('del');
var path = require('path');
var serviceDownloader = require('service-downloader');
var baseConfig = require('../out/config.json');

function getServiceInstallConfig() {
    let config = JSON.parse(JSON.stringify(baseConfig));
    config.installDirectory = path.join(__dirname, config.installDirectory);

    return config;
}

async function getOrDownloadServer() {
    const config = getServiceInstallConfig();
    const serverdownloader = new serviceDownloader.ServerProvider(config);

    return serverdownloader.getOrDownloadServer()
}


gulp.task('ext:install-service', () => {
    return getOrDownloadServer();
});

function doPackageSync(packageName) {
    var vsceArgs = [];
    vsceArgs.push('vsce');
    vsceArgs.push('package'); // package command

    if (packageName !== undefined) {
        vsceArgs.push('-o');
        vsceArgs.push(packageName);
    }
    var command = vsceArgs.join(' ');
    console.log(command);
    return cproc.execSync(command);
}

function cleanServiceInstallFolder() {
    return new Promise((resolve, reject) => {
       const config = getServiceInstallConfig();
        console.log('Deleting Service Install folder: ' + config.installDirectory);
        del(config.installDirectory + '/*').then(() => {
            resolve();
        }).catch((error) => {
            reject(error)
        });
    });
}

function doOfflinePackage(runtimeId, platform, packageName) {
    return getOrDownloadServer().then(() => {
       return doPackageSync(packageName + '-' + runtimeId + '.vsix');
    });
}

//Install vsce to be able to run this task: npm install -g vsce
gulp.task('package:online', () => {
    return cleanServiceInstallFolder().then(() => {
         doPackageSync();
         return getOrDownloadServer();
    });
});

//Install vsce to be able to run this task: npm install -g vsce
gulp.task('package:offline', () => {
    var json = JSON.parse(fs.readFileSync('package.json'));
    var name = json.name;
    var version = json.version;
    var packageName = name + '-' + version;

    var packages = [];
    packages.push({rid: 'win-x64', runtime: 'Windows_64'});
    packages.push({rid: 'win-x86', runtime: 'Windows_86'});
    packages.push({rid: 'osx', runtime: 'OSX'});
    packages.push({rid: 'linux-x64', runtime: 'Linux_64'});

    var promise = Promise.resolve();
    cleanServiceInstallFolder().then(() => {
            packages.forEach(data => {
              promise = promise.then(() => {
                 return doOfflinePackage(data.rid, data.runtime, packageName).then(() => {
                        return cleanServiceInstallFolder();
                 });
              });
           });
    });

    return promise;
});
