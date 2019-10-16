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
                promptToInstallDotNetCoreSDK('The .NET Core SDK was not found on your PATH.');
                reject(ex);
            }
        } else {
            resolve(dotnetInfo);
        }

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

export function runDotNetCommand(dotNetSdk: DotNetInfo, args: string[]): Promise<DotNetCommandResult> {
    let dotnetResult: DotNetCommandResult;
    return new Promise<DotNetCommandResult>((resolve, reject) => {
        let cmd = 'dotnet';
        const chunks = [] as any;

        let dotnet = cp.spawn(cmd, args, { cwd: path.dirname(dotNetSdk.path), env: process.env });

        function handleData(stream: NodeJS.ReadableStream) {
            stream.on('data', function (chunk) {
                chunks.push(chunk);
            });
        }

        handleData(dotnet.stdout);
        handleData(dotnet.stderr);

        dotnet.on('close', (code) => {
            dotnetResult = {code: code, msg: chunks.toString()}
            resolve(dotnetResult);
        });

        dotnet.on('error', err => {
            reject(err);
        });
    });
}