/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import vscode = require('vscode');
import MainController from './controllers/mainController';
import { Constants } from './models/constants';
import * as SharedConstants from './models/sharedConstants';

let controller: MainController = undefined;

export function activate(context: vscode.ExtensionContext): void {
	let constants: Constants = new Constants();
	let config = vscode.workspace.getConfiguration(constants.extensionConfigSectionName);
	let extensionEnabled = config[SharedConstants.configEnabled];
	if (extensionEnabled !== true) {
		return;
	}

	controller = new MainController(context);
	context.subscriptions.push(controller);
	controller.activate();
}

// this method is called when your extension is deactivated
export function deactivate(): void {
	if (controller) {
		controller.deactivate();
	}
}

/**
 * Exposed for testing purposes
 */
export function getController(): MainController {
	return controller;
}
