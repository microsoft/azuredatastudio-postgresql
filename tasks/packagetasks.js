var gulp = require('gulp');
var fs = require('fs');
var fsPromise = require('fs').promises;
var gutil = require('gulp-util');
var cproc = require('child_process');
var os = require('os');
var del = require('del');
var path = require('path');
var serviceDownloader = require('@microsoft/ads-service-downloader');


function getServiceInstallConfig() {
    return require('../out/utils').getServiceInstallConfig();
}

function getResolvedServiceInstallationPath(runtime) {
    return require('../out/utils').getResolvedServiceInstallationPath(runtime);
}

async function installService(runtime) {
    const config = getServiceInstallConfig();
    const serverdownloader = new serviceDownloader.ServiceDownloadProvider(config);

    return serverdownloader.installService(runtime)
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
    return new Promise((resolve, reject) => {
        var vsceArgs = [];
        vsceArgs.push('vsce');
        vsceArgs.push('package'); // package command
        vsceArgs.push('--yarn'); // to use yarn list instead on npm list

        if (packageName !== undefined) {
            vsceArgs.push('-o');
            vsceArgs.push(packageName);
        }
        var command = vsceArgs.join(' ');
        console.log(command);

        cproc.exec(command, (error, stdout, stderr) => {
            if (error) {
                console.log(`Error: ${error.message}`);
                return reject(error);
            }
            if (stderr) {
                console.log(`stderr: ${stderr}`);
            }
            console.log(`stdout: ${stdout}`);
            resolve(stdout);
        });
    });
}


function cleanServiceInstallFolder() {
    return new Promise((resolve, reject) => {
       let root = path.join(__dirname, '../out/' + 'ossdbtoolsservice');
        console.log('Deleting Service Install folder: ' + root);
        fsPromise.rm(root, { recursive: true, force: true })  // using fs.rm with options
        .then(() => {
            resolve();
        }).catch((error) => {
            reject(error);
        });
    });
}

function doOfflinePackage(runtimeId, runtime, packageName) {
    return installService(runtime).then(() => {
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
    packages.push({rid: 'osx', runtime: 'OSX'});
    packages.push({rid: 'osx-arm64', runtime: 'OSX_ARM64'});
    packages.push({rid: 'linux-x64', runtime: 'Linux'});
    packages.push({rid: 'ubuntu22-x64', runtime: 'Ubuntu_22'});

    return packages.reduce((prevPromise, data) => {
        return prevPromise
            .then(() => cleanServiceInstallFolder())
            .then(() => doOfflinePackage(data.rid, data.runtime, packageName))
            .catch(error => {
                console.error(`Failed to process package ${data.rid}`, error);
                throw error; // propagate the error up
            });
    }, Promise.resolve());  // Start with a promise that always resolves
});

//Install vsce to be able to run this task: npm install -g vsce
gulp.task('package:offline-osx', () => {
    var json = JSON.parse(fs.readFileSync('package.json'));
    var name = json.name;
    var version = json.version;
    var packageName = name + '-' + version;

    var packages = [];
    packages.push({rid: 'osx', runtime: 'OSX'});

    return new Promise((resolve, reject) => {
        return cleanServiceInstallFolder().then(() => {
            packages.forEach(data => {
                return doOfflinePackage(data.rid, data.runtime, packageName).then(() => {
                    return resolve();
                }).catch((error) => {
                    reject(error)
                });
            });
        }).catch((error) => {
            reject(error)
        });
    });
});

//Install vsce to be able to run this task: npm install -g vsce
gulp.task('package:offline-osx-arm64', () => {
    var json = JSON.parse(fs.readFileSync('package.json'));
    var name = json.name;
    var version = json.version;
    var packageName = name + '-' + version;

    var packages = [];
    packages.push({rid: 'osx-arm64', runtime: 'OSX_ARM64'});

    return new Promise((resolve, reject) => {
        return cleanServiceInstallFolder().then(() => {
            packages.forEach(data => {
                return doOfflinePackage(data.rid, data.runtime, packageName).then(() => {
                    return resolve();
                }).catch((error) => {
                    reject(error)
                });
            });
        }).catch((error) => {
            reject(error)
        });
    });
});

//Install vsce to be able to run this task: npm install -g vsce
gulp.task('package:offline-windows', () => {
    var json = JSON.parse(fs.readFileSync('package.json'));
    var name = json.name;
    var version = json.version;
    var packageName = name + '-' + version;

    var packages = [];
    packages.push({rid: 'win-x64', runtime: 'Windows_64'});

    return new Promise((resolve, reject) => {
        return cleanServiceInstallFolder().then(() => {
            packages.forEach(data => {
                return doOfflinePackage(data.rid, data.runtime, packageName).then(() => {
                    return resolve();
                }).catch((error) => {
                    reject(error)
                });
            });
        }).catch((error) => {
            reject(error)
        });
    });
});

//Install vsce to be able to run this task: npm install -g vsce
gulp.task('package:offline-linux', () => {
    var json = JSON.parse(fs.readFileSync('package.json'));
    var name = json.name;
    var version = json.version;
    var packageName = name + '-' + version;

    var packages = [];
    packages.push({rid: 'linux-x64', runtime: 'Linux'});

    return new Promise((resolve, reject) => {
        return cleanServiceInstallFolder().then(() => {
            packages.forEach(data => {
                return doOfflinePackage(data.rid, data.runtime, packageName).then(() => {
                    return resolve();
                }).catch((error) => {
                    reject(error)
                });
            });
        }).catch((error) => {
            reject(error)
        });
    });
});

//Install vsce to be able to run this task: npm install -g vsce
gulp.task('package:offline-ubuntu', () => {
    var json = JSON.parse(fs.readFileSync('package.json'));
    var name = json.name;
    var version = json.version;
    var packageName = name + '-' + version;

    var packages = [];
    packages.push({rid: 'ubuntu22-x64', runtime: 'Ubuntu_22'});

    return new Promise((resolve, reject) => {
        return cleanServiceInstallFolder().then(() => {
            packages.forEach(data => {
                return doOfflinePackage(data.rid, data.runtime, packageName).then(() => {
                    return resolve();
                }).catch((error) => {
                    reject(error)
                });
            });
        }).catch((error) => {
            reject(error)
        });
    });
});
