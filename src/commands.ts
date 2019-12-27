/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as azdata from 'azdata';
import * as fs from 'fs';
import * as path from 'path';
import * as Utils from './utils';
import * as Constants from './constants';
import { buildStatus, BuildResult, checkProjectVersion } from './commonHelper';
import { DotNetInfo, requireDotNetSdk, runDotNetCommand } from './dotnet';
import { CommandObserver } from './commandObserver';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export default function registerCommands(commandObserver: CommandObserver, packageInfo: Utils.IPackageInfo): vscode.Disposable[] {
	let dotNetSdkVersion = packageInfo.requiredDotNetCoreSDK;
	return [
		vscode.commands.registerCommand('pgproj.build.all', async () => {
			requireDotNetSdk(dotNetSdkVersion).then(
				async dotnet => {
					await vscode.window.withProgress({
						location: vscode.ProgressLocation.Notification,
						title: localize('extension.buildProgressTitle', 'Building projects'),
						cancellable: true
					}, async (progress, token) => {
						await buildAllProjects(dotnet, commandObserver, token);
					});
				});
		}),
		vscode.commands.registerCommand('pgproj.build.current', async (args) => {
			requireDotNetSdk(dotNetSdkVersion).then(
				async dotnet => {
					await vscode.window.withProgress({
						location: vscode.ProgressLocation.Notification,
						title: localize('extension.buildProgressTitle', 'Building projects'),
						cancellable: true
					}, async (progress, token) => {
						await buildCurrentProject(args, dotnet, commandObserver, token);
					});
				});
		}),
		vscode.commands.registerCommand('pgproj.deploy.current', async (args) => {
			requireDotNetSdk(dotNetSdkVersion).then(
				async dotnet => {
					await deployCurrentProject(args, dotnet, commandObserver);
				});
		}),
		vscode.commands.registerCommand('pgproj.add.new', async (args) => {
			await addNewPostgreSQLProject(args, packageInfo.maxSupportedPostgreSQLProjectSDK);
		})
	];
}

async function deployCurrentProject(args, dotNetSdk: DotNetInfo, commandObserver:  CommandObserver, cancelToken?: vscode.CancellationToken) {
	let project = '';
	if (!args) {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor !== undefined) {
			project = activeEditor.document.uri.fsPath;
		}
	} else {
		project = args.fsPath;
	}

	await buildProjects(dotNetSdk, [project], commandObserver, cancelToken).then(async result => {
		if (result && !result.some(b => b.status === buildStatus.Failure || b.status === buildStatus.Skipped)) {
			var projectName = path.basename(project, '.pgproj');
			var buildFiles = await vscode.workspace.findFiles('{**/'+ projectName +'.sql}');
			if (buildFiles && buildFiles.length > 0) {
				var connection = await azdata.connection.openConnectionDialog([Constants.providerId]);
				if (connection) {
					var fileName = buildFiles[0];
					vscode.workspace.openTextDocument(fileName).then(doc => {
						vscode.window.showTextDocument(doc, vscode.ViewColumn.Active, false).then(() => {
							let filePath = doc.uri.toString();
							azdata.queryeditor.connect(filePath, connection.connectionId).then(() => azdata.queryeditor.runQuery(filePath, undefined, false));
						});
					});
				}
			}
		} else {
			vscode.window.showErrorMessage(localize('extension.deployBeginFailed', 'Deploy cannot begin until your project builds successfully.'));
		}
	})
}

async function buildCurrentProject(args, dotNetSdk: DotNetInfo, commandObserver: CommandObserver, cancelToken: vscode.CancellationToken) {
	let project = '';
	if (!args) {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor !== undefined) {
			project = activeEditor.document.uri.fsPath;
		}
	} else {
		project = args.fsPath;
	}

	await buildProjects(dotNetSdk, [project], commandObserver, cancelToken);
}

async function buildAllProjects(dotNetSdk: DotNetInfo, commandObserver: CommandObserver, cancelToken: vscode.CancellationToken) {
	let projects = await vscode.workspace.findFiles('{**/*.pgproj}');
	await buildProjects(dotNetSdk, projects.map(p => p.fsPath), commandObserver, cancelToken);
}

async function buildProjects(dotNetSdk: DotNetInfo, projects: string[], commandObserver: CommandObserver, cancelToken: vscode.CancellationToken): Promise<BuildResult[]> {
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
			await dotnetBuild(dotNetSdk, project, commandObserver, cancelToken).then(() => {
				successProjectCount++;
				commandObserver.logToOutputChannel(localize('extension.buildEndMessage', 'Done building project {0}\n', project));
				buildResult.push({ project: project, status: buildStatus.Success })
			}, () => {
				failedProjectCount++;
				commandObserver.logToOutputChannel(localize('extension.buildFailMessage', 'Done building project {0} -- FAILED\n', project));
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

async function dotnetBuild(dotNetSdk: DotNetInfo, project: string, commandObserver: CommandObserver, cancelToken: vscode.CancellationToken): Promise<void> {
	let args = ['build', project];
	commandObserver.logToOutputChannel(localize('extension.buildStartMessage', 'Build started: Project: {0}', project));
	await runDotNetCommand(dotNetSdk, args, commandObserver, cancelToken);
}

async function addNewPostgreSQLProject(args: vscode.Uri, projectSDK: string) {
	let folder = args.fsPath;
	var defaultProjectName = path.basename(folder);
	var projectName = await vscode.window.showInputBox({
		prompt: localize('extension.projectNamePrompt', 'Project Name'),
		value: defaultProjectName,
		validateInput: (value: string) => {
			if (!value || value.trim().length === 0) {
				return localize('extension.projectNameEmptyErrorMessage', 'Project names cannot be empty');
			}
			if (/[\/?:&*"<>|#%;\\]/g.test(value)) {
				return localize('extension.projectNameSpecialCharsErrorMessage', 'Project names cannot contain any of the following characters: /?:&\\*"<>|#%;');
			}
			if (value === '.' || value === '..') {
				return localize('extension.projectNameInvalidErrorMessage', 'Project names cannot be \'.\' or \'..\'');
			}
			if (value.includes('..')) {
				return localize('extension.projectNameInvalidCharErrorMessage', 'Project names cannot contain \'..\'');
			}
			if (fs.existsSync(getProjectPath(value, folder))) {
				return localize('extension.projectNameAlreadyExists', 'Project with same name already exists');
			}
			return null;
		}
	});

	if (!projectName) {
		return;
	}

	try {
		createProjectFile(getProjectPath(projectName, folder), projectSDK);
	}
	catch (err) {
		vscode.window.showErrorMessage(err);
	}
}

function getProjectPath(projectName: string, folder: string) {
	return folder + path.sep + projectName + '.pgproj';
}

function createProjectFile(projectPath: string, projectSDK: string) {
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