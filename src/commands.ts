/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as Utils from './utils';
import * as strings from './strings';
import { DotNetInfo, requireDotNetSdk, runDotNetCommand, findProjectTemplate } from './dotnet';
import { CommandObserver } from './CommandObserver';
import * as Constants from './constants';

export default function registerCommands(commandObserver: CommandObserver, packageInfo: Utils.IPackageInfo): vscode.Disposable[] {
    let dotNetSdkVersion = packageInfo.requiredDotNetCoreSDK;
    return [
        vscode.commands.registerCommand('pgproj.build.all', async () => {
            requireDotNetSdk(dotNetSdkVersion).then(
                async dotnet => {
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: Constants.buildProgressTitle,
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
                        title: Constants.buildProgressTitle,
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

    commandObserver.clear();

    let isValid = await validateProjectSDK([project], commandObserver);
    if (!isValid) {
        return;
    }
    await dotnetBuild(dotNetSdk, project, commandObserver, cancelToken);
}

async function buildAllProjects(dotNetSdk: DotNetInfo, commandObserver: CommandObserver, cancelToken: vscode.CancellationToken): Promise<void> {
    try {
        let projects = await vscode.workspace.findFiles('{**/*.pgproj}');
        commandObserver.clear();

        let isValid = await validateProjectSDK(projects.map(p => p.fsPath), commandObserver);
        if (!isValid) {
            return;
        }

        for (let project of projects) {
            if (cancelToken.isCancellationRequested) {
                return;
            }
            await dotnetBuild(dotNetSdk, project.fsPath, commandObserver, cancelToken);
        }
    } catch (err) {
        vscode.window.showErrorMessage(err);
    }
}

async function validateProjectSDK(projects: string[], commandObserver: CommandObserver): Promise<boolean> {
    var packageInfo = Utils.getPackageInfo();
    let unsupportedProjects = await Utils.checkProjectVersion(packageInfo.minSupportedPostgreSQLProjectSDK, packageInfo.maxSupportedPostgreSQLProjectSDK, projects, commandObserver);
    if (unsupportedProjects && unsupportedProjects.length > 0) {
        unsupportedProjects.map(p => commandObserver.logToOutputChannel(strings.format(Constants.buildFailedUnsupportedSdkMessage, p)));
        return Promise.resolve(false);
    }
    return Promise.resolve(true);
}

async function dotnetBuild(dotNetSdk: DotNetInfo, project: string, commandObserver: CommandObserver, cancelToken: vscode.CancellationToken): Promise<void> {
    let args = ['build', project];
    commandObserver.logToOutputChannel(strings.format(Constants.buildStartedMessage, project));
    await runDotNetCommand(dotNetSdk, args, commandObserver, cancelToken);
    commandObserver.logToOutputChannel(strings.format(Constants.buildCompletedMessage, project));
}

async function addNewPostgreSQLProject(args: vscode.Uri, dotNetSdk: DotNetInfo, projectTemplateNugedId: string, commandObserver: CommandObserver) {
    let folder = args.fsPath;
    var defaultProjectName = path.basename(folder);

    var projectName = await vscode.window.showInputBox(
        {
            prompt: 'Project Name',
            value: defaultProjectName,
            validateInput: (value: string) => {
                if (!value || value.trim().length === 0) {
                    return Constants.projectNameEmptyErrorMessage;
                }
                if (/[\/?:&*"<>|#%;\\]/g.test(value))
                {
                    return Constants.projectNameSpecialCharsErrorMessage;
                }
                if (value === '.' || value === '..')
                {
                    return Constants.projectNameInvalidErrorMessage;
                }
                if (value.includes('..'))
                {
                    return Constants.projectNameInvalidCharErrorMessage;
                }

                return null;
            }
        });

    if (projectName === undefined) {
        return;
    }

    findProjectTemplate(dotNetSdk).then(exists => {
        commandObserver.clear();
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