/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import AdsTelemetryReporter from '@microsoft/ads-extension-telemetry';

// this should precede local imports because they can trigger localization calls
const localize = nls.config({ messageFormat: nls.MessageFormat.file })();
import { ErrorAction, ErrorHandler, Message, CloseAction } from 'vscode-languageclient';
import * as Utils from './utils';
import * as Constants from './constants';

let packageInfo = Utils.getPackageInfo();

export const TelemetryReporter = new AdsTelemetryReporter<string, string>(packageInfo.name, packageInfo.version, packageInfo.aiKey);

/**
 * Handle Language Service client errors
 * @class LanguageClientErrorHandler
 */
export class LanguageClientErrorHandler implements ErrorHandler {

	/**
	 * Show an error message prompt with a link to known issues wiki page
	 * @memberOf LanguageClientErrorHandler
	 */
	showOnErrorPrompt(): void {
		TelemetryReporter.sendTelemetryEvent(Constants.serviceName + 'Crash');
		void vscode.window.showErrorMessage(
			localize('serviceCrashMessage', "{0}", Constants.serviceCrashMessage),
			Constants.serviceCrashButton).then(action => {
				if (action && action === Constants.serviceCrashButton) {
					void vscode.env.openExternal(vscode.Uri.parse(Constants.serviceCrashLink));
				}
			});
	}

	/**
	 * Callback for language service client error
	 *
	 * @param {Error} error
	 * @param {Message} message
	 * @param {number} count
	 * @returns {ErrorAction}
	 *
	 * @memberOf LanguageClientErrorHandler
	 */
	error(error: Error, message: Message, count: number): ErrorAction {
		this.showOnErrorPrompt();

		// we don't retry running the service since crashes leave the extension
		// in a bad, unrecovered state
		return ErrorAction.Shutdown;
	}

	/**
	 * Callback for language service client closed
	 *
	 * @returns {CloseAction}
	 *
	 * @memberOf LanguageClientErrorHandler
	 */
	closed(): CloseAction {
		this.showOnErrorPrompt();

		// we don't retry running the service since crashes leave the extension
		// in a bad, unrecovered state
		return CloseAction.DoNotRestart;
	}
}