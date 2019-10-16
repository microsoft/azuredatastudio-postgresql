/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { DotNetInfo, requireDotNetSdk, runDotNetCommand } from './dotnet';

export default function registerCommands(dotNetSdkVersion: string): vscode.Disposable[] {
    return [
        vscode.commands.registerCommand('build.all.pgproj', async () => {
            requireDotNetSdk(dotNetSdkVersion).then(buildAllProjects);
        }),
        vscode.commands.registerCommand('build.current.pgproj', async (args) => {
            requireDotNetSdk(dotNetSdkVersion).then(
                dotnet => {
                    buildCurrentProject(args, dotnet);
            });
        }),
        vscode.commands.registerCommand('add.new.pgproj', async (args) => {
            requireDotNetSdk(dotNetSdkVersion).then(
                dotnet => {
                    addNewPostgreSQLProject(args, dotnet);
            });
        }),
    ];
}

function buildCurrentProject(args, dotNetSdk: DotNetInfo) {
    let project = '';
    if (args === null) {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor !== undefined)
        {
            project = activeEditor.document.uri.fsPath;
        }
    } else {
        project = args.fsPath;
    }

    dotnetBuild(dotNetSdk, project);
}

async function buildAllProjects(dotNetSdk: DotNetInfo): Promise<void> {
    try {
        let projects = await vscode.workspace.findFiles('{**/*.pgproj}');
        for (let project of projects) {
            dotnetBuild(dotNetSdk, project.fsPath);
        }
    } catch (err) {
        vscode.window.showInformationMessage(err);
    }
}

export function dotnetBuild(dotNetSdk: DotNetInfo, project: string): Promise<void> {
    return new Promise<void>((_resolve, _reject) => {
        let args = ['build', project];

        runDotNetCommand(dotNetSdk, args).then(result => {
            if (result.code === 0)
            {
                vscode.window.showInformationMessage(result.msg);
            } else {
                vscode.window.showErrorMessage('Error: ${errorMessage}', result.msg);
            }
        }, e => {
            vscode.window.showErrorMessage('Error: ${errorMessage}', e.message);
        });
    });
}

function addNewPostgreSQLProject(args, dotNetSdk: DotNetInfo) {
    let folder = args.fsPath;
    dotnetNew(dotNetSdk, folder);
}

export function dotnetNew(dotNetSdk: DotNetInfo, folder: string): Promise<void> {
    return new Promise<void>((_resolve, _reject) => {
        let args = ['new', 'pgproject', '-o', folder];

        runDotNetCommand(dotNetSdk, args).then(result => {
            if (result.code === 0)
            {
                vscode.window.showInformationMessage("The PostgreSQL Database project was created successfully");
            } else {
                vscode.window.showErrorMessage('Error: ${errorMessage}', result.msg);
            }
        }, e => {
            vscode.window.showErrorMessage('Error: ${errorMessage}', e.message);
        });
    });
}