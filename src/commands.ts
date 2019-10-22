/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as Utils from './utils';
import { DotNetInfo, requireDotNetSdk, runDotNetCommand, findProjectTemplate } from './dotnet';
import { CommandObserver } from './CommandObserver';

export default function registerCommands(commandObserver: CommandObserver, packageInfo: Utils.IPackageInfo): vscode.Disposable[] {
    let dotNetSdkVersion = packageInfo.requiredDotNetCoreSDK;
    return [
        vscode.commands.registerCommand('pgproj.build.all', async () => {
            requireDotNetSdk(dotNetSdkVersion).then(
                dotnet => {
                    buildAllProjects(dotnet, commandObserver);
            });
        }),
        vscode.commands.registerCommand('pgproj.build.current', async (args) => {
            requireDotNetSdk(dotNetSdkVersion).then(
                dotnet => {
                    buildCurrentProject(args, dotnet, commandObserver);
            });
        }),
        vscode.commands.registerCommand('pgproj.add.new', async (args) => {
            requireDotNetSdk(dotNetSdkVersion).then(
                dotnet => {
                    addNewPostgreSQLProject(args, dotnet, packageInfo.projectTemplateNugetId, commandObserver);
            });
        }),
    ];
}

function buildCurrentProject(args, dotNetSdk: DotNetInfo, commandObserver: CommandObserver) {
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
    dotnetBuild(dotNetSdk, project, commandObserver);
}

async function buildAllProjects(dotNetSdk: DotNetInfo, commandObserver: CommandObserver): Promise<void> {
    try {
        let projects = await vscode.workspace.findFiles('{**/*.pgproj}');
        commandObserver.clear();
        for (let project of projects) {
            dotnetBuild(dotNetSdk, project.fsPath, commandObserver);
        }
    } catch (err) {
        vscode.window.showInformationMessage(err);
    }
}

function dotnetBuild(dotNetSdk: DotNetInfo, project: string, commandObserver: CommandObserver): Promise<void> {
    return new Promise<void>((_resolve, _reject) => {
        let args = ['build', project];
        runDotNetCommand(dotNetSdk, args, commandObserver);
    });
}

function addNewPostgreSQLProject(args, dotNetSdk: DotNetInfo, projectTemplateNugedId: string, commandObserver: CommandObserver) {
    let folder = args.fsPath;
    commandObserver.clear();
    findProjectTemplate(dotNetSdk).then(exists => {
        if (exists) {
            dotnetNew(dotNetSdk, folder, commandObserver);
        }
        else {
            installPostgreSQLProjectTemplate(dotNetSdk, projectTemplateNugedId, commandObserver).then(() => {
                dotnetNew(dotNetSdk, folder, commandObserver);
            })
        }
    })
}

function installPostgreSQLProjectTemplate(dotNetSdk: DotNetInfo, templateNupkg: string, commandObserver: CommandObserver): Promise<void> {
	return new Promise<void>((_resolve, _reject) => {
        let args = ['new', '-i', templateNupkg];
        runDotNetCommand(dotNetSdk, args, commandObserver);
	});
}

function dotnetNew(dotNetSdk: DotNetInfo, folder: string, commandObserver: CommandObserver): Promise<void> {
    return new Promise<void>((_resolve, _reject) => {
        let args = ['new', 'pgproject', '-o', folder];
        runDotNetCommand(dotNetSdk, args, commandObserver);
    });
}