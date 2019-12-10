/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as Utils from './utils';
import * as Helper from './commonHelper';
import { DotNetInfo, requireDotNetSdk, runDotNetCommand, findProjectTemplate } from './dotnet';
import { CommandObserver } from './commandObserver';
import * as Constants from './constants';
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
		vscode.commands.registerCommand('pgproj.add.new', async (args) => {
			requireDotNetSdk(dotNetSdkVersion).then(
				async dotnet => {
					await addNewPostgreSQLProject(args, dotnet, packageInfo.projectTemplateNugetId, commandObserver);
				})
		}),
	];
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

	await buildProjects(dotNetSdk, [project], commandObserver, cancelToken).then(() => {
		commandObserver.buildInProgress = false;
	});
}

async function buildAllProjects(dotNetSdk: DotNetInfo, commandObserver: CommandObserver, cancelToken: vscode.CancellationToken): Promise<void> {
	let projects = await vscode.workspace.findFiles('{**/*.pgproj}');
	await buildProjects(dotNetSdk, projects.map(p => p.fsPath), commandObserver, cancelToken);
}

async function buildProjects(dotNetSdk: DotNetInfo, projects: string[], commandObserver: CommandObserver, cancelToken: vscode.CancellationToken) {
	if (commandObserver.buildInProgress) {
		vscode.window.showErrorMessage(localize('extension.existingBuildInProgressMessage', 'There is a build already running, please cancel the build before starting a new one'));
		return;
	}
	commandObserver.buildInProgress = true;
	try {
		commandObserver.resetOutputChannel();
		let unsupportedProjects = await validateProjectSDK(projects, commandObserver);
		if (unsupportedProjects.length > 0) {
			projects = projects.filter(p => unsupportedProjects.indexOf(p) < 0);
		}
		for (let project of projects) {
			if (cancelToken.isCancellationRequested) {
				return;
			}
			await dotnetBuild(dotNetSdk, project, commandObserver, cancelToken);
		}
	} catch (err) {
		vscode.window.showErrorMessage(err);
	}
	finally {
		commandObserver.buildInProgress = false;
	}
}

async function validateProjectSDK(projects: string[], commandObserver: CommandObserver): Promise<string[]> {
	var packageInfo = Utils.getPackageInfo();
	let unsupportedProjects = await Helper.checkProjectVersion(packageInfo.minSupportedPostgreSQLProjectSDK, packageInfo.maxSupportedPostgreSQLProjectSDK, projects, commandObserver);
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
	commandObserver.logToOutputChannel(localize('extension.buildEndMessage', 'Done building project {0}\n', project));
}

async function addNewPostgreSQLProject(args: vscode.Uri, dotNetSdk: DotNetInfo, projectTemplateNugedId: string, commandObserver: CommandObserver) {
	let folder = args.fsPath;
	var defaultProjectName = path.basename(folder);
	var projectName = await vscode.window.showInputBox({
		prompt: 'Project Name',
		value: defaultProjectName,
		validateInput: (value: string) => {
			if (!value || value.trim().length === 0) {
				return localize('extension.projectNameEmptyErrorMessage', 'Project names cannot be empty');
			}
			if (/[\/?:&*"<>|#%;\\]/g.test(value))
			{
				return localize('extension.projectNameSpecialCharsErrorMessage', 'Project names cannot contain any of the following characters: /?:&\\*"<>|#%;');
			}
			if (value === '.' || value === '..')
			{
				return localize('extension.projectNameInvalidErrorMessage', 'Project names cannot be \'.\' or \'..\'');
			}
			if (value.includes('..'))
			{
				return localize('extension.projectNameInvalidCharErrorMessage', 'Project names cannot contain \'..\'');
			}
			return null;
		}
	});

	if (!projectName) {
		return;
	}

	findProjectTemplate(dotNetSdk).then(exists => {
		if (exists) {
			dotnetNew(dotNetSdk, projectName, folder, commandObserver);
		}
		else {
			installPostgreSQLProjectTemplate(dotNetSdk, projectTemplateNugedId, commandObserver).then(() => {
				dotnetNew(dotNetSdk, projectName, folder, commandObserver);
			});
		}
	});
}

function installPostgreSQLProjectTemplate(dotNetSdk: DotNetInfo, templateNupkg: string, commandObserver: CommandObserver): Promise<void> {
	return new Promise<void>((_resolve, _reject) => {
		let args = ['new', '-i', templateNupkg];
		runDotNetCommand(dotNetSdk, args, commandObserver, null);
	});
}

function dotnetNew(dotNetSdk: DotNetInfo, projectName:string, folder: string, commandObserver: CommandObserver): Promise<void> {
	return new Promise<void>((_resolve, _reject) => {
		let args = ['new', 'pgproject', '-n', projectName, '-o', folder];
		runDotNetCommand(dotNetSdk, args, commandObserver, null);
	});
}