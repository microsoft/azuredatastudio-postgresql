/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as azdata from 'azdata';

export enum BuiltInCommands {
    SetContext = 'setContext',
}

export enum ContextKeys {
	ISCLOUD = 'pgsql:iscloud'
}

const isCloudEditions = [
	5,
	6
];

export function setCommandContext(key: ContextKeys | string, value: any) {
    return vscode.commands.executeCommand(BuiltInCommands.SetContext, key, value);
}

export default class ContextProvider {
	private _disposables = new Array<vscode.Disposable>();

	constructor() {
		this._disposables.push(azdata.workspace.onDidOpenDashboard(this.onDashboardOpen, this));
		this._disposables.push(azdata.workspace.onDidChangeToDashboard(this.onDashboardOpen, this));
	}

	public onDashboardOpen(e: azdata.DashboardDocument): void {
		let iscloud: boolean;
		if (e.profile.providerName.toLowerCase() === 'pgsql' && e.serverInfo.engineEditionId) {
			if (isCloudEditions.some(i => i === e.serverInfo.engineEditionId)) {
				iscloud = true;
			} else {
				iscloud = false;
			}
		}

		if (iscloud === true || iscloud === false) {
			setCommandContext(ContextKeys.ISCLOUD, iscloud);
		}
	}

	dispose(): void {
		this._disposables = this._disposables.map(i => i.dispose());
	}
}
