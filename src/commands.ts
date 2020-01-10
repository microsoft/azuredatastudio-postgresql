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
import * as projectHelper from './projectHelper';
import { buildStatus } from './commonHelper';
import { requireDotNetSdk } from './dotnet';
import { CommandObserver } from './commandObserver';
import * as nls from 'vscode-nls';
import { SqlOpsDataClient } from 'dataprotocol-client';

const localize = nls.loadMessageBundle();

export default function registerCommands(commandObserver: CommandObserver, packageInfo: Utils.IPackageInfo, client: SqlOpsDataClient): vscode.Disposable[] {
	let dotNetSdkVersion = packageInfo.requiredDotNetCoreSDK;
	return [
		vscode.commands.registerCommand('pgproj.build.all', async () => {
			requireDotNetSdk(dotNetSdkVersion).then(
				async () => {
					await vscode.window.withProgress({
						location: vscode.ProgressLocation.Notification,
						title: localize('extension.buildProgressTitle', 'Building projects'),
						cancellable: true
					}, async (progress, token) => {
						await buildAllProjects(commandObserver, token);
					});
				});
		}),
		vscode.commands.registerCommand('pgproj.build.current', async (args) => {
			requireDotNetSdk(dotNetSdkVersion).then(
				async () => {
					await vscode.window.withProgress({
						location: vscode.ProgressLocation.Notification,
						title: localize('extension.buildProgressTitle', 'Building projects'),
						cancellable: true
					}, async (progress, token) => {
						await buildCurrentProject(args, commandObserver, token);
					});
				});
		}),
		vscode.commands.registerCommand('pgproj.deploy.current', async (args) => {
			requireDotNetSdk(dotNetSdkVersion).then(
				async () => {
					await deployCurrentProject(args, commandObserver, client);
				});
		}),
		vscode.commands.registerCommand('pgproj.add.new', async (args) => {
			await addNewPostgreSQLProject(args, packageInfo.maxSupportedPostgreSQLProjectSDK);
		})
	];
}

async function buildAllProjects(commandObserver: CommandObserver, cancelToken: vscode.CancellationToken) {
	let projects = await vscode.workspace.findFiles('{**/*.pgproj}');
	await projectHelper.buildProjects(projects.map(p => p.fsPath), commandObserver, cancelToken);
}

async function buildCurrentProject(args, commandObserver: CommandObserver, cancelToken: vscode.CancellationToken) {
	let project = '';
	if (!args) {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor !== undefined) {
			project = activeEditor.document.uri.fsPath;
		}
	} else {
		project = args.fsPath;
	}

	await projectHelper.buildProjects([project], commandObserver, cancelToken);
}

async function deployCurrentProject(args, commandObserver: CommandObserver, client: SqlOpsDataClient) {
	let project = '';
	if (!args) {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor !== undefined) {
			project = activeEditor.document.uri.fsPath;
		}
	} else {
		project = args.fsPath;
	}

	try {
		await projectHelper.buildProjects([project], commandObserver).then(async result => {
			if (result && !result.some(b => b.status === buildStatus.Failure || b.status === buildStatus.Skipped)) {
				await projectHelper.setOutputFilePath(project, commandObserver);
				var filePath = commandObserver.outputFilePath;
				if (filePath && fs.existsSync(filePath)) {
					var connection = await azdata.connection.openConnectionDialog([Constants.providerId]);
					if (connection) {
						let projectFileText = fs.readFileSync(filePath, 'utf8');
						azdata.queryeditor.connect(filePath, connection.connectionId).then(() => {
							commandObserver.logToOutputChannel(localize('extension.deploymentStartedMessage', '\nDeployment started {0}.', new Date().toLocaleString()));
							client.sendRequest("query/executeDeploy", {owner_uri: filePath, query:projectFileText})
							.then(() => { }, err => {
								commandObserver.logToOutputChannel(localize('extension.FailedDeploy', 'Deployment failed with error: {0}', err.message));
							})
						});
					}
				} else {
					vscode.window.showErrorMessage(localize('extension.GetOutputPathFailed', 'Unable to find output file path to deploy.'));
				}
			} else {
				vscode.window.showErrorMessage(localize('extension.deployBeginFailed', 'Deploy cannot begin until your project builds successfully.'));
			}
		})
	} finally {
		commandObserver.outputFilePath = "";
	}
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
			if (fs.existsSync(projectHelper.getProjectPath(value, folder))) {
				return localize('extension.projectNameAlreadyExists', 'Project with same name already exists');
			}
			return null;
		}
	});

	if (!projectName) {
		return;
	}

	try {
		projectHelper.createProjectFile(projectHelper.getProjectPath(projectName, folder), projectSDK);
	}
	catch (err) {
		vscode.window.showErrorMessage(err);
	}
}