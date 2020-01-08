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
import { NotificationType } from 'vscode-languageclient';

const localize = nls.loadMessageBundle();

export default function registerCommands(commandObserver: CommandObserver, packageInfo: Utils.IPackageInfo): vscode.Disposable[] {
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
					await deployCurrentProject(args, commandObserver);
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

async function deployCurrentProject(args, commandObserver: CommandObserver) {
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
							commandObserver._client.sendRequest("query/executeDeployString", {owner_uri: filePath, query:projectFileText})
							.then(() => { }, err => {
								commandObserver.logToOutputChannel(localize('extension.FailedDeploy', 'Deployment failed with error: {0}', err.message));
							})
						});

						const queryCompleteType: NotificationType<string, any> = new NotificationType('query/deployComplete');
						commandObserver._client.onNotification(queryCompleteType, (data: any) => {
							if (!data.batchSummaries.some(s => s.hasError)) {
								commandObserver.logToOutputChannel(localize('extension.DeployCompleted', 'Deployment completed successfully.'));
							}
						});

						const queryMessageType: NotificationType<string, any> = new NotificationType('query/deployMessage');
						commandObserver._client.onNotification(queryMessageType, (data: any) => {
							var messageText = data.message.isError ? localize('extension.deployErrorMessage', "Error: {0}", data.message.message) : localize('extension.deployMessage', "{0}", data.message.message);
							commandObserver.logToOutputChannel(messageText);
						});

						const queryBatchStartType: NotificationType<string, any> = new NotificationType('query/deployBatchStart');
						commandObserver._client.onNotification(queryBatchStartType, (data: any) => {
							if (data.batchSummary.selection) {
								commandObserver.logToOutputChannel(localize('extension.runQueryBatchStartMessage', "\nStarted executing query at {0}", data.batchSummary.selection.startLine + 1));
							}
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
		// var provider = azdata.dataprotocol.getProvider<azdata.QueryProvider>("PGSQL", azdata.DataProviderType.QueryProvider);
		// commandObserver._client.
		// provider.setQueryExecutionOptions()
		// azdata.DataProviderType.QueryProvider.
		// commandObserver._client.clientOptions.
	}
}


function handleFailureRunQueryResult(error: any) {
	if (error instanceof Error) {
		error = error.message;
	}
	let message = localize('query.ExecutionFailedError', "Execution failed due to an unexpected error: {0}\t{1}", error);
	this.handleMessage(<azdata.QueryExecuteMessageParams>{
		ownerUri: this.uri,
		message: {
			isError: true,
			message: message
		}
	});
	this.handleQueryComplete(<azdata.QueryExecuteCompleteNotificationResult>{ ownerUri: this.uri });
}

function handleQueryComplete(result: azdata.QueryExecuteCompleteNotificationResult): void {
	// this also isn't exact but its the best we can do
	this._queryEndTime = new Date();

	// Store the batch sets we got back as a source of "truth"
	this._isExecuting = false;
	this._hasCompleted = true;
	this._batchSets = result.batchSummaries ? result.batchSummaries : [];

	this._batchSets.map(batch => {
		if (batch.selection) {
			batch.selection.startLine += this._resultLineOffset;
			batch.selection.startColumn += this._resultColumnOffset;
			batch.selection.endLine += this._resultLineOffset;
			batch.selection.endColumn += this._resultColumnOffset;
		}
	});


	let message = {
		message: localize('query.message.executionTime', "Total execution time: {0}"),
		isError: false,
		time: undefined
	};
	this._messages.push(message);
	this._onMessage.fire(message);
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