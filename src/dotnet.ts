/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as which from 'which';
import * as cp from 'child_process';
import * as semver from 'semver';
import * as path from 'path';
import * as Constants from './constants';
import { CommandObserver } from './CommandObserver';

export type DotNetInfo = {path: string, version: string};
export type DotNetCommandResult = {code: number, msg: string};

let dotnetInfo: DotNetInfo | undefined = undefined;

function promptToInstallDotNetCoreSDK(msg: string): void {
    let installItem = 'Install .NET Core SDK...';
    vscode.window
        .showErrorMessage(msg, installItem)
        .then(
            (item) => {
                if (item === installItem) {
                    vscode.env.openExternal(vscode.Uri.parse('https://dotnet.microsoft.com/download'));
                }
            }
        );
}

/**
 * Returns the path to the .NET Core SDK, or prompts the user to install
 * if the SDK is not found.
 */
export function findDotNetSdk(): Promise<DotNetInfo> {
    return new Promise((resolve, reject) => {
        if (dotnetInfo === undefined) {
            try {
                let path = which.sync('dotnet');
                cp.exec(
                    `"${path}" --version`,
                    (error, stdout, stderr) => {
                        if (error === null) {
                            dotnetInfo = {path: path, version: stdout.trim()};
                            resolve(dotnetInfo);
                        } else {
                            reject(error);
                        }
                    }
                );
            } catch (ex) {
                promptToInstallDotNetCoreSDK('The .NET Core SDK was not found.');
                reject(ex);
            }
        } else {
            resolve(dotnetInfo);
        }
    });
}

export function findProjectTemplate(dotNetSdk: DotNetInfo): Promise<boolean> {
    return new Promise((resolve, reject) => {
        let exists: boolean = true;
        let cmd = 'dotnet';
        let args = ['new', 'pgproject', '--dry-run'];
        let dotnet = cp.spawn(cmd, args, { cwd: path.dirname(dotNetSdk.path), env: process.env });

        function handleData(stream: NodeJS.ReadableStream) {
            stream.on('data', function (chunk) {
                if (chunk.toString().search(Constants.templateDoesNotExistMessage) !== -1) {
                    exists = false;
                }
            });
        }

        handleData(dotnet.stdout);
        handleData(dotnet.stderr);

        dotnet.on('close', () => {
            resolve(exists);
        });
    });
}

export function requireDotNetSdk(version?: string): Promise<DotNetInfo> {
    return new Promise((resolve, reject) => {
        findDotNetSdk()
            .then(
                dotnet => {
                    if (version !== undefined && semver.lt(dotnet.version, version)) {
                        let msg = `The PostgreSQL extension requires .NET Core SDK version ${version} or later, but ${dotnet.version} was found.`;
                        promptToInstallDotNetCoreSDK(msg);
                        reject(msg);
                    }
                    resolve(dotnet);
                }
            );
    });
}

export function runDotNetCommand(dotNetSdk: DotNetInfo, args: string[], commandObserver: CommandObserver): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        let cmd = 'dotnet';
        const chunks = [] as any;

        let dotnet = cp.spawn(cmd, args, { cwd: path.dirname(dotNetSdk.path), env: process.env });

        function handleData(stream: NodeJS.ReadableStream) {
            stream.on('data', function (chunk) {
                commandObserver.next(chunk.toString());
            });
        }

        handleData(dotnet.stdout);
        handleData(dotnet.stderr);

        dotnet.on('close', () => {
            resolve();
        });

        dotnet.on('error', err => {
            reject(err);
        });
    });
}