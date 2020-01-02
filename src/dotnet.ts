/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as which from 'which';
import * as cp from 'child_process';
import * as semver from 'semver';
import * as nls from 'vscode-nls';
import { CommandObserver } from './commandObserver';

const outputFilePathRegex = /###(?<path>(.*))###/;
const localize = nls.loadMessageBundle();
export type DotNetInfo = {path: string, version: string};
export type DotNetCommandResult = {code: number, msg: string};

let dotnetInfo: DotNetInfo | undefined = undefined;

function promptToInstallDotNetCoreSDK(msg: string): void {
	let installItem = localize('extension.installDotNetCoreButtonText', 'Install .NET Core SDK...');
	vscode.window.showErrorMessage(msg, installItem)
	.then((item) => {
		if (item === installItem) {
			vscode.env.openExternal(vscode.Uri.parse('https://go.microsoft.com/fwlink/?linkid=2112623'));
		}
	});
}

/**
 * Returns the path to the .NET Core SDK, or prompts the user to install
 * if the SDK is not found.
 */
export function findDotNetSdk(): Promise<DotNetInfo> {
	return new Promise((resolve, reject) => {
		if (dotnetInfo === undefined) {
			try {
				let dotnetPath = which.sync('dotnet');
				cp.exec(
					'dotnet --version',
					(error, stdout, stderr) => {
						if (error) {
							reject(error);
						} else if (stderr && stderr.length > 0) {
							reject(new Error(stderr));
						} else {
							dotnetInfo = {path: dotnetPath, version: stdout.trim()};
							resolve(dotnetInfo);
						}
					}
				);
			} catch (ex) {
				promptToInstallDotNetCoreSDK(localize('extension.dotNetCoreNotFoundMessage', 'The .NET Core SDK was not found.'));
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
						let msg = localize('extension.dotNetCoreMessage', 'The PostgreSQL extension requires .NET Core SDK version {0} or later, but {1} was found.', version, dotnet.version);
						promptToInstallDotNetCoreSDK(msg);
						reject(msg);
					}
					resolve(dotnet);
				}
			);
	});
}

export async function runDotNetBuildCommand(args: string[], commandObserver: CommandObserver, cancelToken?: vscode.CancellationToken): Promise<void> {
	return await new Promise<void>((resolve, reject) => {
		let cmd = 'dotnet';
		let dotnet = cp.spawn(cmd, args, { env: process.env });

		if (cancelToken) {
			cancelToken.onCancellationRequested(() => {
				dotnet.kill();
				commandObserver.logToOutputChannel(localize('extension.buildCancelMessage', 'Build has been cancelled'));
			});
		}

		function handleData(stream: NodeJS.ReadableStream) {
			stream.on('data', function (chunk) {
				commandObserver.next(chunk.toString());
			});
		}

		handleData(dotnet.stdout);
		handleData(dotnet.stderr);

		dotnet.on('close', (code) => {
			if (code === 1) {
				reject();
			}
			resolve();
		});

		dotnet.on('error', err => {
			reject(err);
		});
	});
}

export async function runDotNetGetOutputFilePath(args: string[]): Promise<string> {
	return await new Promise<string>((resolve, reject) => {
		let cmd = 'dotnet';
		let dotnet = cp.spawn(cmd, args, { env: process.env });
		let filePath: string;

		function handleData(stream: NodeJS.ReadableStream) {
			stream.on('data', function (chunk) {
				const match = outputFilePathRegex.exec(chunk.toString());
				if (match) {
					filePath = match['groups'].path;
				}
			});
		}

		handleData(dotnet.stdout);
		handleData(dotnet.stderr);

		dotnet.on('close', (code) => {
			if (code === 1) {
				reject(filePath);
			}
			resolve(filePath);
		});

		dotnet.on('error', err => {
			reject(err);
		});
	});
}