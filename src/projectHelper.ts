/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as Utils from './utils';
import { buildStatus, BuildResult, checkProjectVersion } from './commonHelper';
import { runDotNetCommand } from './dotnet';
import { CommandObserver } from './commandObserver';
import * as nls from 'vscode-nls';
import { ChildProcess } from 'child_process';

const localize = nls.loadMessageBundle();

export async function buildProjects(projects: string[], commandObserver: CommandObserver, cancelToken?: vscode.CancellationToken): Promise<BuildResult[]> {
	var buildResult = new Array<BuildResult>();
	if (commandObserver.buildInProgress) {
		vscode.window.showErrorMessage(localize('extension.existingBuildInProgressMessage', 'There is a build already running, please cancel the build before starting a new one'));
		return Promise.resolve(buildResult);
	}

	try {
		var successProjectCount = 0;
		var failedProjectCount = 0;
		commandObserver.buildInProgress = true;
		commandObserver.resetOutputChannel();
		vscode.workspace.saveAll();
		let unsupportedProjects = await validateProjectSDK(projects, commandObserver);
		if (unsupportedProjects.length > 0) {
			projects = projects.filter(p => unsupportedProjects.indexOf(p) < 0);
			unsupportedProjects.map(p => buildResult.push({ project: p, status: buildStatus.Skipped }));
		}

		for (let project of projects) {
			if (cancelToken && cancelToken.isCancellationRequested) {
				return;
			}
			await dotnetBuild(project, commandObserver, cancelToken).then(() => {
				successProjectCount++;
				buildResult.push({ project: project, status: buildStatus.Success })
			}, () => {
				failedProjectCount++;
				buildResult.push({ project: project, status: buildStatus.Failure })
			});
		}
		commandObserver.logToOutputChannel(localize('extension.buildSummaryMessage', '======== Build: {0} succeeses or up-to-date, {1} failed, {2} skipped ========', successProjectCount, failedProjectCount, unsupportedProjects.length));
	} catch (err) {
		vscode.window.showErrorMessage(err);
	}
	finally {
		commandObserver.buildInProgress = false;
	}
	return Promise.resolve(buildResult);
}

async function validateProjectSDK(projects: string[], commandObserver: CommandObserver): Promise<string[]> {
	var packageInfo = Utils.getPackageInfo();
	let unsupportedProjects = await checkProjectVersion(packageInfo.minSupportedPostgreSQLProjectSDK, packageInfo.maxSupportedPostgreSQLProjectSDK, projects, commandObserver);
	if (unsupportedProjects && unsupportedProjects.length > 0) {
		unsupportedProjects.map(p =>
			commandObserver.logToOutputChannel(localize(
				'extension.projectUpdateFailedMessage',
				'Failed to build project {0} with SDK Version {1}.\nInstalled PostgreSQL extension only supports SDK version between {2} and {3}.\n',
				p.path,
				p.sdkVersion,
				packageInfo.minSupportedPostgreSQLProjectSDK,
				packageInfo.maxSupportedPostgreSQLProjectSDK)));
	}
	return Promise.resolve(unsupportedProjects.map(p => p.path));
}

async function dotnetBuild(project: string, commandObserver: CommandObserver, cancelToken: vscode.CancellationToken): Promise<void> {
	let args = ['build', project, '-v', 'n'];
	await runDotNetCommand(args, commandObserver, handleBuildCommandData, cancelToken, handleBuildCommandCancel);
}

export function getProjectPath(projectName: string, folder: string) {
	return folder + path.sep + projectName + '.pgproj';
}

export function createProjectFile(projectPath: string, projectSDK: string) {
	let templatefileName = 'project.tmpl';
	vscode.workspace.openTextDocument(vscode.extensions.getExtension('Microsoft.azuredatastudio-postgresql').extensionPath + '/templates/' + templatefileName)
        .then((doc: vscode.TextDocument) => {
            let text = doc.getText();
            text = text.replace('${projectSDK}', projectSDK);
            fs.writeFileSync(projectPath, text);
			vscode.workspace.openTextDocument(projectPath).then((doc) => {
				vscode.window.showTextDocument(doc);
			});
		});
}

export async function setOutputFilePath(project: string, commandObserver: CommandObserver): Promise<void> {
	let args = ['build', project, '-t:GetOutputFilePath'];
	await runDotNetCommand(args, commandObserver, handleGetOutputFileCommandData);
}

const outputFilePathRegex = /###(?<path>(.*))###/;

function handleGetOutputFileCommandData(stream: NodeJS.ReadableStream, commandObserver: CommandObserver) {
	stream.on('data', function (chunk) {
		const match = outputFilePathRegex.exec(chunk.toString());
		if (match) {
			commandObserver.outputFilePath = match['groups'].path;
		}
	});
}

function handleBuildCommandData(stream: NodeJS.ReadableStream, commandObserver: CommandObserver) {
	stream.on('data', function (chunk) {
		commandObserver.next(chunk.toString());
	});
}

function handleBuildCommandCancel(buildProcess: ChildProcess, commandObserver: CommandObserver, cancelToken: vscode.CancellationToken) {
	if (cancelToken) {
		cancelToken.onCancellationRequested(() => {
			buildProcess.kill();
			commandObserver.logToOutputChannel(localize('extension.buildCancelMessage', 'Build has been cancelled'));
		});
	}
}